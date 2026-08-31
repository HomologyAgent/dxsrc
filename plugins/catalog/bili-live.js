/* global dxplay */
(() => {
  'use strict';

  const SEARCH_API = 'https://api.bilibili.com/x/web-interface/wbi/search/type';
  const LIVE_API = 'https://api.live.bilibili.com';
  const LIVE_REFERER = 'https://live.bilibili.com/';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const CATEGORIES = [
    ['舞蹈', '舞蹈'], ['音乐', '音乐'], ['手游', '手游'], ['网游', '网游'],
    ['单机游戏', '单机游戏'], ['虚拟主播', '虚拟主播'], ['电台', '电台'],
    ['体育', '体育'], ['聊天', '聊天'], ['娱乐', '娱乐'], ['电影', '影视'], ['新闻', '新闻'],
  ];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const cleanTitle = value => text(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  const imageUrl = value => {
    const result = text(value).trim();
    return result.startsWith('//') ? 'https:' + result : result;
  };
  const headers = () => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: LIVE_REFERER,
    Origin: 'https://live.bilibili.com',
    Accept: 'application/json,text/plain,*/*',
  }, sourceHeaders);
  const requestJson = async url => {
    const response = await dxplay.fetch({url, headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('bili-live.request-failed');
    let result;
    try { result = JSON.parse(response.body); } catch (_) { throw new Error('bili-live.response-invalid'); }
    if (!result || Number(result.code) !== 0) throw new Error('bili-live.upstream-failed');
    return result;
  };
  const formatOnline = value => {
    const count = Math.max(0, Number(value) || 0);
    if (count >= 10000) return (count / 10000).toFixed(count >= 100000 ? 0 : 1) + '万';
    return String(count);
  };
  const roomItem = value => ({
    id: text(value.roomid || value.room_id || value.short_id),
    sourceKey,
    name: cleanTitle(value.title || value.uname || value.roomid),
    ...(imageUrl(value.user_cover || value.cover || value.keyframe) ? {
      poster: imageUrl(value.user_cover || value.cover || value.keyframe),
    } : {}),
    remark: [text(value.uname), text(value.cate_name), formatOnline(value.online) + '人在线']
      .filter(Boolean).join(' · '),
  });
  const searchRooms = async (keyword, page) => {
    const url = SEARCH_API + '?search_type=live&keyword=' + encodeURIComponent(keyword) + '&page=' + page;
    const response = await requestJson(url);
    const data = response.data || {};
    const result = data.result || {};
    return {
      items: (Array.isArray(result.live_room) ? result.live_room : []).map(roomItem).filter(value => value.id),
      pageCount: Math.max(page, Number(data.numPages) || Number(data.pageinfo && data.pageinfo.live_room
        && data.pageinfo.live_room.numPages) || page),
    };
  };
  const roomInfo = async roomId => {
    const response = await requestJson(LIVE_API + '/room/v1/Room/get_info?room_id=' + encodeURIComponent(roomId));
    if (!response.data || !response.data.room_id) throw new Error('bili-live.room-unavailable');
    return response.data;
  };
  const playInfo = async roomId => {
    const query = 'room_id=' + encodeURIComponent(roomId)
      + '&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&ptype=8';
    const response = await requestJson(LIVE_API + '/xlive/web-room/v2/index/getRoomPlayInfo?' + query);
    const value = response.data && response.data.playurl_info && response.data.playurl_info.playurl;
    if (!value || !Array.isArray(value.stream)) throw new Error('bili-live.stream-unavailable');
    return value;
  };
  const hlsUrl = value => {
    const stream = value.stream.find(entry => entry && entry.protocol_name === 'http_hls');
    if (!stream || !Array.isArray(stream.format)) throw new Error('bili-live.hls-unavailable');
    const format = stream.format.find(entry => entry && entry.format_name === 'ts') || stream.format[0];
    const codecs = format && Array.isArray(format.codec) ? format.codec : [];
    const codec = codecs.find(entry => entry && entry.codec_name === 'avc') || codecs[0];
    const location = codec && Array.isArray(codec.url_info)
      ? codec.url_info.find(entry => entry && entry.host) : null;
    if (!codec || !codec.base_url || !location) throw new Error('bili-live.hls-unavailable');
    return text(location.host) + text(codec.base_url) + text(location.extra);
  };

  dxplay.register({
    id: 'org.dxsrc.xiaosa.bili-live',
    name: 'Bilibili live',
    description: 'Readable rewrite of the public Bilibili live-room catalog and native HLS playback flow.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'bili-live';
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      return {ready: true};
    },
    async home() {
      const featured = await searchRooms('直播', 1);
      return {
        categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})),
        featured: featured.items,
      };
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const result = await searchRooms(text(input.categoryId) || '直播', page);
      return {page, pageCount: result.pageCount, items: result.items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const result = await searchRooms(keyword, page);
      return {page, pageCount: result.pageCount, items: result.items};
    },
    async detail(input) {
      const roomId = text(input.id).replace(/\D/g, '');
      if (!roomId) throw new Error('bili-live.room-id-invalid');
      const data = await roomInfo(roomId);
      if (Number(data.live_status) !== 1) throw new Error('bili-live.room-offline');
      return {
        id: text(data.room_id),
        sourceKey,
        name: text(data.title || data.room_id),
        ...(imageUrl(data.user_cover || data.keyframe) ? {poster: imageUrl(data.user_cover || data.keyframe)} : {}),
        ...(text(data.parent_area_name || data.area_name) ? {
          remark: [text(data.parent_area_name), text(data.area_name)].filter(Boolean).join(' / '),
        } : {}),
        description: [text(data.description), formatOnline(data.online) + '人在线'].filter(Boolean).join('\n'),
        playGroups: [{
          id: 'live',
          name: '直播',
          episodes: [{id: 'live', name: '直播', playId: text(data.room_id)}],
        }],
      };
    },
    async play(input) {
      const roomId = text(input.playId).replace(/\D/g, '');
      if (!roomId) throw new Error('bili-live.play-id-invalid');
      const info = await playInfo(roomId);
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl: hlsUrl(info),
        headers: {'User-Agent': USER_AGENT, Referer: LIVE_REFERER},
        parse: false,
      };
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
