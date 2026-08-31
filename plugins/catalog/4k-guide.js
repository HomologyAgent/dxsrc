/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://4kzn.cc';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [['/books/zuixin','最新'],['/books/top250','Top 250'],['/books/juji','剧集'],['/books/dianying','电影']];
  let sourceKey = '';
  const text = value => value === undefined || value === null ? '' : String(value);
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const absolute = value => {
    const url = text(value);
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return BASE + (url.startsWith('/') ? url : '/' + url);
  };
  const load = async url => {
    const response = await dxplay.fetch({url, headers: {'User-Agent': USER_AGENT}});
    if (response.status < 200 || response.status >= 300) throw new Error('guide4k.request-failed');
    return response.body;
  };
  const parseItems = body => {
    const items = [];
    const seen = Object.create(null);
    const pattern = /<article[^>]*class=["'][^"']*posts-item[^"']*book-item[^"']*["'][^>]*>([\s\S]*?)<\/article>/ig;
    let match;
    while ((match = pattern.exec(body)) !== null) {
      const block = match[1];
      const href = (block.match(/item-header[\s\S]*?<a[^>]+href=["']([^"']+)/i) || [])[1];
      const name = clean((block.match(/item-body[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1]);
      if (!href || !name || seen[href]) continue;
      const poster = (block.match(/item-header[\s\S]*?<img[^>]+data-src=["']([^"']+)/i) || block.match(/item-header[\s\S]*?<img[^>]+src=["']([^"']+)/i) || [])[1];
      const remark = clean((block.match(/item-body[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
      seen[href] = true;
      items.push({id: absolute(href), sourceKey, name, ...(poster ? {poster: absolute(poster)} : {}), remark});
    }
    return items;
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.guide4k', name: '4K Guide catalog',
    description: 'Semantic rewrite of the public 4K Guide catalog whose entries route Quark shares through DXPlay Drive Router.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'guide4k'; return {ready: true}; },
    async home() { return {categories: CATEGORIES.map(value => ({id:value[0],name:value[1]})), featured: []}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const id = text(input.categoryId);
      if (!CATEGORIES.some(value => value[0] === id)) throw new Error('guide4k.category-invalid');
      const items = parseItems(await load(BASE + id + '/page/' + page));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const url = BASE + '/page/' + page + '?post_type=book&s=' + encodeURIComponent(text(input.keyword));
      const items = parseItems(await load(url));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = text(input.id);
      if (!/^https?:\/\//i.test(id)) throw new Error('guide4k.item-invalid');
      const body = await load(id);
      const name = clean((body.match(/site-name-box[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
      const poster = (body.match(/book-cover[\s\S]*?<img[^>]+(?:data-src|src)=["']([^"']+)/i) || [])[1];
      const description = clean((body.match(/panel site-content[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
      const links = [];
      const seen = Object.create(null);
      const pattern = /https:\/\/pan\.quark\.cn\/s\/[a-fA-F0-9]+/ig;
      let match;
      while ((match = pattern.exec(body)) !== null) {
        if (seen[match[0]]) continue;
        seen[match[0]] = true;
        links.push(match[0]);
      }
      if (!name || !links.length) throw new Error('guide4k.share-unavailable');
      return {
        id, sourceKey, name, ...(poster ? {poster: absolute(poster)} : {}), description,
        playGroups: [{id:'quark',name:'夸克网盘',episodes:links.map((url,index) => ({
          id:'share-'+(index+1),name:links.length === 1 ? name : name+' '+(index+1),playId:url,
          drive:{kind:'drive-share',url},
        }))}],
      };
    },
    async play(input) {
      const url = text(input.playId);
      if (!/^https:\/\/pan\.quark\.cn\/s\//i.test(url)) throw new Error('guide4k.play-unavailable');
      return {sourceKey,flag:text(input.flag),episodeId:text(input.episodeId),rawUrl:url,headers:{},parse:false,drive:{kind:'drive-share',url}};
    },
    async destroy() { sourceKey = ''; },
  });
})();
