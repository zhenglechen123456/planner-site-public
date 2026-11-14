/* ==========================================================================
   数据层：所有结构化数据都在这里读写 localStorage
   存储键统一使用 shiguang.* 前缀
   v1.1 结构：
     days[date] = { moods:[{id,period,time,mood}], todos, summary, timeline }
     habits[] / habitLogs[habitId][date] = true
     books[].readingLogs[] = {id,date,minutes}
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var K = PP.KEYS = {
    meta: 'meta',
    settings: 'settings',
    days: 'days',
    habits: 'habits',
    habitLogs: 'habitLogs',
    checkins: 'checkins', // 旧版，仅迁移时读取
    important: 'important',
    books: 'books',
    todos: 'todos',
    tasks: 'tasks',
    writings: 'writings',
    months: 'monthSummaries'
  };

  var U = PP.Util;
  var D = PP.Dates;
  var SCHEMA_VERSION = 2;

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function countChars(text) {
    return String(text || '').replace(/\s/g, '').length;
  }

  function normalizeTodo(todo) {
    return {
      id: todo && todo.id ? String(todo.id) : U.uid('todo'),
      text: todo && typeof todo.text === 'string' ? todo.text : '',
      done: !!(todo && todo.done),
      createdAt: (todo && todo.createdAt) || D.nowISO(),
      updatedAt: (todo && todo.updatedAt) || (todo && todo.createdAt) || D.nowISO(),
      sample: !!(todo && todo.sample)
    };
  }

  function normalizeTimeline(item) {
    return {
      id: item && item.id ? String(item.id) : U.uid('move'),
      time: item && item.time ? String(item.time) : '',
      place: item && item.place ? String(item.place) : '',
      event: item && item.event ? String(item.event) : '',
      sample: !!(item && item.sample)
    };
  }

  function normalizeMoodEntry(entry) {
    if (!entry || !PP.MOOD_MAP[entry.mood]) return null;
    var period = PP.MOOD_PERIOD_MAP[entry.period] ? entry.period : 'custom';
    var defaultTime = PP.MOOD_PERIOD_MAP[period].defaultTime || '12:00';
    var time = /^\d{2}:\d{2}$/.test(String(entry.time || '')) ? String(entry.time) : defaultTime;
    return {
      id: entry.id ? String(entry.id) : U.uid('mood'),
      period: period,
      time: time,
      mood: entry.mood,
      note: entry.note ? String(entry.note) : '',
      createdAt: entry.createdAt || D.nowISO(),
      sample: !!entry.sample
    };
  }

  function normalizeDay(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var moods = asArray(source.moods).map(normalizeMoodEntry).filter(Boolean);
    // 旧版单条心情自动迁移成一条“自定义时间”记录
    if (!moods.length && source.mood && PP.MOOD_MAP[source.mood]) {
      moods.push(normalizeMoodEntry({
        mood: source.mood,
        period: 'custom',
        time: '12:00',
        sample: source.sampleMood,
        createdAt: (source.moodCreatedAt || D.nowISO())
      }));
    }
    return {
      moods: moods,
      todos: asArray(source.todos).map(normalizeTodo),
      summary: typeof source.summary === 'string' ? source.summary : '',
      sampleSummary: !!source.sampleSummary,
      timeline: asArray(source.timeline).map(normalizeTimeline)
    };
  }

  function normalizeHabit(habit) {
    if (!habit) return null;
    var name = String(habit.name || '').trim();
    if (!name) return null;
    return {
      id: habit.id ? String(habit.id) : U.uid('habit'),
      name: name.slice(0, 24),
      color: /^#[0-9a-f]{6}$/i.test(habit.color || '') ? habit.color : '#6f52a8',
      icon: habit.icon ? String(habit.icon).slice(0, 4) : '●',
      createdAt: habit.createdAt || D.nowISO(),
      sample: !!habit.sample
    };
  }

  function normalizeReadingLog(log) {
    var date = D.parseISO(log && log.date) ? String(log.date) : D.today();
    var minutes = Math.max(1, Math.min(1440, Math.round(Number(log && log.minutes) || 0)));
    if (!minutes) return null;
    return {
      id: log && log.id ? String(log.id) : U.uid('read'),
      date: date,
      minutes: minutes,
      note: log && log.note ? String(log.note).slice(0, 120) : '',
      createdAt: (log && log.createdAt) || D.nowISO(),
      sample: !!(log && log.sample)
    };
  }

  function normalizeBook(book) {
    return {
      id: book && book.id ? String(book.id) : U.uid('book'),
      title: book && typeof book.title === 'string' ? book.title : '未命名书籍',
      author: book && typeof book.author === 'string' ? book.author : '',
      readingTime: book && typeof book.readingTime === 'string' ? book.readingTime : '',
      readingLogs: asArray(book && book.readingLogs).map(normalizeReadingLog).filter(Boolean),
      notes: book && typeof book.notes === 'string' ? book.notes : '',
      freeTalk: book && typeof book.freeTalk === 'string' ? book.freeTalk : '',
      attachments: asArray(book && book.attachments),
      createdAt: (book && book.createdAt) || D.nowISO(),
      updatedAt: (book && book.updatedAt) || (book && book.createdAt) || D.nowISO(),
      sample: !!(book && book.sample)
    };
  }

  function normalizeWriting(item) {
    return {
      id: item && item.id ? String(item.id) : U.uid('write'),
      title: item && typeof item.title === 'string' ? item.title : '未命名片段',
      content: item && typeof item.content === 'string' ? item.content : '',
      attachments: asArray(item && item.attachments),
      createdAt: (item && item.createdAt) || D.nowISO(),
      updatedAt: (item && item.updatedAt) || (item && item.createdAt) || D.nowISO(),
      sample: !!(item && item.sample)
    };
  }

  function normalizeTodoItem(item) {
    return {
      id: item && item.id ? String(item.id) : U.uid('task'),
      text: item && typeof item.text === 'string' ? item.text : '',
      due: item && typeof item.due === 'string' ? item.due : '',
      place: item && typeof item.place === 'string' ? item.place : '',
      note: item && typeof item.note === 'string' ? item.note : '',
      done: !!(item && item.done),
      createdAt: (item && item.createdAt) || D.nowISO(),
      updatedAt: (item && item.updatedAt) || (item && item.createdAt) || D.nowISO(),
      completedAt: (item && item.completedAt) || '',
      sample: !!(item && item.sample)
    };
  }

  function normalizeImportant(item) {
    return {
      id: item && item.id ? String(item.id) : U.uid('date'),
      title: item && typeof item.title === 'string' ? item.title : '',
      note: item && typeof item.note === 'string' ? item.note : '',
      createdAt: (item && item.createdAt) || D.nowISO(),
      sample: !!(item && item.sample)
    };
  }

  function dayRecorded(day) {
    if (!day) return false;
    var normalized = normalizeDay(day);
    return !!(normalized.moods.length || normalized.summary || normalized.todos.length || normalized.timeline.length);
  }

  function readMeta() {
    var meta = PP.store.read(K.meta, null);
    if (!meta || typeof meta !== 'object') {
      meta = { seeded: false, sampleCleared: false, createdAt: D.nowISO(), schemaVersion: SCHEMA_VERSION };
    }
    if (!meta.schemaVersion) meta.schemaVersion = 1;
    return meta;
  }

  function readSettings() {
    var settings = PP.store.read(K.settings, null) || {};
    return {
      theme: settings.theme === 'blue' ? 'blue' : 'purple',
      mode: settings.mode === 'dark' ? 'dark' : 'light',
      lastDate: D.safeDate(settings.lastDate || D.defaultDate())
    };
  }

  function readingStatsFor(book, ym) {
    var logs = asArray(book && book.readingLogs);
    var totalMinutes = U.sum(logs, function (log) { return log.minutes; });
    var monthLogs = ym ? logs.filter(function (log) { return log.date.indexOf(ym + '-') === 0; }) : [];
    return {
      totalSessions: logs.length,
      totalMinutes: totalMinutes,
      monthSessions: monthLogs.length,
      monthMinutes: U.sum(monthLogs, function (log) { return log.minutes; })
    };
  }

  var data = {
    keys: K,
    schemaVersion: SCHEMA_VERSION,
    countChars: countChars,

    getMeta: readMeta,

    setMeta: function (patch) {
      var next = Object.assign({}, readMeta(), patch || {});
      PP.store.write(K.meta, next);
      return next;
    },

    getSettings: readSettings,

    saveSettings: function (patch) {
      var next = Object.assign({}, readSettings(), patch || {});
      next.theme = next.theme === 'blue' ? 'blue' : 'purple';
      next.mode = next.mode === 'dark' ? 'dark' : 'light';
      next.lastDate = D.safeDate(next.lastDate || D.defaultDate());
      PP.store.write(K.settings, next);
      return next;
    },

    /* ------------------------------ 每日 ------------------------------ */

    getDays: function () {
      var days = PP.store.read(K.days, {});
      return days && typeof days === 'object' ? days : {};
    },

    getDay: function (iso) {
      return normalizeDay(data.getDays()[iso]);
    },

    saveDay: function (iso, day) {
      var days = data.getDays();
      days[iso] = normalizeDay(day);
      PP.store.write(K.days, days);
      return days[iso];
    },

    updateDay: function (iso, updater) {
      var current = data.getDay(iso);
      var next = typeof updater === 'function' ? updater(current) : Object.assign({}, current, updater || {});
      return data.saveDay(iso, next);
    },

    addDayTodo: function (iso, text) {
      var value = String(text || '').trim();
      if (!value) return data.getDay(iso);
      return data.updateDay(iso, function (day) {
        day.todos.unshift(normalizeTodo({ text: value, done: false }));
        return day;
      });
    },

    updateDayTodo: function (iso, id, patch) {
      return data.updateDay(iso, function (day) {
        day.todos = day.todos.map(function (todo) {
          if (todo.id !== id) return todo;
          return Object.assign({}, todo, patch || {}, { updatedAt: D.nowISO() });
        });
        return day;
      });
    },

    toggleDayTodo: function (iso, id) {
      return data.updateDay(iso, function (day) {
        day.todos = day.todos.map(function (todo) {
          if (todo.id !== id) return todo;
          return Object.assign({}, todo, { done: !todo.done, updatedAt: D.nowISO() });
        });
        return day;
      });
    },

    removeDayTodo: function (iso, id) {
      return data.updateDay(iso, function (day) {
        day.todos = day.todos.filter(function (todo) { return todo.id !== id; });
        return day;
      });
    },

    getSortedDayTodos: function (iso) {
      return data.getDay(iso).todos.slice().sort(function (a, b) {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });
    },

    addTimeline: function (iso, item) {
      return data.updateDay(iso, function (day) {
        day.timeline.push(normalizeTimeline(item));
        return day;
      });
    },

    updateTimeline: function (iso, id, patch) {
      return data.updateDay(iso, function (day) {
        day.timeline = day.timeline.map(function (item) {
          return item.id === id ? normalizeTimeline(Object.assign({}, item, patch || {})) : item;
        });
        return day;
      });
    },

    removeTimeline: function (iso, id) {
      return data.updateDay(iso, function (day) {
        day.timeline = day.timeline.filter(function (item) { return item.id !== id; });
        return day;
      });
    },

    /* ---------------------------- 心情（多时段） ---------------------------- */

    getDayMoods: function (iso) {
      return data.getDay(iso).moods.slice().sort(function (a, b) {
        return a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt);
      });
    },

    addMood: function (iso, fields) {
      var entry = normalizeMoodEntry(Object.assign({}, fields || {}, {
        id: U.uid('mood'),
        createdAt: D.nowISO(),
        sample: !!(fields && fields.sample)
      }));
      if (!entry) return null;
      data.updateDay(iso, function (day) {
        day.moods.push(entry);
        return day;
      });
      return entry;
    },

    updateMood: function (iso, id, patch) {
      var updated = null;
      data.updateDay(iso, function (day) {
        day.moods = day.moods.map(function (entry) {
          if (entry.id !== id) return entry;
          updated = normalizeMoodEntry(Object.assign({}, entry, patch || {}, { id: entry.id }));
          return updated || entry;
        });
        return day;
      });
      return updated;
    },

    removeMood: function (iso, id) {
      data.updateDay(iso, function (day) {
        day.moods = day.moods.filter(function (entry) { return entry.id !== id; });
        return day;
      });
    },

    getMonthMoodEntries: function (ym) {
      var days = data.getDays();
      var total = D.daysInMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
      var list = [];
      for (var day = 1; day <= total; day += 1) {
        var iso = ym + '-' + U.pad2(day);
        normalizeDay(days[iso]).moods.forEach(function (entry) {
          list.push(Object.assign({}, entry, { date: iso, day: day }));
        });
      }
      return list.sort(function (a, b) {
        return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      });
    },

    getMoodStats: function (ym) {
      var entries = data.getMonthMoodEntries(ym);
      var counts = {};
      var byDay = {};
      PP.MOODS.forEach(function (mood) { counts[mood.key] = 0; });
      entries.forEach(function (entry) {
        counts[entry.mood] += 1;
        if (!byDay[entry.date]) byDay[entry.date] = [];
        byDay[entry.date].push(entry);
      });
      var top = null;
      PP.MOODS.forEach(function (mood) {
        if (counts[mood.key] > 0 && (!top || counts[mood.key] > counts[top.key])) top = mood;
      });
      var days = Object.keys(byDay);
      return {
        entries: entries,
        counts: counts,
        byDay: byDay,
        recordedDays: days.length,
        recordedEntries: entries.length,
        top: top,
        topCount: top ? counts[top.key] : 0
      };
    },

    /* ------------------------------ 习惯打卡 ------------------------------ */

    getHabits: function () {
      return asArray(PP.store.read(K.habits, [])).map(normalizeHabit).filter(Boolean);
    },

    saveHabits: function (habits) {
      PP.store.write(K.habits, asArray(habits).map(normalizeHabit).filter(Boolean));
      return data.getHabits();
    },

    addHabit: function (fields) {
      var habit = normalizeHabit(Object.assign({}, fields || {}, {
        id: U.uid('habit'),
        createdAt: D.nowISO(),
        sample: !!(fields && fields.sample)
      }));
      if (!habit) return null;
      data.saveHabits(data.getHabits().concat(habit));
      return habit;
    },

    updateHabit: function (id, patch) {
      var updated = null;
      data.saveHabits(data.getHabits().map(function (habit) {
        if (habit.id !== id) return habit;
        updated = normalizeHabit(Object.assign({}, habit, patch || {}, { id: habit.id }));
        return updated || habit;
      }));
      return updated;
    },

    removeHabit: function (id) {
      data.saveHabits(data.getHabits().filter(function (habit) { return habit.id !== id; }));
      var logs = data.getHabitLogs();
      delete logs[id];
      PP.store.write(K.habitLogs, logs);
    },

    getHabitLogs: function () {
      var logs = PP.store.read(K.habitLogs, {});
      return logs && typeof logs === 'object' ? logs : {};
    },

    getHabitDates: function (habitId) {
      var logs = data.getHabitLogs();
      return Object.keys(logs[habitId] || {}).sort();
    },

    isHabitChecked: function (habitId, iso) {
      var logs = data.getHabitLogs();
      return !!(logs[habitId] && logs[habitId][iso]);
    },

    toggleHabitCheckin: function (habitId, iso) {
      var logs = data.getHabitLogs();
      if (!logs[habitId]) logs[habitId] = {};
      if (logs[habitId][iso]) delete logs[habitId][iso];
      else logs[habitId][iso] = true;
      PP.store.write(K.habitLogs, logs);
      return !!logs[habitId][iso];
    },

    getMonthHabitStats: function (ym) {
      var logs = data.getHabitLogs();
      return data.getHabits().map(function (habit) {
        var dates = Object.keys(logs[habit.id] || {}).filter(function (iso) {
          return iso.indexOf(ym + '-') === 0;
        }).sort();
        return { habit: habit, count: dates.length, dates: dates };
      });
    },

    getMonthCheckinDates: function (ym) {
      var set = {};
      var logs = data.getHabitLogs();
      Object.keys(logs).forEach(function (habitId) {
        Object.keys(logs[habitId] || {}).forEach(function (iso) {
          if (iso.indexOf(ym + '-') === 0) set[iso] = true;
        });
      });
      return Object.keys(set).sort();
    },

    getYearCheckinDates: function (year) {
      var set = {};
      var logs = data.getHabitLogs();
      Object.keys(logs).forEach(function (habitId) {
        Object.keys(logs[habitId] || {}).forEach(function (iso) {
          if (iso.indexOf(String(year) + '-') === 0) set[iso] = true;
        });
      });
      return Object.keys(set).sort();
    },

    // 兼容旧页面的只读接口：某天只要有任一习惯打卡
    getCheckins: function () {
      var set = {};
      var logs = data.getHabitLogs();
      Object.keys(logs).forEach(function (habitId) {
        Object.keys(logs[habitId] || {}).forEach(function (iso) { set[iso] = true; });
      });
      return set;
    },

    getMonthCheckins: function (ym) { return data.getMonthCheckinDates(ym); },
    getYearCheckins: function (year) { return data.getYearCheckinDates(year); },
    isChecked: function (iso) { return !!data.getCheckins()[iso]; },

    /* ------------------------------ 重要日期 ------------------------------ */

    getImportantAll: function () {
      var all = PP.store.read(K.important, {});
      return all && typeof all === 'object' ? all : {};
    },

    getImportant: function (iso) {
      return asArray(data.getImportantAll()[iso]).map(normalizeImportant);
    },

    getImportantForMonth: function (ym) {
      var all = data.getImportantAll();
      var result = [];
      Object.keys(all).forEach(function (iso) {
        if (iso.indexOf(ym + '-') !== 0) return;
        asArray(all[iso]).forEach(function (item) {
          result.push(Object.assign(normalizeImportant(item), { date: iso }));
        });
      });
      return result.sort(function (a, b) {
        return a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
      });
    },

    getImportantDateSet: function () {
      var all = data.getImportantAll();
      var set = {};
      Object.keys(all).forEach(function (iso) {
        if (asArray(all[iso]).length) set[iso] = true;
      });
      return set;
    },

    addImportant: function (iso, title, note, sample) {
      var cleanTitle = String(title || '').trim();
      if (!D.parseISO(iso) || !cleanTitle) return null;
      var all = data.getImportantAll();
      var item = normalizeImportant({ title: cleanTitle, note: String(note || '').trim(), sample: !!sample });
      all[iso] = asArray(all[iso]).concat(item);
      PP.store.write(K.important, all);
      return item;
    },

    removeImportant: function (iso, id) {
      var all = data.getImportantAll();
      all[iso] = asArray(all[iso]).filter(function (item) { return item.id !== id; });
      if (!all[iso].length) delete all[iso];
      PP.store.write(K.important, all);
    },

    // 修改一条重要日期；patch 可含 date（改到别的日子）/ title / note
    updateImportant: function (iso, id, patch) {
      var all = data.getImportantAll();
      var list = asArray(all[iso]);
      var index = -1;
      list.forEach(function (item, i) { if (item.id === id) index = i; });
      if (index < 0) return null;

      var current = normalizeImportant(list[index]);
      var next = patch || {};
      var targetDate = next.date && D.parseISO(String(next.date)) ? String(next.date) : iso;
      var title = next.title != null ? String(next.title).trim() : current.title;
      if (!title) title = current.title;
      var note = next.note != null ? String(next.note).trim() : current.note;

      var updated = normalizeImportant({
        id: current.id,
        title: title,
        note: note,
        createdAt: current.createdAt,
        sample: current.sample
      });

      all[iso] = list.filter(function (item) { return item.id !== id; });
      if (!all[iso].length) delete all[iso];
      all[targetDate] = asArray(all[targetDate]).concat(updated);
      PP.store.write(K.important, all);
      return updated;
    },

    /* ------------------------------ 待办截止 ------------------------------ */

    getTodosForMonth: function (ym) {
      return data.getTodos().filter(function (item) {
        return item.due && item.due.slice(0, 7) === ym;
      }).sort(function (a, b) {
        return String(a.due).localeCompare(String(b.due));
      });
    },

    getTodosForDate: function (iso) {
      return data.getTodos().filter(function (item) {
        return item.due && item.due.slice(0, 10) === iso;
      }).sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
    },

    getDeadlineDateSet: function () {
      var set = {};
      data.getTodos().forEach(function (item) {
        if (item.due) set[item.due.slice(0, 10)] = true;
      });
      return set;
    },

    /* ------------------------------ 读书笔记 ------------------------------ */

    getBooks: function () {
      return asArray(PP.store.read(K.books, [])).map(normalizeBook);
    },

    saveBooks: function (books) {
      PP.store.write(K.books, asArray(books).map(normalizeBook));
      return data.getBooks();
    },

    addBook: function (fields) {
      var books = data.getBooks();
      var book = normalizeBook(Object.assign({}, fields || {}, {
        id: U.uid('book'),
        readingLogs: asArray(fields && fields.readingLogs),
        createdAt: D.nowISO(),
        updatedAt: D.nowISO(),
        sample: !!(fields && fields.sample)
      }));
      books.unshift(book);
      data.saveBooks(books);
      return book;
    },

    updateBook: function (id, patch, touch) {
      var books = data.getBooks();
      var updated = null;
      books = books.map(function (book) {
        if (book.id !== id) return book;
        updated = Object.assign({}, book, patch || {});
        if (touch !== false) updated.updatedAt = D.nowISO();
        return normalizeBook(updated);
      });
      data.saveBooks(books);
      return updated;
    },

    removeBook: function (id) {
      data.saveBooks(data.getBooks().filter(function (book) { return book.id !== id; }));
    },

    addReadingLog: function (bookId, fields) {
      var log = normalizeReadingLog(Object.assign({}, fields || {}, {
        id: U.uid('read'),
        createdAt: D.nowISO(),
        sample: !!(fields && fields.sample)
      }));
      if (!log) return null;
      var book = data.getBooks().filter(function (item) { return item.id === bookId; })[0];
      if (!book) return null;
      data.updateBook(bookId, { readingLogs: book.readingLogs.concat(log) });
      return log;
    },

    removeReadingLog: function (bookId, logId) {
      var book = data.getBooks().filter(function (item) { return item.id === bookId; })[0];
      if (!book) return;
      data.updateBook(bookId, {
        readingLogs: book.readingLogs.filter(function (log) { return log.id !== logId; })
      });
    },

    getBookReadingStats: readingStatsFor,

    getMonthlyReading: function (ym) {
      var byBook = [];
      var sessions = 0;
      var minutes = 0;
      data.getBooks().forEach(function (book) {
        var stats = readingStatsFor(book, ym);
        if (stats.monthSessions) {
          sessions += stats.monthSessions;
          minutes += stats.monthMinutes;
          byBook.push({
            bookId: book.id,
            title: book.title,
            sessions: stats.monthSessions,
            minutes: stats.monthMinutes
          });
        }
      });
      byBook.sort(function (a, b) { return b.minutes - a.minutes; });
      return { sessions: sessions, minutes: minutes, byBook: byBook };
    },

    /* ------------------------------ 待办 ------------------------------ */

    getTodos: function () {
      return asArray(PP.store.read(K.todos, [])).map(normalizeTodoItem);
    },

    saveTodos: function (todos) {
      PP.store.write(K.todos, asArray(todos).map(normalizeTodoItem));
      return data.getTodos();
    },

    addTodo: function (fields) {
      var todos = data.getTodos();
      var item = normalizeTodoItem(Object.assign({}, fields || {}, {
        id: U.uid('deadline'),
        createdAt: D.nowISO(),
        updatedAt: D.nowISO(),
        done: !!(fields && fields.done),
        sample: !!(fields && fields.sample)
      }));
      todos.push(item);
      data.saveTodos(todos);
      return item;
    },

    updateTodo: function (id, patch) {
      var updated = null;
      data.saveTodos(data.getTodos().map(function (item) {
        if (item.id !== id) return item;
        updated = normalizeTodoItem(Object.assign({}, item, patch || {}, { updatedAt: D.nowISO() }));
        return updated;
      }));
      return updated;
    },

    toggleTodo: function (id) {
      var current = data.getTodos().filter(function (item) { return item.id === id; })[0];
      if (!current) return null;
      return data.updateTodo(id, {
        done: !current.done,
        completedAt: current.done ? '' : D.nowISO()
      });
    },

    removeTodo: function (id) {
      data.saveTodos(data.getTodos().filter(function (item) { return item.id !== id; }));
    },

    getSortedTodos: function () {
      return data.getTodos().sort(function (a, b) {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (!a.due && b.due) return 1;
        if (a.due && !b.due) return -1;
        return String(a.due).localeCompare(String(b.due)) || String(a.createdAt).localeCompare(String(b.createdAt));
      });
    },

    /* ------------------------------ 写作 ------------------------------ */

    getWritings: function () {
      return asArray(PP.store.read(K.writings, [])).map(normalizeWriting);
    },

    saveWritings: function (items) {
      PP.store.write(K.writings, asArray(items).map(normalizeWriting));
      return data.getWritings();
    },

    addWriting: function (fields) {
      var items = data.getWritings();
      var item = normalizeWriting(Object.assign({}, fields || {}, {
        id: U.uid('write'),
        createdAt: D.nowISO(),
        updatedAt: D.nowISO(),
        sample: !!(fields && fields.sample)
      }));
      items.unshift(item);
      data.saveWritings(items);
      return item;
    },

    updateWriting: function (id, patch, touch) {
      var updated = null;
      data.saveWritings(data.getWritings().map(function (item) {
        if (item.id !== id) return item;
        updated = Object.assign({}, item, patch || {});
        if (touch !== false) updated.updatedAt = D.nowISO();
        return normalizeWriting(updated);
      }));
      return updated;
    },

    removeWriting: function (id) {
      data.saveWritings(data.getWritings().filter(function (item) { return item.id !== id; }));
    },

    getMonthWritingStats: function (ym) {
      var cards = data.getWritings().filter(function (item) {
        return String(item.updatedAt).slice(0, 7) === ym;
      });
      var created = cards.filter(function (item) {
        return String(item.createdAt).slice(0, 7) === ym;
      });
      return {
        activeCards: cards.length,
        newCards: created.length,
        chars: U.sum(cards, function (item) { return countChars(item.content); }),
        cards: cards.map(function (item) {
          return { id: item.id, title: item.title, chars: countChars(item.content), updatedAt: item.updatedAt };
        })
      };
    },

    /* ------------------------------ 月总结 ------------------------------ */

    getMonthSummaries: function () {
      var summaries = PP.store.read(K.months, {});
      return summaries && typeof summaries === 'object' ? summaries : {};
    },

    getMonthSummary: function (ym) {
      var item = data.getMonthSummaries()[ym];
      if (typeof item === 'string') return { text: item, updatedAt: '', sample: false };
      return {
        text: item && typeof item.text === 'string' ? item.text : '',
        updatedAt: (item && item.updatedAt) || '',
        sample: !!(item && item.sample)
      };
    },

    setMonthSummary: function (ym, text) {
      var summaries = data.getMonthSummaries();
      summaries[ym] = { text: String(text || ''), updatedAt: D.nowISO(), sample: false };
      PP.store.write(K.months, summaries);
      return summaries[ym];
    },

    /* ------------------------------ 统计 ------------------------------ */

    getMonthStats: function (ym) {
      var year = Number(ym.slice(0, 4));
      var month = Number(ym.slice(5, 7));
      var totalDays = D.daysInMonth(year, month);
      var days = data.getDays();
      var moodStats = data.getMoodStats(ym);
      var todoTotal = 0;
      var todoDone = 0;
      var recordedDays = 0;
      var timelineCount = 0;
      var important = data.getImportantForMonth(ym);
      var deadlines = data.getTodosForMonth(ym);
      var habitStats = data.getMonthHabitStats(ym);
      var checkinDates = data.getMonthCheckinDates(ym);
      var reading = data.getMonthlyReading(ym);
      var writing = data.getMonthWritingStats(ym);

      for (var day = 1; day <= totalDays; day += 1) {
        var iso = ym + '-' + U.pad2(day);
        var record = normalizeDay(days[iso]);
        todoTotal += record.todos.length;
        todoDone += record.todos.filter(function (item) { return item.done; }).length;
        timelineCount += record.timeline.length;
        if (dayRecorded(record)) recordedDays += 1;
      }

      return {
        ym: ym,
        totalDays: totalDays,
        checkinCount: checkinDates.length,
        checkins: checkinDates,
        habitStats: habitStats,
        moodRecorded: moodStats.recordedDays,
        moodEntries: moodStats.recordedEntries,
        moodCounts: moodStats.counts,
        topMood: moodStats.top,
        todoTotal: todoTotal,
        todoDone: todoDone,
        todoRate: todoTotal ? Math.round(todoDone / todoTotal * 100) : 0,
        recordedDays: recordedDays,
        timelineCount: timelineCount,
        importantCount: important.length,
        important: important,
        deadlines: deadlines,
        deadlineCount: deadlines.length,
        reading: reading,
        writing: writing
      };
    },

    getYearStats: function (year) {
      var y = String(year);
      var days = data.getDays();
      var moodEntries = 0;
      var moodDays = 0;
      var todoTotal = 0;
      var todoDone = 0;
      var recordedDays = 0;
      var timelineCount = 0;
      Object.keys(days).forEach(function (iso) {
        if (iso.indexOf(y + '-') !== 0) return;
        var record = normalizeDay(days[iso]);
        if (record.moods.length) moodDays += 1;
        moodEntries += record.moods.length;
        todoTotal += record.todos.length;
        todoDone += record.todos.filter(function (item) { return item.done; }).length;
        timelineCount += record.timeline.length;
        if (dayRecorded(record)) recordedDays += 1;
      });
      var checkins = data.getYearCheckinDates(year);
      var importantCount = 0;
      var importantAll = data.getImportantAll();
      Object.keys(importantAll).forEach(function (iso) {
        if (iso.indexOf(y + '-') === 0) importantCount += asArray(importantAll[iso]).length;
      });
      return {
        year: Number(year),
        checkinCount: checkins.length,
        recordedDays: recordedDays,
        moodCount: moodDays,
        moodEntries: moodEntries,
        todoTotal: todoTotal,
        todoDone: todoDone,
        todoRate: todoTotal ? Math.round(todoDone / todoTotal * 100) : 0,
        timelineCount: timelineCount,
        importantCount: importantCount
      };
    },

    getRecordedDays: function (year) {
      var y = String(year);
      var days = data.getDays();
      var set = {};
      Object.keys(days).forEach(function (iso) {
        if (iso.indexOf(y + '-') !== 0) return;
        if (dayRecorded(days[iso])) set[iso] = true;
      });
      data.getYearCheckinDates(year).forEach(function (iso) { set[iso] = true; });
      return set;
    },

    hasAnyContent: function () {
      return data.getBooks().length > 0 ||
        data.getTodos().length > 0 ||
        data.getWritings().length > 0 ||
        data.getHabits().length > 0 ||
        Object.keys(data.getDays()).length > 0;
    },

    /* ------------------------------ 迁移 ------------------------------ */

    migrate: function () {
      var meta = readMeta();
      if (meta.schemaVersion >= SCHEMA_VERSION) return false;

      var days = data.getDays();
      var changedDays = false;
      Object.keys(days).forEach(function (iso) {
        if (days[iso] && days[iso].mood && !days[iso].moods) {
          days[iso] = normalizeDay(days[iso]);
          changedDays = true;
        }
      });
      if (changedDays) PP.store.write(K.days, days);

      // 旧版单一“每日打卡” → 名为“每日打卡”的第一个习惯
      var oldCheckins = PP.store.read(K.checkins, {});
      if (data.getHabits().length === 0 && oldCheckins && Object.keys(oldCheckins).length) {
        var habit = data.addHabit({ name: '每日打卡', color: '#6f52a8', icon: '✓' });
        if (habit) {
          var logs = data.getHabitLogs();
          logs[habit.id] = {};
          Object.keys(oldCheckins).forEach(function (iso) { logs[habit.id][iso] = true; });
          PP.store.write(K.habitLogs, logs);
        }
      }

      // 旧版自由文本阅读时间 → 一条今天的阅读记录（可删除）
      var books = data.getBooks();
      var changedBooks = false;
      books = books.map(function (book) {
        if (!book.readingLogs.length && book.readingTime) {
          var minutes = U.parseDurationText(book.readingTime);
          if (minutes > 0) {
            book.readingLogs = [normalizeReadingLog({
              date: (book.createdAt || D.nowISO()).slice(0, 10),
              minutes: minutes,
              note: '由旧版阅读时间迁移',
              createdAt: book.createdAt
            })];
            book.readingTime = '';
            changedBooks = true;
          }
        }
        return book;
      });
      if (changedBooks) data.saveBooks(books);

      data.setMeta({ schemaVersion: SCHEMA_VERSION, migratedAt: D.nowISO() });
      return true;
    }
  };

  PP.data = data;
}());
