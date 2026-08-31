/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://www.kkys20.com';
  const IMAGE_BASE = 'https://vres.cyscyy.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const CATEGORIES = [['1','电影'],['2','连续剧'],['3','动漫'],['4','综艺'],['6','短剧']];
  const TYPES = {1:['剧情','喜剧','动作','爱情','恐怖','犯罪','科幻','悬疑','奇幻','冒险','战争','历史','古装','家庭','动画'],2:['剧情','爱情','喜剧','犯罪','悬疑','古装','动作','家庭','惊悚','奇幻','美剧','科幻','历史','战争','韩剧','武侠','都市'],3:['动态漫画','剧情','动画','喜剧','冒险','动作','奇幻','科幻','儿童','搞笑','爱情','热血','悬疑','运动'],4:['纪录','真人秀','脱口秀','剧情','历史','喜剧','传记','歌舞','运动'],6:['王爷太子','霸道总裁','赘婿系列','重生系列','穿越短剧','都市言情','逆袭','甜宠','虐恋','剧情','科幻','武侠','爱情','动作']};
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
  const posterUrl = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? IMAGE_BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async path => {
    const response = await dxplay.fetch({url: absolute(path), headers: Object.assign({'User-Agent': UA, Referer: BASE + '/'}, sourceHeaders)});
    if (response.status < 200 || response.status >= 300) throw new Error('cocoa-video.request-failed');
    return response.body;
  };
  const items = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/detail\/\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (!/(?:^|\s)v-item(?:\s|$)/i.test(attr(match[1], 'class'))) continue;
      const href = attr(match[1], 'href'), id = href.match(/\/detail\/(\d+)\.html/i)?.[1];
      if (!id || seen[id]) continue;
      let name = '';
      for (const title of match[2].matchAll(/<div\b([^>]*class=["'][^"']*v-item-title[^"']*["'][^>]*)>([\s\S]*?)<\/div>/gi)) {
        if (/display\s*:\s*none/i.test(title[1])) continue;
        name = strip(title[2]); if (name) break;
      }
      if (!name) continue;
      let image = '';
      for (const tag of match[2].matchAll(/<img\b([^>]*)>/gi)) {
        const candidate = attr(tag[1], 'data-original') || attr(tag[1], 'data-src') || attr(tag[1], 'src');
        if (candidate && !/logo_placeholder/i.test(candidate)) { image = candidate; break; }
      }
      seen[id] = true;
      const poster = posterUrl(image), remark = strip(match[2].match(/<div\b[^>]*class=["'][^"']*v-item-bottom[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
      output.push({id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})});
    }
    return output;
  };
  const filter = (key, name, values, initialValue = '') => ({key, name, initialValue, options: values.map(value => ({name: Array.isArray(value) ? value[0] : value, value: Array.isArray(value) ? value[1] : value}))});
  const categoryFilters = id => {
    const values = [filter('type','类型',[['全部',''],...(TYPES[id] || []).map(value => [value,value])])];
    if (id !== '6') values.push(filter('area','地区',[['全部',''],['大陆','中国大陆'],['香港','中国香港'],['台湾','中国台湾'],['美国','美国'],['日本','日本'],['韩国','韩国'],['英国','英国'],['法国','法国'],['其他','其他']]), filter('lang','语言',[['全部',''],['国语','国语'],['粤语','粤语'],['英语','英语'],['日语','日语'],['韩语','韩语'],['其他','其他']]), filter('year','年份',[['全部',''],['2026','2026'],['2025','2025'],['2024','2024'],['2023','2023'],['2022','2022'],['2021','2021'],['2020','2020'],['10年代','2010_2019'],['00年代','2000_2009'],['更早','0_1999']]));
    values.push(filter('sort','排序',[['综合','1'],['最新','2'],['最热','3'],...(id === '6' ? [] : [['评分','4']])],'3'));
    return values;
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.cocoa-video', name: 'Cocoa video',
    description: 'Readable rewrite of the public Cocoa catalog, filters, tokenized search, episode lines and direct media resolver.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'cocoa-video'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() { return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1], filters: categoryFilters(value[0])})), featured: items(await request('/'))}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), values = input.filters || {};
      const parts = [text(input.categoryId), text(values.type), text(values.area), text(values.lang), text(values.year), text(values.sort || '3'), String(page)].map(encodeURIComponent);
      const html = await request('/show/' + parts.join('-') + '.html'), found = items(html);
      return {page, pageCount: /page-item-next/i.test(html) ? page + 1 : page, items: found};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1), keyword = text(input.keyword), first = await request('/search?k=' + encodeURIComponent(keyword));
      const inputTag = [...first.matchAll(/<input\b([^>]*)>/gi)].find(match => attr(match[1], 'name') === 't');
      const token = inputTag ? attr(inputTag[1], 'value') : '';
      if (!token) return {page, pageCount: page, items: []};
      const html = await request('/search?k=' + encodeURIComponent(keyword) + '&t=' + encodeURIComponent(token) + (page > 1 ? '&page=' + page : ''));
      const found = [];
      for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/detail\/\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
        if (!/search-result-item/i.test(attr(match[1], 'class'))) continue;
        const id = attr(match[1], 'href').match(/\/detail\/(\d+)\.html/i)?.[1], name = strip(match[2].match(/<(?:div|span)\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span)>/i)?.[1]);
        if (!id || !name || found.some(value => value.id === id)) continue;
        let image = '';
        for (const tag of match[2].matchAll(/<img\b([^>]*)>/gi)) { const candidate = attr(tag[1], 'data-original') || attr(tag[1], 'src'); if (candidate && !/logo_placeholder/i.test(candidate)) { image = candidate; break; } }
        const poster = posterUrl(image);
        found.push({id, sourceKey, name, ...(poster ? {poster} : {})});
      }
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async detail(input) {
      const id = text(input.id).replace(/\D/g, ''), html = await request('/detail/' + id + '.html');
      const titleBlock = html.match(/<div\b[^>]*class=["'][^"']*detail-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
      const titles = [...titleBlock.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)].map(value => strip(value[1])).filter(Boolean);
      const name = titles[1] || titles[0] || id;
      const image = html.match(/<div\b[^>]*class=["'][^"']*detail-pic[^"']*["'][^>]*>[\s\S]*?<img\b([^>]*)>/i)?.[1] || '';
      const poster = posterUrl(attr(image, 'data-original') || attr(image, 'src'));
      const description = strip(html.match(/<div\b[^>]*class=["'][^"']*detail-desc[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]).slice(0, 2000);
      const lineNames = [];
      const sourceBox = html.match(/<div\b[^>]*class=["'][^"']*source-list-box-main[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
      for (const match of sourceBox.matchAll(/<a\b([^>]*class=["'][^"']*source-item[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) lineNames.push(strip(match[2].match(/<span\b[^>]*class=["'][^"']*source-item-label[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]) || '线路' + (lineNames.length + 1));
      const groups = [];
      const episodeBox = html.match(/<div\b[^>]*class=["'][^"']*episode-list-box-main[^"']*["'][^>]*>([\s\S]*?)(?=<\/div>\s*<\/div>|<script)/i)?.[1] || html;
      let lineIndex = 0;
      for (const block of episodeBox.matchAll(/<div\b([^>]*class=["'][^"']*episode-list(?:\s|["'])[^>]*?)>([\s\S]*?)<\/div>/gi)) {
        const episodes = [];
        for (const match of block[2].matchAll(/<a\b([^>]*href=["'][^"']*\/play\/\d+-\d+-\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
          const href = attr(match[1], 'href'), parts = href.match(/\/play\/\d+-(\d+)-(\d+)\.html/i);
          if (parts) episodes.push({id: parts[1] + ':' + parts[2], name: strip(match[2]) || '播放', playId: href});
        }
        const lineName = lineNames[lineIndex] || '线路' + (lineIndex + 1); lineIndex += 1;
        if (episodes.length && !/4k/i.test(lineName)) groups.push({id: String(lineIndex), name: lineName, episodes});
      }
      if (!groups.length) throw new Error('cocoa-video.episodes-unavailable');
      return {id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}), playGroups: groups};
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId)), html = (await request(pageUrl)).replace(/\\\//g, '/');
      let url = html.match(/playSource\s*=\s*\{[\s\S]*?src\s*:\s*["']([^"']+)/i)?.[1] || html.match(/https?:\/\/[^\s"'\\<>]+\.(?:m3u8|mp4|flv|mkv|webm)[^\s"'\\<>]*/i)?.[0] || '';
      url = absolute(decode(url));
      if (!/^https?:\/\//i.test(url)) throw new Error('cocoa-video.play-unavailable');
      const referer = url.match(/^(https?:\/\/[^?]+\.m3u8)/i)?.[1] || (url.match(/^(https?:\/\/[^/]+)/i)?.[1] || BASE) + '/';
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': UA, Referer: referer}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
