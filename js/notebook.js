/* ==========================================================================
   仿真模式：复古笔记本翻页动画 + 只读仿真页
   --------------------------------------------------------------------------
   对外 API（自动化验收用）：
     PP.notebook.open(bookId)  打开某本书的翻页动画
     PP.notebook.close()       关闭（随时可中断）
     PP.notebook.isOpen()      boolean
     PP.notebook.stage()       'idle' | 'zoom' | 'open' | 'flip' | 'done'

   DOM 钩子：
     [data-notebook-overlay][data-stage]  遮罩容器
     [data-notebook-cover]                封面
     [data-notebook-page]                 正在翻的页（同一时刻只有一个）
     [data-notebook-sheet] > [data-notebook-title] / [data-notebook-close]
     [data-notebook-to-simple]            切回简洁模式并定位卡片

   时序：zoom 700ms → open 500ms → flip（按张数排布，慢→快→慢）→ done
   总时长 3.07–3.15s（含仿真页 240ms 淡入也不超过 3.4s）；
   prefers-reduced-motion: reduce 时直接到 done。
   所有临时 DOM / 定时器 / 监听在 close() 里统一清理。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  var ZOOM_MS = 700;   // ① 镜头由远及近
  var OPEN_MS = 500;   // ② 翻开封面

  /* ③ 翻页：张数 5–9（与书在列表里的序号相关，封顶 9 张），
     每张时长按「慢 → 快 → 慢」排布，单张节奏由 JS 依次调度。
     每套 + zoom(700) + open(500) 后总时长落在 3.07–3.15s，
     算上仿真页 240ms 淡入也不超过 3.4s。 */
  var FLIP_PLANS = {
    5: [620, 420, 290, 200, 420],
    6: [540, 380, 270, 200, 160, 390],
    7: [530, 350, 250, 180, 140, 120, 360],
    8: [500, 330, 230, 170, 130, 110, 120, 340],
    9: [440, 310, 220, 160, 120, 100, 100, 120, 300]
  };

  var state = {
    open: false,
    stage: 'idle',
    bookId: '',
    book: null,
    el: null,
    timers: [],
    onKeydown: null,
    lastFocus: null,
    inertView: null,
    prevHtmlOverflow: '',
    prevBodyOverflow: '',
    pageNumber: 1
  };

  /* ------------------------------ 小工具 ------------------------------ */

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (error) {
      return false;
    }
  }

  function later(ms, fn) {
    var id = window.setTimeout(function () {
      var index = state.timers.indexOf(id);
      if (index >= 0) state.timers.splice(index, 1);
      fn();
    }, ms);
    state.timers.push(id);
    return id;
  }

  function clearTimers() {
    state.timers.forEach(function (id) { window.clearTimeout(id); });
    state.timers = [];
  }

  function focusSoft(element) {
    if (!element || typeof element.focus !== 'function') return;
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      try { element.focus(); } catch (nested) { /* 忽略：某些浏览器不支持 */ }
    }
  }

  /* --------------------------- 笔记本线稿（内联 SVG） --------------------------- */

  function coverArt() {
    return '<svg class="nb-cover-art" viewBox="0 0 300 400" fill="none" aria-hidden="true" focusable="false">' +
      // 硬壳封面：外框 + 内压线
      '<rect class="nb-line" x="9" y="7" width="282" height="386" rx="12"/>' +
      '<rect class="nb-line is-faint" x="18" y="16" width="264" height="368" rx="8"/>' +
      // 书脊与缝线
      '<path class="nb-line" d="M36 7v386"/>' +
      '<path class="nb-line is-stitch" d="M27 22v356"/>' +
      '<path class="nb-line is-stitch" d="M18 46h14M18 96h14M18 146h14M18 196h14M18 246h14M18 296h14M18 346h14"/>' +
      '<path class="nb-line is-faint" d="M36 26h-9M36 66h-9M36 106h-9M36 146h-9M36 186h-9M36 226h-9M36 266h-9M36 306h-9M36 346h-9"/>' +
      // 书签丝带（顶端垂下，末端剪成 V 形）
      '<path class="nb-ribbon" d="M262 7v70l-12-13-12 13V7"/>' +
      // 角落磨损
      '<path class="nb-line is-worn" d="M12 40l11 9M12 52l7 6M290 40l-11 9M290 52l-7 6"/>' +
      '<path class="nb-line is-worn" d="M12 360l11-9M12 372l7-6M290 360l-11-9M290 372l-7-6"/>' +
      // 烫金标签框 + 假想字迹
      '<rect class="nb-line is-faint" x="58" y="150" width="180" height="112" rx="5"/>' +
      '<text class="nb-cover-title" x="148" y="200" text-anchor="middle">READING</text>' +
      '<path class="nb-line is-faint" d="M76 218h144M92 234h112M92 248h78"/>' +
      // 标签下方的小装饰
      '<path class="nb-line is-faint" d="M148 268v14M141 275h14"/>' +
    '</svg>';
  }

  function pageEdges(count) {
    var html = '';
    for (var i = count; i >= 1; i -= 1) {
      html += '<span class="nb-edge" style="--i:' + i + '"></span>';
    }
    return html;
  }

  /* ----------------------------- 仿真页内容 ----------------------------- */

  function statsOf(book) {
    try {
      return PP.data.getBookReadingStats(book);
    } catch (error) {
      return { totalSessions: 0, totalMinutes: 0, monthSessions: 0, monthMinutes: 0 };
    }
  }

  function monthStatsOf(book) {
    try {
      return PP.data.getBookReadingStats(book, D.today().slice(0, 7));
    } catch (error) {
      return { totalSessions: 0, totalMinutes: 0, monthSessions: 0, monthMinutes: 0 };
    }
  }

  function proseBlock(text, emptyText) {
    var value = String(text == null ? '' : text).trim();
    if (!value) return '<p class="nb-empty">' + U.escapeHTML(emptyText) + '</p>';
    return '<p class="nb-prose">' + U.escapeHTML(value) + '</p>';
  }

  function logList(book) {
    var logs = (Array.isArray(book.readingLogs) ? book.readingLogs : []).slice().sort(function (a, b) {
      return b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));
    }).slice(0, 5);
    if (!logs.length) {
      return '<p class="nb-empty">还没有阅读记录。回到简洁模式记一笔，翻页时会显示在这里。</p>';
    }
    return '<ul class="nb-log-list">' +
      logs.map(function (log) {
        return '<li>' +
          '<span class="nb-log-date">' + U.escapeHTML(log.date.slice(5).replace('-', '/')) + '</span>' +
          '<strong>' + U.formatMinutes(log.minutes) + '</strong>' +
          (log.note ? '<em>' + U.escapeHTML(log.note) + '</em>' : '<em class="nb-log-silent">没写备注</em>') +
        '</li>';
      }).join('') +
    '</ul>';
  }

  function sheetHTML(book, pageNumber) {
    var stats = statsOf(book);
    var month = monthStatsOf(book);
    var attachments = Array.isArray(book.attachments) ? book.attachments : [];
    var title = String(book.title || '').trim() || '未命名书籍';

    return '<article class="nb-sheet" data-notebook-sheet aria-label="《' + U.escapeAttr(title) + '》的仿真阅读页">' +
      '<span class="nb-binding" aria-hidden="true"></span>' +
      '<header class="nb-sheet-head">' +
        '<p class="nb-sheet-eyebrow">READING NOTES · PAGE ' + U.pad2(pageNumber) + '</p>' +
        '<h2 class="nb-sheet-title" data-notebook-title>' + U.escapeHTML(title) + '</h2>' +
        '<p class="nb-sheet-sub">' + (book.author ? U.escapeHTML(book.author) : '作者还没有填写') + '</p>' +
        '<button class="nb-sheet-close" type="button" data-notebook-close aria-label="合上笔记本" title="合上笔记本（Esc）">' + ui.icon('x', 16) + '</button>' +
      '</header>' +
      '<div class="nb-sheet-body">' +
        '<div class="nb-sheet-cols">' +
          '<section class="nb-field">' +
            '<h3>作者</h3>' +
            proseBlock(book.author, '还没有填写作者。') +
          '</section>' +
          '<section class="nb-field">' +
            '<h3>累计阅读</h3>' +
            '<p class="nb-strong">' + U.formatMinutes(stats.totalMinutes) + '</p>' +
            '<p class="nb-note">' + stats.totalSessions + ' 次记录 · 本月 ' + month.monthSessions + ' 次 / ' + U.formatMinutes(month.monthMinutes) + '</p>' +
          '</section>' +
        '</div>' +
        '<section class="nb-field">' +
          '<h3>阅读时间</h3>' +
          logList(book) +
        '</section>' +
        '<section class="nb-field">' +
          '<h3>阅读笔记</h3>' +
          proseBlock(book.notes, '这一页还空着。摘抄、页码、想法都可以写在这里。') +
        '</section>' +
        '<section class="nb-field">' +
          '<h3>free talk</h3>' +
          proseBlock(book.freeTalk, '如果可以和作者喝一杯咖啡，你想说什么？') +
        '</section>' +
        '<section class="nb-field nb-field-attach">' +
          '<h3>附件</h3>' +
          '<p class="nb-attach-row">' + ui.icon('paperclip', 13) + '<span>' + attachments.length + ' 个附件</span>' +
            '<button class="nb-link" type="button" data-notebook-attachments' + (attachments.length ? '' : ' disabled') + '>' +
              (attachments.length ? '查看附件' : '暂无附件') +
            '</button>' +
          '</p>' +
        '</section>' +
      '</div>' +
      '<footer class="nb-sheet-foot">' +
        '<button class="btn btn-sm btn-primary" type="button" data-notebook-to-simple>' + ui.icon('pencil', 14) + '在简洁模式中编辑</button>' +
        '<button class="btn btn-sm" type="button" data-notebook-close>' + ui.icon('x', 14) + '关闭</button>' +
      '</footer>' +
      '<span class="nb-sheet-folio" aria-hidden="true">— ' + U.pad2(pageNumber) + ' —</span>' +
    '</article>';
  }

  /* ------------------------------ 遮罩与舞台 ------------------------------ */

  function buildOverlay(book) {
    var overlay = document.createElement('div');
    overlay.className = 'nb-overlay';
    overlay.setAttribute('data-notebook-overlay', '');
    overlay.setAttribute('data-stage', 'zoom');
    overlay.setAttribute('data-book-id', String(book.id || ''));
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '《' + (String(book.title || '').trim() || '未命名书籍') + '》仿真阅读页');
    overlay.setAttribute('tabindex', '-1');
    overlay.innerHTML =
      '<div class="nb-scrim" data-notebook-scrim aria-hidden="true"></div>' +
      '<div class="nb-stage">' +
        '<div class="nb-book" data-notebook-book>' +
          '<div class="nb-block" aria-hidden="true">' + pageEdges(4) + '<div class="nb-block-face"></div></div>' +
          '<div class="nb-leaf" data-notebook-leaf aria-hidden="true"></div>' +
          '<div class="nb-cover" data-notebook-cover>' + coverArt() + '<span class="nb-cover-back" aria-hidden="true"></span></div>' +
        '</div>' +
        // 仿真页的纸叠层次与桌面阴影：done 阶段才淡入，纯装饰、不吃点击
        '<span class="nb-sheet-edge" style="--i:1" aria-hidden="true"></span>' +
        '<span class="nb-sheet-edge" style="--i:2" aria-hidden="true"></span>' +
        '<span class="nb-sheet-edge" style="--i:3" aria-hidden="true"></span>' +
        '<span class="nb-desk" aria-hidden="true"></span>' +
        '<p class="nb-hint" aria-hidden="true">Esc 或点遮罩，随时合上笔记本</p>' +
      '</div>';
    return overlay;
  }

  function stageElement() {
    return state.el ? state.el.querySelector('.nb-stage') : null;
  }

  function setStage(stage) {
    state.stage = stage;
    if (state.el) state.el.setAttribute('data-stage', stage);
  }

  /* ------------------------------ 滚动锁定 ------------------------------ */

  function lockScroll() {
    var gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.documentElement.style.setProperty('--nb-gap', gap + 'px');
    state.prevHtmlOverflow = document.documentElement.style.overflow || '';
    state.prevBodyOverflow = document.body.style.overflow || '';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('nb-locked');
    var view = document.getElementById('view');
    if (view && 'inert' in view) {
      view.inert = true;
      state.inertView = view;
    }
  }

  function unlockScroll() {
    document.documentElement.style.overflow = state.prevHtmlOverflow;
    document.body.style.overflow = state.prevBodyOverflow;
    document.documentElement.classList.remove('nb-locked');
    document.documentElement.style.removeProperty('--nb-gap');
    state.prevHtmlOverflow = '';
    state.prevBodyOverflow = '';
    if (state.inertView) {
      try { state.inertView.inert = false; } catch (error) { /* 忽略 */ }
      state.inertView = null;
    }
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  function trapFocus(event) {
    if (!state.el) return;
    var focusable = state.el.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) {
      // 动画阶段还没有可聚焦的按钮：把焦点留在遮罩里
      event.preventDefault();
      focusSoft(state.el);
      return;
    }
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

  function bind(overlay) {
    var scrim = overlay.querySelector('[data-notebook-scrim]');

    function isBackdrop(target) {
      return target === overlay || target === scrim;
    }

    // 点遮罩关闭（点纸页本身不关闭）
    overlay.addEventListener('mousedown', function (event) {
      if (isBackdrop(event.target)) close();
    });

    overlay.addEventListener('click', function (event) {
      var target = event.target;
      if (isBackdrop(target)) {
        close();
        return;
      }
      if (target.closest('[data-notebook-close]')) {
        close();
        return;
      }
      if (target.closest('[data-notebook-to-simple]')) {
        openInSimple();
        return;
      }
      if (target.closest('[data-notebook-attachments]')) {
        showAttachments();
      }
    });

    state.onKeydown = function (event) {
      if (!state.open) return;
      if (event.key === 'Escape') {
        // 附件列表等弹窗在上层时，先让弹窗自己响应 Esc
        if (document.querySelector('.modal-backdrop')) return;
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'Tab') trapFocus(event);
    };
    document.addEventListener('keydown', state.onKeydown);
  }

  /* ------------------------------ 翻页调度 ------------------------------ */

  function runFlip(plan, index, done) {
    if (!state.open || !state.el) return;
    if (index >= plan.length) {
      done();
      return;
    }
    var leaf = state.el.querySelector('[data-notebook-leaf]');
    if (!leaf) {
      done();
      return;
    }
    var duration = plan[index];
    var page = document.createElement('div');
    page.className = 'nb-page';
    page.setAttribute('data-notebook-page', '');
    page.style.setProperty('--flip-duration', duration + 'ms');
    page.innerHTML = '<span class="nb-page-folio" aria-hidden="true">' + U.pad2(index + 1) + '</span>' +
      '<span class="nb-page-ink" aria-hidden="true"></span>' +
      '<span class="nb-page-ink is-short" aria-hidden="true"></span>' +
      '<span class="nb-page-ink is-short" aria-hidden="true"></span>';
    leaf.appendChild(page);
    // 先让浏览器算出初始态，再加动画类，确保每张都是独立的一次翻转
    void page.offsetWidth;
    page.classList.add('is-turning');

    later(duration, function () {
      if (page.parentNode) page.parentNode.removeChild(page);
      runFlip(plan, index + 1, done);
    });
  }

  function revealSheet(book) {
    if (!state.el) return null;
    var stage = stageElement();
    if (!stage) return null;
    var holder = document.createElement('div');
    holder.innerHTML = sheetHTML(book, state.pageNumber);
    var sheet = holder.firstChild;
    stage.appendChild(sheet);
    void sheet.offsetWidth;
    sheet.classList.add('is-in');
    return sheet;
  }

  function finish() {
    if (!state.open || !state.book) return;
    var sheet = revealSheet(state.book);
    setStage('done');
    if (sheet) {
      var closeButton = sheet.querySelector('[data-notebook-close]');
      focusSoft(closeButton);
    }
  }

  /* ------------------------------ 打开 / 关闭 ------------------------------ */

  function open(bookId) {
    var books = PP.data.getBooks();
    var book = null;
    var index = -1;
    books.forEach(function (entry, i) {
      if (String(entry.id) === String(bookId)) {
        book = entry;
        index = i;
      }
    });
    if (!book) {
      ui.toast('没有找到这本书，可能已经被删除了。', 'warning');
      return false;
    }

    if (state.open) close({ silent: true });

    var count = Math.min(9, 5 + Math.max(0, index));
    var plan = (FLIP_PLANS[count] || FLIP_PLANS[5]).slice();
    var overlay = buildOverlay(book);

    state.open = true;
    state.stage = 'zoom';
    state.bookId = String(book.id);
    state.book = book;
    state.el = overlay;
    state.pageNumber = count + 1;
    state.lastFocus = document.activeElement;

    document.body.appendChild(overlay);
    lockScroll();
    bind(overlay);
    focusSoft(overlay);

    // 系统开启“减少动态效果”：跳过全部动画，直接停在仿真页
    if (prefersReducedMotion()) {
      var reducedSheet = revealSheet(book);
      setStage('done');
      if (reducedSheet) focusSoft(reducedSheet.querySelector('[data-notebook-close]'));
      return true;
    }

    // ① 镜头由远及近：scale(.62) rotate(-6deg) → scale(1.08) rotate(0)
    void overlay.offsetWidth;
    overlay.classList.add('is-entered');
    later(ZOOM_MS, function () {
      if (!state.open) return;
      // ② 翻开封面
      setStage('open');
      later(OPEN_MS, function () {
        if (!state.open) return;
        // ③ 翻页：慢 → 快 → 慢
        setStage('flip');
        runFlip(plan, 0, finish);
      });
    });
    return true;
  }

  function close(options) {
    var opts = options || {};
    if (!state.open && !state.el) return false;

    clearTimers();
    if (state.onKeydown) {
      document.removeEventListener('keydown', state.onKeydown);
      state.onKeydown = null;
    }
    var previousFocus = state.lastFocus;
    if (state.el && state.el.parentNode) state.el.parentNode.removeChild(state.el);
    state.el = null;
    state.book = null;
    state.bookId = '';
    state.pageNumber = 1;
    state.stage = 'idle';
    state.open = false;
    unlockScroll();

    if (!opts.silent && previousFocus && document.contains(previousFocus)) focusSoft(previousFocus);
    state.lastFocus = null;
    return true;
  }

  /* --------------------------- 切回简洁模式并定位 --------------------------- */

  function findCard(bookId) {
    var card = null;
    document.querySelectorAll('[data-book-card]').forEach(function (item) {
      if (!card && item.getAttribute('data-book-id') === String(bookId)) card = item;
    });
    return card;
  }

  function attemptReveal(bookId, tries) {
    var card = findCard(bookId);
    if (card) {
      try {
        card.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      } catch (error) {
        card.scrollIntoView();
      }
      card.classList.add('is-notebook-target');
      window.setTimeout(function () { card.classList.remove('is-notebook-target'); }, 1900);
      var titleField = card.querySelector('[data-book-field="title"]');
      if (titleField) focusSoft(titleField);
      return;
    }
    if (tries > 0) {
      window.setTimeout(function () { attemptReveal(bookId, tries - 1); }, 120);
    }
  }

  function openInSimple() {
    var bookId = state.bookId;
    PP.data.saveSettings({ booksMode: 'simple' });
    close({ silent: true });
    if (!PP.router || typeof PP.router.go !== 'function') return;
    var route = typeof PP.router.current === 'function' ? PP.router.current() : null;
    if (route && route.name === 'books') {
      if (typeof PP.router.refresh === 'function') PP.router.refresh();
    } else {
      PP.router.go('books');
    }
    window.setTimeout(function () { attemptReveal(bookId, 3); }, 60);
  }

  /* ------------------------------ 附件列表 ------------------------------ */

  function showAttachments() {
    if (!state.book) return;
    var list = Array.isArray(state.book.attachments) ? state.book.attachments.slice() : [];
    if (!list.length) {
      ui.toast('这本书还没有附件。', 'info');
      return;
    }
    var title = String(state.book.title || '').trim() || '这本书';
    var rows = list.map(function (meta, index) {
      var kind = PP.attachments.kindOf(meta.name, meta.type);
      return '<button class="nb-attach-item" type="button" data-nb-attach="' + index + '">' +
        '<span class="nb-attach-emoji" aria-hidden="true">' + PP.attachments.kindEmoji(kind) + '</span>' +
        '<span class="nb-attach-name">' + U.escapeHTML(meta.name) + '</span>' +
        '<span class="nb-attach-size">' + U.fileSize(meta.size) + '</span>' +
      '</button>';
    }).join('');

    ui.modal({
      title: '附件 · 《' + title + '》',
      subtitle: '共 ' + list.length + ' 个附件，点一项预览。',
      body: '<div class="nb-attach-list">' + rows + '</div>',
      footer: '<button class="btn" type="button" data-modal-close>关闭</button>',
      onMount: function (body) {
        body.querySelectorAll('[data-nb-attach]').forEach(function (button) {
          button.addEventListener('click', function () {
            var meta = list[Number(button.getAttribute('data-nb-attach'))];
            if (meta) PP.attachments.openPreview(meta, list);
          });
        });
      }
    });
  }

  /* ------------------------------ 对外 API ------------------------------ */

  PP.notebook = {
    open: open,
    close: close,
    isOpen: function () { return state.open; },
    stage: function () { return state.stage; },
    mode: function () {
      var settings = PP.data.getSettings();
      return settings.booksMode === 'fancy' ? 'fancy' : 'simple';
    }
  };
}());
