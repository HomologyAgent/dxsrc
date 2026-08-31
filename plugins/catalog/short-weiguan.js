/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://api.drama.9ddm.com';
  const USER_AGENT = 'okhttp/5.1.0';
  let sourceKey = '';
  let sourceHeaders = {};
  let clientInfo = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const makeClientInfo = () => {
    let result = '';
    while (result.length < 32) result += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
    return result.slice(0, 32);
  };
  const querySuffix = () => 'version_code=1600&version_name=1.6.0'
    + '&device_name=DXPlay&device_type=phone&is_first_day=true&is_first_24h=true'
    + '&app_launch_way=icon&default_homepage=homepage_interaction'
    + '&device_owning_firm=DXPlay&font_scale=default&os_type=1'
    + '&clientInfo=' + encodeURIComponent(clientInfo);
  const requestJson = async (path, body) => {
    const response = await dxplay.fetch({
      url: BASE + path + (path.includes('?') ? '&' : '?') + querySuffix(),
      method: body ? 'POST' : 'GET',
      headers: Object.assign({
        'User-Agent': USER_AGENT,
        ...(body ? {'Content-Type': 'application/json'} : {}),
      }, sourceHeaders),
      ...(body ? {body: JSON.stringify(body)} : {}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('weiguan.request-failed');
    try { return JSON.parse(response.body); } catch (_error) { throw new Error('weiguan.response-invalid'); }
  };
  const searchPage = async (subject, keyword, page) => {
    const response = await requestJson('/drama/home/search', {
      audience: subject ? '全部' : '',
      order: subject ? '最新' : '',
      page,
      pageSize: 30,
      searchWord: text(keyword).trim(),
      subject: text(subject),
    });
    return Array.isArray(response.data) ? response.data : [];
  };
  const item = value => ({
    id: text(value.oneId),
    sourceKey,
    name: text(value.title || value.oneId),
    ...(value.horzPoster ? {poster: text(value.horzPoster)} : {}),
    ...(value.episodeCount ? {remark: text(value.episodeCount) + ' 集'} : {}),
  });
  const detailData = async id => {
    const response = await requestJson('/drama/home/shortVideoDetail?oneId=' + encodeURIComponent(id)
      + '&page=1&pageSize=1000&userId=0&queryAll=true');
    return response;
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.short-weiguan',
    name: 'Weiguan short drama',
    description: 'Semantic rewrite of the jsm.json ShortWeiguan short-drama catalog.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      if (!sourceKey) throw new Error('weiguan.source-key-missing');
      clientInfo = dxplay.storage.get('client') || makeClientInfo();
      dxplay.storage.set('client', clientInfo);
      return {ready: true};
    },
    async home() {
      const response = await requestJson('/drama/home/shortVideoTags');
      const tags = Array.isArray(response.tags) ? response.tags : [];
      return {
        categories: tags.map(value => ({id: text(value), name: text(value)})).filter(value => value.id),
        featured: [],
      };
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const values = await searchPage(input.categoryId, '', page);
      return {page, pageCount: values.length < 30 ? page : page + 1, items: values.map(item)};
    },
    async search(input) {
      const page = Number(input.page) || 1;
      const values = await searchPage('', input.keyword, page);
      return {page, pageCount: values.length < 30 ? page : page + 1, items: values.map(item)};
    },
    async detail(input) {
      const response = await detailData(input.id);
      const episodes = Array.isArray(response.data) ? response.data : [];
      return {
        id: text(input.id),
        sourceKey,
        name: text(response.title || input.id),
        ...(response.vertPoster ? {poster: text(response.vertPoster)} : {}),
        category: '短剧',
        description: text(response.description),
        playGroups: [{
          id: 'weiguan',
          name: '围观短剧',
          episodes: episodes.map((value, index) => ({
            id: text(value.playOrder || index + 1),
            name: '第 ' + text(value.playOrder || index + 1) + ' 集',
            playId: text(input.id) + '@' + String(index),
          })),
        }],
      };
    },
    async play(input) {
      const separator = text(input.playId).lastIndexOf('@');
      if (separator <= 0) throw new Error('weiguan.play-id-invalid');
      const id = text(input.playId).slice(0, separator);
      const response = await detailData(id);
      const episodes = Array.isArray(response.data) ? response.data : [];
      const episode = episodes[Number(text(input.playId).slice(separator + 1)) || 0];
      const values = episode && Array.isArray(episode.videoClarityList) ? episode.videoClarityList : [];
      const ordered = [...values].sort((left, right) => {
        const quality = value => Number(text(value && value.name).replace(/\D/g, '')) || 0;
        return quality(right) - quality(left);
      });
      const selected = ordered.find(value => value && value.url);
      if (!selected) throw new Error('weiguan.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: text(selected.url),
        headers: {'User-Agent': USER_AGENT},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      clientInfo = '';
    },
  });
})();
