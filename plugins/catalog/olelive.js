/* global dxplay */
(() => {
  'use strict';

  const SITE = 'https://olelive.com';
  const API = 'https://api.olelive.com';
  const IMAGES = 'https://static.olelive.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36';
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length: 64}, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const add32 = (...values) => values.reduce((result, value) => (result + (value >>> 0)) >>> 0, 0);
  const rotate = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;
  const utf8Bytes = value => Array.from(dxplay.codec.utf8Encode(text(value)));
  const md5 = value => {
    const bytes = utf8Bytes(value), bitLength = bytes.length * 8;
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
    return [a0, b0, c0, d0].map(word => [0,8,16,24].map(shift => ((word >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
  };
  const signature = () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const streams = ['', '', '', ''];
    for (const character of timestamp) {
      const bits = character.charCodeAt(0).toString(2);
      streams[0] += bits.slice(2, 3); streams[1] += bits.slice(3, 4);
      streams[2] += bits.slice(4, 5); streams[3] += bits.slice(5);
    }
    const split = streams.map(bits => Number.parseInt(bits || '0', 2).toString(16).padStart(3, '0'));
    const digest = md5(timestamp);
    return digest.slice(0, 3) + split[0] + digest.slice(6, 11) + split[1]
      + digest.slice(14, 19) + split[2] + digest.slice(22, 27) + split[3] + digest.slice(30);
  };
  const headers = () => Object.assign({
    'User-Agent': USER_AGENT, Referer: SITE + '/', Origin: SITE,
  }, sourceHeaders);
  const request = async path => {
    const separator = path.includes('?') ? '&' : '?';
    const response = await dxplay.fetch({url: API + path + separator + '_vv=' + signature(), headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('olelive.request-failed');
    let envelope;
    try { envelope = JSON.parse(response.body); } catch (_) { throw new Error('olelive.response-invalid'); }
    if (Number(envelope.code) !== 0) throw new Error('olelive.upstream-failed');
    return envelope.data;
  };
  const absolutePoster = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    return raw ? IMAGES + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const item = value => ({
    id: text(value && value.id), sourceKey, name: text(value && value.name) || text(value && value.id),
    ...(absolutePoster(value && (value.picThumb || value.pic)) ? {poster: absolutePoster(value.picThumb || value.pic)} : {}),
    ...(value && value.remarks ? {remark: text(value.remarks)} : {}),
  });
  const categoryFilters = value => {
    const filters = [];
    const children = list(value && value.children).map(child => ({name: text(child.typeName), value: text(child.typeId)})).filter(option => option.name && option.value);
    if (children.length) filters.push({key: 'class', name: '类型', initialValue: '', options: [{name: '全部', value: ''}].concat(children)});
    for (const field of [['area', '地区'], ['year', '年代']]) {
      const options = list(value && value[field[0]]).map(text).filter(Boolean).map(option => ({name: option, value: option}));
      if (options.length) filters.push({key: field[0], name: field[1], initialValue: '', options: [{name: '全部', value: ''}].concat(options)});
    }
    return filters;
  };

  dxplay.register({
    id: 'org.dxsrc.qist.olelive',
    name: 'OleLive catalog',
    description: 'Readable rewrite of the public OleLive catalog, filters, search, detail and direct HLS playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'olelive';
      sourceHeaders = input.headers || {};
      return {ready: true};
    },

    async home(input) {
      const types = list(await request('/v1/pub/vod/list/type'));
      const categories = types.filter(value => {
        const label = text(value.typeName) + ':' + text(value.typeEn).toLowerCase();
        return !/直播|live|成人|chengren/.test(label);
      }).map(value => {
        const filters = input.includeFilters ? categoryFilters(value) : [];
        return {id: text(value.typeId), name: text(value.typeName), ...(filters.length ? {filters} : {})};
      }).filter(value => value.id && value.name);
      const landing = await request('/v1/pub/index/vod/data/2');
      return {categories, featured: list(landing && landing.list).map(item).filter(value => value.id && value.name)};
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), filters = input.filters || {};
      const data = await request('/v1/pub/vod/list/1/3/0/'
        + encodeURIComponent(text(filters.area) || '0') + '/' + encodeURIComponent(text(input.categoryId)) + '/'
        + encodeURIComponent(text(filters.class) || '0') + '/' + encodeURIComponent(text(filters.year) || '0')
        + '/update/' + page + '/24');
      const items = list(data && data.list).map(item).filter(value => value.id && value.name);
      const total = Math.max(0, Number(data && data.total) || 0);
      return {page, ...(total ? {pageCount: Math.max(page, Math.ceil(total / 24))} : {}), items};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const data = await request('/v1/pub/index/search/' + encodeURIComponent(text(input.keyword)) + '/vod/0/' + page + '/24');
      const items = [];
      for (const group of list(data && data.data)) {
        if (text(group && group.type) === 'vod') items.push(...list(group.list).map(item));
      }
      return {page, items: items.filter(value => value.id && value.name)};
    },

    async detail(input) {
      const id = text(input.id), value = await request('/v1/pub/vod/detail/' + encodeURIComponent(id) + '/1');
      const standard = [], premium = [];
      for (const entry of list(value && value.urls)) {
        const name = text(entry.title) || '第' + text(entry.index) + '集';
        if (/^https?:\/\//i.test(text(entry.url))) standard.push({id: 'standard-' + standard.length, name, playId: text(entry.url)});
        const vip = list(entry.vip_urls).find(candidate => /^https?:\/\//i.test(text(candidate && candidate.url)));
        if (vip) premium.push({id: 'premium-' + premium.length, name, playId: text(vip.url)});
      }
      const playGroups = [];
      if (standard.length) playGroups.push({id: 'standard', name: '欧乐高清', episodes: standard});
      if (premium.length) playGroups.push({id: 'premium', name: '欧乐超清', episodes: premium});
      if (!playGroups.length) throw new Error('olelive.item-not-found');
      const poster = absolutePoster(value.picThumb || value.pic);
      return {
        id, sourceKey, name: text(value.name) || id, ...(poster ? {poster} : {}),
        remark: text(value.remarks), year: text(value.year), area: text(value.area),
        actors: text(value.actor), director: text(value.director),
        description: text(value.content || value.blurb), playGroups,
      };
    },

    async play(input) {
      const rawUrl = text(input.playId);
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('olelive.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: Object.assign({'User-Agent': USER_AGENT, Referer: SITE + '/'}, sourceHeaders), parse: false,
      };
    },

    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
