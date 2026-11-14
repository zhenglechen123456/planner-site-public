/* ==========================================================================
   每周页：7 列 × 48 格一周时间轴 + 本周截止 / 重要日期 + 打卡 + 小结
   路由：#/week/<YYYY-MM-DD>[ /<courseId> ]（任意一天，取它所在周，周一为首日）
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  // 每 2 小时标一次刻度（一周时间轴每格 30 分钟 → 4 格 = 2 小时）
  var TICK_STEP = 4;

  /* ------------------------------ 一周时间轴 ------------------------------ */

  function renderWeekScale(cells) {
    var ticks = '';
    cells.forEach(function (cell, index) {
      if (index % TICK_STEP !== 0) return;
      ticks += '<span class="wk-tick" style="top:calc(var(--wk-row) * ' + index + ')">' + cell.time + '</span>';
    });
    return '<div class="wk-scale" aria-hidden="true">' +
        '<div class="wk-scale-head"></div>' +
        '<div class="wk-scale-body">' + ticks + '</div>' +
      '</div>';
  }

  function weekCellTitle(day, cell) {
    var parts = [day.weekday + ' ' + cell.time];
    if (cell.course) {
      parts.push(cell.course.name);
      if (cell.course.place) parts.push(cell.course.place);
    }
    if (cell.todos.length) {
      parts.push('任务：' + cell.todos.map(function (todo) { return todo.text; }).join(' / '));
    }
    if (!cell.course && !cell.todos.length) parts.push('空闲');
    return parts.join(' · ');
  }

  function renderWeekColumn(day, focusCourseId, todayISO) {
    var isToday = day.date === todayISO;
    var cells = day.cells.map(function (cell) {
      var classes = ['wk-cell', 'is-' + cell.kind];
      if (cell.isHour) classes.push('is-hour');
      if (cell.isNextDay) classes.push('is-next-day');
      if (cell.course && focusCourseId && cell.course.id === focusCourseId) classes.push('is-focus');
      var color = cell.course ? cell.course.color : (cell.todos.length ? cell.todos[0].color : '');
      return '<button type="button" class="' + classes.join(' ') + '"' +
        ' data-week-slot data-date="' + day.date + '" data-time="' + cell.time + '" data-kind="' + cell.kind + '"' +
        (color ? ' style="--slot-color:' + color + '"' : '') +
        ' data-go="#/day/' + day.date + '"' +
        ' title="' + U.escapeAttr(weekCellTitle(day, cell)) + '" aria-label="' + U.escapeAttr(weekCellTitle(day, cell)) + '"></button>';
    }).join('');

    return '<div class="wk-col' + (isToday ? ' is-today' : '') + '" data-week-day data-date="' + day.date + '">' +
        '<a class="wk-head" href="#/day/' + day.date + '">' +
          '<strong>' + day.weekday + '</strong>' +
          '<em>' + (Number(day.date.slice(5, 7))) + '/' + day.date.slice(8, 10) + '</em>' +
        '</a>' +
        '<div class="wk-body">' + cells + '</div>' +
      '</div>';
  }

  function renderWeekGrid(days, focusCourseId, todayISO) {
    return '<section class="panel week-grid-panel">' +
        '<div class="section-head week-grid-head">' +
          '<div><span class="section-kicker">WEEK TIMELINE</span>' +
            '<h2>' + ui.icon('calendar', 17) + '一周时间轴</h2></div>' +
          '<span class="tiny muted">04:00 → 次日 04:00 · 每格 30 分钟 · 点格子进每日页</span>' +
        '</div>' +
        '<div class="week-grid" data-week-grid>' +
          renderWeekScale(days[0].cells) +
          days.map(function (day) { return renderWeekColumn(day, focusCourseId, todayISO); }).join('') +
        '</div>' +
      '</section>';
  }

  /* -------------------------- 本周截止 + 重要日期 -------------------------- */

  function renderWeekDeadlines(days) {
    var start = days[0].date;
    var end = days[6].date;
    var todos = PP.data.getTodos().filter(function (item) {
      if (!item.due) return false;
      var dueDate = String(item.due).slice(0, 10);
      return dueDate >= start && dueDate <= end;
    }).sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });

    var important = [];
    days.forEach(function (day) {
      PP.data.getImportant(day.date).forEach(function (item) {
        important.push({ date: day.date, weekday: day.weekday, item: item });
      });
    });

    var todoHTML = todos.map(function (item) {
      var due = D.formatDue(item.due);
      var tone = item.done ? 'chip-success' : due.tone === 'danger' ? 'chip-danger' : due.tone === 'warning' ? 'chip-warning' : 'chip-primary';
      return '<a class="week-todo' + (item.done ? ' is-done' : '') + '" href="#/todos/' + U.escapeAttr(item.id) + '">' +
          '<span class="week-todo-main">' +
            '<strong>' + U.escapeHTML(item.text) + '</strong>' +
            '<em>' + U.escapeHTML(due.text) + (item.place ? ' · ' + U.escapeHTML(item.place) : '') + '</em>' +
          '</span>' +
          '<span class="chip ' + tone + '">' + (item.done ? '已完成' : U.escapeHTML(due.relative || due.text)) + '</span>' +
        '</a>';
    }).join('');

    var importantHTML = important.map(function (entry) {
      return '<a class="week-important" href="#/day/' + entry.date + '">' +
          '<span class="week-important-date">' + entry.weekday + ' ' + entry.date.slice(5, 7) + '/' + entry.date.slice(8, 10) + '</span>' +
          '<span class="week-important-main">' +
            '<strong>' + U.escapeHTML(entry.item.title) + '</strong>' +
            (entry.item.note ? '<em>' + U.escapeHTML(entry.item.note) + '</em>' : '') +
          '</span>' +
        '</a>';
    }).join('');

    var body;
    if (!todos.length && !important.length) {
      body = '<p class="week-empty">' + ui.icon('info', 13) + '<span>本周没有到期的待办，也没有登记重要日期。</span></p>';
    } else {
      body = (todos.length
          ? '<div class="week-sub-block"><h4>' + ui.icon('clock', 13) + '本周到期</h4><div class="week-todo-list">' + todoHTML + '</div></div>'
          : '<p class="week-empty"><span>本周没有到期的待办。</span></p>') +
        (important.length
          ? '<div class="week-sub-block"><h4>' + ui.icon('sparkles', 13) + '重要日期</h4><div class="week-important-list">' + importantHTML + '</div></div>'
          : '<p class="week-empty"><span>本周没有登记重要日期。</span></p>');
    }

    return '<section class="panel week-deadlines-panel">' +
        '<div class="section-head">' +
          '<div><span class="section-kicker">DEADLINES & DATES</span>' +
            '<h2>' + ui.icon('sparkles', 17) + '本周截止与重要日期</h2></div>' +
          '<span class="tiny muted">' + D.shortDateCN(start) + ' – ' + D.shortDateCN(end) + '</span>' +
        '</div>' +
        '<div data-week-deadlines>' + body + '</div>' +
      '</section>';
  }

  /* ------------------------------ 本周打卡 ------------------------------ */

  function renderWeekHabits(days) {
    var habits = PP.data.getHabits();
    var logs = PP.data.getHabitLogs();
    var body;

    if (!habits.length) {
      body = '<p class="week-empty">' + ui.icon('info', 13) + '<span>还没有习惯，去「每日」页添加一个就能在这里看到本周打卡。</span></p>';
    } else {
      var total = 0;
      var rows = habits.map(function (habit) {
        var count = 0;
        var cells = days.map(function (day) {
          var checked = !!(logs[habit.id] && logs[habit.id][day.date]);
          if (checked) count += 1;
          return '<span class="week-habit-cell' + (checked ? ' is-checked' : '') + '"' +
            ' title="' + U.escapeAttr(day.weekday + ' ' + day.date.slice(5, 7) + '/' + day.date.slice(8, 10) + ' · ' + (checked ? '已打卡' : '未打卡')) + '">' +
            (checked ? ui.icon('check', 9) : '') + '</span>';
        }).join('');
        total += count;
        return '<div class="week-habit-row" data-week-habit-row data-habit-id="' + U.escapeAttr(habit.id) + '" style="--habit:' + habit.color + '">' +
            '<span class="week-habit-name"><i class="week-habit-icon">' + U.escapeHTML(habit.icon || '●') + '</i>' + U.escapeHTML(habit.name) + '</span>' +
            '<span class="week-habit-cells">' + cells + '</span>' +
            '<span class="week-habit-count">本周 ' + count + '/7</span>' +
          '</div>';
      }).join('');

      body = '<div class="week-habit-list">' + rows + '</div>' +
        '<p class="week-habit-total">本周共打卡 <strong>' + total + '</strong> 次</p>';
    }

    return '<section class="panel week-habits-panel" data-week-habits>' +
        '<div class="section-head">' +
          '<div><span class="section-kicker">HABIT WEEK</span>' +
            '<h2>' + ui.icon('check', 17) + '本周打卡完成情况</h2></div>' +
          '<span class="tiny muted">每个习惯 7 格</span>' +
        '</div>' +
        body +
      '</section>';
  }

  /* ------------------------------ 本周小结 ------------------------------ */

  function renderWeekSummary(weekKey) {
    var saved = PP.data.getWeekSummary(weekKey);
    return '<section class="panel week-summary-panel">' +
        '<div class="section-head">' +
          '<div><span class="section-kicker">WEEKLY NOTE</span>' +
            '<h2>' + ui.icon('writing', 17) + '本周小结</h2></div>' +
          '<span class="save-state" data-week-save>' + (saved.summary ? '自动保存已开启' : '尚未填写') + '</span>' +
        '</div>' +
        '<textarea class="week-summary-textarea" data-week-summary rows="5" maxlength="5000" ' +
          'placeholder="这一周发生了什么？哪件事值得记下来，哪件事可以放下？&#10;输入后会自动保存。">' + U.escapeHTML(saved.summary) + '</textarea>' +
        '<p class="tiny muted week-summary-foot">按 ISO 周保存：' + weekKey + ' · 最近保存 ' +
          U.escapeHTML(D.formatSaved(saved.updatedAt)) + '</p>' +
      '</section>';
  }

  /* -------------------------------- 渲染 -------------------------------- */

  function render(route) {
    var today = D.today();
    var date = D.safeDate(route && route.date ? route.date : today);
    var start = D.weekStart(date);
    var end = D.addDays(start, 6);
    var weekKey = D.isoWeekKey(start);
    var focusCourseId = route && route.courseId ? String(route.courseId) : '';
    var days = PP.courseData.weekTimeline(start);
    var termInfo = PP.courseData.termInfo(start);
    var courseCount = days.reduce(function (total, day) {
      return total + day.cells.filter(function (cell) { return cell.kind === 'course'; }).length;
    }, 0);
    var inThisWeek = today >= start && today <= end;
    var prevWeek = D.addDays(start, -7);
    var nextWeek = D.addDays(start, 7);

    var chips = '<div class="library-meta week-meta">' +
        '<span>' + ui.icon('calendar', 13) + weekKey + '</span>' +
        '<span>' + ui.icon('clock', 13) + (termInfo.inTerm ? '学期第 ' + termInfo.week + ' 周' : termInfo.label) + '</span>' +
        '<span>' + ui.icon('book', 13) + '本周 ' + courseCount + ' 格课程</span>' +
        (inThisWeek
          ? '<span class="chip chip-primary">' + ui.icon('today', 11) + '本周包含今天</span>'
          : '<a class="chip" href="#/week/' + today + '">' + ui.icon('arrowRight', 11) + '回到本周</a>') +
        (focusCourseId ? '<span class="chip chip-warning">' + ui.icon('sparkles', 11) + '已定位课程</span>' : '') +
      '</div>';

    return '<div class="page-shell week-page">' +
        '<header class="page-head week-head">' +
          '<div class="page-head-copy">' +
            '<span class="eyebrow">WEEKLY VIEW</span>' +
            '<h1>每周</h1>' +
            '<p class="lede">以周一为首日的一周横向视图：左边是时间刻度的 48 格时间轴，下面跟着本周截止、本周打卡和一段可以慢慢写的小结。</p>' +
            chips +
          '</div>' +
          '<div class="page-head-actions">' +
            '<nav class="week-nav" data-week-nav aria-label="切换周">' +
              '<a class="btn btn-sm" href="#/week/' + prevWeek + '" aria-label="上一周">' + ui.icon('chevronLeft', 14) + '上一周</a>' +
              '<a class="btn btn-sm btn-soft" href="#/week/' + (inThisWeek ? start : today) + '">' + ui.icon('today', 14) + '本周</a>' +
              '<a class="btn btn-sm" href="#/week/' + nextWeek + '" aria-label="下一周">下一周' + ui.icon('chevronRight', 14) + '</a>' +
            '</nav>' +
            '<a class="btn btn-sm btn-ghost" href="#/day/' + date + '">' + ui.icon('day', 14) + '打开每日页</a>' +
          '</div>' +
        '</header>' +

        renderWeekGrid(days, focusCourseId, today) +

        '<div class="week-bottom">' +
          renderWeekDeadlines(days) +
          renderWeekHabits(days) +
        '</div>' +

        renderWeekSummary(weekKey) +
      '</div>';
  }

  /* -------------------------------- 挂载 -------------------------------- */

  function mount(root, route) {
    var today = D.today();
    var date = D.safeDate(route && route.date ? route.date : today);
    var weekKey = D.isoWeekKey(D.weekStart(date));

    var textarea = root.querySelector('[data-week-summary]');
    var saveState = root.querySelector('[data-week-save]');
    if (textarea) {
      ui.bindAutoSave(textarea, function (value) {
        PP.data.setWeekSummary(weekKey, value);
        return true;
      }, saveState, { delay: 480 });
    }

    // 从每日页点课过来时，把目标课程滚到视野中间并轻微强调一下
    var focus = root.querySelector('.wk-cell.is-focus');
    if (focus) {
      window.setTimeout(function () {
        focus.scrollIntoView({ behavior: 'smooth', block: 'center' });
        focus.classList.add('is-focus-pulse');
      }, 120);
    }
  }

  PP.pages.week = { render: render, mount: mount };
}());
