/* ==========================================================================
   通用 UI：图标、Toast、弹窗、自动保存、主题、移动端菜单
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;
  var D = PP.Dates;

  var ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5"/>',
    pencil: '<path d="m4 20 4.2-1 10.9-10.9a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m14.8 6.4 3 3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevronLeft: '<path d="m14.5 5-7 7 7 7"/>',
    chevronRight: '<path d="m9.5 5 7 7-7 7"/>',
    chevronDown: '<path d="m5 9.5 7 7 7-7"/>',
    arrowRight: '<path d="M4 12h15M14 7l5 5-5 5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    year: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.2"/><path d="M8 3v4M16 3v4M3.5 10h17M7.5 13h2.5M14 13h2.5M7.5 17h2.5M14 17h2.5"/>',
    month: '<rect x="3.5" y="4.5" width="17" height="16" rx="3.2"/><path d="M8 3v3.5M16 3v3.5M3.5 9.5h17"/><path d="m8 14 2.5 2.5L17 10"/>',
    day: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/><path d="M12 7v5l3.2 2"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
    todo: '<rect x="3" y="3.5" width="18" height="17" rx="4"/><path d="m7.5 12 3 3 6-7"/>',
    writing: '<path d="M5 3.5h9l5 5v12H5z"/><path d="M14 3.5v5h5M8 13h8M8 17h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
    moon: '<path d="M20.2 14.2A8.3 8.3 0 0 1 9.8 3.8a8.4 8.4 0 1 0 10.4 10.4Z"/>',
    paperclip: '<path d="m9 12.5 5.2-5.2a3 3 0 0 1 4.2 4.2l-7.5 7.5a5 5 0 0 1-7.1-7.1l7.5-7.5"/>',
    download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16"/>',
    eye: '<path d="M2.8 12S6.4 5.8 12 5.8 21.2 12 21.2 12 17.6 18.2 12 18.2 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    mapPin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    sparkles: '<path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 15l.6 1.7L7.3 17l-1.7.6L5 19.3l-.6-1.7L2.7 17l1.7-.3L5 15Z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    today: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.2"/><path d="M8 3v4M16 3v4M3.5 10h17"/><circle cx="12" cy="14.5" r="1.8" fill="currentColor" stroke="none"/>',
    heart: '<path d="M20.3 8.7c0 4.7-8.3 10.1-8.3 10.1S3.7 13.4 3.7 8.7A4.4 4.4 0 0 1 12 6.3a4.4 4.4 0 0 1 8.3 2.4Z"/>',
    file: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 16h6"/>',
    upload: '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 20h16"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.2 13.6a7.8 7.8 0 0 0 .1-1.6 7.8 7.8 0 0 0-.1-1.6l2-1.5-2-3.4-2.4 1a8.2 8.2 0 0 0-2.7-1.6L13.8 2h-3.6L9.8 5a8.2 8.2 0 0 0-2.7 1.6l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0-.1 1.6 7.8 7.8 0 0 0 .1 1.6l-2 1.5 2 3.4 2.4-1a8.2 8.2 0 0 0 2.7 1.6l.4 3h3.6l.4-3a8.2 8.2 0 0 0 2.7-1.6l2.4 1 2-3.4-2.1-1.5Z"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6M4.5 11.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
    arrowUpRight: '<path d="M7 17 17 7M9 7h8v8"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'
  };

  function icon(name, size) {
    var content = ICONS[name] || ICONS.file;
    var px = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + content + '</svg>';
  }

  function ensureToastHost() {
    var host = document.querySelector('.toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'false');
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, type, duration) {
    var host = ensureToastHost();
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' is-' + type : '');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    var text = document.createElement('span');
    text.textContent = String(message);
    el.appendChild(text);
    host.appendChild(el);
    var life = duration || (type === 'error' || type === 'warning' ? 5200 : 3200);
    var timer = window.setTimeout(function () { dismiss(); }, life);
    function dismiss() {
      window.clearTimeout(timer);
      if (!el.parentNode) return;
      el.classList.add('is-leaving');
      window.setTimeout(function () { el.remove(); }, 220);
    }
    el.addEventListener('click', dismiss);
    return { dismiss: dismiss, el: el };
  }

  /* ------------------------------- 弹窗 ------------------------------- */

  var activeModal = null;

  function modal(options) {
    var opts = options || {};
    if (activeModal) activeModal.close(true);

    var previousFocus = document.activeElement;
    var titleId = U.uid('modal-title');
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    var cardClass = 'modal-card' + (opts.wide ? ' is-wide' : '') + (opts.narrow ? ' is-narrow' : '');
    var footer = opts.footer === null || opts.footer === false
      ? ''
      : (opts.footer || '<button class="btn" type="button" data-modal-close>关闭</button>');

    backdrop.innerHTML =
      '<div class="' + cardClass + '" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '">' +
        '<div class="modal-head">' +
          '<div>' +
            '<h2 id="' + titleId + '">' + U.escapeHTML(opts.title || '') + '</h2>' +
            (opts.subtitle ? '<p>' + U.escapeHTML(opts.subtitle) + '</p>' : '') +
          '</div>' +
          '<button class="modal-close" type="button" aria-label="关闭" data-modal-close>' + icon('x', 16) + '</button>' +
        '</div>' +
        '<div class="modal-body' + (opts.bodyClass ? ' ' + opts.bodyClass : '') + '">' + (opts.body || '') + '</div>' +
        (footer ? '<div class="modal-foot">' + footer + '</div>' : '') +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.classList.add('modal-open');

    var card = backdrop.querySelector('.modal-card');
    var bodyEl = backdrop.querySelector('.modal-body');
    var closed = false;
    var onClose = typeof opts.onClose === 'function' ? opts.onClose : null;

    function close(silent) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      if (!document.querySelector('.modal-backdrop')) {
        document.body.classList.remove('modal-open');
      }
      if (activeModal && activeModal.backdrop === backdrop) activeModal = null;
      if (!silent && onClose) onClose();
      if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
        window.setTimeout(function () { previousFocus.focus(); }, 0);
      }
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      var focusable = card.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    backdrop.addEventListener('mousedown', function (event) {
      if (event.target === backdrop) close();
    });
    backdrop.querySelectorAll('[data-modal-close]').forEach(function (button) {
      button.addEventListener('click', function () { close(); });
    });
    document.addEventListener('keydown', onKeydown);

    var api = { close: close, backdrop: backdrop, card: card, body: bodyEl };
    activeModal = api;

    if (typeof opts.onMount === 'function') {
      opts.onMount(bodyEl, close, card);
    }

    window.setTimeout(function () {
      var autofocus = card.querySelector('[data-autofocus]');
      if (autofocus) {
        autofocus.focus();
        if (typeof autofocus.select === 'function' && autofocus.tagName === 'INPUT') autofocus.select();
      } else {
        var firstInput = card.querySelector('input:not([type="hidden"]), textarea, select');
        if (firstInput) firstInput.focus();
        else {
          var closeButton = card.querySelector('.modal-close');
          if (closeButton) closeButton.focus();
        }
      }
    }, 40);

    return api;
  }

  function confirm(options) {
    var opts = options || {};
    return new Promise(function (resolve) {
      var settled = false;
      var message = opts.message || '这个操作无法撤销，确定继续吗？';
      var api = modal({
        title: opts.title || '确认操作',
        narrow: true,
        body: '<p class="modal-confirm-text">' + message + '</p>',
        footer:
          '<button class="btn" type="button" data-confirm-cancel>' + U.escapeHTML(opts.cancelText || '取消') + '</button>' +
          '<button class="btn ' + (opts.danger === false ? 'btn-primary' : 'btn-danger') + '" type="button" data-confirm-ok>' +
            U.escapeHTML(opts.confirmText || '确定') +
          '</button>',
        onMount: function (body, close, card) {
          card.querySelector('[data-confirm-cancel]').addEventListener('click', function () {
            if (settled) return;
            settled = true;
            close();
            resolve(false);
          });
          card.querySelector('[data-confirm-ok]').addEventListener('click', function () {
            if (settled) return;
            settled = true;
            close();
            resolve(true);
          });
        },
        onClose: function () {
          if (!settled) {
            settled = true;
            resolve(false);
          }
        }
      });
      return api;
    });
  }

  /* ------------------------------ 自动保存 ------------------------------ */

  function setSaveState(element, state, text) {
    if (!element) return;
    element.classList.remove('is-saved', 'is-saving');
    if (state) element.classList.add('is-' + state);
    if (text != null) element.textContent = text;
  }

  function bindAutoSave(input, save, statusElement, options) {
    var opts = options || {};
    var delay = typeof opts.delay === 'number' ? opts.delay : 480;
    var status = statusElement || null;

    function commit() {
      var result;
      try {
        result = save(input.value);
      } catch (error) {
        console.error('[拾光] 自动保存失败：', error);
        setSaveState(status, 'error', '保存失败');
        toast('保存失败，请检查浏览器存储空间。', 'error');
        return;
      }
      if (result === false) {
        setSaveState(status, 'error', '保存失败');
        return;
      }
      setSaveState(status, 'saved', '已保存 ' + D.nowTime());
    }

    var debounced = U.debounce(commit, delay);

    input.addEventListener('input', function () {
      setSaveState(status, 'saving', '正在保存…');
      debounced();
    });
    input.addEventListener('blur', function () {
      if (status && status.classList.contains('is-saving')) debounced.flush();
    });

    // 关闭 / 刷新前尽量把尚未到防抖时间的最后几个字写进去
    window.addEventListener('beforeunload', function () { debounced.flush(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') debounced.flush();
    });

    return {
      flush: function () { debounced.flush(); },
      cancel: debounced.cancel,
      commit: commit
    };
  }

  /* ------------------------------- 主题 ------------------------------- */

  var theme = {
    state: { theme: 'purple', mode: 'light' },

    apply: function (themeName, modeName) {
      var nextTheme = themeName === 'blue' ? 'blue' : 'purple';
      var nextMode = modeName === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', nextTheme);
      document.documentElement.setAttribute('data-mode', nextMode);
      document.documentElement.style.colorScheme = nextMode;
      theme.state = { theme: nextTheme, mode: nextMode };
      document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-theme-choice') === nextTheme));
      });
      document.querySelectorAll('[data-mode-toggle]').forEach(function (button) {
        button.setAttribute('aria-label', nextMode === 'dark' ? '切换到日间模式' : '切换到夜间模式');
        button.setAttribute('title', nextMode === 'dark' ? '当前为夜间模式，点击切换到日间' : '当前为日间模式，点击切换到夜间');
      });
      window.dispatchEvent(new CustomEvent('pp:themechange', { detail: theme.state }));
    },

    setTheme: function (name) {
      var state = PP.data.saveSettings({ theme: name });
      theme.apply(state.theme, state.mode);
    },

    setMode: function (name) {
      var state = PP.data.saveSettings({ mode: name });
      theme.apply(state.theme, state.mode);
    },

    toggleMode: function () {
      theme.setMode(theme.state.mode === 'dark' ? 'light' : 'dark');
    },

    init: function () {
      var settings = PP.data.getSettings();
      theme.apply(settings.theme, settings.mode);
      document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
        button.addEventListener('click', function () {
          theme.setTheme(button.getAttribute('data-theme-choice'));
        });
      });
      document.querySelectorAll('[data-mode-toggle]').forEach(function (button) {
        button.addEventListener('click', theme.toggleMode);
      });
    }
  };

  /* ----------------------------- 移动端菜单 ----------------------------- */

  function closeMenu() {
    var menu = document.getElementById('mobileMenu');
    var toggle = document.querySelector('[data-menu-toggle]');
    if (!menu || !toggle) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', '打开菜单');
  }

  function initMenu() {
    var menu = document.getElementById('mobileMenu');
    var toggle = document.querySelector('[data-menu-toggle]');
    if (!menu || !toggle) return;
    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      var willOpen = menu.hidden;
      menu.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', String(willOpen));
      toggle.setAttribute('aria-label', willOpen ? '关闭菜单' : '打开菜单');
    });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('click', function (event) {
      if (menu.hidden) return;
      if (event.target.closest('#siteHeader')) return;
      closeMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) closeMenu();
    });
  }

  function emptyState(emoji, title, text, actionHTML) {
    return '<div class="empty-state">' +
      '<span class="empty-emoji" aria-hidden="true">' + (emoji || '✦') + '</span>' +
      '<h3>' + U.escapeHTML(title || '这里还是空的') + '</h3>' +
      '<p>' + U.escapeHTML(text || '') + '</p>' +
      (actionHTML || '') +
      '</div>';
  }

  function moodMeta(key) {
    return PP.MOOD_MAP[key] || null;
  }

  function moodFace(key, size) {
    var mood = moodMeta(key);
    if (!mood) return '<span class="mood-face is-empty">·</span>';
    return '<span class="mood-face" style="--mood:' + mood.color + ';font-size:' + (size || 16) + 'px" title="' + U.escapeAttr(mood.label) + '">' + mood.emoji + '</span>';
  }

  PP.ui = {
    icon: icon,
    toast: toast,
    modal: modal,
    confirm: confirm,
    bindAutoSave: bindAutoSave,
    setSaveState: setSaveState,
    theme: theme,
    closeMenu: closeMenu,
    initMenu: initMenu,
    emptyState: emptyState,
    moodMeta: moodMeta,
    moodFace: moodFace
  };
}());
