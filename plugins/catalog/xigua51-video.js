/* global dxplay */
(() => {
  'use strict';

  const BASE_URLS = [
    'https://nutkvpuvh.oozzvqhzt.cc',
    'https://emxhyyqylw.rigxwsgw.com',
    'https://ktotmwbfwp.oozzvqhzt.cc',
  ];
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
  let activeBase = BASE_URLS[0];
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&amp;/gi, '&').replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;|&#160;/gi, ' ');
  const clean = value => decode(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const first = (value, pattern, group = 1) => {
    const match = text(value).match(pattern);
    return match ? text(match[group]) : '';
  };
  const headers = base => ({
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'X-Requested-With': 'mark.via.gp',
    Origin: base,
    Referer: base + '/',
  });
  const normalizePath = value => {
    let path = decode(value).trim();
    for (const base of BASE_URLS) {
      if (path.startsWith(base)) { path = path.slice(base.length); break; }
    }
    if (!path.startsWith('/')) path = '/' + path;
    return path;
  };
  const request = async pathOrUrl => {
    const path = normalizePath(pathOrUrl);
    for (const base of [activeBase, ...BASE_URLS.filter(value => value !== activeBase)]) {
      try {
        const response = await dxplay.fetch({url: base + path, headers: headers(base)});
        const body = text(response.body);
        if (response.status >= 200 && response.status < 300 && body.length > 5000 && body.includes('</html>')) {
          activeBase = base;
          return body;
        }
      } catch (_error) {}
    }
    throw new Error('xigua51.request-failed');
  };
  const blocks = html => {
    const output = [];
    const marker = '<article';
    let offset = 0;
    while (output.length < 120) {
      const start = html.indexOf(marker, offset);
      if (start < 0) break;
      const next = html.indexOf(marker, start + marker.length);
      output.push(html.slice(start, next < 0 ? Math.min(html.length, start + 10000) : next));
      if (next < 0) break;
      offset = next;
    }
    return output;
  };
  const parseItems = html => {
    const output = [];
    const seen = Object.create(null);
    for (const block of blocks(text(html))) {
      const id = normalizePath(first(block, /<a[^>]*href=["'](\/archives\/\d+\/)["']/i));
      const name = clean(first(block, /<h2[^>]*class=["'][^"']*post-card-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i));
      if (!/^\/archives\/\d+\/$/.test(id) || !name || seen[id]) continue;
      seen[id] = true;
      const remark = clean(first(block, /itemprop=["']datePublished["'][^>]*>([\s\S]*?)<\/span>/i));
      output.push({id, sourceKey, name, ...(remark ? {remark} : {})});
    }
    return output;
  };
  const parseCategories = html => {
    const output = [];
    const seen = Object.create(null);
    const pattern = /<a[^>]*href=["'](\/category\/([^/"']+)\/)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(text(html))) !== null && output.length < 80) {
      const id = match[1], slug = match[2], name = clean(match[3]);
      if (!name || slug === 'mrdg' || seen[id]) continue;
      seen[id] = true;
      output.push({id, name});
    }
    return output;
  };
  const playerEntries = html => {
    const output = [];
    const pattern = /<div[^>]*class=["'][^"']*dplayer[^"']*["'][^>]*data-config='([^']+)'[^>]*>/gi;
    let match;
    while ((match = pattern.exec(text(html))) !== null && output.length < 32) {
      let config;
      try { config = JSON.parse(decode(match[1])); } catch (_error) { continue; }
      const url = text(config && config.video && config.video.url).replace(/\\\//g, '/').trim();
      if (!/^https?:\/\//i.test(url)) continue;
      output.push(url);
    }
    return output;
  };
  const splitPlayId = value => {
    const match = text(value).match(/^(\/archives\/\d+\/)@@(\d+)$/);
    if (!match) throw new Error('xigua51.play-invalid');
    return {path: match[1], index: Number(match[2])};
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.xigua51-video',
    name: '51 catalog',
    description: 'Readable rewrite of the reachable article catalog and its page-declared DPlayer HLS streams.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'xigua51-video';
      return {ready: true};
    },
    async home() {
      const html = await request('/');
      const categories = parseCategories(html);
      const featured = parseItems(html);
      if (!categories.length || !featured.length) throw new Error('xigua51.home-unavailable');
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const categoryId = normalizePath(input.categoryId);
      if (!/^\/category\/[^/]+\/$/.test(categoryId) || categoryId === '/category/mrdg/') {
        throw new Error('xigua51.category-invalid');
      }
      const path = page > 1 ? categoryId + page + '/' : categoryId;
      const items = parseItems(await request(path));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword || page > 1) return {page, pageCount: page, items: []};
      const items = parseItems(await request('/search/' + encodeURIComponent(keyword) + '/'));
      return {page, pageCount: page, items};
    },
    async detail(input) {
      const id = normalizePath(input.id);
      if (!/^\/archives\/\d+\/$/.test(id)) throw new Error('xigua51.item-invalid');
      const html = await request(id);
      const name = clean(first(html, /<h1[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
        || first(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
      const streams = playerEntries(html);
      if (!name || !streams.length) throw new Error('xigua51.detail-unavailable');
      const episodes = streams.map((_, index) => ({id: String(index + 1), name: '视频 ' + (index + 1), playId: id + '@@' + index}));
      return {id, sourceKey, name, playGroups: [{id: 'main', name: '51', episodes}]};
    },
    async play(input) {
      const target = splitPlayId(input.playId);
      const streams = playerEntries(await request(target.path));
      const rawUrl = streams[target.index];
      if (!rawUrl) throw new Error('xigua51.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: headers(activeBase), parse: false,
      };
    },
    async destroy() { sourceKey = ''; activeBase = BASE_URLS[0]; },
  });
})();
