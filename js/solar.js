/* ==========================================================================
   二十四节气（1900–2100，日期级）
   --------------------------------------------------------------------------
   数据来源与精度说明：
   - 采用中国历书常用的“寿星公式”：日 = floor(Y × 0.2422 + C) - L，
     其中 Y 为年份后两位，L 为闰年修正（小寒/大寒/立春/雨水用 (Y-1)/4）。
   - C 值与 1900–2100 年间的逐节气例外校正表，参考 MIT 许可的
     vsme/chinese-days（https://github.com/vsme/chinese-days）。
     其 2026 年结果已与香港天文台《公历农历对照表》逐项核对。
   - 本模块只保证“节气所在公历日期”正确，不提供交节时刻；所有日期均按
     中国标准时间 UTC+8 的日历日计算。原因：零依赖、离线、体积小，
     且日期级结果在 1900–2100 范围内经过校正表逐项修正。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};

  var TERMS = [
    { id: 'lesser_cold', name: '小寒', month: 1, c20: 6.11, c21: 5.4055, early: true },
    { id: 'greater_cold', name: '大寒', month: 1, c20: 20.84, c21: 20.12, early: true },
    { id: 'start_spring', name: '立春', month: 2, c20: 4.6295, c21: 3.87, early: true },
    { id: 'rain_water', name: '雨水', month: 2, c20: 19.4599, c21: 18.73, early: true },
    { id: 'waking_insects', name: '惊蛰', month: 3, c20: 6.3926, c21: 5.63 },
    { id: 'spring_equinox', name: '春分', month: 3, c20: 21.4155, c21: 20.646 },
    { id: 'pure_brightness', name: '清明', month: 4, c20: 5.59, c21: 4.81 },
    { id: 'grain_rain', name: '谷雨', month: 4, c20: 20.888, c21: 20.1 },
    { id: 'start_summer', name: '立夏', month: 5, c20: 6.318, c21: 5.52 },
    { id: 'lesser_fullness', name: '小满', month: 5, c20: 21.86, c21: 21.04 },
    { id: 'grain_in_beard', name: '芒种', month: 6, c20: 6.5, c21: 5.678 },
    { id: 'summer_solstice', name: '夏至', month: 6, c20: 22.2, c21: 21.37 },
    { id: 'lesser_heat', name: '小暑', month: 7, c20: 7.928, c21: 7.108 },
    { id: 'greater_heat', name: '大暑', month: 7, c20: 23.65, c21: 22.83 },
    { id: 'start_autumn', name: '立秋', month: 8, c20: 8.35, c21: 7.5 },
    { id: 'end_heat', name: '处暑', month: 8, c20: 23.95, c21: 23.13 },
    { id: 'white_dew', name: '白露', month: 9, c20: 8.44, c21: 7.646 },
    { id: 'autumn_equinox', name: '秋分', month: 9, c20: 23.822, c21: 23.042 },
    { id: 'cold_dew', name: '寒露', month: 10, c20: 9.098, c21: 8.318 },
    { id: 'frost_descent', name: '霜降', month: 10, c20: 24.218, c21: 23.438 },
    { id: 'start_winter', name: '立冬', month: 11, c20: 8.218, c21: 7.438 },
    { id: 'lesser_snow', name: '小雪', month: 11, c20: 23.08, c21: 22.36 },
    { id: 'greater_snow', name: '大雪', month: 12, c20: 7.9, c21: 7.18 },
    { id: 'winter_solstice', name: '冬至', month: 12, c20: 22.6, c21: 21.94 }
  ];

  var TERM_MAP = TERMS.reduce(function (map, term) {
    map[term.id] = term;
    return map;
  }, {});

  var DELTAS = {
    '2026_rain_water': -1,
    '2084_spring_equinox': 1,
    '1911_start_summer': 1,
    '2008_lesser_fullness': 1,
    '1902_grain_in_beard': 1,
    '1928_summer_solstice': 1,
    '1925_lesser_heat': 1,
    '2016_lesser_heat': 1,
    '1922_greater_heat': 1,
    '2002_start_autumn': 1,
    '1927_white_dew': 1,
    '1942_autumn_equinox': 1,
    '2089_frost_descent': 1,
    '2089_start_winter': 1,
    '1978_lesser_snow': 1,
    '1954_greater_snow': 1,
    '1918_winter_solstice': -1,
    '2021_winter_solstice': -1,
    '1982_lesser_cold': 1,
    '2019_lesser_cold': -1,
    '2000_greater_cold': 1,
    '2082_greater_cold': 1
  };

  var yearCache = {};

  function pad2(n) { return String(n).padStart(2, '0'); }

  function termDate(year, term) {
    var Y = year % 100;
    var C = year >= 2000 ? term.c21 : term.c20;
    var L = term.early ? Math.floor((Y - 1) / 4) : Math.floor(Y / 4);
    var day = Math.floor(Y * 0.2422 + C) - L;
    day += DELTAS[year + '_' + term.id] || 0;
    var max = PP.Dates.daysInMonth(year, term.month);
    day = Math.min(max, Math.max(1, day));
    return year + '-' + pad2(term.month) + '-' + pad2(day);
  }

  function termsForYear(year) {
    var y = Number(year);
    if (yearCache[y]) return yearCache[y].slice();
    if (!y || y < 1900 || y > 2100) return [];
    var list = TERMS.map(function (term) {
      return {
        id: term.id,
        name: term.name,
        month: term.month,
        date: termDate(y, term),
        index: TERMS.indexOf(term)
      };
    }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    yearCache[y] = list;
    return list.slice();
  }

  function termsForMonth(year, month) {
    return termsForYear(year).filter(function (term) { return term.month === Number(month); });
  }

  function termOn(iso) {
    var year = Number(String(iso).slice(0, 4));
    var list = termsForYear(year);
    return list.filter(function (term) { return term.date === iso; })[0] || null;
  }

  function monthTermMap(year, month) {
    var map = {};
    termsForMonth(year, month).forEach(function (term) { map[term.date] = term; });
    return map;
  }

  // 自检用：香港天文台 2026 年公历农历对照表中的部分节气日期
  function selfCheck() {
    var expected = {
      // 香港天文台 1901 年对照表抽查（20 世纪 C 值分支）
      '1901-01-06': '小寒',
      '1901-02-04': '立春',
      '1901-03-06': '惊蛰',
      '1901-04-05': '清明',
      '1901-06-22': '夏至',
      '1901-08-08': '立秋',
      '1901-12-22': '冬至',
      // 香港天文台 2026 年对照表抽查
      '2026-01-05': '小寒',
      '2026-01-20': '大寒',
      '2026-02-04': '立春',
      '2026-02-18': '雨水',
      '2026-03-05': '惊蛰',
      '2026-03-20': '春分',
      '2026-04-05': '清明',
      '2026-09-23': '秋分',
      '2026-10-08': '寒露',
      '2026-10-23': '霜降',
      '2026-11-07': '立冬',
      '2026-11-22': '小雪',
      '2026-12-07': '大雪',
      '2026-12-22': '冬至'
    };
    var failures = [];
    Object.keys(expected).forEach(function (date) {
      var term = termOn(date);
      if (!term || term.name !== expected[date]) {
        failures.push({ date: date, expected: expected[date], actual: term ? term.name : '' });
      }
    });
    return { ok: failures.length === 0, failures: failures, range: '1900–2100', terms: TERMS.length };
  }

  PP.Solar = {
    terms: TERMS,
    forYear: termsForYear,
    forMonth: termsForMonth,
    termOn: termOn,
    termName: function (iso) {
      var term = termOn(iso);
      return term ? term.name : '';
    },
    monthMap: monthTermMap,
    monthName: function (month) {
      var names = ['', '小寒 / 大寒', '立春 / 雨水', '惊蛰 / 春分', '清明 / 谷雨', '立夏 / 小满', '芒种 / 夏至', '小暑 / 大暑', '立秋 / 处暑', '白露 / 秋分', '寒露 / 霜降', '立冬 / 小雪', '大雪 / 冬至'];
      return names[Number(month)] || '';
    },
    selfCheck: selfCheck,
    precision: '日期级（UTC+8 日历日），不含交节时刻',
    source: '寿星公式 + chinese-days 例外校正表（MIT），2026 年与香港天文台数据核对'
  };
}());
