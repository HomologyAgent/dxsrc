/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://www.6huo.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const FILTERS = [
    {key: '1', name: '类型', initialValue: '', options: ['', '喜剧', '爱情', '恐怖', '动作', '科幻', '剧情', '战争', '犯罪', '灾难', '奇幻', '悬疑', '惊悚', '冒险'].map(value => ({name: value || '全部', value}))},
    {key: '0', name: '地区', initialValue: '', options: ['', '大陆', '香港', '台湾', '美国', '法国', '英国', '日本', '韩国', '德国', '泰国', '印度', '其他'].map(value => ({name: value || '全部', value}))},
    {key: '2', name: '年份', initialValue: '', options: ['', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2014', '2013', '2012', '2011', '2010'].map(value => ({name: value || '全部', value}))},
    {key: '3', name: '排序', initialValue: '', options: [{name: '最近更新', value: ''}, {name: '热门', value: 'hot'}, {name: '上映时间', value: 'pubtime'}]},
  ];
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const clean = value => text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const absolute = value => {
    const url = text(value).replace(/\\\//g, '/');
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return BASE + (url.startsWith('/') ? url : '/' + url);
  };
  const headers = referer => ({'User-Agent': USER_AGENT, Referer: referer || BASE + '/'});
  const load = async (path, referer) => {
    const response = await dxplay.fetch({url: absolute(path), headers: headers(referer)});
    if (response.status < 200 || response.status >= 300) throw new Error('ygp.request-failed');
    return response.body;
  };
  const parseCards = body => {
    const items = [];
    const seen = Object.create(null);
    const lists = text(body).match(/<div[^>]*class=["'][^"']*movlist[^"']*["'][^>]*>[\s\S]*?<\/ul>/ig) || [];
    for (const list of lists) {
      const pattern = /<li[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/ig;
      let match;
      while ((match = pattern.exec(list)) !== null) {
        const id = match[1];
        if (!/^\/movie\/\d+/i.test(id) || seen[id]) continue;
        const block = match[2];
        const name = clean((block.match(/<span[^>]*class=["'][^"']*item-title[^"']*["'][^>]*title=["']([^"']+)/i) || block.match(/<span[^>]*class=["'][^"']*item-title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
        const poster = (block.match(/<img[^>]+src=["']([^"']+)/i) || [])[1];
        const remark = clean((block.match(/<span[^>]*class=["'][^"']*item-pubtime[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || block.match(/<p[^>]*class=["'][^"']*item-tags[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
        if (!name) continue;
        seen[id] = true;
        items.push({id, sourceKey, name, ...(poster ? {poster: absolute(poster)} : {}), remark});
      }
    }
    return items;
  };
  const categoryPath = (page, filters) => {
    const values = [text(filters && filters['0']), text(filters && filters['1']), text(filters && filters['2']), text(filters && filters['3']), String(page)];
    return '/movlist/' + values.map(value => encodeURIComponent(value)).join('_');
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.ygp',
    name: 'YGP trailer catalog',
    description: 'Semantic rewrite of the public YGP trailer catalog with direct media extraction from each show page.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'ygp'; return {ready: true}; },
    async home() {
      const featured = parseCards(await load('/'));
      return {categories: [{id: 'movlist', name: '预告片世界', filters: FILTERS}], featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (text(input.categoryId) !== 'movlist') throw new Error('ygp.category-invalid');
      const body = await load(categoryPath(page, input.filters));
      const items = parseCards(body);
      const numbers = [...body.matchAll(/<p[^>]*class=["'][^"']*page-nav[^"']*["'][^>]*>[\s\S]*?<\/p>/ig)]
        .flatMap(match => [...match[0].matchAll(/>\s*(\d+)\s*</g)].map(value => Number(value[1])))
        .filter(Number.isFinite);
      return {page, pageCount: numbers.length ? Math.max(...numbers) : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: 1, items: []};
      return {page, pageCount: 1, items: parseCards(await load('/?keyword=' + encodeURIComponent(keyword) + '&view=search'))};
    },
    async detail(input) {
      const id = text(input.id);
      if (!/^\/movie\/\d+/i.test(id)) throw new Error('ygp.item-invalid');
      const body = await load(id);
      const name = clean((body.match(/<h1[^>]*class=["'][^"']*movie-name[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
      const poster = (body.match(/movie-title-mpic[\s\S]*?<img[^>]+src=["']([^"']+)/i) || [])[1];
      const info = clean((body.match(/<div[^>]*class=["'][^"']*movie-title-detail[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
      const playGroups = [];
      const tables = body.match(/<table[^>]*class=["'][^"']*tlist[^"']*["'][^>]*>[\s\S]*?<\/table>/ig) || [];
      for (let index = 0; index < tables.length; index += 1) {
        const table = tables[index];
        const groupName = clean((table.match(/<th[^>]*>([\s\S]*?)<\/th>/i) || [])[1]) || '预告片 ' + (index + 1);
        const episodes = [];
        const pattern = /<a[^>]+href=["'](\/show\/\d+)["'][^>]*class=["'][^"']*tlist-bbs-tdtitle[^"']*["'][^>]*>([\s\S]*?)<\/a>/ig;
        let match;
        while ((match = pattern.exec(table)) !== null) episodes.push({id: match[1].slice(6), name: clean(match[2]) || String(episodes.length + 1), playId: match[1]});
        if (episodes.length) playGroups.push({id: 'trailer-' + (index + 1), name: groupName, episodes});
      }
      if (!name || !playGroups.length) throw new Error('ygp.detail-unavailable');
      return {id, sourceKey, name, ...(poster ? {poster: absolute(poster)} : {}), description: info, playGroups};
    },
    async play(input) {
      const id = text(input.playId);
      if (!/^\/show\/\d+$/i.test(id)) throw new Error('ygp.play-invalid');
      const pageUrl = absolute(id);
      const body = await load(id);
      const encoded = (body.match(/\bvideo\s*:\s*["']([^"']+)["']/i) || [])[1];
      const url = absolute(encoded);
      if (!/^https?:\/\//i.test(url) || !/\.(?:mp4|m3u8)(?:[?#]|$)/i.test(url)) throw new Error('ygp.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: headers(pageUrl), parse: false};
    },
    async destroy() { sourceKey = ''; },
  });
})();
