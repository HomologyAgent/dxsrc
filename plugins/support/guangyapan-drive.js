/* global dxplay */
(() => {
  'use strict';

  const PROVIDER_ID = 'org.dxsrc.drive.guangyapan';
  const API = 'https://api.guangyapan.com';
  const ACCOUNT = 'https://account.guangyapan.com';
  const CLIENT_ID = 'aMe-8VSlkrbQXpUR';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
  let deviceId = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : value % 4 + 8).toString(16);
  });
  const randomHex = length => {
    let output = '';
    while (output.length < length) output += Math.floor(Math.random() * 16).toString(16);
    return output;
  };
  const traceparent = () => '00-' + randomHex(32) + '-' + randomHex(16) + '-01';
  const credentialValue = value => value && typeof value === 'object' && text(value.accessToken) ? value : null;
  const oauthHeaders = did => ({
    'Content-Type': 'application/json',
    'Accept-Language': 'zh-CN',
    'x-client-id': CLIENT_ID,
    'x-sdk-version': '9.1.2',
    'x-protocol-version': '301',
    'x-client-version': '0.0.1',
    'x-device-id': did,
    'x-device-name': 'DXPlay',
    'x-device-model': 'TV',
    'x-net-work-type': 'NONE',
    'x-os-version': 'Android',
    'x-platform-version': 'Android',
    'x-provider-name': 'NONE',
    'User-Agent': USER_AGENT,
  });
  const apiHeaders = (did, token) => ({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'User-Agent': USER_AGENT,
    Origin: 'https://www.guangyapan.com',
    Referer: 'https://www.guangyapan.com/',
    dt: '4',
    did,
    traceparent: traceparent(),
    ...(token ? {Authorization: 'Bearer ' + token} : {}),
  });
  const jsonRequest = async (url, body, headers) => {
    const response = await dxplay.fetch({url, method: 'POST', headers, body: JSON.stringify(body || {})});
    let value;
    try {
      value = JSON.parse(response.body || '{}');
      if (!value || typeof value !== 'object') throw new Error();
    } catch (_) {
      throw new Error('cloud.response-invalid');
    }
    return {status: response.status, value};
  };
  const accountToken = value => {
    const data = value && value.data && typeof value.data === 'object' ? value.data : value;
    const accessToken = text(data.accessToken || data.access_token);
    const refreshToken = text(data.refreshToken || data.refresh_token);
    const expiresIn = Number(data.expiresIn || data.expires_in || 7200);
    if (!accessToken) throw new Error('cloud.login-invalid');
    return {
      accessToken,
      refreshToken,
      tokenType: text(data.tokenType || data.token_type) || 'Bearer',
      sub: text(data.sub),
      expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
      deviceId: deviceId || uuid(),
    };
  };
  const refreshCredential = async input => {
    const credential = credentialValue(input);
    if (!credential) throw new Error('cloud.login-invalid');
    if (Number(credential.expiresAt) > Date.now() + 60000 || !text(credential.refreshToken)) {
      return {credential, changed: false};
    }
    const did = text(credential.deviceId) || deviceId || uuid();
    const response = await jsonRequest(ACCOUNT + '/v1/auth/token', {
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: credential.refreshToken,
    }, oauthHeaders(did));
    if (response.status < 200 || response.status >= 300 || response.value.error) throw new Error('cloud.login-invalid');
    deviceId = did;
    return {credential: accountToken(response.value), changed: true};
  };
  const apiRequest = async (path, body, credential, allowAnonymous) => {
    let current = credentialValue(credential);
    let changed = false;
    if (current) {
      const refreshed = await refreshCredential(current);
      current = refreshed.credential;
      changed = refreshed.changed;
    } else if (!allowAnonymous) {
      throw new Error('cloud.account-required');
    }
    const did = text(current && current.deviceId) || deviceId || uuid();
    deviceId = did;
    const response = await jsonRequest(API + path, body, apiHeaders(did, current && current.accessToken));
    return {response, credential: current, changed};
  };
  const successful = response => response.status >= 200 && response.status < 300
    && text(response.value.msg).toLowerCase() === 'success'
    && response.value.data && typeof response.value.data === 'object';
  const anonymousToken = async share => {
    if (text(share.anonymousToken) && Number(share.anonymousExpiresAt) > Date.now() + 60000 && text(share.deviceId)) {
      return share;
    }
    const did = text(share.deviceId) || deviceId || uuid();
    deviceId = did;
    const response = await jsonRequest(API + '/misc/v1/anonymous_signup', {deviceId: did}, apiHeaders(did, ''));
    if (!successful(response)) throw new Error('cloud.request-failed');
    const token = accountToken(response.value);
    return Object.assign({}, share, {
      deviceId: did,
      anonymousToken: token.accessToken,
      anonymousExpiresAt: token.expiresAt,
    });
  };
  const requireShare = value => {
    if (!value || typeof value !== 'object' || !text(value.shareId)) throw new Error('cloud.response-invalid');
    return value;
  };
  const shareFromTarget = target => {
    const match = /^https?:\/\/(?:www\.)?guangyapan\.com\/s\/([^/?#]+)(?:\?[^#]*)?/i.exec(text(target && target.url));
    if (!match) return null;
    let code = text(target && target.accessCode);
    if (!code) {
      const codeMatch = /[?&](?:code|pwd|password)=([^&#]+)/i.exec(text(target.url));
      if (codeMatch) code = decodeURIComponent(codeMatch[1]);
    }
    return {shareId: decodeURIComponent(match[1]), code};
  };
  const shareSession = async (inputShare, credential) => {
    let share = requireShare(inputShare);
    let bearer = credentialValue(credential);
    let changed = false;
    if (bearer) {
      const refreshed = await refreshCredential(bearer);
      bearer = refreshed.credential;
      changed = refreshed.changed;
    } else {
      share = await anonymousToken(share);
    }
    if (text(share.accessToken) && Number(share.accessExpiresAt) > Date.now() + 60000) {
      return {share, credential: bearer, changed};
    }
    const did = text(bearer && bearer.deviceId) || text(share.deviceId) || deviceId || uuid();
    const token = text(bearer && bearer.accessToken) || text(share.anonymousToken);
    const response = await jsonRequest(API + '/userres/v1/get_share_access_token', {
      shareId: share.shareId,
      code: text(share.code),
    }, apiHeaders(did, token));
    if (!successful(response) || !text(response.value.data.accessToken)) throw new Error('cloud.request-failed');
    return {
      share: Object.assign({}, share, {
        deviceId: did,
        accessToken: text(response.value.data.accessToken),
        accessExpiresAt: Date.now() + 2 * 60 * 60 * 1000,
      }),
      credential: bearer,
      changed,
    };
  };
  const encodeId = (kind, value) => kind + ':' + encodeURIComponent(text(value));
  const decodeId = (value, kind) => {
    const prefix = kind + ':';
    if (typeof value !== 'string' || !value.startsWith(prefix)) throw new Error('cloud.response-invalid');
    const result = decodeURIComponent(value.slice(prefix.length));
    if (!result) throw new Error('cloud.response-invalid');
    return result;
  };
  const fileKind = name => {
    if (/\.(mp4|m4v|mov|mkv|webm|avi|wmv|flv|ts|m2ts|mpg|mpeg|3gp)$/i.test(name)) return 'video';
    if (/\.(mp3|m4a|aac|flac|ogg|wav)$/i.test(name)) return 'audio';
    if (/\.(srt|ass|ssa|vtt|sub)$/i.test(name)) return 'subtitle';
    if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(name)) return 'image';
    return 'other';
  };
  const mapEntry = value => {
    const id = text(value.fileId), name = text(value.fileName || value.name);
    if (!id || !name) throw new Error('cloud.response-invalid');
    const directory = Number(value.resType) === 2 || value.isDir === true;
    const thumbnail = text(value.thumbnail);
    const size = Number(value.fileSize);
    const modified = Number(value.utime || value.mtime);
    return {
      id: encodeId(directory ? 'folder' : 'file', id),
      name,
      kind: directory ? 'folder' : fileKind(name),
      ...(Number.isFinite(size) && size >= 0 ? {size} : {}),
      ...(Number.isFinite(modified) && modified > 0 ? {modifiedAt: modified * 1000} : {}),
      ...(thumbnail && /^https?:\/\//i.test(thumbnail) ? {thumbnailUrl: thumbnail} : {}),
    };
  };
  const withCredential = (value, credential, changed) => changed ? Object.assign(value, {credential}) : value;
  const media = url => {
    if (!/^https?:\/\//i.test(text(url))) throw new Error('cloud.entry-not-playable');
    return {
      url: text(url),
      headers: {'User-Agent': USER_AGENT, Referer: 'https://www.guangyapan.com/'},
      format: /\.m3u8(?:$|[?#])/i.test(url) ? 'hls' : 'progressive',
      subtitles: [],
      expiresAt: Date.now() + 60 * 60 * 1000,
      resolvedBy: PROVIDER_ID,
    };
  };
  const downloadUrl = value => text(value && (value.signedURL || value.signedUrl || value.downloadUrl || value.url));

  dxplay.register({
    id: PROVIDER_ID,
    name: 'GuangYa Cloud Drive',
    description: 'Signs in with GuangYa device OAuth, browses personal files, and routes guangyapan.com community shares.',
    version: '1.0.0',
    protocol: 'drive@1',

    async init() {
      if (!deviceId) deviceId = uuid();
      return {ready: true};
    },
    async login() {
      const did = deviceId || uuid();
      deviceId = did;
      const response = await jsonRequest(ACCOUNT + '/v1/auth/device/code', {
        scope: 'user',
        client_id: CLIENT_ID,
      }, oauthHeaders(did));
      const value = response.value;
      const deviceCode = text(value.device_code), verification = text(value.verification_uri_complete || value.verification_url);
      if (response.status < 200 || response.status >= 300 || !deviceCode || !/^https?:\/\//i.test(verification)) {
        throw new Error('cloud.request-failed');
      }
      const qr = 'https://account.guangyapan.com/xluser.core.login/v3/qrlogin?redirect_uri=' + encodeURIComponent(verification);
      return {
        verificationUrl: text(value.verification_url || verification),
        qrCodeValue: qr,
        ...(text(value.user_code) ? {userCode: text(value.user_code)} : {}),
        expiresInMs: Math.max(60, Number(value.expires_in) || 120) * 1000,
        intervalMs: Math.max(1, Number(value.interval) || 2) * 1000,
        state: {deviceCode, deviceId: did},
      };
    },
    async poll(input) {
      const state = input && input.state;
      const did = text(state && state.deviceId), code = text(state && state.deviceCode);
      if (!did || !code) throw new Error('cloud.login-invalid');
      deviceId = did;
      const response = await jsonRequest(ACCOUNT + '/v1/auth/token', {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: code,
        client_id: CLIENT_ID,
      }, oauthHeaders(did));
      const error = text(response.value.error);
      if (error === 'authorization_pending' || error === 'slow_down') return {status: 'pending'};
      if (error === 'expired_token') return {status: 'expired'};
      if (error === 'access_denied') return {status: 'denied'};
      if (response.status < 200 || response.status >= 300 || error) return {status: 'denied'};
      const credential = accountToken(response.value);
      const profile = await dxplay.fetch({url: ACCOUNT + '/v1/user/me', headers: Object.assign(oauthHeaders(did), {Authorization: 'Bearer ' + credential.accessToken})});
      let user = {};
      try { user = JSON.parse(profile.body || '{}'); } catch (_) {}
      const accountKey = text(user.sub || credential.sub).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 160);
      if (!accountKey) throw new Error('cloud.login-invalid');
      return {
        status: 'authorized',
        accountKey,
        displayName: text(user.name || user.nickname || 'GuangYa Cloud Drive'),
        credential,
      };
    },
    async list(input) {
      const page = input && input.pageToken ? Number(input.pageToken) : 0;
      if (!Number.isSafeInteger(page) || page < 0) throw new Error('cloud.response-invalid');
      const parentId = input && input.parentId ? decodeId(input.parentId, 'folder') : '';
      const result = await apiRequest('/userres/v1/file/get_file_list', {
        parentId,
        page,
        pageSize: 100,
        orderBy: 3,
        sortType: 1,
      }, input && input.credential, false);
      if (!successful(result.response) || !Array.isArray(result.response.value.data.list)) throw new Error('cloud.request-failed');
      const data = result.response.value.data;
      return withCredential({
        entries: data.list.slice(0, 100).map(mapEntry),
        ...(data.hasMore === true || Number(data.total) > (page + 1) * 100 ? {nextPageToken: String(page + 1)} : {}),
      }, result.credential, result.changed);
    },
    async resolve(input) {
      const entry = input && input.entry;
      if (!entry || (entry.kind !== 'video' && entry.kind !== 'audio')) throw new Error('cloud.entry-not-playable');
      const fileId = decodeId(entry.id, 'file');
      const current = await refreshCredential(input && input.credential);
      const detail = await apiRequest('/userres/v1/file/get_file_detail', {fileId}, current.credential, false);
      if (!successful(detail.response)) throw new Error('cloud.request-failed');
      const data = detail.response.value.data;
      const candidates = list(data.videoResource).concat(list(data.videoResources));
      const gcid = text(candidates[0] && candidates[0].gcid || data.gcid || data.fileInfo && data.fileInfo.gcid);
      if (!gcid) throw new Error('cloud.entry-not-playable');
      const download = await apiRequest('/userres/v1/file/get_vod_download_url', {fileId, gcid}, detail.credential, false);
      if (!successful(download.response)) throw new Error('cloud.request-failed');
      return withCredential({media: media(downloadUrl(download.response.value.data))}, download.credential,
        current.changed || detail.changed || download.changed);
    },
    async matchShare(input) {
      const share = shareFromTarget(input);
      return share ? {matched: true, confidence: 100, share} : {matched: false};
    },
    async listShare(input) {
      const session = await shareSession(input && input.share, input && input.credential);
      const page = input && input.pageToken ? Number(input.pageToken) : 1;
      if (!Number.isSafeInteger(page) || page < 1) throw new Error('cloud.response-invalid');
      const parentId = input && input.parentId ? decodeId(input.parentId, 'folder') : '';
      const did = text(session.credential && session.credential.deviceId) || text(session.share.deviceId) || deviceId;
      const token = text(session.credential && session.credential.accessToken) || text(session.share.anonymousToken);
      const response = await jsonRequest(API + '/userres/v1/get_share_page_files_list', {
        shareId: session.share.shareId,
        accessToken: session.share.accessToken,
        parentId,
        page,
        pageSize: 200,
      }, apiHeaders(did, token));
      if (!successful(response) || !Array.isArray(response.value.data.list)) throw new Error('cloud.request-failed');
      const data = response.value.data;
      return withCredential({
        entries: data.list.slice(0, 200).map(mapEntry),
        share: session.share,
        ...(data.hasMore === true || Number(data.total) > page * 200 ? {nextPageToken: String(page + 1)} : {}),
      }, session.credential, session.changed);
    },
    async resolveShare(input) {
      const entry = input && input.entry;
      if (!entry || (entry.kind !== 'video' && entry.kind !== 'audio')) throw new Error('cloud.entry-not-playable');
      const session = await shareSession(input && input.share, input && input.credential);
      const did = text(session.credential && session.credential.deviceId) || text(session.share.deviceId) || deviceId;
      const token = text(session.credential && session.credential.accessToken) || text(session.share.anonymousToken);
      const response = await jsonRequest(API + '/userres/v1/get_share_download_url', {
        fileId: decodeId(entry.id, 'file'),
        accessToken: session.share.accessToken,
      }, apiHeaders(did, token));
      if (Number(response.value.code) === 207 && !session.credential) throw new Error('cloud.account-required');
      if (!successful(response)) throw new Error('cloud.entry-not-playable');
      return withCredential({media: media(downloadUrl(response.value.data))}, session.credential, session.changed);
    },
    async destroy() { deviceId = ''; },
  });
})();
