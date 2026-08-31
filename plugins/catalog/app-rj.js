/* global dxplay */
(() => {
  'use strict';
  const DEFAULT_BASE = 'http://v.rbotv.cn';
  const SECRET = '7gp0bnd2sr85ydii2j32pcypscoc4w6c7g5spl';
  const USER_AGENT = 'okhttp-okgo/jeasonlzy';
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length: 64}, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  let sourceKey = '';
  let baseUrl = DEFAULT_BASE;

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const add32 = (...values) => values.reduce((result, value) => (result + (value >>> 0)) >>> 0, 0);
  const rotate = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;
  const utf8Bytes = value => {
    const bytes = [], input = text(value);
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
    return [a0, b0, c0, d0].map(word => [0, 8, 16, 24].map(shift => ((word >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
  };
  const signedFields = extra => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    return {timestamp, sign: md5(SECRET + timestamp), ...extra};
  };
  const multipart = values => {
    const boundary = 'dxplay-' + Date.now().toString(16) + '-' + Math.floor(Math.random() * 0xffffff).toString(16);
    let body = '';
    for (const key of Object.keys(values)) body += '--' + boundary + '\r\nContent-Disposition: form-data; name="' + key + '"\r\n\r\n' + text(values[key]) + '\r\n';
    body += '--' + boundary + '--\r\n';
    return {boundary, body};
  };
  const post = async (path, extra) => {
    const encoded = multipart(signedFields(extra || {}));
    const response = await dxplay.fetch({url: baseUrl + path, method: 'POST', headers: {'User-Agent': USER_AGENT, 'Content-Type': 'multipart/form-data; boundary=' + encoded.boundary}, body: encoded.body});
    if (response.status < 200 || response.status >= 300) throw new Error('apprj.request-failed');
    let payload;
    try { payload = JSON.parse(response.body); } catch (_) { throw new Error('apprj.response-invalid'); }
    if (!payload || !payload.data) throw new Error('apprj.remote-failed');
    return payload.data;
  };
  const mapItems = values => list(values).map(value => ({
    id: text(value.vod_id), sourceKey, name: text(value.vod_name) || text(value.vod_id),
    ...(value.vod_pic || value.vod_pic_thumb ? {poster: text(value.vod_pic || value.vod_pic_thumb)} : {}), remark: text(value.vod_remarks),
  })).filter(item => item.id && item.name);
  const filter = (key, name, values) => {
    const options = list(values).map(value => text(value)).filter(value => value.length > 1).map(value => ({name: value, value: value === '全部' ? '' : value}));
    return options.length > 1 ? {key, name, initialValue: '', options} : null;
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.app-rj',
    name: 'ReBo app catalog',
    description: 'Semantic rewrite of the public ReBo app multipart catalog, filters, parser chain and direct playback.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'apprj';
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : {};
      baseUrl = text(extension.url || DEFAULT_BASE).replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('apprj.base-invalid');
      return {ready: true};
    },
    async home() {
      const data = await post('/v3/type/top_type');
      const categories = list(data.list).map(value => {
        const filters = [filter('class', '类型', value.extend), filter('area', '地区', value.area), filter('year', '年份', value.year), filter('lang', '语言', value.lang)].filter(Boolean);
        return {id: text(value.type_id), name: text(value.type_name), ...(filters.length ? {filters} : {})};
      }).filter(value => value.id && value.name);
      return {categories, featured: []};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const fields = {type_id: text(input.categoryId), limit: '12', page: String(page)};
      for (const key of ['area', 'class', 'lang', 'year']) if (input.filters && text(input.filters[key])) fields[key] = text(input.filters[key]);
      const data = await post('/v3/home/type_search', fields);
      const items = mapItems(data.list);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const data = await post('/v3/home/search', {keyword: text(input.keyword), limit: '12', page: String(page)});
      const items = mapItems(data.list);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = text(input.id);
      if (!id) throw new Error('apprj.item-invalid');
      const data = await post('/v3/home/vod_details', {vod_id: id});
      const playGroups = list(data.vod_play_list).map((line, groupIndex) => {
        const parseUrls = list(line.parse_urls).map(value => text(value)).filter(value => /^https?:\/\//i.test(value));
        return {
          id: text(line.name) || 'line-' + (groupIndex + 1), name: text(line.name) || '线路 ' + (groupIndex + 1),
          episodes: list(line.urls).map((episode, episodeIndex) => ({
            id: text(episode.nid) || String(episodeIndex + 1), name: text(episode.name) || String(episodeIndex + 1),
            playId: JSON.stringify({url: text(episode.url), parseUrls, ua: text(line.ua)}),
          })).filter(value => value.playId),
        };
      }).filter(group => group.episodes.length);
      if (!playGroups.length) throw new Error('apprj.episodes-unavailable');
      return {id, sourceKey, name: text(data.vod_name) || id, ...(data.vod_pic || data.vod_pic_thumb ? {poster: text(data.vod_pic || data.vod_pic_thumb)} : {}), remark: text(data.vod_remarks), description: text(data.vod_content), year: text(data.vod_year), actors: text(data.vod_actor), director: text(data.vod_director), playGroups};
    },
    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); } catch (_) { throw new Error('apprj.play-invalid'); }
      let url = text(descriptor.url), ua = text(descriptor.ua);
      for (const parser of list(descriptor.parseUrls)) {
        const fields = signedFields({});
        const separator = parser.includes('?') ? '&' : '?';
        const response = await dxplay.fetch({url: parser + encodeURIComponent(url) + separator + 'sign=' + encodeURIComponent(fields.sign) + '&timestamp=' + encodeURIComponent(fields.timestamp), headers: {'User-Agent': USER_AGENT}});
        if (response.status < 200 || response.status >= 300) continue;
        try {
          const parsed = JSON.parse(response.body);
          if (/^https?:\/\//i.test(text(parsed.url))) { url = text(parsed.url); ua = text(parsed.UA) || ua; break; }
        } catch (_) {}
      }
      if (!/^https?:\/\//i.test(url)) throw new Error('apprj.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: ua ? {'User-Agent': ua} : {}, parse: false};
    },
    async destroy() { sourceKey = ''; baseUrl = DEFAULT_BASE; },
  });
})();
