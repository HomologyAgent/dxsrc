/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://ts.faloo.com';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 12; TV) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
  const CATEGORIES = [
    ['1', '玄幻奇幻'], ['6', '武侠仙侠'], ['4', '都市言情'],
    ['7', '青春校园'], ['3', '军事历史'], ['2', '科幻网游'],
    ['44', '耽美同人'], ['5', '恐怖灵异'], ['9', '短篇'], ['54', '古典大作'],
  ];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const clean = value => text(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
  const absolute = value => {
    const raw = text(value).trim();
    let url = raw.startsWith('//') ? 'https:' + raw
      : /^https?:\/\//i.test(raw) ? raw
        : BASE + (raw.startsWith('/') ? raw : '/' + raw);
    if (/^http:\/\/[^/]*faloo\.com\//i.test(url)) url = 'https://' + url.slice(7);
    return url;
  };
  const detailPath = value => {
    const raw = text(value).trim();
    let path = raw;
    if (/^https?:\/\//i.test(raw)) {
      if (!raw.toLowerCase().startsWith(BASE)) throw new Error('faloo-audio.item-invalid');
      path = raw.slice(BASE.length);
    }
    if (!/^\/listen\/\d+\.html$/i.test(path)) throw new Error('faloo-audio.item-invalid');
    return path;
  };
  const headers = referer => Object.assign({
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Referer: referer || BASE + '/',
  }, sourceHeaders);
  const load = async (path, referer) => {
    const response = await dxplay.fetch({
      url: absolute(path),
      headers: headers(referer),
      responseType: 'base64',
    });
    if (response.status < 200 || response.status >= 300 || !response.bodyBase64) {
      throw new Error('faloo-audio.request-failed');
    }
    return dxplay.codec.decodeText({encoding: 'gb18030', base64: response.bodyBase64});
  };
  const parseItems = (body, limit) => {
    const items = [];
    const seen = Object.create(null);
    const pattern = /<div class=['"]audio_info(?:_l)?['"]>([\s\S]*?)<\/a><\/div>/ig;
    let match;
    while ((match = pattern.exec(body)) !== null && items.length < limit) {
      const block = match[1];
      const href = (block.match(/<a[^>]+href=['"]([^'"]+)/i) || [])[1];
      const path = text(href).replace(/^\/\/(?:ts\.)?faloo\.com/i, '');
      const name = clean((block.match(/<dd class=['"]audio_name['"]>([\s\S]*?)<\/dd>/i) || [])[1]
        || (block.match(/<a[^>]+title=['"]([^'"]+)/i) || [])[1]);
      if (!/^\/listen\/\d+\.html$/i.test(path) || !name || seen[path]) continue;
      const poster = (block.match(/<img[^>]+src=['"]([^'"]+)/i) || [])[1];
      const author = clean((block.match(/<dd class=['"]audio_auther['"]>([\s\S]*?)<\/dd>/i) || [])[1]);
      const count = clean((block.match(/<dd class=['"]audio_intr2['"]>([\s\S]*?)<\/dd>/i) || [])[1])
        .match(/(\d+)\s*集/)?.[1];
      seen[path] = true;
      items.push({
        id: path,
        sourceKey,
        name,
        ...(poster ? {poster: absolute(poster)} : {}),
        ...((author || count) ? {remark: [author, count ? count + '集' : ''].filter(Boolean).join(' · ')} : {}),
      });
    }
    return items;
  };
  const pageCount = (body, categoryId, page) => {
    const pattern = new RegExp('/category/' + categoryId + '/(\\d+)\\.html', 'ig');
    let maximum = page;
    let match;
    while ((match = pattern.exec(body)) !== null) maximum = Math.max(maximum, Number(match[1]) || page);
    return maximum;
  };
  const encodeLegacyQuery = value => {
    const encoded = dxplay.codec.encodeText({encoding: 'gb18030', text: text(value)});
    const bytes = dxplay.codec.base64Decode(encoded);
    let result = '';
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index];
      const safe = (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a)
        || (byte >= 0x30 && byte <= 0x39) || byte === 0x2d || byte === 0x2e
        || byte === 0x5f || byte === 0x7e;
      result += safe ? String.fromCharCode(byte) : '%' + byte.toString(16).padStart(2, '0').toUpperCase();
    }
    return result;
  };
  const parseEpisodes = (body, path) => {
    const episodes = [];
    const pattern = /<div class=['"]fenji['"]><ul id=['"]nid_(\d+)['"][\s\S]*?<dd class=['"]audio_name['"]>([\s\S]*?)<\/dd>[\s\S]*?<input type=['"]hidden['"] value=['"]([^'"]*)['"][\s\S]*?<\/ul><\/div>/ig;
    let match;
    while ((match = pattern.exec(body)) !== null) {
      const media = text(match[3]).trim();
      if (!/^https?:\/\//i.test(media)) continue;
      episodes.push({id: match[1], name: clean(match[2]), playId: path + '|' + match[1]});
    }
    return episodes;
  };
  const resolveEpisode = (body, episodeId) => {
    const pattern = new RegExp("<div class=['\"]fenji['\"]><ul id=['\"]nid_" + episodeId
      + "['\"][\\s\\S]*?<input type=['\"]hidden['\"] value=['\"]([^'\"]*)", 'i');
    const raw = text((body.match(pattern) || [])[1]).trim();
    return /^https?:\/\//i.test(raw) ? absolute(raw) : '';
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.faloo-audio',
    name: 'Faloo audiobook catalog',
    description: 'Readable rewrite of the public Faloo audiobook catalog, legacy Chinese pages and trial audio.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'faloo-audio';
      sourceHeaders = object(input.headers);
      return {ready: true};
    },
    async home() {
      const body = await load('/');
      return {
        categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})),
        featured: parseItems(body, 36),
      };
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const categoryId = text(input.categoryId);
      if (!CATEGORIES.some(value => value[0] === categoryId)) throw new Error('faloo-audio.category-invalid');
      const body = await load('/category/' + categoryId + '/' + page + '.html');
      return {page, pageCount: pageCount(body, categoryId, page), items: parseItems(body, 60)};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword || page > 1) return {page, pageCount: page, items: []};
      const body = await load('/list.aspx?k=' + encodeLegacyQuery(keyword));
      return {page, pageCount: 1, items: parseItems(body, 60)};
    },
    async detail(input) {
      const path = detailPath(input.id);
      const body = await load(path);
      const name = clean((body.match(/<div class=['"]d_audio_content['"][\s\S]*?<dd class=['"]audio_name['"]>([\s\S]*?)<\/dd>/i) || [])[1]);
      const poster = (body.match(/<img[^>]+id=['"]bookimg['"][^>]+src=['"]([^'"]+)/i) || [])[1];
      const description = clean((body.match(/<p id=['"]quanbu['"]>([\s\S]*?)<\/p>/i) || [])[1]);
      const metadata = [...body.matchAll(/<dd class=['"]audio_auther['"]>([\s\S]*?)<\/dd>/ig)]
        .map(value => clean(value[1])).filter(Boolean);
      const episodes = parseEpisodes(body, path);
      if (!name || !episodes.length) throw new Error('faloo-audio.item-unavailable');
      return {
        id: path,
        sourceKey,
        name,
        ...(poster ? {poster: absolute(poster)} : {}),
        ...(metadata.length ? {actors: metadata.slice(0, 3).join(' · ')} : {}),
        ...(description ? {description} : {}),
        playGroups: [{id: 'trial', name: '公开试听', episodes}],
      };
    },
    async play(input) {
      const playId = text(input.playId);
      const separator = playId.lastIndexOf('|');
      if (separator <= 0) throw new Error('faloo-audio.play-invalid');
      const path = detailPath(playId.slice(0, separator));
      const episodeId = playId.slice(separator + 1);
      if (!/^\d+$/.test(episodeId)) throw new Error('faloo-audio.play-invalid');
      const pageUrl = absolute(path);
      const body = await load(path, pageUrl);
      const rawUrl = resolveEpisode(body, episodeId);
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('faloo-audio.play-unavailable');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId) || episodeId,
        rawUrl,
        headers: headers(pageUrl),
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
    },
  });
})();
