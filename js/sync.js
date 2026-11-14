/* ==========================================================================
   多设备同步引擎（本地优先）
   --------------------------------------------------------------------------
   设计要点：
   · 所有编辑照旧先写 localStorage（不改任何既有页面的保存逻辑），
     只在 PP.store.write 外面包一层，写完防抖 1.5s 推送。
   · 传输层抽成 provider：PP.syncProviders[name] 实现 login / pull / push / logout，
     新增后端只要往 PP.syncProviders 里注册即可（见 README「如何新增一个存储后端」）。
   · 对外的 PP.sync 接口固定：login / logout / pull / push / syncNow / status / isAuthed
     + useProvider / provider。
   · 冲突（409）绝不自动覆盖，一律弹窗让用户选。
   · 网络错误降级为「离线」，不阻塞本地使用；401 清 token 并回密码页。
   · file:// 下完全不联网，显示「本地模式」，双击 index.html 依然可用。
   同步范围：PP.KEYS 里的结构化键；附件（IndexedDB 图片 / PDF / Word）不同步。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;

  /* ---------------------------------------------------------------- 常量 */

  var SYNC_KEYS = [
    'meta', 'settings', 'days', 'habits', 'habitLogs', 'important',
    'books', 'todos', 'tasks', 'writings', 'monthSummaries'
  ];
  var CONFIG_KEY = 'sync';              // shiguang.sync：后端 / 地址 / 版本 / 上次同步
  var TOKEN_KEY = 'ppsync.token';       // 独立命名空间：不参与同步，也不会被“清空数据”误删
  var PUSH_DELAY = 1500;                // 写入后防抖 1.5s
  var PULL_INTERVAL = 45000;            // 页面可见时的兜底轮询
  var REQUEST_TIMEOUT = 12000;
  var MAX_PUSH_ATTEMPTS = 3;
  var PROBE_TIMEOUT = 3000;             // 后端探测超时（≤3s）
  var PROBE_CACHE_KEY = 'ppsync.backend';
  var PROBE_CACHE_TTL = 5 * 60 * 1000;  // 探测结果缓存 5 分钟，别每次刷新都打
  var STATIC_TEXT = '本地模式（未连接同步服务）';

  var state = {
    status: 'idle',
    text: '未登录',
    version: 0,
    lastSyncAt: '',
    lastError: '',
    busy: false,
    queued: false,
    pendingPush: false,
    dialogOpen: false,
    started: false,
    applying: false,
    // 服务器明确拒绝（4xx，非 401/409）后置上：停止自动重试，等用户手动点「立即同步」
    rejectedMessage: '',
    rejectedStatus: 0,
    // 'unknown' 还没探测 / 'server' 有同步后端 / 'none' 纯静态部署
    backend: 'unknown',
    backendPromise: null
  };

  var rawWrite = null;      // 未包装的 PP.store.write
  var pushTimer = null;
  var pollTimer = null;
  var panel = null;         // 同步面板引用，用于就地刷新

  function toast(message, type) {
    if (PP.ui && typeof PP.ui.toast === 'function') PP.ui.toast(message, type || 'info');
    else console.info('[拾光]', message);
  }

  // 后台触发的同步没有调用者可以 catch，这里统一兜住，避免出现未处理的 Promise 拒绝
  function runQuiet(promise) {
    if (promise && typeof promise.catch === 'function') {
      promise.catch(function (error) {
        console.error('[拾光] 后台同步出错：', error);
        state.lastError = (error && error.message) || '同步出错';
        setStatus('offline', '同步失败');
      });
    }
    return promise;
  }

  function isFileMode() {
    return window.location.protocol === 'file:';
  }

  function failure(code, message, extra) {
    var error = new Error(message || '同步失败');
    error.code = code;
    if (extra) {
      Object.keys(extra).forEach(function (key) { error[key] = extra[key]; });
    }
    return error;
  }

  /* ---------------------------------------------------------------- 配置 */

  // 版本号既可能是服务端的整数，也可能是 GitHub 的 content sha（字符串），两种都要能存住
  function normalizeVersion(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string' && value) return value;
    return 0;
  }

  function readConfig() {
    var raw = readKey(CONFIG_KEY, null);
    var cfg = raw && typeof raw === 'object' ? raw : {};
    var github = cfg.github && typeof cfg.github === 'object' ? cfg.github : {};
    var legacyServer = typeof cfg.server === 'string' ? cfg.server : '';
    return {
      provider: cfg.provider === 'github' ? 'github' : 'server',
      serverUrl: typeof cfg.serverUrl === 'string' ? cfg.serverUrl : legacyServer,
      github: {
        owner: String(github.owner || ''),
        repo: String(github.repo || ''),
        branch: String(github.branch || 'main'),
        path: String(github.path || 'data/planner.json'),
        token: String(github.token || ''),
        apiBase: String(github.apiBase || 'https://api.github.com'),
        attachmentsDir: String(github.attachmentsDir || 'data/attachments')
      },
      remember: !!cfg.remember,
      version: normalizeVersion(cfg.version),
      lastSyncAt: typeof cfg.lastSyncAt === 'string' ? cfg.lastSyncAt : '',
      lastPushed: typeof cfg.lastPushed === 'string' ? cfg.lastPushed : ''
    };
  }

  function writeConfig(patch) {
    var next = readConfig();
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (key) { next[key] = patch[key]; });
    }
    writeKey(CONFIG_KEY, next);
    return next;
  }

  function readKey(key, fallback) {
    if (!PP.store) return fallback;
    return PP.store.read(key, fallback);
  }

  function writeKey(key, value) {
    if (!PP.store) return false;
    if (rawWrite) return rawWrite.call(PP.store, key, value);
    return PP.store.write(key, value);
  }

  /* ---------------------------------------------------------------- token */

  function normalizeToken(raw) {
    if (!raw) return null;
    var obj;
    try {
      obj = JSON.parse(raw);
    } catch (error) {
      return null;
    }
    if (!obj || typeof obj.token !== 'string' || !obj.token) return null;
    var expiresAt = Number(obj.expiresAt) || 0;
    if (expiresAt && expiresAt * 1000 <= Date.now()) return null;
    return { token: obj.token, expiresAt: expiresAt, remember: !!obj.remember };
  }

  function readToken() {
    var stores = [];
    try { if (window.sessionStorage) stores.push({ store: window.sessionStorage, remember: false }); } catch (error) { /* 忽略 */ }
    try { if (window.localStorage) stores.push({ store: window.localStorage, remember: true }); } catch (error) { /* 忽略 */ }
    for (var index = 0; index < stores.length; index += 1) {
      var entry = stores[index];
      var raw = null;
      try { raw = entry.store.getItem(TOKEN_KEY); } catch (error) { raw = null; }
      if (!raw) continue;
      var parsed = normalizeToken(raw);
      if (parsed) {
        parsed.remember = entry.remember;
        return parsed;
      }
      try { entry.store.removeItem(TOKEN_KEY); } catch (error) { /* 忽略 */ }
    }
    return null;
  }

  function saveToken(token, expiresAt, remember) {
    var payload = JSON.stringify({ token: String(token), expiresAt: Number(expiresAt) || 0, remember: !!remember });
    clearToken();
    try {
      if (remember) window.localStorage.setItem(TOKEN_KEY, payload);
      else window.sessionStorage.setItem(TOKEN_KEY, payload);
    } catch (error) {
      console.warn('[拾光] 无法保存登录状态：', error);
    }
  }

  function clearToken() {
    try { window.sessionStorage.removeItem(TOKEN_KEY); } catch (error) { /* 忽略 */ }
    try { window.localStorage.removeItem(TOKEN_KEY); } catch (error) { /* 忽略 */ }
  }

  /* ---------------------------------------------------------------- 后端探测
     目的：站点被放到 GitHub Pages / Netlify 这类纯静态托管上时，
     没有 /api/*，不能把人卡在密码页。所以启动时先探一次：
       · 有后端 → 正常走密码页
       · 没后端 → 直接本地模式（等同 file:// 的行为）
     探测只用 GET /api/doc（不带 token）：我们的服务端会回 401 + JSON，
     静态托管一般是 404 HTML 或 200 index.html，两者都不像"API 在"。 */

  function readProbeCache() {
    try {
      var raw = window.sessionStorage.getItem(PROBE_CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj.at !== 'number' || Date.now() - obj.at > PROBE_CACHE_TTL) return null;
      return obj.value === 'server' || obj.value === 'none' ? obj.value : null;
    } catch (error) {
      return null;
    }
  }

  function writeProbeCache(value) {
    try {
      window.sessionStorage.setItem(PROBE_CACHE_KEY, JSON.stringify({ value: value, at: Date.now() }));
    } catch (error) {
      /* 忽略：无痕模式可能禁写 */
    }
  }

  function resetProbe() {
    state.backend = 'unknown';
    state.backendPromise = null;
    try { window.sessionStorage.removeItem(PROBE_CACHE_KEY); } catch (error) { /* 忽略 */ }
  }

  function looksLikeOurApi(response) {
    if (!response || !response.status || response.status >= 500) return false;
    var data = response.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    return typeof data.error === 'string' ||
      'payload' in data || 'version' in data || 'token' in data || 'expiresAt' in data;
  }

  async function probeOnce(config) {
    var probe = await probeRequest(config, 'GET', '/api/doc');
    if (looksLikeOurApi(probe)) return 'server';
    // 某些代理会改写 GET /api/doc；再用空 body 登录确认一次（空密码走 400，不消耗失败次数）
    var second = await probeRequest(config, 'POST', '/api/login', {});
    if (looksLikeOurApi(second)) return 'server';
    return 'none';
  }

  // 3 秒超时的裸请求：不带头 token，不重试
  async function probeRequest(config, method, path, body) {
    var init = {
      method: method,
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
      credentials: 'omit'
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    var timer = null;
    var controller = null;
    if (typeof window.AbortController === 'function') {
      controller = new window.AbortController();
      init.signal = controller.signal;
      timer = window.setTimeout(function () {
        try { controller.abort(); } catch (error) { /* 忽略 */ }
      }, PROBE_TIMEOUT);
    }
    try {
      var response = await window.fetch(apiBase(config) + path, init);
      var text = '';
      try { text = await response.text(); } catch (error) { text = ''; }
      var data = null;
      if (text) {
        try { data = JSON.parse(text); } catch (error) { data = null; }
      }
      return { status: response.status, data: data };
    } catch (error) {
      return { status: 0, data: null };
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function whenBackendReady() {
    if (state.backendPromise) return state.backendPromise;
    if (isFileMode()) {
      state.backend = 'none';
      state.backendPromise = Promise.resolve('none');
      return state.backendPromise;
    }
    var config = readConfig();
    // GitHub provider 不需要 /api，本身就是"有后端"
    if (config.provider === 'github') {
      state.backend = 'server';
      state.backendPromise = Promise.resolve('server');
      return state.backendPromise;
    }
    var cached = readProbeCache();
    if (cached) {
      state.backend = cached;
      state.backendPromise = Promise.resolve(cached);
      return state.backendPromise;
    }
    state.backendPromise = probeOnce(config).then(function (value) {
      state.backend = value;
      writeProbeCache(value);
      renderStatus();
      return value;
    }).catch(function () {
      state.backend = 'none';
      return 'none';
    });
    return state.backendPromise;
  }

  function backendAvailable() {
    return state.backend !== 'none';
  }

  function isLocalMode() {
    return isFileMode() || state.backend === 'none';
  }

  function localModeText() {
    // file:// 保持原来的「本地模式」文案；静态托管要说清"没连上同步服务"
    return isFileMode() ? '本地模式' : STATIC_TEXT;
  }

  /* ---------------------------------------------------------------- provider 注册表 */

  var providers = PP.syncProviders = PP.syncProviders || {};

  function apiBase(config) {
    var server = String((config && config.serverUrl) || '').trim().replace(/\/+$/, '');
    return server;
  }

  function serverMessage(response, fallback) {
    if (response && response.data && typeof response.data.error === 'string' && response.data.error) {
      return response.data.error;
    }
    return fallback;
  }

  async function httpJson(config, path, options) {
    var opts = options || {};
    var headers = { 'Accept': 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (!opts.anonymous) {
      var token = readToken();
      if (token && token.token) headers.Authorization = 'Bearer ' + token.token;
    }
    var init = {
      method: opts.method || 'GET',
      headers: headers,
      cache: 'no-store',
      credentials: 'omit'
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

    var timer = null;
    var controller = null;
    if (typeof window.AbortController === 'function') {
      controller = new window.AbortController();
      init.signal = controller.signal;
      timer = window.setTimeout(function () {
        try { controller.abort(); } catch (error) { /* 忽略 */ }
      }, REQUEST_TIMEOUT);
    }

    var response;
    try {
      response = await window.fetch(apiBase(config) + path, init);
    } catch (error) {
      var aborted = error && error.name === 'AbortError';
      throw failure('offline', aborted
        ? '请求超时（' + Math.round(REQUEST_TIMEOUT / 1000) + ' 秒没有响应）'
        : '连不上服务器，请检查网络或服务器地址', { cause: error });
    } finally {
      if (timer) window.clearTimeout(timer);
    }

    var text = '';
    try { text = await response.text(); } catch (error) { text = ''; }
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (error) { data = null; }
    }
    return { ok: !!response.ok, status: response.status, data: data };
  }

  /* ------------------------------ 自建 Python 服务端 ------------------------------ */

  providers.server = {
    id: 'server',
    label: '自建服务端',

    isAuthed: function () {
      return !!readToken();
    },

    describe: function (config) {
      return apiBase(config) || (window.location.protocol + '//' + window.location.host);
    },

    login: async function (config, password) {
      if (!apiBase(config) && !window.location.host) {
        return { ok: false, message: '没有可用的服务器地址。' };
      }
      var res = await httpJson(config, '/api/login', {
        method: 'POST',
        body: { password: password },
        anonymous: true
      });
      if (res.status === 429) {
        return { ok: false, message: serverMessage(res, '密码错误次数过多，请稍后再试。') };
      }
      if (res.status === 401) {
        return { ok: false, message: serverMessage(res, '密码不正确，请再试一次。') };
      }
      if (res.status === 404) {
        return {
          ok: false,
          message: '这个地址没有同步接口。普通静态服务器（如 python -m http.server）不能登录，' +
            '请改用 server/planner-server.py 启动（见 server/README.md）。'
        };
      }
      if (!res.ok || !res.data || !res.data.token) {
        if (!res.data) {
          return { ok: false, message: '服务器返回了意外的内容（HTTP ' + res.status + '），请检查服务器地址是否正确。' };
        }
        return { ok: false, message: serverMessage(res, '登录失败（HTTP ' + res.status + '）') };
      }
      saveToken(res.data.token, res.data.expiresAt, !!(config && config.remember));
      return { ok: true };
    },

    pull: async function (config) {
      var res = await httpJson(config, '/api/doc', { method: 'GET' });
      if (res.status === 401) {
        throw failure('auth', serverMessage(res, '登录已失效，请重新输入访问密码。'));
      }
      if (res.status >= 400 && res.status < 500) {
        // 4xx 是请求本身有问题（地址/版本/接口不对），重试没有意义
        throw failure('badrequest', serverMessage(res, '读取失败（HTTP ' + res.status + '）'), { status: res.status });
      }
      if (!res.ok) {
        throw failure('http', serverMessage(res, '读取云端数据失败（HTTP ' + res.status + '）'));
      }
      var doc = res.data || {};
      return {
        payload: doc.payload == null ? null : doc.payload,
        version: Number(doc.version) || 0,
        updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : ''
      };
    },

    push: async function (config, payload, baseVersion) {
      var res = await httpJson(config, '/api/doc', {
        method: 'PUT',
        body: { payload: payload, baseVersion: typeof baseVersion === 'number' ? baseVersion : 0 }
      });
      if (res.status === 409) {
        var doc = res.data || {};
        throw failure('conflict', serverMessage(res, '服务器上的数据已被另一台设备更新。'), {
          current: {
            payload: doc.payload == null ? null : doc.payload,
            version: Number(doc.version) || 0,
            updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : ''
          }
        });
      }
      if (res.status === 401) {
        throw failure('auth', serverMessage(res, '登录已失效，请重新输入访问密码。'));
      }
      if (res.status >= 400 && res.status < 500) {
        // 400/411/413 等：请求被服务器拒绝，重试同样的请求只会一直失败
        throw failure('badrequest', serverMessage(res, '上传被服务器拒绝（HTTP ' + res.status + '）'), { status: res.status });
      }
      if (!res.ok) {
        throw failure('http', serverMessage(res, '上传失败（HTTP ' + res.status + '）'));
      }
      var result = res.data || {};
      return {
        version: Number(result.version) || (Number(baseVersion) || 0) + 1,
        updatedAt: typeof result.updatedAt === 'string' ? result.updatedAt : ''
      };
    },

    logout: async function () {
      clearToken();
    }
  };

  /* ---------------------------------------------------------------- 数据搬运 */

  function stable(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(stable).join(',') + ']';
    }
    var keys = Object.keys(value).sort();
    return '{' + keys.map(function (key) {
      return JSON.stringify(key) + ':' + stable(value[key]);
    }).join(',') + '}';
  }

  function collectPayload() {
    var payload = {};
    if (!PP.store) return payload;
    SYNC_KEYS.forEach(function (key) {
      var value = PP.store.read(key, undefined);
      if (value !== undefined && value !== null) payload[key] = value;
    });
    return payload;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function listHasReal(list) {
    return asArray(list).some(function (item) { return item && !item.sample; });
  }

  function dayIsReal(day) {
    if (!day || typeof day !== 'object') return false;
    if (asArray(day.moods).some(function (item) { return item && !item.sample; })) return true;
    if (asArray(day.todos).some(function (item) { return item && !item.sample; })) return true;
    if (asArray(day.timeline).some(function (item) { return item && !item.sample; })) return true;
    if (day.summary && !day.sampleSummary) return true;
    return false;
  }

  // 判断「这台设备是否已有真的内容」：示例数据不算，避免新设备被示例数据逼出冲突弹窗
  function hasMeaningfulContent(payload) {
    if (!payload) return false;
    if (listHasReal(payload.books) || listHasReal(payload.writings) ||
        listHasReal(payload.todos) || listHasReal(payload.tasks)) return true;
    if (asArray(payload.habits).some(function (habit) { return habit && !habit.sample; })) return true;
    var days = payload.days;
    if (days && typeof days === 'object') {
      var dates = Object.keys(days);
      for (var index = 0; index < dates.length; index += 1) {
        if (dayIsReal(days[dates[index]])) return true;
      }
    }
    var important = payload.important;
    if (important && typeof important === 'object') {
      var keys = Object.keys(important);
      for (var i = 0; i < keys.length; i += 1) {
        if (listHasReal(important[keys[i]])) return true;
      }
    }
    var months = payload.monthSummaries;
    if (months && typeof months === 'object') {
      var yms = Object.keys(months);
      for (var j = 0; j < yms.length; j += 1) {
        var entry = months[yms[j]];
        var hasText = entry && typeof entry === 'object' ? !entry.sample : !!entry;
        if (hasText) return true;
      }
    }
    return false;
  }

  function summarize(payload) {
    if (!payload) return '还没有数据';
    var days = payload.days && typeof payload.days === 'object' ? Object.keys(payload.days).length : 0;
    var parts = [];
    if (days) parts.push(days + ' 天记录');
    if (asArray(payload.books).length) parts.push(asArray(payload.books).length + ' 本书');
    if (asArray(payload.todos).length) parts.push(asArray(payload.todos).length + ' 项待办');
    if (asArray(payload.writings).length) parts.push(asArray(payload.writings).length + ' 张写作卡');
    if (asArray(payload.tasks).length) parts.push(asArray(payload.tasks).length + ' 个长期任务');
    return parts.length ? parts.join('、') : '尚无实质内容';
  }

  function applyPayload(payload, options) {
    var opts = options || {};
    if (!PP.store) return 0;
    var applied = 0;
    state.applying = true;
    try {
      SYNC_KEYS.forEach(function (key) {
        var has = payload && Object.prototype.hasOwnProperty.call(payload, key);
        if (has) {
          if (writeKey(key, payload[key])) applied += 1;
        } else if (opts.removeMissing && PP.store.has(key)) {
          PP.store.remove(key);
        }
      });
    } finally {
      state.applying = false;
    }
    // 主题可能随 settings 变化，重新套用一次
    try {
      if (PP.ui && PP.ui.theme && PP.data) {
        var settings = PP.data.getSettings();
        PP.ui.theme.apply(settings.theme, settings.mode);
      }
    } catch (error) {
      console.warn('[拾光] 同步后套用主题失败：', error);
    }
    if (opts.refresh !== false) {
      try {
        var view = document.getElementById('view');
        if (view && PP.router && typeof PP.router.refresh === 'function') PP.router.refresh();
      } catch (error) {
        console.warn('[拾光] 同步后刷新页面失败：', error);
      }
    }
    return applied;
  }

  /* ------------------------------ 合并（按条目并集 + 示例按内容去重） ------------------------------ */

  function stampOf(item) {
    if (!item || typeof item !== 'object') return '';
    return String(item.updatedAt || item.createdAt || item.doneAt || '');
  }

  // 示例数据的「内容签名」：两台设备各自播种的示例 id 不同，只有按内容才能认出是同一条
  function sampleSignature(item) {
    var parts = [];
    if (item.title) parts.push('t:' + String(item.title).trim());
    if (item.text) parts.push('x:' + String(item.text).trim());
    if (item.name) parts.push('n:' + String(item.name).trim());
    if (item.mood) parts.push('m:' + item.mood);
    if (item.period) parts.push('p:' + item.period);
    if (item.time) parts.push('@' + String(item.time));
    if (item.place) parts.push('l:' + String(item.place).trim());
    if (item.event) parts.push('e:' + String(item.event).trim());
    if (!parts.length) parts.push('h:' + stable(item).slice(0, 160));
    return parts.join('|');
  }

  function itemIdentity(item, fallbackIndex) {
    if (item && typeof item === 'object') {
      // 示例条目按内容归并：保留一份，避免"两台设备的示例并集成两份"
      if (item.sample) return 's:' + sampleSignature(item);
      if (item.id) return 'id:' + item.id;
      if (item.createdAt) return 'ct:' + item.createdAt;
    }
    return 'ix:' + fallbackIndex;
  }

  // 合并两个列表：输出里的键一定唯一 → 天然幂等，且能顺手治好"云端已经被写重复"的脏数据
  function mergeList(remote, local) {
    var order = [];
    var map = Object.create(null);

    function consider(item, index) {
      var key = itemIdentity(item, index);
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        if (stampOf(item) > stampOf(map[key])) map[key] = item;
        return;
      }
      map[key] = item;
      order.push(key);
    }

    asArray(remote).forEach(consider);
    asArray(local).forEach(consider);
    return order.map(function (key) { return map[key]; });
  }

  function mergeDay(remoteDay, localDay) {
    if (!remoteDay) return localDay;
    if (!localDay) return remoteDay;
    var localHasSummary = !!localDay.summary;
    return {
      moods: mergeList(remoteDay.moods, localDay.moods),
      todos: mergeList(remoteDay.todos, localDay.todos),
      timeline: mergeList(remoteDay.timeline, localDay.timeline),
      summary: localHasSummary ? localDay.summary : (remoteDay.summary || ''),
      sampleSummary: localHasSummary ? !!localDay.sampleSummary : !!remoteDay.sampleSummary
    };
  }

  function mergeMap(remote, local, entryMerger) {
    var out = {};
    Object.keys(remote || {}).forEach(function (key) { out[key] = remote[key]; });
    Object.keys(local || {}).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(out, key)) {
        out[key] = local[key];
        return;
      }
      out[key] = entryMerger ? entryMerger(out[key], local[key]) : local[key];
    });
    return out;
  }

  function mergeObject(remote, local) {
    var out = {};
    Object.keys(remote || {}).forEach(function (key) { out[key] = remote[key]; });
    Object.keys(local || {}).forEach(function (key) {
      if (!(key in out)) {
        out[key] = local[key];
        return;
      }
      var r = out[key];
      var l = local[key];
      if (Array.isArray(r) && Array.isArray(l)) {
        out[key] = mergeList(r, l);
      } else if (r && typeof r === 'object' && !Array.isArray(r) &&
                 l && typeof l === 'object' && !Array.isArray(l)) {
        out[key] = mergeObject(r, l);
      } else {
        out[key] = l;
      }
    });
    return out;
  }

  function mergePayloads(remote, local) {
    var out = {};
    SYNC_KEYS.forEach(function (key) {
      var r = remote ? remote[key] : undefined;
      var l = local ? local[key] : undefined;
      if (r === undefined) {
        if (l !== undefined) out[key] = l;
        return;
      }
      if (l === undefined) {
        out[key] = r;
        return;
      }
      if (key === 'settings') { out[key] = l; return; }        // 主题 / 上次日期以本机为准
      if (key === 'meta') { out[key] = r; return; }            // 元信息以服务器为准
      if (key === 'days') { out[key] = mergeMap(r, l, mergeDay); return; }
      if (Array.isArray(r) && Array.isArray(l)) { out[key] = mergeList(r, l); return; }
      if (r && typeof r === 'object' && l && typeof l === 'object') {
        out[key] = mergeObject(r, l);
        return;
      }
      out[key] = l;
    });
    // 示例习惯按内容去重后会有一份 id 被丢掉，它的 habitLogs 就成了孤儿键，顺手剪掉
    if (Array.isArray(out.habits) && out.habitLogs && typeof out.habitLogs === 'object') {
      out.habitLogs = pruneHabitLogs(out.habits, out.habitLogs);
    }
    return out;
  }

  function pruneHabitLogs(habits, logs) {
    var alive = Object.create(null);
    asArray(habits).forEach(function (habit) {
      if (habit && habit.id) alive[String(habit.id)] = true;
    });
    var out = {};
    Object.keys(logs || {}).forEach(function (id) {
      if (alive[id]) out[id] = logs[id];
    });
    return out;
  }

  // 整份替换之前先做一次去重（能治好"云端已经被写重复"的历史数据）
  function dedupePayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    var out = {};
    Object.keys(payload).forEach(function (key) { out[key] = payload[key]; });

    ['books', 'writings', 'todos', 'tasks', 'habits'].forEach(function (key) {
      if (Array.isArray(out[key])) out[key] = mergeList(out[key], []);
    });

    if (out.important && typeof out.important === 'object') {
      var important = {};
      Object.keys(out.important).forEach(function (date) {
        var list = out.important[date];
        important[date] = Array.isArray(list) ? mergeList(list, []) : list;
      });
      out.important = important;
    }

    if (out.days && typeof out.days === 'object') {
      var days = {};
      Object.keys(out.days).forEach(function (date) {
        var day = out.days[date];
        if (!day || typeof day !== 'object') { days[date] = day; return; }
        var copy = {};
        Object.keys(day).forEach(function (field) { copy[field] = day[field]; });
        ['moods', 'todos', 'timeline'].forEach(function (field) {
          if (Array.isArray(copy[field])) copy[field] = mergeList(copy[field], []);
        });
        days[date] = copy;
      });
      out.days = days;
    }

    if (Array.isArray(out.habits) && out.habitLogs && typeof out.habitLogs === 'object') {
      out.habitLogs = pruneHabitLogs(out.habits, out.habitLogs);
    }
    return out;
  }

  /* ---------------------------------------------------------------- 状态展示 */

  function setStatus(next, text) {
    state.status = next;
    state.text = text || '';
    renderStatus();
  }

  function renderStatus() {
    document.querySelectorAll('[data-sync-status]').forEach(function (el) {
      el.setAttribute('data-state', state.status);
      el.setAttribute('aria-label', '同步状态：' + state.text);
      el.setAttribute('title', '同步状态：' + state.text);
      var textEl = el.querySelector('.sync-text');
      if (textEl) textEl.textContent = state.text;
      else el.textContent = state.text;
    });
    refreshPanel();
  }

  function markOffline(message) {
    state.lastError = message || '网络连接失败';
    setStatus('offline', '离线');
  }

  // 服务器明确拒绝（4xx，非 401/409）：停止自动重试，把原因摆到面板上
  function markRejected(message, status) {
    state.pendingPush = false;
    state.rejectedMessage = message || '同步请求被服务器拒绝。';
    state.rejectedStatus = status || 0;
    state.lastError = state.rejectedMessage;
    setStatus('offline', '同步被拒绝');
    toast(state.rejectedMessage + ' 自动同步已暂停，处理后可在同步面板点「立即同步」重试。', 'error', 8000);
  }

  function clearRejected() {
    if (!state.rejectedMessage) return;
    state.rejectedMessage = '';
    state.rejectedStatus = 0;
  }

  function handleUnauthorized() {
    clearToken();
    state.pendingPush = false;
    state.lastError = '登录已失效';
    if (isLocalMode()) {
      // 静态托管 / file://：没有密码页可回，保持本地模式
      setStatus('local', localModeText());
      return;
    }
    setStatus('idle', '需重新登录');
    toast('登录已失效，请重新输入访问密码。', 'warning');
    try {
      if (PP.gate && typeof PP.gate.open === 'function') {
        PP.gate.open('登录已失效，请重新输入访问密码。');
      }
    } catch (error) {
      console.warn('[拾光] 无法打开密码页：', error);
    }
  }

  async function guarded(task) {
    try {
      return { ok: true, value: await task() };
    } catch (error) {
      var code = error && error.code;
      if (code === 'auth') {
        handleUnauthorized();
        return { ok: false, reason: 'auth', error: error };
      }
      if (code === 'offline') {
        markOffline(error.message);
        return { ok: false, reason: 'offline', error: error };
      }
      if (code === 'conflict') {
        return { ok: false, reason: 'conflict', error: error };
      }
      if (code === 'config') {
        setStatus('idle', '未配置');
        toast(error.message, 'warning');
        return { ok: false, reason: 'config', error: error };
      }
      if (code === 'badrequest') {
        markRejected(error.message, error.status);
        return { ok: false, reason: 'badrequest', error: error };
      }
      console.error('[拾光] 同步失败：', error);
      state.lastError = (error && error.message) || '同步失败';
      setStatus('offline', '同步失败');
      return { ok: false, reason: 'error', error: error };
    }
  }

  /* ---------------------------------------------------------------- 选择弹窗 */

  // 单弹窗多阶段选择器：避免与 PP.ui.confirm 嵌套（ui.js 同一时间只保留一个弹窗）
  function choiceModal(config) {
    return new Promise(function (resolve) {
      var settled = false;
      var api = null;
      var pendingKey = '';
      state.dialogOpen = true;

      function finish(value) {
        if (settled) return;
        settled = true;
        state.dialogOpen = false;
        if (api) {
          try { api.close(); } catch (error) { /* 忽略 */ }
        }
        resolve(value);
      }

      function stageHtml() {
        var html = '<div class="sync-choice">' + (config.body || '') + '<div class="sync-choice-list">';
        (config.options || []).forEach(function (option, index) {
          html += '<button class="btn ' + (option.className || '') + ' sync-choice-btn" type="button" data-choice="' +
            index + '">' + U.escapeHTML(option.label) + '</button>';
        });
        html += '</div></div>';
        return html;
      }

      function confirmHtml(option) {
        return '<div class="sync-choice">' +
          '<p class="sync-choice-warn">' + U.escapeHTML(option.confirm || '') + '</p>' +
          '<div class="sync-choice-list">' +
            '<button class="btn" type="button" data-choice-back>返回</button>' +
            '<button class="btn btn-danger" type="button" data-choice-ok>' +
              U.escapeHTML(option.okLabel || '确定继续') +
            '</button>' +
          '</div>' +
        '</div>';
      }

      api = PP.ui.modal({
        title: config.title,
        subtitle: config.subtitle || '',
        narrow: true,
        body: stageHtml(),
        footer: null,
        onClose: function () { finish('cancel'); },
        onMount: function (body) {
          function bind() {
            body.querySelectorAll('[data-choice]').forEach(function (button) {
              button.addEventListener('click', function () {
                var option = (config.options || [])[Number(button.getAttribute('data-choice'))];
                if (!option) return;
                if (option.confirm) {
                  pendingKey = option.key;
                  body.innerHTML = confirmHtml(option);
                  bind();
                } else {
                  finish(option.key);
                }
              });
            });
            var back = body.querySelector('[data-choice-back]');
            if (back) {
              back.addEventListener('click', function () {
                pendingKey = '';
                body.innerHTML = stageHtml();
                bind();
              });
            }
            var ok = body.querySelector('[data-choice-ok]');
            if (ok) {
              ok.addEventListener('click', function () { finish(pendingKey); });
            }
          }
          bind();
        }
      });
    });
  }

  function askFirstSync(remote, local, firstSync) {
    return choiceModal({
      title: firstSync ? '这台设备与云端内容不一致' : '云端和这台设备都改过了',
      subtitle: firstSync
        ? '第一次在这个存储后端上同步，需要先决定保留哪一份。'
        : '两边内容都不是上次同步时的样子，请选择怎么处理。',
      body: '<p class="sync-choice-text">云端：<strong>' + U.escapeHTML(summarize(remote)) + '</strong></p>' +
        '<p class="sync-choice-text">本机：<strong>' + U.escapeHTML(summarize(local)) + '</strong></p>' +
        '<p class="sync-choice-text muted">「合并」会把两边记录按条目并在一起，同一条以更新时间较晚的为准。</p>',
      options: [
        { key: 'merge', label: '合并两边内容', className: 'btn-primary' },
        {
          key: 'server',
          label: '用云端覆盖本机',
          className: 'btn-soft',
          confirm: '本机内容会被云端数据整份替换，本机独有的记录会消失。确定继续吗？',
          okLabel: '确认覆盖本机'
        },
        {
          key: 'local',
          label: '用本机覆盖云端',
          className: 'btn-danger',
          confirm: '云端数据会被这台设备的内容整份替换，其他设备之前保存的内容会消失。确定继续吗？',
          okLabel: '确认覆盖云端'
        }
      ]
    });
  }

  function askConflict(current) {
    var version = current && current.version != null ? current.version : '?';
    var updated = current && current.updatedAt
      ? ' · ' + U.escapeHTML(PP.Dates ? PP.Dates.formatSaved(current.updatedAt) : current.updatedAt)
      : '';
    return choiceModal({
      title: '云端有另一台设备更新的数据',
      subtitle: '为免互相覆盖，本机改动不会自动提交。请选择保留哪一份。',
      body: '<p class="sync-choice-text">云端版本：<strong>v' + U.escapeHTML(String(version)) + '</strong>' + updated + '</p>' +
        '<p class="sync-choice-text">云端：<strong>' + U.escapeHTML(summarize(current && current.payload)) + '</strong></p>' +
        '<p class="sync-choice-text">本机：<strong>' + U.escapeHTML(summarize(collectPayload())) + '</strong></p>',
      options: [
        {
          key: 'server',
          label: '载入云端的版本',
          className: 'btn-soft',
          confirm: '本机尚未同步的改动会被云端内容整份替换。确定载入吗？',
          okLabel: '确认载入云端版本'
        },
        {
          key: 'local',
          label: '用本机覆盖云端',
          className: 'btn-danger',
          confirm: '云端数据会被这台设备的内容整份替换，其他设备刚才的改动会消失。确定继续吗？',
          okLabel: '确认覆盖云端'
        }
      ]
    });
  }

  /* ---------------------------------------------------------------- 引擎 */

  function currentProvider() {
    var config = readConfig();
    var provider = providers[config.provider];
    return { config: config, provider: provider || null, name: config.provider };
  }

  function isAuthed() {
    if (isLocalMode()) return false;
    var current = currentProvider();
    if (!current.provider) return false;
    if (typeof current.provider.isAuthed === 'function') {
      try { return !!current.provider.isAuthed(current.config); } catch (error) { return false; }
    }
    return false;
  }

  function serverLabel() {
    var current = currentProvider();
    if (!current.provider) return '未配置后端';
    if (typeof current.provider.describe === 'function') {
      try { return current.provider.describe(current.config); } catch (error) { /* 忽略 */ }
    }
    return current.provider.label || current.name;
  }

  function scheduleSync() {
    if (!state.started || state.applying) return;
    if (isFileMode()) return;
    if (!isAuthed()) return;
    // 服务器曾明确拒绝过（4xx）：不再自动推送，避免反复打同一堵墙
    if (state.rejectedMessage) return;
    state.pendingPush = true;
    if (pushTimer) window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(function () {
      pushTimer = null;
      runQuiet(push());
    }, PUSH_DELAY);
  }

  function finishBusy() {
    state.busy = false;
    if (state.queued) {
      state.queued = false;
      if (!state.dialogOpen) {
        window.setTimeout(function () {
          if (isAuthed() && !state.busy) runQuiet(syncNow());
        }, 350);
      }
    }
  }

  async function login(password, options) {
    var opts = options || {};
    if (isFileMode()) {
      return { ok: false, error: '本地模式（file://）下没有服务器，无法登录。' };
    }
    if (state.backend === 'none') {
      return { ok: false, error: '当前是纯静态部署，没有同步服务可以登录。' };
    }
    if (typeof password !== 'string' || !password) {
      return { ok: false, error: '请先输入访问密码。' };
    }
    var current = currentProvider();
    if (!current.provider) {
      return { ok: false, error: '存储后端「' + current.name + '」没有注册。' };
    }
    clearRejected();
    if (opts.remember !== undefined) {
      writeConfig({ remember: !!opts.remember, provider: current.config.provider });
    }
    var config = readConfig();
    var result;
    try {
      result = await current.provider.login(config, password);
    } catch (error) {
      if (error && error.code === 'offline') {
        setStatus('offline', '离线');
        return { ok: false, error: error.message };
      }
      if (error && error.code === 'config') {
        return { ok: false, error: error.message };
      }
      console.error('[拾光] 登录失败：', error);
      return { ok: false, error: (error && error.message) || '登录请求失败。' };
    }
    if (!result || !result.ok) {
      return { ok: false, error: (result && result.message) || '登录失败，请检查密码或服务器地址。' };
    }
    state.version = 0;
    state.pendingPush = false;
    setStatus('syncing', '同步中');
    window.setTimeout(function () { runQuiet(syncNow()); }, 0);
    return { ok: true, provider: config.provider };
  }

  async function logout() {
    var current = currentProvider();
    if (current.provider && typeof current.provider.logout === 'function') {
      try { await current.provider.logout(current.config); } catch (error) { /* 忽略 */ }
    }
    clearToken();
    clearRejected();
    state.version = 0;
    state.pendingPush = false;
    state.lastError = '';
    writeConfig({ version: 0, lastPushed: '' });
    setStatus('idle', '未登录');
    if (PP.gate && typeof PP.gate.open === 'function') {
      PP.gate.open('已退出登录，请重新输入访问密码。');
    }
    return { ok: true };
  }

  async function pull(options) {
    var opts = options || {};
    if (isLocalMode()) {
      setStatus('local', localModeText());
      return { ok: false, reason: 'local' };
    }
    var current = currentProvider();
    if (!current.provider) {
      setStatus('idle', '未配置');
      return { ok: false, reason: 'config' };
    }
    if (!isAuthed()) {
      setStatus('idle', '未登录');
      return { ok: false, reason: 'auth' };
    }
    if (state.rejectedMessage && !opts.force) {
      return { ok: false, reason: 'badrequest', error: failure('badrequest', state.rejectedMessage) };
    }
    if (state.busy) {
      state.queued = true;
      return { ok: false, reason: 'busy' };
    }
    state.busy = true;
    setStatus('syncing', '同步中');
    try {
      var outcome = await guarded(function () { return current.provider.pull(readConfig()); });
      if (!outcome.ok) return outcome;

      var doc = outcome.value || {};
      var remote = doc.payload == null ? null : doc.payload;
      var version = doc.version == null ? 0 : doc.version;
      state.version = version;
      state.lastSyncAt = doc.updatedAt || new Date().toISOString();
      state.lastError = '';

      var config = readConfig();
      var base = config.lastPushed || '';
      var local = collectPayload();
      var localKey = stable(local);
      var remoteKey = remote == null ? '' : stable(remote);

      if (remote === null) {
        // 云端还没有数据：把本机内容留着，等 syncNow 推送
        var hasLocal = hasMeaningfulContent(local);
        writeConfig({ version: version, lastSyncAt: state.lastSyncAt, lastPushed: '' });
        state.pendingPush = hasLocal || state.pendingPush;
        setStatus('idle', hasLocal ? '待上传' : '已同步');
        return { ok: true, applied: false, pending: hasLocal };
      }

      if (remoteKey === localKey) {
        state.pendingPush = false;
        writeConfig({ version: version, lastSyncAt: state.lastSyncAt, lastPushed: remoteKey });
        setStatus('idle', '已同步');
        return { ok: true, applied: false };
      }

      if (base && localKey === base) {
        // 本机没有改动、云端变了 → 直接采用云端（去重后再落盘，顺手治好脏数据）
        applyPayload(dedupePayload(remote), { removeMissing: true });
        state.pendingPush = false;
        writeConfig({ version: version, lastSyncAt: state.lastSyncAt, lastPushed: remoteKey });
        setStatus('idle', '已同步');
        if (!opts.silent) toast('已同步到云端的最新内容。', 'success');
        return { ok: true, applied: true };
      }

      // 本机只有示例数据 / 空空如也：永远直接采用云端，绝不并集（否则两台设备的示例会翻倍）
      if (!hasMeaningfulContent(local)) {
        applyPayload(dedupePayload(remote), { removeMissing: true });
        state.pendingPush = false;
        writeConfig({ version: version, lastSyncAt: state.lastSyncAt, lastPushed: remoteKey });
        setStatus('idle', '已同步');
        toast('已载入云端数据。', 'success');
        return { ok: true, applied: true };
      }

      if (base && remoteKey === base) {
        // 云端没变、本机变了 → 等 syncNow 推送
        state.pendingPush = true;
        writeConfig({ version: version, lastSyncAt: state.lastSyncAt, lastPushed: base });
        setStatus('idle', '待上传');
        return { ok: true, pending: true };
      }

      // 两边内容不同：第一次同步，或双端都改过 → 交给用户决定
      state.pendingPush = true;
      setStatus('conflict', '有冲突');
      var choice = await askFirstSync(remote, local, !base);
      if (choice === 'server') {
        applyPayload(dedupePayload(remote), { removeMissing: true });
        state.pendingPush = false;
        writeConfig({ version: version, lastSyncAt: state.lastSyncAt, lastPushed: remoteKey });
        setStatus('idle', '已同步');
        return { ok: true, applied: true };
      }
      if (choice === 'merge') {
        // mergePayloads 的输出键唯一 → 同一份远端合并多少次结果都一样（幂等）
        var merged = dedupePayload(mergePayloads(remote, local));
        var mergedKey = stable(merged);
        if (mergedKey !== localKey) applyPayload(merged, { removeMissing: false });
        state.pendingPush = true;
        writeConfig({ version: version, lastSyncAt: state.lastSyncAt, lastPushed: '' });
        setStatus('idle', '待上传');
        return { ok: true, merged: true, pending: true };
      }
      if (choice === 'local') {
        state.pendingPush = true;
        writeConfig({ version: version, lastSyncAt: state.lastSyncAt, lastPushed: '' });
        setStatus('idle', '待上传');
        return { ok: true, pending: true };
      }
      state.pendingPush = true;
      setStatus('conflict', '有冲突');
      return { ok: false, reason: 'cancel' };
    } finally {
      finishBusy();
    }
  }

  async function attemptPush(payload, baseVersion, attempt) {
    var current = currentProvider();
    var outcome = await guarded(function () {
      return current.provider.push(readConfig(), payload, baseVersion);
    });

    if (outcome.ok) {
      var result = outcome.value || {};
      state.version = result.version == null ? (Number(baseVersion) || 0) + 1 : result.version;
      state.lastSyncAt = result.updatedAt || new Date().toISOString();
      state.pendingPush = false;
      state.lastError = '';
      writeConfig({ version: state.version, lastSyncAt: state.lastSyncAt, lastPushed: stable(payload) });
      setStatus('idle', '已同步');
      return { ok: true, version: state.version };
    }

    if (outcome.reason !== 'conflict') return outcome;

    // 冲突：绝不自动覆盖
    state.pendingPush = true;
    setStatus('conflict', '有冲突');
    var currentDoc = (outcome.error && outcome.error.current) || {};
    if (currentDoc.payload == null && attempt < MAX_PUSH_ATTEMPTS) {
      // 云端还是空的（比如第一次写之前被别处重置）：没有可丢的数据，直接用当前版本号重推
      return attemptPush(payload, Number(currentDoc.version) || 0, attempt + 1);
    }
    var choice = await askConflict(currentDoc);
    if (choice === 'server') {
      var remote = currentDoc.payload == null ? null : currentDoc.payload;
      if (remote) applyPayload(remote, { removeMissing: true });
      state.version = Number(currentDoc.version) || state.version;
      state.lastSyncAt = currentDoc.updatedAt || state.lastSyncAt;
      state.pendingPush = false;
      writeConfig({
        version: state.version,
        lastSyncAt: state.lastSyncAt,
        lastPushed: remote ? stable(remote) : ''
      });
      setStatus('idle', '已同步');
      return { ok: true, applied: true };
    }
    if (choice === 'local' && attempt < MAX_PUSH_ATTEMPTS) {
      return attemptPush(payload, Number(currentDoc.version) || 0, attempt + 1);
    }
    if (choice === 'local') {
      toast('同步冲突没有解决，请稍后在同步面板里重试。', 'warning');
    }
    return { ok: false, reason: 'conflict' };
  }

  async function push(options) {
    var opts = options || {};
    if (isLocalMode()) {
      setStatus('local', localModeText());
      return { ok: false, reason: 'local' };
    }
    var current = currentProvider();
    if (!current.provider) {
      setStatus('idle', '未配置');
      return { ok: false, reason: 'config' };
    }
    if (!isAuthed()) {
      setStatus('idle', '未登录');
      return { ok: false, reason: 'auth' };
    }
    if (state.rejectedMessage && !opts.force) {
      return { ok: false, reason: 'badrequest', error: failure('badrequest', state.rejectedMessage) };
    }
    if (state.busy) {
      state.queued = true;
      return { ok: false, reason: 'busy' };
    }
    state.busy = true;
    setStatus('syncing', '同步中');
    try {
      var payload = opts.payload || collectPayload();
      var config = readConfig();
      // baseVersion 可能是整数（自建服务端）也可能是 content sha（GitHub），两种都要原样传下去
      var baseVersion = (opts.baseVersion !== undefined && opts.baseVersion !== null)
        ? opts.baseVersion
        : (state.version || config.version || 0);
      return await attemptPush(payload, baseVersion, 0);
    } finally {
      finishBusy();
    }
  }

  async function syncNow(options) {
    var opts = options || {};
    if (isLocalMode()) {
      setStatus('local', localModeText());
      return { ok: false, reason: 'local' };
    }
    if (!isAuthed()) {
      setStatus('idle', '未登录');
      return { ok: false, reason: 'auth' };
    }
    // 只有显式重试（面板「立即同步」/ 登录 / 改配置）才解除"被拒绝"状态
    if (opts.force) clearRejected();
    if (state.rejectedMessage && !opts.force) {
      return { ok: false, reason: 'badrequest', error: failure('badrequest', state.rejectedMessage) };
    }
    if (state.busy) {
      state.queued = true;
      return { ok: false, reason: 'busy' };
    }
    var pulled = await pull(opts);
    if (pulled.reason === 'busy') return pulled;
    if (!pulled.ok && pulled.reason !== 'auth') return pulled;
    if (pulled.reason === 'auth') return pulled;
    if (state.pendingPush || opts.forcePush) return push();
    return pulled;
  }

  function status() {
    var config = readConfig();
    return {
      state: state.status,
      text: state.text,
      provider: config.provider,
      backend: state.backend,
      localMode: isLocalMode(),
      server: serverLabel(),
      version: state.version || config.version || 0,
      lastSyncAt: state.lastSyncAt || config.lastSyncAt || '',
      authed: isAuthed(),
      fileMode: isFileMode(),
      pending: !!state.pendingPush,
      rejected: !!state.rejectedMessage,
      rejectedStatus: state.rejectedStatus || 0,
      error: state.lastError || ''
    };
  }

  function provider() {
    return readConfig().provider;
  }

  function useProvider(name, config) {
    if (!name || !providers[name]) {
      return { ok: false, message: '没有注册这个存储后端：' + String(name) };
    }
    var next = readConfig();
    var changed = next.provider !== name;
    next.provider = name;
    if (config && typeof config === 'object') {
      if (typeof config.serverUrl === 'string') next.serverUrl = config.serverUrl;
      if (config.github && typeof config.github === 'object') {
        next.github = Object.assign({}, next.github, config.github);
      }
    }
    if (changed) {
      clearRejected();
      // 换后端会改变"有没有同步服务"的答案（github 后端不需要 /api），必须重新探测
      resetProbe();
      // 切换后端只影响后续同步：不动本地数据，但旧的同步基线必须清掉
      next.version = 0;
      next.lastPushed = '';
      next.lastSyncAt = '';
      state.version = 0;
      state.pendingPush = false;
    }
    writeKey(CONFIG_KEY, next);
    if (changed) {
      setStatus('syncing', '检查同步服务…');
      whenBackendReady().then(function (backend) {
        if (backend === 'none') setStatus('local', STATIC_TEXT);
        else setStatus('idle', isAuthed() ? '待同步' : '未登录');
      });
      toast('已切换到「' + (providers[name].label || name) + '」，本地数据没有变化。', 'info');
    } else {
      renderStatus();
    }
    return { ok: true, provider: name, changed: changed };
  }

  function setServer(url) {
    var raw = String(url == null ? '' : url).trim();
    if (raw && !/^https?:\/\/[^\s/]+/i.test(raw)) {
      return { ok: false, message: '地址需要以 http:// 或 https:// 开头，例如 https://planner.example.com' };
    }
    var next = raw.replace(/\/+$/, '');
    var config = readConfig();
    var changed = next !== config.serverUrl;
    writeConfig({
      provider: 'server',
      serverUrl: next,
      version: changed ? 0 : config.version,
      lastPushed: changed ? '' : config.lastPushed,
      lastSyncAt: changed ? '' : config.lastSyncAt
    });
    if (changed) {
      clearRejected();
      state.version = 0;
      state.lastSyncAt = '';
    }
    return { ok: true, server: next, changed: changed };
  }

  /* ---------------------------------------------------------------- 同步面板 */

  function providerOptions() {
    return Object.keys(providers).map(function (key) {
      var item = providers[key];
      return '<option value="' + U.escapeAttr(key) + '">' + U.escapeHTML(item.label || key) + '</option>';
    }).join('');
  }

  function panelHtml() {
    var info = status();
    var config = readConfig();
    var isGithub = config.provider === 'github';
    var serverField = isGithub
      ? '<input class="sync-input" type="text" data-sync-server value="' + U.escapeAttr(config.serverUrl) + '" disabled placeholder="GitHub 后端不需要服务器地址">'
      : '<input class="sync-input" type="text" data-sync-server value="' + U.escapeAttr(config.serverUrl) +
        '" placeholder="留空表示同源（当前网址）" inputmode="url" spellcheck="false">';
    return '<div class="sync-panel" data-sync-panel>' +
      '<div class="sync-panel-head">' +
        '<span class="sync-dot is-' + U.escapeAttr(info.state) + '" aria-hidden="true"></span>' +
        '<strong data-panel-state>' + U.escapeHTML(info.text) + '</strong>' +
        '<span class="sync-panel-provider">' + U.escapeHTML(serverLabel()) + '</span>' +
      '</div>' +
      '<dl class="sync-facts">' +
        '<div><dt>存储后端</dt><dd>' +
          '<select class="sync-select" data-sync-provider>' + providerOptions() + '</select>' +
        '</dd></div>' +
        '<div><dt>服务器地址</dt><dd class="sync-facts-field">' + serverField +
          '<button class="btn btn-sm" type="button" data-sync-save-server>保存</button>' +
        '</dd></div>' +
        '<div><dt>上次同步</dt><dd data-panel-lastsync>' + U.escapeHTML(info.lastSyncAt ? (PP.Dates ? PP.Dates.formatSaved(info.lastSyncAt) : info.lastSyncAt) : '还没有同步过') + '</dd></div>' +
        '<div><dt>数据版本</dt><dd data-panel-version>' + U.escapeHTML('v' + info.version) + '</dd></div>' +
        '<div><dt>登录状态</dt><dd data-panel-auth>' + (info.authed ? '已登录' : '未登录') + '</dd></div>' +
      '</dl>' +
      '<p class="sync-panel-error" data-panel-error' + (info.rejected ? '' : ' hidden') + '>' +
        U.escapeHTML(info.rejected
          ? (info.error || '服务器拒绝了同步请求') + '（HTTP ' + (info.rejectedStatus || '?') + '）。自动同步已暂停，处理后可点「立即同步」重试。'
          : '') +
      '</p>' +
      '<div class="sync-panel-actions">' +
        '<button class="btn btn-primary" type="button" data-sync-now>立即同步</button>' +
        '<button class="btn" type="button" data-sync-logout>退出登录（清除本机 token）</button>' +
      '</div>' +
      '<div class="sync-panel-actions">' +
        '<button class="btn btn-danger" type="button" data-sync-force>把本机数据覆盖到服务器</button>' +
      '</div>' +
      '<p class="sync-panel-note">' + U.escapeHTML(
        '同步只涉及结构化数据（每日、习惯、待办、读书、写作、长期任务等）。' +
        '图片 / PDF / Word 附件仍保存在这台设备上，不会上传。'
      ) + '</p>' +
    '</div>';
  }

  function refreshPanel() {
    if (!panel || !panel.root || !panel.root.isConnected) return;
    var info = status();
    var stateEl = panel.root.querySelector('[data-panel-state]');
    if (stateEl) stateEl.textContent = info.text;
    var dot = panel.root.querySelector('.sync-dot');
    if (dot) dot.className = 'sync-dot is-' + info.state;
    var lastSync = panel.root.querySelector('[data-panel-lastsync]');
    if (lastSync) {
      lastSync.textContent = info.lastSyncAt
        ? (PP.Dates ? PP.Dates.formatSaved(info.lastSyncAt) : info.lastSyncAt)
        : '还没有同步过';
    }
    var versionEl = panel.root.querySelector('[data-panel-version]');
    if (versionEl) versionEl.textContent = 'v' + info.version;
    var authEl = panel.root.querySelector('[data-panel-auth]');
    if (authEl) authEl.textContent = info.authed ? '已登录' : '未登录';
    var errorEl = panel.root.querySelector('[data-panel-error]');
    if (errorEl) {
      if (info.rejected) {
        errorEl.hidden = false;
        errorEl.textContent = (info.error || '服务器拒绝了同步请求') +
          '（HTTP ' + (info.rejectedStatus || '?') + '）。自动同步已暂停，处理后可点「立即同步」重试。';
      } else {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
    }
  }

  function bindPanel(root, close) {
    panel = { root: root };
    var info = status();

    var select = root.querySelector('[data-sync-provider]');
    if (select) {
      select.value = info.provider;
      select.addEventListener('change', function () {
        var result = useProvider(select.value);
        if (!result.ok) {
          toast(result.message, 'error');
          select.value = info.provider;
          return;
        }
        if (!isAuthed()) {
          if (PP.gate && typeof PP.gate.open === 'function') PP.gate.open('已切换存储后端，请输入访问密码。');
          return;
        }
        runQuiet(syncNow());
        refreshPanel();
      });
    }

    var saveServer = root.querySelector('[data-sync-save-server]');
    var serverInput = root.querySelector('[data-sync-server]');
    if (saveServer && serverInput) {
      saveServer.addEventListener('click', async function () {
        var result = setServer(serverInput.value);
        if (!result.ok) {
          toast(result.message, 'error');
          return;
        }
        if (result.changed && isAuthed()) {
          var ok = await PP.ui.confirm({
            title: '换一台服务器',
            message: '地址变了，原来那台服务器上的登录状态会失效。现在要<b>退到密码页</b>、用新地址重新登录吗？',
            confirmText: '重新登录',
            cancelText: '稍后'
          });
          if (ok) {
            await logout();
            if (typeof close === 'function') close();
            return;
          }
        }
        toast('服务器地址已保存。', 'success');
        refreshPanel();
      });
    }

    var syncButton = root.querySelector('[data-sync-now]');
    if (syncButton) {
      syncButton.addEventListener('click', async function () {
        syncButton.disabled = true;
        syncButton.classList.add('is-loading');
        try {
          // 手动点按是显式重试：解除"被拒绝"状态
          var result = await syncNow({ force: true });
          if (result && result.ok) toast('同步完成。', 'success', 2200);
        } finally {
          syncButton.disabled = false;
          syncButton.classList.remove('is-loading');
          refreshPanel();
        }
      });
    }

    var logoutButton = root.querySelector('[data-sync-logout]');
    if (logoutButton) {
      logoutButton.addEventListener('click', async function () {
        var ok = await PP.ui.confirm({
          title: '退出登录',
          message: '会清除这台设备上的登录 token，<b>本地数据不会删除</b>。确定退出吗？',
          confirmText: '退出登录',
          cancelText: '取消'
        });
        if (!ok) return;
        if (typeof close === 'function') close();
        await logout();
      });
    }

    var forceButton = root.querySelector('[data-sync-force]');
    if (forceButton) {
      forceButton.addEventListener('click', async function () {
        var ok = await PP.ui.confirm({
          title: '把本机数据覆盖到服务器',
          message: '这是危险操作：服务器上的数据会被这台设备的内容<b>整份替换</b>，' +
            '其他设备同步后会变成这里的版本，它们云端独有、你本机没有的记录会丢失。<br><br>确定继续吗？',
          confirmText: '继续',
          cancelText: '取消'
        });
        if (!ok) return;
        var second = await PP.ui.confirm({
          title: '再确认一次',
          message: '最后一次确认：服务器数据即将被本机内容覆盖，且不可撤销。',
          confirmText: '确认覆盖服务器',
          cancelText: '返回'
        });
        if (!second) return;
        forceButton.disabled = true;
        forceButton.classList.add('is-loading');
        try {
          var result = await forcePush();
          if (result.ok) toast('已用本机数据覆盖服务器（v' + result.version + '）。', 'success');
        } finally {
          forceButton.disabled = false;
          forceButton.classList.remove('is-loading');
          refreshPanel();
        }
      });
    }
  }

  async function forcePush() {
    if (isLocalMode()) {
      setStatus('local', localModeText());
      return { ok: false };
    }
    if (!isAuthed()) {
      toast('请先登录后再同步。', 'warning');
      return { ok: false };
    }
    if (state.busy) {
      state.queued = true;
      return { ok: false };
    }
    clearRejected();
    var current = currentProvider();
    state.busy = true;
    setStatus('syncing', '同步中');
    try {
      var payload = collectPayload();
      for (var attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt += 1) {
        var pulled = await guarded(function () { return current.provider.pull(readConfig()); });
        if (!pulled.ok) return { ok: false };
        var version = pulled.value && pulled.value.version != null ? pulled.value.version : 0;
        state.version = version;
        var pushed = await guarded(function () {
          return current.provider.push(readConfig(), payload, version);
        });
        if (pushed.ok) {
          var result = pushed.value || {};
          state.version = result.version == null ? version + 1 : result.version;
          state.lastSyncAt = result.updatedAt || new Date().toISOString();
          state.pendingPush = false;
          writeConfig({
            version: state.version,
            lastSyncAt: state.lastSyncAt,
            lastPushed: stable(payload)
          });
          setStatus('idle', '已同步');
          return { ok: true, version: state.version };
        }
        if (pushed.reason !== 'conflict') return { ok: false };
      }
      toast('服务器一直在被别人更新，稍后再试一次。', 'warning');
      return { ok: false };
    } finally {
      finishBusy();
    }
  }

  function openPanel() {
    try {
      if (PP.ui && typeof PP.ui.closeMenu === 'function') PP.ui.closeMenu();
    } catch (error) {
      /* 忽略 */
    }
    if (isFileMode()) {
      PP.ui.modal({
        title: '同步状态',
        subtitle: '当前是本地模式',
        narrow: true,
        body: '<div class="sync-panel" data-sync-panel><p class="sync-choice-text">' +
          '你是直接双击 <code>index.html</code> 打开的，浏览器不允许在 <code>file://</code> 下联网同步。' +
          '用 <code>http://</code> 地址打开（见 server/README.md）就能开启多设备同步。</p></div>',
        footer: '<button class="btn" type="button" data-modal-close>关闭</button>'
      });
      return;
    }
    if (state.backend === 'none') {
      PP.ui.modal({
        title: '同步状态',
        subtitle: '当前是纯静态部署',
        narrow: true,
        body: '<div class="sync-panel" data-sync-panel>' +
          '<div class="sync-panel-head">' +
            '<span class="sync-dot is-local" aria-hidden="true"></span>' +
            '<strong>' + U.escapeHTML(STATIC_TEXT) + '</strong>' +
          '</div>' +
          '<p class="sync-choice-text">当前是纯静态部署，数据只存在这台设备；' +
            '要同步请按 <code>server/README.md</code> 部署 <code>server/planner-server.py</code>，' +
            '或在「设置 → 同步与账号」里把存储后端换成 GitHub 私有仓库。</p>' +
          '<p class="sync-panel-note">本地的一切照旧可用：关掉网络、换个浏览器都不会丢数据，' +
            '只是不会自动同步到其他设备。</p>' +
        '</div>',
        footer: '<button class="btn" type="button" data-modal-close>关闭</button>'
      });
      return;
    }
    PP.ui.modal({
      title: '同步状态',
      subtitle: '同一份网址 + 同一台服务器 = 手机和电脑看到同样的内容',
      narrow: true,
      body: panelHtml(),
      footer: '<button class="btn" type="button" data-modal-close>关闭</button>',
      onMount: function (body, close) {
        bindPanel(body, close);
      },
      onClose: function () { panel = null; }
    });
  }

  /* ---------------------------------------------------------------- 启动 */

  function wrapStore() {
    if (!PP.store) return;
    if (PP.store.__syncWrapped) {
      if (!rawWrite && PP.store.write) rawWrite = PP.store.write;
      return;
    }
    rawWrite = PP.store.write;
    PP.store.write = function () {
      var result = rawWrite.apply(PP.store, arguments);
      try {
        scheduleSync();
      } catch (error) {
        console.warn('[拾光] 同步调度失败：', error);
      }
      return result;
    };
    PP.store.__syncWrapped = true;
  }

  function bindEvents() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') {
        // 切走时先把还在防抖队列里的改动送出去
        if (pushTimer) {
          window.clearTimeout(pushTimer);
          pushTimer = null;
          if (state.pendingPush && isAuthed() && !state.busy) runQuiet(push());
        }
        return;
      }
      if (isFileMode() || !isAuthed()) return;
      runQuiet(syncNow({ silent: true }));
    });
    window.addEventListener('online', function () {
      if (isFileMode() || !isAuthed()) return;
      runQuiet(syncNow({ silent: true }));
    });
    window.addEventListener('offline', function () {
      if (isFileMode() || !isAuthed()) return;
      setStatus('offline', '离线');
    });
    window.addEventListener('beforeunload', function () {
      // 页面要关了：把还在防抖队列里的改动立刻推一次（fetch 可能被浏览器中断，尽力而为）
      if (pushTimer) {
        window.clearTimeout(pushTimer);
        pushTimer = null;
        if (state.pendingPush && isAuthed()) runQuiet(push());
      }
    });
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-open-sync]');
      if (!trigger) return;
      event.preventDefault();
      openPanel();
    });
    document.querySelectorAll('[data-sync-status]').forEach(function (el) {
      el.addEventListener('click', function (event) {
        event.preventDefault();
        openPanel();
      });
    });
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (isFileMode() || !isAuthed() || state.busy || state.dialogOpen) return;
      runQuiet(pull({ silent: true }));
    }, PULL_INTERVAL);
  }

  function start() {
    if (state.started) return;
    state.started = true;
    wrapStore();
    bindEvents();

    var config = readConfig();
    state.version = config.version || 0;
    state.lastSyncAt = config.lastSyncAt || '';

    if (isLocalMode()) {
      setStatus('local', localModeText());
      return;
    }
    if (!isAuthed()) {
      setStatus('idle', '未登录');
      return;
    }
    setStatus('syncing', '同步中');
    runQuiet(syncNow({ silent: true }));
  }

  /* ---------------------------------------------------------------- 对外接口 */

  PP.sync = {
    // —— 固定签名（验收脚本依赖）——
    login: login,
    logout: logout,
    pull: pull,
    push: push,
    syncNow: syncNow,
    status: status,
    isAuthed: isAuthed,
    // —— 后端切换 ——
    useProvider: useProvider,
    provider: provider,
    providers: providers,
    // —— 辅助 ——
    start: start,
    openPanel: openPanel,
    setServer: setServer,
    config: readConfig,
    loginRequired: function () { return !isAuthed(); },
    keys: SYNC_KEYS.slice(),
    refreshStatus: renderStatus,
    forcePush: forcePush,
    // —— 后端可用性（静态托管兜底用）——
    whenBackendReady: whenBackendReady,
    backendAvailable: backendAvailable,
    isLocalMode: isLocalMode,
    resetProbe: resetProbe,
    // —— 给 GitHub provider 用的小工具（provider 文件不必自己再写一份） ——
    helpers: {
      failure: failure,
      stable: stable,
      toast: toast,
      collectPayload: collectPayload,
      normalizeVersion: normalizeVersion
    },
    getProvider: function (name) {
      if (name) return providers[name] || null;
      return providers[readConfig().provider] || null;
    },
    registerProvider: function (id, implementation) {
      if (!id || !implementation) return false;
      providers[id] = implementation;
      if (!implementation.id) implementation.id = id;
      return true;
    }
  };
}());
