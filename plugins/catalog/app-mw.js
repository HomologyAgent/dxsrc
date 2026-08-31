/* global dxplay */
(() => {
  'use strict';

  const SIGNING_KEY = 'cb808529bae6b6be45ecfab29a4889bc';
  const DEFAULT_SITES = ['https://www.sdzhgt.com', 'https://m.sdzhgt.com'];
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  let sourceKey = '';
  let baseUrl = '';
  let configuredSites = DEFAULT_SITES;
  let initialTypes = null;

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const cleanBase = value => text(value).trim().replace(/\/+$/, '');
  const sitesFrom = extension => {
    const raw = object(extension).sites || object(extension).site || object(extension).baseUrl;
    const values = Array.isArray(raw) ? raw : text(raw).split(',');
    const sites = values.map(cleanBase).filter(value => /^https?:\/\//i.test(value));
    return sites.length ? sites : DEFAULT_SITES;
  };
  const uuid = () => {
    const alphabet = '0123456789abcdef';
    let value = '';
    for (let index = 0; index < 32; index += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
    return value.slice(0, 8) + '-' + value.slice(8, 12) + '-4' + value.slice(13, 16)
      + '-' + ((8 + Math.floor(Math.random() * 4)).toString(16)) + value.slice(17, 20) + '-' + value.slice(20);
  };
  const query = pairs => pairs.map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(text(value))).join('&');
  const signedHeaders = pairs => {
    const timestamp = String(Date.now());
    const canonical = pairs.map(([key, value]) => key + '=' + text(value)).concat(['key=' + SIGNING_KEY, 't=' + timestamp]).join('&');
    return {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      Referer: baseUrl + '/',
      t: timestamp,
      sign: dxplay.crypto.sha1(dxplay.crypto.md5(canonical)),
      deviceid: uuid(),
    };
  };
  const getJson = async (path, pairs) => {
    const values = pairs || [];
    const suffix = values.length ? (path.includes('?') ? '&' : '?') + query(values) : '';
    const response = await dxplay.fetch({url: baseUrl + path + suffix, headers: signedHeaders(values)});
    if (response.status < 200 || response.status >= 300) throw new Error('appmw.request-failed');
    let payload;
    try { payload = JSON.parse(response.body); } catch (_) { throw new Error('appmw.response-invalid'); }
    if (!payload || payload.data === undefined || payload.data === null) throw new Error('appmw.remote-failed');
    return payload.data;
  };
  const selectSite = async () => {
    let lastError = null;
    for (const site of configuredSites) {
      baseUrl = site;
      try {
        const data = await getJson('/api/mw-movie/anonymous/get/filer/type', []);
        if (Array.isArray(data) && data.length) { initialTypes = data; return; }
      } catch (error) { lastError = error; }
    }
    baseUrl = '';
    throw lastError || new Error('appmw.site-unavailable');
  };
  const mapItem = value => {
    const item = object(value);
    const id = text(item.vodId || item.id);
    const name = text(item.vodName || item.name || id);
    if (!id || !name) return null;
    const poster = text(item.vodPic || item.pic);
    const remark = text(Number(item.typeId1) === 1 ? (item.vodVersion || item.vodRemarks) : (item.vodRemarks || item.vodVersion));
    return {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})};
  };
  const mapItems = values => list(values).map(mapItem).filter(Boolean);
  const filterOptions = (values, valueField) => list(values).map(value => {
    const item = object(value);
    const name = text(item.itemText);
    const optionValue = valueField === 'value' ? text(item.itemValue) : name;
    return name ? {name, value: name === '全部' ? '' : optionValue} : null;
  }).filter(Boolean);
  const makeFilter = (key, name, values, valueField) => {
    const options = filterOptions(values, valueField);
    return options.length ? {key, name, initialValue: '', options} : null;
  };
  const categoryFilters = (id, raw) => {
    const value = object(raw);
    const sortOptions = (id === '1'
      ? [{name: '人气高低', value: '3'}, {name: '评分高低', value: '4'}]
      : [{name: '最近更新', value: '2'}, {name: '人气高低', value: '3'}, {name: '评分高低', value: '4'}]);
    return [
      makeFilter('type', '类型', value.typeList, 'value'),
      makeFilter('v_class', '剧情', value.plotList, 'text'),
      makeFilter('area', '地区', value.districtList, 'text'),
      makeFilter('year', '年份', value.yearList, 'text'),
      makeFilter('lang', '语言', value.languageList, 'text'),
      {key: 'sort', name: '排序', initialValue: sortOptions[0].value, options: sortOptions},
    ].filter(Boolean);
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.app-mw',
    name: 'MW Movie app catalog',
    description: 'Semantic rewrite of the MW Movie API family with ordered legacy signatures, filters, episodes and native HLS playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'appmw';
      configuredSites = sitesFrom(input.extension);
      initialTypes = null;
      await selectSite();
      return {ready: true};
    },

    async home() {
      if (!baseUrl) throw new Error('appmw.not-ready');
      const types = initialTypes || await getJson('/api/mw-movie/anonymous/get/filer/type', []);
      initialTypes = null;
      const [filterData, homeData, hotData] = await Promise.all([
        getJson('/api/mw-movie/anonymous/v1/get/filer/list', []),
        getJson('/api/mw-movie/anonymous/v1/home/all/list', []),
        getJson('/api/mw-movie/anonymous/home/hotSearch', []),
      ]);
      const filtersByType = object(filterData);
      const categories = list(types).map(value => {
        const id = text(value.typeId);
        const name = text(value.typeName);
        const filters = categoryFilters(id, filtersByType[id]);
        return id && name ? {id, name, ...(filters.length ? {filters} : {})} : null;
      }).filter(Boolean);
      const seen = Object.create(null);
      const combined = [];
      for (const section of Object.values(object(homeData))) combined.push(...list(object(section).list));
      combined.push(...list(hotData));
      const featured = mapItems(combined).filter(item => seen[item.id] ? false : (seen[item.id] = true));
      return {categories, featured};
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const selected = object(input.filters);
      const pairs = [
        ['area', text(selected.area)], ['filterStatus', '1'], ['lang', text(selected.lang)],
        ['pageNum', String(page)], ['pageSize', '30'], ['sort', text(selected.sort) || '1'],
        ['sortBy', '1'], ['type', text(selected.type)], ['type1', text(input.categoryId)],
        ['v_class', text(selected.v_class)], ['year', text(selected.year)],
      ];
      const data = object(await getJson('/api/mw-movie/anonymous/video/list', pairs));
      const items = mapItems(data.list);
      const totalPages = Number(data.pages || data.pageCount || data.totalPage);
      return {page, ...(Number.isFinite(totalPages) && totalPages > 0 ? {pageCount: totalPages} : {}), items};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const pairs = [['keyword', text(input.keyword)], ['pageNum', String(page)], ['pageSize', '12']];
      const data = object(await getJson('/api/mw-movie/anonymous/video/searchByWord', pairs));
      const result = object(data.result);
      const items = mapItems(result.list);
      const total = Number(result.total || data.total);
      return {page, ...(Number.isFinite(total) && total >= 0 ? {pageCount: Math.max(1, Math.ceil(total / 12))} : {}), items};
    },

    async detail(input) {
      const id = text(input.id);
      if (!id) throw new Error('appmw.item-invalid');
      const data = object(await getJson('/api/mw-movie/anonymous/video/detail', [['id', id]]));
      const episodes = list(data.episodeList).map((episode, index) => {
        const nid = text(episode.nid);
        return nid ? {id: nid, name: text(episode.name) || String(index + 1), playId: JSON.stringify({id, nid})} : null;
      }).filter(Boolean);
      if (!episodes.length) throw new Error('appmw.episodes-unavailable');
      const poster = text(data.vodPic);
      return {
        id, sourceKey, name: text(data.vodName) || id, ...(poster ? {poster} : {}),
        remark: text(data.vodRemarks), year: text(data.vodYear), area: text(data.vodArea),
        actors: text(data.vodActor), director: text(data.vodDirector), description: text(data.vodContent),
        playGroups: [{id: 'mw', name: '默认线路', episodes}],
      };
    },

    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); } catch (_) { throw new Error('appmw.play-invalid'); }
      const id = text(descriptor.id), nid = text(descriptor.nid);
      if (!id || !nid) throw new Error('appmw.play-invalid');
      const data = object(await getJson('/api/mw-movie/anonymous/v2/video/episode/url', [['id', id], ['nid', nid]]));
      const choice = list(data.list).find(value => /^https?:\/\//i.test(text(value.url)));
      if (!choice) throw new Error('appmw.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: text(choice.url),
        headers: {'User-Agent': USER_AGENT, Origin: baseUrl, Referer: baseUrl + '/'}, parse: false,
      };
    },

    async destroy() {
      sourceKey = '';
      baseUrl = '';
      configuredSites = DEFAULT_SITES;
      initialTypes = null;
    },
  });
})();
