/* global dxplay */
(() => {
  'use strict';

  const DOMAIN_URL = 'https://neptune.qmplaylet.com/playlet-domain-android.json';
  const DEFAULT_STORE = 'https://api-store.qmplaylet.com';
  const DEFAULT_READ = 'https://api-read.qmplaylet.com';
  const SIGN_SALT = 'd3dGiJc651gSQ8w1';
  const DIGIT_MAP = 'MUlErYWbdJ';
  const UPPER_MAP = '9saI0oy_HGitgNA8Fk3hfRqC4p';
  const LOWER_MAP = 'mBOuc6Kx5T-2zSZ1VvjQ7DwnLe';
  let sourceKey = '';
  let sourceHeaders = {};
  let storeUrl = DEFAULT_STORE;
  let readUrl = DEFAULT_READ;
  let protocolHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const randomHex = length => {
    let result = '';
    while (result.length < length) result += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
    return result.slice(0, length);
  };
  const uuid = () => {
    const value = randomHex(32);
    return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16)
      + '-' + value.slice(16, 20) + '-' + value.slice(20);
  };
  const customBase64 = value => {
    const base64 = dxplay.codec.base64Encode(dxplay.codec.utf8Encode(value));
    let output = '';
    for (const character of base64) {
      if (character === '+') output += 'P';
      else if (character === '/') output += 'X';
      else if (character >= '0' && character <= '9') output += DIGIT_MAP[Number(character)];
      else if (character >= 'A' && character <= 'Z') output += UPPER_MAP[character.charCodeAt(0) - 65];
      else if (character >= 'a' && character <= 'z') output += LOWER_MAP[character.charCodeAt(0) - 97];
      else output += character;
    }
    return output;
  };
  const requestJson = async input => {
    const response = await dxplay.fetch(input);
    if (response.status < 200 || response.status >= 300) throw new Error('qimao.request-failed');
    try { return JSON.parse(text(response.body).replace(/^\uFEFF/, '')); }
    catch (_) { throw new Error('qimao.response-invalid'); }
  };
  const sortedSignature = values => dxplay.crypto.md5(Object.keys(values).sort()
    .map(key => key + '=' + text(values[key])).join('') + SIGN_SALT);
  const apiRequest = async (base, path, values) => {
    const params = Object.assign({}, values);
    params.sign = sortedSignature(params);
    const query = Object.keys(params).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(params[key]))).join('&');
    return requestJson({
      url: base + path + '?' + query,
      headers: Object.assign({}, sourceHeaders, protocolHeaders),
    });
  };
  const image = value => text(value.image_link || value.image || value.cover
    || value.vertical_cover || value.playlet_cover).trim();
  const item = value => {
    const data = object(value);
    const id = text(data.playlet_id || data.id).trim();
    const name = clean(data.title);
    if (!id || !name) return null;
    const poster = image(data);
    const remark = text(data.total_episode_num || data.total_num || data.sub_title).trim();
    return {
      id,
      sourceKey,
      name,
      ...(poster ? {poster} : {}),
      ...(remark ? {remark} : {}),
    };
  };
  const indexPage = async (tagId, page, operation) => {
    const payload = object(await apiRequest(storeUrl, '/api/v1/playlet/index', {
      tag_id: tagId,
      next_id: String(page),
      playlet_privacy: tagId === '0' ? '0' : '1',
      ...(operation ? {operation: '1'} : {}),
    }));
    const data = object(payload.data);
    const items = list(data.list).map(item).filter(Boolean);
    return {data, items};
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.qimao-short',
    name: 'Qimao short drama',
    description: 'Readable rewrite of the qist ShortQimao catalog with anonymous direct HLS playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey).trim();
      sourceHeaders = object(input.headers);
      if (!sourceKey) throw new Error('qimao.source-key-missing');
      if (!dxplay.crypto || typeof dxplay.crypto.md5 !== 'function'
        || !dxplay.codec || typeof dxplay.codec.base64Encode !== 'function') {
        throw new Error('qimao.codec-unavailable');
      }
      storeUrl = DEFAULT_STORE;
      readUrl = DEFAULT_READ;
      try {
        const domains = object(object(await requestJson({
          url: DOMAIN_URL,
          headers: {'User-Agent': 'okhttp/4.10.0'},
        })).data);
        if (/^https?:\/\//i.test(text(domains.bc))) storeUrl = text(domains.bc).replace(/\/+$/, '');
        if (/^https?:\/\//i.test(text(domains.ks))) readUrl = text(domains.ks).replace(/\/+$/, '');
      } catch (_) {}
      const anonymousId = randomHex(16);
      const parameters = customBase64(JSON.stringify({
        static_score: '0.8',
        uuid: uuid(),
        'device-id': randomHex(64),
        mac: '',
        sourceuid: randomHex(16),
        'refresh-type': '0',
        model: 'DXPlay',
        'wlb-imei': '',
        AUTHORIZATION: anonymousId,
        brand: 'Android',
        oaid: '',
        'oaid-no-cache': '',
        'sys-ver': '11',
        'trusted-id': '',
        'phone-level': 'H',
        imei: '',
        'wlb-uid': anonymousId,
        'session-id': String(Date.now()),
      }));
      protocolHeaders = {
        authorization: '',
        reg: '',
        'is-white': '',
        'User-Agent': 'webviewversion/0',
        'net-env': '1',
        channel: 'va-vivo_lf',
        platform: 'android',
        'application-id': 'com.duoduo.read',
        'app-version': '10001',
        'qm-params': parameters,
        'no-permiss': '3',
        sign: dxplay.crypto.md5('AUTHORIZATION=app-version=10001application-id=com.duoduo.read'
          + 'channel=va-vivo_lfis-white=net-env=1platform=androidqm-params=' + parameters
          + 'reg=' + SIGN_SALT),
      };
      return {ready: true};
    },
    async home() {
      const payload = object(await apiRequest(storeUrl, '/api/v1/playlet/index', {
        tag_id: '0',
        playlet_privacy: '1',
        operation: '1',
      }));
      const data = object(payload.data);
      const featured = list(data.list).map(item).filter(Boolean);
      const categories = list(data.tag_items).map(value => ({
        id: text(object(value).tag_id),
        name: clean(object(value).tag_name),
      })).filter(value => value.id && value.name);
      if (!categories.length || !featured.length) throw new Error('qimao.home-unavailable');
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const result = await indexPage(text(input.categoryId), page, false);
      return {page, pageCount: result.items.length ? page + 1 : page, items: result.items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const payload = object(await apiRequest(storeUrl, '/api/v1/playlet/search', {
        extend: '',
        page: String(page),
        wd: keyword,
        read_preference: '0',
        0: randomHex(16) + Date.now(),
      }));
      const items = list(object(payload.data).list).map(item).filter(Boolean);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = text(input.id).trim();
      const payload = object(await apiRequest(readUrl, '/player/api/v1/playlet/info', {playlet_id: id}));
      const data = object(payload.data);
      const episodes = list(data.play_list).map((value, index) => {
        const episode = object(value);
        const url = text(episode.video_url).trim();
        if (!/^https?:\/\//i.test(url)) return null;
        const order = text(episode.sort).trim() || String(index + 1);
        return {id: text(episode.video_id) || order, name: '第' + order + '集', playId: url};
      }).filter(Boolean);
      if (!data.title || !episodes.length) throw new Error('qimao.detail-unavailable');
      const poster = image(data);
      return {
        id,
        sourceKey,
        name: clean(data.title),
        ...(poster ? {poster} : {}),
        ...(data.total_episode_num ? {remark: text(data.total_episode_num) + ' 集'} : {}),
        description: clean(data.intro),
        playGroups: [{id: 'qimao', name: '七猫', episodes}],
      };
    },
    async play(input) {
      const rawUrl = text(input.playId).trim();
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('qimao.media-unavailable');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl,
        headers: {
          'User-Agent': 'webviewversion/0',
          Referer: 'Dalvik/2.1.0 (Linux; U; Android 11; DXPlay)',
        },
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      storeUrl = DEFAULT_STORE;
      readUrl = DEFAULT_READ;
      protocolHeaders = {};
    },
  });
})();
