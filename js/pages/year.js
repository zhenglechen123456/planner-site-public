/* ==========================================================================
   年份页：12 个迷你月历 + 年度统计 + 示例数据入口
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  function render(route) {
    var year = D.safeYear(route.year);
    var today = D.today();
    var stats = PP.data.getYearStats(year);
    var days = PP.data.getDays();
    var checkins = PP.data.getCheckins();
    var importantSet = PP.data.getImportantDateSet();
    var deadlineSet = PP.data.getDeadlineDateSet();
    var meta = PP.data.getMeta();
    var checkinCounts = {};
    var importantCounts = {};
    var deadlineCounts = {};

    Object.keys(checkins).forEach(function (iso) {
      if (iso.indexOf(year + '-') === 0) {
        var key = iso.slice(5, 7);
        checkinCounts[key] = (checkinCounts[key] || 0) + 1;
      }
    });
    Object.keys(importantSet).forEach(function (iso) {
      if (iso.indexOf(year + '-') === 0) {
        var key = iso.slice(5, 7);
        importantCounts[key] = (importantCounts[key] || 0) + 1;
      }
    });
    Object.keys(deadlineSet).forEach(function (iso) {
      if (iso.indexOf(year + '-') === 0) {
        var key = iso.slice(5, 7);
        deadlineCounts[key] = (deadlineCounts[key] || 0) + 1;
      }
    });

    var months = '';
    for (var month = 1; month <= 12; month += 1) {
      months += renderMiniMonth(year, month, days, checkins, importantSet, deadlineSet, checkinCounts, importantCounts, deadlineCounts);
    }

    var prevYear = year - 1;
    var nextYear = year + 1;
    var prevDisabled = prevYear < PP.SUPPORTED_YEARS.min;
    var nextDisabled = nextYear > PP.SUPPORTED_YEARS.max;
    var usage = PP.store.usage();

    var sampleHTML = meta.sampleCleared
      ? '<section class="sample-banner is-cleared">' +
          '<div class="sample-copy">' +
            '<span class="sample-glyph" aria-hidden="true">✓</span>' +
            '<div><strong>示例数据已清空</strong><p>现在的每一笔记录，都是你自己写下的。本地存储已用约 ' + usage.text + '。</p></div>' +
          '</div>' +
        '</section>'
      : '<section class="sample-banner">' +
          '<div class="sample-copy">' +
            '<span class="sample-glyph" aria-hidden="true">✦</span>' +
            '<div><strong>第一次翻开，先放了几页示例</strong><p>示例书与阅读记录、带截止时间的待办、重要日期、写作卡片、习惯打卡和今天的动线都已备好。清空时只会移除带「示例」的内容。</p></div>' +
          '</div>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-clear-samples>' + ui.icon('trash', 14) + '清空示例数据</button>' +
        '</section>';

    return '<div class="page-shell year-page">' +
      '<section class="year-hero">' +
        '<div class="year-hero-copy">' +
          '<span class="eyebrow">YEAR IN VIEW · ' + PP.Lunar.rangeText + '</span>' +
          '<h1 class="year-title-row">' +
            '<button class="year-number year-number-button" type="button" data-year-jump title="点击输入年份跳转" aria-label="当前 ' + year + ' 年，点击输入年份跳转">' + year + '</button>' +
            '<span class="year-suffix">年</span>' +
          '</h1>' +
          '<p class="hero-lede">把日子摊开来看。每个小格子都是一天，也是一次可以重新安排自己的机会。</p>' +
          '<div class="hero-stats">' +
            '<div class="hero-stat"><strong>' + stats.recordedDays + '</strong><span>记录天数</span></div>' +
            '<div class="hero-stat"><strong>' + stats.checkinCount + '</strong><span>习惯打卡天</span></div>' +
            '<div class="hero-stat"><strong>' + stats.moodEntries + '</strong><span>心情条目</span></div>' +
            '<div class="hero-stat"><strong>' + stats.todoRate + '<small>%</small></strong><span>待办完成率</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="year-hero-side">' +
          '<div class="year-nav">' +
            '<a class="icon-btn" href="#/year/' + (prevDisabled ? year : prevYear) + '" aria-label="上一年" ' + (prevDisabled ? 'aria-disabled="true" tabindex="-1"' : '') + '>' + ui.icon('chevronLeft', 17) + '</a>' +
            '<a class="btn btn-sm" href="#/day/' + today + '">' + ui.icon('today', 14) + '回到今天</a>' +
            '<a class="icon-btn" href="#/year/' + (nextDisabled ? year : nextYear) + '" aria-label="下一年" ' + (nextDisabled ? 'aria-disabled="true" tabindex="-1"' : '') + '>' + ui.icon('chevronRight', 17) + '</a>' +
          '</div>' +
          '<div class="year-quote">' +
            '<span class="quote-mark">“</span>' +
            '<p>我们如何度过一天，就如何度过一生。</p>' +
            '<small>— 写在年份页边上</small>' +
          '</div>' +
          '<div class="year-legend">' +
            '<span><i class="legend-dot legend-today"></i>今天</span>' +
            '<span><i class="legend-dot legend-check"></i>已打卡</span>' +
            '<span><i class="legend-star">✦</i>重要日期</span>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="year-months" aria-label="' + year + ' 年 12 个月">' + months + '</section>' +

      '<section class="year-summary-strip panel panel-tint">' +
        '<div class="year-summary-main">' +
          '<span class="section-kicker">A YEAR IN NUMBERS</span>' +
          '<h2>这一年，已经留下了 ' + stats.recordedDays + ' 天的痕迹</h2>' +
          '<p>阶段完成率 ' + stats.todoRate + '%，重要日期 ' + stats.importantCount + ' 个，动线记录 ' + stats.timelineCount + ' 条。数字不必漂亮，只要真实。</p>' +
        '</div>' +
        '<div class="year-summary-side">' +
          '<a class="btn btn-sm" href="#/month/' + year + '-' + U.pad2(Number(D.today().slice(5, 7))) + '">' + ui.icon('month', 14) + '看看这个月</a>' +
        '</div>' +
      '</section>' +

      sampleHTML +
    '</div>';
  }

  function renderMiniMonth(year, month, days, checkins, importantSet, deadlineSet, checkinCounts, importantCounts, deadlineCounts) {
    var ym = year + '-' + U.pad2(month);
    var calendar = D.monthCalendar(year, month);
    var weekdays = ['一', '二', '三', '四', '五', '六', '日'];
    var cells = '';
    var index;

    for (index = 0; index < calendar.offset; index += 1) {
      cells += '<span class="mini-day is-blank" aria-hidden="true"></span>';
    }

    calendar.days.forEach(function (item) {
      var raw = days[item.iso] || {};
      var moodEntries = Array.isArray(raw.moods) ? raw.moods : [];
      var mood = moodEntries.length && PP.MOOD_MAP[moodEntries[0].mood] ? PP.MOOD_MAP[moodEntries[0].mood] : null;
      var checked = !!checkins[item.iso];
      var important = !!importantSet[item.iso];
      var deadline = !!deadlineSet[item.iso];
      var term = PP.Solar.termOn(item.iso);
      var festivals = PP.Lunar.festivals(item.iso);
      var classes = ['mini-day'];
      if (D.isToday(item.iso)) classes.push('is-today');
      if (checked) classes.push('is-checked');
      if (mood) classes.push('has-mood');
      if (important) classes.push('has-important');
      if (deadline) classes.push('has-deadline');
      if (term || festivals.length) classes.push('has-term');
      var date = D.parseISO(item.iso);
      if (date && (date.getDay() === 0 || date.getDay() === 6)) classes.push('is-weekend');
      var lunar = PP.Lunar.short(item.iso);
      var label = D.fullDateCN(item.iso) + ' ' + D.weekday(item.iso) + '，' + lunar;
      if (term) label += '，节气' + term.name;
      if (festivals.length) label += '，' + festivals.join('、');
      if (mood) label += '，心情' + mood.label;
      if (checked) label += '，有习惯打卡';
      if (important) label += '，有重要日期';
      if (deadline) label += '，有待办截止';
      cells += '<button class="' + classes.join(' ') + '" type="button" data-go="#/day/' + item.iso + '" ' +
        'aria-label="' + U.escapeAttr(label) + '" title="' + U.escapeAttr(label) + '"' +
        (mood ? ' style="--mood:' + mood.color + '"' : '') + '>' +
        '<span>' + item.day + '</span>' +
        '<i class="mini-mood" aria-hidden="true"></i>' +
      '</button>';
    });

    var checkinCount = checkinCounts[U.pad2(month)] || 0;
    var importantCount = importantCounts[U.pad2(month)] || 0;
    var deadlineCount = deadlineCounts[U.pad2(month)] || 0;

    return '<article class="mini-month panel">' +
      '<a class="mini-month-head" href="#/month/' + ym + '">' +
        '<span class="mini-month-name"><em>' + U.pad2(month) + '</em>' + PP.MONTH_NAMES[month - 1] + '</span>' +
        '<span class="mini-month-arrow" aria-hidden="true">' + ui.icon('arrowUpRight', 14) + '</span>' +
      '</a>' +
      '<div class="mini-weekdays" aria-hidden="true">' + weekdays.map(function (day) { return '<span>' + day + '</span>'; }).join('') + '</div>' +
      '<div class="mini-days">' + cells + '</div>' +
      '<div class="mini-month-foot">' +
        '<span>' + (checkinCount ? checkinCount + ' 天打卡' : '还未打卡') + '</span>' +
        '<span>' + (importantCount || deadlineCount ? (importantCount + ' 重要日 · ' + deadlineCount + ' 截止') : '留白') + '</span>' +
      '</div>' +
    '</article>';
  }

  function openYearJump(currentYear) {
    var formId = 'yearJump-' + Date.now();
    ui.modal({
      title: '跳到某一年',
      subtitle: '农历与节气数据覆盖 1900–2100 年。',
      narrow: true,
      body: '<form id="' + formId + '">' +
        '<label class="field"><span class="field-label">年份</span>' +
          '<input type="number" name="year" min="' + PP.SUPPORTED_YEARS.min + '" max="' + PP.SUPPORTED_YEARS.max + '" step="1" required value="' + currentYear + '" data-autofocus>' +
        '</label>' +
      '</form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button>' +
        '<button class="btn btn-primary" type="submit" form="' + formId + '">跳转</button>',
      onMount: function (body, close) {
        body.querySelector('form').addEventListener('submit', function (event) {
          event.preventDefault();
          var year = parseInt(new FormData(event.target).get('year'), 10);
          if (!year || year < PP.SUPPORTED_YEARS.min || year > PP.SUPPORTED_YEARS.max) {
            ui.toast('请输入 ' + PP.SUPPORTED_YEARS.min + '–' + PP.SUPPORTED_YEARS.max + ' 之间的年份。', 'warning');
            return;
          }
          close();
          PP.router.go('#/year/' + year);
        });
      }
    });
  }

  function mount(root, route) {
    var yearButton = root.querySelector('[data-year-jump]');
    if (yearButton) {
      yearButton.addEventListener('click', function () {
        openYearJump(D.safeYear(route.year));
      });
    }

    var button = root.querySelector('[data-clear-samples]');
    if (!button) return;

    button.addEventListener('click', function () {
      ui.confirm({
        title: '清空示例数据',
        message: '将移除示例书、示例阅读记录、示例待办、示例写作、示例动线、示例心情、示例习惯打卡与示例重要日期。<br><br>只会删除带「示例」标记的内容，你自己添加的记录不受影响。',
        confirmText: '清空示例',
        cancelText: '先留着'
      }).then(function (confirmed) {
        if (!confirmed) return;
        PP.seed.clear();
        ui.toast('示例数据已清空，可以开始写自己的日程了。', 'success');
        PP.router.refresh();
      });
    });
  }

  PP.pages.year = { render: render, mount: mount };
}());
