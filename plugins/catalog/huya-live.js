/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.huya.com';
  const PROFILE = 'https://mp.huya.com';
  const CATEGORY = 'https://live.cdn.huya.com';
  const SEARCH_API = 'https://search.cdn.huya.com/?m=Search&do=getSearchContent';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const GROUPS = [
    {id: '1', name: '网游'},
    {id: '2', name: '单机'},
    {id: '3', name: '手游'},
    {id: '8', name: '娱乐'},
  ];
  let sourceKey = '';
  let sourceHeaders = {};
  let gamesByGroup = Object.create(null);

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const imageUrl = value => {
    const result = text(value).trim();
    if (result.startsWith('//')) return 'https:' + result;
    if (result.startsWith('http://')) return 'https://' + result.slice(7);
    return result;
  };
  const headers = referer => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: referer || BASE + '/',
    Accept: 'application/json,text/plain,*/*',
  }, sourceHeaders);
  const requestJson = async (url, referer) => {
    const response = await dxplay.fetch({url, headers: headers(referer)});
    if (response.status < 200 || response.status >= 300) throw new Error('huya-live.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('huya-live.response-invalid'); }
  };
  const formatOnline = value => {
    const count = Math.max(0, Number(value) || 0);
    if (count >= 10000) return (count / 10000).toFixed(count >= 100000 ? 0 : 1) + '万';
    return String(count);
  };
  const roomItem = value => ({
    id: text(value.profileRoom || value.room_id || value.roomId),
    sourceKey,
    name: text(value.introduction || value.game_introduction || value.roomName || value.nick || value.game_nick
      || value.profileRoom || value.room_id),
    ...(imageUrl(value.screenshot || value.game_screenshot || value.roomPic) ? {
      poster: imageUrl(value.screenshot || value.game_screenshot || value.roomPic),
    } : {}),
    remark: [text(value.nick || value.game_nick), text(value.gameFullName || value.game_name), formatOnline(value.totalCount) + '人']
      .filter(Boolean).join(' · '),
  });
  const loadGames = async groupId => {
    if (gamesByGroup[groupId]) return gamesByGroup[groupId];
    const result = await requestJson(CATEGORY + '/liveconfig/game/bussLive?bussType=' + groupId, CATEGORY + '/');
    const games = list(result.data).map(value => ({id: text(value.gid), name: text(value.gameFullName)}))
      .filter(value => value.id && value.name);
    gamesByGroup[groupId] = games;
    return games;
  };
  const rooms = async (page, gameId) => {
    const url = BASE + '/cache.php?m=LiveList&do=getLiveListByPage&tagAll=0&page=' + page
      + (gameId ? '&gameId=' + encodeURIComponent(gameId) : '');
    const result = await requestJson(url, BASE + '/');
    const data = result.data || {};
    return {
      items: list(data.datas).map(roomItem).filter(value => value.id),
      pageCount: Math.max(page, Number(data.totalPage) || page),
    };
  };
  const profile = async roomId => {
    const result = await requestJson(PROFILE + '/cache.php?m=Live&do=profileRoom&roomid='
      + encodeURIComponent(roomId), BASE + '/' + roomId);
    if (Number(result.status) !== 200 || !result.data) throw new Error('huya-live.room-unavailable');
    return result.data;
  };
  const qualities = data => {
    let values = [];
    try { values = JSON.parse(text(data.liveData && data.liveData.bitRateInfo)); } catch (_) { /* use fallback */ }
    if (!Array.isArray(values) || !values.length) {
      values = [{sDisplayName: '超清', iBitRate: 2000}, {sDisplayName: '高清', iBitRate: 1200}, {sDisplayName: '流畅', iBitRate: 500}];
    }
    const seen = Object.create(null);
    return values.filter(value => {
      const rate = String(Math.max(0, Number(value.iBitRate) || 0));
      if (seen[rate]) return false;
      seen[rate] = true;
      return true;
    }).slice(0, 6).map((value, index) => ({
      rate: Math.max(0, Number(value.iBitRate) || 0),
      name: text(value.sDisplayName) || ('清晰度 ' + (index + 1)),
    }));
  };
  const signedHls = (data, cdnType, rate) => {
    const streams = list(data.stream && data.stream.baseSteamInfoList);
    const stream = streams.find(value => text(value.sCdnType) === cdnType) || streams[0];
    const uid = text(data.profileInfo && data.profileInfo.uid);
    const streamName = text(stream && stream.sStreamName);
    const baseUrl = text(stream && stream.sHlsUrl);
    if (!uid || !streamName || !/^https?:\/\//i.test(baseUrl)) throw new Error('huya-live.stream-unavailable');
    const timestamp = Math.floor(Date.now() / 1000);
    const sequence = uid + timestamp;
    const first = dxplay.crypto.md5(sequence + '|huya_adr|102');
    const expires = (timestamp + 21600).toString(16);
    const secret = dxplay.crypto.md5('DWq8BcJ3h6DJt6TY_' + uid + '_' + streamName + '_' + first + '_' + expires);
    return baseUrl + '/' + streamName + '.m3u8?ratio=' + rate + '&wsSecret=' + secret
      + '&wsTime=' + expires + '&ctype=huya_adr&seqid=' + sequence + '&uid=' + uid
      + '&fs=bgct&ver=1&t=102';
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.huya-live',
    name: 'Huya live',
    description: 'Readable rewrite of the public Huya game catalog, room metadata, stream signature and native HLS playback flow.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'huya-live';
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      gamesByGroup = Object.create(null);
      return {ready: true};
    },
    async home() {
      const gameGroups = await Promise.all(GROUPS.map(async group => ({group, games: await loadGames(group.id)})));
      const categories = gameGroups.map(value => ({
        id: value.group.id,
        name: value.group.name,
        filters: [{
          key: 'gameId', name: '频道', initialValue: text(value.games[0] && value.games[0].id),
          options: value.games.map(game => ({name: game.name, value: game.id})),
        }],
      }));
      const featured = await rooms(1, '');
      return {categories, featured: featured.items.slice(0, 40)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const games = await loadGames(text(input.categoryId));
      const gameId = text(input.filters && input.filters.gameId) || text(games[0] && games[0].id);
      if (!gameId) return {page, pageCount: page, items: []};
      const result = await rooms(page, gameId);
      return {page, pageCount: result.pageCount, items: result.items.slice(0, 60)};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const result = await requestJson(SEARCH_API + '&q=' + encodeURIComponent(keyword)
        + '&uid=0&v=4&typ=-5&livestate=0&rows=40&start=' + ((page - 1) * 40), BASE + '/');
      const response = result.response && result.response['3'];
      const values = response && Array.isArray(response.docs) ? response.docs : [];
      return {page, pageCount: values.length < 40 ? page : page + 1, items: values.map(roomItem).filter(value => value.id)};
    },
    async detail(input) {
      const roomId = text(input.id).replace(/\D/g, '');
      if (!roomId) throw new Error('huya-live.room-id-invalid');
      const data = await profile(roomId);
      const live = data.liveData || {};
      const streams = list(data.stream && data.stream.baseSteamInfoList).filter(value => value.sHlsUrl && value.sStreamName);
      if (!streams.length) throw new Error('huya-live.stream-unavailable');
      const rates = qualities(data);
      return {
        id: roomId,
        sourceKey,
        name: text(live.introduction || live.nick || roomId),
        ...(imageUrl(live.screenshot) ? {poster: imageUrl(live.screenshot)} : {}),
        ...(text(live.nick) ? {actors: text(live.nick)} : {}),
        remark: text(live.gameFullName),
        description: text(live.contentIntro || live.introduction),
        playGroups: streams.slice(0, 3).map((stream, streamIndex) => ({
          id: text(stream.sCdnType) || ('line-' + streamIndex),
          name: '线路 ' + (streamIndex + 1),
          episodes: rates.map(value => ({
            id: text(stream.sCdnType) + '-' + value.rate,
            name: value.name,
            playId: JSON.stringify({roomId, cdn: text(stream.sCdnType), rate: value.rate}),
          })),
        })),
      };
    },
    async play(input) {
      let value;
      try { value = JSON.parse(text(input.playId)); } catch (_) { throw new Error('huya-live.play-id-invalid'); }
      const roomId = text(value.roomId).replace(/\D/g, '');
      if (!roomId) throw new Error('huya-live.play-id-invalid');
      const data = await profile(roomId);
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl: signedHls(data, text(value.cdn), Math.max(0, Number(value.rate) || 0)),
        headers: {'User-Agent': 'ExoPlayer', Referer: CATEGORY + '/'},
        parse: false,
      };
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; gamesByGroup = Object.create(null); },
  });
})();
