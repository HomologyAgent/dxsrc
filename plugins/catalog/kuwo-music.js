/* global dxplay */
(() => {
  'use strict';

  const WEB_URL = 'https://www.kuwo.cn';
  const WEB_API = 'https://wapi.kuwo.cn/api/www';
  const SEARCH_API = 'https://search.kuwo.cn/r.s';
  const MEDIA_API = 'https://nmobi.kuwo.cn/mobi.s';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const PLAYER_AGENT = 'Mozilla/5.0 (Linux; Android 10)';
  const categories = [
    ['1', '华语男'], ['2', '华语女'], ['3', '华语组合'],
    ['4', '日韩男'], ['5', '日韩女'], ['6', '日韩组合'],
    ['7', '欧美男'], ['8', '欧美女'], ['9', '欧美组合'], ['0', '其他'],
  ];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const clean = value => text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  const imageUrl = value => {
    const url = text(value).trim();
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('http://')) return 'https://' + url.slice(7);
    return url;
  };
  const headers = () => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: WEB_URL + '/',
    Accept: 'application/json,text/plain,*/*',
  }, sourceHeaders);
  const requestJson = async (url, customHeaders) => {
    const response = await dxplay.fetch({
      url,
      headers: Object.assign({}, headers(), customHeaders || {}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('kuwo.request-failed');
    try { return JSON.parse(text(response.body).replace(/^\uFEFF/, '')); }
    catch (_) { throw new Error('kuwo.response-invalid'); }
  };
  const artistItem = value => {
    const artist = object(value);
    const id = text(artist.id || artist.ARTISTID || artist.DC_TARGETID).trim();
    const name = clean(artist.name || artist.ARTIST);
    if (!id || !name) return null;
    const basePath = text(artist.BASEPICPATH || 'https://img1.kuwo.cn/star/starheads/');
    const poster = imageUrl(artist.pic300 || artist.pic || artist.pic120
      || artist.hts_PICPATH || (artist.PICPATH ? basePath + artist.PICPATH : ''));
    const songs = text(artist.SONGNUM).trim();
    return {
      id,
      sourceKey,
      name,
      ...(poster ? {poster} : {}),
      ...(songs ? {remark: songs + ' 首'} : {}),
    };
  };
  const artistPage = async (categoryId, page) => {
    const payload = object(await requestJson(WEB_API + '/artist/artistInfo?category='
      + encodeURIComponent(categoryId) + '&prefix=&pn=' + page + '&rn=30'));
    const data = object(payload.data);
    const items = list(data.artistList).map(artistItem).filter(Boolean);
    return {page, pageCount: items.length >= 30 ? page + 1 : page, items};
  };
  const artistTracks = async artistId => {
    const pages = await Promise.all([1, 2, 3].map(page => requestJson(
      WEB_API + '/artist/artistMusic?artistid=' + encodeURIComponent(artistId)
        + '&pn=' + page + '&rn=100',
    )));
    const seen = {};
    const tracks = [];
    for (const payload of pages) {
      for (const value of list(object(payload.data).list)) {
        const track = object(value);
        const id = text(track.rid).replace(/^MUSIC_/, '').trim();
        const name = clean(track.name).replace(/[$#]/g, '');
        if (!id || !name || seen[id]) continue;
        seen[id] = true;
        tracks.push({
          id,
          name,
          album: clean(track.album),
        });
      }
    }
    return tracks;
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.kuwo-music',
    name: 'Kuwo music',
    description: 'Readable rewrite of the qist Kuwo artist catalog and native MP3 playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey).trim();
      sourceHeaders = object(input.headers);
      if (!sourceKey) throw new Error('kuwo.source-key-missing');
      return {ready: true};
    },
    async home() {
      const featured = await artistPage('1', 1);
      return {
        categories: categories.map(value => ({id: value[0], name: value[1]})),
        featured: featured.items,
      };
    },
    async category(input) {
      return artistPage(text(input.categoryId), Math.max(1, Number(input.page) || 1));
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const payload = object(await requestJson(SEARCH_API
        + '?client=kt&pn=' + ((page - 1) * 30)
        + '&rn=30&all=' + encodeURIComponent(keyword)
        + '&vipver=1&ft=artist&encoding=utf8&rformat=json&mobi=1'));
      const basePath = imageUrl(payload.BASEPICPATH || 'https://img1.kuwo.cn/star/starheads/');
      const items = list(payload.abslist)
        .map(value => artistItem(Object.assign({BASEPICPATH: basePath}, object(value))))
        .filter(Boolean);
      return {page, pageCount: items.length >= 30 ? page + 1 : page, items};
    },
    async detail(input) {
      const artistId = text(input.id).trim();
      const values = await Promise.all([
        requestJson(WEB_API + '/artist/artist?artistid=' + encodeURIComponent(artistId)),
        artistTracks(artistId),
      ]);
      const artist = object(object(values[0]).data);
      const tracks = list(values[1]);
      const name = clean(artist.name) || artistId;
      if (!tracks.length) throw new Error('kuwo.tracks-unavailable');
      const poster = imageUrl(artist.pic300 || artist.pic || artist.pic120);
      const description = clean(artist.info) || '暂无歌手简介';
      return {
        id: artistId,
        sourceKey,
        name,
        ...(poster ? {poster} : {}),
        actors: name,
        remark: tracks.length + ' 首',
        description,
        playGroups: [{
          id: 'kuwo',
          name: '酷我音乐',
          episodes: tracks.map(track => ({
            id: track.id,
            name: track.album ? track.name + ' · ' + track.album : track.name,
            playId: track.id,
          })),
        }],
      };
    },
    async play(input) {
      const trackId = text(input.playId).replace(/^MUSIC_/, '').trim();
      if (!trackId) throw new Error('kuwo.track-invalid');
      const payload = object(await requestJson(MEDIA_API
        + '?f=web&user=0&source=kwplayer_ar_4.4.2.7_B_nuoweida_vh.apk'
        + '&type=convert_url_with_sign&rid=' + encodeURIComponent(trackId)
        + '&bitrate=128&format=mp3', {
          'User-Agent': PLAYER_AGENT,
          Referer: WEB_URL + '/',
        }));
      const raw = text(object(payload.data).url).trim();
      const rawUrl = raw.startsWith('http://') ? 'https://' + raw.slice(7) : raw;
      if (Number(payload.code) !== 200 || !/^https?:\/\//i.test(rawUrl)) {
        throw new Error('kuwo.media-unavailable');
      }
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId) || trackId,
        rawUrl,
        headers: {'User-Agent': PLAYER_AGENT, Referer: WEB_URL + '/'},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
    },
  });
})();
