/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://cc.163.com';
  const LIST_API = BASE + '/api/category/live/?format=json';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const imageUrl = value => {
    const result = text(value).trim();
    if (result.startsWith('//')) return 'https:' + result;
    if (result.startsWith('http://')) return 'https://' + result.slice(7);
    return result;
  };
  const headers = () => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: BASE + '/',
    Accept: 'application/json,text/plain,*/*',
  }, sourceHeaders);
  const request = async url => {
    const response = await dxplay.fetch({url, headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('netease-cc.request-failed');
    return response.body;
  };
  const requestJson = async url => {
    const body = await request(url);
    try { return JSON.parse(body); } catch (_) { throw new Error('netease-cc.response-invalid'); }
  };
  const liveRooms = async (start, size) => {
    const result = await requestJson(LIST_API + '&start=' + start + '&size=' + size);
    return Array.isArray(result.lives) ? result.lives : [];
  };
  const formatOnline = value => {
    const count = Math.max(0, Number(value) || 0);
    if (count >= 10000) return (count / 10000).toFixed(count >= 100000 ? 0 : 1) + '万';
    return String(count);
  };
  const roomItem = value => ({
    id: text(value.cuteid || value.roomid || value.room_id),
    sourceKey,
    name: text(value.title || value.nickname || value.cuteid),
    ...(imageUrl(value.cover || value.poster || value.static_cover169) ? {
      poster: imageUrl(value.cover || value.poster || value.static_cover169),
    } : {}),
    remark: [text(value.nickname), text(value.gamename), formatOnline(value.webcc_visitor || value.visitor) + '人']
      .filter(Boolean).join(' · '),
  });
  const roomData = async roomId => {
    const html = await request(BASE + '/' + encodeURIComponent(roomId));
    const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!match) throw new Error('netease-cc.room-data-missing');
    let document;
    try { document = JSON.parse(match[1]); } catch (_) { throw new Error('netease-cc.room-data-invalid'); }
    const data = document && document.props && document.props.pageProps && document.props.pageProps.roomInfoInitData;
    if (!data || !data.live) throw new Error('netease-cc.room-unavailable');
    return data;
  };

  dxplay.register({
    id: 'org.dxsrc.xiaosa.netease-cc-live',
    name: 'NetEase CC live',
    description: 'Readable rewrite of the public NetEase CC room catalog, metadata and native HLS playback flow.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'netease-cc-live';
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      return {ready: true};
    },
    async home() {
      const rooms = await liveRooms(0, 20);
      return {
        categories: [{id: 'live', name: '热门直播'}],
        featured: rooms.map(roomItem).filter(value => value.id),
      };
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const rooms = await liveRooms((page - 1) * 20, 20);
      return {
        page,
        pageCount: rooms.length < 20 ? page : page + 1,
        items: rooms.map(roomItem).filter(value => value.id),
      };
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim().toLowerCase();
      if (!keyword) return {page, pageCount: page, items: []};
      const rooms = await liveRooms(0, 100);
      const items = rooms.filter(value => [value.title, value.nickname, value.gamename]
        .some(field => text(field).toLowerCase().includes(keyword)))
        .map(roomItem).filter(value => value.id);
      return {page, pageCount: page, items: page === 1 ? items : []};
    },
    async detail(input) {
      const roomId = text(input.id).replace(/\D/g, '');
      if (!roomId) throw new Error('netease-cc.room-id-invalid');
      const data = await roomData(roomId);
      const live = data.live;
      if (!text(live.m3u8).startsWith('http')) throw new Error('netease-cc.stream-unavailable');
      return {
        id: text(live.cuteid || roomId),
        sourceKey,
        name: text(live.title || live.nickname || roomId),
        ...(imageUrl(live.cover || live.poster) ? {poster: imageUrl(live.cover || live.poster)} : {}),
        ...(text(live.nickname) ? {actors: text(live.nickname)} : {}),
        ...(text(live.gamename) ? {remark: text(live.gamename)} : {}),
        description: text(data.description_suffix || live.comment),
        playGroups: [{
          id: 'live',
          name: '直播',
          episodes: [{id: 'live', name: '直播', playId: text(live.cuteid || roomId)}],
        }],
      };
    },
    async play(input) {
      const roomId = text(input.playId).replace(/\D/g, '');
      if (!roomId) throw new Error('netease-cc.play-id-invalid');
      const data = await roomData(roomId);
      const url = text(data.live && data.live.m3u8);
      if (!/^https?:\/\//i.test(url)) throw new Error('netease-cc.stream-unavailable');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl: url,
        headers: {'User-Agent': USER_AGENT, Referer: BASE + '/'},
        parse: false,
      };
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
