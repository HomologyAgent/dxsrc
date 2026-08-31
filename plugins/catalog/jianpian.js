/* global dxplay */
(() => {
  'use strict';

  const API = 'https://api.ztcgi.com';
  const FALLBACK_IMAGE = 'https://img.jianpian.com';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; TV) AppleWebKit/537.36 Chrome/151 Safari/537.36';
  const CATEGORIES = [['1', '电影'], ['2', '电视剧'], ['3', '动漫'], ['4', '综艺']];
  const FILTERS = [
    ['cateId', '分类', [['', '全部'], ['1', '剧情'], ['2', '爱情'], ['3', '动画'], ['4', '喜剧'], ['5', '战争'], ['7', '古装'], ['8', '奇幻'], ['9', '冒险'], ['10', '动作'], ['11', '科幻'], ['12', '悬疑'], ['13', '犯罪'], ['14', '家庭'], ['18', '惊悚'], ['24', '武侠'], ['25', '恐怖']]],
    ['area', '地区', [['', '全部'], ['1', '国产'], ['3', '中国香港'], ['6', '中国台湾'], ['5', '美国'], ['18', '韩国'], ['2', '日本']]],
    ['year', '年代', [['', '全部'], ['107', '2025'], ['119', '2024'], ['153', '2023'], ['101', '2022'], ['118', '2021'], ['16', '2020'], ['7', '2019'], ['22', '2016'], ['2015', '2015以前']]],
    ['sort', '排序', [['', '默认'], ['update', '最新'], ['hot', '最热'], ['rating', '评分']]],
  ].map(value => ({
    key: value[0], name: value[1], initialValue: value[2][0][0],
    options: value[2].map(option => ({value: option[0], name: option[1]})),
  }));

  let sourceKey = '';
  let imageBase = FALLBACK_IMAGE;
  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const query = values => Object.keys(values).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key]))).join('&');
  const image = value => {
    const path = text(value);
    return /^https?:\/\//i.test(path) ? path : imageBase.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
  };
  const request = async path => {
    const response = await dxplay.fetch({url: API + path, headers: {'User-Agent': USER_AGENT, Referer: API}});
    if (response.status < 200 || response.status >= 300) throw new Error('jianpian.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('jianpian.response-invalid'); }
  };
  const item = value => ({
    id: text(value.id || value.jump_id), sourceKey, name: text(value.title) || text(value.id),
    ...(value.path || value.thumbnail ? {poster: image(value.path || value.thumbnail)} : {}),
    remark: text(value.mask),
  });

  dxplay.register({
    id: 'org.dxsrc.jianpian',
    name: 'Jianpian catalog',
    description: 'Readable catalog rewrite of the reachable Jianpian JSON API and its direct HTTP media lines.',
    version: '1.1.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'jianpian';
      imageBase = FALLBACK_IMAGE;
      try {
        const payload = await request('/api/appAuthConfig');
        const domain = text(payload.data && payload.data.imgDomain);
        if (domain) imageBase = /^https?:\/\//i.test(domain) ? domain : 'https://' + domain;
      } catch (_) {}
      return {ready: true};
    },

    async home() {
      const payload = await request('/api/slide/list?pos_id=88');
      return {
        categories: CATEGORIES.map(value => ({id: value[0], name: value[1], filters: FILTERS})),
        featured: list(payload.data).slice(0, 40).map(item).filter(value => value.id && value.name),
      };
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const filters = input.filters || {};
      const payload = await request('/api/crumb/list?' + query({
        fcate_pid: input.categoryId, category_id: '', area: filters.area || '', year: filters.year || '',
        type: filters.cateId || '', sort: filters.sort || '', page,
      }));
      const items = list(payload.data).map(item).filter(value => value.id && value.name);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const payload = await request('/api/v2/search/videoV2?' + query({key: input.keyword, category_id: 88, page: 1, pageSize: 20}));
      return {page, pageCount: 1, items: list(payload.data).map(item).filter(value => value.id && value.name)};
    },

    async detail(input) {
      const id = text(input.id);
      const payload = await request('/api/video/detailv2?id=' + encodeURIComponent(id));
      const value = payload.data || {};
      const playGroups = list(value.source_list_source).map((line, lineIndex) => {
        const episodes = list(line.source_list).map((episode, episodeIndex) => {
          const url = text(episode.url);
          return /^https?:\/\//i.test(url) ? {
            id: text(episode.id) || String(episodeIndex + 1),
            name: text(episode.source_name) || String(episodeIndex + 1),
            playId: url,
          } : null;
        }).filter(Boolean);
        return episodes.length ? {id: String(lineIndex + 1), name: text(line.name) || '线路 ' + (lineIndex + 1), episodes} : null;
      }).filter(Boolean);
      if (!text(value.title) || !playGroups.length) throw new Error('jianpian.item-not-found');
      return {
        id, sourceKey, name: text(value.title), poster: image(value.thumbnail), year: text(value.year),
        area: text(value.area), remark: text(value.mask || value.score), description: text(value.description), playGroups,
      };
    },

    async play(input) {
      const url = text(input.playId);
      if (!/^https?:\/\//i.test(url)) throw new Error('jianpian.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url,
        headers: {'User-Agent': USER_AGENT, Referer: API}, parse: false,
      };
    },

    async destroy() { sourceKey = ''; imageBase = FALLBACK_IMAGE; },
  });
})();
