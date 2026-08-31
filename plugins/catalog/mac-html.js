/* global dxplay */
(() => {
  'use strict';

  const PRESETS = {
    town: {
      baseUrl: 'http://dyxz.tv',
      categories: [['1', '电影'], ['2', '电视剧'], ['3', '动漫'], ['4', '综艺']],
      category: (id, page) => '/list/' + id + '_' + page + '.html',
      kind: 'stui', resolver: 'town', searchable: false,
    },
    xigua: {
      baseUrl: 'https://sszzyy.com',
      categories: [['20', '电影'], ['37', '连续剧'], ['38', '综艺'], ['39', '动漫'], ['40', '短剧']],
      category: (id, page) => '/index.php/vod/show/id/' + id + '/page/' + page + '.html',
      search: (keyword) => '/index.php/vod/search.html?wd=' + encodeURIComponent(keyword),
      kind: 'stui', resolver: 'mac-player', searchable: true,
    },
    ifuntv: {
      baseUrl: 'https://www.ifuntv.cc',
      categories: [['32', '短剧'], ['2', '电视剧'], ['1', '电影'], ['4', '动漫'], ['3', '综艺']],
      category: (id, page) => '/f/id/' + id + '/page/' + page + '.html',
      kind: 'fed', resolver: 'fed-player', searchable: false,
    },
    dmmiku: {
      baseUrl: 'https://www.dmmiku.com',
      categories: [['22', '新番'], ['20', '完结']],
      category: (id, page) => '/index.php/vod/show/id/' + id + (page > 1 ? '/page/' + page : '') + '.html',
      search: keyword => '/index.php/vod/search.html?wd=' + encodeURIComponent(keyword) + '&submit=',
      kind: 'miku', resolver: 'page-parse', searchable: true,
    },
    fyyy: {
      baseUrl: 'http://ntfeiyu.com',
      categories: [['1', '电影'], ['2', '电视剧'], ['3', '综艺'], ['4', '动漫']],
      category: (id, page) => '/nt/' + id + '/area//by//class//lang//page/' + page + '/year/.html',
      kind: 'myui', resolver: 'direct-page', searchable: false,
    },
    yese: {
      baseUrl: 'https://yese.co',
      categories: [
        ['亚洲情色', '亚洲情色'], ['中文字幕', '中文字幕'], ['国产主播', '国产主播'],
        ['国产自拍', '国产自拍'], ['无码专区', '无码专区'], ['欧美性爱', '欧美性爱'],
        ['熟女人妻', '熟女人妻'], ['强奸乱伦', '强奸乱伦'], ['巨乳美乳', '巨乳美乳'],
        ['制服诱惑', '制服诱惑'], ['女同性恋', '女同性恋'], ['卡通动画', '卡通动画'],
        ['丝袜长腿', '丝袜长腿'], ['少女萝莉', '少女萝莉'], ['重口色情', '重口色情'],
      ],
      category: (id, page) => '/vod/show/class/' + encodeURIComponent(id) + '/id/1/page/' + page + '/',
      search: (keyword, page) => '/index.php/ajax/suggest?mid=1&wd=' + encodeURIComponent(keyword) + '&page=' + page,
      kind: 'yese', resolver: 'direct-page', searchable: true, searchKind: 'suggest-json', searchPaged: true,
    },
    shaofu: {
      baseUrl: 'https://sjsfcd6h.shaofu36.xyz',
      categories: [
        ['55', '国产精品'], ['63', '华语精品'], ['58', '黑料吃瓜'], ['60', '欧美'],
        ['57', '动漫'], ['65', '学生合集'], ['64', '乱伦精品'], ['61', '探花约炮'],
        ['80', '日本有码'], ['81', '主播网红'], ['12', '国产视频'], ['20', '中文字幕'],
        ['21', '国产传媒'], ['23', '日本无码'], ['24', '欧美无码'], ['69', '强奸乱伦'],
        ['70', '制服诱惑'], ['71', '国产主播'], ['72', '激情动漫'], ['25', '明星换脸'],
        ['26', '抖阴视频'], ['88', '女优明星'], ['56', '网曝黑料'], ['73', '伦理三级'],
        ['74', '字幕解说'], ['75', '捆绑调教'], ['76', '萝莉少女'], ['77', '极品媚黑'],
        ['78', '女同性恋'], ['84', '网红头条'], ['85', '人妖系列'],
      ],
      category: (id, page) => '/vodtype/' + id + (page > 1 ? '-' + page : '') + '.html',
      search: (keyword, page) => '/vodsearch/-------------.html?wd=' + encodeURIComponent(keyword) + '&page=' + page,
      kind: 'popup', resolver: 'mac-player', searchable: true, searchPaged: true,
    },
    youav: {
      baseUrl: 'https://youavhub.com',
      categories: [
        ['22', '日本AV'], ['20', '巨乳'], ['21', '熟女人妻'], ['23', '中文字幕'],
        ['24', '少女蘿莉'], ['26', '翹臀美尻'], ['29', '亂倫、誘惑'], ['34', '制服誘惑'],
        ['27', '高潮潮吹'], ['41', '多P群交'], ['38', 'SM調教'], ['25', '抖陰短片'],
        ['39', '激情口交'], ['33', 'AV女優無碼'], ['40', '野外性愛'], ['37', '麻豆'],
        ['28', '歐美無碼'], ['30', '國產素人自拍'], ['32', '同性戀'], ['43', '18+成人激情電影'],
      ],
      category: (id, page) => '/index.php/vod/show/id/' + id + '/page/' + page + '/',
      search: (keyword, page) => '/index.php/vod/search/?wd=' + encodeURIComponent(keyword) + '&page=' + page,
      kind: 'miku', resolver: 'mac-player', searchable: true, searchPaged: true,
    },
    roliz: {
      baseUrl: 'https://pnd27y1jh1.rolizxwnoble.buzz',
      home: '/vod/',
      category: (id, page) => '/vodtype/' + id + (page > 1 ? '/page/' + page : '') + '/',
      search: (keyword, page) => '/vodsearch/-------------/?wd=' + encodeURIComponent(keyword)
        + (page > 1 ? '&page=' + page : ''),
      kind: 'dl', resolver: 'mac-player', searchable: true, searchPaged: true, dynamicCategories: true,
    },
    huavod: {
      baseUrl: 'https://huavod.com',
      categories: [
        ['1', '电影'], ['2', '电视剧'], ['3', '综艺'], ['4', '动漫'], ['5', '短剧'], ['42', '纪录片'],
      ],
      category: (id, page) => '/vodshow/' + id + (page > 1 ? '/page/' + page : '') + '.html',
      search: (keyword, page) => '/vodsearch/-------------.html?wd=' + encodeURIComponent(keyword)
        + (page > 1 ? '&page=' + page : ''),
      kind: 'public', resolver: 'hua-app', searchable: true, searchPaged: true,
    },
    fantuan: {
      baseUrl: 'https://fantuansjz.com',
      home: '/',
      categories: [['1', '电影'], ['2', '剧集'], ['3', '综艺'], ['4', '动漫'], ['40', '豆瓣']],
      category: (id, page) => page === 1 ? '/sjvodtype/' + id + '.html'
        : '/sjvodshow/' + id + '--------' + page + '---.html',
      search: (keyword, page) => page === 1
        ? '/sjvodsearch/-------------.html?wd=' + encodeURIComponent(keyword)
        : '/sjvodsearch/' + encodeURIComponent(keyword) + '----------' + page + '---.html',
      kind: 'fed', resolver: 'mac-player', searchable: true, searchPaged: true,
    },
  };
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 12; TV) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36';
  let sourceKey = '', sourceHeaders = {}, preset = null, baseUrl = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10))).replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
  const absolute = value => {
    const raw = text(value).trim().replace(/&amp;/g, '&');
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? baseUrl + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const fetchPage = async (path, acceptedStatuses = []) => {
    const response = await dxplay.fetch({url: absolute(path), headers: Object.assign({'User-Agent': USER_AGENT, Referer: baseUrl + '/'}, sourceHeaders)});
    if ((response.status < 200 || response.status >= 300) && !acceptedStatuses.includes(response.status)) {
      throw new Error('mac-html.request-failed');
    }
    return response;
  };
  const request = async path => (await fetchPage(path)).body;
  const first = (value, pattern, group = 1) => {
    const match = text(value).match(pattern);
    return match ? text(match[group]) : '';
  };
  const blocks = (html, marker, limit = 120) => {
    const output = []; let offset = 0;
    while (output.length < limit) {
      const start = html.indexOf(marker, offset);
      if (start < 0) break;
      const next = html.indexOf(marker, start + marker.length);
      output.push(html.slice(start, next < 0 ? Math.min(html.length, start + 6000) : next));
      if (next < 0) break;
      offset = next;
    }
    return output;
  };
  const unique = values => {
    const seen = Object.create(null), output = [];
    for (const value of values) {
      if (!value || !value.id || seen[value.id]) continue;
      seen[value.id] = true; output.push(value);
    }
    return output;
  };
  const stuiItems = html => unique(blocks(html, 'stui-vodlist__box').map(block => {
    const tag = first(block, /<a[^>]*class=["'][^"']*stui-vodlist__thumb[^"']*["'][^>]*>/i, 0);
    const id = absolute(first(tag, /href=["']([^"']+)/i));
    const name = clean(first(tag, /title=["']([^"']+)/i));
    const rawPoster = first(tag, /(?:data-original|data-src|src)=["']([^"']+)/i);
    const poster = rawPoster && rawPoster !== '/' ? absolute(rawPoster) : '';
    const remark = clean(first(block, /class=["'][^"']*pic-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    return id && name ? {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})} : null;
  }));
  const fedItems = html => unique([
    ...blocks(html, 'fed-list-item fed-padding'),
    ...blocks(html, 'fed-list-deta'),
  ].map(block => {
    const picture = first(block, /<a[^>]*class=["'][^"']*fed-list-pics[^"']*["'][^>]*>/i, 0);
    const rawId = first(picture, /href=["']([^"']+)/i);
    const id = absolute(rawId.replace(/\/sjvodplay\/(\d+)-\d+-\d+\.html(?:$|[?#].*)/i, '/sjvoddetail/$1.html'));
    const name = clean(first(block, /<a[^>]*class=["'][^"']*fed-list-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)
      || first(block, /<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
      || first(picture, /title=["']([^"']+)/i)
      || first(block, /<img[^>]*alt=["']([^"']+)/i));
    const poster = absolute(first(picture, /(?:data-original|data-src|src)=["']([^"']+)/i));
    const remark = clean(first(block, /class=["'][^"']*fed-list-remarks[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    return id && name ? {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})} : null;
  }));
  const mikuItems = html => unique(blocks(html, 'vodlist_item').map(block => {
    const tag = first(block, /<a[^>]*class=["'][^"']*vodlist_thumb[^"']*["'][^>]*>/i, 0);
    const id = absolute(first(tag, /href=["']([^"']+)/i));
    const name = clean(first(tag, /title=["']([^"']+)/i));
    const poster = absolute(first(tag, /(?:data-original|data-src|src)=["']([^"']+)/i));
    const remark = clean(first(block, /class=["'][^"']*pic_text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    return id && name ? {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})} : null;
  }));
  const searchlistItems = html => unique(blocks(html, 'class="searchlist_item"').map(block => {
    const tag = first(block, /<a[^>]*class=["'][^"']*vodlist_thumb[^"']*["'][^>]*>/i, 0);
    const id = absolute(first(tag, /href=["']([^"']+)/i));
    const name = clean(first(tag, /title=["']([^"']+)/i));
    const poster = absolute(first(tag, /(?:data-original|data-src|src)=["']([^"']+)/i));
    const remark = clean(first(block, /class=["'][^"']*pic_text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    return id && name ? {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})} : null;
  }));
  const myuiItems = html => unique(blocks(html, 'myui-vodlist__box').map(block => {
    const tag = first(block, /<a[^>]*class=["'][^"']*myui-vodlist__thumb[^"']*["'][^>]*>/i, 0);
    const id = absolute(first(tag, /href=["']([^"']+)/i));
    const name = clean(first(tag, /title=["']([^"']+)/i));
    const style = first(tag, /style=["']([^"']+)/i);
    const poster = absolute(first(style, /url\(([^)]+)\)/i).replace(/^["']|["']$/g, '')
      || first(block, /<img[^>]*(?:data-original|data-src|src)=["']([^"']+)/i));
    const remark = clean(first(block, /class=["'][^"']*pic-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    return id && name ? {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})} : null;
  }));
  const yeseItems = html => unique(blocks(html, 'video-img-box').map(block => {
    const link = first(block, /<a[^>]*href=["']([^"']*\/vod\/play\/id\/(\d+)\/[^"']*)["'][^>]*>/i, 0);
    const vodId = first(link, /\/vod\/play\/id\/(\d+)\//i);
    const image = first(block, /<img[^>]*>/i, 0);
    const name = clean(first(image, /title=["']([^"']+)["']/i)
      || first(block, /class=["'][^"']*title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i));
    const poster = absolute(first(image, /(?:data-src|data-original|src)=["']([^"']+)["']/i));
    const id = vodId ? baseUrl + '/vod/detail/id/' + vodId + '/' : '';
    return id && name ? {id, sourceKey, name, ...(poster ? {poster} : {})} : null;
  }));
  const popupItems = html => unique(blocks(html, 'class="item"').map(block => {
    const link = first(block, /<a[^>]*class=["'][^"']*popup-video-link[^"']*["'][^>]*>/i, 0);
    const id = absolute(first(link, /href=["']([^"']+)["']/i));
    const name = clean(first(block, /<strong[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i)
      || first(link, /title=["']([^"']+)["']/i));
    const image = first(block, /<img[^>]*>/i, 0);
    const poster = absolute(first(image, /(?:data-src|data-original|src)=["']([^"']+)["']/i));
    return id && name ? {id, sourceKey, name, ...(poster ? {poster} : {})} : null;
  }));
  const dlItems = html => unique(blocks(html, '<dl>').map(block => {
    const tag = first(block, /<a[^>]*href=["'](\/voddetail\/[^"']+)["'][^>]*>/i, 0);
    const id = absolute(first(tag, /href=["']([^"']+)/i));
    const name = clean(first(block, /<h3[^>]*>([\s\S]*?)<\/h3>/i));
    const image = first(block, /<img[^>]*>/i, 0);
    const poster = absolute(first(image, /(?:data-original|data-src|src)=["']([^"']+)/i));
    return id && name ? {id, sourceKey, name, ...(poster ? {poster} : {})} : null;
  }));
  const publicItems = html => unique(blocks(html, 'public-list-box', 60).map(block => {
    const tag = first(block, /<a[^>]*class=["'][^"']*public-list-exp[^"']*["'][^>]*>/i, 0);
    const id = absolute(first(tag, /href=["']([^"']+)/i));
    const image = first(block, /<img[^>]*>/i, 0);
    const name = clean(first(tag, /title=["']([^"']+)/i)
      || first(image, /alt=["']([^"']+)/i).replace(/封面图$/, '')
      || first(block, /class=["'][^"']*(?:time-title|thumb-txt)[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i));
    const poster = absolute(first(image, /(?:data-src|data-original|src)=["']([^"']+)/i));
    const remark = clean(first(block, /class=["'][^"']*public-list-prb[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    return id && name && /\/voddetail\//i.test(id)
      ? {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})} : null;
  }));
  const items = html => preset.kind === 'fed' ? fedItems(html)
    : preset.kind === 'miku' ? unique([...mikuItems(html), ...searchlistItems(html)]) : preset.kind === 'myui' ? myuiItems(html)
      : preset.kind === 'yese' ? yeseItems(html) : preset.kind === 'popup' ? popupItems(html)
        : preset.kind === 'dl' ? dlItems(html) : preset.kind === 'public' ? publicItems(html) : stuiItems(html);
  const anchors = html => {
    const output = [], pattern = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null && output.length < 1000) output.push({href: absolute(match[1]), name: clean(match[2])});
    return output;
  };
  const stuiGroups = html => {
    const names = [], namePattern = /<a[^>]*href=["']#(?:playlist|down)[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = namePattern.exec(html)) !== null && names.length < 32) names.push(clean(match[1]));
    if (!names.length && preset.kind === 'miku') {
      const tabs = first(html, /class=["'][^"']*play_source_tab[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      const pattern = /<a[^>]*alt=["']([^"']+)["'][^>]*>/gi;
      while ((match = pattern.exec(tabs)) !== null && names.length < 32) names.push(clean(match[1]));
    }
    const groups = [], listPattern = preset.kind === 'miku'
      ? /<ul[^>]*class=["'][^"']*content_playlist[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi
      : /<ul[^>]*class=["'][^"']*stui-content__playlist[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi;
    while ((match = listPattern.exec(html)) !== null && groups.length < 32) {
      const episodes = anchors(match[1]).filter(value => /\/play\/|\/vod\/play\//i.test(value.href))
        .map((value, index) => ({id: String(index + 1), name: value.name || String(index + 1), playId: value.href}));
      if (episodes.length) groups.push({id: String(groups.length + 1), name: names[groups.length] || '线路 ' + (groups.length + 1), episodes});
    }
    return groups;
  };
  const fedGroups = html => {
    const lineNames = [], linePattern = /<a[^>]*class=["'][^"']*fed-btns-info[^"']*fed-back-green[^"']*["'][^>]*href=["'][^"']*\/play\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linePattern.exec(html)) !== null && lineNames.length < 32) lineNames.push(clean(match[1]));
    const tabLineNames = [], tabLinePattern = /<a[^>]*class=["'][^"']*fed-tabs-btn[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = tabLinePattern.exec(html)) !== null && tabLineNames.length < 32) tabLineNames.push(clean(match[1]));
    const names = tabLineNames.length ? tabLineNames : lineNames;
    const groups = [], tabListPattern = /<ul[^>]*class=["'][^"']*fed-tabs-btm[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi;
    while ((match = tabListPattern.exec(html)) !== null && groups.length < 32) {
      const episodes = anchors(match[1]).filter(value => /\/(?:sjvod)?play\//i.test(value.href))
        .map((value, index) => ({id: String(index + 1), name: value.name || String(index + 1), playId: value.href}));
      if (episodes.length) groups.push({id: String(groups.length + 1), name: names[groups.length] || '线路 ' + (groups.length + 1), episodes});
    }
    const listPattern = /<div[^>]*class=["'][^"']*fed-play-item[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["'][^"']*fed-play-item|<\/div>\s*<\/div>\s*<\/div>)/gi;
    while ((match = listPattern.exec(html)) !== null && groups.length < 32) {
      const episodes = anchors(match[1]).filter(value => /\/play\//i.test(value.href))
        .map((value, index) => ({id: String(index + 1), name: value.name || String(index + 1), playId: value.href}));
      if (episodes.length) groups.push({id: String(groups.length + 1), name: names[groups.length] || '线路 ' + (groups.length + 1), episodes});
    }
    if (!groups.length) {
      const episodes = anchors(html).filter(value => /\/(?:sjvod)?play\//i.test(value.href))
        .map((value, index) => ({id: String(index + 1), name: value.name || String(index + 1), playId: value.href}));
      if (episodes.length) groups.push({id: '1', name: names[0] || '在线播放', episodes: unique(episodes.map(value => ({...value, id: value.playId}))).map((value, index) => ({...value, id: String(index + 1)}))});
    }
    return groups;
  };
  const myuiGroups = html => {
    const names = Object.create(null), groups = [];
    let match;
    const namePattern = /<a[^>]*href=["']#playlist(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = namePattern.exec(html)) !== null) names[match[1]] = clean(match[2]);
    const listPattern = /<div[^>]*id=["']playlist(\d+)["'][^>]*>[\s\S]*?<ul[^>]*class=["'][^"']*myui-content__list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi;
    while ((match = listPattern.exec(html)) !== null && groups.length < 32) {
      const episodes = anchors(match[2]).filter(value => /\/yu\/[^/]+\.html(?:$|[?#])/i.test(value.href))
        .map((value, index) => ({id: String(index + 1), name: value.name || String(index + 1), playId: value.href}));
      if (episodes.length) groups.push({id: 'line-' + match[1], name: names[match[1]] || '线路 ' + (groups.length + 1), episodes});
    }
    return groups;
  };
  const yeseGroups = html => {
    const list = first(html, /<ul[^>]*class=["'][^"']*myui-content__list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
    const episodes = anchors(list).filter(value => /\/vod\/play\/id\/\d+\/sid\/\d+\/nid\/\d+\//i.test(value.href))
      .map((value, index) => ({id: String(index + 1), name: value.name || String(index + 1), playId: value.href}));
    return episodes.length ? [{id: '1', name: '在线播放', episodes}] : [];
  };
  const popupGroups = html => {
    const episodes = anchors(html).filter(value => /\/vodplay\/\d+-\d+-\d+\.html/i.test(value.href))
      .map((value, index) => ({id: String(index + 1), name: value.name || String(index + 1), playId: value.href}));
    const values = unique(episodes.map(value => ({...value, id: value.playId})))
      .map((value, index) => ({...value, id: String(index + 1)}));
    return values.length ? [{id: '1', name: '在线播放', episodes: values}] : [];
  };
  const vodplayGroups = html => {
    const episodes = anchors(html).filter(value => /\/vodplay\//i.test(value.href))
      .map(value => ({id: value.href, name: value.name || '正片', playId: value.href}));
    const values = unique(episodes).map((value, index) => ({...value, id: String(index + 1)}));
    return values.length ? [{id: '1', name: '在线播放', episodes: values}] : [];
  };
  const publicGroups = html => {
    const names = [], tab = first(html, /<div[^>]*class=["'][^"']*anthology-tab[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    let match;
    const namePattern = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = namePattern.exec(tab)) !== null && names.length < 32) names.push(clean(match[1]));
    const groups = [], listPattern = /<ul[^>]*class=["'][^"']*anthology-list-play[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi;
    while ((match = listPattern.exec(html)) !== null && groups.length < 32) {
      const episodes = anchors(match[1]).filter(value => /\/vodplay\/\d+-\d+-\d+\.html/i.test(value.href))
        .map((value, index) => ({id: String(index + 1), name: value.name || String(index + 1), playId: value.href}));
      if (episodes.length) groups.push({id: String(groups.length + 1), name: names[groups.length] || '线路 ' + (groups.length + 1), episodes});
    }
    return groups;
  };
  const categoriesFromHtml = html => {
    const values = [], pattern = /<a[^>]*href=["']\/vodtype\/(\d+)\/["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null && values.length < 120) values.push({id: match[1], name: clean(match[2])});
    return unique(values.filter(value => value.name));
  };
  const base64Decode = value => {
    const input = text(value).replace(/\s/g, ''), bytes = [];
    for (let index = 0; index < input.length; index += 4) {
      const a = B64.indexOf(input[index]), b = B64.indexOf(input[index + 1]);
      const c = input[index + 2] === '=' ? -1 : B64.indexOf(input[index + 2]);
      const d = input[index + 3] === '=' ? -1 : B64.indexOf(input[index + 3]);
      if (a < 0 || b < 0) throw new Error('mac-html.base64-invalid');
      bytes.push((a << 2) | (b >>> 4));
      if (c >= 0) bytes.push(((b & 15) << 4) | (c >>> 2));
      if (d >= 0) bytes.push(((c & 3) << 6) | d);
    }
    let encoded = '';
    for (const byte of bytes) encoded += '%' + byte.toString(16).padStart(2, '0');
    try { return decodeURIComponent(encoded); } catch (_) { return String.fromCharCode(...bytes); }
  };
  const resolveMacPlayer = html => {
    const raw = first(html, /var\s+player_(?:aaaa|data)\s*=\s*(\{[\s\S]*?\})\s*<\/script>/i);
    if (!raw) throw new Error('mac-html.player-missing');
    let data;
    try { data = JSON.parse(raw); } catch (_) { throw new Error('mac-html.player-invalid'); }
    let url = text(data.url).replace(/\\\//g, '/');
    if (Number(data.encrypt) === 1) url = decodeURIComponent(url);
    else if (Number(data.encrypt) === 2) url = decodeURIComponent(base64Decode(url));
    return url;
  };
  const resolveHuaPlayer = async html => {
    const frame = absolute(first(html, /<iframe[^>]*src=["']([^"']+)/i));
    if (!frame) throw new Error('mac-html.player-frame-missing');
    const player = await request(frame);
    const channel = first(player, /["']channel_key["']\s*:\s*["']([^"']+)/i).replace(/\\\//g, '/');
    if (!/^https?:\/\//i.test(channel)) throw new Error('mac-html.player-channel-missing');
    const response = await request('https://newitv.yubikey.top/api/content/parse?url=' + encodeURIComponent(channel));
    let envelope = response.trim();
    try {
      const decoded = JSON.parse(envelope);
      if (typeof decoded === 'string') envelope = decoded;
    } catch (_) {}
    const parts = envelope.replace(/^v2::/, '').split('|');
    if (!envelope.startsWith('v2::') || parts.length !== 4) throw new Error('mac-html.player-response-invalid');
    const timestamp = Number(parts[2]);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    const keyBase64 = dxplay.crypto.pbkdf2Sha256({
      keyBase64: 'H5Jd7kEkmtUOwrHq3chMII0ovE27FAZDuwfV82gYKlY=',
      salt: 'session_default_default_' + date, iterations: 10000, length: 32,
    });
    if (dxplay.crypto.hmacSha256({keyBase64, text: parts[0]}) !== parts[1]) {
      throw new Error('mac-html.player-signature-invalid');
    }
    const bytes = dxplay.codec.base64Decode(parts[0]);
    if (bytes.length < 28) throw new Error('mac-html.player-response-invalid');
    const plain = dxplay.crypto.aesGcmDecrypt({
      keyBase64,
      nonceBase64: dxplay.codec.base64Encode(bytes.slice(0, 12)),
      base64: dxplay.codec.base64Encode(bytes.slice(12)),
    });
    let payload;
    try { payload = JSON.parse(plain); } catch (_) { throw new Error('mac-html.player-response-invalid'); }
    if (Number(payload.timestamp) !== timestamp || text(payload.nonce) !== parts[3]) {
      throw new Error('mac-html.player-response-invalid');
    }
    return text(payload.data && payload.data.data && payload.data.data.url);
  };

  dxplay.register({
    id: 'org.dxsrc.shared.mac-html',
    name: 'MacCMS HTML catalog family',
    description: 'Readable preset-bounded catalogs for currently reachable Cluntop MacCMS-style HTML sites.',
    version: '1.8.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'mac-html'; sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : {};
      preset = PRESETS[text(extension.preset) || 'town'];
      if (!preset) throw new Error('mac-html.preset-invalid');
      baseUrl = text(extension.baseUrl || preset.baseUrl).replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('mac-html.base-url-invalid');
      return {ready: true};
    },
    async home() {
      const html = await request(preset.home || preset.category(preset.categories[0][0], 1));
      const categories = preset.dynamicCategories ? categoriesFromHtml(html)
        : preset.categories.map(value => ({id: value[0], name: value[1]}));
      if (!categories.length) throw new Error('mac-html.categories-unavailable');
      const featured = items(html);
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const values = items(await request(preset.category(text(input.categoryId), page)));
      return {page, pageCount: values.length ? page + 1 : page, items: values};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (!preset.searchable || (page > 1 && !preset.searchPaged)) return {page, pageCount: page, items: []};
      if (preset.searchKind === 'suggest-json') {
        let payload;
        try { payload = JSON.parse(await request(preset.search(text(input.keyword), page))); }
        catch (_) { throw new Error('mac-html.search-response-invalid'); }
        const values = Array.isArray(payload.list) ? payload.list.map(value => {
          const vodId = text(value && value.id);
          const name = clean(value && value.name);
          const poster = absolute(value && value.pic);
          return vodId && name ? {
            id: baseUrl + '/vod/detail/id/' + vodId + '/', sourceKey, name, ...(poster ? {poster} : {}),
          } : null;
        }) : [];
        return {page, pageCount: page, items: unique(values)};
      }
      if (preset.kind === 'public') {
        const response = await fetchPage(preset.search(text(input.keyword), page), [404, 500]);
        if (response.status >= 400) return {page, pageCount: page, items: []};
        return {page, pageCount: page, items: items(response.body)};
      }
      return {page, pageCount: page, items: items(await request(preset.search(text(input.keyword), page)))};
    },
    async detail(input) {
      const html = await request(text(input.id));
      const groups = preset.kind === 'fed' ? fedGroups(html) : preset.kind === 'myui' ? myuiGroups(html)
        : preset.kind === 'yese' ? yeseGroups(html) : preset.kind === 'popup' ? popupGroups(html)
          : preset.kind === 'dl' ? vodplayGroups(html) : preset.kind === 'public' ? publicGroups(html) : stuiGroups(html);
      if (!groups.length) throw new Error('mac-html.episodes-unavailable');
      const name = clean((preset.kind === 'popup' ? first(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/详情介绍[\s\S]*$/, '') : '')
        || (preset.kind === 'public' ? first(html, /<meta[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)/i).replace(/-华视影院$/, '') : '')
        || first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
        || first(html, /<h2[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)) || text(input.id).split('/').pop();
      const poster = absolute((preset.kind === 'myui' ? first(html, /class=["'][^"']*myui-content__thumb[^"']*["'][\s\S]*?<img[^>]*(?:data-original|data-src|src)=["']([^"']+)/i) : '')
        || first(html, /<a[^>]*class=["'][^"']*vodlist_thumb[^"']*["'][^>]*(?:data-original|data-src)=["']([^"']+)/i)
        || first(html, /<meta[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)/i)
        || first(html, /<img[^>]*(?:data-original|data-src|src)=["']([^"']+)/i));
      const description = clean((preset.kind === 'public' ? first(html, /<meta[^>]*(?:property|name)=["']og:description["'][^>]*content=["']([^"']+)/i) : '')
        || first(html, /(?:剧情介绍|id=["']desc["'])[^>]*>([\s\S]*?)(?:<\/p>|<\/div>)/i));
      return {id: text(input.id), sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}), playGroups: groups};
    },
    async play(input) {
      const pageUrl = text(input.playId), html = await request(pageUrl); let url = '', parse = false;
      if (preset.resolver === 'direct-page') {
        url = first(html, /https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/i, 0).replace(/\\\//g, '/');
      } else if (preset.resolver === 'page-parse') {
        url = absolute(pageUrl); parse = true;
      } else if (preset.resolver === 'mac-player') {
        url = resolveMacPlayer(html); parse = !/\.(?:m3u8|mp4|mkv|flv|ts)(?:$|[?#])/i.test(url);
      } else if (preset.resolver === 'fed-player') {
        const encoded = first(html, /data-play=["']([^"']+)/i);
        url = encoded.length > 3 ? base64Decode(encoded.slice(3)) : '';
        parse = !/\.(?:m3u8|mp4|mkv|flv|ts)(?:$|[?#])/i.test(url);
      } else if (preset.resolver === 'hua-app') {
        url = await resolveHuaPlayer(html);
      } else {
        const frame = absolute(first(html, /<iframe[^>]*src=["']([^"']+)/i));
        if (!frame) throw new Error('mac-html.player-frame-missing');
        const playerResponse = await fetchPage(frame), player = playerResponse.body;
        const token = first(player, /const\s+Url\s*=\s*["']([^"']+)/i), sign = first(player, /const\s+Sign\s*=\s*["']([^"']+)/i), from = first(player, /const\s+From\s*=\s*["']([^"']+)/i);
        if (!token || !sign || !from) throw new Error('mac-html.player-token-missing');
        const playerUrl = text(playerResponse.url) || frame;
        const endpoint = playerUrl.slice(0, playerUrl.lastIndexOf('/') + 1) + 'api.php?url=' + encodeURIComponent(token) + '&sign=' + encodeURIComponent(sign) + '&t=' + encodeURIComponent(from);
        let payload;
        try { payload = JSON.parse(await request(endpoint)); } catch (_) { throw new Error('mac-html.player-response-invalid'); }
        url = text(payload.url);
      }
      if (!/^https?:\/\//i.test(url)) throw new Error('mac-html.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': USER_AGENT, Referer: baseUrl + '/'}, parse};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; preset = null; baseUrl = ''; },
  });
})();
