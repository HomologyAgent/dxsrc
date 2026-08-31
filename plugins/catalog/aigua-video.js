/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://aigua8.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const CATEGORIES = [['2','电视剧'],['1','电影'],['3','综艺'],['4','动漫'],['32','纪录片']];
  const LINES = [['1','线路1'],['16','线路2'],['21','线路3']];
  let sourceKey = '', sourceHeaders = {};
  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes).match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const fetchText = async path => {
    const response = await dxplay.fetch({url: absolute(path), headers: Object.assign({'User-Agent': UA, Referer: BASE + '/'}, sourceHeaders)});
    if (response.status < 200 || response.status >= 300) throw new Error('aigua-video.request-failed');
    return response.body;
  };
  const fetchJson = async path => { try { return JSON.parse(await fetchText(path)); } catch (_) { throw new Error('aigua-video.response-invalid'); } };
  const item = value => ({id: text(value.video_id), sourceKey, name: text(value.video_name) || text(value.video_id), ...(value.cover ? {poster: absolute(value.cover)} : {}), ...(value.flag ? {remark: text(value.flag)} : {})});
  const filter = (key, name, values, initialValue = '0') => ({key, name, initialValue, options: values.map(value => ({name: value[0], value: value[1]}))});
  const FILTERS = [
    filter('class','类型',[['全部','0'],['剧情','161'],['喜剧','153'],['动作','154'],['爱情','155'],['科幻','159'],['悬疑','160'],['奇幻','226'],['恐怖','169'],['动画','283'],['其他','178']]),
    filter('area','地区',[['全部','0'],['大陆','18'],['香港','20'],['台湾','23'],['日本','24'],['韩国','21'],['欧美','19'],['其他','30']]),
    filter('year','年份',[['全部','0'],['2026','132'],['2025','131'],['2024','130'],['2023','129'],['2022','21'],['2021','22'],['2020','23'],['更早','127']]),
    filter('status','状态',[['全部','0'],['完结','1'],['更新中','2']]),
    filter('by','排序',[['添加时间','new'],['人气高低','hot'],['评分高低','score']],'new'),
  ];
  const categoryPath = (id, page, values) => '/video/refresh-cate?page_num=' + page + '&sorttype=desc&channel_id=' + encodeURIComponent(id) + '&tag=' + encodeURIComponent(text(values.class || '0')) + '&area=' + encodeURIComponent(text(values.area || '0')) + '&year=' + encodeURIComponent(text(values.year || '0')) + '&status=' + encodeURIComponent(text(values.status || '0')) + '&sort=' + encodeURIComponent(text(values.by || 'new')) + '&page_size=28';

  dxplay.register({
    id: 'org.dxsrc.cluntop.aigua-video', name: 'Aigua video',
    description: 'Readable rewrite of the public Aigua JSON catalog, HTML episode detail and three direct HLS variants.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'aigua-video'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() {
      const payload = await fetchJson(categoryPath('2', 1, {})), values = payload.data && Array.isArray(payload.data.list) ? payload.data.list : [];
      return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1], filters: FILTERS})), featured: values.map(item)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), payload = await fetchJson(categoryPath(text(input.categoryId), page, input.filters || {}));
      const values = payload.data && Array.isArray(payload.data.list) ? payload.data.list : [];
      return {page, pageCount: values.length ? page + 1 : page, items: values.map(item)};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const html = await fetchText('/video/refresh-video?page_num=1&sorttype=desc&page_size=28&tvNum=7&sort=new&keyword=' + encodeURIComponent(text(input.keyword)));
      const found = [], seen = Object.create(null);
      for (const block of html.matchAll(/<div\b([^>]*class=["'][^"']*SSbox[^"']*["'][^>]*)>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*SSbox|$)/gi)) {
        const anchor = block[2].match(/<a\b([^>]*href=["'][^"']*video_id=\d+[^"']*["'][^>]*)>/i), id = anchor ? attr(anchor[1], 'href').match(/video_id=(\d+)/i)?.[1] : '';
        if (!id || seen[id]) continue;
        const image = block[2].match(/<img\b([^>]*)>/i)?.[1] || '';
        let title = '';
        for (const link of block[2].matchAll(/<a\b[^>]*href=["'][^"']*video_id=\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
          const candidate = strip(link[1]); if (candidate) { title = candidate; break; }
        }
        title = title || attr(image, 'alt');
        if (!title) continue;
        seen[id] = true;
        const poster = absolute(attr(image, 'originalsrc') || attr(image, 'data-original') || attr(image, 'src'));
        found.push({id, sourceKey, name: title, ...(poster ? {poster} : {})});
      }
      return {page, pageCount: page, items: found};
    },
    async detail(input) {
      const id = text(input.id).replace(/\D/g, ''), html = await fetchText('/video/detail?video_id=' + id);
      const titleBlock = html.match(/<h1\b[^>]*class=["'][^"']*player-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
      const name = strip(titleBlock.match(/<em\b[^>]*class=["'][^"']*title-txt[^"']*["'][^>]*>([\s\S]*?)<\/em>/i)?.[1]) || strip(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]).split(' - ')[0] || id;
      const detailBlock = html.match(/<div\b[^>]*class=["'][^"']*GNbox-xq-K[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] || '';
      const image = detailBlock.match(/<img\b([^>]*)>/i)?.[1] || '', poster = absolute(attr(image, 'originalsrc') || attr(image, 'src'));
      const description = strip(detailBlock.match(/简介\s*[：:]\s*<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1]).slice(0, 2000);
      const chapters = [], seen = Object.create(null);
      for (const match of html.matchAll(/<li\b([^>]*data-chapter-id=["']\d+["'][^>]*)>([\s\S]*?)<\/li>/gi)) {
        const chapterId = attr(match[1], 'data-chapter-id');
        if (!chapterId || seen[chapterId]) continue;
        seen[chapterId] = true;
        chapters.push({id: chapterId, name: strip(match[2].match(/<(?:span|div)\b[^>]*class=["'][^"']*(?:title-link|select-link)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i)?.[1]) || '第' + (chapters.length + 1) + '集'});
      }
      if (!chapters.length) throw new Error('aigua-video.episodes-unavailable');
      const playGroups = LINES.map(line => ({id: line[0], name: line[1], episodes: chapters.map(chapter => ({id: line[0] + ':' + chapter.id, name: chapter.name, playId: id + ':' + chapter.id + ':' + line[0]}))}));
      return {id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}), playGroups};
    },
    async play(input) {
      const values = text(input.playId).split(':'), videoId = values[0], chapterId = values[1], line = values[2] || '1';
      if (!/^\d+$/.test(videoId) || !/^\d+$/.test(chapterId)) throw new Error('aigua-video.play-invalid');
      const payload = await fetchJson('/video/play-url?videoId=' + videoId + '&sourceId=0&citycode=HKG&chapterId=' + chapterId);
      const resources = payload.data && payload.data.urlinfo && payload.data.urlinfo.resource_url || {}, url = text(resources[line] || resources['1'] || resources['16'] || resources['21']);
      if (!/^https?:\/\//i.test(url)) throw new Error('aigua-video.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': UA, Referer: BASE + '/'}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
