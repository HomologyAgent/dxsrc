/* global dxplay */
(() => {
  'use strict';

  const LOGIN_URL = 'https://u.shytkjgs.com/user/v3/account/login';
  const API = 'https://app.whjzjx.cn';
  const AES_KEY = 'B@ecf920Od8A4df7';
  const LOGIN_USER_AGENT = 'Mozilla/5.0 (Linux; Android 9; V1938T Build/PQ3A.190705.08211809; wv) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36';
  const PLAY_USER_AGENT = 'Linux; Android 12; Pixel 3 XL) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/98.0.4758.101 Mobile Safari/537.36';
  const categories = [
    {id: '1', name: '剧场'}, {id: '3', name: '新剧'}, {id: '2', name: '热播'},
    {id: '7', name: '星选'}, {id: '5', name: '阳光'},
  ];
  let sourceKey = '';
  let sourceHeaders = {};
  let token = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const parseJson = value => {
    try { return JSON.parse(value); } catch (_error) { throw new Error('xingya.response-invalid'); }
  };
  const authenticate = async () => {
    if (token) return token;
    const payload = JSON.stringify({
      device: '2a50580e69d38388c94c93605241fb306',
      package_name: 'com.jz.xydj',
      android_id: 'ec1280db12795506',
      install_first_open: true,
      first_install_time: 1752505243345,
      last_update_time: 1752505243345,
      report_link_url: '',
      authorization: '',
      timestamp: Date.now(),
    });
    const encrypted = dxplay.crypto.aesEncrypt({mode: 'ecb', text: payload, key: AES_KEY});
    const response = await dxplay.fetch({
      url: LOGIN_URL,
      method: 'POST',
      headers: Object.assign({
        platform: '1',
        user_agent: LOGIN_USER_AGENT,
        'Content-Type': 'application/json; charset=utf-8',
      }, sourceHeaders),
      body: encrypted,
    });
    if (response.status < 200 || response.status >= 300) throw new Error('xingya.login-failed');
    token = text(object(parseJson(response.body).data).token);
    if (!token) throw new Error('xingya.login-failed');
    return token;
  };
  const requestHeaders = async () => Object.assign({
    authorization: await authenticate(),
    platform: '1',
    version_name: '3.8.3.1',
  }, sourceHeaders);
  const requestJson = async path => {
    const response = await dxplay.fetch({url: API + path, headers: await requestHeaders()});
    if (response.status < 200 || response.status >= 300) throw new Error('xingya.request-failed');
    return parseJson(response.body);
  };
  const postJson = async (path, value) => {
    const response = await dxplay.fetch({
      url: API + path,
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, await requestHeaders()),
      body: JSON.stringify(value),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('xingya.request-failed');
    return parseJson(response.body);
  };
  const item = (value, remarkKey) => ({
    id: text(value.id),
    sourceKey,
    name: text(value.title || value.id),
    ...(value.cover_url ? {poster: text(value.cover_url)} : {}),
    ...(value[remarkKey] || value.play_amount_str
      ? {remark: text(value[remarkKey] || value.play_amount_str)} : {}),
  });
  const theaterItems = (values, remarkKey) => list(values).map(entry => object(entry.theater))
    .filter(value => value.id && value.title).map(value => item(value, remarkKey));

  dxplay.register({
    id: 'org.dxsrc.jsm.short-xingya',
    name: 'Xingya short drama',
    description: 'Semantic rewrite of the jsm.json Xingya short-drama catalog and anonymous application login.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = object(input.headers);
      token = '';
      if (!sourceKey) throw new Error('xingya.source-key-missing');
      return {ready: true};
    },
    async home() {
      const response = await requestJson('/v1/theater/home_page?theater_class_id=1&class2_id=4&page_num=1&page_size=24');
      return {
        categories,
        featured: theaterItems(object(response.data).list, 'play_amount_str'),
      };
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const response = await requestJson('/v1/theater/home_page?theater_class_id='
        + encodeURIComponent(text(input.categoryId)) + '&page_num=' + page + '&page_size=24');
      const items = theaterItems(object(response.data).list, 'theme');
      return {page, pageCount: items.length === 0 ? page : page + 1, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: 1, items: []};
      const response = await postJson('/v3/search', {text: keyword});
      const theater = object(object(response.data).theater);
      const items = list(theater.search_data).filter(value => text(value.id) && text(value.id) !== '0')
        .map(value => item(value, 'score_str'));
      return {page, pageCount: 1, items};
    },
    async detail(input) {
      const response = await requestJson('/v2/theater_parent/detail?theater_parent_id='
        + encodeURIComponent(text(input.id)));
      const data = object(response.data);
      if (!data.title) throw new Error('xingya.item-not-found');
      let episodes = list(data.theaters).map((value, index) => ({
        id: text(value.num || index + 1),
        name: text(value.num || index + 1),
        playId: text(value.son_video_url),
      })).filter(value => value.playId);
      if (episodes.length === 0 && data.video_url) {
        episodes = [{id: '1', name: '1', playId: text(data.video_url)}];
      }
      return {
        id: text(input.id),
        sourceKey,
        name: text(data.title || input.id),
        ...(data.cover_url ? {poster: text(data.cover_url)} : {}),
        ...(data.filing ? {remark: text(data.filing)} : {}),
        ...(list(data.desc_tags)[0] ? {category: text(list(data.desc_tags)[0])} : {}),
        description: text(data.introduction),
        playGroups: episodes.length > 0 ? [{id: 'xingya', name: '星芽', episodes}] : [],
      };
    },
    async play(input) {
      const rawUrl = text(input.playId);
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('xingya.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl,
        headers: {'User-Agent': PLAY_USER_AGENT},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      token = '';
    },
  });
})();
