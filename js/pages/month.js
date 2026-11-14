/* ==========================================================================
   月份页：完整月历 + 本月重要日期
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;
  var MONTH_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  function render(route) {
    var ym = D.safeMonth(route.ym);
    var year = Number(ym.slice(0, 4));
    var month = Number(ym.slice(5, 7));
    var calendar = D.monthCalendar(year, month);
    var days = PP.data.getDays();
    var checkins = PP.data.getCheckins();
    var important = PP.data.getImportantForMonth(ym);
    var importantByDate = {};
    important.forEach(function (item) {
      if (!importantByDate[item.date]) importantByDate[item.date] = [];
      importantByDate[item.date].push(item);
    });
    var stats = PP.data.getMonthStats(ym);
    var deadlines = PP.data.getTodosForMonth(ym);
    var deadlineByDate = {};
    deadlines.forEach(function (item) {
      var date = item.due.slice(0, 10);
      if (!deadlineByDate[date]) deadlineByDate[date] = [];
      deadlineByDate[date].push(item);
    });
    var today = D.today();
    var prevYm = D.addMonths(ym, -1);
    var nextYm = D.addMonths(ym, 1);
    var prevValid = Number(prevYm.slice(0, 4)) >= PP.SUPPORTED_YEARS.min;
    var nextValid = Number(nextYm.slice(0, 4)) <= PP.SUPPORTED_YEARS.max;
    var monthSummary = PP.data.getMonthSummary(ym);

    var weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    var cells = '';
    var index;
    for (index = 0; index < calendar.offset; index += 1) {
      cells += '<span class="month-cell is-blank" aria-hidden="true"></span>';
    }

    calendar.days.forEach(function (item) {
      var record = days[item.iso] || {};
      var moodEntries = Array.isArray(record.moods) ? record.moods : [];
      var mood = moodEntries.length && PP.MOOD_MAP[moodEntries[0].mood] ? PP.MOOD_MAP[moodEntries[0].mood] : null;
      var checked = !!checkins[item.iso];
      var events = importantByDate[item.iso] || [];
      var dueItems = deadlineByDate[item.iso] || [];
      var todos = Array.isArray(record.todos) ? record.todos : [];
      var todoDone = todos.filter(function (todo) { return todo.done; }).length;
      var term = PP.Solar.termOn(item.iso);
      var festivalList = PP.Lunar.festivals(item.iso);
      var classes = ['month-cell'];
      if (D.isToday(item.iso)) classes.push('is-today');
      if (checked) classes.push('is-checked');
      if (events.length) classes.push('has-important');
      if (dueItems.length) classes.push('has-deadline');
      if (term) classes.push('has-term');
      if (festivalList.length) classes.push('has-festival');
      var date = D.parseISO(item.iso);
      if (date && (date.getDay() === 0 || date.getDay() === 6)) classes.push('is-weekend');

      var lunar = PP.Lunar.info(item.iso);
      var calendarLabel = festivalList[0] || (term ? term.name : lunar.short || '');
      var label = D.fullDateCN(item.iso) + '，' + D.weekday(item.iso) + '，' + lunar.text;
      if (term) label += '，节气' + term.name;
      if (festivalList.length) label += '，' + festivalList.join('、');
      if (mood) label += '，' + moodEntries.length + ' 条心情，最近一条' + mood.label;
      if (checked) label += '，有习惯打卡';
      if (events.length) label += '，重要日期：' + events.map(function (event) { return event.title; }).join('、');
      if (dueItems.length) label += '，待办截止：' + dueItems.map(function (entry) { return entry.text; }).join('、');
      if (todos.length) label += '，每日待办 ' + todoDone + '/' + todos.length;

      var chips = [];
      events.slice(0, 1).forEach(function (event) {
        chips.push('<span class="cell-event" title="重要日期：' + U.escapeAttr(event.title) + '">' + U.escapeHTML(event.title) + '</span>');
      });
      dueItems.slice(0, 1).forEach(function (entry) {
        chips.push('<span class="cell-event is-deadline" title="待办截止：' + U.escapeAttr(entry.text) + '">截止 · ' + U.escapeHTML(entry.text) + '</span>');
      });
      var hidden = Math.max(0, events.length - 1) + Math.max(0, dueItems.length - 1);
      if (hidden) chips.push('<span class="cell-event is-more">+' + hidden + '</span>');

      cells += '<button class="' + classes.join(' ') + '" type="button" data-go="#/day/' + item.iso + '" ' +
        'aria-label="' + U.escapeAttr(label) + '"' +
        (mood ? ' style="--mood:' + mood.color + '"' : '') + '>' +
        '<span class="cell-top">' +
          '<span class="cell-day">' + item.day + '</span>' +
          '<span class="cell-mood">' + (mood ? mood.emoji : '') + (moodEntries.length > 1 ? '<em class="cell-mood-count">' + moodEntries.length + '</em>' : '') + '</span>' +
        '</span>' +
        '<span class="cell-lunar' + (festivalList.length ? ' is-festival' : term ? ' is-term' : '') + '">' + U.escapeHTML(calendarLabel) + '</span>' +
        '<span class="cell-events">' + chips.join('') + '</span>' +
        '<span class="cell-foot">' +
          (todos.length ? '<span class="cell-todo">' + todoDone + '/' + todos.length + ' 待办</span>' : '<span></span>') +
          (checked ? '<span class="cell-check" title="有习惯打卡">' + ui.icon('check', 11) + '</span>' : '') +
        '</span>' +
      '</button>';
    });

    var importantListHTML = important.length
      ? '<div class="important-list">' + important.map(function (item) {
          var date = D.parseISO(item.date);
          return '<div class="important-item">' +
            '<a class="important-date-box" href="#/day/' + item.date + '">' +
              '<strong>' + date.getDate() + '</strong>' +
              '<span>' + D.weekdayShort(item.date) + '</span>' +
            '</a>' +
            '<a class="important-content" href="#/day/' + item.date + '">' +
              '<span class="important-title-row">' +
                '<strong>' + U.escapeHTML(item.title) + '</strong>' +
                '<span class="chip chip-primary">' + D.shortDateCN(item.date) + '</span>' +
              '</span>' +
              (item.note ? '<span class="important-note">' + U.escapeHTML(item.note) + '</span>' : '') +
            '</a>' +
            '<button class="icon-btn is-small" type="button" data-edit-important data-date="' + item.date + '" data-id="' + U.escapeAttr(item.id) + '" aria-label="编辑重要日期 ' + U.escapeAttr(item.title) + '" title="编辑">' + ui.icon('pencil', 13) + '</button>' +
            '<button class="icon-btn is-small is-danger" type="button" data-remove-important data-date="' + item.date + '" data-id="' + U.escapeAttr(item.id) + '" aria-label="删除重要日期 ' + U.escapeAttr(item.title) + '" title="删除">' + ui.icon('trash', 14) + '</button>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="important-group-empty">还没有手动标记的重要日期。</p>';

    var deadlineListHTML = deadlines.length
      ? '<div class="important-list">' + deadlines.map(function (item) {
          var due = D.formatDue(item.due);
          var date = D.parseISO(item.due.slice(0, 10));
          return '<a class="important-item is-deadline-link" href="#/todos/' + U.escapeAttr(item.id) + '">' +
            '<span class="important-date-box deadline-date-box">' +
              '<strong>' + (date ? date.getDate() : '—') + '</strong>' +
              '<span>' + (date ? D.weekdayShort(item.due.slice(0, 10)) : '截止') + '</span>' +
            '</span>' +
            '<span class="important-content">' +
              '<span class="important-title-row">' +
                '<strong>' + U.escapeHTML(item.text) + '</strong>' +
                '<span class="chip ' + (item.done ? 'chip-success' : due.tone === 'danger' ? 'chip-danger' : 'chip-warning') + '">' + (item.done ? '已完成' : due.relative) + '</span>' +
              '</span>' +
              '<span class="deadline-line">' + ui.icon('clock', 11) + due.text + (item.place ? ' · ' + U.escapeHTML(item.place) : '') + '</span>' +
            '</span>' +
            '<span class="deadline-jump">' + ui.icon('arrowRight', 14) + '</span>' +
          '</a>';
        }).join('') + '</div>'
      : '<p class="important-group-empty">本月还没有带截止时间的待办。</p>';

    var importantHTML = '<div class="important-groups">' +
      '<div class="important-group">' +
        '<div class="important-group-head"><h3>重要日期 <span class="badge">' + important.length + '</span></h3><span class="tiny muted">手动标记</span></div>' +
        importantListHTML +
      '</div>' +
      '<div class="important-group">' +
        '<div class="important-group-head"><h3>待办截止 <span class="badge">' + deadlines.length + '</span></h3><span class="tiny muted">来自待办页 · 点击定位</span></div>' +
        deadlineListHTML +
      '</div>' +
    '</div>';

    function navButton(href, valid, iconName, label) {
      return '<a class="icon-btn" href="' + href + '" aria-label="' + label + '"' +
        (valid ? '' : ' aria-disabled="true" tabindex="-1"') + '>' + ui.icon(iconName, 17) + '</a>';
    }

    return '<div class="page-shell month-page">' +
      '<header class="month-head">' +
        '<div class="month-head-copy">' +
          '<span class="eyebrow">' + MONTH_EN[month - 1] + ' · MONTHLY CALENDAR</span>' +
          '<div class="month-title-line">' +
            '<a class="month-number-link" href="#/month-summary/' + ym + '" title="打开本月总结" aria-label="打开 ' + ym + ' 月份总结">' + U.pad2(month) + '</a>' +
            '<div>' +
              '<h1>' + PP.MONTH_NAMES[month - 1] + ' <span>' + year + '</span></h1>' +
              '<p>' + stats.totalDays + ' 天里的每一次出现，都值得被看见。</p>' +
            '</div>' +
          '</div>' +
          '<div class="month-meta-line">' +
            '<span>' + ui.icon('calendar', 13) + '本月 ' + stats.totalDays + ' 天</span>' +
            '<span>' + ui.icon('check', 13) + '习惯打卡 ' + stats.checkinCount + ' 天</span>' +
            '<span>' + ui.icon('heart', 13) + '心情 ' + stats.moodEntries + ' 条</span>' +
            '<span>' + ui.icon('todo', 13) + '每日待办完成率 ' + stats.todoRate + '%</span>' +
            '<span>' + ui.icon('clock', 13) + '待办截止 ' + stats.deadlineCount + ' 项</span>' +
          '</div>' +
        '</div>' +
        '<div class="month-head-actions">' +
          '<div class="month-nav">' +
            navButton('#/month/' + prevYm, prevValid, 'chevronLeft', '上个月') +
            '<a class="btn btn-sm" href="#/month/' + today.slice(0, 7) + '">' + ui.icon('today', 14) + '本月</a>' +
            navButton('#/month/' + nextYm, nextValid, 'chevronRight', '下个月') +
          '</div>' +
          '<a class="btn btn-primary" href="#/month-summary/' + ym + '">' + ui.icon('sparkles', 15) + '本月总结</a>' +
        '</div>' +
      '</header>' +

      '<section class="panel month-calendar-panel">' +
        '<div class="month-calendar-toolbar">' +
          '<div class="calendar-legend">' +
            '<span><i class="legend-dot legend-mood"></i>心情</span>' +
            '<span><i class="legend-dot legend-check"></i>习惯打卡</span>' +
            '<span><i class="legend-star">✦</i>重要日期</span>' +
            '<span><i class="legend-deadline"></i>待办截止</span>' +
          '</div>' +
          '<button class="btn btn-sm btn-soft" type="button" data-add-important>' + ui.icon('plus', 14) + '添加重要日期</button>' +
        '</div>' +
        '<div class="month-week-row" aria-hidden="true">' +
          weekdays.map(function (weekday) { return '<span>' + weekday + '</span>'; }).join('') +
        '</div>' +
        '<div class="month-grid">' + cells + '</div>' +
      '</section>' +

      '<section class="panel important-panel" id="importantDates">' +
        '<div class="section-head">' +
          '<div>' +
            '<span class="section-kicker">IMPORTANT DATES & DEADLINES</span>' +
            '<h2>' + ui.icon('sparkles', 17) + '本月重要日期 <span class="badge">' + (important.length + deadlines.length) + '</span></h2>' +
          '</div>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-add-important>' + ui.icon('plus', 14) + '添加</button>' +
        '</div>' +
        '<p class="important-intro">重要日期来自本页手动登记；待办截止直接读取待办页的同一份数据。两类标记不同，点击待办条目会回到待办页并高亮该事项。</p>' +
        importantHTML +
        (monthSummary.text ? '<div class="important-summary-preview"><span class="section-kicker">本月总结已写</span><p>' + U.escapeHTML(U.truncate(monthSummary.text, 120)) + '</p><a class="link-btn" href="#/month-summary/' + ym + '">继续写 →</a></div>' : '') +
      '</section>' +
    '</div>';
  }

  function openImportantModal(options) {
    var opts = options || {};
    var item = opts.item || null;
    var isoOfItem = item && item.date ? String(item.date) : '';
    var targetDate = opts.date || isoOfItem;
    var ym = opts.ym || (targetDate ? String(targetDate).slice(0, 7) : D.today().slice(0, 7));
    var year = Number(ym.slice(0, 4));
    var month = Number(ym.slice(5, 7));
    var defaultDate = targetDate && String(targetDate).slice(0, 7) === ym
      ? String(targetDate)
      : (D.today().slice(0, 7) === ym ? D.today() : ym + '-01');
    var formId = 'importantForm-' + Date.now();
    var isEdit = !!item;

    ui.modal({
      title: isEdit ? '编辑重要日期' : '添加重要日期',
      subtitle: isEdit ? (D.monthTitle(ym) + ' · 改日期、名称或备注，保存即生效') : (D.monthTitle(ym) + ' · 只记录真正不想错过的日子'),
      body: '<form id="' + formId + '" class="important-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">日期</span>' +
            '<input type="date" name="date" required min="' + ym + '-01" max="' + ym + '-' + U.pad2(D.daysInMonth(year, month)) + '" value="' + defaultDate + '">' +
          '</label>' +
          '<label class="field"><span class="field-label">名称</span>' +
            '<input type="text" name="title" required maxlength="50" placeholder="例如：英语四级考试" value="' + (item ? U.escapeAttr(item.title) : '') + '"' + (isEdit ? '' : ' data-autofocus') + '>' +
          '</label>' +
          '<label class="field span-2"><span class="field-label">备注 <span class="optional">可选</span></span>' +
            '<textarea name="note" rows="3" maxlength="300" placeholder="时间、地点、要带的东西……">' + (item ? U.escapeHTML(item.note || '') : '') + '</textarea>' +
          '</label>' +
        '</div>' +
      '</form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button>' +
        '<button class="btn btn-primary" type="submit" form="' + formId + '">' + ui.icon(isEdit ? 'pencil' : 'plus', 15) + (isEdit ? '保存修改' : '保存日期') + '</button>',
      onMount: function (body, close) {
        var form = body.querySelector('form');
        if (isEdit) {
          var titleInput = form.querySelector('[name="title"]');
          if (titleInput) { titleInput.focus(); titleInput.select(); }
        }
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var data = new FormData(form);
          var date = String(data.get('date') || '');
          var title = String(data.get('title') || '').trim();
          var note = String(data.get('note') || '').trim();
          if (!D.parseISO(date)) {
            ui.toast('请选择有效日期。', 'warning');
            return;
          }
          if (date.slice(0, 7) !== ym) {
            ui.toast('请选择 ' + D.monthTitle(ym) + ' 内的日期。', 'warning');
            return;
          }
          if (!title) {
            ui.toast('请填写重要日期的名称。', 'warning');
            return;
          }
          if (isEdit) {
            PP.data.updateImportant(isoOfItem, item.id, { date: date, title: title, note: note });
            close();
            ui.toast(isoOfItem && isoOfItem !== date ? ('重要日期已移到 ' + D.shortDateCN(date) + '。') : '重要日期已更新。', 'success');
          } else {
            PP.data.addImportant(date, title, note);
            close();
            ui.toast('重要日期已添加。', 'success');
          }
          PP.router.refresh();
        });
      }
    });
  }

  function mount(root, route) {
    var ym = D.safeMonth(route.ym);
    root.querySelectorAll('[data-add-important]').forEach(function (button) {
      button.addEventListener('click', function () { openImportantModal({ ym: ym }); });
    });

    root.querySelectorAll('[data-edit-important]').forEach(function (button) {
      button.addEventListener('click', function () {
        var date = button.getAttribute('data-date');
        var id = button.getAttribute('data-id');
        var item = PP.data.getImportant(date).filter(function (entry) { return entry.id === id; })[0];
        if (!item) {
          ui.toast('这条重要日期已经不在了，刷新后再试。', 'warning');
          return;
        }
        openImportantModal({ item: { id: item.id, date: date, title: item.title, note: item.note } });
      });
    });

    root.querySelectorAll('[data-remove-important]').forEach(function (button) {
      button.addEventListener('click', function () {
        var date = button.getAttribute('data-date');
        var id = button.getAttribute('data-id');
        var item = PP.data.getImportant(date).filter(function (entry) { return entry.id === id; })[0];
        ui.confirm({
          title: '删除重要日期',
          message: '确定删除「<strong>' + U.escapeHTML(item ? item.title : '这个日期') + '</strong>」吗？',
          confirmText: '删除'
        }).then(function (confirmed) {
          if (!confirmed) return;
          PP.data.removeImportant(date, id);
          ui.toast('重要日期已删除。', 'success');
          PP.router.refresh();
        });
      });
    });
  }

  PP.pages.month = {
    render: render,
    mount: mount,
    // 供每日页复用：openImportantModal({ date: '2026-10-31' }) 或 { item: {...} }
    openImportantModal: openImportantModal
  };
}());
