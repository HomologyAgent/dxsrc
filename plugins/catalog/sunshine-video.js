/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://www.yangguangbd.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const CATEGORIES = [['dying','电影'],['dshiju','电视剧'],['dman','动漫'],['zying','综艺'],['jilupian','纪录片'],['duanju','短剧']];
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
  const request = async path => {
    const response = await dxplay.fetch({url: absolute(path), headers: Object.assign({'User-Agent': UA, Referer: BASE + '/'}, sourceHeaders)});
    if (response.status < 200 || response.status >= 300) throw new Error('sunshine-video.request-failed');
    return response.body;
  };
  const cards = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/ygn\/\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), id = href.match(/\/ygn\/(\d+)\.html/i)?.[1];
      if (!id || seen[id] || !/stui-vodlist__thumb/i.test(attr(match[1], 'class'))) continue;
      const name = attr(match[1], 'title') || attr(match[1], 'alt') || strip(match[2]);
      if (!name) continue;
      seen[id] = true;
      const image = match[2].match(/<img\b([^>]*)>/i)?.[1] || '';
      const poster = absolute(attr(match[1], 'data-original') || attr(match[1], 'data-src') || attr(image, 'data-original') || attr(image, 'src'));
      output.push({id, sourceKey, name, ...(poster ? {poster} : {})});
    }
    return output;
  };
  const meta = (html, label) => {
    const details = strip(html.match(/<div\b[^>]*class=["'][^"']*stui-content__detail[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    return details.match(new RegExp(label + '\\s*[:：]\\s*([^：:]+?)(?=主演|导演|地区|年份|状态|类型|$)', 'i'))?.[1]?.trim() || '';
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.sunshine-video', name: 'Sunshine video',
    description: 'Readable rewrite of the public Sunshine catalog, search, episode pages and direct HLS resolver.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'sunshine-video'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() { return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: cards(await request('/'))}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), id = encodeURIComponent(text(input.categoryId));
      const path = page === 1 ? '/ygx/' + id + '-----------.html' : '/ygx/' + id + '--------' + page + '---.html';
      const found = cards(await request(path));
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const found = cards(await request('/ygs/' + encodeURIComponent(text(input.keyword)) + '-------------.html'));
      return {page, pageCount: page, items: found};
    },
    async detail(input) {
      const id = text(input.id).replace(/\D/g, ''), html = await request('/ygn/' + id + '.html');
      const playGroups = [], seen = Object.create(null);
      for (const box of html.matchAll(/<div\b([^>]*class=["'][^"']*stui-pannel-box[^"']*["'][^>]*)>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*stui-pannel-box|<\/main>|<footer)/gi)) {
        if (!/stui-content__playlist/i.test(box[2])) continue;
        const episodes = [];
        for (const match of box[2].matchAll(/<a\b([^>]*href=["'][^"']*\/ygb\/\d+-\d+-\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
          const href = attr(match[1], 'href');
          if (!href || seen[href]) continue;
          const parts = href.match(/\/ygb\/\d+-(\d+)-(\d+)\.html/i), name = strip(match[2]) || attr(match[1], 'title');
          if (!parts) continue;
          seen[href] = true;
          episodes.push({id: parts[1] + ':' + parts[2], name: name || '第' + parts[2] + '集', playId: href});
        }
        if (episodes.length) playGroups.push({id: String(playGroups.length + 1), name: strip(box[2].match(/<h2\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1]) || '线路' + (playGroups.length + 1), episodes});
      }
      if (!playGroups.length) {
        const groups = Object.create(null), order = [];
        for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/ygb\/\d+-\d+-\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
          const href = attr(match[1], 'href'), parts = href.match(/\/ygb\/\d+-(\d+)-(\d+)\.html/i);
          if (!parts || seen[href]) continue;
          if (!groups[parts[1]]) { groups[parts[1]] = []; order.push(parts[1]); }
          seen[href] = true;
          groups[parts[1]].push({id: parts[1] + ':' + parts[2], name: strip(match[2]) || '第' + parts[2] + '集', playId: href});
        }
        for (const sid of order) playGroups.push({id: sid, name: '线路' + sid, episodes: groups[sid]});
      }
      if (!playGroups.length) throw new Error('sunshine-video.episodes-unavailable');
      const name = strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || id;
      const image = html.match(/<div\b[^>]*class=["'][^"']*stui-content__thumb[^"']*["'][^>]*>[\s\S]*?<img\b([^>]*)>/i)?.[1] || '';
      const poster = absolute(attr(image, 'data-original') || attr(image, 'data-src') || attr(image, 'src'));
      const description = strip(html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)?.[1] || '').slice(0, 2000);
      return {id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}), actors: meta(html, '主演'), director: meta(html, '导演'), area: meta(html, '地区'), year: meta(html, '年份'), playGroups};
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId)), html = (await request(pageUrl)).replace(/\\\//g, '/');
      const raw = html.match(/player_\w+\s*=\s*(\{.*?\})\s*<\/script/s)?.[1] || html.match(/player_\w+\s*=\s*(\{.*?\})\s*;/s)?.[1];
      let url = '';
      if (raw) { try { url = text(JSON.parse(raw).url); } catch (_) {} }
      if (!/^https?:\/\//i.test(url)) url = html.match(/https?:\/\/[^\s"'\\<>]+\.(?:m3u8|mp4)[^\s"'\\<>]*/i)?.[0] || '';
      if (!/^https?:\/\//i.test(url)) throw new Error('sunshine-video.play-unavailable');
      const origin = url.match(/^(https?:\/\/[^/]+)/i)?.[1] || BASE;
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': UA, Referer: origin + '/'}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
