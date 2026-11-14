/* ==========================================================================
   月份总结页：心情分布、打卡天数、待办完成率、文字总结
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
    var stats = PP.data.getMonthStats(ym);
    var moodStats = PP.data.getMoodStats(ym);
    var summary = PP.data.getMonthSummary(ym);
    var calendar = D.monthCalendar(year, month);
    var moodByDate = {};
    moodStats.entries.forEach(function (entry) {
      if (!moodByDate[entry.date]) moodByDate[entry.date] = [];
      moodByDate[entry.date].push(entry);
    });
    var checkinRate = stats.totalDays ? Math.round(stats.checkinCount / stats.totalDays * 100) : 0;
    var recordRate = stats.totalDays ? Math.round(stats.recordedDays / stats.totalDays * 100) : 0;
    var today = D.today();

    var moodRows = PP.MOODS.map(function (mood) {
      var count = moodStats.counts[mood.key] || 0;
      var percent = moodStats.recordedEntries ? Math.round(count / moodStats.recordedEntries * 100) : 0;
      return '<div class="mood-bar-row">' +
        '<span class="mood-bar-label"><span class="mood-bar-emoji">' + mood.emoji + '</span>' + mood.label + '</span>' +
        '<span class="mood-bar-track"><span class="mood-bar-fill" style="--bar:' + percent + '%;--mood:' + mood.color + '"></span></span>' +
        '<span class="mood-bar-value"><b>' + count + '</b> 次 <em>' + percent + '%</em></span>' +
      '</div>';
    }).join('');

    var mapOffset = '';
    for (var blank = 0; blank < calendar.offset; blank += 1) {
      mapOffset += '<span class="summary-map-cell is-blank" aria-hidden="true"></span>';
    }

    var mapDays = calendar.days.map(function (item) {
      var entries = moodByDate[item.iso] || [];
      var mood = entries.length ? PP.MOOD_MAP[entries[0].mood] : null;
      var future = item.iso > today;
      return '<button class="summary-map-cell' + (mood ? ' has-mood' : '') + (future ? ' is-future' : '') + '" type="button" data-go="#/day/' + item.iso + '" ' +
        'aria-label="' + U.escapeAttr(D.fullDateCN(item.iso) + (entries.length ? '，' + entries.length + ' 条心情' : '，未记录心情')) + '"' +
        (mood ? ' style="--mood:' + mood.color + '"' : '') + '>' +
        '<span class="summary-map-day">' + item.day + '</span>' +
        '<span class="summary-map-mood">' + (mood ? mood.emoji : '') + (entries.length > 1 ? '<em>' + entries.length + '</em>' : '') + '</span>' +
      '</button>';
    }).join('');

    var prevYm = D.addMonths(ym, -1);
    var nextYm = D.addMonths(ym, 1);
    var prevValid = Number(prevYm.slice(0, 4)) >= PP.SUPPORTED_YEARS.min;
    var nextValid = Number(nextYm.slice(0, 4)) <= PP.SUPPORTED_YEARS.max;

    var topLine = moodStats.top
      ? '这个月最常出现的心情是「' + moodStats.top.emoji + ' ' + moodStats.top.label + '」，一共 ' + moodStats.topCount + ' 次。'
      : '这个月还没有留下心情记录，回每日页点一个表情就好。';

    var habitRows = stats.habitStats.length
      ? stats.habitStats.map(function (item) {
          return '<div class="summary-habit-row" style="--habit:' + item.habit.color + '">' +
            '<span class="summary-habit-name"><i style="--habit:' + item.habit.color + '">' + U.escapeHTML(item.habit.icon || '●') + '</i>' + U.escapeHTML(item.habit.name) + '</span>' +
            '<strong>' + item.count + '<small> 天</small></strong>' +
          '</div>';
        }).join('')
      : '<p class="tiny muted">还没有创建习惯。</p>';

    var readingRows = stats.reading.byBook.length
      ? stats.reading.byBook.map(function (item) {
          return '<div class="summary-reading-row"><span>' + U.escapeHTML(item.title) + '</span><strong>' + U.formatMinutes(item.minutes) + '</strong><em>' + item.sessions + ' 次</em></div>';
        }).join('')
      : '<p class="tiny muted">本月还没有阅读记录。</p>';

    var writingRows = stats.writing.cards.length
      ? stats.writing.cards.map(function (item) {
          return '<div class="summary-reading-row"><span>' + U.escapeHTML(item.title) + '</span><strong>' + item.chars + ' 字</strong><em>有更新</em></div>';
        }).join('')
      : '<p class="tiny muted">本月还没有更新写作卡片。</p>';

    return '<div class="page-shell month-summary-page">' +
      '<header class="summary-head">' +
        '<div class="summary-head-copy">' +
          '<a class="back-link" href="#/month/' + ym + '">' + ui.icon('chevronLeft', 14) + '返回月历</a>' +
          '<span class="eyebrow">' + MONTH_EN[month - 1] + ' · MONTHLY REVIEW</span>' +
          '<div class="summary-title-line">' +
            '<h1><span class="summary-month-number">' + U.pad2(month) + '</span> 月总结</h1>' +
            '<span class="summary-year">' + year + '</span>' +
          '</div>' +
          '<p class="summary-lede">' + D.monthTitle(ym) + ' · 已记录 ' + stats.recordedDays + ' 天 · 本月共 ' + stats.totalDays + ' 天</p>' +
        '</div>' +
        '<div class="summary-nav">' +
          '<a class="icon-btn" href="#/month-summary/' + prevYm + '" aria-label="上个月总结"' + (prevValid ? '' : ' aria-disabled="true" tabindex="-1"') + '>' + ui.icon('chevronLeft', 17) + '</a>' +
          '<a class="btn btn-sm" href="#/month/' + ym + '">' + ui.icon('calendar', 14) + '月历</a>' +
          '<a class="icon-btn" href="#/month-summary/' + nextYm + '" aria-label="下个月总结"' + (nextValid ? '' : ' aria-disabled="true" tabindex="-1"') + '>' + ui.icon('chevronRight', 17) + '</a>' +
        '</div>' +
      '</header>' +

      '<section class="summary-overview panel">' +
        '<div class="summary-ring-wrap">' +
          '<div class="summary-ring" style="--rate:' + checkinRate + '" role="img" aria-label="打卡率 ' + checkinRate + '%">' +
            '<div class="summary-ring-inner"><strong>' + checkinRate + '<small>%</small></strong><span>打卡率</span></div>' +
          '</div>' +
          '<p class="summary-ring-note">' + (checkinRate >= 80 ? '这个月的节奏很稳。' : checkinRate >= 40 ? '已经形成自己的节奏。' : '慢慢来，先留住一天。') + '</p>' +
        '</div>' +
        '<div class="summary-stat-grid">' +
          '<div class="summary-stat"><span>习惯打卡天</span><strong>' + stats.checkinCount + '<small> / ' + stats.totalDays + ' 天</small></strong><em>' + checkinRate + '% 的月份被点亮 · 任一习惯打卡即计一天</em></div>' +
          '<div class="summary-stat"><span>待办完成率</span><strong>' + stats.todoRate + '<small>%</small></strong><em>' + (stats.todoTotal ? '完成 ' + stats.todoDone + ' / ' + stats.todoTotal + ' 项每日待办' : '本月还没有每日待办') + '</em></div>' +
          '<div class="summary-stat"><span>心情记录</span><strong>' + stats.moodEntries + '<small> 条</small></strong><em>' + stats.moodRecorded + ' 天 · ' + (stats.topMood ? '最常出现：' + stats.topMood.emoji + ' ' + stats.topMood.label : '还没有表情') + '</em></div>' +
          '<div class="summary-stat"><span>记录活跃度</span><strong>' + recordRate + '<small>%</small></strong><em>' + stats.recordedDays + ' 天留下了文字、心情或待办</em></div>' +
        '</div>' +
        '<div class="summary-highlight">' +
          '<span class="summary-highlight-label">MONTH NOTE</span>' +
          '<p>' + U.escapeHTML(topLine) + '</p>' +
          '<div class="summary-highlight-meta">' +
            '<span>' + ui.icon('sparkles', 13) + '重要日期 ' + stats.importantCount + ' 个</span>' +
            '<span>' + ui.icon('clock', 13) + '待办截止 ' + stats.deadlineCount + ' 项</span>' +
            '<span>' + ui.icon('mapPin', 13) + '动线记录 ' + stats.timelineCount + ' 条</span>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<div class="summary-columns">' +
        '<section class="panel mood-breakdown-panel">' +
          '<div class="section-head">' +
            '<div><span class="section-kicker">MOOD DISTRIBUTION</span><h2>' + ui.icon('heart', 17) + '本月心情分布</h2></div>' +
            '<a class="link-btn" href="#/moods/' + ym + '">查看月视图 →</a>' +
          '</div>' +
          (moodStats.recordedEntries
            ? '<div class="mood-bars">' + moodRows + '</div>'
            : ui.emptyState('😌', '心情还是一张白纸', '去每日页选一个最接近今天的表情，这里就会慢慢长出形状。', '<a class="btn btn-sm btn-soft" href="#/day/' + today + '">去记录今天</a>')) +
        '</section>' +

        '<section class="panel summary-map-panel">' +
          '<div class="section-head">' +
            '<div><span class="section-kicker">MOOD CALENDAR</span><h2>' + ui.icon('calendar', 17) + '表情月历</h2></div>' +
            '<span class="tiny muted">点击某天回看</span>' +
          '</div>' +
          '<div class="summary-map-weekdays" aria-hidden="true">' +
            ['一', '二', '三', '四', '五', '六', '日'].map(function (day) { return '<span>' + day + '</span>'; }).join('') +
          '</div>' +
          '<div class="summary-map-grid">' + mapOffset + mapDays + '</div>' +
        '</section>' +
      '</div>' +

      '<div class="summary-extra-grid">' +
        '<section class="panel summary-extra-panel">' +
          '<div class="section-head"><div><span class="section-kicker">HABITS</span><h2>' + ui.icon('check', 16) + '习惯打卡</h2></div><span class="badge">' + stats.checkinCount + ' 天</span></div>' +
          '<div class="summary-habit-list">' + habitRows + '</div>' +
        '</section>' +
        '<section class="panel summary-extra-panel">' +
          '<div class="section-head"><div><span class="section-kicker">READING</span><h2>' + ui.icon('book', 16) + '阅读时长</h2></div><span class="badge">' + U.formatMinutes(stats.reading.minutes) + '</span></div>' +
          '<p class="summary-extra-total">本月阅读 <strong>' + stats.reading.sessions + '</strong> 次，共 <strong>' + U.formatMinutes(stats.reading.minutes) + '</strong>。</p>' +
          '<div class="summary-reading-list">' + readingRows + '</div>' +
        '</section>' +
        '<section class="panel summary-extra-panel">' +
          '<div class="section-head"><div><span class="section-kicker">WRITING</span><h2>' + ui.icon('writing', 16) + '写作字数</h2></div><span class="badge">' + stats.writing.chars + ' 字</span></div>' +
          '<p class="summary-extra-total">本月新增 / 更新 <strong>' + stats.writing.activeCards + '</strong> 张卡片，其中新卡片 <strong>' + stats.writing.newCards + '</strong> 张。</p>' +
          '<div class="summary-reading-list">' + writingRows + '</div>' +
        '</section>' +
      '</div>' +

      '<section class="panel summary-editor-panel">' +
        '<div class="section-head">' +
          '<div><span class="section-kicker">WRITE IT DOWN</span><h2>' + ui.icon('writing', 17) + '这个月，想留下些什么？</h2></div>' +
          '<span class="save-state" data-summary-save>' + (summary.updatedAt ? '最近保存 ' + D.formatSaved(summary.updatedAt) : '尚未保存') + '</span>' +
        '</div>' +
        '<p class="summary-editor-hint">不必写得完整。可以是一句总结、一件记得的事，或者下个月想对自己说的话。输入后会自动保存。</p>' +
        '<textarea class="summary-textarea" data-month-summary rows="8" maxlength="6000" placeholder="例如：这个月最值得记住的一天是……&#10;我发现自己……&#10;下个月想试试……">' + U.escapeHTML(summary.text) + '</textarea>' +
      '</section>' +
    '</div>';
  }

  function mount(root, route) {
    var ym = D.safeMonth(route.ym);
    var textarea = root.querySelector('[data-month-summary]');
    var status = root.querySelector('[data-summary-save]');
    if (textarea) {
      ui.bindAutoSave(textarea, function (value) {
        PP.data.setMonthSummary(ym, value);
        return true;
      }, status, { delay: 500 });
    }
  }

  PP.pages['month-summary'] = { render: render, mount: mount };
}());
