/* global dxplay */
(() => {
  'use strict';

  const API = 'http://asp.xpgtv.com';
  const MEDIA = 'http://c.xpgtv.net/m3u8/';
  const USER_AGENT = 'okhttp/3.12.11';
  const FILTER_NAMES = {classes: '类型', areas: '地区', years: '年份', sortby: '排序'};
  const SORT_NAMES = {'updatetime': '时间', hits: '人气', score: '评分'};
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const query = values => Object.keys(values).filter(key => text(values[key])).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key]))).join('&');
  const request = async path => {
    const response = await dxplay.fetch({url: API + path, headers: {'User-Agent': USER_AGENT}});
    if (response.status < 200 || response.status >= 300) throw new Error('apple-video.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('apple-video.response-invalid'); }
  };
  const item = value => ({
    id: text(value.id), sourceKey, name: text(value.name) || text(value.id),
    ...(value.pic ? {poster: text(value.pic)} : {}),
    remark: value.updateInfo ? '更新至' + text(value.updateInfo) : text(value.score),
  });
  const filterFor = (key, values) => {
    const normalized = list(values).map(text).map(value => value.trim()).filter(Boolean);
    if (key === 'sortby') normalized.splice(0, normalized.length, 'updatetime', 'hits', 'score');
    const options = [{name: '全部', value: ''}].concat(normalized.map(value => ({name: SORT_NAMES[value] || value, value})));
    return options.length > 1 ? {
      key: key === 'areas' ? 'area' : key === 'years' ? 'year' : key,
      name: FILTER_NAMES[key], initialValue: '', options,
    } : null;
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.apple-video',
    name: 'Apple video catalog',
    description: 'Credential-free rewrite of the reachable Apple/XPG catalog, detail API and direct HLS media convention.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) { sourceKey = text(input.sourceKey) || 'apple-video'; return {ready: true}; },

    async home() {
      const types = await request('/api.php/v2.vod/androidtypes');
      const categories = list(types.data).map(value => {
        const filters = Object.keys(FILTER_NAMES).map(key => filterFor(key, key === 'sortby' ? [] : value[key])).filter(Boolean);
        return {id: text(value.type_id), name: text(value.type_name), ...(filters.length ? {filters} : {})};
      }).filter(value => value.id && value.name);
      const landing = await request('/api.php/v2.main/androidhome');
      const featured = [];
      list(landing.data && landing.data.list).forEach(section => {
        list(section && section.list).forEach(value => { if (featured.length < 60) featured.push(item(value)); });
      });
      return {categories, featured: featured.filter(value => value.id && value.name)};
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const filters = input.filters || {};
      const payload = await request('/api.php/v2.vod/androidfilter10086?' + query({
        page, type: input.categoryId, area: filters.area, year: filters.year,
        sortby: filters.sortby, class: filters.classes,
      }));
      const items = list(payload.data).map(item).filter(value => value.id && value.name);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const payload = await request('/api.php/v2.vod/androidsearch10086?' + query({page, wd: input.keyword}));
      const items = list(payload.data).map(item).filter(value => value.id && value.name);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },

    async detail(input) {
      const id = text(input.id);
      const payload = await request('/api.php/v3.vod/androiddetail2?vod_id=' + encodeURIComponent(id));
      const value = payload.data || {};
      const episodes = list(value.urls).map((episode, index) => {
        const playId = text(episode && episode.url);
        if (!playId || text(episode.key).includes('及时雨')) return null;
        return {id: String(index + 1), name: text(episode.key) || String(index + 1), playId};
      }).filter(Boolean);
      if (!text(value.name) || !episodes.length) throw new Error('apple-video.item-not-found');
      return {
        id, sourceKey, name: text(value.name), poster: text(value.pic), year: text(value.year), area: text(value.area),
        actors: text(value.actor), director: text(value.director), description: text(value.content),
        remark: value.updateInfo ? '更新至' + text(value.updateInfo) : text(value.score),
        playGroups: [{id: 'xpg', name: '书生精选线路', episodes}],
      };
    },

    async play(input) {
      const id = text(input.playId).trim();
      if (!id) throw new Error('apple-video.play-unavailable');
      const url = /^https?:\/\//i.test(id) ? id : MEDIA + encodeURIComponent(id) + '.m3u8';
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url,
        headers: {'User-Agent': USER_AGENT}, parse: false,
      };
    },

    async destroy() { sourceKey = ''; },
  });
})();
