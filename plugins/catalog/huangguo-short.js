/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_BASE = 'https://huangguoai.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const CATEGORIES = Object.freeze([
    Object.freeze({id: 'ai-duanju', name: 'AI成人短剧'}),
    Object.freeze({id: 'ai-manju', name: 'AI成人漫剧'}),
    Object.freeze({id: 'ai-huanlian', name: 'AI换脸'}),
    Object.freeze({id: 'ai-mogai', name: 'AI魔改'}),
    Object.freeze({id: 'ranks/hot', name: '排行榜'}),
  ]);
  let sourceKey = '';
  let baseUrl = DEFAULT_BASE;

  const text = value => value === undefined || value === null ? '' : String(value);
  const entities = value => text(value)
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  const plain = value => entities(text(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const request = async (path, referer) => {
    const url = /^https?:\/\//i.test(path) ? path : baseUrl + (path.startsWith('/') ? path : '/' + path);
    const response = await dxplay.fetch({url, headers: {'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', Referer: referer || baseUrl + '/'}});
    if (response.status < 200 || response.status >= 300) throw new Error('huangguo.request-failed');
    return response.body;
  };
  const first = (input, pattern) => {
    const match = pattern.exec(input);
    return match ? match[1] : '';
  };
  const mapItems = html => {
    const items = [], seen = Object.create(null);
    const pattern = /<a\b([^>]*?)href=["']\/detail\/(\d+)\/["']([^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null && items.length < 120) {
      const id = match[2];
      if (seen[id]) continue;
      const attributes = match[1] + ' ' + match[3];
      const name = plain(match[4]) || entities(first(attributes, /\b(?:title|aria-label)=["']([^"']+)["']/i));
      if (!name) continue;
      seen[id] = true;
      const tail = html.slice(pattern.lastIndex, pattern.lastIndex + 500);
      const remark = plain(first(tail, /class=["'][^"']*hg-drama-card__episode[^"']*["'][^>]*>([\s\S]*?)<\//i));
      items.push({id, sourceKey, name, ...(remark ? {remark} : {})});
    }
    return items;
  };
  const pagePath = (categoryId, page) => {
    const category = text(categoryId).replace(/^\/+|\/+$/g, '');
    return '/' + category + '/' + (page > 1 ? page + '/' : '');
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.huangguo-short',
    name: 'Huangguo short catalog',
    description: 'Semantic rewrite of the current public Huangguo short-video catalogue and direct episode HLS pages.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'huangguo';
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : {};
      baseUrl = text(extension.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('huangguo.base-invalid');
      return {ready: true};
    },

    async home() {
      const featured = mapItems(await request('/'));
      return {categories: CATEGORIES.map(value => ({id: value.id, name: value.name})), featured};
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const items = mapItems(await request(pagePath(input.categoryId, page)));
      return {page, pageCount: items.length >= 20 ? page + 1 : page, items};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const items = mapItems(await request('/search/video/' + encodeURIComponent(text(input.keyword)) + '/'));
      return {page, pageCount: 1, items};
    },

    async detail(input) {
      const id = text(input.id);
      if (!/^\d+$/.test(id)) throw new Error('huangguo.item-invalid');
      const html = await request('/detail/' + id + '/');
      const name = plain(first(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i));
      if (!name) throw new Error('huangguo.item-not-found');
      const description = plain(first(html, /class=["'][^"']*hg-web-detail__desc[^"']*["'][^>]*>([\s\S]*?)<\//i));
      const episodePattern = new RegExp('<a\\b[^>]*href=["\'](\\/video\\/' + id + '(?:\\/ep-\\d+)?\\/)["\'][^>]*data-ep-id=["\'](\\d+)["\'][^>]*>([\\s\\S]*?)<\\/a>', 'gi');
      const episodes = [];
      let match;
      while ((match = episodePattern.exec(html)) !== null) {
        const episode = match[2];
        episodes.push({id: episode, name: plain(match[3]) || '第' + episode + '集', playId: JSON.stringify({path: match[1], episode})});
      }
      if (!episodes.length) throw new Error('huangguo.episodes-unavailable');
      const remark = plain(first(html, /class=["'][^"']*hg-web-detail__episode[^"']*["'][^>]*>([\s\S]*?)<\//i));
      return {
        id, sourceKey, name, ...(remark ? {remark} : {}), ...(description ? {description} : {}),
        playGroups: [{id: 'direct', name: '默认线路', episodes}],
      };
    },

    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); } catch (_) { throw new Error('huangguo.play-invalid'); }
      const path = text(descriptor.path), episode = text(descriptor.episode) || '1';
      if (!/^\/video\/\d+\/(?:ep-\d+\/)?$/.test(path)) throw new Error('huangguo.play-invalid');
      const html = await request(path, baseUrl + '/');
      const encoded = first(html, /<script\s+id=["']videoInitialData["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i);
      let data;
      try { data = JSON.parse(encoded); } catch (_) { throw new Error('huangguo.play-data-invalid'); }
      const sources = data && typeof data.epPlaySrcs === 'object' ? data.epPlaySrcs : {};
      const url = text(sources[episode] || data.videoSrc).replace(/\\u0026/g, '&');
      if (!/^https?:\/\//i.test(url)) throw new Error('huangguo.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url,
        headers: {'User-Agent': USER_AGENT, Referer: baseUrl + '/'}, parse: false,
      };
    },

    async destroy() { sourceKey = ''; baseUrl = DEFAULT_BASE; },
  });
})();
