/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_LIST_URL = 'https://raw.githubusercontent.com/cluntop/tvbox/ddffe6fdee088edd22185c05b8594210fcbcdca3/lib/alishare.txt';
  const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36';
  const PAGE_SIZE = 60;
  const PROVIDERS = {
    ali: {base: 'https://www.alipan.com/s/', name: '阿里云盘'},
    quark: {base: 'https://pan.quark.cn/s/', name: '夸克网盘'},
    '115': {base: 'https://115.com/s/', name: '115网盘'},
  };

  let sourceKey = '';
  let listUrl = DEFAULT_LIST_URL;
  let providerKey = 'ali';
  let sourceName = '公开分享';
  let sourceHeaders = {};
  let entriesPromise;
  let entriesById = Object.create(null);

  const text = value => value === undefined || value === null ? '' : String(value);
  const queryCode = url => {
    const matched = /[?&](?:pwd|password|passcode|code)=([^&#]+)/i.exec(url);
    if (!matched) return '';
    try { return decodeURIComponent(matched[1]); } catch (_) { return matched[1]; }
  };
  const supportedProvider = url => {
    if (/^https?:\/\/(?:www\.)?(?:alipan|aliyundrive)\.com\/s\//i.test(url)) return 'ali';
    if (/^https?:\/\/(?:pan|drive)\.quark\.cn\/s\//i.test(url)) return 'quark';
    if (/^https?:\/\/(?:www\.)?(?:115|115cdn)\.com\/s\//i.test(url)) return '115';
    if (/^https?:\/\/(?:pan\.)?baidu\.com\/(?:s\/|share\/init)/i.test(url)) return 'baidu';
    return '';
  };
  const normalizeUrl = (reference, configuredProvider) => {
    let url = text(reference).trim().replace(/#.*$/, '');
    if (!url || /^self(?:[?#/]|$)/i.test(url)) return '';
    if (!/^https?:\/\//i.test(url)) {
      const provider = PROVIDERS[configuredProvider];
      if (!provider) return '';
      url = provider.base + url.replace(/^\/+/, '');
    }
    url = url.replace(/^https?:\/\/(?:www\.)?anxia\.com\/s\//i, 'https://115.com/s/');
    if (/\/s\/self(?:[/?#]|$)/i.test(url)) return '';
    const detected = supportedProvider(url);
    if (!detected || (configuredProvider !== 'mixed' && detected !== configuredProvider)) return '';
    return url;
  };
  const itemId = url => 'share:' + encodeURIComponent(url);
  const parseLine = line => {
    const trimmed = text(line).replace(/^\uFEFF/, '').trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return undefined;
    const parts = trimmed.split(/[\s\t]+/);
    if (parts.length < 2) return undefined;
    const url = normalizeUrl(parts[0], providerKey);
    if (!url) return undefined;
    const path = parts[1].split('|').map(value => value.trim()).filter(Boolean);
    const name = path[path.length - 1] || PROVIDERS[supportedProvider(url)]?.name || sourceName;
    const category = path.length > 1 ? path[0] : 'other';
    const id = itemId(url);
    return {
      id,
      sourceKey,
      name,
      remark: path.length > 1 ? path.slice(0, -1).join(' / ') : sourceName,
      url,
      accessCode: queryCode(url),
      category,
      searchText: path.join(' ').toLowerCase(),
    };
  };
  const loadEntries = async () => {
    if (!entriesPromise) {
      entriesPromise = (async () => {
        const response = await dxplay.fetch({
          url: listUrl,
          method: 'GET',
          headers: Object.assign({'User-Agent': DEFAULT_USER_AGENT}, sourceHeaders),
        });
        if (response.status < 200 || response.status >= 300) throw new Error('share-list.request-failed');
        const seen = Object.create(null);
        const parsed = [];
        for (const line of text(response.body).split(/\r?\n/)) {
          const item = parseLine(line);
          if (!item || seen[item.url]) continue;
          seen[item.url] = true;
          entriesById[item.id] = item;
          parsed.push(item);
        }
        if (!parsed.length) throw new Error('share-list.empty');
        return parsed;
      })();
    }
    return entriesPromise;
  };
  const publicItem = item => ({
    id: item.id,
    sourceKey: item.sourceKey,
    name: item.name,
    remark: item.remark,
  });
  const page = (items, pageNumber) => {
    const start = (pageNumber - 1) * PAGE_SIZE;
    return {
      page: pageNumber,
      pageCount: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
      items: items.slice(start, start + PAGE_SIZE).map(publicItem),
    };
  };
  const findItem = async id => entriesById[text(id)] || (await loadEntries()).find(item => item.id === id);
  const driveEpisode = item => ({
    id: 'open',
    name: item.name,
    playId: item.url,
    drive: {
      kind: 'drive-share',
      url: item.url,
      ...(item.accessCode ? {accessCode: item.accessCode} : {}),
    },
  });

  dxplay.register({
    id: 'org.dxsrc.cluntop.public-share-list',
    name: 'Public cloud-drive share list',
    description: 'Loads a public text index and delegates supported share browsing and playback to DXPlay drive plugins.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : {};
      providerKey = text(extension.provider).trim().toLowerCase() || 'ali';
      if (providerKey !== 'mixed' && !PROVIDERS[providerKey]) throw new Error('share-list.provider-invalid');
      listUrl = text(extension.listUrl).trim() || DEFAULT_LIST_URL;
      if (!/^https?:\/\//i.test(listUrl)) throw new Error('share-list.url-invalid');
      sourceKey = text(input.sourceKey).trim() || 'public-share-list';
      sourceName = text(extension.name).trim() || (PROVIDERS[providerKey]?.name || '公开分享');
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      entriesPromise = undefined;
      entriesById = Object.create(null);
      return {ready: true};
    },

    async home() {
      const entries = await loadEntries();
      const categoryNames = Object.create(null);
      for (const item of entries) if (item.category !== 'other') categoryNames[item.category] = true;
      return {
        categories: [
          {id: 'all', name: '全部'},
          ...Object.keys(categoryNames).slice(0, 40).map(name => ({id: 'group:' + encodeURIComponent(name), name})),
        ],
        featured: entries.slice(0, PAGE_SIZE).map(publicItem),
      };
    },

    async category(input) {
      const pageNumber = Math.max(1, Number(input.page) || 1);
      const categoryId = text(input.categoryId);
      const entries = await loadEntries();
      if (categoryId === 'all') return page(entries, pageNumber);
      if (!categoryId.startsWith('group:')) throw new Error('share-list.category-invalid');
      let name;
      try { name = decodeURIComponent(categoryId.slice(6)); } catch (_) { throw new Error('share-list.category-invalid'); }
      return page(entries.filter(item => item.category === name), pageNumber);
    },

    async search(input) {
      const pageNumber = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim().toLowerCase();
      if (!keyword) return {page: pageNumber, pageCount: 1, items: []};
      return page((await loadEntries()).filter(item => item.searchText.includes(keyword)), pageNumber);
    },

    async detail(input) {
      const item = await findItem(input.id);
      if (!item) throw new Error('share-list.item-not-found');
      return {
        id: item.id,
        sourceKey,
        name: item.name,
        description: item.remark,
        playGroups: [{id: 'drive', name: PROVIDERS[supportedProvider(item.url)]?.name || '网盘', episodes: [driveEpisode(item)]}],
      };
    },

    async play(input) {
      const item = await findItem(itemId(text(input.playId)));
      if (!item) throw new Error('share-list.play-invalid');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl: item.url,
        headers: {},
        parse: false,
        drive: driveEpisode(item).drive,
      };
    },

    async destroy() {
      sourceKey = '';
      listUrl = DEFAULT_LIST_URL;
      providerKey = 'ali';
      sourceName = '公开分享';
      sourceHeaders = {};
      entriesPromise = undefined;
      entriesById = Object.create(null);
    },
  });
})();
