/* global dxplay */
(() => {
  'use strict';

  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const DEFAULT_API = 'https://www.mdzyapi.com/api.php/provide/vod';
  const DEFAULT_CATEGORIES = [
    ['1', '\u56fd\u4ea7\u52a8\u6f2b'], ['2', '\u65e5\u97e9\u52a8\u6f2b'], ['3', '\u6b27\u7f8e\u52a8\u6f2b'],
    ['4', '\u6e2f\u53f0\u52a8\u6f2b'], ['5', '\u52a8\u6f2b\u7535\u5f71'],
  ];
  let sourceKey = '';
  let sourceHeaders = {};
  let apiUrl = '';
  let declaredCategories = [];

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const clean = value => text(value).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  const withQuery = values => {
    const query = Object.keys(values).filter(key => values[key] !== undefined && values[key] !== '')
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key]))).join('&');
    return apiUrl + (apiUrl.includes('?') ? (/[?&]$/.test(apiUrl) ? '' : '&') : '?') + query;
  };
  const request = async values => {
    const response = await dxplay.fetch({
      url: withQuery(values),
      headers: Object.assign({'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,*/*'}, sourceHeaders),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('cms-json.request-failed');
    try { return JSON.parse(text(response.body).replace(/^\uFEFF/, '')); }
    catch (_) { throw new Error('cms-json.response-invalid'); }
  };
  const item = value => {
    const data = object(value);
    const id = text(data.vod_id || data.id).trim();
    const name = clean(data.vod_name || data.name);
    if (!id || !name) return null;
    const poster = text(data.vod_pic || data.pic).trim();
    const remark = clean(data.vod_remarks || data.note || data.type_name);
    return {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})};
  };
  const page = (payload, requestedPage) => {
    const data = object(payload);
    const current = Math.max(1, Number(data.page) || requestedPage || 1);
    const pageCount = Math.max(current, Number(data.pagecount || data.page_count) || current);
    return {page: current, pageCount, items: list(data.list).map(item).filter(Boolean)};
  };
  const normalizeCategory = value => {
    if (Array.isArray(value)) return {id: text(value[0]), name: clean(value[1])};
    const data = object(value);
    return {id: text(data.id || data.type_id), name: clean(data.name || data.type_name)};
  };
  const episodes = line => text(line).split('#').map((entry, index) => {
    const separator = entry.indexOf('$');
    const playId = (separator < 0 ? entry : entry.slice(separator + 1)).trim();
    if (!playId) return null;
    return {
      id: String(index + 1),
      name: clean(separator < 0 ? String(index + 1) : entry.slice(0, separator)) || String(index + 1),
      playId,
    };
  }).filter(Boolean);

  dxplay.register({
    id: 'org.dxsrc.shared.cms-json',
    name: 'CMS JSON',
    description: 'Small configurable adapter for one standard MacCMS JSON catalog and its direct media lines.',
    version: '1.1.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey).trim();
      sourceHeaders = object(input.headers);
      const extension = object(input.extension);
      const configuredApi = text(extension.api || extension.url).trim();
      apiUrl = text(configuredApi || DEFAULT_API).trim().replace(/[?&]$/, '');
      const categoryInput = extension.categories !== undefined
        ? extension.categories : (configuredApi ? [] : DEFAULT_CATEGORIES);
      declaredCategories = list(categoryInput)
        .map(normalizeCategory).filter(value => value.id && value.name);
      if (!sourceKey) throw new Error('cms-json.source-key-missing');
      if (!/^https?:\/\//i.test(apiUrl)) throw new Error('cms-json.api-invalid');
      return {ready: true};
    },
    async home() {
      const payload = object(await request({ac: 'list'}));
      const categories = declaredCategories.length ? declaredCategories
        : list(payload.class).filter(value => Number(object(value).type_pid || 0) === 0)
          .map(normalizeCategory).filter(value => value.id && value.name);
      if (!categories.length) throw new Error('cms-json.categories-unavailable');
      const featured = page(await request({ac: 'detail', t: categories[0].id, pg: 1}), 1).items;
      return {categories, featured};
    },
    async category(input) {
      const requested = Math.max(1, Number(input.page) || 1);
      return page(await request({ac: 'detail', t: input.categoryId, pg: requested}), requested);
    },
    async search(input) {
      const requested = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page: requested, pageCount: requested, items: []};
      return page(await request({ac: 'detail', wd: keyword, pg: requested}), requested);
    },
    async detail(input) {
      const id = text(input.id).trim();
      const payload = object(await request({ac: 'detail', ids: id}));
      const data = object(list(payload.list)[0]);
      if (!text(data.vod_id || data.id)) throw new Error('cms-json.item-not-found');
      const names = text(data.vod_play_from || data.play_from).split('$$$');
      const playGroups = text(data.vod_play_url || data.play_url).split('$$$').map((line, index) => {
        const values = episodes(line);
        return values.length ? {id: String(index + 1), name: clean(names[index]) || '\u7ebf\u8def ' + String(index + 1), episodes: values} : null;
      }).filter(Boolean);
      if (!playGroups.length) throw new Error('cms-json.detail-unavailable');
      const base = item(data);
      return {
        ...base,
        ...(data.vod_year ? {year: clean(data.vod_year)} : {}),
        ...(data.vod_area ? {area: clean(data.vod_area)} : {}),
        ...(data.vod_actor ? {actors: clean(data.vod_actor)} : {}),
        ...(data.vod_director ? {director: clean(data.vod_director)} : {}),
        description: clean(data.vod_content || data.vod_blurb),
        playGroups,
      };
    },
    async play(input) {
      const rawUrl = text(input.playId).trim();
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('cms-json.media-unsupported');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl,
        headers: Object.assign({'User-Agent': USER_AGENT}, sourceHeaders),
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      apiUrl = '';
      declaredCategories = [];
    },
  });
})();
