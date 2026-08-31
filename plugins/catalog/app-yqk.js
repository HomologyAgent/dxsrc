/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://yzy0916.n0z6fkpuk.com';
  const APP_ID = 'e6ddefe09e0349739874563459f56c54';
  const APP_KEY = '3359de478f8d45638125e446a10ec541';
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length: 64}, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const add32 = (...values) => values.reduce((result, value) => (result + (value >>> 0)) >>> 0, 0);
  const rotate = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;
  const utf8Bytes = value => {
    const bytes = [];
    const input = text(value);
    for (let index = 0; index < input.length; index += 1) {
      let code = input.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff && index + 1 < input.length) {
        const low = input.charCodeAt(index + 1);
        if (low >= 0xdc00 && low <= 0xdfff) { code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00); index += 1; }
      }
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xc0 | (code >>> 6), 0x80 | (code & 63));
      else if (code < 0x10000) bytes.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 63), 0x80 | (code & 63));
      else bytes.push(0xf0 | (code >>> 18), 0x80 | ((code >>> 12) & 63), 0x80 | ((code >>> 6) & 63), 0x80 | (code & 63));
    }
    return bytes;
  };
  const md5Utf8 = value => {
    const bytes = utf8Bytes(value);
    const bitLength = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
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
        const previousD = d;
        d = c; c = b;
        b = add32(b, rotate(add32(a, f, MD5_CONSTANT[index], words[word]), MD5_SHIFT[index]));
        a = previousD;
      }
      a0 = add32(a0, a); b0 = add32(b0, b); c0 = add32(c0, c); d0 = add32(d0, d);
    }
    return [a0, b0, c0, d0].map(word => [0, 8, 16, 24].map(shift => ((word >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
  };
  const requestId = () => {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let value = '';
    for (let index = 0; index < 32; index += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
    return value;
  };
  const common = () => ({
    appId: APP_ID,
    cus1tom: 'aabbcc',
    deviceInfo: 'Android',
    reqDomain: 'yqk1.app',
    requestId: requestId(),
    udid: Date.now().toString(16).padStart(16, '0'),
    version: '1.2.7.104',
  });
  const categoryParams = channelId => {
    const value = common();
    return {appId: value.appId, channelId: text(channelId), cus1tom: value.cus1tom, deviceInfo: value.deviceInfo, reqDomain: value.reqDomain, requestId: value.requestId, udid: value.udid, version: value.version};
  };
  const searchParams = keyword => {
    const value = common();
    return {appId: value.appId, cus1tom: value.cus1tom, deviceInfo: value.deviceInfo, keyword: text(keyword), nextCount: '15', reqDomain: value.reqDomain, requestId: value.requestId, udid: value.udid, version: value.version};
  };
  const playParams = (epId, resolution) => {
    const value = common();
    return {appId: value.appId, cus1tom: value.cus1tom, deviceInfo: value.deviceInfo, epId: text(epId), reqDomain: value.reqDomain, requestId: value.requestId, udid: value.udid, version: value.version, vodResolution: text(resolution)};
  };
  const signedBody = values => {
    const pairs = Object.keys(values).map(key => key + '=' + text(values[key]));
    pairs.push('appKey=' + APP_KEY);
    return JSON.stringify({...values, sign: md5Utf8(pairs.join('&'))});
  };
  const post = async (path, values, allowEmpty) => {
    const response = await dxplay.fetch({
      url: BASE + path,
      method: 'POST',
      headers: {'User-Agent': 'Dart/3.1 (dart:io)', Origin: 'https://yqk1.app', Referer: 'https://yqk1.app/', 'Content-Type': 'application/json; charset=utf-8'},
      body: signedBody(values),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('appyqk.request-failed');
    let payload;
    try { payload = JSON.parse(response.body); } catch (_) { throw new Error('appyqk.response-invalid'); }
    if (!payload || payload.result !== true || !payload.data) {
      if (allowEmpty) return null;
      throw new Error('appyqk.remote-failed');
    }
    return payload.data;
  };
  const mapItems = values => list(values).map(value => ({
    id: text(value.vodId), sourceKey, name: text(value.vodName) || text(value.vodId),
    ...(value.coverImg ? {poster: text(value.coverImg)} : {}), remark: text(value.remark),
  })).filter(item => item.id && item.name);

  dxplay.register({
    id: 'org.dxsrc.jsm.app-yqk',
    name: 'YQK app catalog',
    description: 'Semantic rewrite of the public YQK app catalog, ordered request signatures, episodes and direct playback.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'appyqk'; return {ready: true}; },
    async home() {
      const data = await post('/v2/api/home/header', common());
      const categories = list(data.channeList)
        .filter(value => !['短剧', '体育'].includes(text(value.channelName)))
        .map(value => ({id: text(value.channelId), name: text(value.channelName)}))
        .filter(value => value.id && value.name);
      return {categories, featured: []};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const data = await post('/v2/api/channel/topicListView', categoryParams(input.categoryId));
      const items = list(data.topicList).flatMap(topic => mapItems(topic.vodList));
      return {page, pageCount: 1, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const data = await post('/v1/api/search/search', searchParams(input.keyword), true);
      if (!data) return {page, pageCount: 1, items: []};
      const values = list(data.items).filter(value => !text(value.flags).includes('短剧'));
      const items = mapItems(values);
      return {page, pageCount: 1, items};
    },
    async detail(input) {
      const id = text(input.id);
      if (!id) throw new Error('appyqk.item-invalid');
      const data = await post('/v2/api/vodInfo/index', {...common(), vodId: id});
      const playGroups = list(data.playerList).map((player, groupIndex) => ({
        id: text(player.playerName) || 'line-' + (groupIndex + 1),
        name: text(player.playerName) || '线路 ' + (groupIndex + 1),
        episodes: list(player.epList).map((episode, episodeIndex) => ({id: text(episode.epId) || String(episodeIndex + 1), name: text(episode.epName) || String(episodeIndex + 1), playId: text(episode.epId)})).filter(value => value.playId),
      })).filter(group => group.episodes.length);
      if (!playGroups.length) throw new Error('appyqk.episodes-unavailable');
      return {
        id, sourceKey, name: text(data.vodName) || id,
        ...(data.coverImg ? {poster: text(data.coverImg)} : {}),
        remark: text(data.updateRemark), description: text(data.intro), year: text(data.year), area: text(data.areaName),
        actors: list(data.actorList).map(value => text(value.vodWorkerName)).filter(Boolean).join(' '), playGroups,
      };
    },
    async play(input) {
      const epId = text(input.playId);
      if (!epId) throw new Error('appyqk.play-invalid');
      const choices = list(await post('/v2/api/vodInfo/epDetail', {...common(), vodEpId: epId})).filter(value => String(value.canPlay) === 'true');
      if (!choices.length) throw new Error('appyqk.resolution-unavailable');
      const selected = choices[choices.length - 1];
      const data = await post('/v2/api/vodInfo/playUrl', playParams(epId, selected.vodResolution));
      const url = text(data.playUrl);
      if (!/^https?:\/\//i.test(url)) throw new Error('appyqk.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': 'Dart/3.1 (dart:io)', Origin: 'https://yqk1.app', Referer: 'https://yqk1.app/'}, parse: false};
    },
    async destroy() { sourceKey = ''; },
  });
})();
