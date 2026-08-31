/* global dxplay */
(() => {
  'use strict';

  const BASE_URL = 'https://600kk.net';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const SORTS = [
    ['post_date', '最新'], ['video_viewed', '热门'], ['rating', '最受欢迎'], ['duration', '最长'],
  ];
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&amp;/gi, '&').replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;|&#160;/gi, ' ');
  const clean = value => decode(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const absolute = value => {
    const raw = decode(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE_URL + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const first = (value, pattern, group = 1) => {
    const match = text(value).match(pattern);
    return match ? text(match[group]) : '';
  };
  const blocks = html => {
    const marker = 'thumb thumb--videos';
    const output = [];
    let offset = 0;
    while (output.length < 120) {
      const start = html.indexOf(marker, offset);
      if (start < 0) break;
      const next = html.indexOf(marker, start + marker.length);
      output.push(html.slice(start, next < 0 ? Math.min(html.length, start + 6000) : next));
      if (next < 0) break;
      offset = next;
    }
    return output;
  };
  const request = async path => {
    const response = await dxplay.fetch({
      url: absolute(path),
      headers: {'User-Agent': USER_AGENT, Referer: BASE_URL + '/'},
    });
    if (response.status < 200 || response.status >= 300) throw new Error('owo.request-failed');
    return response.body;
  };
  const parseItems = html => {
    const output = [];
    const seen = Object.create(null);
    for (const block of blocks(html)) {
      const tag = first(block, /<a[^>]*href=["']([^"']*\/video\/[^"']+)["'][^>]*>/i, 0);
      const id = absolute(first(tag, /href=["']([^"']+)/i));
      const name = clean(first(tag, /title=["']([^"']+)/i)
        || first(block, /class=["'][^"']*thumb-spot__title[^"']*["'][^>]*>([\s\S]*?)<\/h\d>/i));
      if (!id || !name || seen[id]) continue;
      seen[id] = true;
      const image = first(block, /<img[^>]*>/i, 0);
      const poster = absolute(first(image, /(?:data-original|data-src|src)=["']([^"']+)/i));
      const duration = clean(first(block, /class=["'][^"']*thumb-spot__data[^"']*["'][^>]*>[\s\S]*?<li[^>]*>([\s\S]*?)<\/li>/i));
      output.push({id, sourceKey, name, ...(poster ? {poster} : {}), ...(duration ? {remark: duration} : {})});
    }
    return output;
  };
  const pagePath = (page, sort) => '/videos/' + (page > 1 ? page + '/' : '') + (sort ? '?by=' + encodeURIComponent(sort) : '');

  dxplay.register({
    id: 'org.dxsrc.cluntop.owo-video',
    name: 'OWO video catalog',
    description: 'Readable rewrite of the reachable OWO video list, search and page-declared MP4 playback flow.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'owo-video';
      return {ready: true};
    },
    async home() {
      const filters = [{
        key: 'by', name: '排序', initialValue: 'post_date',
        options: SORTS.map(value => ({value: value[0], name: value[1]})),
      }];
      return {
        categories: [{id: 'videos', name: '视频', filters}],
        featured: parseItems(await request(pagePath(1, 'post_date'))),
      };
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const filters = input.filters && typeof input.filters === 'object' ? input.filters : {};
      const allowed = SORTS.some(value => value[0] === text(filters.by)) ? text(filters.by) : 'post_date';
      const items = parseItems(await request(pagePath(page, allowed)));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const path = '/search/' + encodeURIComponent(keyword) + '/' + (page > 1 ? page + '/' : '');
      const items = parseItems(await request(path));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = absolute(text(input.id));
      if (!/\/video\//i.test(id)) throw new Error('owo.item-invalid');
      const html = await request(id);
      const name = clean(first(html, /<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
        || first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
        || first(html, /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/i));
      const poster = absolute(first(html, /preview_url\s*:\s*["']([^"']+)/i)
        || first(html, /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/i));
      const description = clean(first(html, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i));
      if (!name) throw new Error('owo.detail-unavailable');
      return {
        id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}),
        playGroups: [{id: 'main', name: 'OWO', episodes: [{id: '1', name: '正片', playId: id}]}],
      };
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId));
      const html = await request(pageUrl);
      const rawUrl = absolute(first(html, /video_url\s*:\s*["']([^"']+)["']/i).replace(/\\\//g, '/'));
      if (!/^https?:\/\//i.test(rawUrl) || !/\.mp4(?:$|[/?#])/i.test(rawUrl)) throw new Error('owo.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: {'User-Agent': USER_AGENT, Referer: BASE_URL + '/'}, parse: false,
      };
    },
    async destroy() { sourceKey = ''; },
  });
})();
