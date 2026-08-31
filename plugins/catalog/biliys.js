/* global dxplay */
(() => {
  'use strict';

  const API = 'https://api.bilibili.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORY_VALUES = [
    ['1', '番剧'], ['2', '电影'], ['3', '纪录'], ['4', '国创'], ['5', '剧集'], ['7', '综艺'],
  ];
  const FILTERS = [{
    key: 'order', name: '排序', initialValue: '2', options: [
      {name: '播放数量', value: '2'}, {name: '更新时间', value: '0'},
      {name: '追看人数', value: '3'}, {name: '最高评分', value: '4'},
      {name: '开播时间', value: '5'}, {name: '上映时间', value: '6'},
    ],
  }, {
    key: 'season_status', name: '观看条件', initialValue: '1', options: [
      {name: '免费', value: '1'}, {name: '全部', value: '-1'},
      {name: '付费', value: '2,6'}, {name: '大会员', value: '4,6'},
    ],
  }];
  let sourceKey = '';
  let sourceHeaders = {};
  let cookie = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const image = value => text(value).startsWith('//') ? 'https:' + text(value) : text(value);
  const headers = () => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: 'https://www.bilibili.com/',
    ...(cookie ? {Cookie: cookie} : {}),
  }, sourceHeaders);
  const request = async path => {
    const response = await dxplay.fetch({url: API + path, headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('biliys.request-failed');
    let payload;
    try { payload = JSON.parse(response.body); }
    catch (_) { throw new Error('biliys.response-invalid'); }
    if (Number(payload.code) !== 0) throw new Error('biliys.upstream-failed');
    return payload;
  };
  const item = value => ({
    id: text(value.season_id), sourceKey, name: text(value.title) || text(value.season_id),
    ...(image(value.cover) ? {poster: image(value.cover)} : {}),
    ...(text(value.index_show) ? {remark: text(value.index_show)} : {}),
  });
  const categoryPage = async (categoryId, page, selected) => {
    const filters = object(selected);
    const query = '?order=' + encodeURIComponent(text(filters.order || '2'))
      + '&season_status=' + encodeURIComponent(text(filters.season_status || '1'))
      + '&style_id=-1&sort=-1&area=-1&pagesize=20&type=1'
      + '&season_type=' + encodeURIComponent(text(categoryId)) + '&page=' + page;
    return request('/pgc/season/index/result' + query);
  };
  const searchType = async (type, keyword, page) => {
    const payload = await request('/x/web-interface/wbi/search/type?search_type=' + type
      + '&keyword=' + encodeURIComponent(keyword) + '&page=' + page);
    return list(payload.data && payload.data.result);
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.biliys',
    name: 'Bilibili film catalog',
    description: 'Semantic rewrite of the public Bilibili PGC catalog using anonymous category, season and progressive-play APIs.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'biliys';
      sourceHeaders = object(input.headers);
      const extension = object(input.extension);
      cookie = text(extension.cookie);
      if (/^https?:\/\//i.test(cookie)) cookie = '';
      return {ready: true};
    },
    async home() {
      const payload = await categoryPage('1', 1, {order: '2', season_status: '1'});
      return {
        categories: CATEGORY_VALUES.map(value => ({id: value[0], name: value[1], filters: FILTERS})),
        featured: list(payload.data && payload.data.list).map(item).filter(value => value.id && value.name),
      };
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const payload = await categoryPage(input.categoryId, page, input.filters);
      const data = object(payload.data);
      const size = Math.max(1, Number(data.size) || 20);
      const total = Math.max(0, Number(data.total) || 0);
      return {page, pageCount: Math.max(page, Math.ceil(total / size)), items: list(data.list).map(item).filter(value => value.id && value.name)};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const results = [];
      for (const type of ['media_ft', 'media_bangumi']) {
        try { results.push(...await searchType(type, keyword, page)); } catch (_) {}
      }
      const seen = Object.create(null);
      const items = results.map(item).filter(value => {
        if (!value.id || !value.name || seen[value.id]) return false;
        seen[value.id] = true;
        return true;
      });
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = text(input.id);
      if (!id) throw new Error('biliys.item-invalid');
      const payload = await request('/pgc/view/web/season?season_id=' + encodeURIComponent(id));
      const value = object(payload.result);
      if (!Object.keys(value).length) throw new Error('biliys.item-not-found');
      const episodes = list(value.episodes).map((episode, index) => ({
        id: text(episode.cid) || String(index + 1),
        name: text(episode.share_copy || episode.long_title || episode.title) || String(index + 1),
        playId: text(episode.aid) + '@' + text(episode.cid),
      })).filter(episode => !episode.playId.startsWith('@') && !episode.playId.endsWith('@'));
      if (!episodes.length) throw new Error('biliys.episodes-unavailable');
      return {
        id, sourceKey, name: text(value.title) || id,
        ...(image(value.cover) ? {poster: image(value.cover)} : {}),
        actors: text(value.actors), description: text(value.evaluate),
        headers: {'User-Agent': USER_AGENT, Referer: 'https://www.bilibili.com/'},
        playGroups: [{id: 'biliys', name: '哔哩影视', episodes}],
      };
    },
    async play(input) {
      const parts = text(input.playId).split('@');
      if (!parts[0] || !parts[1]) throw new Error('biliys.play-invalid');
      const payload = await request('/pgc/player/web/playurl?avid=' + encodeURIComponent(parts[0])
        + '&cid=' + encodeURIComponent(parts[1]) + '&qn=32&fnval=0&fourk=0');
      const data = object(payload.result || payload.data);
      const selected = list(data.durl).find(value => text(value.url));
      if (!selected) throw new Error('biliys.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: text(selected.url),
        headers: {'User-Agent': USER_AGENT, Referer: 'https://www.bilibili.com/'}, parse: false,
      };
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; cookie = ''; },
  });
})();
