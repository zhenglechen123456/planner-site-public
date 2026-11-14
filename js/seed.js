/* ==========================================================================
   首次访问的示例数据 & 一键清空示例
   所有示例记录都带 sample: true，只清理示例，不误删用户内容。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;
  var D = PP.Dates;

  function seedDateSet(today) {
    var month = today.slice(0, 7);
    var total = D.daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
    var todayDay = Number(today.slice(8, 10));
    var dates = [];
    [0, 1, 3, 5].forEach(function (offset) {
      var iso = D.addDays(today, -offset);
      if (iso.slice(0, 7) === month && Number(iso.slice(8, 10)) <= todayDay) dates.push(iso);
    });
    if (!dates.length) dates.push(month + '-01');
    return {
      month: month,
      total: total,
      todayDay: todayDay,
      dates: U.unique(dates),
      importantDate: month + '-' + U.pad2(Math.min(total, todayDay + Math.min(5, total - todayDay)))
    };
  }

  function installIfNeeded() {
    var meta = PP.data.getMeta();
    if (meta.seeded) return false;

    if (PP.data.hasAnyContent()) {
      PP.data.setMeta({ seeded: true, sampleCleared: true, schemaVersion: PP.data.schemaVersion });
      return false;
    }

    var today = D.defaultDate();
    var sets = seedDateSet(today);

    // 示例习惯（多习惯打卡）
    var habitDrink = PP.data.addHabit({ name: '喝水', color: '#4e9d7c', icon: '💧', sample: true });
    var habitRead = PP.data.addHabit({ name: '阅读', color: '#d99b2b', icon: '📖', sample: true });
    var habitSleep = PP.data.addHabit({ name: '早睡', color: '#9470bd', icon: '🌙', sample: true });
    var habits = [habitDrink, habitRead, habitSleep].filter(Boolean);

    sets.dates.forEach(function (iso, index) {
      habits.forEach(function (habit, habitIndex) {
        if ((index + habitIndex) % 3 !== 2) PP.data.toggleHabitCheckin(habit.id, iso);
      });
    });

    // 示例书（阅读时长改为可累计的记录）
    var book1 = PP.data.addBook({
      title: '月亮与六便士',
      author: '毛姆',
      notes: '读到斯特里克兰德抛下一切去画画时，忽然理解了“被梦想击中”这件事。不是所有人都有勇气，但每个人都至少有过一瞬间的犹豫。',
      freeTalk: '如果不用考虑收入和别人的眼光，我会想过怎样的生活？也许是在一个安静的小城，白天工作，傍晚散步，夜里写点东西。',
      readingLogs: [],
      sample: true
    });

    var book2 = PP.data.addBook({
      title: '夜航西飞',
      author: '柏瑞尔·马卡姆',
      notes: '她写非洲的风、夜里的飞行和孤独，文字有一种非常辽阔的安静。',
      freeTalk: '想把这本书里关于“出发”的句子抄进手账。',
      readingLogs: [],
      sample: true
    });

    if (book1) {
      PP.data.addReadingLog(book1.id, { date: today, minutes: 45, note: '午休读了两章', sample: true });
      PP.data.addReadingLog(book1.id, { date: sets.dates[Math.min(1, sets.dates.length - 1)], minutes: 70, note: '晚上继续', sample: true });
    }
    if (book2) {
      PP.data.addReadingLog(book2.id, { date: sets.dates[Math.min(2, sets.dates.length - 1)], minutes: 30, note: '睡前读', sample: true });
    }

    // 示例待办（带截止时间，月份页会自动读取同一份数据）
    PP.data.addTodo({
      text: '提交暑期实习申请',
      due: D.addDays(today, 2) + 'T18:00',
      place: '线上',
      note: '简历更新到最新版本，作品集链接再检查一遍。',
      done: false,
      sample: true
    });
    PP.data.addTodo({
      text: '去图书馆还书',
      due: D.addDays(today, 4) + 'T17:00',
      place: '市图书馆 · 二楼',
      note: '《夜航西飞》和另外两本杂志。',
      done: false,
      sample: true
    });
    PP.data.addTodo({
      text: '给住的地方换一束花',
      due: D.addDays(today, -2) + 'T19:00',
      place: '街角花店',
      note: '已经完成，留着看看完成态。',
      done: true,
      completedAt: D.nowISO(),
      sample: true
    });

    // 示例写作
    PP.data.addWriting({
      title: '清晨的咖啡馆',
      content: '七点四十分，咖啡馆里只有三个人。\n\n磨豆机的声音像一场很小的雨。靠窗的人把电脑打开，又合上，像是在等一句话自己走过来。\n\n我喜欢这种还没有被安排满的时刻。',
      sample: true
    });
    PP.data.addWriting({
      title: '一个故事的开头',
      content: '她第一次注意到那盏路灯，是在搬来的第三个晚上。\n\n灯下总是站着一个穿深色外套的人，手里提着一只旧皮箱，却从不走向任何一栋楼。',
      sample: true
    });

    // 示例心情：一天可以有多条，按时段记录
    var moodPlan = [
      { date: sets.dates[0], period: 'morning', time: '08:10', mood: 'calm' },
      { date: sets.dates[0], period: 'afternoon', time: '16:40', mood: 'happy' },
      { date: sets.dates[Math.min(1, sets.dates.length - 1)], period: 'late', time: '22:20', mood: 'tired' },
      { date: sets.dates[Math.min(2, sets.dates.length - 1)], period: 'forenoon', time: '10:00', mood: 'anxious' },
      { date: sets.dates[Math.min(2, sets.dates.length - 1)], period: 'evening2', time: '20:30', mood: 'calm' }
    ];
    moodPlan.forEach(function (entry) {
      PP.data.addMood(entry.date, {
        period: entry.period,
        time: entry.time,
        mood: entry.mood,
        sample: true
      });
    });

    PP.data.setMonthSummary(sets.month, '这个月想把生活过得慢一点：按时吃饭，周末出门走走，把想读的书读完一章。回头看时，希望留下的是几件真正记得住的小事。');
    var summaries = PP.data.getMonthSummaries();
    if (summaries[sets.month]) {
      summaries[sets.month].sample = true;
      PP.store.write(PP.KEYS.months, summaries);
    }

    // 今天的示例：每日待办、总结、动线
    PP.data.updateDay(today, function (day) {
      if (!day.todos.length) {
        day.todos = [
          { id: U.uid('todo'), text: '整理本周的计划', done: false, createdAt: D.nowISO(), updatedAt: D.nowISO(), sample: true },
          { id: U.uid('todo'), text: '给阳台的植物浇水', done: true, createdAt: D.nowISO(), updatedAt: D.nowISO(), sample: true }
        ];
      }
      if (!day.summary) {
        day.summary = '把今天的要紧事排了顺序，心里踏实了一些。傍晚出门走了走，风里有初夏的味道。';
        day.sampleSummary = true;
      }
      return day;
    });

    [
      { time: '09:00', place: '书房', event: '整理这一周的计划，把最要紧的三件事写下来。' },
      { time: '12:30', place: '街角咖啡', event: '午饭，读了几页书，窗外下了一阵小雨。' },
      { time: '18:30', place: '河畔步道', event: '散步半小时。晚风很轻，天边有一层橘色。' }
    ].forEach(function (item) {
      PP.data.addTimeline(today, Object.assign({}, item, { sample: true }));
    });

    var important = PP.data.addImportant(
      sets.importantDate,
      '英语四级考试',
      '示例：上午 9:00 · 教学楼 A302，记得带准考证和耳机。',
      true
    );

    PP.data.setMeta({
      seeded: true,
      sampleCleared: false,
      schemaVersion: PP.data.schemaVersion,
      createdAt: D.nowISO(),
      seed: {
        date: today,
        month: sets.month,
        importantDate: sets.importantDate,
        importantId: important ? important.id : '',
        sampleHabitIds: habits.map(function (habit) { return habit.id; })
      }
    });
    return true;
  }

  function clear() {
    var meta = PP.data.getMeta();
    var seed = meta.seed || {};

    PP.data.saveBooks(PP.data.getBooks().filter(function (book) { return !book.sample; }).map(function (book) {
      book.readingLogs = book.readingLogs.filter(function (log) { return !log.sample; });
      return book;
    }));
    PP.data.saveTodos(PP.data.getTodos().filter(function (item) { return !item.sample; }));
    PP.data.saveWritings(PP.data.getWritings().filter(function (item) { return !item.sample; }));

    var sampleHabitIds = PP.data.getHabits().filter(function (habit) { return habit.sample; }).map(function (habit) { return habit.id; });
    PP.data.saveHabits(PP.data.getHabits().filter(function (habit) { return !habit.sample; }));
    var logs = PP.data.getHabitLogs();
    sampleHabitIds.forEach(function (id) { delete logs[id]; });
    (seed.sampleHabitIds || []).forEach(function (id) { delete logs[id]; });
    PP.store.write(PP.KEYS.habitLogs, logs);

    // 兼容上一版本 seed 里的单一打卡
    if (Array.isArray(seed.checkinDates) && seed.checkinDates.length) {
      var oldCheckins = PP.store.read(PP.KEYS.checkins, {});
      seed.checkinDates.forEach(function (iso) { delete oldCheckins[iso]; });
      PP.store.write(PP.KEYS.checkins, oldCheckins);
    }

    var importantAll = PP.data.getImportantAll();
    Object.keys(importantAll).forEach(function (iso) {
      var kept = (Array.isArray(importantAll[iso]) ? importantAll[iso] : []).filter(function (item) {
        return !item.sample;
      });
      if (kept.length) importantAll[iso] = kept;
      else delete importantAll[iso];
    });
    PP.store.write(PP.KEYS.important, importantAll);

    var days = PP.data.getDays();
    Object.keys(days).forEach(function (iso) {
      var day = PP.data.getDay(iso);
      day.moods = day.moods.filter(function (item) { return !item.sample; });
      day.todos = day.todos.filter(function (item) { return !item.sample; });
      day.timeline = day.timeline.filter(function (item) { return !item.sample; });
      if (day.sampleSummary) {
        day.summary = '';
        day.sampleSummary = false;
      }
      if (!day.moods.length && !day.summary && !day.todos.length && !day.timeline.length) {
        delete days[iso];
      } else {
        days[iso] = day;
      }
    });
    PP.store.write(PP.KEYS.days, days);

    var summaries = PP.data.getMonthSummaries();
    Object.keys(summaries).forEach(function (ym) {
      if (summaries[ym] && summaries[ym].sample) delete summaries[ym];
    });
    PP.store.write(PP.KEYS.months, summaries);

    PP.data.setMeta({
      seeded: true,
      sampleCleared: true,
      seed: null,
      clearedAt: D.nowISO(),
      schemaVersion: PP.data.schemaVersion
    });
    return true;
  }

  PP.seed = {
    installIfNeeded: installIfNeeded,
    clear: clear
  };
}());
