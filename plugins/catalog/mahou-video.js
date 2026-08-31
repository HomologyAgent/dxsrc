/* global dxplay */
(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    host: 'https://dmhyy.com',
    appId: 'cde75dbd61ce274e07e8ce29',
    finger: '505a0e62069a061e07698eb4b6327d88',
    secretKey: '9b1fccddb6f8e1b385de7e6e736e050144a7f3a208130fff',
    version: '1',
  });
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  let sourceKey = '';
  let sourceHeaders = {};
  let settings = DEFAULTS;

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const randomHex = length => {
    let result = '';
    while (result.length < length) result += Math.floor(Math.random() * 16).toString(16);
    return result;
  };
  const signedHeaders = extra => {
    const time = String(Date.now());
    const nonce = randomHex(32);
    const value = 'finger=' + settings.finger + '&id=' + settings.appId + '&nonce=' + nonce
      + '&sk=' + settings.secretKey + '&time=' + time + '&v=' + settings.version;
    return Object.assign({
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      Referer: settings.host + '/',
      'x-platform': 'web',
      'X-Client': 'YOUR_PUBLIC_CLIENT_ID',
      'x-aid': settings.appId,
      'x-ave': settings.version,
      'x-time': time,
      'x-nonc': nonce,
      'x-sign': dxplay.crypto.sha256(value).toUpperCase(),
    }, sourceHeaders, extra || {});
  };
  const query = values => Object.keys(values).filter(key => values[key] !== undefined && values[key] !== null && text(values[key]) !== '')
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key]))).join('&');
  const requestJson = async (path, params) => {
    const suffix = params ? query(params) : '';
    const response = await dxplay.fetch({
      url: settings.host + path + (suffix ? '?' + suffix : ''),
      headers: signedHeaders(),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('mahou.request-failed');
    let result;
    try { result = JSON.parse(response.body); } catch (_) { throw new Error('mahou.response-invalid'); }
    if (Number(result.code) !== 200) throw new Error('mahou.upstream-rejected');
    return result;
  };
  const item = value => ({
    id: text(value.vod_id),
    sourceKey,
    name: text(value.vod_name || value.vod_id),
    ...(text(value.vod_pic) ? {poster: text(value.vod_pic)} : {}),
    remark: text(value.vod_remarks || value.vod_douban_score),
  });
  const filter = (key, name, values) => {
    const options = list(values).map(value => ({name: text(value), value: text(value)})).filter(value => value.name);
    return options.length ? {
      key, name, initialValue: '', options: [{name: '全部', value: ''}, ...options],
    } : null;
  };
  const visibleOnWeb = value => {
    const platforms = value.display_platforms;
    if (Array.isArray(platforms)) return platforms.some(entry => text(entry).trim().toLowerCase() === 'web');
    if (typeof platforms === 'string') return platforms.split(',').some(entry => entry.trim().toLowerCase() === 'web');
    return true;
  };
  const directMedia = url => /\.(?:m3u8|mp4|m4v|mov|flv|mkv|webm|mp3|m4a|aac|flac|ogg)(?:[?#]|$)/i.test(url);

  const varint = value => {
    let current = Math.max(0, Math.floor(Number(value) || 0));
    const result = [];
    while (current >= 128) {
      result.push((current % 128) | 128);
      current = Math.floor(current / 128);
    }
    result.push(current);
    return new Uint8Array(result);
  };
  const concat = values => {
    const size = values.reduce((total, value) => total + value.length, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    for (const value of values) { result.set(value, offset); offset += value.length; }
    return result;
  };
  const stringField = (field, value) => {
    const bytes = dxplay.codec.utf8Encode(text(value));
    return concat([varint((field << 3) | 2), varint(bytes.length), bytes]);
  };
  const intField = (field, value) => concat([varint(field << 3), varint(value)]);
  const readVarint = (bytes, state) => {
    let result = 0;
    let multiplier = 1;
    for (let count = 0; count < 10 && state.offset < bytes.length; count += 1) {
      const byte = bytes[state.offset++];
      result += (byte & 127) * multiplier;
      if (!(byte & 128)) return result;
      multiplier *= 128;
    }
    throw new Error('mahou.protobuf-invalid');
  };
  const decodeResponse = bytes => {
    const state = {offset: 0};
    const result = {code: 0, msg: '', data: ''};
    while (state.offset < bytes.length) {
      const key = readVarint(bytes, state);
      const field = Math.floor(key / 8);
      const wire = key & 7;
      if (wire === 0) {
        const value = readVarint(bytes, state);
        if (field === 1) result.code = value;
      } else if (wire === 2) {
        const length = readVarint(bytes, state);
        if (length < 0 || state.offset + length > bytes.length) throw new Error('mahou.protobuf-invalid');
        const value = dxplay.codec.utf8Decode(bytes.slice(state.offset, state.offset + length));
        state.offset += length;
        if (field === 2) result.msg = value;
        if (field === 3) result.data = value;
      } else {
        throw new Error('mahou.protobuf-wire-unsupported');
      }
    }
    return result;
  };
  const decodeUrl = async (url, from) => {
    const payloadTime = Date.now();
    const payloadNonce = randomHex(32);
    const value = 'finger=' + settings.finger + '&id=' + settings.appId + '&nonce=' + payloadNonce
      + '&sk=' + settings.secretKey + '&time=' + payloadTime + '&v=' + settings.version;
    const payload = concat([
      stringField(1, url), stringField(2, from), intField(3, payloadTime),
      stringField(4, payloadNonce), stringField(5, dxplay.crypto.sha256(value).toUpperCase()),
      stringField(6, settings.appId), intField(7, settings.version),
    ]);
    const response = await dxplay.fetch({
      url: settings.host + '/api.php/web/decode/url',
      method: 'POST',
      headers: signedHeaders({'Content-Type': 'application/x-protobuf', Accept: 'application/x-protobuf'}),
      bodyBase64: dxplay.codec.base64Encode(payload),
      responseType: 'base64',
    });
    if (response.status < 200 || response.status >= 300 || !response.bodyBase64) throw new Error('mahou.decode-failed');
    const result = decodeResponse(dxplay.codec.base64Decode(response.bodyBase64));
    if (result.code !== 1 || !/^https?:\/\//i.test(result.data)) throw new Error('mahou.decode-failed');
    return result.data;
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.mahou-video',
    name: 'Mahou video',
    description: 'Readable rewrite of the current public Mahou Web catalog, search, multi-line detail and protobuf playback decode flow.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'mahou-video';
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      const ext = object(input.ext);
      settings = Object.freeze({
        host: text(ext.host || DEFAULTS.host).replace(/\/+$/, ''),
        appId: text(ext.appId || DEFAULTS.appId),
        finger: text(ext.finger || DEFAULTS.finger),
        secretKey: text(ext.secretKey || DEFAULTS.secretKey),
        version: text(ext.version || DEFAULTS.version),
      });
      return {ready: true};
    },
    async home() {
      const result = await requestJson('/api.php/web/index/home');
      const data = object(result.data);
      const categories = list(data.categories).map(value => {
        const values = object(value.filter_options);
        const filters = [
          filter('class', '类型', values.class), filter('area', '地区', values.area),
          filter('year', '年份', values.year),
          {key: 'sort', name: '排序', initialValue: 'hits', options: [
            {name: '人气', value: 'hits'}, {name: '最新', value: 'time'},
            {name: '评分', value: 'score'}, {name: '年份', value: 'year'},
          ]},
        ].filter(Boolean);
        return {id: text(value.type_id || value.type_name), name: text(value.type_name), filters};
      }).filter(value => value.id && value.name);
      return {categories, featured: list(data.recommend).map(item).filter(value => value.id)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const filters = object(input.filters);
      const result = await requestJson('/api.php/web/filter/vod', {
        type_id: text(input.categoryId), page, sort: text(filters.sort) || 'hits',
        class: text(filters.class), area: text(filters.area), year: text(filters.year),
      });
      const items = list(result.data).map(item).filter(value => value.id);
      return {page, pageCount: items.length < 18 ? page : page + 1, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const result = await requestJson('/api.php/web/search/index', {wd: keyword, page, limit: 15});
      const items = list(result.data).map(item).filter(value => value.id);
      return {page, pageCount: result.hasMore === true || items.length >= 15 ? page + 1 : page, items};
    },
    async detail(input) {
      const id = text(input.id).trim();
      if (!id) throw new Error('mahou.item-id-invalid');
      const result = await requestJson('/api.php/web/vod/get_detail', {vod_id: id});
      const value = list(result.data)[0];
      if (!value) throw new Error('mahou.item-unavailable');
      const players = new Map(list(result.vodplayer).map(player => [text(player.from), player]));
      const froms = text(value.vod_play_from).split('$$$');
      const lines = text(value.vod_play_url).split('$$$');
      const playGroups = [];
      for (let lineIndex = 0; lineIndex < Math.min(froms.length, lines.length); lineIndex += 1) {
        const from = froms[lineIndex].trim();
        const player = players.get(from);
        if (!from || !lines[lineIndex] || (players.size && !player) || (player && !visibleOnWeb(player))) continue;
        const episodes = [];
        for (const entry of lines[lineIndex].split('#')) {
          const split = entry.indexOf('$');
          if (split <= 0) continue;
          const name = entry.slice(0, split).trim();
          const url = entry.slice(split + 1).trim();
          if (!name || !url) continue;
          episodes.push({
            id: from + '-' + episodes.length,
            name,
            playId: JSON.stringify({
              url, from, decodeStatus: text(player && player.decode_status),
              decodeMode: text(player && player.decode_mode),
            }),
          });
        }
        if (episodes.length) playGroups.push({id: from, name: text(player && player.show) || from, episodes});
      }
      if (!playGroups.length) throw new Error('mahou.play-lines-unavailable');
      return {
        id, sourceKey, name: text(value.vod_name || id),
        ...(text(value.vod_pic) ? {poster: text(value.vod_pic)} : {}),
        ...(text(value.vod_actor) ? {actors: text(value.vod_actor)} : {}),
        ...(text(value.vod_director) ? {director: text(value.vod_director)} : {}),
        remark: text(value.vod_remarks || value.vod_year),
        description: text(value.vod_content),
        playGroups,
      };
    },
    async play(input) {
      let value;
      try { value = JSON.parse(text(input.playId)); } catch (_) { throw new Error('mahou.play-id-invalid'); }
      let url = text(value.url).trim();
      if (!url) throw new Error('mahou.play-id-invalid');
      if (!directMedia(url)) {
        if (text(value.decodeStatus) === '2') throw new Error('mahou.line-unavailable');
        url = await decodeUrl(url, text(value.from));
      }
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl: url,
        headers: {'User-Agent': USER_AGENT, Referer: settings.host + '/'},
        parse: false,
      };
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; settings = DEFAULTS; },
  });
})();
