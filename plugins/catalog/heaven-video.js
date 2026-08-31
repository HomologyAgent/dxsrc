/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://ysttv.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const CATEGORIES = [['movie','电影'],['teleplay','剧集'],['variety','综艺'],['anime','动漫'],['playlet','短剧']];
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
    if (response.status < 200 || response.status >= 300) throw new Error('heaven-video.request-failed');
    return response.body;
  };
  const items = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/detail\/\d+\/?[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), id = href.match(/\/detail\/(\d+)/i)?.[1];
      if (!id || seen[id]) continue;
      const image = match[2].match(/<img\b([^>]*)>/i)?.[1] || '';
      const name = attr(match[1], 'title') || attr(image, 'alt') || strip(match[2]);
      if (!name || !image) continue;
      seen[id] = true;
      const poster = absolute(attr(image, 'data-original') || attr(image, 'data-src') || attr(image, 'src'));
      output.push({id, sourceKey, name, ...(poster ? {poster} : {})});
    }
    return output;
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.heaven-video', name: 'Heaven video',
    description: 'Readable rewrite of the public Heaven catalog and direct media resolver.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'heaven-video'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() { return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: items(await request('/'))}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), base = '/vod/' + encodeURIComponent(text(input.categoryId));
      const found = items(await request(page === 1 ? base : base + '/p/' + page));
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      return {page, pageCount: 1, items: []};
    },
    async detail(input) {
      const id = text(input.id).replace(/\D/g, ''), html = await request('/detail/' + id + '/');
      const episodes = [], seen = Object.create(null);
      for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/player\/\d+\/[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
        const url = absolute(attr(match[1], 'href'));
        if (!url || seen[url]) continue;
        seen[url] = true; episodes.push({id: String(episodes.length + 1), name: strip(match[2]) || attr(match[1], 'title') || '第' + (episodes.length + 1) + '集', playId: url});
      }
      if (!episodes.length) episodes.push({id: '1', name: '正片', playId: BASE + '/player/' + id + '/'});
      const rawName = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || strip(html.match(/<title[^>]*>([^<]*)/i)?.[1]).split('-')[0].trim();
      const name = rawName.replace(/^《|》$/g, '') || id;
      const poster = absolute(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || html.match(/<img[^>]+(?:data-original|data-src)=["']([^"']+)/i)?.[1]);
      const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || '');
      return {id, sourceKey, name, ...(poster ? {poster} : {}), description, playGroups: [{id: 'heaven', name: '影视天堂', episodes}]};
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId)), html = (await request(pageUrl)).replace(/\\\//g, '/');
      let url = html.match(/var\s+now\s*=\s*["']([^"']+)/i)?.[1] || '';
      if (!url) {
        const raw = html.match(/var\s+player_\w+\s*=\s*(\{.*?\})\s*[;<]/s)?.[1];
        if (raw) { try { url = JSON.parse(raw).url || ''; } catch (_) {} }
      }
      if (!url) url = html.match(/https?:\/\/[^\s"'\\<>]+\.(?:m3u8|mp4)[^\s"'\\<>]*/i)?.[0] || '';
      if (!/^https?:\/\//i.test(url)) throw new Error('heaven-video.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': UA, Referer: pageUrl}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
