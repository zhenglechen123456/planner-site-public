/* ==========================================================================
   拾光日程 · 通用工具
   经典脚本（非 ES Module），保证 file:// 双击打开也能按顺序加载。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};

  PP.VERSION = '1.1.0';
  PP.SUPPORTED_YEARS = { min: 1900, max: 2100 };

  // 一天内的心情时段。custom 表示由用户自行填写具体时间。
  PP.MOOD_PERIODS = [
    { key: 'morning', label: '早上', hint: '06:00–09:00', defaultTime: '07:30' },
    { key: 'forenoon', label: '上午', hint: '09:00–12:00', defaultTime: '10:30' },
    { key: 'noon', label: '中午', hint: '12:00–14:00', defaultTime: '12:30' },
    { key: 'afternoon', label: '下午', hint: '14:00–17:00', defaultTime: '15:30' },
    { key: 'evening', label: '傍晚', hint: '17:00–19:00', defaultTime: '18:00' },
    { key: 'evening2', label: '晚上', hint: '19:00–23:00', defaultTime: '20:30' },
    { key: 'late', label: '深夜', hint: '23:00–02:00', defaultTime: '23:30' },
    { key: 'custom', label: '自定义时间', hint: '自己选择具体时间', defaultTime: '' }
  ];
  PP.MOOD_PERIOD_MAP = PP.MOOD_PERIODS.reduce(function (map, period) {
    map[period.key] = period;
    return map;
  }, {});

  PP.MOODS = [
    { key: 'happy',   emoji: '😊', label: '开心', color: '#d99b2b', hint: '今天有值得高兴的事' },
    { key: 'calm',    emoji: '😌', label: '平静', color: '#4e9d7c', hint: '安稳、松弛的一天' },
    { key: 'sad',     emoji: '😢', label: '悲伤', color: '#5f8fc9', hint: '有一点低落' },
    { key: 'angry',   emoji: '😠', label: '愤怒', color: '#c9665a', hint: '被什么惹到了' },
    { key: 'anxious', emoji: '😰', label: '焦虑', color: '#9470bd', hint: '心里悬着一些事' },
    { key: 'tired',   emoji: '😴', label: '疲惫', color: '#8b8698', hint: '需要好好休息' }
  ];
  PP.MOOD_MAP = PP.MOODS.reduce(function (map, mood) {
    map[mood.key] = mood;
    return map;
  }, {});

  PP.WEEKDAYS_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  PP.WEEKDAYS_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  PP.WEEKDAYS_MON = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  PP.MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  PP.MONTH_NAMES_SHORT = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  PP.Util = {
    escapeHTML: function (value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    },

    escapeAttr: function (value) {
      return PP.Util.escapeHTML(value).replace(/`/g, '&#96;');
    },

    uid: function (prefix) {
      var id;
      try {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
          id = window.crypto.randomUUID();
        } else {
          throw new Error('no randomUUID');
        }
      } catch (error) {
        id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      }
      return (prefix || 'id') + '-' + id;
    },

    pad2: function (number) {
      return String(number).padStart(2, '0');
    },

    clamp: function (number, min, max) {
      return Math.min(max, Math.max(min, number));
    },

    sum: function (list, getter) {
      return list.reduce(function (total, item) {
        var value = getter ? getter(item) : item;
        return total + (Number(value) || 0);
      }, 0);
    },

    unique: function (list) {
      return Array.from(new Set(list));
    },

    truncate: function (text, length) {
      var value = String(text == null ? '' : text);
      return value.length > length ? value.slice(0, length) + '…' : value;
    },

    debounce: function (fn, wait) {
      var timer = null;
      var lastArgs = null;
      var lastThis = null;
      function wrapped() {
        lastArgs = arguments;
        lastThis = this;
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          timer = null;
          fn.apply(lastThis, lastArgs);
        }, wait);
      }
      wrapped.flush = function () {
        if (!timer) return;
        window.clearTimeout(timer);
        timer = null;
        fn.apply(lastThis, lastArgs);
      };
      wrapped.cancel = function () {
        if (timer) window.clearTimeout(timer);
        timer = null;
      };
      return wrapped;
    },

    fileSize: function (bytes) {
      var value = Number(bytes) || 0;
      if (value < 1024) return value + ' B';
      if (value < 1024 * 1024) return (value / 1024).toFixed(value < 10240 ? 1 : 0) + ' KB';
      return (value / 1024 / 1024).toFixed(1) + ' MB';
    },

    formatMinutes: function (minutes) {
      var value = Math.max(0, Math.round(Number(minutes) || 0));
      if (value < 60) return value + ' 分钟';
      var hours = Math.floor(value / 60);
      var rest = value % 60;
      return rest ? hours + ' 小时 ' + rest + ' 分' : hours + ' 小时';
    },

    // 兼容旧版自由文本“2 小时 40 分”
    parseDurationText: function (text) {
      var value = String(text || '');
      var hours = /(\d+(?:\.\d+)?)\s*(?:小时|时|h)/i.exec(value);
      var minutes = /(\d+)\s*(?:分钟|分|m)/i.exec(value);
      var total = 0;
      if (hours) total += Math.round(parseFloat(hours[1]) * 60);
      if (minutes) total += parseInt(minutes[1], 10);
      return total;
    },

    isObject: function (value) {
      return !!value && typeof value === 'object' && !Array.isArray(value);
    },

    sortBy: function (list, getter) {
      return list.slice().sort(function (a, b) {
        var va = getter(a);
        var vb = getter(b);
        if (va < vb) return -1;
        if (va > vb) return 1;
        return 0;
      });
    }
  };

  var U = PP.Util;

  /* ----------------------------- 日期工具 ----------------------------- */

  PP.Dates = {
    pad2: U.pad2,

    toISO: function (date) {
      return date.getFullYear() + '-' + U.pad2(date.getMonth() + 1) + '-' + U.pad2(date.getDate());
    },

    parseISO: function (iso) {
      if (iso instanceof Date) return new Date(iso.getTime());
      var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
      if (!match) return null;
      var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
      if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
        return null;
      }
      return date;
    },

    today: function () {
      return PP.Dates.toISO(new Date());
    },

    // 当真实日期超出农历数据区间时，退回 2026 年，保证页面依然可用。
    defaultDate: function () {
      var today = PP.Dates.today();
      var year = Number(today.slice(0, 4));
      return year >= PP.SUPPORTED_YEARS.min && year <= PP.SUPPORTED_YEARS.max ? today : '2026-06-15';
    },

    safeYear: function (value) {
      var year = parseInt(value, 10);
      if (!year || year < PP.SUPPORTED_YEARS.min || year > PP.SUPPORTED_YEARS.max) {
        return Number(PP.Dates.defaultDate().slice(0, 4));
      }
      return year;
    },

    safeMonth: function (value) {
      var match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
      if (!match) {
        return PP.Dates.defaultDate().slice(0, 7);
      }
      var year = Number(match[1]);
      var month = Number(match[2]);
      if (year < PP.SUPPORTED_YEARS.min || year > PP.SUPPORTED_YEARS.max || month < 1 || month > 12) {
        return PP.Dates.defaultDate().slice(0, 7);
      }
      return match[1] + '-' + match[2];
    },

    safeDate: function (value) {
      var parsed = PP.Dates.parseISO(value);
      if (!parsed) return PP.Dates.defaultDate();
      var year = parsed.getFullYear();
      if (year < PP.SUPPORTED_YEARS.min || year > PP.SUPPORTED_YEARS.max) {
        return PP.Dates.defaultDate();
      }
      return PP.Dates.toISO(parsed);
    },

    addDays: function (iso, amount) {
      var date = PP.Dates.parseISO(iso);
      if (!date) return iso;
      date.setDate(date.getDate() + Number(amount || 0));
      return PP.Dates.toISO(date);
    },

    addMonths: function (ym, amount) {
      var parts = ym.split('-');
      var date = new Date(Number(parts[0]), Number(parts[1]) - 1 + Number(amount || 0), 1, 12, 0, 0, 0);
      return date.getFullYear() + '-' + U.pad2(date.getMonth() + 1);
    },

    daysInMonth: function (year, month) {
      return new Date(Number(year), Number(month), 0, 12, 0, 0, 0).getDate();
    },

    monthOf: function (iso) {
      return String(iso || '').slice(0, 7);
    },

    yearOf: function (iso) {
      return String(iso || '').slice(0, 4);
    },

    monthTitle: function (ym) {
      var parts = String(ym).split('-');
      return Number(parts[0]) + ' 年 ' + Number(parts[1]) + ' 月';
    },

    monthShort: function (ym) {
      var parts = String(ym).split('-');
      return Number(parts[0]) + '年' + Number(parts[1]) + '月';
    },

    monthName: function (month) {
      return PP.MONTH_NAMES[Number(month) - 1] || '';
    },

    fullDateCN: function (iso) {
      var date = PP.Dates.parseISO(iso);
      if (!date) return String(iso || '');
      return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
    },

    shortDateCN: function (iso) {
      var date = PP.Dates.parseISO(iso);
      if (!date) return String(iso || '');
      return (date.getMonth() + 1) + '月' + date.getDate() + '日';
    },

    weekday: function (iso) {
      var date = PP.Dates.parseISO(iso);
      return date ? PP.WEEKDAYS_CN[date.getDay()] : '';
    },

    weekdayShort: function (iso) {
      var date = PP.Dates.parseISO(iso);
      return date ? PP.WEEKDAYS_SHORT[date.getDay()] : '';
    },

    weekdayIndexMonday: function (iso) {
      var date = PP.Dates.parseISO(iso);
      return date ? (date.getDay() + 6) % 7 : 0;
    },

    // 从周一开始的空白格 + 当月日期数组
    monthCalendar: function (year, month) {
      var first = new Date(Number(year), Number(month) - 1, 1, 12, 0, 0, 0);
      var offset = (first.getDay() + 6) % 7;
      var total = PP.Dates.daysInMonth(year, month);
      var days = [];
      for (var day = 1; day <= total; day += 1) {
        days.push({
          day: day,
          iso: year + '-' + U.pad2(month) + '-' + U.pad2(day)
        });
      }
      return { offset: offset, days: days };
    },

    isToday: function (iso) {
      return iso === PP.Dates.today();
    },

    nowTime: function () {
      var now = new Date();
      return U.pad2(now.getHours()) + ':' + U.pad2(now.getMinutes());
    },

    parseDateTimeLocal: function (value) {
      var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
      if (!match) return null;
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
    },

    formatDateTimeLocal: function (date) {
      return date.getFullYear() + '-' + U.pad2(date.getMonth() + 1) + '-' + U.pad2(date.getDate()) +
        'T' + U.pad2(date.getHours()) + ':' + U.pad2(date.getMinutes());
    },

    formatDue: function (value) {
      var date = PP.Dates.parseDateTimeLocal(value);
      if (!date) return { text: '未设置时间', relative: '', tone: 'muted' };
      var now = new Date();
      var diff = date.getTime() - now.getTime();
      var dayDiff = Math.ceil(diff / 86400000);
      var relative = '';
      var tone = 'normal';
      if (diff < 0) {
        var overdueDays = Math.ceil(Math.abs(diff) / 86400000);
        relative = overdueDays <= 1 ? '已到期' : '已逾期 ' + overdueDays + ' 天';
        tone = 'danger';
      } else if (diff < 3600000) {
        relative = '不到 1 小时';
        tone = 'warning';
      } else if (diff < 86400000) {
        relative = '今天 · 还剩 ' + Math.floor(diff / 3600000) + ' 小时';
        tone = 'warning';
      } else if (dayDiff <= 7) {
        relative = '还剩 ' + dayDiff + ' 天';
        tone = dayDiff <= 2 ? 'warning' : 'normal';
      } else {
        relative = '还剩 ' + dayDiff + ' 天';
      }
      return {
        text: (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + PP.WEEKDAYS_SHORT[date.getDay()] + ' ' +
          U.pad2(date.getHours()) + ':' + U.pad2(date.getMinutes()),
        relative: relative,
        tone: tone,
        date: date
      };
    },

    formatSaved: function (iso) {
      if (!iso) return '尚未保存';
      var date = new Date(iso);
      if (isNaN(date.getTime())) return '尚未保存';
      var now = new Date();
      var sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
      var time = U.pad2(date.getHours()) + ':' + U.pad2(date.getMinutes());
      if (sameDay) return '今天 ' + time;
      var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      if (date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate()) {
        return '昨天 ' + time;
      }
      if (date.getFullYear() === now.getFullYear()) {
        return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + time;
      }
      return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
    },

    nowISO: function () {
      return new Date().toISOString();
    },

    weekOfMonth: function (iso) {
      var date = PP.Dates.parseISO(iso);
      if (!date) return 1;
      return Math.ceil((date.getDate() + PP.Dates.weekdayIndexMonday(PP.Dates.toISO(new Date(date.getFullYear(), date.getMonth(), 1))) ) / 7);
    }
  };
}());
