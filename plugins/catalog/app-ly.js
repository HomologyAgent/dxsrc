/* global dxplay */
(() => {
  'use strict';
  const API = 'https://fly.daoran.tv/API_ROP';
  const PHOTO = 'https://ottphoto.daoran.tv/HD/';
  const HEADERS = {'Content-Type': 'application/json;charset=utf-8', 'User-Agent': 'okhttp/3.9.1', md5: 'SkvyrWqK9QHTdCT12Rhxunjx+WwMTe9y4KwgeASFDhbYabRSPskR0Q=='};
  let sourceKey = '';
  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const request = async (path, body) => {
    const response = await dxplay.fetch({url: API + path, method: 'POST', headers: HEADERS, body: JSON.stringify(body)});
    if (response.status < 200 || response.status >= 300) throw new Error('apply.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('apply.response-invalid'); }
  };
  const item = value => ({
    id: text(value.code), sourceKey, name: text(value.name),
    ...(text(value.img) ? {poster: PHOTO + text(value.img)} : {}),
    ...(text(value.publishTime) ? {remark: text(value.publishTime)} : {}),
  });
  dxplay.register({
    id: 'org.dxsrc.jsm.apply', name: 'Opera catalog',
    description: 'Semantic rewrite of the AppLY opera catalog and direct playback API.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'apply'; return {ready: true}; },
    async home() {
      const data = await request('/page/setinf/get', {leastNum: '0', memberId: 'yszyz', project: 'lyhxcx', userId: 'yszyz'});
      return {categories: list(data.sects).map(value => ({id: text(value.code), name: text(value.name)})), featured: []};
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const data = await request('/search/album/list', {cur: String(page), free: '0', item: 'o5', pageSize: '20', sect: [text(input.categoryId)]});
      const values = list(object(data.pb).dataList);
      return {page, pageCount: values.length ? page + 1 : page, items: values.map(item)};
    },
    async search(input) { return {page: Number(input.page) || 1, pageCount: 1, items: []}; },
    async detail(input) {
      const data = await request('/album/res/list', {albumCode: text(input.id), cur: '1', project: 'lyhxcx', pageSize: '2147483647', selectFlag: '0', userId: 'yszyz'});
      const album = object(data.album);
      const episodes = list(object(data.pb).dataList).map((value, index) => ({id: String(index), name: text(value.name), playId: text(value.code)})).filter(value => value.playId);
      if (!text(album.name) || !episodes.length) throw new Error('apply.item-not-found');
      return {id: text(input.id), sourceKey, name: text(album.name),
        ...(text(album.img) ? {poster: PHOTO + text(album.img)} : {}), category: text(album.sect),
        year: text(album.publishTime), actors: text(album.artistName), description: text(album.des),
        playGroups: [{id: 'online', name: '在线播放', episodes}]};
    },
    async play(input) {
      const data = await request('/play/get/playurl', {item: 'y9', nodeCode: '001000', project: 'lyhxcx', px: '2', resCode: text(input.playId), userId: '92315ec6e58a45ba7f47fd143b3d7956'});
      const url = text(object(data.playres).playurl);
      if (!/^https?:\/\//i.test(url)) throw new Error('apply.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {}, parse: false};
    },
    async destroy() { sourceKey = ''; },
  });
})();
