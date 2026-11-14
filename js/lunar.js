/* ==========================================================================
   农历换算（1900–2100）
   数据来源：经典 lunarInfo 表（与 Bigkoo/Android-PickerView、chinese-days 等
   公开实现一致的 201 项表），基准日为 1900-01-31 农历正月初一。
   位含义：
     0x8000 ~ 0x10  依次表示正月至十二月是否为大月（30 天）
     0x10000       闰月是否为大月
     低 4 位        闰月月份，0 表示无闰月
   说明：1900-01-01 至 1900-01-30 属于上一个农历年，表中没有 1899 年数据，
   因此这 30 天只显示公历，不臆造农历；其余 1900-01-31 至 2100-12-31 均按表换算。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};

  var LUNAR_INFO = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
    0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
    0x0d520 // 2100
  ];

  var BASE_DATE = new Date(1900, 0, 31, 12, 0, 0, 0);
  var MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
  var STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  var DAY_NAMES = buildDayNames();

  var FESTIVALS = {
    '1-1': '春节',
    '1-15': '元宵节',
    '2-2': '龙抬头',
    '5-5': '端午节',
    '7-7': '七夕',
    '7-15': '中元节',
    '8-15': '中秋节',
    '9-9': '重阳节',
    '12-8': '腊八节',
    '12-23': '小年'
  };

  function buildDayNames() {
    var names = [];
    var digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    var day;
    for (day = 1; day <= 10; day += 1) names.push('初' + digits[day]);
    for (day = 11; day <= 19; day += 1) names.push('十' + digits[day - 10]);
    names.push('二十');
    for (day = 21; day <= 29; day += 1) names.push('廿' + digits[day - 20]);
    names.push('三十');
    return names;
  }

  function infoFor(year) {
    return LUNAR_INFO[year - 1900] || 0;
  }

  function leapMonth(year) {
    return infoFor(year) & 0xf;
  }

  function leapDays(year) {
    if (!leapMonth(year)) return 0;
    return (infoFor(year) & 0x10000) ? 30 : 29;
  }

  function monthDays(year, month) {
    return (infoFor(year) & (0x10000 >> month)) ? 30 : 29;
  }

  function yearDays(year) {
    var total = 0;
    for (var month = 1; month <= 12; month += 1) {
      total += monthDays(year, month);
    }
    return total + leapDays(year);
  }

  function offsetFromBase(date) {
    var utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    var utcBase = Date.UTC(BASE_DATE.getFullYear(), BASE_DATE.getMonth(), BASE_DATE.getDate());
    return Math.round((utcDate - utcBase) / 86400000);
  }

  function ganzhiYear(year) {
    return STEMS[(year - 4) % 10] + BRANCHES[(year - 4) % 12];
  }

  function zodiacYear(year) {
    return ZODIAC[(year - 4) % 12];
  }

  function makeResult(year, month, day, isLeapDay, offset) {
    var monthName = (isLeapDay ? '闰' : '') + MONTH_NAMES[month - 1] + '月';
    var dayName = DAY_NAMES[day - 1] || '';
    return {
      supported: true,
      year: year,
      month: month,
      day: day,
      isLeapMonth: isLeapDay,
      monthName: monthName,
      dayName: dayName,
      ganzhi: ganzhiYear(year),
      zodiac: zodiacYear(year),
      text: '农历' + monthName + dayName,
      full: ganzhiYear(year) + '年 · ' + monthName + dayName,
      offset: offset
    };
  }

  function conversion(iso) {
    var date = PP.Dates.parseISO(iso);
    if (!date) return { supported: false, text: '农历日期不可用', short: '—', festivals: [] };
    var year = date.getFullYear();
    if (year < 1900 || year > 2100) {
      return { supported: false, text: '农历数据支持 1900–2100 年', short: '—', festivals: [] };
    }

    var offset = offsetFromBase(date);
    if (offset < 0) {
      return { supported: false, text: '农历表从 1900 年 1 月 31 日（正月初一）开始', short: '—', festivals: [] };
    }

    var lunarYear = 1900;
    while (lunarYear <= 2100) {
      var total = yearDays(lunarYear);
      if (offset < total) break;
      offset -= total;
      lunarYear += 1;
    }
    if (lunarYear > 2100) {
      return { supported: false, text: '农历数据支持 1900–2100 年', short: '—', festivals: [] };
    }

    var sequence = [];
    var leap = leapMonth(lunarYear);
    for (var month = 1; month <= 12; month += 1) {
      sequence.push({ month: month, leap: false, days: monthDays(lunarYear, month) });
      if (leap === month) {
        sequence.push({ month: month, leap: true, days: leapDays(lunarYear) });
      }
    }

    for (var index = 0; index < sequence.length; index += 1) {
      var item = sequence[index];
      if (offset < item.days) {
        var result = makeResult(lunarYear, item.month, offset + 1, item.leap, offset);
        result.short = item.leap
          ? result.monthName + (offset === 0 ? '' : result.dayName)
          : (offset === 0 ? result.monthName : result.dayName);
        result.isNewYearEve = !item.leap && item.month === 12 && (offset + 1) === monthDays(lunarYear, 12);
        result.festival = '';
        result.festivals = [];
        return result;
      }
      offset -= item.days;
    }

    return { supported: false, text: '农历日期不可用', short: '—', festivals: [] };
  }

  function festivalsOf(iso) {
    var info = conversion(iso);
    var list = [];
    if (info.supported) {
      if (info.isNewYearEve) list.push('除夕');
      var name = !info.isLeapMonth ? FESTIVALS[info.month + '-' + info.day] : '';
      if (name && list.indexOf(name) < 0) list.push(name);
    }
    if (PP.Solar && PP.Solar.termName(iso) === '清明' && list.indexOf('清明节') < 0) {
      list.push('清明节');
    }
    return list;
  }

  PP.Lunar = {
    info: conversion,
    festivals: festivalsOf,
    festival: function (iso) { return festivalsOf(iso).join('、'); },
    short: function (iso) {
      return conversion(iso).short || '—';
    },
    text: function (iso) {
      return conversion(iso).text;
    },
    full: function (iso) {
      var info = conversion(iso);
      return info.supported ? info.full : info.text;
    },
    ganzhiYear: ganzhiYear,
    zodiacYear: zodiacYear,
    monthDays: monthDays,
    leapMonth: leapMonth,
    yearDays: yearDays,
    rangeText: '1900–2100',
    dataLength: LUNAR_INFO.length
  };
}());
