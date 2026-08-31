/* global dxplay */
(() => {
  'use strict';

  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
  const PRESETS = {
    qwmp4: {base: 'https://www.qwmp4.com', pageSize: 20},
    xb6v: {base: 'https://www.xb6v.com', pageSize: 18},
    meijumi: {base: 'https://www.meijumi.net', pageSize: 20},
    gaoqing: {base: 'https://www.gaoqing888.com', pageSize: 20},
  };
  const XB_CATEGORIES = /^\/(?:xijupian|dongzuopian|aiqingpian|kehuanpian|kongbupian|juqingpian|zhanzhengpian|jilupian|donghuapian|dianshiju|ZongYi)\/$/i;

  let sourceKey = '';
  let presetName = '';
  let preset = PRESETS.qwmp4;
  let base = preset.base;
  let sourceHeaders = {};
  let itemCache = Object.create(null);

  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
  const attr = (attributes, name) => {
    const quoted = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(text(attributes));
    if (quoted) return decode(quoted[1]);
    const single = new RegExp("\\b" + name + "\\s*=\\s*'([^']*)'", 'i').exec(text(attributes));
    return decode(single?.[1] || '');
  };
  const absolute = value => {
    const raw = decode(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? base + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async (path, options) => {
    const target = absolute(path);
    const headers = Object.assign({'User-Agent': USER_AGENT, Referer: base + '/'}, sourceHeaders, options?.headers || {});
    const response = await dxplay.fetch({
      url: target,
      method: options?.method || 'GET',
      headers,
      ...(options?.body === undefined ? {} : {body: options.body}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('download-share.request-failed');
    return response;
  };
  const provider = url => {
    if (/https?:\/\/pan\.quark\.cn\//i.test(url)) return {id: 'quark', name: '夸克网盘'};
    if (/https?:\/\/pan\.baidu\.com\//i.test(url)) return {id: 'baidu', name: '百度网盘'};
    if (/https?:\/\/(?:www\.)?(?:aliyundrive|alipan)\.com\//i.test(url)) return {id: 'ali', name: '阿里云盘'};
    if (/https?:\/\/(?:[^/]+\.)?115\.com\//i.test(url)) return {id: '115', name: '115网盘'};
    return undefined;
  };
  const accessCode = url => {
    const encoded = /[?&](?:pwd|password|code)=([^&#]+)/i.exec(url)?.[1] || '';
    try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
  };
  const remember = item => {
    itemCache[item.id] = item;
    return item;
  };
  const imageMatching = (html, name) => {
    for (const match of text(html).matchAll(/<img\b([^>]*)>/gi)) {
      if (name && strip(attr(match[1], 'alt')) !== name) continue;
      const url = absolute(attr(match[1], 'data-original') || attr(match[1], 'data-src') || attr(match[1], 'src'));
      if (url) return url;
    }
    return '';
  };
  const qwItems = html => {
    const output = [], seen = Object.create(null);
    for (const match of text(html).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const block = match[1], link = /<a\b([^>]*href=["']\/mv\/\d+\.html["'][^>]*)>/i.exec(block);
      if (!link) continue;
      const id = attr(link[1], 'href'), name = strip(attr(link[1], 'title') || block.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
      if (!id || !name || seen[id]) continue;
      const poster = imageMatching(block, name) || imageMatching(block, '');
      const remark = strip(block.match(/class=["'][^"']*(?:bottom2|tag)[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]);
      seen[id] = true;
      output.push(remember({id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})}));
    }
    return output;
  };
  const xbItems = html => {
    const output = [], seen = Object.create(null);
    for (const match of text(html).matchAll(/<li\b[^>]*class=["'][^"']*\bpost\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
      const block = match[1], link = /<a\b([^>]*class=["'][^"']*zoom[^"']*["'][^>]*)>/i.exec(block)
        || /<h2[^>]*>[\s\S]*?<a\b([^>]*)>/i.exec(block);
      if (!link) continue;
      const id = attr(link[1], 'href');
      const titledName = strip(attr(link[1], 'title'));
      const name = titledName || strip(block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
      if (!/^\/[A-Za-z0-9/_-]+\.html$/i.test(id) || !name || seen[id]) continue;
      const poster = imageMatching(block, name) || imageMatching(block, '');
      const remark = strip(block.match(/class=["'][^"']*entry_post[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]).slice(0, 180);
      seen[id] = true;
      output.push(remember({id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})}));
    }
    return output;
  };
  const meijumiItems = html => {
    const output = [], seen = Object.create(null);
    for (const link of text(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (output.length >= 80) break;
      const raw = attr(link[1], 'href');
      const id = /^(?:https?:\/\/[^/]+)?(\/\d+\.html)(?:[#?].*)?$/i.exec(raw)?.[1] || '';
      if (!id || seen[id]) continue;
      const name = strip(attr(link[1], 'title') || link[2]);
      if (!name || /(?:评论|阅读全文|阅读$)/.test(name)) continue;
      const poster = imageMatching(link[2], '');
      seen[id] = true;
      output.push(remember({id, sourceKey, name, ...(poster ? {poster} : {})}));
    }
    const likelyShares = output.filter(item => /(?:网盘|云盘)/.test(item.name));
    return likelyShares.concat(output.filter(item => !/(?:网盘|云盘)/.test(item.name)));
  };
  const gaoqingItems = html => {
    const output = [], seen = Object.create(null);
    for (const match of text(html).matchAll(/<a\b([^>]*class=["'][^"']*\bvideo-item\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const raw = attr(match[1], 'href');
      const id = /\/(\d+)\/detail(?:[?#].*)?$/i.exec(raw)?.[1] || '';
      if (!id || seen[id]) continue;
      const name = strip(attr(match[1], 'title')) || strip(attr(match[2], 'alt'));
      if (!name) continue;
      const poster = imageMatching(match[2], '') || absolute(attr(match[2], 'src'));
      const score = strip(match[2].match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1]);
      seen[id] = true;
      output.push(remember({id, sourceKey, name, ...(poster ? {poster} : {}), ...(score ? {remark: '评分 ' + score} : {})}));
    }
    for (const block of text(html).split(/<div\b[^>]*class=["'][^"']*\bvideo-row\b[^"']*["'][^>]*>/i).slice(1, 61)) {
      const link = /<a\b([^>]*class=["'][^"']*\btitle-link\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/i.exec(block)
        || /<a\b([^>]*class=["'][^"']*\bcover-link\b[^"']*["'][^>]*)>/i.exec(block);
      const raw = attr(link?.[1], 'href'), id = /\/(\d+)\/detail(?:[?#].*)?$/i.exec(raw)?.[1] || '';
      if (!id || seen[id]) continue;
      const name = strip(link?.[2]) || strip(attr(block, 'alt'));
      if (!name) continue;
      const poster = imageMatching(block, '');
      const score = strip(block.match(/class=["'][^"']*\brate-num\b[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]);
      seen[id] = true;
      output.push(remember({id, sourceKey, name, ...(poster ? {poster} : {}), ...(score ? {remark: '评分 ' + score} : {})}));
    }
    return output;
  };
  const pageHtml = body => {
    if (presetName !== 'gaoqing' || !/^\s*\{/.test(text(body))) return body;
    try { return text(JSON.parse(body).content); } catch (_) { return body; }
  };
  const parseItems = body => {
    const html = pageHtml(body);
    return presetName === 'qwmp4' ? qwItems(html) : presetName === 'xb6v' ? xbItems(html)
      : presetName === 'gaoqing' ? gaoqingItems(html) : meijumiItems(html);
  };
  const parseCategories = html => {
    const output = [], seen = Object.create(null);
    for (const match of text(html).matchAll(/<a\b([^>]*href=["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const id = attr(match[1], 'href'), name = strip(match[2]);
      const valid = presetName === 'qwmp4' ? /^\/vt\/\d+\.html$/i.test(id)
        : presetName === 'xb6v' ? XB_CATEGORIES.test(id) : /^\/(?:usa|en|hanju)\/$/i.test(id);
      if (!valid || !name || seen[id]) continue;
      seen[id] = true;
      output.push({id, name});
    }
    return output;
  };
  const shareLinks = html => {
    const output = [], seen = Object.create(null);
    const collect = (block, fallbackName) => {
      for (const match of text(block).matchAll(/<a\b([^>]*)>/gi)) {
        const url = absolute(attr(match[1], 'href')), service = provider(url);
        if (!service || seen[url] || output.length >= 120) continue;
        const label = strip(attr(match[1], 'title') || fallbackName).slice(0, 160);
        seen[url] = true;
        output.push({url, provider: service, name: label || service.name, accessCode: accessCode(url)});
      }
    };
    if (presetName === 'xb6v') {
      for (const match of text(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
        const label = strip(match[1].match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1]);
        collect(match[1], label);
      }
    }
    collect(html, '');
    return output;
  };
  const groupsFor = links => {
    const groups = [];
    for (const service of [{id: 'quark', name: '夸克网盘'}, {id: 'baidu', name: '百度网盘'}, {id: 'ali', name: '阿里云盘'}, {id: '115', name: '115网盘'}]) {
      const matching = links.filter(link => link.provider.id === service.id);
      if (!matching.length) continue;
      groups.push({
        id: service.id, name: service.name,
        episodes: matching.map((link, index) => ({
          id: service.id + '-' + (index + 1),
          name: link.name === service.name ? service.name + ' ' + (index + 1) : link.name,
          playId: link.url,
          drive: {kind: 'drive-share', url: link.url, ...(link.accessCode ? {accessCode: link.accessCode} : {})},
        })),
      });
    }
    return groups;
  };
  const categoryPath = (id, page) => {
    if (presetName === 'gaoqing') return id === 'updates'
      ? '/?page=' + page : '/movie?sort=recommend&page=' + page;
    if (page <= 1) return id;
    if (presetName === 'qwmp4') return id.replace(/\.html$/i, '-' + page + '.html');
    if (presetName === 'xb6v') return id.replace(/\/$/, '/index_' + page + '.html');
    return id.replace(/\/$/, '/page/' + page + '/');
  };
  const pageResult = (items, page) => ({page, pageCount: items.length >= preset.pageSize ? page + 1 : page, items});

  dxplay.register({
    id: 'org.dxsrc.cluntop.public-download-shares',
    name: 'Public download-site shares',
    description: 'Readable public download catalogs that expose only DXPlay-supported cloud-drive shares.',
    version: '1.2.0',
    protocol: 'catalog@1',
    async init(input) {
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : {};
      presetName = text(extension.preset).trim().toLowerCase() || 'qwmp4';
      if (!PRESETS[presetName]) throw new Error('download-share.preset-invalid');
      preset = PRESETS[presetName];
      base = text(extension.base).replace(/\/+$/, '') || preset.base;
      sourceKey = text(input.sourceKey) || presetName;
      sourceHeaders = input.headers || {};
      itemCache = Object.create(null);
      return {ready: true};
    },
    async home() {
      const html = (await request('/')).body;
      const categories = presetName === 'gaoqing'
        ? [{id: 'updates', name: '每日更新'}, {id: 'movies', name: '选电影'}]
        : presetName === 'meijumi'
        ? [{id: '/usa/', name: '美剧'}, {id: '/en/', name: '英剧'}, {id: '/hanju/', name: '韩剧'}]
        : parseCategories(html);
      return {categories, featured: parseItems(html).slice(0, 60)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), id = text(input.categoryId);
      const valid = presetName === 'gaoqing' ? /^(?:updates|movies)$/.test(id)
        : presetName === 'qwmp4' ? /^\/vt\/\d+\.html$/i.test(id)
        : presetName === 'xb6v' ? XB_CATEGORIES.test(id) : /^\/(?:usa|en|hanju)\/$/i.test(id);
      if (!valid) throw new Error('download-share.category-invalid');
      const options = presetName === 'gaoqing' && id === 'updates'
        ? {headers: {'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01'}}
        : undefined;
      return pageResult(parseItems((await request(categoryPath(id, page), options)).body), page);
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1), keyword = text(input.keyword).trim();
      if (!keyword || page > 1) return {page, pageCount: 1, items: []};
      if (presetName === 'gaoqing') {
        return pageResult(parseItems((await request('/search?kw=' + encodeURIComponent(keyword))).body), page);
      }
      if (presetName === 'qwmp4') {
        const html = (await request('/vs/-------------.html?wd=' + encodeURIComponent(keyword))).body;
        if (/verify_check|系统安全验证|mac_verify/i.test(html)) return {page, pageCount: 1, items: []};
        return pageResult(parseItems(html), page);
      }
      if (presetName === 'meijumi') {
        const path = (page > 1 ? '/page/' + page + '/' : '/') + '?s=' + encodeURIComponent(keyword);
        return pageResult(parseItems((await request(path)).body), page);
      }
      const body = 'show=title&tempid=1&tbname=article&mid=1&dopost=search&submit=&keyboard=' + encodeURIComponent(keyword);
      const html = (await request('/e/search/11index.php', {
        method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body,
      })).body;
      return pageResult(parseItems(html), page);
    },
    async detail(input) {
      const id = text(input.id), valid = presetName === 'qwmp4'
        ? /^\/mv\/\d+\.html$/i.test(id) : presetName === 'meijumi'
          ? /^\/\d+\.html$/i.test(id) : presetName === 'gaoqing'
            ? /^\d+$/.test(id) : /^\/[A-Za-z0-9/_-]+\.html$/i.test(id);
      if (!valid) throw new Error('download-share.detail-invalid');
      const detailPath = presetName === 'gaoqing' ? '/' + id + '/detail' : id;
      const html = (await request(detailPath)).body, cached = itemCache[id], links = shareLinks(html);
      if (!links.length) throw new Error('download-share.supported-share-unavailable');
      const name = cached?.name || strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || id;
      const poster = cached?.poster || imageMatching(html, name) || imageMatching(html, '');
      const description = strip(html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]).slice(0, 2000);
      return {
        id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}),
        playGroups: groupsFor(links),
      };
    },
    async play(input) {
      const url = absolute(text(input.playId)), service = provider(url);
      if (!service) throw new Error('download-share.play-unsupported-provider');
      const code = accessCode(url);
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url,
        headers: {}, parse: false,
        drive: {kind: 'drive-share', url, ...(code ? {accessCode: code} : {})},
      };
    },
    async destroy() {
      sourceKey = ''; presetName = ''; preset = PRESETS.qwmp4; base = preset.base;
      sourceHeaders = {}; itemCache = Object.create(null);
    },
  });
})();
