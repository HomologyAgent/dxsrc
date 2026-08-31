/* global dxplay */
(() => {
  'use strict';

  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const names = [
    '故事会', '儿童文学', '少年读物', '文艺少年', '青春励志', '个人提升',
    '育儿心经', '心理哲学', '家庭健康', '历史小说', '科技科普', '经典必读',
    '商业财经', '红色岁月', '音乐戏剧', '社会观察', '相声评书', '国学经典',
  ];
  const ids = [
    '1303', '1304', '1305', '1306', '1307', '1308', '1309', '1310', '1311',
    '1312', '1313', '1314', '1315', '1316', '1317', '1318', '1319', '1320',
  ];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const requestJson = async url => {
    const response = await dxplay.fetch({
      url,
      headers: Object.assign({'User-Agent': USER_AGENT}, sourceHeaders),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('bokan.request-failed');
    try { return JSON.parse(response.body); } catch (_error) { throw new Error('bokan.response-invalid'); }
  };
  const albumId = value => text(value.id) + '@' + encodeURIComponent(text(value.name));
  const albumName = opaqueId => {
    const separator = text(opaqueId).indexOf('@');
    if (separator < 0) return '';
    try { return decodeURIComponent(text(opaqueId).slice(separator + 1)); } catch (_error) { return ''; }
  };
  const numericId = opaqueId => text(opaqueId).split('@')[0];
  const item = value => ({
    id: albumId(value),
    sourceKey,
    name: text(value.name || value.id),
    ...(value.cover ? {poster: text(value.cover)} : {}),
    ...(value.extra && value.extra.author || value.press
      ? {remark: text(value.extra && value.extra.author || value.press)} : {}),
  });
  const unitsPage = async (id, page) => {
    const response = await requestJson('https://api.bookan.com.cn/voice/album/units?album_id='
      + encodeURIComponent(id) + '&page=' + page + '&num=200&order=1');
    if (Number(response.code) !== 0 || !response.data) throw new Error('bokan.item-not-found');
    return response.data;
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.ting-bokan',
    name: 'Bokan audio books',
    description: 'Semantic rewrite of the jsm.json TingBokan audio-book catalog.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      if (!sourceKey) throw new Error('bokan.source-key-missing');
      return {ready: true};
    },
    async home() {
      return {
        categories: ids.slice(0, 11).map((id, index) => ({id, name: names[index]})),
        featured: [],
      };
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const response = await requestJson('https://api.bookan.com.cn/voice/book/list?instance_id=25304&page='
        + page + '&category_id=' + encodeURIComponent(input.categoryId) + '&num=24');
      const data = Number(response.code) === 0 && response.data ? response.data : {};
      const values = Array.isArray(data.list) ? data.list : [];
      return {page, pageCount: Number(data.last_page) || page, items: values.map(item)};
    },
    async search(input) {
      const page = Number(input.page) || 1;
      const response = await requestJson('https://es.bookan.com.cn/api/v3/voice/book?instanceId=25304&keyword='
        + encodeURIComponent(text(input.keyword).trim()) + '&pageNum=' + page + '&limitNum=20');
      const data = Number(response.code) === 0 && response.data ? response.data : {};
      const values = Array.isArray(data.list) ? data.list : [];
      return {page, items: values.map(item)};
    },
    async detail(input) {
      const id = numericId(input.id);
      const episodes = [];
      let updated = '';
      let page = 1;
      let lastPage = 1;
      do {
        const data = await unitsPage(id, page);
        lastPage = Math.min(Number(data.last_page) || 1, 20);
        const values = Array.isArray(data.list) ? data.list : [];
        if (page === 1 && values[0] && values[0].updated_at) updated = '更新于 ' + text(values[0].updated_at);
        values.forEach((value, index) => episodes.push({
          id: text(value.id || page + '-' + index),
          name: text(value.title || value.id),
          playId: id + '@' + page + '@' + index,
        }));
        page += 1;
      } while (page <= lastPage);
      return {
        id: text(input.id),
        sourceKey,
        name: albumName(input.id) || id,
        ...(updated ? {remark: updated} : {}),
        playGroups: [{id: 'bokan', name: '博看听书', episodes}],
      };
    },
    async play(input) {
      const parts = text(input.playId).split('@');
      const data = await unitsPage(parts[0], Number(parts[1]) || 1);
      const values = Array.isArray(data.list) ? data.list : [];
      const selected = values[Number(parts[2]) || 0];
      if (!selected || !selected.file) throw new Error('bokan.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: text(selected.file),
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

