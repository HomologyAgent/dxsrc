/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_HOST = 'https://www1.ikanbot.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORY_OPTIONS = {
    'hot/index-movie-热门': ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '成长', '豆瓣top250'],
    'hot/index-tv-热门': ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'],
  };
  let sourceKey = '';
  let baseUrl = DEFAULT_HOST;
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const absolute = value => {
    const url = text(value);
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return url ? baseUrl + (url.startsWith('/') ? url : '/' + url) : '';
  };
  const headers = extra => Object.assign({'User-Agent': USER_AGENT, Referer: baseUrl}, sourceHeaders, extra || {});
  const request = async (path, extraHeaders) => {
    const url = /^https?:\/\//i.test(text(path)) ? text(path) : absolute(path);
    const response = await dxplay.fetch({url, headers: headers(extraHeaders)});
    if (response.status < 200 || response.status >= 300) throw new Error('ikanbot.request-failed');
    return response.body;
  };
  const attribute = (attributes, name) => {
    const match = text(attributes).match(new RegExp('(?:^|\\s)' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'));
    return match ? match[1] : '';
  };
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
  const cardItems = html => {
    const output = [];
    const seen = Object.create(null);
    const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const cssClass = attribute(match[1], 'class');
      const id = attribute(match[1], 'href');
      if (!/(?:^|\s)item(?:\s|$)/.test(cssClass) || !/^\/play\/\d+/.test(id) || seen[id]) continue;
      const image = match[2].match(/<img\b([^>]*)>/i);
      const paragraph = match[2].match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
      const name = clean(paragraph && paragraph[1]) || clean(image && attribute(image[1], 'alt'));
      const poster = absolute(image && (attribute(image[1], 'data-src') || attribute(image[1], 'src')));
      if (!name) continue;
      seen[id] = true;
      output.push({id, sourceKey, name, ...(poster ? {poster} : {})});
    }
    return output;
  };
  const searchItems = html => {
    const output = [];
    const seen = Object.create(null);
    const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let pending = null;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const cssClass = attribute(match[1], 'class');
      const href = attribute(match[1], 'href');
      if (/(?:^|\s)cover-link(?:\s|$)/.test(cssClass) && /^\/play\/\d+/.test(href)) {
        const image = match[2].match(/<img\b([^>]*)>/i);
        pending = {id: href, poster: absolute(image && (attribute(image[1], 'data-src') || attribute(image[1], 'src')))};
      } else if (pending && /(?:^|\s)title-text(?:\s|$)/.test(cssClass)) {
        const name = clean(match[2]).replace(/\s+\d{4}\s*$/, '').trim();
        if (name && !seen[pending.id]) {
          seen[pending.id] = true;
          output.push({id: pending.id, sourceKey, name, ...(pending.poster ? {poster: pending.poster} : {})});
        }
        pending = null;
      }
    }
    return output;
  };
  const hiddenValues = html => {
    const output = Object.create(null);
    const pattern = /<input\b([^>]*)>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const id = attribute(match[1], 'id');
      if (id) output[id] = attribute(match[1], 'value');
    }
    return output;
  };
  const tokenFor = (id, original) => {
    let token = original;
    let output = '';
    for (const digit of id.slice(-4)) {
      const offset = Number(digit) % 3;
      output += token.slice(offset + 1, offset + 9);
      token = token.slice(offset + 9);
    }
    return output;
  };
  const filter = categoryId => {
    const prefix = categoryId.startsWith('hot/index-movie') ? 'hot/index-movie-'
      : categoryId.startsWith('hot/index-tv') ? 'hot/index-tv-' : '';
    const values = CATEGORY_OPTIONS[categoryId];
    if (!prefix || !values) return [];
    return [{
      key: 'cateId', name: '分类', initialValue: categoryId,
      options: values.map(name => ({name, value: prefix + name})),
    }];
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.ikanbot',
    name: 'Ikanbot catalog',
    description: 'Semantic rewrite of the public Ikanbot movie and TV HTML catalog, resource lines and direct playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'ikanbot';
      sourceHeaders = object(input.headers);
      const extension = input.extension;
      baseUrl = text(typeof extension === 'string' ? extension.split('[')[0] : object(extension).url) || DEFAULT_HOST;
      baseUrl = baseUrl.replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('ikanbot.configuration-invalid');
      return {ready: true};
    },
    async home() {
      const movieFilters = filter('hot/index-movie-热门');
      const televisionFilters = filter('hot/index-tv-热门');
      const categories = [
        {id: 'hot/index-movie-热门', name: '电影', filters: movieFilters},
        {id: 'hot/index-tv-热门', name: '剧集', filters: televisionFilters},
      ];
      return {categories, featured: cardItems(await request('/'))};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const categoryId = text(object(input.filters).cateId) || text(input.categoryId);
      if (!categoryId) return {page, pageCount: page, items: []};
      const encodedCategory = categoryId.split('/').map(part => encodeURIComponent(part)).join('/');
      const path = '/' + encodedCategory + (page > 1 ? '-p-' + page : '') + '.html';
      const items = cardItems(await request(path));
      return {page, ...(items.length ? {pageCount: page + 1} : {pageCount: page}), items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const suffix = page > 1 ? '&p=' + page : '';
      const items = searchItems(await request('/search?q=' + encodeURIComponent(text(input.keyword)) + suffix));
      return {page, ...(items.length ? {pageCount: page + 1} : {pageCount: page}), items};
    },
    async detail(input) {
      const path = text(input.id);
      if (!/^\/play\/\d+/.test(path)) throw new Error('ikanbot.item-invalid');
      const html = await request(path);
      const hidden = hiddenValues(html);
      const id = text(hidden.current_id);
      const type = text(hidden.mtype);
      const token = text(hidden.e_token);
      if (!id || !type || !token) throw new Error('ikanbot.detail-invalid');
      const detailBlock = (html.match(/<div\b[^>]*class=["'][^"']*detail[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
      const detailNodes = [];
      const metaPattern = /<h[1-6]\b[^>]*class=["'][^"']*meta[^"']*["'][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
      let metaMatch;
      while ((metaMatch = metaPattern.exec(detailBlock)) !== null) detailNodes.push(clean(metaMatch[1]));
      const imageMatch = html.match(new RegExp('<img\\b([^>]*\\bid=["\\\']' + id + '["\\\'][^>]*)>', 'i'));
      const poster = absolute(imageMatch && (attribute(imageMatch[1], 'data-src') || attribute(imageMatch[1], 'src')));
      const name = detailNodes[0] || clean(imageMatch && attribute(imageMatch[1], 'alt')) || id;
      const response = await request('/api/getResN?videoId=' + encodeURIComponent(id)
        + '&mtype=' + encodeURIComponent(type) + '&token=' + encodeURIComponent(tokenFor(id, token)), {
        Accept: '*/*', Referer: absolute(path), 'X-Requested-With': 'XMLHttpRequest',
      });
      let values;
      try { values = JSON.parse(response).data.list; }
      catch (_) { throw new Error('ikanbot.lines-invalid'); }
      const playGroups = (Array.isArray(values) ? values : []).map((line, groupIndex) => {
        let episodes;
        try { episodes = JSON.parse(text(line.resData)); }
        catch (_) { episodes = []; }
        const flag = text(episodes[0] && episodes[0].flag) || 'line-' + (groupIndex + 1);
        return {
          id: flag,
          name: flag.replace(/m3u8/gi, '线路'),
          episodes: episodes.map((episode, episodeIndex) => {
            const raw = text(episode.url).replace(new RegExp('\\$' + flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:#|$)', 'g'), '');
            const split = raw.indexOf('$');
            const playId = split >= 0 ? raw.slice(split + 1) : raw;
            return /^https?:\/\//i.test(playId) ? {id: String(episodeIndex + 1), name: split >= 0 ? raw.slice(0, split) : String(episodeIndex + 1), playId} : null;
          }).filter(Boolean),
        };
      }).filter(group => group.episodes.length);
      if (!playGroups.length) throw new Error('ikanbot.episodes-unavailable');
      return {
        id: path, sourceKey, name, ...(poster ? {poster} : {}),
        year: text(detailNodes[2]),
        area: text(detailNodes[3]),
        actors: text(detailNodes[4]),
        headers: {'User-Agent': USER_AGENT}, playGroups,
      };
    },
    async play(input) {
      const url = text(input.playId);
      if (!/^https?:\/\//i.test(url)) throw new Error('ikanbot.play-invalid');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': USER_AGENT}, parse: false};
    },
    async destroy() { sourceKey = ''; baseUrl = DEFAULT_HOST; sourceHeaders = {}; },
  });
})();
