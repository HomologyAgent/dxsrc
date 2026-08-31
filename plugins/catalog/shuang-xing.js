/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://1.star2.cn';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [
    ['dj', '短剧'], ['ju', '国剧'], ['zy', '综艺'], ['mv', '电影'],
    ['rh', '韩日'], ['ym', '英美'], ['wj', '外剧'], ['dm', '动漫'],
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
  const load = async path => {
    const url = /^https?:\/\//i.test(text(path)) ? text(path) : BASE + (text(path).startsWith('/') ? text(path) : '/' + text(path));
    const response = await dxplay.fetch({url, headers: {'User-Agent': USER_AGENT, Referer: BASE + '/'}});
    if (response.status < 200 || response.status >= 300) throw new Error('shuangxing.request-failed');
    return response.body;
  };
  const parseList = body => {
    const section = (text(body).match(/<ul[^>]*class=["'][^"']*erx-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i) || [])[1] || '';
    const items = [];
    const seen = Object.create(null);
    const pattern = /<li[^>]*class=["'][^"']*item[^"']*["'][^>]*>([\s\S]*?)<\/li>/ig;
    let match;
    while ((match = pattern.exec(section)) !== null) {
      const block = match[1];
      const anchor = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!anchor || !/^\/[a-z]+\/\d+\.html(?:[?#].*)?$/i.test(anchor[1]) || seen[anchor[1]]) continue;
      const name = clean(anchor[2]).replace(/【[^】]*】/g, '').trim();
      if (!name) continue;
      const remark = clean((block.match(/<span[^>]*class=["'][^"']*erx-num-font[^"']*time[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
      seen[anchor[1]] = true;
      items.push({id: anchor[1], sourceKey, name, remark});
    }
    return items;
  };
  const driveKind = url => {
    if (/pan\.quark\.cn/i.test(url)) return '夸克';
    if (/pan\.baidu\.com/i.test(url)) return '百度';
    if (/(?:aliyundrive|alipan)\.com/i.test(url)) return '阿里';
    if (/pan\.xunlei\.com/i.test(url)) return '迅雷';
    if (/123pan\.com/i.test(url)) return '123';
    if (/drive\.uc\.cn/i.test(url)) return 'UC';
    return '网盘';
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.shuangxing',
    name: 'ShuangXing drive catalog',
    description: 'Semantic rewrite of the public ShuangXing catalog and its declarative cloud-drive shares.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'shuangxing';
      return {ready: true};
    },
    async home() {
      return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: []};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const id = text(input.categoryId);
      if (!CATEGORIES.some(value => value[0] === id)) throw new Error('shuangxing.category-invalid');
      const items = parseList(await load('/' + id + '_' + page));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: 1, items: []};
      const items = parseList(await load('/search/?keyword=' + encodeURIComponent(keyword)));
      return {page, pageCount: 1, items};
    },
    async detail(input) {
      const id = text(input.id);
      if (!/^\/[a-z]+\/\d+\.html(?:[?#].*)?$/i.test(id)) throw new Error('shuangxing.item-invalid');
      const body = await load(id);
      const name = clean((body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
      const episodes = [];
      const seen = Object.create(null);
      const pattern = /<a[^>]*class=["'][^"']*dlipp-dl-btn[^"']*["'][^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig;
      let match;
      while ((match = pattern.exec(body)) !== null) {
        const url = clean(match[1]);
        if (!/(?:pan\.quark\.cn|pan\.baidu\.com|aliyundrive\.com|alipan\.com|pan\.xunlei\.com|123pan\.com|drive\.uc\.cn)/i.test(url) || seen[url]) continue;
        seen[url] = true;
        const label = clean(match[2]) || driveKind(url);
        episodes.push({id: String(episodes.length + 1), name: label, playId: url, drive: {kind: 'drive-share', url}});
      }
      if (!name || !episodes.length) throw new Error('shuangxing.share-unavailable');
      return {id, sourceKey, name, playGroups: [{id: 'drive', name: '网盘', episodes}]};
    },
    async play(input) {
      const url = text(input.playId);
      if (!/^https?:\/\//i.test(url)) throw new Error('shuangxing.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {}, parse: false, drive: {kind: 'drive-share', url}};
    },
    async destroy() { sourceKey = ''; },
  });
})();
