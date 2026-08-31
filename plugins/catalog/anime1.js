/* global dxplay */
(() => {
  'use strict';

  const SITE = 'https://anime1.me';
  const PLAY_API = 'https://v.anime1.me/api';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  let sourceKey = '';
  let catalog = [];

  const text = value => value === undefined || value === null ? '' : String(value);
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
  const absolute = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? SITE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async (url, options) => {
    const input = options || {};
    const response = await dxplay.fetch({
      url: absolute(url),
      method: input.method || 'GET',
      headers: Object.assign({'User-Agent': USER_AGENT, Referer: SITE + '/'}, input.headers || {}),
      ...(input.body === undefined ? {} : {body: input.body}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('anime1.request-failed');
    return response;
  };
  const loadCatalog = async () => {
    if (catalog.length) return catalog;
    const response = await request('/animelist.json');
    let payload;
    try { payload = JSON.parse(response.body); } catch (_) { throw new Error('anime1.response-invalid'); }
    catalog = (Array.isArray(payload) ? payload : []).map(value => ({
      id: text(value[0]),
      sourceKey,
      name: text(value[1] || value[0]),
      remark: [text(value[2]), text(value[3])].filter(Boolean).join(' · '),
    })).filter(value => value.id && value.name);
    return catalog;
  };
  const articleEpisodes = html => {
    const episodes = [];
    const pattern = /<article\b[^>]*>([\s\S]*?)(?=<article\b|$)/gi;
    let match;
    while ((match = pattern.exec(html)) !== null && episodes.length < 1000) {
      const title = match[1].match(/class=["'][^"']*entry-title[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!title) continue;
      const href = absolute(title[1]);
      if (!href) continue;
      episodes.push({id: String(episodes.length + 1), name: clean(title[2]) || String(episodes.length + 1), playId: href});
    }
    return episodes;
  };
  const searchItems = html => {
    const items = [];
    const seen = Object.create(null);
    const pattern = /<article\b[^>]*>([\s\S]*?)(?=<article\b|$)/gi;
    let match;
    while ((match = pattern.exec(html)) !== null && items.length < 100) {
      const category = match[1].match(/class=["'][^"']*cat-links[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!category) continue;
      const href = absolute(category[1]);
      const id = (href.match(/[?&]cat=(\d+)/i) || [])[1] || href;
      if (!id || seen[id]) continue;
      seen[id] = true;
      items.push({id, sourceKey, name: clean(category[2]) || id});
    }
    return items;
  };

  dxplay.register({
    id: 'org.dxsrc.xptv.anime1',
    name: 'Anime1 catalog',
    description: 'Readable DXPlay rewrite of the XPTV Anime1 static catalog, episode pages and cookie-bound media API.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'anime1';
      catalog = [];
      return {ready: true};
    },

    async home() {
      const values = await loadCatalog();
      return {categories: [{id: 'all', name: '全部动画'}], featured: values.slice(0, 40)};
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const values = await loadCatalog();
      const items = values.slice((page - 1) * 100, page * 100);
      return {page, pageCount: page * 100 < values.length ? page + 1 : page, items};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const response = await request('/page/' + page + '?s=' + encodeURIComponent(keyword));
      const items = searchItems(response.body);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },

    async detail(input) {
      const rawId = text(input.id);
      const id = (rawId.match(/[?&]cat=(\d+)/i) || [])[1] || rawId;
      const response = await request(/^https?:\/\//i.test(rawId) ? rawId : '/?cat=' + encodeURIComponent(id));
      const episodes = articleEpisodes(response.body);
      const known = (await loadCatalog()).find(value => value.id === id);
      if (!episodes.length) throw new Error('anime1.item-not-found');
      return {
        id,
        sourceKey,
        name: known ? known.name : clean((response.body.match(/<title[^>]*>([^<]+)/i) || [])[1]) || id,
        ...(known && known.remark ? {remark: known.remark} : {}),
        playGroups: [{id: 'anime1', name: '默认分组', episodes}],
      };
    },

    async play(input) {
      const pageUrl = text(input.playId);
      const page = await request(pageUrl);
      const token = (page.body.match(/data-apireq=["']([^"']+)/i) || [])[1] || '';
      if (!token) throw new Error('anime1.play-token-missing');
      const response = await request(PLAY_API, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        // Anime1 signs the exact data-apireq value; percent-encoding it changes
        // the signed bytes and the media API rejects the request.
        body: 'd=' + token,
      });
      let payload;
      try { payload = JSON.parse(response.body); } catch (_) { throw new Error('anime1.response-invalid'); }
      let rawUrl = payload && Array.isArray(payload.s) && payload.s[0] ? text(payload.s[0].src) : '';
      if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('anime1.play-unavailable');
      const headers = response.headers && typeof response.headers === 'object' ? response.headers : {};
      const setCookie = text(headers['set-cookie'] || headers['Set-Cookie']);
      const cookie = setCookie.split(/,(?=\s*[^;,=]+=[^;,]+)/).map(value => value.split(';')[0].trim()).filter(Boolean).join('; ');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl,
        headers: Object.assign({'User-Agent': USER_AGENT, Referer: pageUrl}, cookie ? {Cookie: cookie} : {}),
        parse: false,
      };
    },

    async destroy() { sourceKey = ''; catalog = []; },
  });
})();
