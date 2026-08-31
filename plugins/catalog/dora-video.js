/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.dora-video.cn';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [['0','全部'],['20','动画'],['21','剧场版'],['22','MV'],['23','预告片'],['27','直播'],['25','同人'],['26','民间'],['28','目录'],['30','中篇']];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const headers = extra => Object.assign({'User-Agent': USER_AGENT, Referer: BASE + '/'}, sourceHeaders, extra || {});
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
  const request = async (url, options) => {
    const response = await dxplay.fetch({url: absolute(url), method: options?.method || 'GET', headers: headers(options?.headers), ...(options?.body ? {body: options.body} : {})});
    if (response.status < 200 || response.status >= 300) throw new Error('dora.request-failed');
    return response.body;
  };
  const items = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/archives\/\d+\/?["'][^>]*)>\s*<img\b([^>]*)>/gi)) {
      const href = attr(match[1], 'href'), id = href.match(/\/archives\/(\d+)\//i)?.[1];
      if (!id || seen[id]) continue;
      const name = attr(match[2], 'alt') || attr(match[1], 'title');
      if (!name) continue;
      seen[id] = true;
      const poster = absolute(attr(match[2], 'data-url') || attr(match[2], 'data-original') || attr(match[2], 'src'));
      const nearby = html.slice(match.index, Math.min(html.length, match.index + 800));
      const remark = strip(nearby.match(/class=["']zhuangtai["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
      output.push({id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})});
      if (output.length >= 120) break;
    }
    return output;
  };
  const categoryUrl = id => BASE + '/search/sy/?niandai=&cat=&tag=' + encodeURIComponent(id) + '&gaojijiansuo=1&zhuangtai=';

  dxplay.register({
    id: 'org.dxsrc.jsm.dora-video',
    name: 'Doraemon video catalog',
    description: 'Site-specific rewrite of the reachable Doraemon catalog, episode pages and their direct HLS resolver.',
    version: '1.0.0', protocol: 'catalog@1',

    async init(input) { sourceKey = text(input.sourceKey) || 'dora-video'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() { return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: items(await request('/'))}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: 1, items: []};
      return {page, pageCount: 1, items: items(await request(categoryUrl(text(input.categoryId))))};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: 1, items: []};
      try {
        const html = await request('/', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 's=' + encodeURIComponent(text(input.keyword))});
        return {page, pageCount: 1, items: items(html)};
      } catch (_) { return {page, pageCount: 1, items: []}; }
    },
    async detail(input) {
      const id = text(input.id), html = await request('/archives/' + encodeURIComponent(id) + '/');
      const name = strip(html.match(/<title[^>]*>([^<]*)/i)?.[1].split(' - ')[0]) || id;
      const posterAttributes = html.match(/class=["'][^"']*card-img-post[^"']*["'][^>]*>[\s\S]*?<img\b([^>]*)>/i)?.[1]
        || html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || '';
      const poster = typeof posterAttributes === 'string' && posterAttributes.includes('=')
        ? absolute(attr(posterAttributes, 'data-url') || attr(posterAttributes, 'src')) : absolute(posterAttributes);
      const episodes = [];
      for (const block of html.matchAll(/<div[^>]*class=["'][^"']*card-body button-list[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)) {
        for (const match of block[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
          const url = absolute(attr(match[1], 'href'));
          if (!/\/archives\/\d+\/\?action=get&p=\d+/i.test(url)) continue;
          episodes.push({id: String(episodes.length + 1), name: strip(match[2]) || String(episodes.length + 1), playId: url});
        }
      }
      if (!episodes.length) throw new Error('dora.episodes-unavailable');
      return {id, sourceKey, name, ...(poster ? {poster} : {}), description: decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || ''), playGroups: [{id: 'dora', name: '哆啦视频', episodes}]};
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId)), html = await request(pageUrl);
      const frame = absolute(html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1] || '');
      if (!frame) throw new Error('dora.resolver-unavailable');
      const player = await request(frame, {headers: {Referer: pageUrl}});
      const url = decode(player.match(/\bvideo\s*:\s*\{[\s\S]*?\burl\s*:\s*["']([^"']+)["']/i)?.[1] || player.match(/https?:\/\/[^"'<>\s]+\.m3u8[^"'<>\s]*/i)?.[0] || '');
      if (!/^https?:\/\//i.test(url)) throw new Error('dora.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: headers({Referer: frame}), parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
