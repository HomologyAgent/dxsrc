/* global dxplay */
(() => {
  'use strict';

  const HOSTS = [
    'https://323433ssdfd.top',
    'https://duoduosdf12223234334.top',
    'https://xds2435u23422342342u.top',
    'https://dduotv01.top',
  ];
  const FINGER = 'WF-2c064bc5b3400788f31b848849bc3a60f835423ba2dfe69d7ea93974c216e4f2';
  const CLIENT_ID = 'com.web.player';
  const SECRET = 'WEB-50a8e9c84a1dc05669a692ded99a2dac46527229e607a7be15db88dbc59059d1';
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const API_HEADERS = {
    Accept: 'application/json',
    'X-Client': '8f3d2a1c7b6e5d4c9a0b1f2e3d4c5b6a',
    'web-sign': 'ddtvf65f3a83d6d9ad6f',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  };
  let sourceKey = '', sourceHeaders = {}, activeHost = HOSTS[0];

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const absolute = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? activeHost + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  const headers = extra => Object.assign({}, API_HEADERS, sourceHeaders, extra || {});
  const parseJson = value => { try { return JSON.parse(value); } catch (_) { throw new Error('bubu-video.response-invalid'); } };
  const encodeQuery = values => Object.keys(values).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key]))).join('&');
  const requestJson = async (path, query) => {
    let failed = false;
    for (const host of [activeHost, ...HOSTS.filter(value => value !== activeHost)]) {
      try {
        const suffix = query && Object.keys(query).length ? (path.includes('?') ? '&' : '?') + encodeQuery(query) : '';
        const response = await dxplay.fetch({url: host + path + suffix, headers: headers()});
        if (response.status < 200 || response.status >= 300) throw new Error('status');
        const payload = parseJson(response.body);
        if (!payload || Number(payload.code) !== 200) throw new Error('payload');
        activeHost = host;
        return payload;
      } catch (_) { failed = true; }
    }
    if (failed) throw new Error('bubu-video.request-failed');
    throw new Error('bubu-video.request-unavailable');
  };
  const utf8 = value => {
    const encoded = encodeURIComponent(text(value)), output = [];
    for (let index = 0; index < encoded.length; index += 1) {
      if (encoded[index] === '%') { output.push(parseInt(encoded.slice(index + 1, index + 3), 16)); index += 2; }
      else output.push(encoded.charCodeAt(index));
    }
    return output;
  };
  const varint = value => {
    const output = []; let remaining = Math.max(0, Math.floor(Number(value) || 0));
    do { const byte = remaining % 128; remaining = Math.floor(remaining / 128); output.push(byte | (remaining ? 128 : 0)); } while (remaining);
    return output;
  };
  const bytesField = (number, value) => { const bytes = utf8(value); return [(number << 3) | 2, ...varint(bytes.length), ...bytes]; };
  const varintField = (number, value) => [number << 3, ...varint(value)];
  const base64Encode = bytes => {
    let output = '';
    for (let index = 0; index < bytes.length; index += 3) {
      const a = bytes[index], b = index + 1 < bytes.length ? bytes[index + 1] : 0, c = index + 2 < bytes.length ? bytes[index + 2] : 0;
      output += B64[a >>> 2] + B64[((a & 3) << 4) | (b >>> 4)]
        + (index + 1 < bytes.length ? B64[((b & 15) << 2) | (c >>> 6)] : '=')
        + (index + 2 < bytes.length ? B64[c & 63] : '=');
    }
    return output;
  };
  const base64Decode = value => {
    const input = text(value).replace(/\s/g, ''), output = [];
    for (let index = 0; index < input.length; index += 4) {
      const a = B64.indexOf(input[index]), b = B64.indexOf(input[index + 1]);
      const c = input[index + 2] === '=' ? -1 : B64.indexOf(input[index + 2]);
      const d = input[index + 3] === '=' ? -1 : B64.indexOf(input[index + 3]);
      if (a < 0 || b < 0) throw new Error('bubu-video.base64-invalid');
      output.push((a << 2) | (b >>> 4));
      if (c >= 0) output.push(((b & 15) << 4) | (c >>> 2));
      if (d >= 0) output.push(((c & 3) << 6) | d);
    }
    return output;
  };
  const readVarint = (bytes, state) => {
    let value = 0, scale = 1;
    while (state.index < bytes.length) {
      const byte = bytes[state.index++]; value += (byte & 127) * scale;
      if (!(byte & 128)) return value;
      scale *= 128;
      if (scale > Number.MAX_SAFE_INTEGER) break;
    }
    throw new Error('bubu-video.protobuf-invalid');
  };
  const mediaFromProto = bytes => {
    const state = {index: 0};
    while (state.index < bytes.length) {
      const tag = readVarint(bytes, state), wire = tag & 7;
      if (wire === 2) {
        const length = readVarint(bytes, state), end = state.index + length;
        if (end > bytes.length) throw new Error('bubu-video.protobuf-invalid');
        const field = bytes.slice(state.index, end); state.index = end;
        for (let offset = 0; offset + 4 <= field.length; offset += 1) {
          if (field[offset] === 104 && field[offset + 1] === 116 && field[offset + 2] === 116 && field[offset + 3] === 112) {
            return String.fromCharCode(...field.slice(offset));
          }
        }
      } else if (wire === 0) readVarint(bytes, state);
      else throw new Error('bubu-video.protobuf-invalid');
    }
    return '';
  };
  const decodeMedia = async (code, flag) => {
    const timestamp = Date.now();
    const nonce = dxplay.crypto.sha256(timestamp + ':' + Math.random()).slice(0, 32);
    const signature = dxplay.crypto.sha256('finger=' + FINGER + '&id=' + CLIENT_ID + '&nonce=' + nonce + '&sk=' + SECRET + '&time=' + timestamp + '&v=1').toUpperCase();
    const bytes = [
      ...bytesField(1, code), ...bytesField(2, flag), ...varintField(3, timestamp),
      ...bytesField(4, nonce), ...bytesField(5, signature), ...bytesField(6, CLIENT_ID), ...varintField(7, 1),
    ];
    for (const host of [activeHost, ...HOSTS.filter(value => value !== activeHost)]) {
      try {
        const response = await dxplay.fetch({
          url: host + '/api.php/web/decode/url', method: 'POST',
          headers: headers({'Content-Type': 'application/x-protobuf', Accept: 'application/x-protobuf'}),
          bodyBase64: base64Encode(bytes), responseType: 'base64',
        });
        if (response.status < 200 || response.status >= 300 || !response.bodyBase64) throw new Error('status');
        const media = mediaFromProto(base64Decode(response.bodyBase64));
        if (/^https?:\/\//i.test(media)) { activeHost = host; return media; }
      } catch (_) {}
    }
    throw new Error('bubu-video.play-unavailable');
  };
  const item = value => ({
    id: text(value.vod_id), sourceKey, name: clean(value.vod_name) || text(value.vod_id),
    ...(absolute(value.vod_pic) ? {poster: absolute(value.vod_pic)} : {}),
    ...(value.vod_remarks ? {remark: clean(value.vod_remarks)} : {}),
  });
  const playGroups = value => {
    const names = text(value.vod_play_from).split('$$$'), lines = text(value.vod_play_url).split('$$$');
    return lines.map((line, lineIndex) => {
      const flag = clean(names[lineIndex]) || '线路' + (lineIndex + 1);
      const episodes = line.split('#').map((entry, episodeIndex) => {
        const separator = entry.indexOf('$');
        if (separator < 0 || !entry.slice(separator + 1)) return null;
        return {id: String(episodeIndex + 1), name: clean(entry.slice(0, separator)) || String(episodeIndex + 1), playId: JSON.stringify({code: entry.slice(separator + 1), flag})};
      }).filter(Boolean);
      return episodes.length ? {id: flag + ':' + (lineIndex + 1), name: flag, episodes} : null;
    }).filter(Boolean);
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.bubu-video',
    name: 'Bubu video',
    description: 'Readable rewrite of the public Bubu/Duoduo catalog and protobuf media resolver.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'bubu-video';
      sourceHeaders = object(input.headers);
      activeHost = HOSTS[0];
      return {ready: true};
    },
    async home() {
      const data = object((await requestJson('/api.php/web/index/home')).data);
      const categories = list(data.categories).map(value => ({id: text(value.type_id), name: text(value.type_name)})).filter(value => value.id && value.name);
      const values = [...list(data.categories).flatMap(value => list(value && value.videos)), ...list(data.recommend)];
      const seen = Object.create(null), featured = [];
      for (const value of values) { const entry = item(value); if (!entry.id || seen[entry.id]) continue; seen[entry.id] = true; featured.push(entry); }
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), names = {1: '电影', 2: '剧集', 3: '动漫', 4: '综艺'};
      const values = list((await requestJson('/api.php/web/filter/vod', {page, sort: 'hits', ...(names[input.categoryId] ? {type_name: names[input.categoryId]} : {})})).data);
      return {page, pageCount: values.length >= 18 ? page + 1 : page, items: values.map(item)};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      return {page, pageCount: page, items: list((await requestJson('/api.php/web/search/index', {wd: text(input.keyword)})).data).map(item)};
    },
    async detail(input) {
      const values = list((await requestJson('/api.php/web/vod/get_detail', {vod_id: text(input.id)})).data), value = object(values[0]);
      const groups = playGroups(value);
      if (!value.vod_id || !groups.length) throw new Error('bubu-video.item-not-found');
      return {...item(value), ...(value.vod_year ? {year: text(value.vod_year)} : {}), ...(value.vod_area ? {area: text(value.vod_area)} : {}),
        ...(value.vod_actor ? {actors: clean(value.vod_actor)} : {}), ...(value.vod_director ? {director: clean(value.vod_director)} : {}),
        ...(value.vod_content ? {description: clean(value.vod_content)} : {}), playGroups: groups};
    },
    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); } catch (_) { descriptor = {code: text(input.playId), flag: text(input.flag)}; }
      const media = await decodeMedia(text(descriptor.code), text(descriptor.flag));
      const referer = media.match(/^(https?:\/\/[^/]+)/i)?.[1] || activeHost;
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: media,
        headers: {'User-Agent': API_HEADERS['User-Agent'], Referer: referer}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; activeHost = HOSTS[0]; },
  });
})();
