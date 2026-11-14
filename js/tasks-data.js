/* ==========================================================================
   长期任务 → 分期小目标 · 数据层
   存储键：PP.KEYS.tasks（shiguang.tasks）
   结构：
     task = {
       id, title, due: '', quote: '', note: '',
       attachments: [],
       todos: [{ id, text, done, createdAt, doneAt }],
       periods: [{
         id, goal: '', due: '', createdAt, note: '', attachments: [],
         todos: [...], checkins: { 'YYYY-MM-DD': true }
       }],
       createdAt, updatedAt
     }
   本模块不播种任何示例数据。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;
  var D = PP.Dates;
  var KEY = (PP.KEYS && PP.KEYS.tasks) || 'tasks';

  /* ------------------------------ 名言池 ------------------------------ */

  var QUOTES = [
    { text: '千里之行，始于足下。', author: '老子' },
    { text: '不积跬步，无以至千里。', author: '荀子' },
    { text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原' },
    { text: '长风破浪会有时，直挂云帆济沧海。', author: '李白' },
    { text: '会当凌绝顶，一览众山小。', author: '杜甫' },
    { text: '天行健，君子以自强不息。', author: '《周易》' },
    { text: '志不立，天下无可成之事。', author: '王阳明' },
    { text: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '《警世贤文》' },
    { text: '业精于勤，荒于嬉。', author: '韩愈' },
    { text: '读书破万卷，下笔如有神。', author: '杜甫' },
    { text: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游' },
    { text: '山重水复疑无路，柳暗花明又一村。', author: '陆游' },
    { text: '千淘万漉虽辛苦，吹尽狂沙始到金。', author: '刘禹锡' },
    { text: '咬定青山不放松，立根原在破岩中。', author: '郑燮' },
    { text: '天下事有难易乎？为之，则难者亦易矣。', author: '彭端淑' },
    { text: '合抱之木，生于毫末；九层之台，起于累土。', author: '老子' },
    { text: '少壮不努力，老大徒伤悲。', author: '《汉乐府》' },
    { text: '星光不问赶路人，时光不负有心人。', author: '' },
    { text: '你只管努力，剩下的交给时间。', author: '' },
    { text: '所有的坚持，终将美好。', author: '' }
  ];

  function quoteText(entry) {
    return entry.author ? entry.text + '——' + entry.author : entry.text;
  }

  function pickQuote() {
    return quoteText(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }

  // 兜底用固定名言：同一张卡片每次渲染都相同，避免刷新时句子跳变。
  function fallbackQuote(seed) {
    var value = String(seed || '');
    var hash = 0;
    for (var index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) % 100000;
    }
    return quoteText(QUOTES[hash % QUOTES.length]);
  }

  /* ------------------------------ 规范化 ------------------------------ */

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asText(value) {
    return typeof value === 'string' ? value : '';
  }

  function isoDate(value) {
    return D.parseISO(value) ? String(value) : '';
  }

  function stamp(value, fallback) {
    return typeof value === 'string' && value ? value : fallback;
  }

  function validAttachment(meta) {
    return !!meta && typeof meta === 'object' && !!meta.id;
  }

  function normalizeCheckins(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var result = {};
    Object.keys(source).forEach(function (iso) {
      if (source[iso] && D.parseISO(iso)) result[iso] = true;
    });
    return result;
  }

  function normalizeTodo(raw) {
    var item = raw && typeof raw === 'object' ? raw : {};
    var value = asText(item.text).trim();
    if (!value) return null;
    var done = !!item.done;
    var createdAt = stamp(item.createdAt, D.nowISO());
    return {
      id: item.id ? String(item.id) : U.uid('todo'),
      text: value,
      done: done,
      createdAt: createdAt,
      doneAt: done ? stamp(item.doneAt, createdAt) : ''
    };
  }

  function normalizeTodos(raw) {
    return asArray(raw).map(normalizeTodo).filter(Boolean);
  }

  function normalizePeriod(raw, fallbackCreatedAt) {
    var item = raw && typeof raw === 'object' ? raw : {};
    return {
      id: item.id ? String(item.id) : U.uid('period'),
      goal: asText(item.goal),
      due: isoDate(item.due),
      createdAt: stamp(item.createdAt, fallbackCreatedAt || D.nowISO()),
      note: asText(item.note),
      attachments: asArray(item.attachments).filter(validAttachment),
      todos: normalizeTodos(item.todos),
      checkins: normalizeCheckins(item.checkins)
    };
  }

  function normalizeTask(raw) {
    var item = raw && typeof raw === 'object' ? raw : {};
    var createdAt = stamp(item.createdAt, D.nowISO());
    var quote = asText(item.quote).trim();
    var id = item.id ? String(item.id) : U.uid('task');
    return {
      id: id,
      title: asText(item.title),
      due: isoDate(item.due),
      quote: quote || fallbackQuote(id),
      note: asText(item.note),
      attachments: asArray(item.attachments).filter(validAttachment),
      todos: normalizeTodos(item.todos),
      periods: asArray(item.periods).map(function (period) {
        return normalizePeriod(period, createdAt);
      }),
      createdAt: createdAt,
      updatedAt: stamp(item.updatedAt, createdAt)
    };
  }

  /* ------------------------------ 读写 ------------------------------ */

  function readTasks() {
    return asArray(PP.store.read(KEY, [])).map(normalizeTask);
  }

  function writeTasks(list) {
    var normalized = asArray(list).map(normalizeTask);
    PP.store.write(KEY, normalized);
    return normalized;
  }

  function findPeriod(task, periodId) {
    if (!task || !periodId) return null;
    for (var index = 0; index < task.periods.length; index += 1) {
      if (task.periods[index].id === periodId) return task.periods[index];
    }
    return null;
  }

  function todoListOf(task, periodId) {
    if (!task) return null;
    if (!periodId) return task.todos;
    var period = findPeriod(task, periodId);
    return period ? period.todos : null;
  }

  function findTodo(list, todoId) {
    for (var index = 0; index < list.length; index += 1) {
      if (list[index].id === todoId) return list[index];
    }
    return null;
  }

  function mutate(taskId, updater) {
    var tasks = readTasks();
    var index = -1;
    for (var cursor = 0; cursor < tasks.length; cursor += 1) {
      if (tasks[cursor].id === taskId) {
        index = cursor;
        break;
      }
    }
    if (index < 0) return null;
    var current = tasks[index];
    var next = updater(current) || current;
    next.updatedAt = D.nowISO();
    tasks[index] = normalizeTask(next);
    PP.store.write(KEY, tasks);
    return tasks[index];
  }

  /* ------------------------------ 对外 API ------------------------------ */

  var taskData = {
    quotePool: QUOTES,

    pickQuote: pickQuote,

    getTasks: function () {
      return readTasks();
    },

    saveTasks: function (list) {
      return writeTasks(list);
    },

    getTask: function (id) {
      var target = String(id || '');
      if (!target) return null;
      var tasks = readTasks();
      for (var index = 0; index < tasks.length; index += 1) {
        if (tasks[index].id === target) return tasks[index];
      }
      return null;
    },

    addTask: function (fields) {
      var options = fields || {};
      var hasQuote = typeof options.quote === 'string' && options.quote.trim();
      var now = D.nowISO();
      var task = normalizeTask({
        id: U.uid('task'),
        title: asText(options.title).trim() || '未命名任务',
        due: options.due,
        quote: hasQuote ? options.quote : pickQuote(),
        note: asText(options.note),
        attachments: [],
        todos: [],
        periods: [],
        createdAt: now,
        updatedAt: now
      });
      var tasks = readTasks();
      tasks.unshift(task);
      PP.store.write(KEY, tasks);
      return task;
    },

    updateTask: function (id, patch) {
      var fields = patch || {};
      return mutate(id, function (task) {
        if (Object.prototype.hasOwnProperty.call(fields, 'title')) task.title = asText(fields.title);
        if (Object.prototype.hasOwnProperty.call(fields, 'quote')) {
          var quote = asText(fields.quote).trim();
          task.quote = quote || pickQuote();
        }
        if (Object.prototype.hasOwnProperty.call(fields, 'note')) task.note = asText(fields.note);
        if (Object.prototype.hasOwnProperty.call(fields, 'due')) task.due = isoDate(fields.due);
        if (Object.prototype.hasOwnProperty.call(fields, 'attachments')) {
          task.attachments = asArray(fields.attachments).filter(validAttachment);
        }
        return task;
      });
    },

    removeTask: function (id) {
      var target = String(id || '');
      var tasks = readTasks();
      var kept = tasks.filter(function (task) { return task.id !== target; });
      if (kept.length === tasks.length) return false;
      PP.store.write(KEY, kept);
      return true;
    },

    /* ------------------------------ 分期 ------------------------------ */

    addPeriod: function (taskId, fields) {
      var options = fields || {};
      var created = normalizePeriod({
        id: U.uid('period'),
        goal: asText(options.goal),
        due: options.due,
        createdAt: D.nowISO()
      });
      var updated = mutate(taskId, function (task) {
        task.periods = task.periods.concat([created]);
        return task;
      });
      return updated ? findPeriod(updated, created.id) : null;
    },

    updatePeriod: function (taskId, periodId, patch) {
      var fields = patch || {};
      var updated = mutate(taskId, function (task) {
        var period = findPeriod(task, periodId);
        if (!period) return task;
        if (Object.prototype.hasOwnProperty.call(fields, 'goal')) period.goal = asText(fields.goal);
        if (Object.prototype.hasOwnProperty.call(fields, 'due')) period.due = isoDate(fields.due);
        if (Object.prototype.hasOwnProperty.call(fields, 'note')) period.note = asText(fields.note);
        if (Object.prototype.hasOwnProperty.call(fields, 'attachments')) {
          period.attachments = asArray(fields.attachments).filter(validAttachment);
        }
        return task;
      });
      return updated ? findPeriod(updated, periodId) : null;
    },

    removePeriod: function (taskId, periodId) {
      var updated = mutate(taskId, function (task) {
        task.periods = task.periods.filter(function (period) { return period.id !== periodId; });
        return task;
      });
      return !!updated;
    },

    /* ------------------------------ 待办 ------------------------------ */

    addTodo: function (taskId, text, periodId) {
      var value = asText(text).trim();
      if (!value) return null;
      var task = taskData.getTask(taskId);
      if (!task) return null;
      if (periodId && !findPeriod(task, periodId)) return null;
      var created = normalizeTodo({
        id: U.uid('todo'),
        text: value,
        done: false,
        createdAt: D.nowISO()
      });
      var updated = mutate(taskId, function (current) {
        var list = todoListOf(current, periodId);
        if (!list) return current;
        list.push(created);
        return current;
      });
      return updated ? findTodo(todoListOf(updated, periodId) || [], created.id) : null;
    },

    toggleTodo: function (taskId, todoId, periodId) {
      var updated = mutate(taskId, function (task) {
        var list = todoListOf(task, periodId);
        if (!list) return task;
        var todo = findTodo(list, todoId);
        if (!todo) return task;
        todo.done = !todo.done;
        todo.doneAt = todo.done ? D.nowISO() : '';
        return task;
      });
      if (!updated) return null;
      return findTodo(todoListOf(updated, periodId) || [], todoId);
    },

    updateTodo: function (taskId, todoId, patch, periodId) {
      var fields = patch || {};
      var updated = mutate(taskId, function (task) {
        var list = todoListOf(task, periodId);
        if (!list) return task;
        var todo = findTodo(list, todoId);
        if (!todo) return task;
        if (Object.prototype.hasOwnProperty.call(fields, 'text')) {
          var value = asText(fields.text).trim();
          if (value) todo.text = value;
        }
        if (Object.prototype.hasOwnProperty.call(fields, 'done')) {
          todo.done = !!fields.done;
          todo.doneAt = todo.done ? D.nowISO() : '';
        }
        return task;
      });
      if (!updated) return null;
      return findTodo(todoListOf(updated, periodId) || [], todoId);
    },

    removeTodo: function (taskId, todoId, periodId) {
      var updated = mutate(taskId, function (task) {
        if (periodId) {
          var period = findPeriod(task, periodId);
          if (period) period.todos = period.todos.filter(function (todo) { return todo.id !== todoId; });
        } else {
          task.todos = task.todos.filter(function (todo) { return todo.id !== todoId; });
        }
        return task;
      });
      return !!updated;
    },

    getSortedTodos: function (taskId, periodId) {
      var task = taskData.getTask(taskId);
      var list = todoListOf(task, periodId);
      if (!list) return [];
      return list.slice().sort(function (a, b) {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });
    },

    /* ------------------------------ 打卡 ------------------------------ */

    getPeriodCheckinMap: function (taskId, periodId) {
      var task = taskData.getTask(taskId);
      var period = findPeriod(task, periodId);
      return period ? normalizeCheckins(period.checkins) : {};
    },

    getPeriodCheckins: function (taskId, periodId) {
      return Object.keys(taskData.getPeriodCheckinMap(taskId, periodId)).sort();
    },

    isPeriodChecked: function (taskId, periodId, iso) {
      if (!D.parseISO(iso)) return false;
      return taskData.getPeriodCheckinMap(taskId, periodId)[iso] === true;
    },

    togglePeriodCheckin: function (taskId, periodId, iso) {
      var date = isoDate(iso);
      if (!date) return false;
      var checked = false;
      var updated = mutate(taskId, function (task) {
        var period = findPeriod(task, periodId);
        if (!period) return task;
        if (period.checkins[date]) delete period.checkins[date];
        else period.checkins[date] = true;
        checked = !!period.checkins[date];
        return task;
      });
      return updated ? checked : false;
    }
  };

  PP.taskData = taskData;
}());
