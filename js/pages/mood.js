/* ==========================================================================
   本月心情一览：表情月历 + 每天展开的多次心情列表
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  function periodLabel(key) {
    return PP.MOOD_PERIOD_MAP[key] ? PP.MOOD_PERIOD_MAP[key].label : '自定义';
  }

  function render(route) {
    var ym = D.safeMonth(route.ym);
    var year = Number(ym.slice(0, 4));
    var month = Number(ym.slice(5, 7));
    var stats = PP.data.getMonthStats(ym);
    var moodStats = PP.data.getMoodStats(ym);
    var calendar = D.monthCalendar(year, month);
    var today = D.today();
    var focusDate = today.slice(0, 7) === ym ? today : ym + '-01';
    var prevYm = D.addMonths(ym, -1);
    var nextYm = D.addMonths(ym, 1);
    var prevValid = Number(prevYm.slice(0, 4)) >= PP.SUPPORTED_YEARS.min;
    var nextValid = Number(nextYm.slice(0, 4)) <= PP.SUPPORTED_YEARS.max;
    var unrecorded = stats.totalDays - moodStats.recordedDays;

    var blanks = '';
    for (var index = 0; index < calendar.offset; index += 1) {
      blanks += '<span class="mood-month-cell is-blank" aria-hidden="true"></span>';
    }

    var cells = calendar.days.map(function (item) {
      var entries = moodStats.byDay[item.iso] || [];
      var firstMood = entries.length ? PP.MOOD_MAP[entries[0].mood] : null;
      var count = entries.length;
      var classes = ['mood-month-cell'];
      if (count) classes.push('has-mood');
      if (item.iso > today) classes.push('is-future');
      if (D.isToday(item.iso)) classes.push('is-today');
      var faces = entries.slice(0, 3).map(function (entry) {
        return '<span>' + PP.MOOD_MAP[entry.mood].emoji + '</span>';
      }).join('');
      return '<button class="' + classes.join(' ') + '" type="button" data-mood-calendar-date="' + item.iso + '" ' +
        'aria-label="' + U.escapeAttr(D.fullDateCN(item.iso) + '，' + (count ? count + ' 条心情' : '未记录心情')) + '"' +
        (firstMood ? ' style="--mood:' + firstMood.color + '"' : '') + '>' +
        '<span class="mood-cell-top"><span>' + item.day + '</span><em>' + U.escapeHTML(PP.Lunar.short(item.iso)) + '</em></span>' +
        '<span class="mood-cell-faces">' + (faces || '<i></i>') + '</span>' +
        '<span class="mood-cell-label">' + (count ? count + ' 条' : '留白') + '</span>' +
      '</button>';
    }).join('');

    var renderDay = function (item) {
      var entries = moodStats.byDay[item.iso] || [];
      var moodList = entries.map(function (entry) {
        var mood = PP.MOOD_MAP[entry.mood];
        return '<div class="mood-detail-entry" style="--mood:' + mood.color + '">' +
          '<span class="mood-detail-time">' + U.escapeHTML(entry.time) + '<em>' + U.escapeHTML(periodLabel(entry.period)) + '</em></span>' +
          '<span class="mood-detail-face">' + mood.emoji + '</span>' +
          '<span class="mood-detail-name">' + mood.label + (entry.note ? '<small>' + U.escapeHTML(entry.note) + '</small>' : '') + '</span>' +
        '</div>';
      }).join('');
      return '<details class="mood-day-detail" id="mood-day-' + item.iso + '" data-mood-detail="' + item.iso + '">' +
        '<summary>' +
          '<span class="mood-detail-date"><strong>' + item.day + '</strong><em>' + D.weekdayShort(item.iso) + '</em></span>' +
          '<span class="mood-detail-summary-faces">' + (entries.length ? entries.map(function (entry) { return PP.MOOD_MAP[entry.mood].emoji; }).join('') : '<span class="tiny muted">未记录</span>') + '</span>' +
          '<span class="mood-detail-count">' + (entries.length ? entries.length + ' 条' : '—') + '</span>' +
          '<a class="mood-detail-day-link" href="#/day/' + item.iso + '">去当日 ' + ui.icon('arrowRight', 12) + '</a>' +
        '</summary>' +
        '<div class="mood-detail-body">' +
          (entries.length ? moodList : '<p class="tiny muted">这一天还没有心情记录。<a href="#/day/' + item.iso + '">去补一条 →</a></p>') +
        '</div>' +
      '</details>';
    };

    // 有记录的日子直接列出；没记录的日子折叠起来，避免一屏全是"未记录"
    var recordedDays = calendar.days.filter(function (item) { return (moodStats.byDay[item.iso] || []).length > 0; });
    var blankDays = calendar.days.filter(function (item) { return (moodStats.byDay[item.iso] || []).length === 0; });
    var details = recordedDays.length
      ? recordedDays.map(renderDay).join('')
      : '<p class="tiny muted">这个月还没有心情记录，去每日页记一条吧。</p>';
    var blankBlock = blankDays.length
      ? '<details class="mood-blank-days"><summary>未记录的 ' + blankDays.length + ' 天</summary><div class="mood-day-details">' + blankDays.map(renderDay).join('') + '</div></details>'
      : '';

    var countRows = PP.MOODS.map(function (mood) {
      var count = moodStats.counts[mood.key] || 0;
      var pct = moodStats.recordedEntries ? Math.round(count / moodStats.recordedEntries * 100) : 0;
      return '<div class="mood-mini-row">' +
        '<span class="mood-mini-name">' + mood.emoji + ' ' + mood.label + '</span>' +
        '<span class="mood-mini-track"><span style="--bar:' + pct + '%;--mood:' + mood.color + '"></span></span>' +
        '<strong>' + count + '</strong>' +
      '</div>';
    }).join('');

    return '<div class="page-shell mood-page">' +
      '<header class="mood-head">' +
        '<div>' +
          '<a class="back-link" href="#/day/' + focusDate + '">' + ui.icon('chevronLeft', 14) + '返回每日</a>' +
          '<span class="eyebrow">MOOD TRACKER</span>' +
          '<h1><span class="mood-head-month">' + U.pad2(month) + '</span> 月心情一览</h1>' +
          '<p>' + D.monthTitle(ym) + ' · ' + moodStats.recordedDays + ' 天有记录，共 ' + moodStats.recordedEntries + ' 条心情。一天可以有很多个自己。</p>' +
        '</div>' +
        '<div class="mood-head-actions">' +
          '<div class="month-nav">' +
            '<a class="icon-btn" href="#/moods/' + prevYm + '" aria-label="上个月心情"' + (prevValid ? '' : ' aria-disabled="true" tabindex="-1"') + '>' + ui.icon('chevronLeft', 17) + '</a>' +
            '<a class="btn btn-sm" href="#/moods/' + today.slice(0, 7) + '">' + ui.icon('today', 14) + '本月</a>' +
            '<a class="icon-btn" href="#/moods/' + nextYm + '" aria-label="下个月心情"' + (nextValid ? '' : ' aria-disabled="true" tabindex="-1"') + '>' + ui.icon('chevronRight', 17) + '</a>' +
          '</div>' +
          '<a class="btn btn-primary" href="#/day/' + focusDate + '">' + ui.icon('plus', 15) + '记录今天</a>' +
        '</div>' +
      '</header>' +

      '<div class="mood-layout">' +
        '<section class="panel mood-month-panel">' +
          '<div class="mood-month-toolbar">' +
            '<div class="calendar-legend">' +
              PP.MOODS.map(function (mood) { return '<span><i class="legend-emoji">' + mood.emoji + '</i>' + mood.label + '</span>'; }).join('') +
            '</div>' +
            '<span class="tiny muted">点击日期，展开当天全部时段</span>' +
          '</div>' +
          '<div class="mood-week-row" aria-hidden="true">' +
            ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(function (day) { return '<span>' + day + '</span>'; }).join('') +
          '</div>' +
          '<div class="mood-month-grid">' + blanks + cells + '</div>' +
          '<div class="mood-detail-section">' +
            '<div class="section-head"><div><span class="section-kicker">DAILY DETAILS</span><h2>' + ui.icon('list', 16) + '每天的心情明细</h2></div><span class="tiny muted">按日期展开</span></div>' +
            '<div class="mood-day-details">' + details + '</div>' + blankBlock +
          '</div>' +
        '</section>' +

        '<aside class="mood-aside">' +
          '<section class="panel mood-overview-panel">' +
            '<span class="section-kicker">THIS MONTH</span>' +
            '<div class="mood-big-stat">' +
              '<span class="mood-big-face">' + (moodStats.top ? moodStats.top.emoji : '🫧') + '</span>' +
              '<div><strong>' + (moodStats.top ? moodStats.top.label : '还没有记录') + '</strong><p>' + (moodStats.top ? '出现 ' + moodStats.topCount + ' 次，是这个月最常被写下的心情。' : '从今天开始，给自己的心情一个名字。') + '</p></div>' +
            '</div>' +
            '<div class="mood-overview-numbers">' +
              '<div><strong>' + moodStats.recordedEntries + '</strong><span>条心情</span></div>' +
              '<div><strong>' + moodStats.recordedDays + '</strong><span>天有记录</span></div>' +
              '<div><strong>' + unrecorded + '</strong><span>天留白</span></div>' +
            '</div>' +
          '</section>' +
          '<section class="panel mood-distribution-panel">' +
            '<div class="section-head"><h2>' + ui.icon('heart', 16) + '心情比例</h2></div>' +
            '<div class="mood-mini-list">' + countRows + '</div>' +
          '</section>' +
          '<section class="mood-note-card">' +
            '<span aria-hidden="true">“</span>' +
            '<p>情绪不是需要被解决的问题，它只是提醒你，最近发生了什么。</p>' +
            '<small>给每一种心情留一个位置</small>' +
          '</section>' +
        '</aside>' +
      '</div>' +
    '</div>';
  }

  function mount(root) {
    root.querySelectorAll('[data-mood-calendar-date]').forEach(function (button) {
      button.addEventListener('click', function () {
        var iso = button.getAttribute('data-mood-calendar-date');
        var detail = root.querySelector('[data-mood-detail="' + iso + '"]');
        if (!detail) return;
        root.querySelectorAll('[data-mood-detail]').forEach(function (node) {
          if (node !== detail) node.open = false;
        });
        detail.open = true;
        detail.scrollIntoView({ behavior: 'smooth', block: 'center' });
        detail.classList.add('is-flashing');
        window.setTimeout(function () { detail.classList.remove('is-flashing'); }, 900);
      });
    });
  }

  PP.pages.moods = { render: render, mount: mount };
}());
