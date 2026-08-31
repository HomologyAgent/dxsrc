/* global dxplay */
(() => {
  'use strict';

  const SITE_URL = 'https://www.qtfm.cn';
  const API_URL = 'https://webbff.qtfm.cn/www';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const categories = [
    ['217', '广东'], ['99', '浙江'], ['3', '北京'], ['5', '天津'],
    ['7', '河北'], ['83', '上海'], ['19', '山西'], ['31', '内蒙古'],
    ['44', '辽宁'], ['59', '吉林'], ['69', '黑龙江'], ['85', '江苏'],
    ['111', '安徽'], ['129', '福建'], ['139', '江西'], ['151', '山东'],
    ['169', '河南'], ['187', '湖北'], ['202', '湖南'], ['239', '广西'],
    ['254', '海南'], ['257', '重庆'], ['259', '四川'], ['281', '贵州'],
    ['291', '云南'], ['316', '陕西'], ['327', '甘肃'], ['351', '宁夏'],
    ['357', '新疆'], ['308', '西藏'], ['342', '青海'], ['433', '资讯'],
    ['442', '音乐'], ['429', '交通'], ['439', '经济'], ['432', '文艺'],
    ['441', '都市'], ['430', '体育'], ['431', '双语'], ['440', '综合'],
    ['438', '生活'], ['435', '旅游'], ['436', '曲艺'], ['434', '方言'],
  ];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const imageUrl = value => {
    const url = text(value);
    return url.startsWith('//') ? 'https:' + url : url;
  };
  const headers = () => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: SITE_URL,
  }, sourceHeaders);
  const requestJson = async (url, options = {}) => {
    const response = await dxplay.fetch({
      url,
      method: options.method || 'GET',
      headers: Object.assign({}, headers(), options.headers || {}),
      ...(options.body === undefined ? {} : {body: options.body}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('qingting.request-failed');
    try { return JSON.parse(response.body); } catch (_error) { throw new Error('qingting.response-invalid'); }
  };
  const graph = async query => requestJson(API_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/json; charset=utf-8'},
    body: JSON.stringify({query}),
  });
  const item = value => ({
    id: text(value.id),
    sourceKey,
    name: text(value.title || value.id),
    ...(imageUrl(value.imgUrl || value.cover) ? {poster: imageUrl(value.imgUrl || value.cover)} : {}),
    ...(value.desc || value.description ? {remark: text(value.desc || value.description)} : {}),
  });
  const radioPage = async (categoryId, page) => {
    const data = await graph(`{ radioPage(cid:${Number(categoryId)}, page:${Number(page) || 1}){ contents } }`);
    const contents = data && data.data && data.data.radioPage && data.data.radioPage.contents;
    const items = contents && Array.isArray(contents.items) ? contents.items.map(item) : [];
    return {
      page: Number(page) || 1,
      pageCount: items.length < 12 ? Number(page) || 1 : (Number(page) || 1) + 1,
      items,
    };
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.qingting-fm',
    name: 'Qingting FM',
    description: 'Semantic rewrite of the jsm.json QingtingFM radio catalog.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      if (!sourceKey) throw new Error('qingting.source-key-missing');
      return {ready: true};
    },
    async home() {
      return {
        categories: categories.map(([id, name]) => ({id, name})),
        featured: [],
      };
    },
    async category(input) {
      return radioPage(input.categoryId, input.page);
    },
    async search(input) {
      const keyword = JSON.stringify(text(input.keyword));
      const page = Number(input.page) || 1;
      const data = await graph(`{ searchResultsPage(keyword:${keyword}, page:${page}, include:"channel_live") { searchData numFound } }`);
      const result = data && data.data && data.data.searchResultsPage;
      const items = result && Array.isArray(result.searchData) ? result.searchData.map(item) : [];
      return {page, items};
    },
    async detail(input) {
      const data = await requestJson('https://webapi.qtfm.cn/api/pc/radio/' + encodeURIComponent(input.id));
      const album = data && data.album;
      if (!album || !album.id) throw new Error('qingting.item-not-found');
      const selected = item(album);
      return {
        ...selected,
        description: text(album.description),
        playGroups: [{
          id: 'qingting',
          name: '蜻蜓FM',
          episodes: [{id: text(album.id), name: text(album.title), playId: text(album.id)}],
        }],
      };
    },
    async play(input) {
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: 'https://lhttp-hw.qtfm.cn/live/' + encodeURIComponent(input.playId) + '/64k.mp3',
        headers: headers(),
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
    },
  });
})();

