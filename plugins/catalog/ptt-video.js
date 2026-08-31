/* global dxplay */
(() => {
  'use strict';

  const BASE_URL = 'https://ptt.red';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
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
  const absolute = value => {
    const raw = decode(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    return BASE_URL + (raw.startsWith('/') ? raw : '/' + raw);
  };
  const itemId = value => {
    const raw = text(value).trim();
    if (/^\d+$/.test(raw)) return raw;
    const match = raw.match(/(?:https?:\/\/[^/]+)?\/(\d+)(?:\/|$)/);
    return match ? match[1] : '';
  };
  const headers = () => ({
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: BASE_URL + '/',
  });
  const request = async path => {
    const url = /^https?:\/\//i.test(text(path)) ? text(path) : absolute(path);
    const response = await dxplay.fetch({url, headers: headers()});
    const body = text(response.body);
    if (response.status < 200 || response.status >= 300 || body.length < 1000) {
      throw new Error('ptt.request-failed');
    }
    return body;
  };
  const cardBlocks = html => {
    const output = [];
    const marker = '<div class="card">';
    let offset = 0;
    while (output.length < 120) {
      const start = html.indexOf(marker, offset);
      if (start < 0) break;
      const next = html.indexOf(marker, start + marker.length);
      output.push(html.slice(start, next < 0 ? Math.min(html.length, start + 7000) : next));
      if (next < 0) break;
      offset = next;
    }
    return output;
  };
  const parseItems = html => {
    const output = [];
    const seen = Object.create(null);
    for (const block of cardBlocks(text(html))) {
      const href = first(block, /<a[^>]*class=["'][^"']*visited[^"']*["'][^>]*href=["']([^"']+)["']/i)
        || first(block, /<a[^>]*href=["'](\/\d+)["'][^>]*>\s*<img/i);
      const id = itemId(href);
      const imageTag = first(block, /(<img[^>]*class=["'][^"']*card-img-top[^"']*["'][^>]*>)/i);
      const name = clean(first(imageTag, /\balt=["']([^"']+)["']/i));
      if (!id || !name || seen[id]) continue;
      seen[id] = true;
      const poster = absolute(first(imageTag, /\bsrc=["']([^"']+)["']/i));
      const remark = clean(first(block, /<span[^>]*class=["'][^"']*badge-success[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
      output.push({id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})});
    }
    return output;
  };
  const parseCategories = html => {
    const output = [];
    const seen = Object.create(null);
    const pattern = /<a[^>]*class=["'][^"']*px-2\s+px-sm-3\s+py-2\s+nav-link[^"']*["'][^>]*href=["']\/p\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(text(html))) !== null && output.length < 40) {
      const id = match[1], name = clean(match[2]);
      if (!name || seen[id]) continue;
      seen[id] = true;
      output.push({id, name});
    }
    return output;
  };
  const routeEntries = (html, id) => {
    const output = [];
    const seen = Object.create(null);
    const pattern = new RegExp('<a[^>]*href=["\\\']\\/' + id + '\\/\\d+\\/(\\d+)["\\\'][^>]*title=["\\\']([^"\\\']*)["\\\'][^>]*>([\\s\\S]*?)<\\/a>', 'gi');
    let match;
    while ((match = pattern.exec(text(html))) !== null && output.length < 24) {
      const routeId = match[1];
      if (seen[routeId]) continue;
      seen[routeId] = true;
      output.push({id: routeId, name: clean(match[3]) || clean(match[2]) || ('线路 ' + (output.length + 1))});
    }
    return output;
  };
  const episodeEntries = (html, id) => {
    const output = [];
    const seen = Object.create(null);
    const pattern = new RegExp('<a[^>]*class=["\\\'][^"\\\']*seq\\s+border[^"\\\']*["\\\'][^>]*href=["\\\']\\/' + id + '\\/(\\d+)\\/(\\d+)["\\\'][^>]*>([\\s\\S]*?)<\\/a>', 'gi');
    let match;
    while ((match = pattern.exec(text(html))) !== null && output.length < 500) {
      const episodeId = match[1];
      if (seen[episodeId]) continue;
      seen[episodeId] = true;
      output.push({id: episodeId, name: clean(match[3]) || episodeId});
    }
    return output;
  };
  const mediaUrl = html => {
    const raw = first(html, /["']contentUrl["']\s*:\s*["']([^"']+)["']/i)
      || first(html, /<source[^>]*\bsrc=["']([^"']+)["']/i);
    return decode(raw).replace(/\\\//g, '/').trim();
  };
  const splitPlayId = value => {
    const match = text(value).match(/^(\d+)\/(\d+)\/(\d+)$/);
    if (!match) throw new Error('ptt.play-invalid');
    return {id: match[1], episodeId: match[2], routeId: match[3]};
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.ptt-video',
    name: 'PTT catalog',
    description: 'Readable rewrite of the public PTT catalog, its episode routes and page-declared HLS media.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'ptt-video';
      return {ready: true};
    },
    async home() {
      const html = await request('/');
      const categories = parseCategories(html);
      const featured = parseItems(html);
      if (!categories.length || !featured.length) throw new Error('ptt.home-unavailable');
      return {categories, featured};
    },
    async category(input) {
      const categoryId = text(input.categoryId).trim();
      const page = Math.max(1, Number(input.page) || 1);
      if (!/^\d+$/.test(categoryId)) throw new Error('ptt.category-invalid');
      const items = parseItems(await request('/p/' + categoryId + '?page=' + page));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const items = parseItems(await request('/q/' + encodeURIComponent(keyword) + '?page=' + page));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = itemId(input.id);
      if (!id) throw new Error('ptt.item-invalid');
      const html = await request('/' + id + '/1');
      const name = clean(first(html, /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
        || first(html, /<title[^>]*>([\s\S]*?)<\/title>/i)).replace(/\s*[-–]\s*追劇大師[\s\S]*$/i, '');
      const poster = absolute(first(html, /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i));
      const description = clean(first(html, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i));
      const routes = routeEntries(html, id);
      const episodes = episodeEntries(html, id);
      if (!name || !routes.length || !episodes.length) throw new Error('ptt.detail-unavailable');
      const playGroups = routes.map(route => ({
        id: route.id,
        name: route.name,
        episodes: episodes.map(episode => ({
          id: episode.id,
          name: episode.name,
          playId: id + '/' + episode.id + '/' + route.id,
        })),
      }));
      return {id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}), playGroups};
    },
    async play(input) {
      const target = splitPlayId(input.playId);
      const rawUrl = mediaUrl(await request('/' + target.id + '/' + target.episodeId + '/' + target.routeId));
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('ptt.play-unavailable');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId) || target.episodeId,
        rawUrl,
        headers: headers(),
        parse: false,
      };
    },
    async destroy() { sourceKey = ''; },
  });
})();
