/* global dxplay */
(() => {
  'use strict';

  const API = 'https://api.bilibili.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const modes = {
    '\u54d4\u54e9\u5408\u96c6': [
      '\u641e\u7b11', '\u6e38\u620f', '\u5f71\u89c6\u96c6\u9526', '\u79d1\u6280\u6570\u7801', '\u97f3\u4e50', '\u660e\u661f\u5a31\u4e50',
      '\u4e09\u519c', '\u64ad\u5ba2', '\u4f53\u80b2\u8fd0\u52a8', '\u77e5\u8bc6', '\u7f8e\u5986\u7a7f\u642d', 'VLOG', '\u52a8\u7269\u661f\u7403',
      '\u5bb6\u5ead\u751f\u6d3b', '\u7f8e\u98df', '\u52a8\u753b\u6f2b\u753b', '\u6c7d\u8f66', '\u624b\u5de5\u7ed8\u753b', '\u8d44\u8baf', '\u821e\u8e48',
    ],
    '\u54d4\u54e9\u97f3\u4e50': ['\u534e\u8bed\u97f3\u4e50', '\u6b27\u7f8e\u97f3\u4e50', '\u65e5\u97e9\u97f3\u4e50', '\u6f14\u5531\u4f1a\u8d85\u6e05', '\u97f3\u4e50\u73b0\u573a'],
    '\u54d4\u54e9\u542c\u4e66': [
      '\u6709\u58f0\u5c0f\u8bf4', '\u7384\u5e7b\u6709\u58f0\u5c0f\u8bf4', '\u5947\u5e7b\u6709\u58f0\u5c0f\u8bf4', '\u90fd\u5e02\u6709\u58f0\u5c0f\u8bf4',
      '\u8a00\u60c5\u6709\u58f0\u5c0f\u8bf4', '\u6b66\u4fa0\u6709\u58f0\u5c0f\u8bf4', '\u4ed9\u4fa0\u6709\u58f0\u5c0f\u8bf4', '\u79d1\u5e7b\u6709\u58f0\u5c0f\u8bf4',
      '\u91cd\u751f\u6709\u58f0\u5c0f\u8bf4', '\u7a7f\u8d8a\u6709\u58f0\u5c0f\u8bf4', '\u6050\u6016\u60ca\u609a\u6709\u58f0\u5c0f\u8bf4', '\u7f51\u6e38\u7ade\u6280\u6709\u58f0\u5c0f\u8bf4',
    ],
    '\u54d4\u54e9\u76f8\u58f0': ['\u5355\u53e3\u76f8\u58f0', '\u7fa4\u53e3\u76f8\u58f0', '\u5fb7\u4e91\u793e', '\u90ed\u5fb7\u7eb2', '\u5cb3\u4e91\u9e4f', '\u76f8\u58f0\u5408\u96c6'],
    '\u54d4\u54e9\u5c0f\u54c1': ['\u6625\u665a\u5c0f\u54c1', '\u8d75\u672c\u5c71\u5c0f\u54c1', '\u9648\u4f69\u65af\u5c0f\u54c1', '\u6c88\u817e\u5c0f\u54c1', '\u559c\u5267\u5c0f\u54c1'],
    '\u54d4\u54e9\u620f\u66f2': ['\u4e8c\u4eba\u8f6c', '\u6f6e\u5267', '\u7ca4\u5267', '\u4eac\u5267', '\u8d8a\u5267', '\u9ec4\u6885\u620f', '\u8c6b\u5267', '\u6606\u66f2', '\u79e6\u8154'],
  };
  const commonFilters = [{
    key: 'order',
    name: '\u6392\u5e8f',
    initialValue: 'totalrank',
    options: [
      {name: '\u7efc\u5408', value: 'totalrank'}, {name: '\u6700\u591a\u70b9\u51fb', value: 'click'},
      {name: '\u6700\u65b0\u53d1\u5e03', value: 'pubdate'}, {name: '\u6700\u591a\u5f39\u5e55', value: 'dm'},
      {name: '\u6700\u591a\u6536\u85cf', value: 'stow'},
    ],
  }, {
    key: 'duration',
    name: '\u65f6\u957f',
    initialValue: '0',
    options: [
      {name: '\u5168\u90e8', value: '0'}, {name: '60 \u5206\u949f\u4ee5\u4e0a', value: '4'},
      {name: '30-60 \u5206\u949f', value: '3'}, {name: '10-30 \u5206\u949f', value: '2'},
      {name: '10 \u5206\u949f\u4ee5\u4e0b', value: '1'},
    ],
  }];
  let sourceKey = '';
  let sourceHeaders = {};
  let mode = '\u54d4\u54e9\u5408\u96c6';
  let categoryDocumentUrl = '';
  let cookie = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const cleanTitle = value => text(value).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
  const imageUrl = value => {
    const result = text(value).trim();
    return result.startsWith('//') ? 'https:' + result : result;
  };
  const headers = () => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: 'https://www.bilibili.com/',
    ...(cookie ? {Cookie: cookie} : {}),
  }, sourceHeaders);
  const requestJson = async url => {
    const response = await dxplay.fetch({url, headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('bili.request-failed');
    let result;
    try { result = JSON.parse(response.body); } catch (_error) { throw new Error('bili.response-invalid'); }
    if (result && result.code !== undefined && Number(result.code) !== 0) throw new Error('bili.upstream-failed');
    return result;
  };
  const mapFilters = value => {
    if (!Array.isArray(value)) return commonFilters;
    return value.map(filter => ({
      key: text(filter.key),
      name: text(filter.name || filter.key),
      ...(filter.value && filter.value[0] ? {initialValue: text(filter.value[0].v)} : {}),
      options: (Array.isArray(filter.value) ? filter.value : []).map(option => ({
        name: text(option.n), value: text(option.v),
      })),
    })).filter(filter => filter.key && filter.options.length > 0);
  };
  const item = value => ({
    id: text(value.aid || value.id),
    sourceKey,
    name: cleanTitle(value.title || value.name || value.aid),
    ...(imageUrl(value.pic || value.cover) ? {poster: imageUrl(value.pic || value.cover)} : {}),
    ...(value.duration || value.index_show || value.play ? {remark: text(value.duration || value.index_show || value.play)} : {}),
  });
  const searchPage = async (keyword, page, filters) => {
    const values = filters && typeof filters === 'object' ? filters : {};
    const query = 'search_type=video&keyword=' + encodeURIComponent(keyword)
      + '&order=' + encodeURIComponent(text(values.order || 'totalrank'))
      + '&duration=' + encodeURIComponent(text(values.duration || '0'))
      + '&page=' + page;
    const response = await requestJson(API + '/x/web-interface/wbi/search/type?' + query);
    return response && response.data && Array.isArray(response.data.result) ? response.data.result : [];
  };
  const publicCategories = async () => {
    if (categoryDocumentUrl) {
      const document = await requestJson(categoryDocumentUrl);
      const filters = document.filters && typeof document.filters === 'object' ? document.filters : {};
      return (Array.isArray(document.class) ? document.class : []).map(value => ({
        id: text(value.type_id),
        name: text(value.type_name),
        filters: mapFilters(filters[value.type_id]),
      })).filter(value => value.id && value.name);
    }
    const values = modes[mode] || modes['\u54d4\u54e9\u5408\u96c6'];
    return values.map(value => ({id: value, name: value, filters: commonFilters}));
  };
  const view = async aid => {
    const response = await requestJson(API + '/x/web-interface/view?aid=' + encodeURIComponent(aid));
    if (!response.data) throw new Error('bili.item-not-found');
    return response.data;
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.bili',
    name: 'Bilibili public catalog',
    description: 'Semantic rewrite of the shared jsm.json Bili public video catalog family.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : {};
      mode = text(extension.n || '\u54d4\u54e9\u5408\u96c6');
      categoryDocumentUrl = /^https?:\/\//i.test(text(extension.json)) ? text(extension.json) : '';
      cookie = typeof extension.cookie === 'string' && !/^https?:\/\//i.test(extension.cookie)
        ? extension.cookie : '';
      if (!sourceKey) throw new Error('bili.source-key-missing');
      return {ready: true};
    },
    async home() {
      const [categories, popular] = await Promise.all([
        publicCategories(),
        requestJson(API + '/x/web-interface/popular?ps=20&pn=1'),
      ]);
      const values = popular && popular.data && Array.isArray(popular.data.list) ? popular.data.list : [];
      return {categories, featured: values.map(item)};
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const keyword = text(input.categoryId)
        + (input.filters && input.filters.tid ? ' ' + text(input.filters.tid) : '');
      const values = await searchPage(keyword, page, input.filters);
      return {page, pageCount: values.length < 20 ? page : page + 1, items: values.map(item)};
    },
    async search(input) {
      const page = Number(input.page) || 1;
      const values = await searchPage(text(input.keyword).trim(), page, {});
      return {page, pageCount: values.length < 20 ? page : page + 1, items: values.map(item)};
    },
    async detail(input) {
      const data = await view(input.id);
      const pages = Array.isArray(data.pages) ? data.pages : [];
      return {
        id: text(data.aid || input.id),
        sourceKey,
        name: text(data.title || input.id),
        ...(imageUrl(data.pic) ? {poster: imageUrl(data.pic)} : {}),
        ...(data.owner && data.owner.name ? {actors: text(data.owner.name)} : {}),
        ...(data.duration ? {remark: Math.floor(Number(data.duration) / 60) + ' \u5206\u949f'} : {}),
        description: text(data.desc),
        playGroups: [{
          id: 'bili',
          name: 'B\u7ad9',
          episodes: pages.map((value, index) => ({
            id: text(value.cid || index + 1),
            name: text(value.part || '\u5206P ' + String(index + 1)),
            playId: text(data.aid || input.id) + '@' + text(value.cid),
          })),
        }],
      };
    },
    async play(input) {
      const parts = text(input.playId).split('@');
      if (!parts[0] || !parts[1]) throw new Error('bili.play-id-invalid');
      const response = await requestJson(API + '/x/player/playurl?avid=' + encodeURIComponent(parts[0])
        + '&cid=' + encodeURIComponent(parts[1]) + '&qn=32&fnval=0&fourk=0');
      const values = response && response.data && Array.isArray(response.data.durl) ? response.data.durl : [];
      const selected = values.find(value => value && value.url);
      if (!selected) throw new Error('bili.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: text(selected.url),
        headers: {'User-Agent': USER_AGENT, Referer: 'https://www.bilibili.com/'},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      mode = '\u54d4\u54e9\u5408\u96c6';
      categoryDocumentUrl = '';
      cookie = '';
    },
  });
})();
