/* global dxplay */
(() => {
  'use strict';

  const SITE = 'https://www.wasu.cn';
  const SEARCH_API = 'https://ups.5g.wasu.tv/rmp-user-suggest/1000101/hzhs/searchServlet';
  const DETAIL_API = 'https://mcspapp.5g.wasu.tv/bvradio_app/hzhs/newsServlet';
  const PLAY_API = 'https://mcspapp.5g.wasu.tv/thirdApiFile/file/getPlayUrl';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36';
  const CATEGORY_VALUES = [
    ['961', '电影', ['内地','港台','欧美','日韩','泰国','其他'], ['动作','科幻','惊悚','冒险','剧情','励志','爱情','喜剧','家庭','历史','魔幻','恐怖','战争','武侠']],
    ['962', '剧集', ['内地','港台','日韩','欧美','泰国','其他'], ['都市','爱情','战争','家庭','悬疑','古装','短剧','谍战','喜剧','农村','刑侦','武侠','历史']],
    ['963', '少儿', ['内地','日韩','欧美','港台','其他'], ['动作','冒险','益智','亲子','热血','剧情','魔幻','励志','搞笑','科幻','治愈','儿歌','教育']],
    ['965', '栏目', ['内地','欧美'], ['文化','纪实','访谈','历史','美食','旅游','时尚','情感','生活','真人秀']],
    ['966', '新闻', [], ['国内视野','国际纵览','军事话题','社会百态','央视频']],
  ];
  const YEARS = Array.from({length: 16}, (_, index) => String(2025 - index));
  let sourceKey = '';
  let sourceHeaders = {};
  let secretBase64 = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const query = values => Object.keys(values).filter(key => values[key] !== undefined && values[key] !== null)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key]))).join('&');
  const requestText = async (url, extraHeaders) => {
    const response = await dxplay.fetch({url, headers: Object.assign({'User-Agent': USER_AGENT}, sourceHeaders, extraHeaders || {})});
    if (response.status < 200 || response.status >= 300) throw new Error('wasu.request-failed');
    return response.body;
  };
  const ensureSecret = async () => {
    if (secretBase64) return secretBase64;
    const index = await requestText(SITE);
    const scriptPath = index.match(/src=["'](\/[\d.]+\/assets\/js\/index-[\w.-]+\.js)["']/i)?.[1] || '';
    if (!scriptPath) throw new Error('wasu.signing-script-missing');
    const script = await requestText(SITE + scriptPath);
    const keys = script.match(/const\s+\w+=["']([^"']+)["'],\w+=["']([^"']+)["'],\w+=["']([^"']+)["'];/);
    if (!keys || !keys[2]) throw new Error('wasu.signing-key-missing');
    secretBase64 = keys[2];
    return secretBase64;
  };
  const signedHeaders = async canonicalText => Object.assign({
    Accept: 'application/json, text/plain, */*',
    launchchannel: 'web_channel', Origin: SITE, Referer: SITE,
    siteid: '1000101', 'User-Agent': USER_AGENT,
    'x-sign': dxplay.crypto.hmacSha256({keyBase64: await ensureSecret(), text: canonicalText}),
  }, sourceHeaders);
  const getJson = async (url, parameters) => {
    const response = await dxplay.fetch({url: url + '?' + query(parameters), headers: await signedHeaders('{}')});
    if (response.status < 200 || response.status >= 300) throw new Error('wasu.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('wasu.response-invalid'); }
  };
  const postJson = async (url, body) => {
    const encoded = JSON.stringify(body);
    const response = await dxplay.fetch({
      url, method: 'POST', headers: Object.assign(await signedHeaders(encoded), {'Content-Type': 'application/json'}), body: encoded,
    });
    if (response.status < 200 || response.status >= 300) throw new Error('wasu.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('wasu.response-invalid'); }
  };
  const item = value => ({
    id: text(value && value.nodeId) + '@' + text(value && value.newsId),
    sourceKey, name: text(value && value.title) || text(value && value.newsId),
    ...(value && value.hPic ? {poster: text(value.hPic)} : {}),
    ...(value && value.episodeDesc ? {remark: text(value.episodeDesc)} : {}),
  });
  const optionList = values => [{name: '全部', value: '全部'}]
    .concat(values.map(value => ({name: value, value})));
  const filtersFor = category => {
    const filters = [];
    if (category[2].length) filters.push({key: 'area', name: '地区', initialValue: '全部', options: optionList(category[2])});
    if (category[3].length) filters.push({key: 'class', name: '类型', initialValue: '全部', options: optionList(category[3])});
    if (category[0] !== '966') filters.push({key: 'year', name: '年代', initialValue: '全部', options: optionList(YEARS)});
    return filters;
  };

  dxplay.register({
    id: 'org.dxsrc.qist.wasu',
    name: 'Wasu catalog',
    description: 'Readable rewrite of the public Wasu catalog, filters, search, detail API and signed HLS playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'wasu';
      sourceHeaders = input.headers || {};
      return {ready: true};
    },

    async home(input) {
      return {
        categories: CATEGORY_VALUES.map(value => ({
          id: value[0], name: value[1], ...(input.includeFilters ? {filters: filtersFor(value)} : {}),
        })),
        featured: [],
      };
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), filters = input.filters || {};
      const payload = await getJson(SEARCH_API, {
        functionName: 'getNewsSearchedByCondition', nodeId: input.categoryId,
        nodeTag: text(filters.class) || '全部', yearTag: text(filters.year) || '全部',
        countryTag: text(filters.area) || '全部', orderType: '0', pageSize: '40',
        page, keyword: '', siteId: '1000101',
      });
      return {page, items: list(payload.data).map(item).filter(value => value.id !== '@' && value.name)};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const payload = await getJson(SEARCH_API, {
        functionName: 'getNewsSearched', searchNewsType: '3,4,5', keyword: text(input.keyword),
        pageSize: 10, page, siteId: 1000101,
      });
      return {page, items: list(payload.data).map(item).filter(value => value.id !== '@' && value.name)};
    },

    async detail(input) {
      const id = text(input.id), parts = id.split('@');
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('wasu.item-not-found');
      const payload = await getJson(DETAIL_API, {
        siteId: '1000101', functionName: 'getCurrentNews', nodeId: parts[0], newsId: parts[1], platform: 'web',
      });
      const value = payload.data || {}, episodes = [];
      for (const vod of list(value.vodList)) {
        const files = list(vod && vod.fileList), selected = files.length > 1 ? files[1] : files[0];
        const playId = text(selected && selected.playUrl);
        if (playId) episodes.push({id: String(episodes.length + 1), name: text(vod.title) || String(episodes.length + 1), playId});
      }
      if (!episodes.length) throw new Error('wasu.item-not-found');
      return {
        id, sourceKey, name: text(value.title || value.newsTitle) || id,
        actors: text(value.actor), director: text(value.director), year: text(value.pubTime),
        area: text(value.countryTag), remark: text(value.episodeDesc),
        description: text(value.newsAbstract),
        playGroups: [{id: 'wasu', name: '华数专线', episodes}],
      };
    },

    async play(input) {
      const playUrl = text(input.playId).replace(/\.mp4(?=$|[?#])/i, '/playlist.m3u8');
      if (!/^https?:\/\//i.test(playUrl)) throw new Error('wasu.play-unavailable');
      const payload = await postJson(PLAY_API, {playUrl, platform: 'web'});
      const rawUrl = text(payload && payload.data && payload.data.playUrl);
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('wasu.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: Object.assign({'User-Agent': USER_AGENT, Origin: SITE, Referer: SITE}, sourceHeaders), parse: false,
      };
    },

    async destroy() { sourceKey = ''; sourceHeaders = {}; secretBase64 = ''; },
  });
})();
