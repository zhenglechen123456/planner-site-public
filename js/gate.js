/* ==========================================================================
   密码门禁：没有有效 token 时先渲染全屏密码页，登录成功后才启动应用
   --------------------------------------------------------------------------
   · 密码由服务端（或所选存储后端）校验，前端不做任何"猜密码"判断
   · token 默认存 sessionStorage；勾选「记住这台设备 7 天」才存 localStorage
   · file:// 直接双击打开时没有服务器，门禁自动跳过（保证本地可用）
   对外接口：PP.gate.required / start / open / close / isOpen
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;

  var view = {
    el: null,
    booted: false,     // 应用是否已经启动过（true 时 close 即恢复使用）
    onEnter: null,     // 启动前登录成功后要执行的回调
    busy: false
  };

  var DEFAULT_HINT = '这个日程本保存在服务器上，需要输入访问密码才能进入。';

  function required() {
    // file:// 下没有同源服务器，直接本地模式
    return window.location.protocol !== 'file:';
  }

  function isOpen() {
    return !!view.el;
  }

  function providerLabel() {
    try {
      if (PP.sync && typeof PP.sync.provider === 'function') {
        var name = PP.sync.provider();
        var provider = PP.syncProviders && PP.syncProviders[name];
        if (provider && provider.label) return provider.label;
      }
    } catch (error) {
      /* 忽略：门禁不应依赖同步模块的细枝末节 */
    }
    return '';
  }

  function build(hint) {
    var el = document.createElement('div');
    el.className = 'gate';
    el.setAttribute('data-gate', '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'gateTitle');
    var label = providerLabel();
    el.innerHTML =
      '<div class="gate-card" role="document">' +
        '<div class="gate-top">' +
          '<span class="gate-mark" aria-hidden="true">拾</span>' +
          '<span class="gate-wordmark">PERSONAL PLANNER</span>' +
        '</div>' +
        '<h1 class="gate-title" id="gateTitle">拾光日程</h1>' +
        '<p class="gate-sub">' + U.escapeHTML(hint || DEFAULT_HINT) + '</p>' +
        '<form class="gate-form" data-gate-form novalidate>' +
          '<label class="gate-field">' +
            '<span class="gate-label">访问密码</span>' +
            '<input class="gate-input" type="password" name="password" data-gate-password ' +
              'autocomplete="current-password" spellcheck="false" autocapitalize="off" ' +
              'enterkeyhint="go" placeholder="请输入密码" aria-describedby="gateError">' +
          '</label>' +
          '<label class="gate-remember">' +
            '<input type="checkbox" data-gate-remember>' +
            '<span>记住这台设备 7 天（不勾选则关闭浏览器后需要重输）</span>' +
          '</label>' +
          '<p class="gate-error" id="gateError" data-gate-error role="alert" aria-live="assertive"></p>' +
          '<button class="btn btn-primary gate-submit" type="submit" data-gate-submit>进入</button>' +
        '</form>' +
        '<p class="gate-foot">' +
          (label ? '密码由「' + U.escapeHTML(label) + '」校验 · ' : '密码由服务端校验 · ') +
          '密码不正确时不会拿到任何数据' +
        '</p>' +
      '</div>';
    return el;
  }

  function showError(text) {
    if (!view.el) return;
    var errorEl = view.el.querySelector('[data-gate-error]');
    if (!errorEl) return;
    errorEl.textContent = text ? String(text) : '';
    errorEl.classList.toggle('is-visible', !!text);
  }

  function focusInput(selectText) {
    if (!view.el) return;
    var input = view.el.querySelector('[data-gate-password]');
    if (!input) return;
    try {
      input.focus();
      if (selectText && typeof input.select === 'function') input.select();
    } catch (error) {
      /* 忽略：某些环境不允许主动聚焦 */
    }
  }

  function open(hint) {
    if (view.el) {
      if (hint) showError('');
      focusInput(true);
      return;
    }
    view.el = build(hint);
    document.body.appendChild(view.el);
    document.documentElement.setAttribute('data-gate', 'open');
    bind();
    window.setTimeout(function () { focusInput(false); }, 30);
  }

  function close() {
    if (!view.el) return;
    var el = view.el;
    view.el = null;
    el.remove();
    document.documentElement.removeAttribute('data-gate');
  }

  function enter() {
    var callback = view.onEnter;
    view.onEnter = null;
    view.booted = true;
    close();
    if (typeof callback === 'function') {
      try {
        callback();
      } catch (error) {
        console.error('[拾光] 门禁通过后启动失败：', error);
      }
      return;
    }
    // 已启动过（例如 401 重新登录）：直接补一次同步
    if (PP.sync && typeof PP.sync.syncNow === 'function') {
      try { PP.sync.syncNow(); } catch (error) { console.warn('[拾光] 重新登录后同步失败：', error); }
    }
  }

  function start(onEnter) {
    view.onEnter = typeof onEnter === 'function' ? onEnter : null;
    if (!required()) {
      enter();
      return;
    }
    // 先探一次"有没有同步后端"：纯静态托管（GitHub Pages / Netlify）上不能把人卡在密码页
    var probe = null;
    try {
      if (PP.sync && typeof PP.sync.whenBackendReady === 'function') probe = PP.sync.whenBackendReady();
    } catch (error) {
      probe = null;
    }
    if (!probe || typeof probe.then !== 'function') {
      decide();
      return;
    }
    probe.then(decide, decide);

    function decide() {
      var backendNone = false;
      try {
        backendNone = !!(PP.sync && typeof PP.sync.backendAvailable === 'function' && !PP.sync.backendAvailable());
      } catch (error) {
        backendNone = false;
      }
      if (backendNone) {
        // 没有同步服务：直接本地模式，不渲染密码页
        enter();
        return;
      }
      var authed = false;
      try {
        authed = !!(PP.sync && typeof PP.sync.isAuthed === 'function' && PP.sync.isAuthed());
      } catch (error) {
        authed = false;
      }
      if (authed) {
        enter();
        return;
      }
      open();
    }
  }

  function bind() {
    if (!view.el) return;
    var form = view.el.querySelector('[data-gate-form]');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        submit();
      });
    }
    // 兜底：某些输入法 / 旧浏览器不触发 submit
    var input = view.el.querySelector('[data-gate-password]');
    if (input) {
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          submit();
        }
        showError('');
      });
    }
  }

  async function submit() {
    if (view.busy || !view.el) return;
    var el = view.el;
    var input = el.querySelector('[data-gate-password]');
    var remember = el.querySelector('[data-gate-remember]');
    var button = el.querySelector('[data-gate-submit]');
    var password = input ? input.value : '';

    if (!password) {
      showError('请先输入访问密码。');
      focusInput(false);
      return;
    }
    if (!PP.sync || typeof PP.sync.login !== 'function') {
      showError('同步模块没有加载成功，请刷新页面后重试。');
      return;
    }

    view.busy = true;
    showError('');
    if (button) {
      button.disabled = true;
      button.classList.add('is-loading');
      button.textContent = '正在验证…';
    }

    var result = null;
    try {
      result = await PP.sync.login(password, { remember: !!(remember && remember.checked) });
    } catch (error) {
      result = { ok: false, error: (error && error.message) || '登录请求失败。' };
    } finally {
      view.busy = false;
      if (button && button.isConnected) {
        button.disabled = false;
        button.classList.remove('is-loading');
        button.textContent = '进入';
      }
      if (input) input.value = '';
    }

    if (result && result.ok) {
      enter();
      return;
    }
    showError((result && result.error) || '密码不正确，请再试一次。');
    if (input && input.isConnected) {
      try { input.focus(); } catch (error) { /* 忽略 */ }
    }
  }

  PP.gate = {
    required: required,
    start: start,
    open: open,
    close: close,
    isOpen: isOpen,
    enter: enter
  };
}());
