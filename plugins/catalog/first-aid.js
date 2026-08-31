/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://m.youlai.cn';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORY_NAMES = ['急救技能','家庭生活','急危重症','常见损伤','动物致伤','海洋急救','中毒急救','意外事故'];
  let sourceKey = '';
  const text = value => value === undefined || value === null ? '' : String(value);
  const absolute = value => {
    const url = text(value).trim();
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return BASE + (url.startsWith('/') ? url : '/' + url);
  };
  const load = async url => {
    const response = await dxplay.fetch({url, headers: {'User-Agent': USER_AGENT}});
    if (response.status < 200 || response.status >= 300) throw new Error('first-aid.request-failed');
    return response.body;
  };
  const decode = value => text(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  const capture = (body, pattern) => decode((body.match(pattern) || [])[1]);
  dxplay.register({
    id: 'org.dxsrc.jsm.first-aid', name: 'First aid videos',
    description: 'Semantic rewrite of the public first-aid teaching catalog and direct HTML5 videos.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'first-aid'; return {ready: true}; },
    async home() {
      return {categories: CATEGORY_NAMES.map((name, index) => ({id: 'jijiu|' + index, name})), featured: []};
    },
    async category(input) {
      const parts = text(input.categoryId).split('|');
      const index = Number(parts[1]) || 0;
      const body = await load(BASE + '/' + (parts[0] || 'jijiu'));
      const sections = body.split(/<img[^>]+class=["'][^"']*block100[^"']*["'][^>]*>/i).slice(1);
      const section = sections[index] || '';
      const opening = (body.match(/<img[^>]+class=["'][^"']*block100[^"']*["'][^>]*>/ig) || [])[index] || '';
      const poster = absolute(capture(opening, /src=["']([^"']+)/i));
      const items = [];
      const pattern = /<li[^>]+class=["'][^"']*list-br3[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig;
      let match;
      while ((match = pattern.exec(section)) !== null) {
        const name = decode(match[2]);
        if (name) items.push({id: absolute(match[1]), sourceKey, name, ...(poster ? {poster} : {})});
      }
      return {page: 1, pageCount: 1, items};
    },
    async search(input) {
      const body = await load(BASE + '/cse/search?q=' + encodeURIComponent(text(input.keyword)));
      const items = [];
      const pattern = /<[^>]+class=["'][^"']*search-video-li[^"']*["'][^>]*>([\s\S]*?)<\/li>/ig;
      let match;
      while ((match = pattern.exec(body)) !== null) {
        const block = match[1];
        const id = absolute(capture(block, /<a[^>]+href=["']([^"']+)/i));
        const name = capture(block, /<h5[^>]+class=["'][^"']*line-clamp1[^"']*["'][^>]*>([\s\S]*?)<\/h5>/i);
        const poster = absolute(capture(block, /<img[^>]+src=["']([^"']+)/i));
        if (name) items.push({id, sourceKey, name, ...(poster ? {poster} : {})});
      }
      return {page: Number(input.page) || 1, pageCount: 1, items};
    },
    async detail(input) {
      const body = await load(text(input.id));
      const name = capture(body, /<h2[^>]+class=["'][^"']*video-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i);
      const poster = absolute(capture(body, /<div[^>]+class=["'][^"']*video-cover[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)/i));
      const video = (body.match(/<video[^>]+id=["']video["'][^>]*>[\s\S]*?<\/video>/i) || [''])[0];
      const media = absolute(capture(video, /<source[^>]+src=["']([^"']+)/i) || capture(video, /src=["']([^"']+)/i));
      if (!name || !/^https?:\/\//i.test(media)) throw new Error('first-aid.item-not-found');
      return {id: text(input.id), sourceKey, name, ...(poster ? {poster} : {}),
        actors: capture(body, /<span[^>]+class=["'][^"']*doc-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i), area: '中国',
        description: capture(body, /<div[^>]+class=["'][^"']*img-text-con[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
        playGroups: [{id: 'qile', name: '教学视频', episodes: [{id: 'video', name, playId: media}]}]};
    },
    async play(input) {
      const url = text(input.playId);
      if (!/^https?:\/\//i.test(url)) throw new Error('first-aid.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': USER_AGENT}, parse: false};
    },
    async destroy() { sourceKey = ''; },
  });
})();
