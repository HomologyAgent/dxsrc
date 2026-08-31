/* global dxplay */
(() => {
  'use strict';

  const ORIGIN = 'https://4kyszx.top';
  const DEVICE_ID = 'f45a775875e2e004adbcea78e3312218';
  const APP_VERSION = '2.6.8+1';
  const BOOTSTRAP_KEY = 'cms_device_salt_v1_2024cms_app_sign_key_v1_2024_secure';
  let sourceKey = '';
  let signingKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const keyBase64 = key => dxplay.codec.base64Encode(dxplay.codec.utf8Encode(key));
  const hexFromBase64 = value => Array.from(dxplay.codec.base64Decode(value))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const hmacHex = (value, key) => hexFromBase64(dxplay.crypto.hmacSha256({keyBase64: keyBase64(key), text: value}));
  const nonce = () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let index = 0; index < 16; index += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
    return dxplay.codec.base64Encode(dxplay.codec.utf8Encode(value));
  };
  const request = async (path, values, rawSignatureValues) => {
    const entries = Object.keys(object(values)).map(key => [key, text(values[key])]);
    const signatureQuery = entries.map(([key, value]) => key + '=' + (rawSignatureValues ? value : encodeURIComponent(value))).join('&');
    const query = entries.map(([key, value]) => key + '=' + encodeURIComponent(value)).join('&');
    const timestamp = String(Math.floor(Date.now() / 1000)), requestNonce = nonce();
    const canonical = ['GET', path, signatureQuery, timestamp, requestNonce, APP_VERSION].join('\n');
    const response = await dxplay.fetch({
      url: ORIGIN + path + (query ? '?' + query : ''),
      headers: Object.assign({
        'x-signature': hmacHex(canonical, signingKey), 'user-agent': 'Dart/3.10 (dart:io)',
        'x-nonce': requestNonce, accept: 'application/json', 'x-timestamp': timestamp,
        'x-device-id': DEVICE_ID, 'content-type': 'application/json',
        'x-app-version': APP_VERSION, 'x-platform': 'android',
      }, sourceHeaders),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('feiyu.request-failed');
    try {
      const payload = JSON.parse(response.body);
      if (!payload || typeof payload !== 'object') throw new Error();
      return payload;
    } catch (_) { throw new Error('feiyu.response-invalid'); }
  };
  const payloadList = value => {
    const data = value && value.data;
    return Array.isArray(data) ? data : list(data && data.list);
  };
  const item = value => ({
    id: text(value && value.id), sourceKey,
    name: text(value && (value.name || value.title)) || text(value && value.id),
    ...(text(value && (value.pic || value.cover)) ? {poster: text(value.pic || value.cover)} : {}),
    ...(text(value && (value.remarks || value.subTitle || value.subtitle))
      ? {remark: text(value.remarks || value.subTitle || value.subtitle)} : {}),
  });
  const items = value => payloadList(value).map(item).filter(entry => entry.id && entry.name);
  const lineRank = value => {
    const name = text(value && (value.name || value.code)).toLowerCase();
    if (name.includes('4k')) return 100;
    if (name.includes('藍光') || name.includes('2k')) return 90;
    if (name.includes('高清') || name.includes('hd')) return 80;
    if (/m3u8|採集|資源|zy/.test(name)) return 10;
    return 50;
  };
  const playGroups = groups => list(groups).slice().sort((left, right) => {
    const leftDirect = text(left && left.parseApi) ? 0 : 1000;
    const rightDirect = text(right && right.parseApi) ? 0 : 1000;
    return rightDirect + lineRank(right) - leftDirect - lineRank(left);
  })
    .map((group, lineIndex) => {
      const parseApi = text(group && group.parseApi), id = text(group && (group.code || group.name)) || String(lineIndex + 1);
      const episodes = list(group && group.playUrls).map((episode, episodeIndex) => ({
        id: String(episodeIndex + 1), name: text(episode && episode.name) || String(episodeIndex + 1),
        playId: JSON.stringify({parseApi, url: text(episode && episode.url)}),
      })).filter(episode => {
        try { return Boolean(JSON.parse(episode.playId).url); } catch (_) { return false; }
      });
      return episodes.length ? {id, name: text(group.name || group.code) || id, episodes} : null;
    }).filter(Boolean);
  const parserResult = async descriptor => {
    const parseApi = text(descriptor.parseApi), url = text(descriptor.url);
    if (!parseApi) return {rawUrl: url, parse: !/\.(?:m3u8|mp4)(?:$|[?#])/i.test(url)};
    if (/json|api/i.test(parseApi)) {
      try {
        const response = await dxplay.fetch({
          url: parseApi + url,
          headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36'},
        });
        const payload = JSON.parse(response.body), media = text(payload && payload.url);
        if (/^https?:\/\//i.test(media)) return {rawUrl: media, parse: false};
      } catch (_) {}
    }
    return {rawUrl: parseApi + url, parse: true};
  };

  dxplay.register({
    id: 'org.dxsrc.qist.feiyu',
    name: 'Feiyu catalog family',
    description: 'Readable rewrite of the signed Feiyu catalog and parser routing API.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'feiyu';
      sourceHeaders = object(input.headers);
      signingKey = hmacHex(DEVICE_ID, BOOTSTRAP_KEY);
      return {ready: true};
    },
    async home() {
      const categoriesPayload = await request('/api/app/categories', {}, false);
      const categories = list(categoriesPayload.data).map(value => ({id: text(value && value.id), name: text(value && value.name)}))
        .filter(value => value.id && value.name);
      let featured = [];
      try { featured = items(await request('/api/app/ranking/list', {category: '1'}, false)); } catch (_) {}
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), filters = object(input.filters);
      const values = {page: String(page), page_size: '20'};
      for (const key of ['class', 'year', 'area', 'lang']) if (text(filters[key])) values[key] = text(filters[key]);
      const result = items(await request('/api/app/categories/' + encodeURIComponent(text(input.categoryId)) + '/videos', values, true));
      return {page, pageCount: result.length ? page + 1 : page, items: result};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const result = items(await request('/api/app/videos/search', {
        keyword: text(input.keyword), page: String(page), page_size: '20',
      }, true));
      return {page, pageCount: result.length ? page + 1 : page, items: result};
    },
    async detail(input) {
      const value = object((await request('/api/app/videos/' + encodeURIComponent(text(input.id)), {}, false)).data);
      const groups = playGroups(value.playGroups);
      if (!value.id || !value.name || !groups.length) throw new Error('feiyu.item-not-found');
      return Object.assign(item(value), {
        category: text(value.categoryName), year: text(value.year), area: text(value.area),
        actors: text(value.actor), director: text(value.director), description: text(value.content),
        remark: text(value.remarks || value.subTitle), playGroups: groups,
      });
    },
    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); } catch (_) { throw new Error('feiyu.play-id-invalid'); }
      const media = await parserResult(descriptor);
      if (!/^https?:\/\//i.test(media.rawUrl)) throw new Error('feiyu.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: media.rawUrl,
        headers: {}, parse: media.parse,
      };
    },
    async destroy() {
      sourceKey = ''; signingKey = ''; sourceHeaders = {};
    },
  });
})();
