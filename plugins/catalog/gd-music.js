/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_API = 'https://music-api.gdstudio.xyz/api.php';
  const DEFAULT_CATEGORIES = [
    ['hot', '热歌'], ['new', '新歌'], ['rock', '摇滚'], ['folk', '民谣'],
    ['electronic', '电子'], ['rap', '说唱'], ['light', '轻音乐'],
    ['soundtrack', '影视原声'], ['jay', '周杰伦'], ['jj', '林俊杰'],
    ['eason', '陈奕迅'], ['mayday', '五月天'], ['dengziqi', '邓紫棋'],
    ['liudehua', '刘德华'], ['zhangxueyou', '张学友'], ['wangfei', '王菲'],
  ];
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 12; TV) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
  let sourceKey = '';
  let sourceHeaders = {};
  let apiUrl = DEFAULT_API;
  let musicSource = 'netease';
  let categories = [];

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const requestJson = async values => {
    const query = Object.keys(values)
      .filter(key => values[key] !== undefined && values[key] !== null && values[key] !== '')
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key])))
      .join('&');
    const response = await dxplay.fetch({
      url: apiUrl + (apiUrl.includes('?') ? '&' : '?') + query,
      headers: Object.assign({'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,*/*'}, sourceHeaders),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('gd-music.request-failed');
    const raw = text(response.body).replace(/^\uFEFF/, '').trim();
    if (!raw.startsWith('{') && !raw.startsWith('[')) throw new Error('gd-music.response-invalid');
    return JSON.parse(raw);
  };
  const normalizeCategories = config => {
    const values = list(object(config).class).map(value => ({
      id: text(object(value).type_id).trim(),
      name: clean(object(value).type_name),
    })).filter(value => value.id && value.name);
    return values.length ? values : DEFAULT_CATEGORIES.map(value => ({id: value[0], name: value[1]}));
  };
  const encodeTrack = track => 'track:' + encodeURIComponent(JSON.stringify({
    id: text(track.id),
    name: clean(track.name),
    artist: list(track.artist).map(clean).filter(Boolean),
    album: clean(track.album),
    pic: text(track.pic_id),
    lyric: text(track.lyric_id),
    source: text(track.source) || musicSource,
  }));
  const decodeTrack = value => {
    const raw = text(value);
    if (!raw.startsWith('track:')) throw new Error('gd-music.track-invalid');
    let track;
    try { track = object(JSON.parse(decodeURIComponent(raw.slice(6)))); }
    catch (_) { throw new Error('gd-music.track-invalid'); }
    if (!text(track.id) || !text(track.name)) throw new Error('gd-music.track-invalid');
    return track;
  };
  const trackItem = value => {
    const track = object(value);
    const id = text(track.id).trim(), name = clean(track.name);
    if (!id || !name) return null;
    const artists = list(track.artist).map(clean).filter(Boolean).join(' / ');
    const album = clean(track.album);
    return {
      id: encodeTrack(track),
      sourceKey,
      name: artists ? name + ' · ' + artists : name,
      ...(album ? {remark: album} : {}),
    };
  };
  const searchTracks = async (keyword, page) => {
    const values = list(await requestJson({
      types: 'search',
      source: musicSource,
      name: keyword,
      count: 20,
      pages: page,
    }));
    return values.map(trackItem).filter(Boolean);
  };
  const categoryKeyword = (categoryId, filters) => {
    const selected = categories.find(value => value.id === categoryId);
    const parts = [selected ? selected.name : categoryId];
    for (const key of Object.keys(object(filters))) {
      const value = clean(object(filters)[key]);
      if (value && !parts.includes(value)) parts.push(value);
    }
    return parts.join(' ');
  };
  const posterFor = async track => {
    if (!text(track.pic)) return '';
    try {
      const payload = object(await requestJson({types: 'pic', source: text(track.source) || musicSource, id: track.pic, size: 500}));
      return /^https?:\/\//i.test(text(payload.url)) ? text(payload.url) : '';
    } catch (_) { return ''; }
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.gd-music',
    name: 'GD music catalog',
    description: 'Readable rewrite of Music1 using the documented GD Studio search, artwork and media APIs.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'gd-music';
      sourceHeaders = object(input.headers);
      const extension = input.extension;
      const options = object(extension);
      apiUrl = text(options.apiUrl).trim() || DEFAULT_API;
      musicSource = text(options.source).trim() || 'netease';
      let config = options;
      const configUrl = typeof extension === 'string' ? extension.trim() : text(options.configUrl).trim();
      if (/^https?:\/\//i.test(configUrl)) {
        const response = await dxplay.fetch({url: configUrl, headers: Object.assign({'User-Agent': USER_AGENT}, sourceHeaders)});
        if (response.status < 200 || response.status >= 300) throw new Error('gd-music.config-failed');
        config = object(JSON.parse(text(response.body).replace(/^\uFEFF/, '')));
      }
      categories = normalizeCategories(config);
      return {ready: true};
    },
    async home() {
      const featured = await searchTracks('热歌', 1);
      if (!featured.length) throw new Error('gd-music.home-unavailable');
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = categoryKeyword(text(input.categoryId), input.filters);
      const items = await searchTracks(keyword, page);
      return {page, pageCount: items.length >= 20 ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const items = await searchTracks(keyword, page);
      return {page, pageCount: items.length >= 20 ? page + 1 : page, items};
    },
    async detail(input) {
      const track = decodeTrack(input.id);
      const artists = list(track.artist).join(' / ');
      const poster = await posterFor(track);
      const description = [artists ? '歌手：' + artists : '', track.album ? '专辑：' + track.album : ''].filter(Boolean).join('\n');
      return {
        id: text(input.id),
        sourceKey,
        name: track.name,
        ...(poster ? {poster} : {}),
        ...(artists ? {actors: artists} : {}),
        ...(description ? {description} : {}),
        playGroups: [{id: 'music', name: '音乐', episodes: [{id: track.id, name: track.name, playId: text(input.id)}]}],
      };
    },
    async play(input) {
      const track = decodeTrack(input.playId);
      const payload = object(await requestJson({types: 'url', source: text(track.source) || musicSource, id: track.id, br: 999}));
      const rawUrl = text(payload.url).trim();
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('gd-music.media-unavailable');
      const referer = text(apiUrl).match(/^https?:\/\/[^/]+/i)?.[0] || 'https://music-api.gdstudio.xyz';
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId) || track.id,
        rawUrl,
        headers: {'User-Agent': USER_AGENT, Referer: referer + '/'},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      apiUrl = DEFAULT_API;
      musicSource = 'netease';
      categories = [];
    },
  });
})();
