/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://www.boosj.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [
    ['28','辅食'],['582','动画'],['3364','儿童舞蹈'],['3366','少儿英语'],['3367','儿童歌曲'],['3622','才艺'],
    ['3782','播视自制'],['3822','故事'],['3842','亲子教育'],['4402','美术'],['4583','其他'],['4762','儿童游戏'],
    ['4842','识物'],['4843','绘本'],['4844','古诗'],['4845','科普'],['5102','儿童玩具'],['5142','童趣儿童玩具'],
  ];
  const FILTERS = [
    {key: 'area', name: '年龄段', initialValue: '', options: [{name:'全部',value:''},{name:'6岁以上',value:'?p367=370'},{name:'3~6岁',value:'?p367=369'},{name:'0~3岁',value:'?p367=368'}]},
    {key: 'by', name: '排序', initialValue: '', options: [{name:'全部',value:''},{name:'最新发布',value:'lately'},{name:'最多播放',value:'pop'},{name:'最多评论',value:'view'}]},
  ];
  let sourceKey = '';
  const text = value => value === undefined || value === null ? '' : String(value);
  const clean = value => text(value).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
  const absolute = value => {
    const url = text(value);
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return BASE + (url.startsWith('/') ? url : '/' + url);
  };
  const requestHeaders = referer => ({'User-Agent': USER_AGENT, Referer: referer || BASE + '/'});
  const load = async (url, referer) => {
    const response = await dxplay.fetch({url, headers: requestHeaders(referer)});
    if (response.status < 200 || response.status >= 300) throw new Error('tongqu.request-failed');
    return response.body;
  };
  const parseCards = (body, blockPattern, remark) => {
    const items = [];
    const seen = Object.create(null);
    let block;
    while ((block = blockPattern.exec(body)) !== null) {
      const html = block[1];
      const id = (html.match(/boosj\.com\/(\d+)\.html/i) || [])[1];
      if (!id || seen[id]) continue;
      const poster = (html.match(/(?:data-original|src)=["']([^"']+)/i) || [])[1];
      const titled = (html.match(/<h3[^>]*>[\s\S]*?title=["']([^"']+)/i) || html.match(/title=["']([^"']+)/i) || [])[1];
      const name = clean(titled || id);
      const played = clean((html.match(/class=["']played["'][^>]*>([^<]*)/i) || [])[1]);
      seen[id] = true;
      items.push({id, sourceKey, name, ...(poster ? {poster: absolute(poster)} : {}), remark: played || remark});
    }
    return items;
  };
  const categoryUrl = (id, page, filters) => {
    const by = text(filters && filters.by);
    const area = text(filters && filters.area);
    const suffix = page === 1 ? '__' + by : '_' + page + '_' + by;
    return BASE + '/search_res_3362__' + encodeURIComponent(id) + suffix + '.html' + area;
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.tongqu', name: 'Boosj children catalog',
    description: 'Semantic rewrite of the public Boosj children catalog, search and GSLB media resolution.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'tongqu'; return {ready: true}; },
    async home() {
      const categories = CATEGORIES.map(value => ({id: value[0], name: value[1], filters: FILTERS}));
      const body = await load(BASE + '/baby/');
      return {categories, featured: parseCards(body, /<div class=["']pubpic["']>([\s\S]*?)<\/div>\s*<\/div>/ig, '推荐')};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const id = text(input.categoryId);
      if (!CATEGORIES.some(value => value[0] === id)) throw new Error('tongqu.category-invalid');
      const body = await load(categoryUrl(id, page, input.filters));
      const items = parseCards(body, /<div class=["']bj-col4["']>([\s\S]*?)<\/div>\s*<\/div>/ig, '');
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const body = await load('https://search.boosj.com/m_ajax?q=' + encodeURIComponent(text(input.keyword).trim()) + '&p=' + page + '&typeId=3362');
      let payload;
      try { payload = JSON.parse(body); } catch (_) { throw new Error('tongqu.response-invalid'); }
      const values = payload && payload.code === 200 && payload.body && Array.isArray(payload.body.result) ? payload.body.result : [];
      const items = values.map(value => ({
        id: text(value.id), sourceKey, name: text(value.resourceName) || text(value.id),
        ...(value.imageUrl ? {poster: absolute(value.imageUrl)} : {}), remark: text(value.clickNumStr),
      })).filter(item => /^\d+$/.test(item.id));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = text(input.id);
      if (!/^\d+$/.test(id)) throw new Error('tongqu.item-invalid');
      const body = await load(BASE + '/' + id + '.html');
      const name = clean((body.match(/<h2 class=["']video_title["'][^>]*>([^<]+)/i) || [])[1]) || id;
      const poster = (body.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || [])[1];
      return {id, sourceKey, name, ...(poster ? {poster: absolute(poster)} : {}), playGroups: [{id:'tongqu',name:'童趣',episodes:[{id:'play',name:'播放',playId:id}]}]};
    },
    async play(input) {
      const id = text(input.playId);
      if (!/^\d+$/.test(id)) throw new Error('tongqu.play-invalid');
      let data;
      try { data = JSON.parse(await load('https://gslb.boosj.com/ipv2.json')); } catch (_) { throw new Error('tongqu.response-invalid'); }
      data._id = id;
      const endpoint = text(data.gslb) || 'https://gslb.boosj.com/gslbm';
      const query = Object.keys(data).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(data[key]))).join('&');
      let resolved;
      try { resolved = JSON.parse(await load(endpoint + '?' + query, BASE + '/' + id + '.html')); } catch (_) { throw new Error('tongqu.resolve-invalid'); }
      let url = text(resolved.url);
      if (url && resolved.t) url += '?' + text(resolved.t);
      if (!/^https?:\/\//i.test(url)) throw new Error('tongqu.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: requestHeaders(BASE + '/' + id + '.html'), parse: false};
    },
    async destroy() { sourceKey = ''; },
  });
})();
