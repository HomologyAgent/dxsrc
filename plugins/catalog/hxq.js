/* global dxplay */
(() => {
  'use strict';

  const API_ORIGIN = 'https://hxqapi.hiyun.tv';
  const CATEGORY_PATH = '/api/series/cate';
  const CATEGORY_NAMES = {1: '韩剧', 2: '综艺', 3: '电影'};
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const pageOf = value => Math.max(1, Math.trunc(Number(value) || 1));

  async function request(path, params) {
    const query = Object.entries(params)
      .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value))
      .join('&');
    const response = await dxplay.fetch({url: API_ORIGIN + path + '?' + query, headers: {Accept: 'application/json'}});
    if (response.status < 200 || response.status >= 300) {
      throw new Error('hxq.upstream-unavailable');
    }
    let data;
    try { data = JSON.parse(response.body); } catch (_) { throw new Error('hxq.response-invalid'); }
    if (!data || Number(data.rescode) !== 0) throw new Error('hxq.upstream-rejected');
    return data;
  }

  async function categoryPage(params) {
    const data = await request(CATEGORY_PATH, params);
    if (!Array.isArray(data.seriesList)) throw new Error('hxq.catalog-unavailable');
    return data;
  }

  function itemOf(value) {
    const id = text(value?.sid);
    const name = text(value?.name).trim();
    if (!id || !name) return null;
    const poster = text(value.poster || value.posterThumb || value.thumb);
    const remark = text(value.memo || value.shorthand);
    return {
      id, sourceKey, name,
      ...(/^https?:\/\//i.test(poster) ? {poster} : {}),
      ...(remark ? {remark} : {}),
    };
  }

  function filtersOf(value) {
    return [
      {key: 'sort', name: '排序', choices: value.sorts},
      {key: 'year', name: '年份', choices: value.years},
    ].flatMap(({key, name, choices}) => {
      const options = list(choices).map(entry => ({name: text(entry?.name), value: text(entry?.value)}))
        .filter(entry => entry.name && entry.value);
      return options.length ? [{key, name, initialValue: options[0].value, options}] : [];
    });
  }

  function categoriesOf(value, includeFilters) {
    const filters = includeFilters ? filtersOf(value) : [];
    const filterProperty = filters.length ? {filters} : {};
    return list(value.groups).flatMap(group => {
      const id = text(group?.stype);
      const name = text(group?.name);
      if (!id || !name) return [];
      const children = list(group.cates)
        .filter(entry => text(entry?.value) && text(entry?.value) !== '-1' && entry.name
          && entry.name !== '全部' && entry.name !== '伦理')
        .slice(0, 5)
        .map(entry => ({id: id + '_' + entry.value, name: text(entry.name), ...filterProperty}));
      return [{id, name: name + '全部', ...filterProperty}, ...children];
    });
  }

  dxplay.register({
    id: 'org.dxsrc.qist.hxq',
    name: 'Hxq catalog family',
    description: 'Browse the public Korean catalog, filters and series information.',
    version: '1.1.0',
    protocol: 'catalog@1',

    async init(input) {
      // Legacy source profiles carry the retired PHP mediator in extension.
      sourceKey = text(input.sourceKey) || 'hxq';
      return {ready: true};
    },
    async home(input) {
      const data = await categoryPage({stype: '1', page: '1'});
      return {
        categories: categoriesOf(data, Boolean(input.includeFilters)),
        featured: data.seriesList.map(itemOf).filter(Boolean).slice(0, 20),
      };
    },
    async category(input) {
      const page = pageOf(input.page);
      const [stype, cid] = text(input.categoryId).split('_', 2);
      const {sort, year} = input.filters ?? {};
      const data = await categoryPage({
        stype: stype || '1', page,
        ...(cid ? {cid} : {}),
        ...(text(sort) ? {sort: text(sort)} : {}),
        ...(text(year) ? {year: text(year)} : {}),
      });
      return {
        page, pageCount: Number(data.more) > 0 ? page + 1 : page,
        items: data.seriesList.map(itemOf).filter(Boolean),
      };
    },
    async search() {
      throw new Error('hxq.search-requires-app-access');
    },
    async detail(input) {
      const {series} = await request('/api/series/detail', {sid: text(input.id)});
      const item = itemOf(series);
      if (!item) throw new Error('hxq.item-not-found');
      const date = new Date(Number(series.publishTime));
      const count = Number(series.count) || 0;
      const progress = count > 0 ? (series.isFinished ? count + '集全' : '更新至' + count + '集') : '';
      return {
        ...item,
        category: CATEGORY_NAMES[Number(series.category)] || '',
        area: '韩国',
        actors: text(series.crew).replace(/^(主演[：:]\s*)/, ''),
        year: Number(series.publishTime) > 0 && Number.isFinite(date.getTime()) ? String(date.getFullYear()) : '',
        remark: [progress, text(series.shorthand)].filter(Boolean).join(' · '),
        description: text(series.intro).split('</p>')[0].replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…').replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(),
        // Public detail carries provider pages. Playback requires app access.
        playGroups: [],
      };
    },
    async play() {
      throw new Error('hxq.playback-requires-app-access');
    },
    async destroy() {
      sourceKey = '';
    },
  });
})();
