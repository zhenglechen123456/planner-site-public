/* ==========================================================================
   哈希路由：file:// 下也能正常前进 / 后退
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var D = PP.Dates;
  var U = PP.Util;
  var currentRoute = null;

  var PAGE_TITLE = {
    year: '年份',
    month: '月份',
    'month-summary': '月份总结',
    day: '每日',
    moods: '心情一览',
    books: '读书笔记',
    todos: '待办',
    tasks: '长期任务',
    task: '任务详情',
    'task-period': '分期目标',
    writing: '写作'
  };

  var NAV_MAP = {
    year: 'year',
    month: 'month',
    'month-summary': 'month',
    day: 'day',
    moods: 'day',
    books: 'books',
    todos: 'todos',
    tasks: 'tasks',
    task: 'tasks',
    'task-period': 'tasks',
    writing: 'writing'
  };

  function decodePart(value) {
    try {
      return decodeURIComponent(String(value || ''));
    } catch (error) {
      return String(value || '');
    }
  }

  function parse() {
    var raw = String(window.location.hash || '').replace(/^#\/?/, '').trim();
    if (!raw) {
      return { name: 'year', year: D.defaultDate().slice(0, 4), path: 'year' };
    }
    var parts = raw.split('/').filter(function (part) { return part !== ''; });
    var name = parts[0] || 'year';

    if (name === 'year') {
      return { name: 'year', year: D.safeYear(parts[1] || D.defaultDate().slice(0, 4)), path: raw };
    }
    if (name === 'month') {
      return { name: 'month', ym: D.safeMonth(parts[1]), path: raw };
    }
    if (name === 'month-summary') {
      return { name: 'month-summary', ym: D.safeMonth(parts[1]), path: raw };
    }
    if (name === 'day') {
      return { name: 'day', date: D.safeDate(parts[1]), path: raw };
    }
    if (name === 'moods') {
      return { name: 'moods', ym: D.safeMonth(parts[1]), path: raw };
    }
    if (name === 'todos') {
      return { name: 'todos', todoId: parts[1] ? decodeURIComponent(parts[1]) : '', path: raw };
    }
    if (name === 'tasks') {
      // tasks / tasks/<taskId> / tasks/<taskId>/period/<periodId>
      var taskId = parts[1] ? decodePart(parts[1]) : '';
      var periodId = parts[3] ? decodePart(parts[3]) : '';
      if (taskId && periodId) {
        return { name: 'task-period', taskId: taskId, periodId: periodId, path: raw };
      }
      if (taskId) {
        return { name: 'task', taskId: taskId, path: raw };
      }
      return { name: 'tasks', path: raw };
    }
    if (name === 'books' || name === 'writing') {
      return { name: name, path: raw };
    }
    return { name: 'year', year: D.defaultDate().slice(0, 4), path: 'year' };
  }

  function titleFor(route) {
    if (route.name === 'year') return route.year + ' 年 · 年份';
    if (route.name === 'month') return D.monthTitle(route.ym) + ' · 月份';
    if (route.name === 'month-summary') return D.monthTitle(route.ym) + ' · 月总结';
    if (route.name === 'day') return D.fullDateCN(route.date) + ' · 每日';
    if (route.name === 'moods') return D.monthTitle(route.ym) + ' · 心情一览';
    return PAGE_TITLE[route.name] || '拾光日程';
  }

  function syncNav(route) {
    var active = NAV_MAP[route.name] || '';
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      if (link.getAttribute('data-nav') === active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
    document.documentElement.setAttribute('data-route', route.name);
  }

  function showError(view, error) {
    console.error('[拾光] 页面渲染失败：', error);
    view.innerHTML = '<div class="page-shell"><div class="error-panel">' +
      '<span class="eyebrow">SOMETHING WENT WRONG</span>' +
      '<h1>这一页暂时没有翻开</h1>' +
      '<p>页面渲染时遇到了一点问题。你的数据仍然保存在浏览器里，可以刷新重试。</p>' +
      '<pre>' + U.escapeHTML(error && error.message ? error.message : String(error)) + '</pre>' +
      '<button class="btn btn-primary" type="button" data-error-reload>刷新页面</button>' +
      '</div></div>';
    var reload = view.querySelector('[data-error-reload]');
    if (reload) reload.addEventListener('click', function () { window.location.reload(); });
  }

  function render(options) {
    var opts = options || {};
    var view = document.getElementById('view');
    if (!view) return;
    var route = parse();
    var page = PP.pages[route.name] || PP.pages.year;
    var scrollY = window.scrollY;
    currentRoute = route;

    try {
      view.innerHTML = page.render(route);
      if (typeof page.mount === 'function') page.mount(view, route);
    } catch (error) {
      showError(view, error);
    }

    syncNav(route);
    document.title = titleFor(route) + ' | 拾光日程';
    PP.ui.closeMenu();

    if (opts.preserveScroll) {
      window.requestAnimationFrame(function () { window.scrollTo(0, scrollY); });
    } else {
      window.scrollTo(0, 0);
    }
    document.dispatchEvent(new CustomEvent('pp:route', { detail: route }));
  }

  function go(path) {
    var hash = String(path || '').charAt(0) === '#' ? String(path) : '#/' + String(path || '').replace(/^\/+/, '');
    if (window.location.hash === hash) {
      render();
      return;
    }
    window.location.hash = hash;
  }

  function refresh() {
    render({ preserveScroll: true });
  }

  function init() {
    if (!window.location.hash) {
      try {
        window.history.replaceState(null, '', '#/year');
      } catch (error) {
        window.location.hash = '#/year';
      }
    }
    window.addEventListener('hashchange', function () { render(); });

    document.addEventListener('click', function (event) {
      var target = event.target.closest('[data-go]');
      if (!target) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      go(target.getAttribute('data-go'));
    });

    render();
  }

  PP.router = {
    init: init,
    render: render,
    refresh: refresh,
    go: go,
    parse: parse,
    current: function () { return currentRoute; }
  };
}());
