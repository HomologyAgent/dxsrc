/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://www.dj92.cc';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [['1','电音House'],['2','中文舞曲'],['3','外文舞曲'],['4','酒吧风格'],['5','串烧舞曲'],['7','私改舞曲'],['8','大赛作品']];
  let sourceKey = '';
  const text = value => value === undefined || value === null ? '' : String(value);
  const absolute = value => {
    const url = text(value);
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return BASE + (url.startsWith('/') ? url : '/' + url);
  };
  const load = async url => {
    const response = await dxplay.fetch({url, headers: {'User-Agent': USER_AGENT}});
    if (response.status < 200 || response.status >= 300) throw new Error('djlh.request-failed');
    return response.body;
  };
  const parseItems = body => {
    const items = [];
    const pattern = /<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/ig;
    let match;
    while ((match = pattern.exec(body)) !== null) {
      const block = match[1];
      const anchor = block.match(/<span[^>]+class=["']name["'][^>]*>[\s\S]*?<a([^>]*)>/i);
      const attrs = anchor?.[1] || '';
      const id = (attrs.match(/href=["']([^"']+)/i) || [])[1];
      const name = (attrs.match(/title=["']([^"']+)/i) || [])[1];
      const poster = (block.match(/<div[^>]+class=["']user["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)/i) || [])[1];
      const author = (block.match(/<span[^>]+class=["']nickname["'][^>]*>[\s\S]*?<a[^>]+title=["']([^"']+)/i) || [])[1];
      if (id && name) items.push({id: absolute(id), sourceKey, name, ...(poster ? {poster: absolute(poster)} : {}), ...(author ? {remark: author} : {})});
    }
    return items;
  };
  dxplay.register({
    id: 'org.dxsrc.jsm.djlh', name: 'DJ92 catalog',
    description: 'Semantic rewrite of the public DJ92 music catalog and resolved audio playback.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'djlh'; return {ready: true}; },
    async home() { return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: []}; },
    async category(input) {
      const page = Number(input.page) || 1;
      const items = parseItems(await load(BASE + '/djlist/' + encodeURIComponent(text(input.categoryId)) + '/' + page + '.html'));
      return {page, pageCount: items.length < 20 ? page : page + 1, items};
    },
    async search(input) {
      const page = Number(input.page) || 1;
      const items = parseItems(await load(BASE + '/search.html?key=' + encodeURIComponent(text(input.keyword)) + '&page=' + page));
      return {page, pageCount: items.length < 20 ? page : page + 1, items};
    },
    async detail(input) {
      const body = await load(absolute(input.id));
      const name = text((body.match(/<h3[^>]*>[\s\S]*?<span[^>]+class=["']name["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1]).replace(/<[^>]*>/g, '').trim();
      const token = (body.match(/token:\s*'([^']+)'/) || [])[1];
      if (!name || !token) throw new Error('djlh.item-not-found');
      const response = await dxplay.fetch({url: BASE + '/ajax/info', method: 'POST',
        headers: {'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded'},
        body: 'token=' + encodeURIComponent(token)});
      let data;
      try { data = JSON.parse(response.body); } catch (_) { throw new Error('djlh.response-invalid'); }
      const url = absolute(data.playurl);
      if (!/^https?:\/\//i.test(url)) throw new Error('djlh.play-unavailable');
      return {id: text(input.id), sourceKey, name,
        playGroups: [{id: 'dj92', name: '轮回DJ', episodes: [{id: 'audio', name: '点击播放', playId: url}]}]};
    },
    async play(input) {
      const url = text(input.playId);
      if (!/^https?:\/\//i.test(url)) throw new Error('djlh.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {}, parse: false};
    },
    async destroy() { sourceKey = ''; },
  });
})();
