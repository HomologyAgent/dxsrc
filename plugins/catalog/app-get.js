/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_USER_AGENT = 'okhttp/3.14.9';
  const DEFAULT_EXTENSION = {
    url: 'https://appcms.4ksj.app',
    dataKey: 'O3K6rYx75Q4xtiIE',
    dataIv: 'O3K6rYx75Q4xtiIE',
  };
  const filterNames = {class: '类型', area: '地区', lang: '语言', year: '年份', sort: '排序'};
  let sourceKey = '';
  let sourceHeaders = {};
  let baseUrl = '';
  let dataKey = '';
  let dataIv = '';
  let deviceId = '';
  let versionCode = '';
  let userAgent = DEFAULT_USER_AGENT;
  let userToken = '';
  let apiNamespace = 'getappapi.index';
  let initMethod = 'initV119';
  let searchMethod = 'searchList';
  let sliderVerification = false;
  let signedHeaders = false;

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const trimSlash = value => text(value).trim().replace(/\/+$/, '');
  const absoluteUrl = value => {
    const result = text(value).trim();
    if (/^https?:\/\//i.test(result)) return result;
    if (result.startsWith('//')) return 'https:' + result;
    if (!result || !baseUrl) return '';
    return baseUrl + (result.startsWith('/') ? result : '/' + result);
  };
  const baseHeaders = contentType => Object.assign({
    'User-Agent': userAgent || DEFAULT_USER_AGENT,
    ...(contentType ? {'Content-Type': contentType} : {}),
  }, sourceHeaders);
  const apiHeaders = contentType => {
    const time = String(Math.floor(Date.now() / 1000));
    return Object.assign(baseHeaders(contentType), {
      'app-user-device-id': deviceId,
      'app-version-code': versionCode,
      'app-api-verify-time': time,
      'app-ui-mode': 'light',
      ...(signedHeaders ? {Referer: baseUrl, 'app-api-verify-sign': encrypt(time)} : {}),
      ...(userToken ? {'app-user-token': userToken} : {}),
    });
  };
  const parseJson = (value, code) => {
    try { return JSON.parse(value); } catch (_error) { throw new Error(code); }
  };
  const decrypt = value => dxplay.crypto.aesDecrypt({
    mode: 'cbc', base64: text(value), key: dataKey, iv: dataIv,
  });
  const encrypt = value => dxplay.crypto.aesEncrypt({
    mode: 'cbc', text: text(value), key: dataKey, iv: dataIv,
  });
  const apiPath = method => '/' + apiNamespace + '/' + method;
  const requestEnvelope = async (path, bodyText) => {
    const response = await dxplay.fetch({
      url: baseUrl + '/api.php' + path,
      method: 'POST',
      headers: apiHeaders('application/json; charset=utf-8'),
      body: bodyText,
    });
    if (response.status < 200 || response.status >= 300) throw new Error('appget.request-failed');
    return parseJson(response.body, 'appget.response-invalid');
  };
  const decodeEnvelope = envelope => {
    if (typeof envelope.data !== 'string') throw new Error('appget.response-invalid');
    return parseJson(decrypt(envelope.data), 'appget.payload-invalid');
  };
  const requestApi = async (path, body) => decodeEnvelope(await requestEnvelope(
    path, JSON.stringify(body || {}),
  ));
  const requestText = async url => {
    const response = await dxplay.fetch({url, headers: baseHeaders()});
    if (response.status < 200 || response.status >= 300) throw new Error('appget.parser-failed');
    return response.body;
  };
  const item = value => ({
    id: text(value.vod_id),
    sourceKey,
    name: text(value.vod_name || value.vod_id),
    ...(absoluteUrl(value.vod_pic) ? {poster: absoluteUrl(value.vod_pic)} : {}),
    ...(value.vod_remarks ? {remark: text(value.vod_remarks)} : {}),
  });
  const filters = value => list(value).map(entry => {
    const rawKey = text(entry && entry.name);
    const key = rawKey === 'sort' ? 'by' : rawKey;
    const options = list(entry && entry.list).map(option => ({name: text(option), value: text(option)}));
    return {
      key,
      name: filterNames[rawKey] || rawKey,
      ...(options[0] ? {initialValue: options[0].value} : {}),
      options,
    };
  }).filter(value => value.key && value.options.length > 0);
  const typeFilters = value => {
    const declared = filters(value.filter_type_list);
    if (declared.length > 0) return declared;
    let extension = {};
    try { extension = object(JSON.parse(text(value.type_extend) || '{}')); } catch (_error) {}
    if (!text(extension.sort)) extension.sort = '最新,最热,最赞';
    return Object.keys(extension).map(rawKey => {
      if (!Object.prototype.hasOwnProperty.call(filterNames, rawKey)) return null;
      const key = rawKey === 'sort' ? 'by' : rawKey;
      const options = text(extension[rawKey]).split(',').map(option => option.trim()).filter(Boolean)
        .map(option => ({name: option, value: option}));
      return options.length > 0 ? {key, name: filterNames[rawKey], initialValue: options[0].value, options} : null;
    }).filter(Boolean);
  };
  const uniqueItems = values => {
    const seen = Object.create(null), output = [];
    for (const value of values) {
      const id = text(value && value.vod_id);
      if (!id || seen[id]) continue;
      seen[id] = true;
      output.push(item(value));
    }
    return output;
  };
  const resolveSiteDocument = async siteUrl => {
    const response = await dxplay.fetch({url: siteUrl, headers: baseHeaders()});
    if (response.status < 200 || response.status >= 300) throw new Error('appget.site-document-failed');
    const candidates = response.body.split(/\r?\n/).map(trimSlash).filter(value => /^https?:\/\//i.test(value));
    if (candidates.length === 0) throw new Error('appget.site-document-invalid');
    for (let index = 0; index < Math.min(candidates.length, 4); index += 1) {
      try {
        const probe = await dxplay.fetch({url: candidates[index], method: 'HEAD', headers: baseHeaders()});
        if (probe.status >= 200 && probe.status < 400) return candidates[index];
      } catch (_error) {}
    }
    return candidates[0];
  };
  const performSliderVerification = async () => {
    const challenge = decodeEnvelope(await requestEnvelope(apiPath('getSlider'), ''));
    if (!challenge.slider_id || challenge.target_x === undefined) return false;
    const verified = await requestEnvelope(apiPath('verifySlider'), JSON.stringify({
      pos_x: Number(challenge.target_x),
      slider_id: text(challenge.slider_id),
      timestamp: Math.floor(Date.now() / 1000),
    }));
    return Number(verified.code) === 1;
  };
  const decodeExternalParser = async url => {
    const body = await requestText(url);
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.url === 'string' && parsed.url) return parsed.url;
    } catch (_error) {}
    const match = body.match(/"url"\s*:\s*"([^"]+)"/);
    return match ? match[1].replace(/\\\//g, '/') : '';
  };
  const parseThroughServer = async descriptor => {
    const time = String(Math.floor(Date.now() / 1000));
    const rawBody = descriptor.kind === 'server'
      ? 'parse_api=' + text(descriptor.parse)
        + '&url=' + encodeURIComponent(encrypt(descriptor.raw))
        + '&token=' + text(descriptor.token)
      : text(descriptor.url);
    const response = await dxplay.fetch({
      url: baseUrl + '/api.php' + apiPath('vodParse'),
      method: 'POST',
      headers: Object.assign(baseHeaders('application/x-www-form-urlencoded'), {
        'app-version-code': versionCode,
        'app-ui-mode': 'light',
        'app-user-device-id': deviceId,
        'app-api-verify-time': time,
        'app-api-verify-sign': encrypt(time),
        ...(userToken ? {'app-user-token': userToken} : {}),
      }),
      body: rawBody,
    });
    if (response.status < 200 || response.status >= 300) throw new Error('appget.parse-failed');
    const envelope = parseJson(response.body, 'appget.parse-response-invalid');
    const payload = parseJson(decrypt(envelope.data), 'appget.parse-payload-invalid');
    const nested = typeof payload.json === 'string'
      ? parseJson(payload.json, 'appget.parse-result-invalid') : object(payload.json);
    if (!nested.url) throw new Error('appget.play-unavailable');
    return text(nested.url);
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.appget',
    name: 'AppGet/AppQi catalog family',
    description: 'Semantic rewrite of the parameterized AppGet and AppQi catalog families in the pinned jsm.json snapshot.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = object(input.headers);
      const configured = object(input.extension);
      const extension = Object.keys(configured).length > 0 ? configured : DEFAULT_EXTENSION;
      dataKey = text(extension.dataKey);
      dataIv = text(extension.dataIv);
      deviceId = text(extension.deviceId);
      versionCode = text(extension.version);
      userAgent = text(extension.ua) || DEFAULT_USER_AGENT;
      userToken = text(extension.token);
      sliderVerification = Boolean(extension.init || extension.search);
      apiNamespace = sliderVerification ? 'qijiappapi.index' : 'getappapi.index';
      initMethod = text(extension.init) || (sliderVerification ? 'initV120' : 'initV119');
      searchMethod = text(extension.search) || 'searchList';
      signedHeaders = Boolean(extension.signedHeaders);
      baseUrl = trimSlash(extension.url);
      if (!baseUrl && /^https?:\/\//i.test(text(extension.site))) {
        baseUrl = await resolveSiteDocument(text(extension.site));
      }
      if (!sourceKey || !/^https?:\/\//i.test(baseUrl) || !dataKey || !dataIv) {
        throw new Error('appget.configuration-invalid');
      }
      return {ready: true};
    },
    async home() {
      const data = await requestApi(apiPath(initMethod), {});
      const typeList = list(data.type_list);
      const categories = typeList.filter(value => {
        const name = text(value.type_name);
        return name && name !== '全部' && !name.includes('正版QQ群') && !['伦理', '福利', '小影院'].includes(name);
      }).map(value => ({
        id: text(value.type_id),
        name: text(value.type_name),
        ...(typeFilters(value).length > 0 ? {filters: typeFilters(value)} : {}),
      }));
      const featured = uniqueItems([
        ...list(data.recommend_list),
        ...list(data.banner_list).slice(8),
        ...typeList.flatMap(value => list(value && value.recommend_list)),
      ]);
      return {categories, featured};
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const body = {type_id: text(input.categoryId), page};
      const selected = object(input.filters);
      for (const key of ['class', 'lang', 'area', 'year']) {
        if (text(selected[key])) body[key] = text(selected[key]);
      }
      if (text(selected.by)) body.sort = text(selected.by);
      const data = await requestApi(apiPath('typeFilterVodList') + '?page=' + page, body);
      const values = list(data.recommend_list);
      return {page, pageCount: values.length === 0 ? page : page + 1, items: values.map(item)};
    },
    async search(input) {
      const page = Number(input.page) || 1;
      const body = {type_id: 0, keywords: text(input.keyword), page};
      let data;
      if (sliderVerification) {
        let envelope = await requestEnvelope(apiPath(searchMethod), JSON.stringify(body));
        if (Number(envelope.code) === 1001 && await performSliderVerification()) {
          envelope = await requestEnvelope(apiPath(searchMethod), JSON.stringify(body));
        }
        data = decodeEnvelope(envelope);
      } else {
        data = await requestApi(apiPath(searchMethod), body);
      }
      const values = list(data.search_list);
      return {page, pageCount: values.length === 0 ? page : page + 1, items: values.map(item)};
    },
    async detail(input) {
      const data = await requestApi(apiPath('vodDetail'), {vod_id: text(input.id)});
      const vod = object(data.vod);
      if (!vod.vod_id && !vod.vod_name) throw new Error('appget.item-not-found');
      const playGroups = list(data.vod_play_list).map((line, lineIndex) => {
        const player = object(line.player_info);
        const episodes = list(line.urls).map((episode, episodeIndex) => {
          const parseApiUrl = text(episode.parse_api_url);
          const descriptor = /^https?:\/\//i.test(parseApiUrl)
            ? {kind: 'external', url: parseApiUrl}
            : {kind: 'server', parse: text(player.parse), raw: text(episode.url), token: text(episode.token)};
          return {
            id: text(episode.nid || episodeIndex + 1),
            name: text(episode.name || episode.nid || episodeIndex + 1),
            playId: JSON.stringify(descriptor),
          };
        });
        return {
          id: text(lineIndex + 1),
          name: text(player.show || lineIndex + 1),
          episodes,
        };
      }).filter(value => value.episodes.length > 0);
      return {
        ...item(vod),
        ...(vod.vod_year ? {year: text(vod.vod_year)} : {}),
        ...(vod.vod_area ? {area: text(vod.vod_area)} : {}),
        ...(vod.vod_class ? {category: text(vod.vod_class)} : {}),
        ...(vod.vod_actor ? {actors: text(vod.vod_actor)} : {}),
        ...(vod.vod_director ? {director: text(vod.vod_director)} : {}),
        description: text(vod.vod_content || vod.vod_blurb),
        playGroups,
      };
    },
    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); } catch (_error) { throw new Error('appget.play-id-invalid'); }
      let mediaUrl = '';
      if (descriptor.kind === 'external') {
        const candidate = text(descriptor.url);
        if (/^https?:\/\//i.test(candidate) && /[?&](url|key)=/i.test(candidate)) {
          mediaUrl = await decodeExternalParser(candidate);
        } else if (/\.(m3u8|mp4|mkv)(?:$|[?#])/i.test(candidate)) {
          mediaUrl = candidate;
        } else {
          mediaUrl = await parseThroughServer(descriptor);
        }
      } else if (descriptor.kind === 'server') {
        mediaUrl = await parseThroughServer(descriptor);
      }
      if (!/^https?:\/\//i.test(mediaUrl)) throw new Error('appget.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: mediaUrl,
        headers: baseHeaders(),
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      baseUrl = '';
      dataKey = '';
      dataIv = '';
      deviceId = '';
      versionCode = '';
      userAgent = DEFAULT_USER_AGENT;
      userToken = '';
      apiNamespace = 'getappapi.index';
      initMethod = 'initV119';
      searchMethod = 'searchList';
      sliderVerification = false;
      signedHeaders = false;
    },
  });
})();
