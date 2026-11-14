/* ==========================================================================
   每日页：多时段心情、今日待办、今日总结、多习惯打卡、文字动线
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  function withinRange(iso) {
    var year = Number(String(iso).slice(0, 4));
    return year >= PP.SUPPORTED_YEARS.min && year <= PP.SUPPORTED_YEARS.max;
  }

  function periodLabel(key) {
    return PP.MOOD_PERIOD_MAP[key] ? PP.MOOD_PERIOD_MAP[key].label : '自定义';
  }

  function render(route) {
    var date = D.safeDate(route.date);
    var day = PP.data.getDay(date);
    var moods = PP.data.getDayMoods(date);
    var lunar = PP.Lunar.info(date);
    var term = PP.Solar.termOn(date);
    var festivals = PP.Lunar.festivals(date);
    var important = PP.data.getImportant(date);
    var dueToday = PP.data.getTodosForDate(date);
    var parse = D.parseISO(date);
    var year = parse.getFullYear();
    var month = parse.getMonth() + 1;
    var ym = date.slice(0, 7);
    var isToday = date === D.today();
    var todos = PP.data.getSortedDayTodos(date);
    var todoDone = todos.filter(function (item) { return item.done; }).length;
    var monthHabitStats = PP.data.getMonthHabitStats(ym);
    var checkinDays = PP.data.getMonthCheckinDates(ym).length;
    var totalDays = D.daysInMonth(year, month);
    var calendar = D.monthCalendar(year, month);
    var weekOfMonth = Math.ceil((parse.getDate() + calendar.offset) / 7);
    var dayOfYear = Math.round((Date.UTC(year, parse.getMonth(), parse.getDate()) - Date.UTC(year, 0, 1)) / 86400000) + 1;
    var daysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
    var prevDate = D.addDays(date, -1);
    var nextDate = D.addDays(date, 1);
    var prevValid = withinRange(prevDate);
    var nextValid = withinRange(nextDate);

    var chips = '';
    chips += isToday ? '<span class="chip chip-success">' + ui.icon('today', 12) + '今天</span>' : '<span class="chip">' + ui.icon('calendar', 12) + '第 ' + dayOfYear + ' 天</span>';
    chips += '<span class="chip">第 ' + weekOfMonth + ' 周</span>';
    if (term) chips += '<span class="chip chip-primary">节气 · ' + U.escapeHTML(term.name) + '</span>';
    festivals.forEach(function (name) {
      chips += '<span class="chip chip-warning">' + U.escapeHTML(name) + '</span>';
    });
    important.slice(0, 2).forEach(function (item) {
      chips += '<span class="chip chip-primary day-important-chip" title="' + U.escapeAttr(item.note || item.title) + '">' + ui.icon('sparkles', 12) + U.escapeHTML(item.title) + '</span>';
    });
    if (important.length > 2) chips += '<span class="chip">+' + (important.length - 2) + '</span>';

    var importantAside = important.length
      ? important.map(function (item) {
          return '<div class="day-important-item">' +
              '<div class="day-important-item-head"><strong>' + U.escapeHTML(item.title) + '</strong>' +
                '<button class="icon-btn is-small" type="button" data-edit-day-important data-id="' + U.escapeAttr(item.id) + '" aria-label="编辑重要日期 ' + U.escapeAttr(item.title) + '" title="编辑">' + ui.icon('pencil', 12) + '</button>' +
              '</div>' +
              (item.note ? '<p>' + U.escapeHTML(item.note) + '</p>' : '') +
            '</div>';
        }).join('')
      : '<p class="tiny muted">这一天没有登记重要日期。</p>';

    var dueAside = dueToday.length
      ? dueToday.map(function (item) {
          var due = D.formatDue(item.due);
          return '<a class="day-due-item" href="#/todos/' + U.escapeAttr(item.id) + '">' +
            '<span><strong>' + U.escapeHTML(item.text) + '</strong><em>' + U.escapeHTML(due.text) + (item.place ? ' · ' + U.escapeHTML(item.place) : '') + '</em></span>' +
            '<span class="chip ' + (item.done ? 'chip-success' : due.tone === 'danger' ? 'chip-danger' : 'chip-warning') + '">' + (item.done ? '已完成' : due.relative) + '</span>' +
          '</a>';
        }).join('')
      : '<p class="tiny muted">这一天没有待办截止。</p>';

    var moodOptions = PP.MOODS.map(function (mood) {
      return '<button class="mood-quick" type="button" data-mood-choice="' + mood.key + '" style="--mood:' + mood.color + '" aria-pressed="false">' +
        '<span>' + mood.emoji + '</span><em>' + mood.label + '</em>' +
      '</button>';
    }).join('');

    var nowHour = Number(D.nowTime().slice(0, 2));
    var currentPeriod = nowHour >= 6 && nowHour < 9 ? 'morning'
      : nowHour >= 9 && nowHour < 12 ? 'forenoon'
      : nowHour >= 12 && nowHour < 14 ? 'noon'
      : nowHour >= 14 && nowHour < 17 ? 'afternoon'
      : nowHour >= 17 && nowHour < 19 ? 'evening'
      : nowHour >= 19 && nowHour < 23 ? 'evening2'
      : 'late';
    var periodOptions = PP.MOOD_PERIODS.map(function (period) {
      return '<option value="' + period.key + '"' + (period.key === currentPeriod ? ' selected' : '') + '>' + period.label + '</option>';
    }).join('');

    return '<div class="page-shell day-page">' +
      '<header class="day-hero">' +
        '<div class="day-hero-copy">' +
          '<a class="day-month-link" href="#/month/' + ym + '">' + year + ' 年 ' + month + ' 月 · 月历 ' + ui.icon('arrowUpRight', 12) + '</a>' +
          '<span class="eyebrow">DAILY PAGE</span>' +
          '<div class="day-date-row">' +
            '<h1 class="day-big-number">' + parse.getDate() + '</h1>' +
            '<div class="day-date-meta"><strong>' + D.weekday(date) + '</strong><span>' + D.fullDateCN(date) + '</span></div>' +
          '</div>' +
          '<p class="day-lunar">' + U.escapeHTML(lunar.supported ? lunar.full + ' · 属' + lunar.zodiac : lunar.text) + '</p>' +
          '<div class="day-hero-chips">' + chips + '</div>' +
        '</div>' +
        '<div class="day-hero-side">' +
          '<div class="day-nav">' +
            '<a class="icon-btn" href="#/day/' + (prevValid ? prevDate : date) + '" aria-label="前一天"' + (prevValid ? '' : ' aria-disabled="true" tabindex="-1"') + '>' + ui.icon('chevronLeft', 17) + '</a>' +
            '<a class="btn btn-sm" href="#/day/' + D.today() + '">' + ui.icon('today', 14) + '今天</a>' +
            '<a class="icon-btn" href="#/day/' + (nextValid ? nextDate : date) + '" aria-label="后一天"' + (nextValid ? '' : ' aria-disabled="true" tabindex="-1"') + '>' + ui.icon('chevronRight', 17) + '</a>' +
          '</div>' +
          '<a class="day-mood-link" href="#/moods/' + ym + '">' + ui.icon('heart', 14) + '本月心情一览' + ui.icon('arrowRight', 13) + '</a>' +
        '</div>' +
      '</header>' +

      '<div class="day-layout">' +
        '<div class="day-main">' +
          '<section class="panel mood-card day-mood-card">' +
            '<span class="mood-watermark" aria-hidden="true">◌</span>' +
            '<div class="section-head mood-card-head">' +
              '<div><span class="section-kicker">MOOD CHECK-IN</span><h2><a href="#/moods/' + ym + '">今天的心情</a> <span class="badge" data-mood-count>' + moods.length + '</span></h2></div>' +
              '<a class="btn btn-sm btn-ghost" href="#/moods/' + ym + '">本月一览 ' + ui.icon('arrowRight', 13) + '</a>' +
            '</div>' +
            '<div class="mood-entry-list" data-mood-list>' + renderMoodEntries(moods) + '</div>' +
            '<form class="mood-entry-form" data-mood-form>' +
              '<div class="mood-quick-row" data-mood-choice-row>' + moodOptions + '</div>' +
              '<div class="mood-form-meta">' +
                '<label class="field"><span class="field-label">时段</span><select name="period" data-mood-period>' + periodOptions + '</select></label>' +
                '<label class="field"><span class="field-label">时间</span><input type="time" name="time" value="' + D.nowTime() + '" required></label>' +
                '<button class="btn btn-primary" type="submit">' + ui.icon('plus', 15) + '记录这一条</button>' +
              '</div>' +
              '<p class="mood-form-hint">同一天可以记录多条。选择时段后可以微调具体时间，点表情后保存。</p>' +
            '</form>' +
          '</section>' +

          '<section class="habits-section">' +
            '<div class="section-head habits-head">' +
              '<div><span class="section-kicker">HABIT CHECK-IN</span><h2>' + ui.icon('check', 17) + '习惯打卡</h2></div>' +
              '<div class="section-actions"><span class="tiny muted" data-checkin-days-label>本月共 ' + checkinDays + ' 天有打卡</span><button class="btn btn-sm btn-soft" type="button" data-add-habit>' + ui.icon('plus', 14) + '新增习惯</button></div>' +
            '</div>' +
            '<div class="habit-grid" data-habit-grid>' + renderHabitCards(monthHabitStats, ym) + '</div>' +
          '</section>' +

          '<section class="panel day-todo-panel">' +
            '<div class="section-head">' +
              '<div><span class="section-kicker">TODAY’S TASKS</span><h2>' + ui.icon('todo', 17) + '今日待办 <span class="badge" data-todo-count>' + todos.length + '</span></h2></div>' +
              '<span class="todo-progress" data-todo-progress>' + (todos.length ? '完成 ' + todoDone + ' / ' + todos.length : '还没有待办') + '</span>' +
            '</div>' +
            '<form class="day-todo-form" data-day-todo-form>' +
              '<input type="text" data-day-todo-input maxlength="120" placeholder="写下一件今天要完成的小事…" aria-label="新的今日待办" autocomplete="off">' +
              '<button class="btn btn-primary" type="submit">' + ui.icon('plus', 15) + '添加</button>' +
            '</form>' +
            '<div class="day-todo-list-wrap" data-day-todo-list>' + renderTodoList(todos) + '</div>' +
          '</section>' +

          '<section class="panel day-summary-panel">' +
            '<div class="section-head">' +
              '<div><span class="section-kicker">DAILY NOTE</span><h2>' + ui.icon('writing', 17) + '今日总结</h2></div>' +
              '<span class="save-state" data-day-save>' + (day.summary ? '自动保存已开启' : '尚未填写') + '</span>' +
            '</div>' +
            '<textarea class="day-summary-textarea" data-day-summary rows="6" maxlength="5000" placeholder="今天发生了什么？有什么想记住的、想放下的？&#10;输入后会自动保存。">' + U.escapeHTML(day.summary) + '</textarea>' +
          '</section>' +

          '<section class="panel timeline-panel">' +
            '<div class="section-head">' +
              '<div><span class="section-kicker">MOVEMENT LOG</span><h2>' + ui.icon('mapPin', 17) + '今日动线记录</h2></div>' +
              '<span class="tiny muted">纯文字时间线 · 时间 / 地点 / 事件</span>' +
            '</div>' +
            '<form class="timeline-form" data-timeline-form>' +
              '<label class="field timeline-time-field"><span class="field-label">时间</span><input type="time" name="time" required value="' + D.nowTime() + '"></label>' +
              '<label class="field timeline-place-field"><span class="field-label">地点</span><input type="text" name="place" required maxlength="60" placeholder="例如：图书馆"></label>' +
              '<label class="field timeline-event-field"><span class="field-label">事件</span><input type="text" name="event" required maxlength="140" placeholder="做了什么、见了谁…"></label>' +
              '<button class="btn btn-primary" type="submit">' + ui.icon('plus', 15) + '记录</button>' +
            '</form>' +
            '<div class="timeline-list" data-timeline-list>' + renderTimelineList(day.timeline) + '</div>' +
          '</section>' +
        '</div>' +

        '<aside class="day-aside">' +
          '<section class="panel date-facts-card">' +
            '<span class="section-kicker">DATE NOTES</span>' +
            '<h2>日期档案</h2>' +
            '<dl class="date-facts">' +
              '<div><dt>阳历</dt><dd>' + D.fullDateCN(date) + '</dd></div>' +
              '<div><dt>农历</dt><dd>' + U.escapeHTML(lunar.text) + '</dd></div>' +
              '<div><dt>星期</dt><dd>' + D.weekday(date) + '</dd></div>' +
              '<div><dt>干支 / 生肖</dt><dd>' + (lunar.supported ? lunar.ganzhi + ' · ' + lunar.zodiac : '—') + '</dd></div>' +
              '<div><dt>节气</dt><dd>' + (term ? U.escapeHTML(term.name) : '—') + '</dd></div>' +
              '<div><dt>传统节日</dt><dd>' + (festivals.length ? U.escapeHTML(festivals.join('、')) : '—') + '</dd></div>' +
              '<div><dt>今年第</dt><dd>' + dayOfYear + ' / ' + daysInYear + ' 天</dd></div>' +
              '<div><dt>本月第</dt><dd>' + parse.getDate() + ' / ' + totalDays + ' 天</dd></div>' +
            '</dl>' +
            '<div class="day-important-block">' +
              '<div class="day-important-head"><h3>' + ui.icon('sparkles', 14) + '当天的重要日期</h3>' +
                '<button class="btn btn-xs btn-soft" type="button" data-add-day-important>' + ui.icon('plus', 12) + '添加</button>' +
              '</div>' + importantAside +
              '<h3 style="margin-top:14px">' + ui.icon('clock', 14) + '当天待办截止</h3>' + dueAside +
            '</div>' +
          '</section>' +
          '<section class="day-small-quote"><span>“</span><p>记录不是为了证明什么，只是让今天有一个可以回去的地方。</p></section>' +
        '</aside>' +
      '</div>' +
    '</div>';
  }

  function renderMoodEntries(moods) {
    if (!moods.length) {
      return '<div class="mini-empty">' + ui.icon('heart', 16) + '<span>今天还没有心情记录。选一个表情，再选一个时段。</span></div>';
    }
    return '<div class="mood-entry-list-inner">' + moods.map(function (entry) {
      var mood = PP.MOOD_MAP[entry.mood];
      if (!mood) return '';
      return '<div class="mood-entry" data-mood-id="' + U.escapeAttr(entry.id) + '" style="--mood:' + mood.color + '">' +
        '<div class="mood-entry-time"><strong>' + U.escapeHTML(entry.time) + '</strong><span>' + U.escapeHTML(periodLabel(entry.period)) + '</span></div>' +
        '<span class="mood-entry-face">' + mood.emoji + '</span>' +
        '<div class="mood-entry-body"><strong>' + mood.label + '</strong>' + (entry.note ? '<p>' + U.escapeHTML(entry.note) + '</p>' : '') + '</div>' +
        '<div class="mood-entry-actions">' +
          '<button class="icon-btn is-small" type="button" data-mood-edit aria-label="编辑这条心情">' + ui.icon('pencil', 13) + '</button>' +
          '<button class="icon-btn is-small is-danger" type="button" data-mood-delete aria-label="删除这条心情">' + ui.icon('trash', 13) + '</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderHabitCards(stats, ym) {
    if (!stats.length) {
      return '<div class="habit-empty panel">' + ui.emptyState('✅', '还没有习惯', '给想坚持的事情建一张打卡卡，例如喝水、阅读或早睡。', '<button class="btn btn-sm btn-primary" type="button" data-add-habit>' + ui.icon('plus', 14) + '新增第一个习惯</button>') + '</div>';
    }
    var totalDays = D.daysInMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
    var today = D.today();
    return stats.map(function (item) {
      var habit = item.habit;
      var cells = '';
      for (var day = 1; day <= totalDays; day += 1) {
        var iso = ym + '-' + U.pad2(day);
        var checked = item.dates.indexOf(iso) >= 0;
        var classes = ['checkin-cell'];
        if (checked) classes.push('is-checked');
        if (iso === today) classes.push('is-today');
        cells += '<button class="' + classes.join(' ') + '" type="button" data-habit-toggle data-habit-id="' + U.escapeAttr(habit.id) + '" data-date="' + iso + '" ' +
          'aria-pressed="' + String(checked) + '" title="' + D.shortDateCN(iso) + ' · ' + (checked ? '已打卡' : '打卡') + '" ' +
          'style="--habit:' + habit.color + '">' + day + '</button>';
      }
      var rate = Math.round(item.count / totalDays * 100);
      return '<article class="panel habit-card" data-habit-card data-habit-id="' + U.escapeAttr(habit.id) + '" style="--habit:' + habit.color + '">' +
        '<div class="habit-head">' +
          '<div class="habit-name"><span class="habit-icon">' + U.escapeHTML(habit.icon || '●') + '</span><div><strong>' + U.escapeHTML(habit.name) + '</strong><small>本月已打卡 <b>' + item.count + '</b> 天</small></div></div>' +
          '<div class="habit-actions">' +
            '<button class="icon-btn is-small" type="button" data-habit-edit aria-label="重命名或修改习惯">' + ui.icon('pencil', 13) + '</button>' +
            '<button class="icon-btn is-small is-danger" type="button" data-habit-delete aria-label="删除习惯">' + ui.icon('trash', 13) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="checkin-meter"><span style="width:' + rate + '%"></span></div>' +
        '<div class="checkin-strip">' + cells + '</div>' +
        '<p class="tiny muted checkin-tip">点击格子打卡，再点一次取消。</p>' +
      '</article>';
    }).join('');
  }

  function renderTodoList(todos) {
    if (!todos.length) {
      return '<div class="mini-empty">' + ui.icon('sparkles', 16) + '<span>还没有待办。先写下一件最小的事。</span></div>';
    }
    return '<ul class="day-todo-list">' + todos.map(function (todo) {
      return '<li class="day-todo-item' + (todo.done ? ' is-done' : '') + '" data-todo-id="' + U.escapeAttr(todo.id) + '">' +
        '<button class="check-control' + (todo.done ? ' is-checked' : '') + '" type="button" data-daytodo-toggle role="checkbox" aria-checked="' + String(todo.done) + '" aria-label="' + (todo.done ? '取消完成' : '标记完成') + '：' + U.escapeAttr(todo.text) + '">' + ui.icon('check', 13) + '</button>' +
        '<span class="day-todo-text">' + U.escapeHTML(todo.text) + '</span>' +
        '<span class="day-todo-actions">' +
          '<button class="icon-btn is-small" type="button" data-daytodo-edit aria-label="编辑待办">' + ui.icon('pencil', 13) + '</button>' +
          '<button class="icon-btn is-small is-danger" type="button" data-daytodo-delete aria-label="删除待办">' + ui.icon('trash', 13) + '</button>' +
        '</span>' +
      '</li>';
    }).join('') + '</ul>';
  }

  function renderTimelineList(items) {
    var sorted = items.slice().sort(function (a, b) {
      return String(a.time || '99:99').localeCompare(String(b.time || '99:99'));
    });
    if (!sorted.length) {
      return '<div class="mini-empty">' + ui.icon('mapPin', 16) + '<span>还没有动线记录。写下今天从哪里出发，去了哪里。</span></div>';
    }
    return '<div class="timeline-items">' + sorted.map(function (item) {
      return '<div class="timeline-item" data-timeline-id="' + U.escapeAttr(item.id) + '">' +
        '<div class="timeline-marker"><span>' + U.escapeHTML(item.time || '—') + '</span><i aria-hidden="true"></i></div>' +
        '<div class="timeline-content">' +
          '<div class="timeline-content-head"><strong>' + U.escapeHTML(item.place || '未写地点') + '</strong>' +
            '<span class="timeline-actions">' +
              '<button class="icon-btn is-small" type="button" data-timeline-edit aria-label="编辑动线">' + ui.icon('pencil', 13) + '</button>' +
              '<button class="icon-btn is-small is-danger" type="button" data-timeline-delete aria-label="删除动线">' + ui.icon('trash', 13) + '</button>' +
            '</span>' +
          '</div>' +
          '<p>' + U.escapeHTML(item.event) + '</p>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function openMoodEditor(date, entry, onDone) {
    var formId = 'moodEdit-' + Date.now();
    var moodButtons = PP.MOODS.map(function (mood) {
      return '<button class="mood-choice-option' + (entry.mood === mood.key ? ' is-selected' : '') + '" type="button" data-edit-mood="' + mood.key + '" style="--mood:' + mood.color + '">' +
        '<span>' + mood.emoji + '</span><em>' + mood.label + '</em></button>';
    }).join('');
    var selectedMood = entry.mood;
    var periods = PP.MOOD_PERIODS.map(function (period) {
      return '<option value="' + period.key + '"' + (entry.period === period.key ? ' selected' : '') + '>' + period.label + '</option>';
    }).join('');
    ui.modal({
      title: '编辑心情记录',
      subtitle: D.fullDateCN(date),
      body: '<form id="' + formId + '">' +
        '<div class="field"><span class="field-label">心情</span><div class="mood-choice-grid">' + moodButtons + '</div></div>' +
        '<div class="form-grid" style="margin-top:16px">' +
          '<label class="field"><span class="field-label">时段</span><select name="period" data-edit-period>' + periods + '</select></label>' +
          '<label class="field"><span class="field-label">时间</span><input type="time" name="time" value="' + U.escapeAttr(entry.time) + '" required></label>' +
          '<label class="field span-2"><span class="field-label">备注 <span class="optional">可选</span></span><textarea name="note" rows="2" maxlength="120">' + U.escapeHTML(entry.note) + '</textarea></label>' +
        '</div>' +
      '</form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="submit" form="' + formId + '">保存</button>',
      onMount: function (body, close) {
        body.querySelectorAll('[data-edit-mood]').forEach(function (button) {
          button.addEventListener('click', function () {
            selectedMood = button.getAttribute('data-edit-mood');
            body.querySelectorAll('[data-edit-mood]').forEach(function (node) {
              node.classList.toggle('is-selected', node === button);
            });
          });
        });
        body.querySelector('form').addEventListener('submit', function (event) {
          event.preventDefault();
          var data = new FormData(event.target);
          var time = String(data.get('time') || '');
          if (!selectedMood || !time) {
            ui.toast('请选择心情并填写时间。', 'warning');
            return;
          }
          PP.data.updateMood(date, entry.id, {
            mood: selectedMood,
            period: String(data.get('period') || 'custom'),
            time: time,
            note: String(data.get('note') || '').trim(),
            sample: false
          });
          close();
          onDone();
          ui.toast('心情记录已更新。', 'success');
        });
      }
    });
  }

  function openHabitModal(habit, onDone) {
    var formId = 'habitEdit-' + Date.now();
    var colors = ['#6f52a8', '#2f6da8', '#4e9d7c', '#d99b2b', '#c9665a', '#9470bd', '#8b8698'];
    var selectedColor = habit ? habit.color : colors[0];
    ui.modal({
      title: habit ? '编辑习惯' : '新增习惯',
      subtitle: '名称会显示在每日页的习惯卡片上。',
      body: '<form id="' + formId + '">' +
        '<div class="form-grid">' +
          '<label class="field span-2"><span class="field-label">习惯名称</span><input type="text" name="name" required maxlength="24" value="' + U.escapeAttr(habit ? habit.name : '') + '" placeholder="例如：喝水 / 阅读 / 早睡" data-autofocus></label>' +
          '<label class="field"><span class="field-label">图标 <span class="optional">一个 emoji 或文字</span></span><input type="text" name="icon" maxlength="4" value="' + U.escapeAttr(habit ? habit.icon : '●') + '" placeholder="💧"></label>' +
          '<label class="field"><span class="field-label">颜色</span><input type="color" name="color" value="' + U.escapeAttr(selectedColor) + '"></label>' +
        '</div>' +
      '</form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="submit" form="' + formId + '">' + (habit ? '保存修改' : '创建习惯') + '</button>',
      onMount: function (body, close) {
        body.querySelector('form').addEventListener('submit', function (event) {
          event.preventDefault();
          var data = new FormData(event.target);
          var name = String(data.get('name') || '').trim();
          if (!name) {
            ui.toast('请填写习惯名称。', 'warning');
            return;
          }
          var payload = {
            name: name,
            icon: String(data.get('icon') || '●').trim() || '●',
            color: String(data.get('color') || '#6f52a8')
          };
          if (habit) PP.data.updateHabit(habit.id, payload);
          else PP.data.addHabit(payload);
          close();
          onDone();
          ui.toast(habit ? '习惯已更新。' : '新习惯已添加。', 'success');
        });
      }
    });
  }

  function openTodoEditor(date, todo, onDone) {
    var formId = 'editTodo-' + Date.now();
    ui.modal({
      title: '编辑今日待办',
      subtitle: D.fullDateCN(date),
      body: '<form id="' + formId + '"><label class="field"><span class="field-label">待办内容</span><input type="text" name="text" required maxlength="120" value="' + U.escapeAttr(todo.text) + '" data-autofocus></label></form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="submit" form="' + formId + '">保存</button>',
      onMount: function (body, close) {
        body.querySelector('form').addEventListener('submit', function (event) {
          event.preventDefault();
          var value = String(new FormData(event.target).get('text') || '').trim();
          if (!value) return;
          PP.data.updateDayTodo(date, todo.id, { text: value });
          close();
          onDone();
          ui.toast('待办已更新。', 'success');
        });
      }
    });
  }

  function openTimelineEditor(date, item, onDone) {
    var formId = 'editTimeline-' + Date.now();
    ui.modal({
      title: '编辑动线',
      subtitle: D.fullDateCN(date),
      body: '<form id="' + formId + '"><div class="form-grid">' +
        '<label class="field"><span class="field-label">时间</span><input type="time" name="time" required value="' + U.escapeAttr(item.time) + '" data-autofocus></label>' +
        '<label class="field"><span class="field-label">地点</span><input type="text" name="place" required maxlength="60" value="' + U.escapeAttr(item.place) + '"></label>' +
        '<label class="field span-2"><span class="field-label">事件</span><input type="text" name="event" required maxlength="140" value="' + U.escapeAttr(item.event) + '"></label>' +
      '</div></form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="submit" form="' + formId + '">保存</button>',
      onMount: function (body, close) {
        body.querySelector('form').addEventListener('submit', function (event) {
          event.preventDefault();
          var data = new FormData(event.target);
          var time = String(data.get('time') || '');
          var place = String(data.get('place') || '').trim();
          var text = String(data.get('event') || '').trim();
          if (!time || !place || !text) {
            ui.toast('时间、地点和事件都需要填写。', 'warning');
            return;
          }
          PP.data.updateTimeline(date, item.id, { time: time, place: place, event: text });
          close();
          onDone();
          ui.toast('动线已更新。', 'success');
        });
      }
    });
  }

  function mount(root, route) {
    var date = D.safeDate(route.date);
    var ym = date.slice(0, 7);
    var selectedMood = '';

    // 当天的重要日期：直接在本页添加 / 编辑（复用月份页的同一个弹窗与数据）
    function openImportantForDay(item) {
      if (!PP.pages || !PP.pages.month || typeof PP.pages.month.openImportantModal !== 'function') {
        ui.toast('暂时无法打开重要日期弹窗，请刷新页面重试。', 'error');
        return;
      }
      PP.pages.month.openImportantModal(item ? { item: item } : { date: date });
    }

    var addDayImportant = root.querySelector('[data-add-day-important]');
    if (addDayImportant) {
      addDayImportant.addEventListener('click', function () { openImportantForDay(null); });
    }

    root.querySelectorAll('[data-edit-day-important]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-id');
        var item = PP.data.getImportant(date).filter(function (entry) { return entry.id === id; })[0];
        if (!item) {
          ui.toast('这条重要日期已经不在了，刷新后再试。', 'warning');
          return;
        }
        openImportantForDay({ id: item.id, date: date, title: item.title, note: item.note });
      });
    });

    var moodForm = root.querySelector('[data-mood-form]');
    var moodList = root.querySelector('[data-mood-list]');
    var moodCount = root.querySelector('[data-mood-count]');
    var moodPeriod = root.querySelector('[data-mood-period]');

    function refreshMoods() {
      var moods = PP.data.getDayMoods(date);
      if (moodList) moodList.innerHTML = renderMoodEntries(moods);
      if (moodCount) moodCount.textContent = String(moods.length);
    }

    root.querySelectorAll('[data-mood-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectedMood = button.getAttribute('data-mood-choice');
        root.querySelectorAll('[data-mood-choice]').forEach(function (node) {
          var active = node === button;
          node.classList.toggle('is-selected', active);
          node.setAttribute('aria-pressed', String(active));
        });
      });
    });

    if (moodPeriod) {
      moodPeriod.addEventListener('change', function () {
        var period = PP.MOOD_PERIOD_MAP[moodPeriod.value];
        var timeInput = moodForm.querySelector('[name="time"]');
        if (period && period.defaultTime && timeInput) timeInput.value = period.defaultTime;
      });
    }

    if (moodForm) {
      moodForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var data = new FormData(moodForm);
        var time = String(data.get('time') || '');
        if (!selectedMood) {
          ui.toast('先选一个此刻的心情。', 'warning');
          return;
        }
        if (!time) {
          ui.toast('请选择具体时间。', 'warning');
          return;
        }
        PP.data.addMood(date, {
          mood: selectedMood,
          period: String(data.get('period') || 'custom'),
          time: time
        });
        selectedMood = '';
        root.querySelectorAll('[data-mood-choice]').forEach(function (node) {
          node.classList.remove('is-selected');
          node.setAttribute('aria-pressed', 'false');
        });
        refreshMoods();
        ui.toast('这一条心情已记录。', 'success');
      });
    }

    if (moodList) {
      moodList.addEventListener('click', function (event) {
        var entryNode = event.target.closest('[data-mood-id]');
        if (!entryNode) return;
        var id = entryNode.getAttribute('data-mood-id');
        var entry = PP.data.getDayMoods(date).filter(function (item) { return item.id === id; })[0];
        if (!entry) return;
        if (event.target.closest('[data-mood-edit]')) {
          openMoodEditor(date, entry, refreshMoods);
          return;
        }
        if (event.target.closest('[data-mood-delete]')) {
          ui.confirm({
            title: '删除心情记录',
            message: '确定删除「' + U.escapeHTML(entry.time + ' · ' + ((PP.MOOD_MAP[entry.mood] || {}).label || '')) + '」这条记录吗？',
            confirmText: '删除'
          }).then(function (confirmed) {
            if (!confirmed) return;
            PP.data.removeMood(date, id);
            refreshMoods();
            ui.toast('心情记录已删除。', 'success');
          });
        }
      });
    }

    var habitGrid = root.querySelector('[data-habit-grid]');

    function refreshHabits() {
      if (habitGrid) habitGrid.innerHTML = renderHabitCards(PP.data.getMonthHabitStats(ym), ym);
      var label = root.querySelector('[data-checkin-days-label]');
      if (label) label.textContent = '本月共 ' + PP.data.getMonthCheckinDates(ym).length + ' 天有打卡';
    }

    root.querySelectorAll('[data-add-habit]').forEach(function (button) {
      if (button.closest('[data-habit-grid]')) return;
      button.addEventListener('click', function () {
        openHabitModal(null, refreshHabits);
      });
    });

    if (habitGrid) {
      habitGrid.addEventListener('click', function (event) {
        if (event.target.closest('[data-add-habit]')) {
          openHabitModal(null, refreshHabits);
          return;
        }
        var toggle = event.target.closest('[data-habit-toggle]');
        if (toggle) {
          var habitId = toggle.getAttribute('data-habit-id');
          var iso = toggle.getAttribute('data-date');
          PP.data.toggleHabitCheckin(habitId, iso);
          refreshHabits();
          return;
        }
        var card = event.target.closest('[data-habit-card]');
        if (!card) return;
        var id = card.getAttribute('data-habit-id');
        var habit = PP.data.getHabits().filter(function (item) { return item.id === id; })[0];
        if (!habit) return;
        if (event.target.closest('[data-habit-edit]')) {
          openHabitModal(habit, refreshHabits);
          return;
        }
        if (event.target.closest('[data-habit-delete]')) {
          ui.confirm({
            title: '删除习惯',
            message: '确定删除「<strong>' + U.escapeHTML(habit.name) + '</strong>」吗？<br><br>这个习惯的所有打卡记录会一并删除。',
            confirmText: '删除习惯'
          }).then(function (confirmed) {
            if (!confirmed) return;
            PP.data.removeHabit(id);
            refreshHabits();
            ui.toast('习惯已删除。', 'success');
          });
        }
      });
    }

    var todoForm = root.querySelector('[data-day-todo-form]');
    var todoInput = root.querySelector('[data-day-todo-input]');
    var todoList = root.querySelector('[data-day-todo-list]');
    var todoCount = root.querySelector('[data-todo-count]');
    var todoProgress = root.querySelector('[data-todo-progress]');

    function refreshTodos() {
      var todos = PP.data.getSortedDayTodos(date);
      var done = todos.filter(function (item) { return item.done; }).length;
      if (todoList) todoList.innerHTML = renderTodoList(todos);
      if (todoCount) todoCount.textContent = String(todos.length);
      if (todoProgress) todoProgress.textContent = todos.length ? '完成 ' + done + ' / ' + todos.length : '还没有待办';
    }

    if (todoForm) {
      todoForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var value = String(todoInput.value || '').trim();
        if (!value) {
          ui.toast('先写点什么，再添加。', 'warning');
          todoInput.focus();
          return;
        }
        PP.data.addDayTodo(date, value);
        todoInput.value = '';
        refreshTodos();
        ui.toast('已加入今日待办。', 'success');
      });
    }

    if (todoList) {
      todoList.addEventListener('click', function (event) {
        var item = event.target.closest('[data-todo-id]');
        if (!item) return;
        var id = item.getAttribute('data-todo-id');
        if (event.target.closest('[data-daytodo-toggle]')) {
          PP.data.toggleDayTodo(date, id);
          refreshTodos();
          return;
        }
        if (event.target.closest('[data-daytodo-edit]')) {
          var todo = PP.data.getDay(date).todos.filter(function (entry) { return entry.id === id; })[0];
          if (todo) openTodoEditor(date, todo, refreshTodos);
          return;
        }
        if (event.target.closest('[data-daytodo-delete]')) {
          var target = PP.data.getDay(date).todos.filter(function (entry) { return entry.id === id; })[0];
          ui.confirm({
            title: '删除今日待办',
            message: '确定删除「<strong>' + U.escapeHTML(target ? target.text : '这条待办') + '</strong>」吗？',
            confirmText: '删除'
          }).then(function (confirmed) {
            if (!confirmed) return;
            PP.data.removeDayTodo(date, id);
            refreshTodos();
            ui.toast('待办已删除。', 'success');
          });
        }
      });
    }

    var summary = root.querySelector('[data-day-summary]');
    var summarySave = root.querySelector('[data-day-save]');
    if (summary) {
      ui.bindAutoSave(summary, function (value) {
        PP.data.updateDay(date, function (day) {
          day.summary = value;
          day.sampleSummary = false;
          return day;
        });
        return true;
      }, summarySave, { delay: 450 });
    }

    var timelineForm = root.querySelector('[data-timeline-form]');
    var timelineList = root.querySelector('[data-timeline-list]');

    function refreshTimeline() {
      if (timelineList) timelineList.innerHTML = renderTimelineList(PP.data.getDay(date).timeline);
    }

    if (timelineForm) {
      timelineForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var data = new FormData(timelineForm);
        var time = String(data.get('time') || '');
        var place = String(data.get('place') || '').trim();
        var text = String(data.get('event') || '').trim();
        if (!time || !place || !text) {
          ui.toast('时间、地点和事件都需要填写。', 'warning');
          return;
        }
        PP.data.addTimeline(date, { time: time, place: place, event: text });
        timelineForm.reset();
        timelineForm.querySelector('[name="time"]').value = D.nowTime();
        refreshTimeline();
        ui.toast('动线已记录。', 'success');
      });
    }

    if (timelineList) {
      timelineList.addEventListener('click', function (event) {
        var item = event.target.closest('[data-timeline-id]');
        if (!item) return;
        var id = item.getAttribute('data-timeline-id');
        var record = PP.data.getDay(date).timeline.filter(function (entry) { return entry.id === id; })[0];
        if (!record) return;
        if (event.target.closest('[data-timeline-edit]')) {
          openTimelineEditor(date, record, refreshTimeline);
          return;
        }
        if (event.target.closest('[data-timeline-delete]')) {
          ui.confirm({
            title: '删除动线记录',
            message: '确定删除「<strong>' + U.escapeHTML(record.place + ' · ' + record.event) + '</strong>」吗？',
            confirmText: '删除'
          }).then(function (confirmed) {
            if (!confirmed) return;
            PP.data.removeTimeline(date, id);
            refreshTimeline();
            ui.toast('动线记录已删除。', 'success');
          });
        }
      });
    }
  }

  PP.pages.day = { render: render, mount: mount };
}());
