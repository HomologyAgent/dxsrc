/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_EXTENSION = {kind: 'baiku'};
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

  let sourceKey = '';
  let extension = DEFAULT_EXTENSION;
  let miSouHost = '';
  let panSearchBuildId = '';
  let records = Object.create(null);

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const json = value => {
    try { return JSON.parse(value); } catch (_) { throw new Error('pan-search.response-invalid'); }
  };
  const fetchJson = async request => {
    const response = await dxplay.fetch(request);
    if (response.status < 200 || response.status >= 300) throw new Error('pan-search.request-failed');
    return json(response.body);
  };
  const fetchText = async request => {
    const response = await dxplay.fetch(request);
    if (response.status < 200 || response.status >= 300) throw new Error('pan-search.request-failed');
    return response.body;
  };
  const get = url => fetchJson({url, headers: {'User-Agent': USER_AGENT}});
  const stripTags = value => text(value).replace(/<[^>]*>/g, '').trim();
  const decodeText = value => stripTags(value).replace(/&amp;|&#38;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
  const remember = (url, name, remark, poster) => {
    if (!/^https?:\/\//i.test(text(url))) return null;
    const item = {
      id: text(url), sourceKey, name: text(name) || '网盘分享',
      ...(text(remark) ? {remark: text(remark)} : {}),
      ...( /^https?:\/\//i.test(text(poster)) ? {poster: text(poster)} : {}),
    };
    records[item.id] = item;
    return item;
  };
  const flattenMerged = merged => {
    const output = [];
    for (const provider of Object.keys(object(merged))) {
      if (provider === '115') continue;
      for (const value of list(merged[provider])) {
        const entry = object(value);
        const item = remember(entry.url, entry.note || entry.title, entry.datetime || entry.source || provider, '');
        if (item) output.push(item);
      }
    }
    return output;
  };
  const searchProvider = async (keyword, page) => {
    const encoded = encodeURIComponent(keyword);
    switch (text(extension.kind)) {
      case 'baiku': {
        const data = await get('https://api.kuleu.com/api/bddj?text=' + encoded);
        return list(data.data).map(value => remember(value.viewlink, value.name, value.addtime, '')).filter(Boolean);
      }
      case 'kule': {
        const data = await get('https://api.kuleu.com/api/action?text=' + encoded);
        return Number(data.code) === 200
          ? list(data.data).map(value => remember(value.viewlink, value.name, value.addtime, '')).filter(Boolean)
          : [];
      }
      case 'guigui': {
        const data = await get('https://api.guiguiya.com/api/video/duanju?act=search&name=' + encoded);
        return String(data.code) === '200'
          ? list(data.data).map(value => remember(value.url, value.name, value.episodes ? '共' + value.episodes + '集' : '', value.cover)).filter(Boolean)
          : [];
      }
      case 'qupan': {
        const data = await fetchJson({
          url: 'https://b.funletu.com/search', method: 'POST',
          headers: {'Content-Type': 'application/json', Origin: 'https://b.funletu.com', Referer: 'https://b.funletu.com/search'},
          body: JSON.stringify({keyword, categoryid: 0, filetypeid: 1, courseid: 1,
            page, pageSize: 15, sortBy: 'sort', order: 'desc', offset: (page - 1) * 15}),
        });
        return Number(data.code) === 200
          ? list(object(data.data).list).map(value => remember(value.url, stripTags(value.title), value.updatetime, '')).filter(Boolean)
          : [];
      }
      case 'dapanso': {
        const body = await fetchText({
          url: 'https://dapanso.com/search?keyword=' + encoded + '&searchMode=smart&panType=&type=1&page=' + page,
          headers: {'User-Agent': USER_AGENT},
        });
        const output = [];
        const blocks = body.split(/<div\s+class=["']item\s/i).slice(1, 61);
        for (const block of blocks) {
          const title = (block.match(/<a[^>]+href=["']\/s\/[^"']+["'][^>]+class=["']title["'][^>]*>([\s\S]*?)<\/a>/i) || [])[1];
          const share = (block.match(/<a[^>]+href=["'](https?:\/\/(?:pan\.quark\.cn|pan\.baidu\.com|www\.alipan\.com|aliyundrive\.com|pan\.xunlei\.com|drive\.uc\.cn|www\.123pan\.com|cloud\.189\.cn)[^"']+)["']/i) || [])[1];
          const owner = decodeText((block.match(/class=["']username["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
          const updated = decodeText((block.match(/class=["']time["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
          const item = remember(decodeText(share), decodeText(title), [owner, updated].filter(Boolean).join(' · '), '');
          if (item) output.push(item);
        }
        return output;
      }
      case 'pansearch': {
        const base = 'https://www.pansearch.me';
        if (!panSearchBuildId) {
          const home = await fetchText({
            url: base + '/',
            headers: {'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity', Connection: 'close'},
          });
          panSearchBuildId = (home.match(/\/_next\/static\/([^/"']+)\/_buildManifest\.js/i) || [])[1] || '';
        }
        if (!panSearchBuildId) throw new Error('pan-search.build-unavailable');
        const data = await fetchJson({
          url: base + '/_next/data/' + encodeURIComponent(panSearchBuildId) + '/search.json?keyword=' + encoded,
          headers: {'User-Agent': USER_AGENT, 'x-nextjs-data': '1', Referer: base + '/'},
        });
        return list(object(object(data.pageProps).data).data).map(value => {
          const entry = object(value);
          const content = text(entry.content);
          const url = (content.match(/href=["'](https?:\/\/[^"']+)["']/i) || [])[1];
          const name = decodeText((content.split(/\r?\n/, 1)[0] || '').replace(/^\s*名称[：:]\s*/, ''));
          return remember(decodeText(url), name, text(entry.pan) + (entry.time ? ' · ' + text(entry.time) : ''), entry.image);
        }).filter(Boolean);
      }
      case 'misou': {
        if (!miSouHost) return [];
        const data = await get(miSouHost + '/api/disks/search?keyword=' + encoded + '&last_weight=0&last_id=0');
        return list(data.data).map(value => remember(value.disk_url, value.disk_name, text(value.disk_type) + '网盘', '')).filter(Boolean);
      }
      case 'pansou': {
        const baseUrl = text(extension.url).replace(/\/+$/, '');
        if (!baseUrl) return [];
        const data = await get(baseUrl + '/api/search?kw=' + encoded + '&cloud_types=aliyun,quark,uc,baidu,tianyi,123,xunlei,mobile');
        return Number(data.code) === 0 ? flattenMerged(object(object(data.data).merged_by_type)) : [];
      }
      case 'juhe':
      default: {
        const data = await get('https://so.n13.club/api/search.php?kw=' + encoded + '&format=merged&page_size=50&page=' + page);
        return Number(data.code) === 0 ? flattenMerged(object(object(data.data).merged_by_type)) : [];
      }
    }
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.pan-search',
    name: 'Community drive search family',
    description: 'Rewrites the small search-only community spiders and hands their public share URLs to DXPlay Drive Router.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'pan-search';
      extension = Object.assign({}, DEFAULT_EXTENSION, object(input.extension));
      records = Object.create(null);
      miSouHost = '';
      panSearchBuildId = '';
      if (text(extension.kind) === 'misou') {
        for (const candidate of list(extension.site)) {
          const url = text(candidate).replace(/\/+$/, '');
          if (!/^https?:\/\//i.test(url)) continue;
          try {
            const response = await dxplay.fetch({url, method: 'HEAD', headers: {'User-Agent': USER_AGENT}});
            if (response.status >= 200 && response.status < 400) {
              miSouHost = url;
              break;
            }
          } catch (_) {}
        }
      }
      return {ready: true};
    },
    async home() {
      return {categories: [], featured: []};
    },
    async category(input) {
      return {page: Number(input.page) || 1, pageCount: 1, items: []};
    },
    async search(input) {
      const page = Number(input.page) || 1;
      const items = page > 1 && text(extension.kind) !== 'qupan' && text(extension.kind) !== 'juhe'
        && text(extension.kind) !== 'dapanso' && text(extension.kind) !== 'pansearch'
        ? [] : await searchProvider(text(input.keyword), page);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const url = text(input.id);
      if (!/^https?:\/\//i.test(url)) throw new Error('pan-search.item-not-found');
      const saved = records[url] || {name: '网盘分享'};
      const drive = {kind: 'drive-share', url};
      return {
        id: url, sourceKey, name: saved.name,
        ...(saved.poster ? {poster: saved.poster} : {}),
        ...(saved.remark ? {remark: saved.remark} : {}),
        playGroups: [{id: 'share', name: '网盘', episodes: [{id: 'share', name: saved.name, playId: url, drive}]}],
      };
    },
    async play(input) {
      const url = text(input.playId);
      if (!/^https?:\/\//i.test(url)) throw new Error('pan-search.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url,
        headers: {}, parse: false, drive: {kind: 'drive-share', url},
      };
    },
    async destroy() {
      sourceKey = '';
      extension = DEFAULT_EXTENSION;
      miSouHost = '';
      panSearchBuildId = '';
      records = Object.create(null);
    },
  });
})();
