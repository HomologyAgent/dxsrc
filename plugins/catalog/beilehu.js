/* global dxplay */
(() => {
  'use strict';

  const API = 'https://vd.ubestkid.com/api/v1/bv/video';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const categoryValues = [
    ['56', '儿歌'], ['63', '故事'], ['62', '少儿'],
    ['61', '古诗'], ['64', '认知'], ['65', '习惯'],
  ];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const requestPage = async (categoryId, page) => {
    const response = await dxplay.fetch({
      url: API,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        appver: '6.1.9',
      }, sourceHeaders),
      body: JSON.stringify({
        age: 1,
        appver: '6.1.9',
        egvip_status: 0,
        svip_status: 0,
        vps: 60,
        subcateId: Number(categoryId),
        p: Number(page) || 1,
      }),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('beilehu.request-failed');
    let data;
    try { data = JSON.parse(response.body); } catch (_error) { throw new Error('beilehu.response-invalid'); }
    return data && data.result && Array.isArray(data.result.items) ? data.result.items : [];
  };
  const identity = (value, categoryId, page) =>
    text(value.vid) + '@' + text(categoryId || value.subcateid || 1) + '@' + text(page || 1);
  const item = (value, categoryId, page) => {
    const seconds = Math.floor((Number(value.endInterval) || 0) / 10);
    const duration = seconds > 0
      ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
      : text(value.brand);
    return {
      id: identity(value, categoryId, page),
      sourceKey,
      name: text(value.title || value.vid),
      ...(value.image2 || value.image ? {poster: text(value.image2 || value.image)} : {}),
      ...(duration ? {remark: duration} : {}),
    };
  };
  const lookup = async opaqueId => {
    const parts = text(opaqueId).split('@');
    if (!parts[0] || !parts[1]) throw new Error('beilehu.item-id-invalid');
    const values = await requestPage(parts[1], Number(parts[2]) || 1);
    const selected = values.find(value => text(value.vid) === parts[0]);
    if (!selected) throw new Error('beilehu.item-not-found');
    return {value: selected, categoryId: parts[1], page: Number(parts[2]) || 1};
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.beilehu',
    name: 'BeiLeHu',
    description: 'Semantic rewrite of the jsm.json BeiLeHu children video catalog.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      if (!sourceKey) throw new Error('beilehu.source-key-missing');
      return {ready: true};
    },
    async home() {
      const featuredValues = await requestPage('56', 1);
      return {
        categories: categoryValues.map(([id, name]) => ({id, name})),
        featured: featuredValues.slice(0, 20).map(value => item(value, '56', 1)),
      };
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const values = await requestPage(input.categoryId, page);
      return {
        page,
        pageCount: values.length === 0 ? page : page + 1,
        items: values.map(value => item(value, input.categoryId, page)),
      };
    },
    async search(input) {
      return {page: Number(input.page) || 1, pageCount: 1, items: []};
    },
    async detail(input) {
      const selected = await lookup(input.id);
      const value = selected.value;
      return {
        ...item(value, selected.categoryId, selected.page),
        category: '少儿',
        description: text(value.desc),
        playGroups: [{
          id: 'beilehu',
          name: '贝乐虎',
          episodes: [{id: text(value.vid), name: text(value.title), playId: text(input.id)}],
        }],
      };
    },
    async play(input) {
      const selected = await lookup(input.playId);
      const resources = Array.isArray(selected.value.videoResource) ? selected.value.videoResource : [];
      const ordered = [...resources].sort((left, right) => {
        const quality = value => Number(String(value && value.ratio || '').replace(/\D/g, '')) || 0;
        return quality(right) - quality(left);
      });
      const media = ordered.find(value => value && value.url) || selected.value;
      if (!media.url) throw new Error('beilehu.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: text(media.url),
        headers: {'User-Agent': USER_AGENT},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
    },
  });
})();

