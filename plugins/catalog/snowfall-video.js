/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://v.xl.in.ua';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const GENRES = [['动作','dongzuo'],['爱情','aiqing'],['喜剧','xiju'],['科幻','kehuan'],['恐怖','kongbu'],['战争','zhanzheng'],['武侠','wuxia'],['魔幻','mohuan'],['剧情','juqing'],['动画','donghua'],['惊悚','jingsong'],['灾难','zainan'],['悬疑','xuanyi'],['犯罪','fanzui'],['纪录','jilu'],['古装','guzhuang'],['奇幻','qihuan'],['国语','guoyu'],['综艺','zongyi'],['美剧','meiju'],['韩剧','hanju'],['国产剧','guoju'],['日剧','riju'],['英剧','yingju'],['短剧','duanju']];
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length: 64}, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  let sourceKey = '', sourceHeaders = {};
  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes).match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => { const raw = text(value).trim(); if (/^https?:\/\//i.test(raw)) return raw; if (raw.startsWith('//')) return 'https:' + raw; return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : ''; };
  const headers = referer => Object.assign({'User-Agent': UA, Referer: referer || BASE + '/', 'Accept-Language': 'zh-CN,zh;q=0.9'}, sourceHeaders);
  const request = async (path, extraHeaders) => {
    const response = await dxplay.fetch({url: absolute(path), headers: Object.assign(headers(), extraHeaders || {})});
    if (response.status < 200 || response.status >= 300) throw new Error('snowfall-video.request-failed');
    return response;
  };
  const utf8 = value => { const encoded = encodeURIComponent(text(value)), bytes = []; for (let index = 0; index < encoded.length; index += 1) { if (encoded[index] === '%') { bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16)); index += 2; } else bytes.push(encoded.charCodeAt(index)); } return bytes; };
  const add32 = (...values) => values.reduce((sum, value) => (sum + (value >>> 0)) >>> 0, 0);
  const rotate = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;
  const md5 = value => {
    const bytes = utf8(value), bitLength = bytes.length * 8; bytes.push(128); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let index = 0; index < 8; index += 1) bytes.push(index < 4 ? (bitLength >>> (index * 8)) & 255 : (Math.floor(bitLength / 4294967296) >>> (index * 8 - 32)) & 255);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = Array.from({length: 16}, (_, index) => bytes[offset + index * 4] | (bytes[offset + index * 4 + 1] << 8) | (bytes[offset + index * 4 + 2] << 16) | (bytes[offset + index * 4 + 3] << 24));
      let a = a0, b = b0, c = c0, d = d0;
      for (let index = 0; index < 64; index += 1) { let f, word; if (index < 16) { f = (b & c) | (~b & d); word = index; } else if (index < 32) { f = (d & b) | (~d & c); word = (5 * index + 1) % 16; } else if (index < 48) { f = b ^ c ^ d; word = (3 * index + 5) % 16; } else { f = c ^ (b | ~d); word = (7 * index) % 16; } const oldD = d; d = c; c = b; b = add32(b, rotate(add32(a, f, MD5_CONSTANT[index], words[word]), MD5_SHIFT[index])); a = oldD; }
      a0 = add32(a0, a); b0 = add32(b0, b); c0 = add32(c0, c); d0 = add32(d0, d);
    }
    return [a0,b0,c0,d0].map(word => [0,8,16,24].map(shift => ((word >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
  };
  const base64Bytes = value => { const input = text(value).replace(/\s/g, ''), output = []; for (let index = 0; index < input.length; index += 4) { const a = B64.indexOf(input[index]), b = B64.indexOf(input[index + 1]), c = input[index + 2] === '=' ? -1 : B64.indexOf(input[index + 2]), d = input[index + 3] === '=' ? -1 : B64.indexOf(input[index + 3]); if (a < 0 || b < 0) throw new Error('snowfall-video.base64-invalid'); output.push((a << 2) | (b >>> 4)); if (c >= 0) output.push(((b & 15) << 4) | (c >>> 2)); if (d >= 0) output.push(((c & 3) << 6) | d); } return output; };
  const sign = (pid, timestamp) => { const raw = pid + '-' + timestamp, key = md5(raw).slice(0, 16), encrypted = dxplay.crypto.aesEncrypt({mode: 'ecb', text: raw, key}); return base64Bytes(encrypted).map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase(); };
  const cleanName = value => { const raw = strip(value), book = raw.match(/《(.+?)》/); return book ? book[1].trim() : raw; };
  const cards = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*href=["']\/[A-Za-z0-9]+\/\d+\.htm["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), parts = href.match(/^\/([A-Za-z0-9]+)\/(\d+)\.htm/i), id = parts ? parts[1] + '/' + parts[2] : '';
      if (!id || seen[id]) continue;
      const image = match[2].match(/<img\b([^>]*)>/i)?.[1] || '', name = cleanName(attr(match[1], 'title') || attr(image, 'alt') || match[2]);
      if (!name) continue;
      seen[id] = true;
      const poster = absolute(attr(image, 'data-original') || attr(image, 'data-src') || attr(image, 'src'));
      output.push({id, sourceKey, name, ...(poster && !/^data:/i.test(poster) ? {poster} : {})});
    }
    return output;
  };
  const page = (items, number) => ({page: number, pageCount: items.length ? number + 1 : number, items});

  dxplay.register({
    id: 'org.dxsrc.cluntop.snowfall-video', name: 'Snowfall video',
    description: 'Readable rewrite of the public Snowfall catalog, signed line API and direct media candidates.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'snowfall-video'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() { const featured = cards((await request('/')).body); return {categories: [['all0','电影'],['all1','剧集'],...GENRES.map(value => [value[1],value[0]])].map(value => ({id: value[0], name: value[1]})), featured}; },
    async category(input) {
      const number = Math.max(1, Number(input.page) || 1), id = text(input.categoryId), base = id.startsWith('all') ? '/s/all?type=' + id.slice(3) : '/s/' + encodeURIComponent(id), separator = base.includes('?') ? '&' : '?';
      return page(cards((await request(base + (number > 1 ? separator + 'page=' + number : ''))).body), number);
    },
    async search(input) { const number = Math.max(1, Number(input.page) || 1), found = cards((await request('/s/all?wd=' + encodeURIComponent(text(input.keyword)) + '&page=' + number)).body); return page(found, number); },
    async detail(input) {
      const id = text(input.id).replace(/^\/+|\.htm.*$/g, ''); if (!/^[A-Za-z0-9]+\/\d+$/.test(id)) throw new Error('snowfall-video.detail-invalid');
      const html = (await request('/' + id + '.htm')).body, numeric = id.split('/')[1], episodes = [], seen = Object.create(null);
      for (const match of html.matchAll(new RegExp('<a\\b([^>]*href=["\\\'][^"\\\']*\\/play\\/' + numeric + '-\\d+\\.htm[^"\\\']*["\\\'][^>]*)>([\\s\\S]*?)<\\/a>', 'gi'))) {
        const href = attr(match[1], 'href'), part = href.match(/-(\d+)\.htm/i)?.[1]; if (!href || seen[href]) continue; seen[href] = true; episodes.push({id: part || String(episodes.length + 1), name: strip(match[2]) || '第' + (episodes.length + 1) + '集', playId: href});
      }
      if (!episodes.length) episodes.push({id: '0', name: '播放', playId: '/play/' + numeric + '-0.htm'});
      const title = strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]), matched = title.match(/^(.*?)\s*[（(](\d{4})[)）]/), name = cleanName(matched ? matched[1] : title) || id;
      const image = html.match(/<img\b([^>]*(?:movie-poster|data-original)[^>]*)>/i)?.[1] || '', poster = absolute(attr(image, 'data-original') || attr(image, 'src'));
      const description = strip(html.match(/<div\b[^>]*class=["'][^"']*desc[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]).slice(0, 2000);
      return {id, sourceKey, name, ...(matched ? {year: matched[2]} : {}), ...(poster ? {poster} : {}), ...(description ? {description} : {}), playGroups: ['1','2','3'].map(line => ({id: line, name: '线路' + line, episodes: episodes.map(episode => ({...episode, id: line + ':' + episode.id, playId: episode.playId + ':' + line}))}))};
    },
    async play(input) {
      const encoded = text(input.playId), line = Math.max(0, Number(encoded.match(/:(\d+)$/)?.[1] || 1) - 1), pagePath = encoded.replace(/:\d+$/, ''), pageUrl = absolute(pagePath), pageResponse = await request(pageUrl), inner = pageResponse.body.match(/var\s+pid\s*=\s*(\d+)/i)?.[1] || pagePath.match(/\/play\/(\d+)-/i)?.[1];
      if (!inner) throw new Error('snowfall-video.play-invalid');
      const timestamp = Date.now(), headerValues = pageResponse.headers || {}, cookieValue = Object.keys(headerValues).find(key => key.toLowerCase() === 'set-cookie'), cookie = cookieValue ? text(headerValues[cookieValue]).split(';')[0] : '';
      const response = await request('/lines?t=' + timestamp + '&sg=' + sign(inner, timestamp) + '&pid=' + inner, Object.assign({'User-Agent': UA, Referer: pageUrl, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01'}, cookie ? {Cookie: cookie} : {}));
      let payload; try { payload = JSON.parse(response.body); } catch (_) { throw new Error('snowfall-video.lines-invalid'); }
      const data = payload.data || {}, candidates = [];
      for (const field of ['url3','m3u8_2']) for (const raw of text(data[field]).split(',')) { let value = raw.trim().replace(/https?:\/\/v\.xl01\.eu\.cc/gi, BASE).replace(/#.*$/, ''); if (value && !candidates.includes(value)) candidates.push(value); }
      const url = candidates[line] || candidates[0] || '';
      if (!/^https?:\/\//i.test(url)) throw new Error('snowfall-video.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': UA, Referer: BASE + '/'}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
