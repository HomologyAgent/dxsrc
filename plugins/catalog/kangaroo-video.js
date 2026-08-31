/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://dsystv.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const CATEGORIES = [['1','电影'],['2','电视剧'],['3','综艺'],['4','动漫'],['44','短剧']];
  let sourceKey = '', sourceHeaders = {};
  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes).match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async (path, options) => {
    const response = await dxplay.fetch({url: absolute(path), method: options?.method || 'GET', headers: Object.assign({'User-Agent': UA, Referer: BASE + '/'}, sourceHeaders, options?.headers || {}), ...(options?.body ? {body: options.body} : {})});
    if (response.status < 200 || response.status >= 300) throw new Error('kangaroo.request-failed');
    return response.body;
  };
  const meta = (html, name) => {
    for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
      const key = attr(match[1], 'property') || attr(match[1], 'name');
      if (key.toLowerCase() === name.toLowerCase()) return attr(match[1], 'content');
    }
    return '';
  };
  const items = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/movie\/index\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), id = href.match(/\/movie\/index(\d+)\.html/i)?.[1];
      if (!id || seen[id]) continue;
      const image = match[2].match(/<img\b([^>]*)>/i)?.[1] || '';
      const name = attr(match[1], 'title') || attr(image, 'alt').replace(/^《|》.*$/g, '') || strip(match[2]);
      if (!name) continue;
      seen[id] = true;
      const poster = absolute(attr(image, 'data-original') || attr(image, 'data-src') || attr(image, 'src'));
      output.push({id, sourceKey, name, ...(poster ? {poster} : {})});
    }
    return output;
  };
  const filters = [{key: 'order', name: '排序', initialValue: '', options: [['默认',''],['最近更新','time'],['总排行','hit'],['月排行','monthhit'],['周排行','weekhit'],['豆瓣评分','douban']].map(value => ({name: value[0], value: value[1]}))}];

  dxplay.register({
    id: 'org.dxsrc.cluntop.kangaroo-video', name: 'Kangaroo video',
    description: 'Readable rewrite of the public Kangaroo catalog, episode pages and direct media resolver.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'kangaroo-video'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() { return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1], filters})), featured: items(await request('/index.html'))}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), values = input.filters || {};
      let path = '/search.php?searchtype=5&tid=' + encodeURIComponent(text(input.categoryId)) + '&page=' + page;
      if (values.order) path += '&order=' + encodeURIComponent(text(values.order));
      const found = items(await request(path));
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1), keyword = text(input.keyword);
      let found = items(await request('/search.php?searchword=' + encodeURIComponent(keyword) + '&page=' + page));
      if (!found.length && page === 1) found = items(await request('/search.php', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'searchword=' + encodeURIComponent(keyword) + '&searchtype=1'}));
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async detail(input) {
      const id = text(input.id).replace(/\D/g, ''), html = await request('/movie/index' + id + '.html');
      const groups = Object.create(null), order = [];
      for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/play\/\d+-\d+-\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
        const href = attr(match[1], 'href'), parts = href.match(/\/play\/\d+-(\d+)-(\d+)\.html/i);
        if (!parts) continue;
        const sid = parts[1], episodeId = parts[2], name = attr(match[1], 'title') || strip(match[2]);
        if (!groups[sid]) { groups[sid] = []; order.push(sid); }
        if (!groups[sid].some(value => value.id === episodeId)) groups[sid].push({id: episodeId, name: /立即播放/.test(name) ? '正片' : name || '第' + (Number(episodeId) + 1) + '集', playId: absolute(href)});
      }
      if (!order.length) throw new Error('kangaroo.episodes-unavailable');
      const rawTitle = meta(html, 'og:title') || strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
      const name = rawTitle.match(/《([^》]+)》/)?.[1] || rawTitle.split('全集')[0].trim() || id;
      const poster = absolute(meta(html, 'og:image'));
      return {id, sourceKey, name, ...(poster ? {poster} : {}), description: meta(html, 'og:description') || meta(html, 'description'), playGroups: order.map(sid => ({id: sid, name: '线路' + (Number(sid) + 1), episodes: groups[sid]}))};
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId)), html = (await request(pageUrl)).replace(/\\\//g, '/');
      let url = html.match(/var\s+now\s*=\s*["']([^"']+)/i)?.[1] || '';
      if (!url) {
        const raw = html.match(/var\s+player_\w+\s*=\s*(\{.*?\})\s*[;<]/s)?.[1];
        if (raw) { try { url = JSON.parse(raw).url || ''; } catch (_) {} }
      }
      if (!url) url = html.match(/https?:\/\/[^\s"'\\<>]+\.(?:m3u8|mp4)[^\s"'\\<>]*/i)?.[0] || '';
      if (!/^https?:\/\//i.test(url)) throw new Error('kangaroo.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': UA, Referer: pageUrl}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
