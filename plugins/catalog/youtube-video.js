/* global dxplay */
(() => {
  'use strict';

  const BASE_URL = 'https://www.youtube.com';
  const WEB_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const PLAYER_USER_AGENT = 'com.google.android.youtube/21.02.35 (Linux; U; Android 11) gzip';
  const PLAYER_VERSION = '21.02.35';
  const CATEGORIES = [
    ['YouTube 直播 24小时', '推荐'], ['YouTube 新闻 Live', '新闻直播'],
    ['华语电视剧 完整剧集', '剧集'], ['华语电影 完整版', '电影'],
    ['中文 动画片', '动画片'], ['中文 综艺', '综艺'], ['中文 短剧 完整版', '短剧'],
    ['中文 纪录片', '纪录片'], ['中文 科普', '科普'], ['4K HDR', '4K'],
  ];
  let sourceKey = '';
  let apiKey = '';
  let webClientVersion = '2.20240310.01.00';
  const sessions = Object.create(null);

  const text = value => value === undefined || value === null ? '' : String(value);
  const jsonString = raw => {
    try { return JSON.parse('"' + text(raw) + '"'); } catch (_error) { return text(raw); }
  };
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const first = (value, pattern, group = 1) => {
    const match = text(value).match(pattern);
    return match ? text(match[group]) : '';
  };
  const webHeaders = referer => ({
    'User-Agent': WEB_USER_AGENT,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: referer || BASE_URL + '/',
  });
  const fetchText = async url => {
    const response = await dxplay.fetch({url, headers: webHeaders(BASE_URL + '/')});
    if (response.status < 200 || response.status >= 300 || !text(response.body)) {
      throw new Error('youtube.request-failed');
    }
    return response.body;
  };
  const updateWebConfig = body => {
    apiKey = first(body, /["']INNERTUBE_API_KEY["']\s*:\s*["']([^"']+)/i) || apiKey;
    webClientVersion = first(body, /["']INNERTUBE_CLIENT_VERSION["']\s*:\s*["']([^"']+)/i)
      || webClientVersion;
  };
  const parseItems = body => {
    const output = [];
    const seen = Object.create(null);
    const pattern = /["'](?:videoRenderer|gridVideoRenderer|compactVideoRenderer)["']\s*:\s*\{["']videoId["']\s*:\s*["']([a-z0-9_-]{11})["']/gi;
    let match;
    while ((match = pattern.exec(text(body))) !== null && output.length < 30) {
      const id = match[1];
      if (seen[id]) continue;
      const block = body.slice(match.index, Math.min(body.length, match.index + 8000));
      const rawName = first(block, /["']title["']\s*:\s*\{["']runs["']\s*:\s*\[\s*\{["']text["']\s*:\s*["']((?:\\.|[^"'])*)["']/i)
        || first(block, /["']title["']\s*:\s*\{["']simpleText["']\s*:\s*["']((?:\\.|[^"'])*)["']/i);
      const name = clean(jsonString(rawName));
      if (!name) continue;
      seen[id] = true;
      const rawPoster = first(block, /["']thumbnails["']\s*:\s*\[\s*\{["']url["']\s*:\s*["']((?:\\.|[^"'])*)["']/i);
      const poster = jsonString(rawPoster).replace(/\\u0026/g, '&');
      const rawRemark = first(block, /["']lengthText["']\s*:\s*\{["']simpleText["']\s*:\s*["']((?:\\.|[^"'])*)["']/i);
      const remark = clean(jsonString(rawRemark)) || (/BADGE_STYLE_TYPE_LIVE_NOW/.test(block) ? '直播' : '视频');
      output.push({id, sourceKey, name, ...(/^https?:\/\//i.test(poster) ? {poster} : {}), remark});
    }
    return output;
  };
  const continuationFrom = body => jsonString(first(body,
    /["']continuationItemRenderer["']\s*:\s*\{[\s\S]{0,1600}?["']token["']\s*:\s*["']((?:\\.|[^"'])*)["']/i));
  const sessionKey = query => clean(query).toLowerCase();
  const firstSearchPage = async query => {
    const url = BASE_URL + '/results?search_query=' + encodeURIComponent(query);
    const body = await fetchText(url);
    updateWebConfig(body);
    return {query, referer: url, pages: [parseItems(body)], continuation: continuationFrom(body)};
  };
  const nextSearchPage = async session => {
    if (!session.continuation || !apiKey) return [];
    const response = await dxplay.fetch({
      url: BASE_URL + '/youtubei/v1/search?key=' + encodeURIComponent(apiKey) + '&prettyPrint=false',
      method: 'POST',
      headers: {
        ...webHeaders(session.referer), 'Content-Type': 'application/json', Origin: BASE_URL,
        'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': webClientVersion,
      },
      body: JSON.stringify({
        context: {client: {clientName: 'WEB', clientVersion: webClientVersion, hl: 'zh-CN', gl: 'US'}},
        continuation: session.continuation,
      }),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('youtube.search-failed');
    const body = text(response.body);
    session.continuation = continuationFrom(body);
    return parseItems(body);
  };
  const searchPage = async (query, page) => {
    const key = sessionKey(query);
    if (!key) return {items: [], pageCount: page};
    let session = sessions[key];
    if (!session || page === 1) {
      session = await firstSearchPage(query);
      sessions[key] = session;
      const keys = Object.keys(sessions);
      if (keys.length > 8) delete sessions[keys[0]];
    }
    while (session.pages.length < page && session.continuation) {
      session.pages.push(await nextSearchPage(session));
    }
    const items = session.pages[page - 1] || [];
    return {items, pageCount: session.continuation || session.pages.length > page ? page + 1 : page};
  };
  const ensureApiKey = async videoId => {
    if (apiKey) return;
    const body = await fetchText(BASE_URL + '/watch?v=' + encodeURIComponent(videoId));
    updateWebConfig(body);
    if (!apiKey) throw new Error('youtube.api-key-unavailable');
  };
  const playerData = async videoId => {
    if (!/^[a-z0-9_-]{11}$/i.test(videoId)) throw new Error('youtube.item-invalid');
    await ensureApiKey(videoId);
    const response = await dxplay.fetch({
      url: BASE_URL + '/youtubei/v1/player?key=' + encodeURIComponent(apiKey) + '&prettyPrint=false',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'User-Agent': PLAYER_USER_AGENT,
        Origin: BASE_URL, Referer: BASE_URL + '/watch?v=' + videoId,
        'X-YouTube-Client-Name': '3', 'X-YouTube-Client-Version': PLAYER_VERSION,
      },
      body: JSON.stringify({
        context: {client: {
          clientName: 'ANDROID', clientVersion: PLAYER_VERSION, androidSdkVersion: 30,
          userAgent: PLAYER_USER_AGENT, osName: 'Android', osVersion: '11', hl: 'zh-CN', gl: 'US',
        }},
        videoId,
        playbackContext: {contentPlaybackContext: {html5Preference: 'HTML5_PREF_WANTS'}},
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('youtube.player-failed');
    let data;
    try { data = JSON.parse(response.body); } catch (_error) { throw new Error('youtube.player-invalid'); }
    const status = text(data && data.playabilityStatus && data.playabilityStatus.status);
    if (status !== 'OK' && status !== 'LIVE_STREAM_OFFLINE') throw new Error('youtube.play-unavailable');
    return data;
  };
  const streamsFrom = data => {
    const streaming = data && data.streamingData || {};
    if (/^https?:\/\//i.test(text(streaming.hlsManifestUrl))) {
      return [{id: 'live', name: '直播', url: streaming.hlsManifestUrl, kind: 'hls'}];
    }
    return (Array.isArray(streaming.formats) ? streaming.formats : [])
      .filter(value => value && /^https?:\/\//i.test(text(value.url)) && /^video\//i.test(text(value.mimeType)))
      .sort((left, right) => (Number(right.height) || 0) - (Number(left.height) || 0)
        || (Number(right.bitrate) || 0) - (Number(left.bitrate) || 0))
      .map(value => ({
        id: String(value.itag), name: text(value.qualityLabel) || String(value.itag),
        url: value.url, kind: /mp4/i.test(text(value.mimeType)) ? 'mp4' : 'media',
      }));
  };
  const posterFrom = details => {
    const values = details && details.thumbnail && Array.isArray(details.thumbnail.thumbnails)
      ? details.thumbnail.thumbnails : [];
    return values.length ? text(values[values.length - 1].url) : '';
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.youtube-video',
    name: 'YouTube catalog',
    description: 'Readable rewrite of YouTube search with official Innertube progressive MP4 and live HLS playback.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'youtube-video';
      return {ready: true};
    },
    async home() {
      return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: []};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const query = CATEGORIES.some(value => value[0] === text(input.categoryId))
        ? text(input.categoryId) : CATEGORIES[0][0];
      const result = await searchPage(query, page);
      return {page, pageCount: result.pageCount, items: result.items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = clean(input.keyword);
      if (!keyword) return {page, pageCount: page, items: []};
      const result = await searchPage(keyword, page);
      return {page, pageCount: result.pageCount, items: result.items};
    },
    async detail(input) {
      const id = text(input.id).trim();
      const data = await playerData(id);
      const details = data.videoDetails || {};
      const streams = streamsFrom(data);
      if (!streams.length) throw new Error('youtube.streams-unavailable');
      const name = clean(details.title) || id;
      const poster = posterFrom(details);
      const description = clean(details.shortDescription).slice(0, 2000);
      return {
        id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}),
        playGroups: [{
          id: 'main', name: 'YouTube',
          episodes: streams.map((value, index) => ({
            id: String(index + 1), name: value.name, playId: id + '@@' + value.id,
          })),
        }],
      };
    },
    async play(input) {
      const match = text(input.playId).match(/^([a-z0-9_-]{11})@@([a-z0-9_-]+)$/i);
      if (!match) throw new Error('youtube.play-invalid');
      const streams = streamsFrom(await playerData(match[1]));
      const selected = streams.find(value => value.id === match[2]) || streams[0];
      if (!selected) throw new Error('youtube.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: selected.url,
        headers: {'User-Agent': PLAYER_USER_AGENT, Referer: BASE_URL + '/'}, parse: false,
      };
    },
    async destroy() {
      sourceKey = ''; apiKey = ''; webClientVersion = '2.20240310.01.00';
      for (const key of Object.keys(sessions)) delete sessions[key];
    },
  });
})();
