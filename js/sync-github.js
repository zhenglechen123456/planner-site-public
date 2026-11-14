/* ==========================================================================
   GitHub 私有仓库存储后端（PP.syncProviders.github）
   --------------------------------------------------------------------------
   站点托管在 GitHub Pages / Netlify 时，没有 /api/*，用这个后端把数据放私有仓库：
     · 文档：{path}（默认 data/planner.json），PBKDF2-SHA256 + AES-GCM 加密后入仓
     · 附件：{attachmentsDir}/{sha256}.{ext}，同一密码派生的子密钥加密，按需下载
   约定（由 js/sync.js 统一处理）：
     · throw err.code = 'offline' / 'auth' / 'conflict' / 'badrequest'
     · conflict 时 err.current = { payload, version }
   依赖：WebCrypto（https 或 localhost）。file:// 下不启用。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;

  var DEFAULT_API = 'https://api.github.com';
  var KDF_ITER = 150000;
  var KDF_ALGO = 'PBKDF2-SHA256';
  var ATT_SUB_SALT = '|shiguang-attachments';
  var MAX_ATTACHMENT = 20 * 1024 * 1024;     // 单个附件上限 20MB
  var REQUEST_TIMEOUT = 15000;
  var PWD_KEY = 'ppsync.github.pwd';         // sessionStorage：加密密码（仅会话）
  var TOKEN_SESSION_KEY = 'ppsync.github.token';
  var KDF_CACHE_KEY = 'ppsync.github.kdf';   // 本地记住 salt，避免文档还没创建时换 salt
  var REMOTE_INDEX_KEY = 'ppsync.github.remote'; // 已确认上传过的附件路径

  var keys = { password: '', kdf: null, docKey: null, attKey: null };

  /* ---------------------------------------------------------------- 基础工具 */

  function failure(code, message, extra) {
    if (PP.sync && PP.sync.helpers && typeof PP.sync.helpers.failure === 'function') {
      return PP.sync.helpers.failure(code, message, extra);
    }
    var error = new Error(message || '同步失败');
    error.code = code;
    if (extra) Object.keys(extra).forEach(function (key) { error[key] = extra[key]; });
    return error;
  }

  function toast(message, type) {
    if (PP.sync && PP.sync.helpers && typeof PP.sync.helpers.toast === 'function') {
      PP.sync.helpers.toast(message, type);
    } else if (PP.ui && typeof PP.ui.toast === 'function') {
      PP.ui.toast(message, type || 'info');
    }
  }

  function subtle() {
    return window.crypto && window.crypto.subtle ? window.crypto.subtle : null;
  }

  function requireCrypto() {
    if (!subtle() || typeof window.TextEncoder !== 'function') {
      throw failure('config', '这个浏览器环境不支持 WebCrypto，GitHub 加密同步需要 https 或 localhost 打开。');
    }
  }

  function randomBytes(length) {
    var bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    return bytes;
  }

  function bytesToBase64(bytes) {
    var binary = '';
    var chunk = 0x8000;
    for (var index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return window.btoa(binary);
  }

  function base64ToBytes(text) {
    var binary = window.atob(String(text || '').replace(/\s+/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function utf8ToBase64(text) {
    return bytesToBase64(new TextEncoder().encode(String(text)));
  }

  function base64ToUtf8(text) {
    return new TextDecoder().decode(base64ToBytes(text));
  }

  async function sha256Hex(bytes) {
    var digest = await subtle().digest('SHA-256', bytes);
    var view = new Uint8Array(digest);
    var out = '';
    for (var index = 0; index < view.length; index += 1) {
      out += (view[index] < 16 ? '0' : '') + view[index].toString(16);
    }
    return out;
  }

  async function deriveAesKey(password, saltBytes, iterations) {
    var subtleCrypto = subtle();
    var base = await subtleCrypto.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveKey']);
    return subtleCrypto.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function concatBytes(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  /* ---------------------------------------------------------------- 密码与密钥 */

  function rememberPassword(password) {
    keys.password = String(password || '');
    try {
      if (keys.password) window.sessionStorage.setItem(PWD_KEY, utf8ToBase64(keys.password));
      else window.sessionStorage.removeItem(PWD_KEY);
    } catch (error) {
      /* 无痕模式可能禁写 */
    }
  }

  function currentPassword() {
    if (keys.password) return keys.password;
    try {
      var raw = window.sessionStorage.getItem(PWD_KEY);
      if (raw) {
        keys.password = base64ToUtf8(raw);
        return keys.password;
      }
    } catch (error) {
      /* 忽略 */
    }
    return '';
  }

  function forgetPassword() {
    keys.password = '';
    keys.docKey = null;
    keys.attKey = null;
    try { window.sessionStorage.removeItem(PWD_KEY); } catch (error) { /* 忽略 */ }
  }

  function newKdf() {
    return { algo: KDF_ALGO, iter: KDF_ITER, salt: bytesToBase64(randomBytes(16)) };
  }

  function kdfValid(kdf) {
    return !!(kdf && typeof kdf === 'object' && typeof kdf.salt === 'string' && kdf.salt &&
      Number(kdf.iter) >= 1);
  }

  async function deriveKeys(password, kdf) {
    requireCrypto();
    var salt = base64ToBytes(kdf.salt);
    var iterations = Math.max(1000, Math.min(1000000, Number(kdf.iter) || KDF_ITER));
    if (keys.docKey && keys.kdf && keys.kdf.salt === kdf.salt && Number(keys.kdf.iter) === iterations) {
      return { docKey: keys.docKey, attKey: keys.attKey };
    }
    var docKey = await deriveAesKey(password, salt, iterations);
    var attSalt = concatBytes(salt, new TextEncoder().encode(ATT_SUB_SALT));
    var attKey = await deriveAesKey(password, attSalt, iterations);
    keys.kdf = { algo: KDF_ALGO, iter: iterations, salt: kdf.salt };
    keys.docKey = docKey;
    keys.attKey = attKey;
    return { docKey: docKey, attKey: attKey };
  }

  function readKdfCache() {
    try {
      var raw = window.localStorage.getItem(KDF_CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      return kdfValid(obj) ? obj : null;
    } catch (error) {
      return null;
    }
  }

  function writeKdfCache(kdf) {
    try {
      if (kdfValid(kdf)) window.localStorage.setItem(KDF_CACHE_KEY, JSON.stringify(kdf));
    } catch (error) { /* 忽略 */ }
  }

  /* ---------------------------------------------------------------- 加密信封 */

  async function encryptEnvelope(payload, docKey, kdf) {
    var iv = randomBytes(12);
    var plain = new TextEncoder().encode(JSON.stringify({ payload: payload, at: new Date().toISOString() }));
    var cipher = await subtle().encrypt({ name: 'AES-GCM', iv: iv }, docKey, plain);
    return {
      v: 1,
      kdf: { algo: KDF_ALGO, iter: Number(kdf.iter) || KDF_ITER, salt: kdf.salt },
      iv: bytesToBase64(iv),
      ct: bytesToBase64(new Uint8Array(cipher))
    };
  }

  function parseEnvelope(bytes) {
    var text;
    try { text = new TextDecoder().decode(bytes); } catch (error) { return null; }
    var obj;
    try { obj = JSON.parse(text); } catch (error) { return null; }
    if (!obj || typeof obj !== 'object' || !obj.ct || !obj.iv || !kdfValid(obj.kdf)) return null;
    return obj;
  }

  async function decryptEnvelope(envelope, docKey) {
    var iv = base64ToBytes(envelope.iv);
    var cipher = base64ToBytes(envelope.ct);
    var plain = await subtle().decrypt({ name: 'AES-GCM', iv: iv }, docKey, cipher);
    var text = new TextDecoder().decode(plain);
    var obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object') return null;
    return obj.payload && typeof obj.payload === 'object' ? obj.payload : null;
  }

  async function encryptBytes(attKey, bytes) {
    var iv = randomBytes(12);
    var cipher = await subtle().encrypt({ name: 'AES-GCM', iv: iv }, attKey, bytes);
    // 自描述二进制头：'PPA1' + 12 字节 IV + 密文
    var body = new Uint8Array(cipher);
    var out = new Uint8Array(4 + 12 + body.length);
    out.set([0x50, 0x50, 0x41, 0x31], 0);
    out.set(iv, 4);
    out.set(body, 16);
    return out;
  }

  async function decryptBytes(attKey, bytes) {
    if (!bytes || bytes.length < 20) throw new Error('附件密文长度异常');
    if (!(bytes[0] === 0x50 && bytes[1] === 0x50 && bytes[2] === 0x41 && bytes[3] === 0x31)) {
      throw new Error('附件密文格式不认识');
    }
    var iv = bytes.subarray(4, 16);
    var body = bytes.subarray(16);
    var plain = await subtle().decrypt({ name: 'AES-GCM', iv: iv }, attKey, body);
    return new Uint8Array(plain);
  }

  /* ---------------------------------------------------------------- GitHub API */

  function normalizePath(value) {
    return String(value || '').replace(/^\/+/, '').replace(/\/+$/, '');
  }

  function tokenOf(cfgGithub) {
    var token = String((cfgGithub && cfgGithub.token) || '');
    if (token) return token;
    try { return window.sessionStorage.getItem(TOKEN_SESSION_KEY) || ''; } catch (error) { return ''; }
  }

  function ghConfig(config) {
    var gh = (config && config.github) || {};
    return {
      owner: String(gh.owner || '').trim(),
      repo: String(gh.repo || '').trim(),
      branch: String(gh.branch || 'main').trim() || 'main',
      path: normalizePath(gh.path || 'data/planner.json') || 'data/planner.json',
      attachmentsDir: normalizePath(gh.attachmentsDir || 'data/attachments'),
      apiBase: String(gh.apiBase || DEFAULT_API).replace(/\/+$/, '') || DEFAULT_API,
      token: tokenOf(gh)
    };
  }

  function contentsUrl(gh, path) {
    return gh.apiBase + '/repos/' + encodeURIComponent(gh.owner) + '/' + encodeURIComponent(gh.repo) +
      '/contents/' + String(path).split('/').map(encodeURIComponent).join('/');
  }

  async function ghFetch(gh, method, url, body) {
    var headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (gh.token) headers.Authorization = 'Bearer ' + gh.token;
    var init = { method: method, headers: headers, cache: 'no-store', credentials: 'omit' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
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
      response = await window.fetch(url, init);
    } catch (error) {
      var aborted = error && error.name === 'AbortError';
      throw failure('offline', aborted ? 'GitHub 请求超时' : '连不上 GitHub（检查网络或 apiBase）');
    } finally {
      if (timer) window.clearTimeout(timer);
    }
    var text = '';
    try { text = await response.text(); } catch (error) { text = ''; }
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (error) { data = null; }
    }
    return { status: response.status, data: data };
  }

  function apiMessage(response, fallback) {
    if (response && response.data && typeof response.data.message === 'string') return response.data.message;
    return fallback;
  }

  function assertOk(response, what) {
    if (response.status >= 200 && response.status < 300) return response;
    if (response.status === 401) {
      throw failure('auth', 'GitHub 令牌无效或已过期（401）。请在设置里更新 token。');
    }
    if (response.status === 403) {
      throw failure('badrequest', 'GitHub 拒绝了请求（403）：' + apiMessage(response, '权限不足或触发了限流'));
    }
    if (response.status === 404) {
      throw failure('badrequest', 'GitHub 返回 404：仓库 / 路径不存在，或 token 没有这个仓库的权限。');
    }
    throw failure('http', what + ' 失败（HTTP ' + response.status + '）：' + apiMessage(response, '未知原因'));
  }

  async function getFile(gh, path) {
    var response = await ghFetch(gh, 'GET', contentsUrl(gh, path) + '?ref=' + encodeURIComponent(gh.branch));
    if (response.status === 404) return null;
    assertOk(response, '读取 ' + path);
    var data = response.data;
    if (!data || data.type !== 'file' || typeof data.content !== 'string') {
      throw failure('badrequest', 'GitHub 返回的内容不是文件：' + path);
    }
    return { sha: String(data.sha || ''), bytes: base64ToBytes(data.content), size: Number(data.size) || 0 };
  }

  async function putFile(gh, path, bytes, message, sha) {
    var body = { message: message, content: bytesToBase64(bytes), branch: gh.branch };
    if (sha) body.sha = sha;
    return ghFetch(gh, 'PUT', contentsUrl(gh, path), body);
  }

  /* ---------------------------------------------------------------- 附件 */

  function extOf(meta) {
    var name = String((meta && meta.name) || '');
    var match = /\.([A-Za-z0-9]{1,8})$/.exec(name);
    if (match) return match[1].toLowerCase();
    var type = String((meta && meta.type) || '');
    if (/^image\/png/.test(type)) return 'png';
    if (/^image\/jpe?g/.test(type)) return 'jpg';
    if (/^image\/gif/.test(type)) return 'gif';
    if (/^image\/webp/.test(type)) return 'webp';
    if (/pdf/.test(type)) return 'pdf';
    if (/wordprocessingml/.test(type)) return 'docx';
    if (/msword/.test(type)) return 'doc';
    return 'bin';
  }

  function dataUrlToBytes(dataUrl) {
    var comma = String(dataUrl || '').indexOf(',');
    if (comma < 0) throw new Error('附件数据格式无效');
    return base64ToBytes(String(dataUrl).slice(comma + 1));
  }

  function bytesToDataUrl(bytes, mime) {
    return 'data:' + (mime || 'application/octet-stream') + ';base64,' + bytesToBase64(bytes);
  }

  function collectMetas(payload) {
    var out = [];
    function take(list, owner) {
      (Array.isArray(list) ? list : []).forEach(function (meta) {
        if (meta && meta.id) out.push({ meta: meta, owner: owner });
      });
    }
    (Array.isArray(payload && payload.books) ? payload.books : []).forEach(function (book) { take(book.attachments, 'book'); });
    (Array.isArray(payload && payload.writings) ? payload.writings : []).forEach(function (item) { take(item.attachments, 'writing'); });
    (Array.isArray(payload && payload.tasks) ? payload.tasks : []).forEach(function (task) {
      take(task.attachments, 'task');
      (Array.isArray(task.periods) ? task.periods : []).forEach(function (period) { take(period.attachments, 'period'); });
    });
    return out;
  }

  async function loadLocalRecord(meta) {
    if (!PP.attachments || typeof PP.attachments._loadRecord !== 'function') return null;
    try { return await PP.attachments._loadRecord(meta); } catch (error) { return null; }
  }

  function readRemoteIndex() {
    try {
      var raw = window.localStorage.getItem(REMOTE_INDEX_KEY);
      var obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === 'object' ? obj : {};
    } catch (error) {
      return {};
    }
  }

  function markRemote(path) {
    try {
      var index = readRemoteIndex();
      index[path] = 1;
      var trimmed = {};
      var keys = Object.keys(index);
      keys.slice(Math.max(0, keys.length - 500)).forEach(function (key) { trimmed[key] = 1; });
      window.localStorage.setItem(REMOTE_INDEX_KEY, JSON.stringify(trimmed));
    } catch (error) { /* 忽略 */ }
  }

  function attachmentPath(gh, meta) {
    var sha = String(meta && meta.sha256 ? meta.sha256 : '');
    if (!sha) return '';
    return (gh.attachmentsDir ? gh.attachmentsDir + '/' : '') + sha + '.' + extOf(meta);
  }

  // 把算出来的 sha256 回写到 localStorage 里的附件 meta（失败不影响同步）
  function patchLocalHashes(hashes) {
    var ids = Object.keys(hashes || {});
    if (!ids.length) return;
    function apply(list) {
      var changed = false;
      (Array.isArray(list) ? list : []).forEach(function (meta) {
        if (meta && meta.id && hashes[meta.id] && meta.sha256 !== hashes[meta.id]) {
          meta.sha256 = hashes[meta.id];
          changed = true;
        }
      });
      return changed;
    }
    try {
      if (PP.data) {
        var books = PP.data.getBooks();
        var bookChanged = false;
        books.forEach(function (book) { if (apply(book.attachments)) bookChanged = true; });
        if (bookChanged) PP.data.saveBooks(books);
        var writings = PP.data.getWritings();
        var writingChanged = false;
        writings.forEach(function (item) { if (apply(item.attachments)) writingChanged = true; });
        if (writingChanged) PP.data.saveWritings(writings);
      }
      if (PP.taskData && typeof PP.taskData.getTasks === 'function' && typeof PP.taskData.saveTasks === 'function') {
        var tasks = PP.taskData.getTasks();
        var taskChanged = false;
        tasks.forEach(function (task) {
          if (apply(task.attachments)) taskChanged = true;
          (task.periods || []).forEach(function (period) { if (apply(period.attachments)) taskChanged = true; });
        });
        if (taskChanged) PP.taskData.saveTasks(tasks);
      }
    } catch (error) {
      console.warn('[拾光] 回写附件 sha256 失败（不影响同步）：', error);
    }
  }

  /* ---------------------------------------------------------------- provider */

  var provider = {
    id: 'github',
    label: 'GitHub 私有仓库',

    isAuthed: function (config) {
      var gh = ghConfig(config);
      if (!gh.owner || !gh.repo) return false;
      if (!currentPassword()) return false;
      return true;
    },

    describe: function (config) {
      var gh = ghConfig(config);
      if (!gh.owner || !gh.repo) return 'github.com（还没填 owner / repo）';
      return 'github.com/' + gh.owner + '/' + gh.repo + '@' + gh.branch + ' · ' + gh.path;
    },

    login: async function (config, password) {
      var gh = ghConfig(config);
      if (!gh.owner || !gh.repo) {
        return { ok: false, message: '请先在「设置 → 同步与账号」里填写 GitHub 的 owner 与 repo。' };
      }
      if (!gh.token) {
        return { ok: false, message: '还没有填 GitHub 令牌（PAT）。私有仓库需要 fine-grained token 的 contents 读写权限。' };
      }
      try {
        requireCrypto();
      } catch (error) {
        return { ok: false, message: error.message };
      }
      if (typeof password !== 'string' || password.length < 6) {
        return { ok: false, message: '加密密码至少 6 位（忘记密码就解不开云端数据，请记牢）。' };
      }

      var remote;
      try {
        remote = await getFile(gh, gh.path);
      } catch (error) {
        return { ok: false, message: (error && error.message) || '连不上 GitHub。' };
      }

      rememberPassword(password);
      if (!remote) {
        // 首次：云端还没有数据 → 记住密码，先分配一个 salt
        var freshKdf = readKdfCache() || newKdf();
        try {
          await deriveKeys(password, freshKdf);
        } catch (error) {
          forgetPassword();
          return { ok: false, message: '本地加密初始化失败：' + ((error && error.message) || '未知原因') };
        }
        writeKdfCache(freshKdf);
        storeTokenByPreference(config, gh);
        return { ok: true };
      }

      var envelope = parseEnvelope(remote.bytes);
      if (!envelope) {
        forgetPassword();
        return { ok: false, message: '云端文件不是拾光日程的加密数据（格式不认识）。请确认 path 指向 data/planner.json。' };
      }
      try {
        var derived = await deriveKeys(password, envelope.kdf);
        await decryptEnvelope(envelope, derived.docKey);
      } catch (error) {
        forgetPassword();
        return { ok: false, message: '密码不正确，或这份数据是用别的密码加密的。' };
      }
      writeKdfCache(envelope.kdf);
      storeTokenByPreference(config, gh);
      return { ok: true };
    },

    pull: async function (config) {
      var gh = ghConfig(config);
      if (!gh.owner || !gh.repo) throw failure('config', '还没配置 GitHub 仓库（owner / repo）。');
      var remote = await getFile(gh, gh.path);
      if (!remote) return { payload: null, version: 0, updatedAt: new Date().toISOString() };

      var envelope = parseEnvelope(remote.bytes);
      if (!envelope) throw failure('badrequest', '云端文件不是拾光日程的加密数据（格式不认识）。');
      var password = currentPassword();
      if (!password) throw failure('auth', '需要重新输入加密密码。');

      writeKdfCache(envelope.kdf);
      var derived;
      try {
        derived = await deriveKeys(password, envelope.kdf);
      } catch (error) {
        throw failure('http', '本地加密计算失败：' + ((error && error.message) || '未知原因'));
      }
      var payload;
      try {
        payload = await decryptEnvelope(envelope, derived.docKey);
      } catch (error) {
        forgetPassword();
        throw failure('auth', '密码不正确，或这份数据是用别的密码加密的。');
      }
      return { payload: payload, version: remote.sha, updatedAt: new Date().toISOString() };
    },

    push: async function (config, payload, baseVersion) {
      var gh = ghConfig(config);
      if (!gh.owner || !gh.repo) throw failure('config', '还没配置 GitHub 仓库（owner / repo）。');
      var password = currentPassword();
      if (!password) throw failure('auth', '需要重新输入加密密码。');

      var expectedSha = typeof baseVersion === 'string' ? baseVersion : '';
      var remote = await getFile(gh, gh.path);
      var envelope = remote ? parseEnvelope(remote.bytes) : null;

      if (remote && !envelope) {
        throw failure('badrequest', '云端文件不是拾光日程的加密数据，为了不覆盖它，已停止上传。');
      }
      // 冲突判定：云端内容与"我以为的版本"不一致
      if (remote) {
        if (!expectedSha || remote.sha !== expectedSha) {
          throw await conflictError(gh, password, remote, envelope);
        }
      } else if (expectedSha) {
        // 本机以为有文件，云端却没了（被删 / 换了分支）
        throw failure('conflict', '云端文件已经不存在了。', { current: { payload: null, version: 0 } });
      }

      var kdf = envelope ? envelope.kdf : (readKdfCache() || newKdf());
      var derived;
      try {
        derived = await deriveKeys(password, kdf);
      } catch (error) {
        throw failure('http', '本地加密计算失败：' + ((error && error.message) || '未知原因'));
      }

      // 1) 附件：补 sha256、把云端还没有的传上去（失败只提示，不挡文档）
      var nextPayload = payload;
      try {
        nextPayload = await syncAttachments(gh, payload, derived.attKey, password, kdf);
      } catch (error) {
        console.warn('[拾光] 附件同步失败（文档仍会上传）：', error);
        toast('附件同步失败：' + ((error && error.message) || '未知原因'), 'warning');
      }

      // 2) 文档：加密后 PUT
      var envelopeOut = await encryptEnvelope(nextPayload, derived.docKey, kdf);
      var bodyBytes = new TextEncoder().encode(JSON.stringify(envelopeOut));
      var response = await putFile(gh, gh.path, bodyBytes,
        'planner: sync at ' + new Date().toISOString(), remote ? remote.sha : '');

      if (response.status === 409 || response.status === 422) {
        // sha 不匹配（另一台设备刚提交）→ 重新拉一次，交给上层弹窗
        var fresh = await getFile(gh, gh.path);
        var freshEnvelope = fresh ? parseEnvelope(fresh.bytes) : null;
        var currentPayload = null;
        if (freshEnvelope) {
          try {
            var again = await deriveKeys(password, freshEnvelope.kdf);
            currentPayload = await decryptEnvelope(freshEnvelope, again.docKey);
          } catch (error) {
            currentPayload = null;
          }
        }
        throw failure('conflict', 'GitHub 上的文件已被另一台设备更新。', {
          current: {
            payload: currentPayload,
            version: fresh ? fresh.sha : 0,
            updatedAt: new Date().toISOString()
          }
        });
      }
      assertOk(response, '上传 ' + gh.path);

      writeKdfCache(kdf);
      var newSha = String((response.data && response.data.content && response.data.content.sha) || '');
      return { version: newSha, updatedAt: new Date().toISOString() };
    },

    logout: async function (config) {
      forgetPassword();
      try { window.sessionStorage.removeItem(TOKEN_SESSION_KEY); } catch (error) { /* 忽略 */ }
      var gh = (config && config.github) || {};
      if (gh.token) {
        // 令牌是否保留由「记住这台设备 7 天」决定：不记住就把落盘的清掉
        if (!config.remember && PP.sync && typeof PP.sync.useProvider === 'function') {
          PP.sync.useProvider('github', { github: { token: '' } });
        }
      }
      return { ok: true };
    },

    // 设置面板里的「测试连接」
    testConnection: async function (config) {
      var gh = ghConfig(config);
      if (!gh.owner || !gh.repo) return { ok: false, message: '请先填写 owner 和 repo。' };
      if (!gh.token) return { ok: false, message: '请先填写 GitHub 令牌（PAT）。' };
      try {
        var response = await ghFetch(gh, 'GET',
          gh.apiBase + '/repos/' + encodeURIComponent(gh.owner) + '/' + encodeURIComponent(gh.repo));
        if (response.status === 200 && response.data) {
          return {
            ok: true,
            message: '连接正常：' + (response.data.full_name || (gh.owner + '/' + gh.repo)) +
              '（默认分支 ' + (response.data.default_branch || '未知') + '）'
          };
        }
        if (response.status === 401) return { ok: false, message: '令牌无效或已过期（401）。' };
        if (response.status === 404) return { ok: false, message: '仓库不存在，或令牌没有这个仓库的权限（404）。' };
        if (response.status === 403) return { ok: false, message: '权限不足或触发限流（403）：' + apiMessage(response, '') };
        return { ok: false, message: 'GitHub 返回 HTTP ' + response.status + '：' + apiMessage(response, '未知原因') };
      } catch (error) {
        return { ok: false, message: (error && error.message) || '连接失败。' };
      }
    },

    // 附件按需下载：给附件预览用的钩子
    downloadAttachment: async function (meta) {
      var gh = ghConfig(PP.sync.config());
      var password = currentPassword();
      if (!password) throw failure('auth', '需要重新输入加密密码。');
      var path = attachmentPath(gh, meta);
      if (!path) throw failure('badrequest', '这个附件没有内容哈希，无法定位云端文件。');
      var kdf = readKdfCache();
      if (!kdf) throw failure('badrequest', '本机没有记住加密参数，请先登录一次同步。');
      var derived = await deriveKeys(password, kdf);
      var file = await getFile(gh, path);
      if (!file) return null;
      var plain = await decryptBytes(derived.attKey, file.bytes);
      var record = {
        id: String(meta.id),
        name: String(meta.name || 'attachment'),
        size: plain.length,
        type: String(meta.type || 'application/octet-stream'),
        dataUrl: bytesToDataUrl(plain, meta.type),
        createdAt: meta.createdAt || new Date().toISOString(),
        storage: 'idb'
      };
      if (PP.attachments && typeof PP.attachments.importRecords === 'function') {
        await PP.attachments.importRecords([record]);
      }
      return record;
    }
  };

  /* ---------------------------------------------------------------- 内部：冲突 */

  async function conflictError(gh, password, remote, envelope) {
    var currentPayload = null;
    if (envelope) {
      try {
        var derived = await deriveKeys(password, envelope.kdf);
        currentPayload = await decryptEnvelope(envelope, derived.docKey);
      } catch (error) {
        currentPayload = null;
      }
    }
    return failure('conflict', 'GitHub 上的文件已被另一台设备更新。', {
      current: {
        payload: currentPayload,
        version: remote ? remote.sha : 0,
        updatedAt: new Date().toISOString()
      }
    });
  }

  /* ---------------------------------------------------------------- 内部：附件上传 */

  async function syncAttachments(gh, payload, attKey, password, kdf) {
    if (!PP.attachments || typeof PP.attachments._loadRecord !== 'function') return payload;
    var metas = collectMetas(payload);
    if (!metas.length) return payload;

    var hashes = {};
    var skipped = [];
    var uploaded = 0;
    var remoteIndex = readRemoteIndex();

    for (var index = 0; index < metas.length; index += 1) {
      var meta = metas[index].meta;
      var bytes = null;

      if (!meta.sha256) {
        var record = await loadLocalRecord(meta);
        if (record && record.dataUrl) {
          try {
            bytes = dataUrlToBytes(record.dataUrl);
            var hash = await sha256Hex(bytes);
            meta.sha256 = hash;                 // 写进将要上传的文档，其他设备才认得出
            hashes[meta.id] = hash;
          } catch (error) {
            console.warn('[拾光] 计算附件哈希失败：', meta.name, error);
            continue;
          }
        }
      }
      if (!meta.sha256) continue;               // 本机没有文件、也没有哈希 → 跳过

      var size = Number(meta.size) || (bytes ? bytes.length : 0);
      if (size > MAX_ATTACHMENT) {
        skipped.push(meta.name || meta.id);
        continue;
      }
      var path = attachmentPath(gh, meta);
      if (!path) continue;
      if (remoteIndex[path]) continue;          // 本会话/本机已确认上传过

      var existing = await getFile(gh, path);
      if (existing) {
        remoteIndex[path] = 1;
        markRemote(path);
        continue;
      }
      if (!bytes) {
        var again = await loadLocalRecord(meta);
        if (!again || !again.dataUrl) continue;  // 本机没有文件，无法上传
        bytes = dataUrlToBytes(again.dataUrl);
      }
      var cipher = await encryptBytes(attKey, bytes);
      var response = await putFile(gh, path, cipher, 'attachment: ' + meta.sha256);
      if (response.status === 409 || response.status === 422) {
        // 同一内容别人刚传过（内容寻址，等价于已存在）
        remoteIndex[path] = 1;
        markRemote(path);
        continue;
      }
      assertOk(response, '上传附件 ' + path);
      remoteIndex[path] = 1;
      markRemote(path);
      uploaded += 1;
    }

    if (Object.keys(hashes).length) patchLocalHashes(hashes);
    if (skipped.length) {
      toast('有 ' + skipped.length + ' 个附件超过 20MB，已跳过上传：' + skipped.slice(0, 3).join('、'), 'warning', 7000);
    }
    if (uploaded) toast('已上传 ' + uploaded + ' 个附件到 GitHub。', 'success', 2600);
    return payload;
  }

  /* ---------------------------------------------------------------- 内部：token 存哪 */

  function storeTokenByPreference(config, gh) {
    var remember = !!(config && config.remember);
    try {
      if (remember) {
        window.sessionStorage.removeItem(TOKEN_SESSION_KEY);
      } else if (gh.token) {
        // 不记住这台设备：PAT 只放会话，别落盘
        window.sessionStorage.setItem(TOKEN_SESSION_KEY, gh.token);
        if (PP.sync && typeof PP.sync.useProvider === 'function') {
          PP.sync.useProvider('github', { github: { token: '' } });
        }
      }
    } catch (error) {
      /* 忽略 */
    }
  }

  /* ---------------------------------------------------------------- 附件按需下载钩子 */

  function installPreviewHook() {
    if (!PP.attachments || typeof PP.attachments.openPreview !== 'function') return;
    if (PP.attachments.__githubPreviewHooked) return;
    var original = PP.attachments.openPreview;
    PP.attachments.openPreview = async function (meta, contextList) {
      try {
        if (meta && meta.sha256 && PP.sync && PP.sync.provider() === 'github') {
          var local = await loadLocalRecord(meta);
          if (!local || !local.dataUrl) {
            toast('正在从云端下载附件…', 'info', 2600);
            var record = await provider.downloadAttachment(meta);
            if (record) toast('附件已下载并缓存到本机。', 'success', 2600);
            else toast('云端没有这个附件（可能还没上传）。', 'warning', 4200);
          }
        }
      } catch (error) {
        console.warn('[拾光] 按需下载附件失败：', error);
        toast('下载附件失败：' + ((error && error.message) || '未知原因'), 'error');
      }
      return original.call(PP.attachments, meta, contextList);
    };
    PP.attachments.__githubPreviewHooked = true;
  }

  /* ---------------------------------------------------------------- 注册 */

  PP.syncProviders = PP.syncProviders || {};
  PP.syncProviders.github = provider;

  if (typeof PP.sync !== 'undefined' && PP.sync && typeof PP.sync.registerProvider === 'function') {
    PP.sync.registerProvider('github', provider);
  }

  // attachments.js 在 sync.js 之后加载时这里已经就绪；否则等 DOM 就绪再挂
  if (PP.attachments && typeof PP.attachments.openPreview === 'function') {
    installPreviewHook();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installPreviewHook);
  } else {
    window.setTimeout(installPreviewHook, 0);
  }

  // 供调试 / 验收使用
  PP.githubCrypto = {
    sha256Hex: sha256Hex,
    deriveKeys: deriveKeys,
    encryptEnvelope: encryptEnvelope,
    decryptEnvelope: decryptEnvelope,
    parseEnvelope: parseEnvelope,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    KDF_ITER: KDF_ITER
  };
}());
