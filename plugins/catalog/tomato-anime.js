/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://www.fqdm.cc';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const CATEGORIES = [['1','日韩动漫'],['2','国产动漫'],['3','港台动漫'],['4','欧美动漫'],['5','动漫综合']];
  let sourceKey = '', sourceHeaders = {};
  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes).match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async path => {
    const response = await dxplay.fetch({url: absolute(path), headers: Object.assign({'User-Agent': UA, Referer: BASE + '/'}, sourceHeaders)});
    if (response.status < 200 || response.status >= 300) throw new Error('tomato-anime.request-failed');
    return response.body;
  };
  const items = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/vod\/detail\/id\/\d+[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), id = href.match(/\/detail\/id\/(\d+)/i)?.[1];
      if (!id || seen[id]) continue;
      const image = match[2].match(/<img\b([^>]*)>/i)?.[1] || '';
      const name = attr(image, 'alt') || attr(match[1], 'title') || strip(match[2]);
      if (!name || !image) continue;
      seen[id] = true;
      const poster = absolute(attr(image, 'data-original') || attr(image, 'data-src') || attr(image, 'src'));
      output.push({id, sourceKey, name, ...(poster ? {poster} : {})});
    }
    return output;
  };
  const decodeBase64 = value => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bits = 0, count = 0, output = '';
    for (const char of text(value).replace(/[^A-Za-z0-9+/]/g, '')) {
      bits = (bits << 6) | alphabet.indexOf(char); count += 6;
      if (count >= 8) { count -= 8; output += String.fromCharCode((bits >> count) & 255); }
    }
    try { return decodeURIComponent(Array.from(output, char => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join('')); } catch (_) { return output; }
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.tomato-anime', name: 'Tomato anime',
    description: 'Readable rewrite of the public Tomato animation catalog, episodes and direct HLS resolver.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'tomato-anime'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() { return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: items(await request('/'))}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), id = encodeURIComponent(text(input.categoryId));
      const path = page === 1 ? '/index.php/vod/type/id/' + id + '.html' : '/index.php/vod/type/id/' + id + '/page/' + page + '.html';
      const found = items(await request(path));
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const found = items(await request('/index.php/vod/search/page/' + page + '/wd/' + encodeURIComponent(text(input.keyword)) + '.html'));
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async detail(input) {
      const id = text(input.id).replace(/\D/g, ''), html = await request('/index.php/vod/detail/id/' + id + '.html');
      const groups = Object.create(null), order = [];
      for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/vod\/play\/id\/\d+\/sid\/\d+\/nid\/\d+[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
        const href = attr(match[1], 'href'), parts = href.match(/\/sid\/(\d+)\/nid\/(\d+)/i);
        if (!parts) continue;
        const sid = parts[1], episodeId = sid + ':' + parts[2], name = strip(match[2]) || attr(match[1], 'title').replace(/^播放/, '');
        if (/立即播放|立刻播放/.test(name)) continue;
        if (!groups[sid]) { groups[sid] = []; order.push(sid); }
        if (!groups[sid].some(value => value.id === episodeId)) groups[sid].push({id: episodeId, name: name || '第' + parts[2] + '集', playId: href});
      }
      if (!order.length) throw new Error('tomato-anime.episodes-unavailable');
      const name = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || id;
      const poster = absolute(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || html.match(/<img[^>]+(?:data-original|data-src)=["']([^"']+)/i)?.[1]);
      const description = strip(decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || '')).slice(0, 2000);
      return {id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}), playGroups: order.slice(0, 3).map(sid => ({id: sid, name: '线路' + sid, episodes: groups[sid]}))};
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId)), html = (await request(pageUrl)).replace(/\\\//g, '/');
      const raw = html.match(/player_aaaa\s*=\s*(\{.*?\})\s*<\/script>/s)?.[1] || html.match(/player_aaaa\s*=\s*(\{.*?\})\s*;/s)?.[1];
      let url = '', encrypt = 0;
      if (raw) { try { const value = JSON.parse(raw); url = text(value.url); encrypt = Number(value.encrypt) || 0; } catch (_) {} }
      if (encrypt === 1) url = decodeURIComponent(url);
      if (encrypt === 2) url = decodeURIComponent(decodeBase64(url));
      if (!/^https?:\/\//i.test(url)) url = html.match(/https?:\/\/[^\s"'\\<>]+\.(?:m3u8|mp4)[^\s"'\\<>]*/i)?.[0] || '';
      if (!/^https?:\/\//i.test(url)) throw new Error('tomato-anime.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': UA, Referer: pageUrl}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
