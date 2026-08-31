/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.mochadj.com';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [['1','重生'],['2','穿越'],['3','爽剧'],['4','言情'],['5','都市'],['6','古装'],['7','悬疑'],['8','剧情']];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const headers = () => Object.assign({'User-Agent': USER_AGENT, Referer: BASE + '/'}, sourceHeaders);
  const decode = value => text(value).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(attributes.match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async path => {
    const response = await dxplay.fetch({url: absolute(path), headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('guoguo.request-failed');
    return response.body;
  };
  const items = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*class=["'][^"']*stui-vodlist__thumb[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const attributes = match[1], href = attr(attributes, 'href'), id = href.match(/\/dj\/(\d+)\.html/i)?.[1];
      if (!id || seen[id]) continue;
      const name = attr(attributes, 'title') || strip(match[2]);
      if (!name) continue;
      seen[id] = true;
      let poster = attr(attributes, 'data-original');
      if (!poster) poster = attributes.match(/background-image\s*:\s*url\(([^)]+)\)/i)?.[1]?.replace(/["']/g, '') || '';
      poster = absolute(poster.split('#')[0]);
      const remark = strip(match[2].match(/class=["'][^"']*pic-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
      output.push({id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})});
    }
    return output;
  };
  const metadata = (html, label) => strip(html.match(new RegExp('<span[^>]*>\\s*' + label + '：?<\\/span>([\\s\\S]*?)<\\/p>', 'i'))?.[1]);

  dxplay.register({
    id: 'org.dxsrc.jsm.guoguo-short',
    name: 'Guoguo short-drama catalog',
    description: 'Site-specific rewrite of the reachable Guoguo short-drama listing, episode pages and direct HLS playback.',
    version: '1.0.0', protocol: 'catalog@1',

    async init(input) { sourceKey = text(input.sourceKey) || 'guoguo-short'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() { return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: items(await request('/'))}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const values = items(await request('/i/' + encodeURIComponent(text(input.categoryId)) + '-' + page + '.html'));
      return {page, pageCount: values.length ? page + 1 : page, items: values};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: 1, items: []};
      try { return {page, pageCount: 1, items: items(await request('/search.php?searchword=' + encodeURIComponent(text(input.keyword))))}; }
      catch (_) { return {page, pageCount: 1, items: []}; }
    },
    async detail(input) {
      const id = text(input.id), html = await request('/dj/' + encodeURIComponent(id) + '.html');
      const name = strip(html.match(/<div[^>]*class=["'][^"']*stui-content__detail[^"']*["'][^>]*>[\s\S]*?<h1[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || id;
      const thumb = html.match(/<div[^>]*class=["'][^"']*stui-content__thumb[^"']*["'][^>]*>[\s\S]*?<a\b([^>]*)>/i)?.[1] || '';
      const poster = absolute(attr(thumb, 'data-original'));
      const groups = [];
      let line = 0;
      for (const playlist of html.matchAll(/<ul[^>]*class=["'][^"']*stui-content__playlist[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi)) {
        const episodes = [], seen = Object.create(null);
        for (const match of playlist[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
          const href = attr(match[1], 'href');
          if (!/\/play\/\d+-\d+-\d+\.html/i.test(href) || seen[href]) continue;
          seen[href] = true;
          episodes.push({id: String(episodes.length + 1), name: attr(match[1], 'title') || strip(match[2]) || String(episodes.length + 1), playId: href});
        }
        if (episodes.length) { line += 1; groups.push({id: 'line-' + line, name: '线路 ' + line, episodes}); }
      }
      if (!groups.length) throw new Error('guoguo.episodes-unavailable');
      return {id, sourceKey, name, ...(poster ? {poster} : {}), actors: metadata(html, '主演'), director: metadata(html, '导演'), area: metadata(html, '地区'), year: metadata(html, '年份'), description: strip(html.match(/class=["']detail-content["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]), playGroups: groups};
    },
    async play(input) {
      const html = await request(text(input.playId));
      const quoted = html.match(/\bvar\s+now\s*=\s*("(?:\\.|[^"\\])*")/i)?.[1];
      let url = '';
      try { url = quoted ? JSON.parse(quoted) : ''; } catch (_) {}
      if (!/^https?:\/\//i.test(url)) throw new Error('guoguo.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: headers(), parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
