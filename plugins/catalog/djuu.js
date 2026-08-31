/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://m.djuu.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const POSTER = BASE + '/static/mobile/images/play/logo.png';
  let sourceKey = '';
  let recentTracks = [];

  const text = value => value === undefined || value === null ? '' : String(value);
  const clean = value => text(value).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
  const headers = () => ({'User-Agent': USER_AGENT, Referer: BASE + '/'});
  const load = async url => {
    const response = await dxplay.fetch({url, headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('djuu.request-failed');
    return response.body;
  };
  const encodeTrack = track => [track.trackId, encodeURIComponent(track.name), encodeURIComponent(track.group || '')].join('|');
  const decodeTrack = id => {
    const values = text(id).split('|');
    if (!/^\d+$/.test(values[0] || '')) throw new Error('djuu.item-invalid');
    return {trackId: values[0], name: decodeURIComponent(values[1] || values[0]), group: decodeURIComponent(values[2] || '')};
  };
  const parseTracks = (body, group) => {
    const tracks = [];
    const seen = Object.create(null);
    const pattern = /<div[^>]*class=["'][^"']*djuu-list-item[^"']*["'][^>]*data-bs-id=["'](\d+)["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/ig;
    let match;
    while ((match = pattern.exec(body)) !== null) {
      if (seen[match[1]]) continue;
      seen[match[1]] = true;
      tracks.push({trackId: match[1], name: clean(match[2]), group: text(group)});
    }
    return tracks.filter(track => track.name);
  };
  const parseFolders = body => {
    const categories = [];
    const seen = Object.create(null);
    const pattern = /<div[^>]*onclick=["']djuuSwitch\.djlist\(["']([^"']+)["']\)["'][^>]*>([\s\S]*?)<\/div>/ig;
    let match;
    while ((match = pattern.exec(body)) !== null) {
      const id = match[1].replace(/1_1\.html$/, '1_{pg}.html');
      const name = clean(match[2]);
      if (!id.startsWith('/djlist/') || !name || seen[id]) continue;
      seen[id] = true;
      categories.push({id, name});
    }
    return categories;
  };
  const itemsFor = tracks => tracks.map(track => ({id: encodeTrack(track), sourceKey, name: track.name, poster: POSTER, remark: track.group}));

  dxplay.register({
    id: 'org.dxsrc.jsm.djuu', name: 'Djuu catalog',
    description: 'Semantic rewrite of the public Djuu music directory, search and server-resolved audio playback.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'djuu'; recentTracks = []; return {ready: true}; },
    async home() { return {categories: parseFolders(await load(BASE + '/djlist')), featured: []}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const path = text(input.categoryId).replace('{pg}', String(page));
      if (!path.startsWith('/djlist/')) throw new Error('djuu.category-invalid');
      const body = await load(BASE + path);
      const group = clean((body.match(/<div[^>]*class=["'][^"']*fs-4[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
      recentTracks = parseTracks(body, group);
      const items = itemsFor(recentTracks);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      let url = BASE + '/search?musicname=' + encodeURIComponent(text(input.keyword));
      if (page > 1) url += '&page=' + page;
      recentTracks = parseTracks(await load(url), '搜索');
      const items = itemsFor(recentTracks);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const selected = decodeTrack(input.id);
      const tracks = recentTracks.some(track => track.trackId === selected.trackId) ? recentTracks : [selected];
      return {
        id: text(input.id), sourceKey, name: selected.group || selected.name, poster: POSTER,
        playGroups: [{id: 'djuu', name: 'DJ呦呦网', episodes: tracks.map(track => ({id: track.trackId, name: track.name, playId: track.trackId}))}],
      };
    },
    async play(input) {
      const trackId = text(input.playId);
      if (!/^\d+$/.test(trackId)) throw new Error('djuu.play-invalid');
      const response = await dxplay.fetch({
        url: BASE + '/play/music', method: 'POST',
        headers: Object.assign(headers(), {'Content-Type': 'application/x-www-form-urlencoded'}),
        body: 'id=' + encodeURIComponent(trackId),
      });
      let payload;
      try { payload = JSON.parse(response.body); } catch (_) { throw new Error('djuu.response-invalid'); }
      const url = text(payload && payload.data && payload.data.url);
      if (!/^https?:\/\//i.test(url)) throw new Error('djuu.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: headers(), parse: false};
    },
    async destroy() { sourceKey = ''; recentTracks = []; },
  });
})();
