/* ==========================================================================
   课程表 + 半小时时间轴 + 格子指派（纯数据层，不含 DOM）
   --------------------------------------------------------------------------
   · PP.courseData.courses        内置课表（只读副本，实际读取走 getCourses()）
   · PP.KEYS.courses              存储键，首次运行播种一次（meta.coursesSeeded）
   · PP.KEYS.slots                格子指派：{ 'YYYY-MM-DD': { 'HH:MM': ['todo-id'] } }
   · 时间轴范围：当天 04:00 → 次日 04:00，按半小时切 48 格；
     左列 04:00–15:30（24 格），右列 16:00–次日 03:30（24 格）。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;
  var D = PP.Dates;

  /* ------------------------------ 学期常量 ------------------------------ */

  // 开学周：这一周的周一是「第 1 周」的第一天。想整体平移学期，只改这一行。
  var TERM_START = '2026-09-07';
  var TERM_WEEKS = 16;

  /* ------------------------------- 调色板 -------------------------------
     课程色：6–8 色协调色板，按课程名哈希取，同名课程永远同色。
     取的是中间明度 / 中间饱和度的色，配合 CSS 里的
     「半透明底色 + color-mix 混色文字」在 日/夜 × 紫/蓝 四个主题下都能看清。
     -------------------------------------------------------------------- */
  var COURSE_PALETTE = [
    '#3f7f8c', // 湖蓝
    '#6b7f3f', // 橄榄
    '#a8722f', // 琥珀
    '#a2546f', // 玫红
    '#4a6fa8', // 靛蓝
    '#7b5aa6', // 紫藤
    '#9a6446', // 赭石
    '#4f7d6a'  // 松绿
  ];

  // 待办色：与课程色区分度更高的 4 色（任务格另有一条左侧强调线）
  var TODO_PALETTE = ['#8a5a7a', '#3f6f8c', '#8c6a34', '#57795a'];

  /* ------------------------------- 课表数据 ------------------------------- */

  var COURSES = [
    { id: 'course-01', name: '大学英语综合II', teacher: '王红 副教授', place: '立德402', weekday: 1, start: '10:00', end: '11:30', weeks: '1-16' },
    { id: 'course-02', name: '程序设计', teacher: '卫雅珂', place: '立德403', weekday: 1, start: '16:00', end: '17:30', weeks: '1-16' },
    { id: 'course-03', name: '习近平新时代中国特色社会主义思想概论', teacher: '郑吉伟 教授', place: '教一140', weekday: 1, start: '18:00', end: '20:25', weeks: '1-16' },
    { id: 'course-04', name: '高等代数I（计算机类）', teacher: '马彦彪 讲师', place: '立德100', weekday: 2, start: '10:00', end: '11:30', weeks: '1-16' },
    { id: 'course-05', name: '高等数学I', teacher: '张志刚', place: '教一130', weekday: 2, start: '14:00', end: '16:30', weeks: '1-16' },
    { id: 'course-06', name: '健美操', teacher: '苏文彩 副教授', place: '世纪馆南201', weekday: 3, start: '10:00', end: '11:30', weeks: '1-16' },
    { id: 'course-07', name: '数字时代的科学与技术', teacher: '许王莉 教授', place: '教一110', weekday: 3, start: '12:00', end: '13:30', weeks: '1-8' },
    { id: 'course-08', name: '程序设计', teacher: '卫雅珂', place: '明德地下H', weekday: 3, start: '18:00', end: '20:30', weeks: '1-16' },
    { id: 'course-09', name: '高等代数I（计算机类）', teacher: '马彦彪 讲师', place: '立德100', weekday: 4, start: '10:00', end: '11:30', weeks: '1-16' },
    { id: 'course-10', name: '程序设计', teacher: '卫雅珂', place: '立德403', weekday: 4, start: '16:00', end: '17:30', weeks: '1-16' },
    { id: 'course-11', name: '高等数学I', teacher: '张志刚', place: '教一130', weekday: 5, start: '10:00', end: '11:30', weeks: '1-16' },
    { id: 'course-12', name: '大学生思想文化素养', teacher: '单文鹏/陈月/张智/邱吉/杨子强/黎田/兰洋', place: '教三310', weekday: 5, start: '14:00', end: '15:30', weeks: '1-16' },
    { id: 'course-13', name: '大学生心理健康', teacher: '杨琳 副教授（思政）', place: '教一130', weekday: 5, start: '16:00', end: '17:30', weeks: '1-16' }
  ];

  /* --------------------------- 48 格时间轴模型 --------------------------- */

  var SLOT_FROM = 4 * 60;      // 04:00
  var SLOT_COUNT = 48;
  var SLOT_STEP = 30;

  function pad2(value) { return U.pad2(value); }

  var SLOT_TIMES = (function () {
    var list = [];
    for (var index = 0; index < SLOT_COUNT; index += 1) {
      var abs = SLOT_FROM + index * SLOT_STEP;
      var minutes = abs % 1440;
      list.push({
        index: index,
        time: pad2(Math.floor(minutes / 60)) + ':' + pad2(minutes % 60),
        minutes: minutes,
        abs: abs,
        isNextDay: abs >= 1440,
        isHour: minutes % 60 === 0,
        column: index < 24 ? 0 : 1
      });
    }
    return list;
  }());

  function slotRange(time) {
    var match = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
    if (!match) return '';
    var start = Number(match[1]) * 60 + Number(match[2]);
    var end = (start + SLOT_STEP) % 1440;
    return pad2(Math.floor(start / 60)) + ':' + pad2(start % 60) + '–' +
      pad2(Math.floor(end / 60)) + ':' + pad2(end % 60);
  }

  /* -------------------------------- 小工具 -------------------------------- */

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // FNV-1a + 一次雪崩混合：纯函数，只跟课程名有关，同名课程永远同色。
  // 种子挑过一遍，内置课表的 9 个课程名能落到 8 个不同的调色板格子里。
  function hashString(text) {
    var source = String(text == null ? '' : text);
    var value = 99;
    for (var index = 0; index < source.length; index += 1) {
      value = Math.imul(value ^ source.charCodeAt(index), 16777619) >>> 0;
    }
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return value >>> 0;
  }

  function colorOfName(name) {
    return COURSE_PALETTE[hashString(name) % COURSE_PALETTE.length];
  }

  function colorOfTodo(todoId) {
    return TODO_PALETTE[hashString(todoId) % TODO_PALETTE.length];
  }

  function minutesOf(hhmm) {
    var match = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!match) return NaN;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function parseWeeks(spec) {
    var text = String(spec == null ? '' : spec).trim();
    var range = /^(\d+)\s*-\s*(\d+)$/.exec(text);
    if (range) return { from: Number(range[1]), to: Number(range[2]) };
    var single = /^(\d+)$/.exec(text);
    if (single) return { from: Number(single[1]), to: Number(single[1]) };
    return { from: 1, to: TERM_WEEKS };
  }

  function weekOfTerm(iso) {
    var start = D.parseISO(TERM_START);
    var date = D.parseISO(iso);
    if (!start || !date) return 0;
    var days = Math.floor((date.getTime() - start.getTime()) / 86400000);
    return Math.floor(days / 7) + 1;
  }

  function termInfo(iso) {
    var week = weekOfTerm(iso);
    var inTerm = week >= 1 && week <= TERM_WEEKS;
    var label;
    if (inTerm) label = '学期第 ' + week + ' 周';
    else if (week < 1) label = '假期 / 学期外（还没开学）';
    else label = '假期 / 学期外（学期已结束）';
    return {
      week: week,
      inTerm: inTerm,
      total: TERM_WEEKS,
      start: TERM_START,
      label: label
    };
  }

  /* ------------------------------ 课程读取 ------------------------------ */

  function normalizeCourse(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = String(raw.name || '').trim();
    if (!name) return null;
    var weekday = Number(raw.weekday);
    if (!(weekday >= 1 && weekday <= 7)) weekday = 1;
    var start = /^\d{2}:\d{2}$/.test(String(raw.start || '')) ? String(raw.start) : '08:00';
    var end = /^\d{2}:\d{2}$/.test(String(raw.end || '')) ? String(raw.end) : '09:30';
    return {
      id: raw.id ? String(raw.id) : U.uid('course'),
      name: name,
      teacher: String(raw.teacher == null ? '' : raw.teacher),
      place: String(raw.place == null ? '' : raw.place),
      weekday: weekday,
      start: start,
      end: end,
      weeks: String(raw.weeks == null ? '' : raw.weeks) || '1-16',
      color: colorOfName(name)
    };
  }

  function readCourses() {
    var raw = PP.store.read(PP.KEYS.courses, []);
    return (Array.isArray(raw) ? raw : []).map(normalizeCourse).filter(Boolean);
  }

  function installIfNeeded() {
    if (!PP.data || typeof PP.data.getMeta !== 'function') return false;
    var meta = PP.data.getMeta();
    // 已经播种过、而且存储里确实还有课表（可能是用户自己改过的）：绝不再覆盖
    if (meta && meta.coursesSeeded && PP.store.has(PP.KEYS.courses)) return false;
    PP.store.write(PP.KEYS.courses, clone(COURSES));
    PP.data.setMeta({ coursesSeeded: true, coursesSeededAt: D.nowISO() });
    return true;
  }

  function getCourses() {
    var list = readCourses();
    if (!list.length && installIfNeeded()) list = readCourses();
    if (!list.length) list = COURSES.map(normalizeCourse).filter(Boolean);
    return list;
  }

  function getCourse(courseId) {
    var id = String(courseId || '');
    if (!id) return null;
    return getCourses().filter(function (course) { return course.id === id; })[0] || null;
  }

  // 某一天实际要上的课（按周次过滤，学期外一律返回空数组）
  function coursesOn(iso) {
    var date = D.parseISO(iso);
    if (!date) return [];
    var info = termInfo(iso);
    if (!info.inTerm) return [];
    var weekday = ((date.getDay() + 6) % 7) + 1;
    return getCourses().filter(function (course) {
      if (course.weekday !== weekday) return false;
      var range = parseWeeks(course.weeks);
      return info.week >= range.from && info.week <= range.to;
    }).sort(function (a, b) {
      return minutesOf(a.start) - minutesOf(b.start) || a.name.localeCompare(b.name);
    });
  }

  /* --------------------------- 格子指派（slots） --------------------------- */

  function readSlots() {
    var raw = PP.store.read(PP.KEYS.slots, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  function writeSlots(map) {
    PP.store.write(PP.KEYS.slots, map || {});
  }

  function getSlotMap(date) {
    var all = readSlots();
    var day = all[String(date || '')];
    return day && typeof day === 'object' && !Array.isArray(day) ? day : {};
  }

  function getSlotTodos(date, hhmm) {
    var list = getSlotMap(date)[String(hhmm || '')];
    return Array.isArray(list) ? list.map(String) : [];
  }

  function validTimes(hhmmList) {
    return (Array.isArray(hhmmList) ? hhmmList : []).map(String).filter(function (time) {
      return /^\d{2}:\d{2}$/.test(time);
    });
  }

  // 把一批格子指派给某条待办（同一条待办可以出现在任意多个格子 / 多天）
  function assignSlotTodos(date, hhmmList, todoId) {
    var iso = String(date || '');
    var id = String(todoId || '');
    if (!D.parseISO(iso) || !id) return 0;
    var times = U.unique(validTimes(hhmmList));
    if (!times.length) return 0;
    var all = readSlots();
    var day = all[iso] && typeof all[iso] === 'object' ? all[iso] : {};
    var changed = 0;
    times.forEach(function (time) {
      var list = Array.isArray(day[time]) ? day[time].map(String) : [];
      if (list.indexOf(id) >= 0) return;
      list.push(id);
      day[time] = list;
      changed += 1;
    });
    if (changed) {
      all[iso] = day;
      writeSlots(all);
    }
    return changed;
  }

  // 清空这些格子上的全部指派
  function clearSlots(date, hhmmList) {
    var iso = String(date || '');
    var times = U.unique(validTimes(hhmmList));
    if (!iso || !times.length) return 0;
    var all = readSlots();
    var day = all[iso];
    if (!day || typeof day !== 'object') return 0;
    var removed = 0;
    times.forEach(function (time) {
      if (Array.isArray(day[time]) || day[time] != null) {
        removed += 1;
        delete day[time];
      }
    });
    if (!Object.keys(day).length) delete all[iso];
    else all[iso] = day;
    if (removed) writeSlots(all);
    return removed;
  }

  // 某条待办被指派到了哪些格子：[{ date, time }]
  function getTodoSlots(todoId) {
    var id = String(todoId || '');
    if (!id) return [];
    var all = readSlots();
    var result = [];
    Object.keys(all).sort().forEach(function (iso) {
      var day = all[iso];
      if (!day || typeof day !== 'object') return;
      Object.keys(day).sort().forEach(function (time) {
        if (Array.isArray(day[time]) && day[time].map(String).indexOf(id) >= 0) {
          result.push({ date: iso, time: time });
        }
      });
    });
    return result;
  }

  function hasAnySlot(date) {
    return Object.keys(getSlotMap(date)).length > 0;
  }

  /* ------------------------- 待办解析（当日 + 全部） ------------------------- */

  function todoIndexFor(date) {
    var index = Object.create(null);
    try {
      PP.data.getDay(date).todos.forEach(function (todo) {
        index[todo.id] = {
          id: todo.id,
          text: todo.text,
          done: !!todo.done,
          kind: 'day',
          due: ''
        };
      });
    } catch (error) {
      /* 忽略单日读取异常 */
    }
    try {
      PP.data.getSortedTodos().forEach(function (todo) {
        if (index[todo.id]) return;
        index[todo.id] = {
          id: todo.id,
          text: todo.text,
          done: !!todo.done,
          kind: 'deadline',
          due: todo.due || ''
        };
      });
    } catch (error) {
      /* 忽略待办读取异常 */
    }
    Object.keys(index).forEach(function (id) {
      index[id].color = colorOfTodo(id);
    });
    return index;
  }

  function resolveTodos(index, ids) {
    return (Array.isArray(ids) ? ids : []).map(function (id) {
      var entry = index[id];
      if (entry) return Object.assign({}, entry);
      return {
        id: String(id),
        text: '（已删除的待办）',
        done: false,
        kind: 'missing',
        due: '',
        missing: true,
        color: colorOfTodo(id)
      };
    });
  }

  /* ---------------------------- 一天的时间轴 ---------------------------- */

  // 返回 48 个格子：{ time, index, isHour, isNextDay, kind, course, todos }
  function timelineFor(date) {
    var iso = String(date || '');
    var info = termInfo(iso);
    var courses = coursesOn(iso);
    var index = todoIndexFor(iso);
    var slotMap = getSlotMap(iso);
    var courseByTime = {};

    courses.forEach(function (course) {
      var start = minutesOf(course.start);
      var end = minutesOf(course.end);
      if (isNaN(start) || isNaN(end)) return;
      var endAbs = end <= start ? end + 1440 : end;
      SLOT_TIMES.forEach(function (slot) {
        if (slot.abs >= start && slot.abs < endAbs) courseByTime[slot.time] = course;
      });
    });

    return SLOT_TIMES.map(function (slot) {
      var course = courseByTime[slot.time] || null;
      var todos = resolveTodos(index, slotMap[slot.time] || []);
      return {
        time: slot.time,
        index: slot.index,
        column: slot.column,
        isHour: slot.isHour,
        isNextDay: slot.isNextDay,
        kind: course ? 'course' : (todos.length ? 'todo' : 'empty'),
        course: course,
        todos: todos,
        termInfo: info
      };
    });
  }

  // 一周里每一天的 48 格（周一为首日）
  function weekTimeline(mondayISO) {
    var start = D.weekStart ? D.weekStart(mondayISO) : mondayISO;
    var days = [];
    for (var offset = 0; offset < 7; offset += 1) {
      var iso = D.addDays(start, offset);
      days.push({ date: iso, weekday: PP.WEEKDAYS_MON[offset], cells: timelineFor(iso) });
    }
    return days;
  }

  PP.courseData = {
    TERM_START: TERM_START,
    TERM_WEEKS: TERM_WEEKS,
    PALETTE: COURSE_PALETTE,
    TODO_PALETTE: TODO_PALETTE,
    courses: COURSES,
    slotTimes: function () { return SLOT_TIMES.slice(); },
    slotRange: slotRange,
    // 课程
    getCourses: getCourses,
    getCourse: getCourse,
    coursesOn: coursesOn,
    colorOfName: colorOfName,
    colorOfTodo: colorOfTodo,
    installIfNeeded: installIfNeeded,
    parseWeeks: parseWeeks,
    weekOfTerm: weekOfTerm,
    termInfo: termInfo,
    // 时间轴
    timelineFor: timelineFor,
    weekTimeline: weekTimeline,
    todoIndexFor: todoIndexFor,
    // 格子指派
    getSlotMap: getSlotMap,
    getSlotTodos: getSlotTodos,
    assignSlotTodos: assignSlotTodos,
    clearSlots: clearSlots,
    getTodoSlots: getTodoSlots,
    hasAnySlot: hasAnySlot
  };

  // 同名字段再挂一份 PP.slots 别名，方便别的模块按「格子」语义调用
  PP.slots = {
    get: getSlotTodos,
    assign: assignSlotTodos,
    clear: clearSlots,
    todoSlots: getTodoSlots,
    map: getSlotMap
  };
}());
