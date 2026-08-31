/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.douyu.com';
  const MOBILE = 'https://m.douyu.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  let sourceKey = '';
  let sourceHeaders = {};
  let categoryData = null;

  const text = value => value === undefined || value === null ? '' : String(value);
  const imageUrl = value => {
    const result = text(value).trim();
    return result.startsWith('//') ? 'https:' + result : result;
  };
  const headers = referer => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: referer || BASE + '/',
    Origin: BASE,
    Accept: 'application/json,text/plain,*/*',
  }, sourceHeaders);
  const form = values => Object.keys(values)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key])))
    .join('&');
  const requestJson = async (url, options) => {
    const response = await dxplay.fetch(Object.assign({url, headers: headers()}, options || {}));
    if (response.status < 200 || response.status >= 300) throw new Error('douyu-live.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('douyu-live.response-invalid'); }
  };
  const loadCategories = async () => {
    if (categoryData) return categoryData;
    const result = await requestJson(MOBILE + '/api/cate/list', {headers: headers(MOBILE + '/')});
    if (Number(result.code) !== 0 || !result.data) throw new Error('douyu-live.categories-unavailable');
    categoryData = result.data;
    return categoryData;
  };
  const online = value => text(value.hot || value.ol || value.online || '');
  const roomItem = value => ({
    id: text(value.rid || value.roomId || value.room_id),
    sourceKey,
    name: text(value.rn || value.roomName || value.room_name || value.nickname || value.nickName),
    ...(imageUrl(value.rs16 || value.roomSrc || value.room_src || value.room_pic) ? {
      poster: imageUrl(value.rs16 || value.roomSrc || value.room_src || value.room_pic),
    } : {}),
    remark: [text(value.nn || value.nickName || value.nickname), text(value.c2name || value.cateName), online(value)]
      .filter(Boolean).join(' · '),
  });
  const rooms = async (categoryId, page) => {
    const result = await requestJson(BASE + '/gapi/rkc/directory/mixList/2_'
      + encodeURIComponent(categoryId) + '/' + page);
    const values = result.data && Array.isArray(result.data.rl) ? result.data.rl : [];
    return values.map(roomItem).filter(value => value.id);
  };
  const featured = async () => {
    const result = await requestJson(BASE + '/japi/weblist/apinc/allpage/6/1');
    const values = result.data && Array.isArray(result.data.rl) ? result.data.rl : [];
    return values.map(roomItem).filter(value => value.id);
  };
  const randomHex = length => {
    let result = '';
    while (result.length < length) result += Math.floor(Math.random() * 16).toString(16);
    return result;
  };
  const signedStream = async roomId => {
    const did = randomHex(32);
    const referer = BASE + '/' + roomId;
    const security = await requestJson(BASE + '/wgapi/livenc/liveweb/websec/getEncryption?did=' + did, {
      headers: headers(referer),
    });
    if (Number(security.error) !== 0 || !security.data) throw new Error('douyu-live.security-unavailable');
    const data = security.data;
    let current = text(data.rand_str);
    const key = text(data.key);
    for (let index = 0; index < Math.max(1, Number(data.enc_time) || 1); index += 1) {
      current = dxplay.crypto.md5(current + key);
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const values = {
      enc_data: text(data.enc_data), tt: timestamp, did,
      auth: dxplay.crypto.md5(current + key + roomId + timestamp),
      cdn: '', rate: '', hevc: '0', fa: '0', ive: '0', iar: '1',
    };
    const result = await requestJson(BASE + '/lapi/live/getH5PlayV1/' + encodeURIComponent(roomId), {
      method: 'POST',
      headers: Object.assign(headers(referer), {
        Cookie: 'dy_did=' + did + '; mantine-color-scheme-value=light',
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: form(values),
    });
    if (Number(result.error) !== 0 || !result.data) throw new Error('douyu-live.stream-unavailable');
    const stream = result.data;
    if (stream.rtmp_url && stream.rtmp_live) return text(stream.rtmp_url) + '/' + text(stream.rtmp_live);
    if (stream.hls_url) return text(stream.hls_url);
    throw new Error('douyu-live.stream-unavailable');
  };

  dxplay.register({
    id: 'org.dxsrc.xiaosa.douyu-live',
    name: 'Douyu live',
    description: 'Readable rewrite of the current public Douyu room catalog, security signature and live stream flow.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'douyu-live';
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      categoryData = null;
      return {ready: true};
    },
    async home() {
      const data = await loadCategories();
      const byParent = Object.create(null);
      for (const value of Array.isArray(data.cate2Info) ? data.cate2Info : []) {
        const key = text(value.cate1Id);
        if (!byParent[key]) byParent[key] = [];
        byParent[key].push(value);
      }
      const categories = (Array.isArray(data.cate1Info) ? data.cate1Info : []).map(value => {
        const children = byParent[text(value.cate1Id)] || [];
        return {
          id: text(value.cate1Id),
          name: text(value.cate1Name),
          ...(children.length ? {filters: [{
            key: 'cate2', name: '频道', initialValue: text(children[0].cate2Id),
            options: children.map(child => ({name: text(child.cate2Name), value: text(child.cate2Id)})),
          }]} : {}),
        };
      }).filter(value => value.id && value.name);
      return {categories, featured: await featured()};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const data = await loadCategories();
      const fallback = (Array.isArray(data.cate2Info) ? data.cate2Info : [])
        .find(value => text(value.cate1Id) === text(input.categoryId));
      const categoryId = text(input.filters && input.filters.cate2) || text(fallback && fallback.cate2Id);
      if (!categoryId) return {page, pageCount: page, items: []};
      const items = await rooms(categoryId, page);
      return {page, pageCount: items.length < 20 ? page : page + 1, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const result = await requestJson(BASE + '/japi/search/api/searchShow?kw=' + encodeURIComponent(keyword)
        + '&page=' + page + '&pageSize=20');
      const data = result.data || {};
      const values = Array.isArray(data.relateShow) ? data.relateShow : [];
      return {
        page,
        pageCount: Math.max(page, Math.ceil((Number(data.total) || values.length) / 20)),
        items: values.filter(value => Number(value.isLive) === 1).map(roomItem).filter(value => value.id),
      };
    },
    async detail(input) {
      const roomId = text(input.id).replace(/\D/g, '');
      if (!roomId) throw new Error('douyu-live.room-id-invalid');
      const result = await requestJson(BASE + '/betard/' + roomId, {headers: headers(BASE + '/' + roomId)});
      const data = result.room;
      if (!data) throw new Error('douyu-live.room-unavailable');
      return {
        id: roomId,
        sourceKey,
        name: text(data.room_name || roomId),
        ...(imageUrl(data.room_pic || data.room_src) ? {poster: imageUrl(data.room_pic || data.room_src)} : {}),
        ...(text(data.nickname) ? {actors: text(data.nickname)} : {}),
        ...(text(data.second_lvl_name) ? {remark: text(data.second_lvl_name)} : {}),
        description: text(data.show_details || data.room_name),
        playGroups: [{id: 'live', name: '直播', episodes: [{id: 'live', name: '直播', playId: roomId}]}],
      };
    },
    async play(input) {
      const roomId = text(input.playId).replace(/\D/g, '');
      if (!roomId) throw new Error('douyu-live.play-id-invalid');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl: await signedStream(roomId),
        headers: {'User-Agent': 'libmpv', Referer: BASE + '/' + roomId},
        parse: false,
      };
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; categoryData = null; },
  });
})();
