/* global dxplay */
(() => {
  'use strict';

  const API_URL = 'https://api.qishui.com';
  const REFERER = 'https://music.douyin.com/';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; TVBox) '
    + 'AppleWebKit/537.36 Chrome/124 Safari/537.36';
  const themes = [
    ['热门歌曲', '热门'], ['小说', '小说'], ['音乐', '音乐'], ['现言', '现言'],
    ['爽文', '爽文'], ['助眠', '助眠'], ['脱口秀', '脱口秀'], ['男频', '男频'],
    ['女频', '女频'], ['影视解说', '影视'], ['相声', '相声'], ['历史', '历史'],
    ['社会时政', '时政'], ['科普', '科普'], ['财经', '财经'], ['职场', '职场'],
    ['悬疑', '悬疑'], ['重生', '重生'], ['脑洞', '脑洞'], ['穿越', '穿越'],
  ];
  const qualityNames = {
    medium: '标准音质',
    higher: '高音质',
    highest: '极高音质',
    lossless: '无损音质',
    spatial: '空间音频',
    hi_res: 'Hi-Res',
  };
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const clean = value => text(value).replace(/[$#]/g, ' ').replace(/\s+/g, ' ').trim();
  const headers = extra => Object.assign({
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    Referer: REFERER,
  }, sourceHeaders, extra || {});
  const requestJson = async (path, options = {}) => {
    const response = await dxplay.fetch({
      url: /^https?:\/\//i.test(path) ? path : API_URL + path,
      method: options.method || 'GET',
      headers: headers(options.headers),
      ...(options.body === undefined ? {} : {body: options.body}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('qishui.request-failed');
    try { return JSON.parse(text(response.body).replace(/^\uFEFF/, '')); }
    catch (_) { throw new Error('qishui.response-invalid'); }
  };
  const post = (path, body, query) => requestJson(path + (query ? '?' + query : ''), {
    method: 'POST',
    headers: {'Content-Type': 'application/json; charset=utf-8'},
    body: JSON.stringify(body),
  });
  const unwrapTrack = value => {
    let current = object(value);
    if (current.id && (current.name || current.title)) return current;
    const candidates = [
      object(current.track),
      object(object(object(current.entity).track_wrapper).track),
      object(object(current.track_wrapper).track),
      object(object(current.entity).track),
    ];
    return candidates.find(track => track.id) || {};
  };
  const imageUrl = value => {
    const image = object(value);
    const values = list(image.urls).length ? list(image.urls) : text(image.urls).split(/\s+/);
    let base = text(values[0]).trim();
    if (!base) return /^https?:\/\//i.test(text(image.uri)) ? text(image.uri) : '';
    if (!/\/img\/?$/i.test(base)) return base;
    const uri = text(image.uri).replace(/^\/+/, '');
    if (!uri) return '';
    base = base.replace(/\/+$/, '') + '/' + uri;
    return image.template_prefix ? base + '~' + image.template_prefix + '-ori.image' : base;
  };
  const artists = track => list(object(track).artists)
    .map(value => clean(object(value).name || object(value).simple_display_name))
    .filter(Boolean)
    .join(' / ');
  const trackItem = value => {
    const track = unwrapTrack(value);
    const id = text(track.id).trim();
    const name = clean(track.name || track.title);
    if (!id || !name) return null;
    const album = object(track.album);
    const artistNames = artists(track);
    const poster = imageUrl(album.url_cover || track.url_cover);
    return {
      id,
      sourceKey,
      name,
      ...(poster ? {poster} : {}),
      ...(artistNames || album.name ? {remark: [artistNames, clean(album.name)].filter(Boolean).join(' · ')} : {}),
    };
  };
  const searchTracks = async (keyword, page) => {
    const body = {
      search_type: 'track',
      q: keyword,
      cursor: page <= 1 ? null : String((page - 1) * 20),
      search_id: dxplay.crypto.md5(keyword),
      search_method: 'input',
      search_scene: 'search_result',
    };
    const payload = object(await post('/luna/search/track', body, 'device_platform=web'));
    const group = list(payload.result_groups).map(object).find(value => value.id === 'tracks') || {};
    return {
      page,
      pageCount: group.has_more ? page + 1 : page,
      items: list(group.data).map(trackItem).filter(Boolean),
    };
  };
  const seoTrack = async id => object(await requestJson('/luna/h5/seo_track?track_id='
    + encodeURIComponent(id) + '&device_platform=web'));
  const encrypted = value => {
    if (value === undefined || value === null || value === false || value === '') return false;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  };
  const mediaOptions = async payload => {
    const player = object(payload.track_player);
    let model = player.video_model;
    if (typeof model === 'string') {
      try { model = JSON.parse(model); } catch (_) { model = {}; }
    }
    const output = [];
    for (const entry of list(object(model).video_list)) {
      const value = object(entry);
      if (encrypted(value.encrypt_info)) continue;
      const metadata = object(value.video_meta);
      const url = text(value.main_url || value.backup_url).trim();
      if (!/^https?:\/\//i.test(url)) continue;
      const key = text(metadata.quality).trim() || String(output.length);
      output.push({
        key,
        name: qualityNames[key] || (Number(metadata.bitrate) > 0
          ? Math.round(Number(metadata.bitrate) / 1000) + ' Kbps' : '音频'),
        bitrate: Number(metadata.bitrate) || Number(metadata.real_bitrate) || 0,
        url,
      });
    }
    if (!output.length && /^https?:\/\//i.test(text(player.url_player_info))) {
      const fallback = object(await requestJson(text(player.url_player_info)));
      const data = object(object(fallback.Result).Data);
      for (const entry of list(data.PlayInfoList)) {
        const value = object(entry);
        const url = text(value.MainPlayUrl || value.BackupPlayUrl).trim();
        if (!/^https?:\/\//i.test(url)) continue;
        output.push({
          key: String(output.length),
          name: Number(value.Bitrate) > 0 ? Math.round(Number(value.Bitrate) / 1000) + ' Kbps' : '音频',
          bitrate: Number(value.Bitrate) || 0,
          url,
        });
      }
    }
    return output.sort((left, right) => right.bitrate - left.bitrate);
  };
  const playToken = (trackId, quality) => trackId + '|' + quality;
  const decodePlayToken = value => {
    const parts = text(value).split('|');
    return {trackId: parts[0], quality: parts.slice(1).join('|') || 'auto'};
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.qishui-music',
    name: 'Qishui music',
    description: 'Readable rewrite of the qist QiShui public web catalog and native audio playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey).trim();
      sourceHeaders = object(input.headers);
      if (!sourceKey) throw new Error('qishui.source-key-missing');
      if (!dxplay.crypto || typeof dxplay.crypto.md5 !== 'function') throw new Error('qishui.md5-unavailable');
      return {ready: true};
    },
    async home() {
      const featured = await searchTracks('热门歌曲', 1);
      return {
        categories: themes.map(value => ({id: value[0], name: value[1]})),
        featured: featured.items,
      };
    },
    async category(input) {
      return searchTracks(text(input.categoryId) || '热门歌曲', Math.max(1, Number(input.page) || 1));
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      return keyword ? searchTracks(keyword, page) : {page, pageCount: page, items: []};
    },
    async detail(input) {
      const id = text(input.id).trim();
      const payload = await seoTrack(id);
      const track = unwrapTrack(payload.seo_track);
      if (!track.id) throw new Error('qishui.track-unavailable');
      const options = await mediaOptions(payload);
      if (!options.length) throw new Error('qishui.media-unavailable');
      const album = object(track.album);
      const artistNames = artists(track);
      const poster = imageUrl(album.url_cover || track.url_cover);
      const lyric = text(object(payload.lyric).content).trim().slice(0, 1800);
      return {
        id,
        sourceKey,
        name: clean(track.name || track.title) || id,
        ...(poster ? {poster} : {}),
        ...(artistNames ? {actors: artistNames} : {}),
        ...(album.name ? {remark: clean(album.name)} : {}),
        description: [album.name ? '专辑：' + clean(album.name) : '', lyric].filter(Boolean).join('\n'),
        playGroups: options.map(option => ({
          id: option.key,
          name: option.name,
          episodes: [{id, name: clean(track.name || track.title) || '播放', playId: playToken(id, option.key)}],
        })),
      };
    },
    async play(input) {
      const selected = decodePlayToken(input.playId);
      const payload = await seoTrack(selected.trackId);
      const options = await mediaOptions(payload);
      const media = options.find(value => value.key === selected.quality) || options[0];
      if (!media) throw new Error('qishui.media-unavailable');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId) || selected.trackId,
        rawUrl: media.url,
        headers: {'User-Agent': USER_AGENT, Referer: REFERER},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
    },
  });
})();
