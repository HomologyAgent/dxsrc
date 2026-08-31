/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.didahd.xyz';
  const SMART_PLAY = 'https://hd.ticktockwow.com/smartplay-cache/api/webvideo_ty.php';
  const SALT = 'RY7e48naFXPsLJC';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36';
  const CATEGORIES = [['1', '电影'], ['2', '电视剧'], ['3', '纪录片'], ['4', '动漫'], ['5', '综艺']];
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length: 64}, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes).match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => {
    const raw = decode(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const headers = referer => Object.assign({
    'User-Agent': USER_AGENT, 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: referer || BASE + '/',
  }, sourceHeaders);
  const request = async (url, options) => {
    const input = options || {};
    const response = await dxplay.fetch({
      url: absolute(url), method: input.method || 'GET',
      headers: Object.assign(headers(input.referer), input.headers || {}),
      ...(input.body !== undefined ? {body: input.body} : {}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('didahd.request-failed');
    return response;
  };
  const add32 = (...values) => values.reduce((result, value) => (result + (value >>> 0)) >>> 0, 0);
  const rotate = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;
  const md5 = value => {
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
    return [a0, b0, c0, d0].map(word => [0,8,16,24].map(shift => ((word >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
  };
  const parsePlayerObject = html => {
    const marker = html.search(/player_aaaa\s*=/i);
    if (marker < 0) return {};
    const start = html.indexOf('{', marker);
    if (start < 0) return {};
    let depth = 0, quoted = false, escaped = false;
    for (let index = start; index < html.length; index += 1) {
      const character = html[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === '{') depth += 1;
      else if (character === '}' && --depth === 0) {
        try { return JSON.parse(html.slice(start, index + 1)); } catch (_) { return {}; }
      }
    }
    return {};
  };
  const items = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const anchor = match[1].match(/<a\b([^>]*href=["'][^"']*\/detail\/\d+\.html["'][^>]*)>/i);
      if (!anchor) continue;
      const href = attr(anchor[1], 'href'), id = href.match(/\/detail\/(\d+)\.html/i)?.[1];
      if (!id || seen[id]) continue;
      const image = match[1].match(/<img\b([^>]*)>/i)?.[1] || '';
      const name = attr(anchor[1], 'title') || attr(image, 'alt');
      if (!name) continue;
      seen[id] = true;
      const poster = absolute(attr(image, 'data-original') || attr(image, 'data-src') || attr(image, 'src'));
      const remark = strip(match[1].match(/class=["'][^"']*pic-text[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]);
      output.push({id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})});
    }
    return output;
  };

  dxplay.register({
    id: 'org.dxsrc.qist.didahd',
    name: 'Didahd catalog',
    description: 'Readable rewrite of the public Didahd catalog, share lines and Smart Play HLS resolver.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'didahd';
      sourceHeaders = input.headers || {};
      return {ready: true};
    },

    async home() {
      return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: items((await request('/')).body).slice(0, 30)};
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), categoryId = text(input.categoryId).replace(/\D/g, '');
      const html = (await request('/type/' + categoryId + '-' + page + '.html')).body;
      const found = items(html);
      const pages = Array.from(html.matchAll(new RegExp('/type/' + categoryId + '-(\\d+)\\.html', 'g')), match => Number(match[1])).filter(Number.isFinite);
      return {page, ...(pages.length ? {pageCount: Math.max(...pages)} : {}), items: found};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const html = (await request('/search/' + encodeURIComponent(text(input.keyword)) + '-------------.html')).body;
      return {page, pageCount: 1, items: items(html)};
    },

    async detail(input) {
      const id = text(input.id).replace(/\D/g, ''), html = (await request('/detail/' + id + '.html')).body;
      const name = strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || id;
      const thumb = html.match(/class=["'][^"']*myui-content__thumb[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || '';
      const image = thumb.match(/<img\b([^>]*)>/i)?.[1] || '';
      const poster = absolute(attr(image, 'data-original') || attr(image, 'data-src') || attr(image, 'src'));
      const description = strip(html.match(/class=["'][^"']*detail-content[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]);
      const playGroups = [];
      for (const tab of html.matchAll(/<a\b[^>]*href=["']#(playlist\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const lineId = tab[1], panel = html.match(new RegExp('<div\\s+id=["\\\']' + lineId + '["\\\'][^>]*>([\\s\\S]*?)<\\/ul>', 'i'))?.[1] || '';
        const episodes = [];
        for (const episode of panel.matchAll(/<a\b([^>]*href=["'][^"']*\/play\/[^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
          const playId = absolute(attr(episode[1], 'href'));
          if (playId) episodes.push({id: lineId + '-' + episodes.length, name: strip(episode[2]) || String(episodes.length + 1), playId});
        }
        if (episodes.length) playGroups.push({id: lineId, name: strip(tab[2]) || '线路' + (playGroups.length + 1), episodes});
      }
      playGroups.sort((left, right) => Number(!text(left.name).includes('网盘')) - Number(!text(right.name).includes('网盘')));
      if (!playGroups.length) throw new Error('didahd.item-not-found');
      return {id, sourceKey, name, ...(poster ? {poster} : {}), description, playGroups};
    },

    async play(input) {
      const playPage = absolute(input.playId), playResponse = await request(playPage, {referer: BASE + '/'});
      const player = parsePlayerObject(playResponse.body), encoded = text(player.url);
      if (!encoded) throw new Error('didahd.play-unavailable');
      if (/^https?:\/\/(?:drive\.uc\.cn|pan\.quark\.cn|pan\.baidu\.com)\//i.test(encoded)) {
        return {
          sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: encoded,
          headers: Object.assign({'User-Agent': USER_AGENT, Referer: BASE + '/'}, sourceHeaders), parse: false,
        };
      }
      let rawUrl = '';
      try {
        const artUrl = BASE + '/static/player/artplayer/?url=' + encodeURIComponent(encoded);
        const art = await request(artUrl, {referer: playPage});
        const vkey = art.body.match(/const\s+playPageUrl\s*=\s*["']([^"']+)/i)?.[1] || '';
        const code = art.body.match(/const\s+secretKeySeed\s*=\s*["']([^"']+)/i)?.[1] || '';
        const timestamp = art.body.match(/const\s+timestamp\s*=\s*["']([^"']+)/i)?.[1] || '';
        if (!vkey || !code || !timestamp) throw new Error('didahd.player-metadata-missing');
        const now = Math.floor(Date.now() / 1000);
        const response = await request(SMART_PLAY, {
          method: 'POST', referer: art.url,
          headers: {Origin: BASE, 'Content-Type': 'application/json'},
          body: JSON.stringify({vkey, code, t: now, signature: md5(String(now))}),
        });
        const encrypted = text(JSON.parse(response.body).url), digest = md5(timestamp + SALT);
        rawUrl = dxplay.crypto.aesDecrypt({mode: 'cbc', base64: encrypted, key: digest.slice(16), iv: digest.slice(0, 16)});
      } catch (_) {}
      if (!/^https?:\/\//i.test(rawUrl)) {
        return {
          sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: playPage,
          headers: Object.assign({'User-Agent': USER_AGENT, Referer: BASE + '/'}, sourceHeaders), parse: true,
        };
      }
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: Object.assign({'User-Agent': USER_AGENT, Referer: BASE + '/'}, sourceHeaders), parse: false,
      };
    },

    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
