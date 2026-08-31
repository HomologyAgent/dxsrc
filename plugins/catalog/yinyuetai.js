/* global dxplay */
(() => {
  'use strict';

  const VIDEO_API = 'https://video-api.yinyuetai.com';
  const SEARCH_API = 'https://search-api.yinyuetai.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [
    ['6998499728862334976', '华语'],
    ['6951459197061984256', '欧美'],
    ['6998475633361805312', '韩语'],
    ['6997855138153095168', '日语'],
  ];

  let sourceKey = '';
  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const parseJson = value => {
    try { return JSON.parse(value); } catch (_) { throw new Error('yinyuetai.response-invalid'); }
  };
  const request = async input => {
    const response = await dxplay.fetch(input);
    if (response.status < 200 || response.status >= 300) throw new Error('yinyuetai.request-failed');
    const value = parseJson(response.body);
    if (Number(value.code) !== 0) throw new Error('yinyuetai.upstream-error');
    return value.data;
  };
  const get = url => request({url, headers: {'User-Agent': USER_AGENT}});
  const videoItem = value => {
    const item = object(value);
    return {
      id: text(item.id),
      sourceKey,
      name: text(item.title) || '音乐视频',
      ...(text(item.headImg) ? {poster: text(item.headImg)} : {}),
      ...(text(item.content) ? {remark: text(item.content)} : {}),
    };
  };
  const loadVideo = id => get(VIDEO_API + '/video/get?id=' + encodeURIComponent(text(id)));
  const clips = value => list(object(object(value).fullClip).urls).filter(entry => /^https?:\/\//i.test(text(object(entry).url)));

  dxplay.register({
    id: 'org.dxsrc.cluntop.yinyuetai',
    name: 'Yinyuetai public videos',
    description: 'Semantic rewrite of the public Yinyuetai regional catalog, search and direct video streams.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'yinyuetai';
      return {ready: true};
    },
    async home() {
      const featured = list(await get(VIDEO_API + '/video/explore/channelVideos?channelId='
        + CATEGORIES[0][0] + '&detailType=2&size=12&offset=0')).map(videoItem).filter(item => item.id);
      return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured};
    },
    async category(input) {
      const categoryId = text(input.categoryId);
      if (!CATEGORIES.some(value => value[0] === categoryId)) throw new Error('yinyuetai.category-invalid');
      const page = Math.max(1, Number(input.page) || 1);
      const items = list(await get(VIDEO_API + '/video/explore/channelVideos?channelId='
        + encodeURIComponent(categoryId) + '&detailType=2&size=20&offset=' + ((page - 1) * 20)))
        .map(videoItem).filter(item => item.id);
      return {page, pageCount: items.length === 20 ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      try {
        const data = await request({
          url: SEARCH_API + '/search/get_search_result.json',
          method: 'POST',
          headers: {'User-Agent': USER_AGENT, 'Content-Type': 'application/json; charset=utf-8'},
          body: JSON.stringify({searchType: 'MV', key: text(input.keyword), sinceId: 0, size: 20, requestTagRows: []}),
        });
        const items = list(data).map(videoItem).filter(item => item.id);
        return {page, pageCount: 1, items};
      } catch (_) {
        return {page, pageCount: 1, items: []};
      }
    },
    async detail(input) {
      const id = text(input.id);
      const video = object(await loadVideo(id));
      const streams = clips(video);
      if (!id || !text(video.title) || streams.length === 0) throw new Error('yinyuetai.detail-unavailable');
      return {
        id,
        sourceKey,
        name: text(video.title),
        ...(text(video.headImg) ? {poster: text(video.headImg)} : {}),
        description: text(video.content),
        actors: list(video.artists).map(value => text(object(value).name)).filter(Boolean).join(', '),
        playGroups: [{
          id: 'direct',
          name: '清晰度',
          episodes: streams.map((stream, index) => ({
            id: String(index + 1),
            name: text(object(stream).display) || ('清晰度 ' + (index + 1)),
            playId: id + '|' + index,
          })),
        }],
      };
    },
    async play(input) {
      const parts = text(input.playId).split('|');
      const id = parts[0];
      const index = Math.max(0, Number(parts[1]) || 0);
      const streams = clips(await loadVideo(id));
      const url = text(object(streams[index] || streams[0]).url);
      if (!/^https?:\/\//i.test(url)) throw new Error('yinyuetai.play-unavailable');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl: url,
        headers: {'User-Agent': USER_AGENT},
        parse: false,
      };
    },
    async destroy() { sourceKey = ''; },
  });
})();
