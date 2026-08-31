/* global dxplay */
(() => {
  'use strict';

  const API = 'https://sv.baidu.com';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 11; M2012K10C Build/RP1A.200720.011; wv) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 '
    + 'Mobile Safari/537.36 haokan/7.80.0.18 (Baidu; P1 11)/imoaiX_03_11_C01K2102M/'
    + '1043677m/5ACDB023CFB9D64743B08E51953F7C76%7CVSAJ32AVA/1/7.80.0.18/780001/1/'
    + 'immersiveMode/modeV4PlusWhite/isFirstInstall/bbqMode/bbqModeV2/blackStyle/isPlaylet Talos/1.8.7';
  const DEVICE_COOKIE = 'BAIDUCUID=giHCu0azv80G8SfQ0avU8gaaH8jfiv86ju2MugiR2i8-k3a35avAa1_mA';
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const requestHeaders = () => Object.assign({
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    Cookie: DEVICE_COOKIE,
    'Talos-Module-Version': '1.0.71.1',
    'Talos-Module-Name': 'shortDrama',
  }, sourceHeaders);
  const form = values => Object.keys(values).map(key =>
    encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key])),
  ).join('&');
  const post = async (path, values) => {
    const response = await dxplay.fetch({
      url: API + path,
      method: 'POST',
      headers: requestHeaders(),
      body: form(values),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('haokan.request-failed');
    try { return JSON.parse(response.body); } catch (_error) { throw new Error('haokan.response-invalid'); }
  };
  const item = value => ({
    id: text(value.playlet_id || value.id),
    sourceKey,
    name: text(value.playlet_title || value.title || value.id),
    ...(value.playlet_poster || value.cover_url ? {poster: text(value.playlet_poster || value.cover_url)} : {}),
    ...(value.episodes_num_text || value.tag ? {remark: text(value.episodes_num_text || value.tag)} : {}),
  });
  const commonListVideo = async playletId => {
    const parameters = [
      'enable_enter_playlet=0', 'seek_time=0', 'hotspot=0',
      'auto_show_hot_point_panel=0', 'type=playlet', 'commonlist_id=' + Date.now(),
      'scene=', 'vid=', 'enable_atlas=0', 'mark_pn=', 'uk=', 'ctime=0',
      'from=playlet_new', 'id=' + playletId, 'rn=10', 'pn=1', 'direction=3',
    ].join('&');
    const response = await post('/appui/api?osbranch=a0', {'video/commonlist': parameters});
    const section = response && response['video/commonlist'];
    const results = section && section.data && Array.isArray(section.data.results) ? section.data.results : [];
    const content = results[0] && results[0].content;
    if (!content || !content.vid) throw new Error('haokan.item-not-found');
    return text(content.vid);
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.short-haokan',
    name: 'Haokan short drama',
    description: 'Semantic rewrite of the jsm.json ShortHaokan short-drama catalog.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      if (!sourceKey) throw new Error('haokan.source-key-missing');
      return {ready: true};
    },
    async home() {
      const response = await post('/haokan/ui-feed/playletShelfFeed?osbranch=a0', {from: 'feed'});
      const panels = response && response.data && Array.isArray(response.data.playlet_shelf_filter_panel)
        ? response.data.playlet_shelf_filter_panel : [];
      const seen = {};
      const categories = [];
      panels.forEach(panel => {
        const tags = panel && Array.isArray(panel.tag_list) ? panel.tag_list : [];
        tags.forEach(tag => {
          const id = text(tag.tag_id);
          if (id && !seen[id]) {
            seen[id] = true;
            categories.push({id, name: text(tag.name || id)});
          }
        });
      });
      return {categories, featured: []};
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const response = await post('/haokan/ui-feed/playletTagsFeed?osbranch=a0', {
        tag_id: input.categoryId,
        rn: '9',
        pn: String(page),
      });
      const list = response && response.data && Array.isArray(response.data.list) ? response.data.list : [];
      return {page, pageCount: list.length < 9 ? page : page + 1, items: list.map(item)};
    },
    async search(input) {
      const response = await post('/haokan/ui-interact/playlet/search/sugs?osbranch=a0', {
        search_word: input.keyword,
      });
      const list = response && Array.isArray(response.data) ? response.data : [];
      return {page: Number(input.page) || 1, pageCount: 1, items: list.map(item)};
    },
    async detail(input) {
      const playletId = text(input.id);
      const vid = await commonListVideo(playletId);
      const response = await post('/haokan/ui-video/playlet/rec/detail?osbranch=a0', {
        vid,
        playlet_id: playletId,
      });
      const data = response && response.data;
      if (!data || !Array.isArray(data.vid_list)) throw new Error('haokan.item-not-found');
      return {
        id: playletId,
        sourceKey,
        name: text(data.playlet_title || playletId),
        ...(data.playlet_poster ? {poster: text(data.playlet_poster)} : {}),
        description: text(data.description),
        playGroups: [{
          id: 'short-drama',
          name: '短剧',
          episodes: data.vid_list.map((episodeVid, index) => ({
            id: text(episodeVid),
            name: '第' + String(index + 1) + '集',
            playId: text(episodeVid) + '|||' + playletId,
          })),
        }],
      };
    },
    async play(input) {
      const parts = text(input.playId).split('|||');
      if (!parts[0] || !parts[1]) throw new Error('haokan.play-id-invalid');
      const parameters = [
        'method=post', 'vid=' + parts[0], 'immersive_mode=v4_5',
        'tplname=feed_small_video', 'tag=playlet_talos', 'tab=detail',
        'external_from=', 'is_dp_video=0', 'immersive_square_type=3',
        'video_set_id=' + parts[1], 'play_screen_type=1', 'play_volume_type=2',
        'play_external_device_type=1',
      ].join('&');
      const response = await post('/appui/api?osbranch=a0', {'video/relate': parameters});
      const section = response && response['video/relate'];
      const current = section && section.data && section.data.cur_video;
      const clarity = current && Array.isArray(current.clarityUrl) ? current.clarityUrl : [];
      const selected = clarity.find(value => value && value.key === '1080p' && value.url)
        || clarity.find(value => value && value.key === 'sc' && value.url)
        || clarity.find(value => value && value.url);
      if (!selected) throw new Error('haokan.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: text(selected.url),
        headers: {'User-Agent': USER_AGENT},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
    },
  });
})();

