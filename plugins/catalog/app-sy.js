/* global dxplay */
(() => {
  'use strict';
  const DEFAULT_EXTENSION = {url: 'http://114.66.27.208:806', siteKey: 'rectangleadsadxa', listKey: 'aassddwwxxllsx1x', parsesKey: 'aassddwwxxllsx1x'};
  const USER_AGENT = 'Dalvik/1.0.0 (Linux; U; Android 10; google Build/Pixel 3)';
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length: 64}, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  let sourceKey = '', baseUrl = '', listKey = '', parsesKey = '', version = '', declaredUa = '';
  let parsers = Object.create(null);

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const absolute = value => {
    const url = text(value);
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'http:' + url;
    return url ? baseUrl + (url.startsWith('/') ? url : '/' + url) : '';
  };
  const add32 = (...values) => values.reduce((result, value) => (result + (value >>> 0)) >>> 0, 0);
  const rotate = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;
  const md5Ascii = value => {
    const bytes = Array.from(text(value), character => character.charCodeAt(0) & 255), bitLength = bytes.length * 8;
    bytes.push(128); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let index = 0; index < 8; index += 1) bytes.push(index < 4 ? (bitLength >>> (index * 8)) & 255 : 0);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = Array.from({length: 16}, (_, index) => bytes[offset + index * 4] | (bytes[offset + index * 4 + 1] << 8) | (bytes[offset + index * 4 + 2] << 16) | (bytes[offset + index * 4 + 3] << 24));
      let a = a0, b = b0, c = c0, d = d0;
      for (let index = 0; index < 64; index += 1) {
        let f, word;
        if (index < 16) { f = (b & c) | (~b & d); word = index; }
        else if (index < 32) { f = (d & b) | (~d & c); word = (5 * index + 1) % 16; }
        else if (index < 48) { f = b ^ c ^ d; word = (3 * index + 5) % 16; }
        else { f = c ^ (b | ~d); word = (7 * index) % 16; }
        const previousD = d; d = c; c = b;
        b = add32(b, rotate(add32(a, f, MD5_CONSTANT[index], words[word]), MD5_SHIFT[index])); a = previousD;
      }
      a0 = add32(a0, a); b0 = add32(b0, b); c0 = add32(c0, c); d0 = add32(d0, d);
    }
    return [a0, b0, c0, d0].map(word => [0, 8, 16, 24].map(shift => ((word >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
  };
  const headers = contentType => ({
    'User-Agent': USER_AGENT,
    ua: md5Ascii(declaredUa),
    version,
    ...(contentType ? {'Content-Type': contentType} : {}),
  });
  const decrypt = (value, key) => dxplay.crypto.aesDecrypt({mode: 'ecb', base64: text(value), key: text(key)});
  const request = async (path, options) => {
    const url = /^https?:\/\//i.test(text(path)) ? text(path) : baseUrl + path;
    const response = await dxplay.fetch({url, method: options && options.method || 'GET', headers: options && options.headers || headers(), ...(options && options.body !== undefined ? {body: options.body} : {})});
    if (response.status < 200 || response.status >= 300) throw new Error('appsy.request-failed');
    return response.body;
  };
  const encryptedJson = async (path, options, key) => {
    try { return JSON.parse(decrypt(await request(path, options), key || listKey)); }
    catch (_) { throw new Error('appsy.response-invalid'); }
  };
  const mapItems = values => list(values).map(value => ({
    id: text(value.vod_id), sourceKey, name: text(value.vod_name) || text(value.vod_id),
    ...(value.vod_pic ? {poster: absolute(value.vod_pic)} : {}),
    remark: [text(value.vod_remarks), text(value.vod_score)].filter(Boolean).join(' | '),
  })).filter(item => item.id && item.name);
  const configure = async () => {
    const payload = await encryptedJson('/shark/api.php?action=configs');
    const config = payload.config || {};
    version = text(config.versionName);
    declaredUa = text(config.ua);
    const parserKey = text(config.hulue).split('&')[0];
    parsers = Object.create(null);
    for (const value of list(payload.playerinfos)) {
      if (!value.playerjiekou || !value.playername) continue;
      try {
        const parser = decrypt(value.playerjiekou, parserKey);
        if (parser) parsers[text(value.playername)] = parser;
      } catch (_) {}
    }
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.app-sy',
    name: 'ManGuo anime catalog',
    description: 'Semantic rewrite of the public ManGuo encrypted catalog, source parser table, episodes and direct playback.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'appsy';
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : DEFAULT_EXTENSION;
      baseUrl = text(extension.url || DEFAULT_EXTENSION.url).replace(/\/+$/, '');
      listKey = text(extension.listKey || DEFAULT_EXTENSION.listKey);
      parsesKey = text(extension.parsesKey || DEFAULT_EXTENSION.parsesKey);
      if (!/^https?:\/\//i.test(baseUrl) || ![16, 24, 32].includes(listKey.length) || ![16, 24, 32].includes(parsesKey.length)) throw new Error('appsy.config-invalid');
      await configure();
      return {ready: true};
    },
    async home() {
      const typePayload = await encryptedJson('/api.php/v1.home/types');
      const values = list(typePayload.data && typePayload.data.types);
      const categories = values.slice(1).map(value => ({id: text(value.type_id), name: text(value.type_name)})).filter(value => value.id && value.name);
      const firstId = text((values.find(value => text(value.type_id)) || {}).type_id);
      let featured = [];
      if (firstId) {
        const dataPayload = await encryptedJson('/api.php/v1.home/data?type_id=' + encodeURIComponent(firstId));
        featured = mapItems(dataPayload.data && dataPayload.data.banners);
      }
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const body = JSON.stringify({area: '', rank: '按上新', type: '', year: '', type_id: text(input.categoryId)});
      const payload = await encryptedJson('/api.php/v1.classify/content?page=' + page, {method: 'POST', headers: headers('application/json; charset=utf-8'), body});
      const items = mapItems(payload.data && payload.data.video_list);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const payload = await encryptedJson('/api.php/v1.search/data?wd=' + encodeURIComponent(text(input.keyword)) + '&type_id=0&page=' + page);
      const items = mapItems(payload.data && payload.data.search_data);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = text(input.id);
      if (!id) throw new Error('appsy.item-invalid');
      const payload = await encryptedJson('/api.php/v1.player/details?vod_id=' + encodeURIComponent(id));
      const data = payload.data && payload.data.detail;
      if (!data) throw new Error('appsy.item-not-found');
      const playGroups = list(data.play_url_list).map((line, groupIndex) => ({
        id: text(line.from) || 'line-' + (groupIndex + 1), name: text(line.show).replace(/\(.*?\)|（.*?）/g, '') || '线路 ' + (groupIndex + 1),
        episodes: list(line.urls).map((episode, episodeIndex) => ({id: String(episodeIndex + 1), name: text(episode.name) || String(episodeIndex + 1), playId: JSON.stringify({from: text(line.from), url: text(episode.url)})})).filter(value => value.playId),
      })).filter(group => group.episodes.length);
      if (!playGroups.length) throw new Error('appsy.episodes-unavailable');
      return {id, sourceKey, name: text(data.vod_name) || id, ...(data.vod_pic ? {poster: absolute(data.vod_pic)} : {}), remark: text(data.vod_remarks), description: text(data.vod_content), actors: text(data.vod_actor), director: text(data.vod_director), playGroups};
    },
    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); } catch (_) { throw new Error('appsy.play-invalid'); }
      let url = text(descriptor.url);
      if (!/^https?:\/\/.*\.(?:m3u8|mp4|flv)(?:[?#]|$)/i.test(url)) {
        const parser = parsers[text(descriptor.from)];
        if (!parser) throw new Error('appsy.parser-unavailable');
        let payload;
        if (/^https?:\/\//i.test(parser)) {
          try { payload = JSON.parse(await request(parser + encodeURIComponent(url))); }
          catch (_) { throw new Error('appsy.parse-invalid'); }
        } else {
          const body = 'parse=' + encodeURIComponent(parser) + '&url=' + encodeURIComponent(url) + '&matching=';
          payload = await encryptedJson('/shark/api.php?action=parsevod', {method: 'POST', headers: headers('application/x-www-form-urlencoded'), body}, parsesKey);
        }
        url = text(payload.url);
      }
      if (!/^https?:\/\//i.test(url)) throw new Error('appsy.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: headers(), parse: false};
    },
    async destroy() { sourceKey = ''; baseUrl = ''; listKey = ''; parsesKey = ''; version = ''; declaredUa = ''; parsers = Object.create(null); },
  });
})();
