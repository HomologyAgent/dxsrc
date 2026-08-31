/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://vidsite.cloudseekr.com';
  const API = BASE + '/vidsite/vs/';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [['1', '电影'], ['2', '电视剧'], ['3', '动漫']];
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length: 64}, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  let sourceKey = '';
  let sourceHeaders = {};
  let fingerprint = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
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
  const headers = () => Object.assign({
    Origin: BASE,
    Accept: 'application/json, text/plain, */*',
    'Cache-Control': 'no-cache',
    'User-Agent': USER_AGENT,
    Referer: BASE + '/vid/app/',
    Pragma: 'no-cache',
    'Content-Type': 'application/json; charset=utf-8',
  }, sourceHeaders);
  const post = async (path, body) => {
    const response = await dxplay.fetch({url: API + path, method: 'POST', headers: headers(), body: JSON.stringify(body)});
    if (response.status < 200 || response.status >= 300) throw new Error('yidong.request-failed');
    let value;
    try { value = JSON.parse(response.body); } catch (_) { throw new Error('yidong.response-invalid'); }
    if (text(value.code) !== '000000') throw new Error('yidong.upstream-failed');
    return value.data;
  };
  const pageRequest = (columnId, page, searchKey) => post('qryPageColumnVideo', {
    columnId: Number(columnId) || 0,
    cateIdList: [0, 0, 0],
    pageIndex: page,
    pageSize: 9,
    ...(searchKey ? {searchKey} : {}),
  });
  const mapItems = values => list(values).map(value => ({
    id: text(value.id),
    sourceKey,
    name: text(value.title) || text(value.id),
    ...(value.appCoverUrl ? {poster: text(value.appCoverUrl)} : {}),
    ...(value.score ? {remark: text(value.score)} : {}),
  })).filter(item => item.id && item.name);
  const mapPage = (data, page) => ({
    page,
    pageCount: Math.max(1, Number(data && data.pages) || page),
    items: mapItems(data && data.list),
  });

  dxplay.register({
    id: 'org.dxsrc.jsm.yidong4k',
    name: 'Yidong 4K catalog',
    description: 'Semantic rewrite of the current Yidong catalog and its declarative China Mobile Cloud share targets.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'yidong4k';
      sourceHeaders = input.headers || {};
      fingerprint = md5Ascii('AiNewYiDong4K_' + Date.now() + '_' + Math.random());
      return {ready: true};
    },
    async home() {
      return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: []};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (!CATEGORIES.some(value => value[0] === text(input.categoryId))) throw new Error('yidong.category-invalid');
      return mapPage(await pageRequest(input.categoryId, page), page);
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1 || !text(input.keyword).trim()) return {page, pageCount: 1, items: []};
      return mapPage(await pageRequest(0, page, text(input.keyword).trim()), page);
    },
    async detail(input) {
      const id = Number(input.id);
      if (!Number.isInteger(id) || id < 1) throw new Error('yidong.item-invalid');
      await post('addAccessRecord', {videoId: id, fprint: fingerprint});
      const value = await post('qryVideoDetail', {videoId: id, fprint: fingerprint});
      const shareUrl = text(value && value.resUrl);
      const episode = shareUrl ? [{id: 'share', name: '移动云盘', playId: shareUrl, drive: {kind: 'drive-share', url: shareUrl}}] : [];
      return {
        id: text(id), sourceKey, name: text(value && value.title) || text(id),
        ...(value && value.appCoverUrl ? {poster: text(value.appCoverUrl)} : {}),
        ...(value && value.director ? {director: text(value.director)} : {}),
        ...(value && value.actor ? {actors: text(value.actor)} : {}),
        ...(value && value.remark ? {description: text(value.remark)} : {}),
        playGroups: episode.length ? [{id: 'mobile-drive', name: '移动云盘', episodes: episode}] : [],
      };
    },
    async play(input) {
      const url = text(input.playId);
      if (!/^https?:\/\//i.test(url)) throw new Error('yidong.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {}, parse: false, drive: {kind: 'drive-share', url}};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; fingerprint = ''; },
  });
})();
