/* ==========================================================================
   分期详情：小目标 / 截止 / 待办 / 打卡 / 可用资料
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;
  var td = PP.taskData;

  /* ------------------------------ 渲染 ------------------------------ */

  function periodIndex(task, periodId) {
    for (var index = 0; index < task.periods.length; index += 1) {
      if (task.periods[index].id === periodId) return index;
    }
    return -1;
  }

  function startDateOf(period) {
    var created = new Date(period.createdAt);
    if (!isNaN(created.getTime())) return D.toISO(created);
    return D.today();
  }

  // 创建日 → 本阶段截止日；没填截止日就展示 30 天；最多 120 格。
  function checkinDates(period) {
    var start = startDateOf(period);
    var end = period.due && D.parseISO(period.due) ? period.due : D.addDays(start, 29);
    if (end < start) end = start;
    var dates = [];
    var cursor = start;
    while (dates.length < 120 && cursor <= end) {
      dates.push(cursor);
      cursor = D.addDays(cursor, 1);
    }
    return dates;
  }

  function checkinBodyHTML(period) {
    var dates = checkinDates(period);
    var map = period.checkins || {};
    var count = Object.keys(map).length;
    var cells = dates.map(function (iso) {
      var checked = !!map[iso];
      return '<button class="task-checkin-cell' + (checked ? ' is-checked' : '') + (iso === D.today() ? ' is-today' : '') + '" type="button" data-period-checkin data-date="' + iso + '" aria-pressed="' + String(checked) + '" aria-label="' + U.escapeAttr(D.fullDateCN(iso) + (checked ? ' 已打卡' : ' 未打卡')) + '">' +
        '<span class="task-checkin-day">' + Number(iso.slice(8, 10)) + '</span>' +
        '<span class="task-checkin-week">' + U.escapeHTML(D.weekdayShort(iso)) + '</span>' +
      '</button>';
    }).join('');

    return '<div class="task-checkin-tip">已打卡 <strong data-period-checkin-count>' + count + '</strong> 天' +
        '<span class="task-checkin-hint">点击格子打卡，再点一次取消。</span>' +
      '</div>' +
      '<div class="task-checkin-grid" data-period-checkin-grid>' + cells + '</div>';
  }

  function todoRowHTML(todo) {
    return '<div class="task-todo-row' + (todo.done ? ' is-done' : '') + '" data-period-todo-id="' + U.escapeAttr(todo.id) + '">' +
      '<button class="check-control' + (todo.done ? ' is-checked' : '') + '" type="button" data-period-todo-toggle role="checkbox" aria-checked="' + String(todo.done) + '" aria-label="' + (todo.done ? '标记为未完成' : '标记为已完成') + '：' + U.escapeAttr(todo.text) + '">' +
        ui.icon('check', 13) +
      '</button>' +
      '<span class="task-todo-text">' + U.escapeHTML(todo.text) + '</span>' +
      '<span class="task-todo-actions">' +
        '<button class="icon-btn is-small" type="button" data-period-todo-edit aria-label="编辑待办">' + ui.icon('pencil', 13) + '</button>' +
        '<button class="icon-btn is-small is-danger" type="button" data-period-todo-delete aria-label="删除待办">' + ui.icon('trash', 13) + '</button>' +
      '</span>' +
    '</div>';
  }

  function todoListHTML(task, periodId) {
    var todos = td.getSortedTodos(task.id, periodId);
    if (!todos.length) {
      return '<p class="task-bare-hint">这一期还没有待办。把最容易开始的一步写下来。</p>';
    }
    return todos.map(todoRowHTML).join('');
  }

  function dueBlockHTML(period) {
    return '<section class="task-block task-due-block' + (period.due ? '' : ' is-empty') + '">' +
      '<div class="task-due-row">' +
        '<span class="task-due-label" data-period-due-label>' + (period.due ? '本阶段截止时间' : '设置截止时间') + '</span>' +
        '<input class="task-due-input" type="date" value="' + U.escapeAttr(period.due) + '" aria-label="本阶段截止时间" data-period-due>' +
        '<button class="task-due-clear" type="button" data-period-due-clear' + (period.due ? '' : ' hidden') + '>清除</button>' +
        '<span class="tiny muted" data-period-due-hint>' +
          (period.due ? '打卡格子会一直显示到这一天。' : '不填也没关系：打卡格子先显示创建日起的 30 天。') +
        '</span>' +
      '</div>' +
    '</section>';
  }

  function notFoundHTML(task, taskId) {
    return '<div class="page-shell task-page">' +
      '<div class="task-crumb">' +
        '<a class="task-back" href="#/tasks/' + encodeURIComponent(taskId) + '">← 返回任务</a>' +
      '</div>' +
      '<h1 class="task-head-title">没有找到这一期</h1>' +
      '<p class="task-bare-hint">它可能已经被删除。回到任务里看看还有哪些分期。</p>' +
      '<p class="task-bare-hint"><a class="btn btn-sm btn-soft" href="#/tasks/' + encodeURIComponent(taskId) + '">' +
        (task ? '回到「' + U.escapeHTML(task.title || '这个任务') + '」' : '回到长期任务') +
      '</a></p>' +
    '</div>';
  }

  function render(route) {
    var task = td.getTask(route && route.taskId);
    if (!task) {
      return '<div class="page-shell task-page">' +
        '<div class="task-crumb"><a class="task-back" href="#/tasks">← 返回长期任务</a></div>' +
        '<h1 class="task-head-title">没有找到这个任务</h1>' +
        '<p class="task-bare-hint">它可能已经被删除，或者链接里的编号不完整。</p>' +
        '<p class="task-bare-hint"><a class="btn btn-sm btn-soft" href="#/tasks">回到长期任务列表</a></p>' +
      '</div>';
    }

    var index = periodIndex(task, route && route.periodId);
    if (index < 0) return notFoundHTML(task, task.id);
    var period = task.periods[index];
    var periodNo = index + 1;
    var todos = td.getSortedTodos(task.id, period.id);
    var pending = todos.filter(function (todo) { return !todo.done; }).length;

    return '<div class="page-shell task-page task-period-page">' +
      '<div class="task-crumb">' +
        '<a class="task-back" href="#/tasks/' + encodeURIComponent(task.id) + '">← 返回任务</a>' +
        '<span class="task-crumb-path">' +
          '<a href="#/tasks/' + encodeURIComponent(task.id) + '">' + U.escapeHTML(task.title || '未命名任务') + '</a>' +
          '<span class="task-crumb-sep">›</span>' +
          '<span class="task-crumb-now">第 ' + periodNo + ' 期</span>' +
        '</span>' +
      '</div>' +

      '<header class="page-head">' +
        '<div class="page-head-copy">' +
          '<span class="eyebrow">PERIOD ' + U.pad2(periodNo) + '</span>' +
          '<h1>第 ' + periodNo + ' 期</h1>' +
          '<p class="lede">这一期只走一小段：把目标写清楚，把待办拆小，做到就打个卡。</p>' +
        '</div>' +
        '<div class="page-head-actions">' +
          '<span class="save-state" data-period-save>最近保存 ' + U.escapeHTML(D.formatSaved(task.updatedAt)) + '</span>' +
        '</div>' +
      '</header>' +

      '<section class="task-block task-goal-block">' +
        '<div class="task-block-head">' +
          '<div><span class="task-block-kicker">GOAL</span><h2>' + ui.icon('sparkles', 17) + '本阶段小目标</h2></div>' +
          '<span class="tiny muted">自动保存</span>' +
        '</div>' +
        '<label class="field">' +
          '<span class="field-label">小目标</span>' +
          '<textarea class="task-goal-input" rows="2" maxlength="500" placeholder="这一期只想完成什么？" data-period-goal>' + U.escapeHTML(period.goal) + '</textarea>' +
        '</label>' +
      '</section>' +

      dueBlockHTML(period) +

      '<section class="task-block task-period-todo-block">' +
        '<div class="task-block-head">' +
          '<div><span class="task-block-kicker">TODOS</span><h2>' + ui.icon('todo', 17) + '本阶段待办</h2></div>' +
          '<span class="tiny muted">' + pending + ' 项待完成 / ' + (todos.length - pending) + ' 项已完成</span>' +
        '</div>' +
        '<form class="task-todo-form" data-period-todo-form>' +
          '<input type="text" maxlength="140" placeholder="这一期要做的一件小事" aria-label="本阶段待办内容" data-period-todo-input>' +
          '<button class="btn btn-sm btn-soft" type="submit">' + ui.icon('plus', 13) + '添加</button>' +
        '</form>' +
        '<div class="task-todo-list" data-period-todo-list>' + todoListHTML(task, period.id) + '</div>' +
      '</section>' +

      '<section class="task-block task-checkin-block">' +
        '<div class="task-block-head">' +
          '<div><span class="task-block-kicker">CHECK-IN</span><h2>' + ui.icon('today', 17) + '本阶段打卡</h2></div>' +
          '<span class="tiny muted">' + U.escapeHTML(D.shortDateCN(startDateOf(period))) + ' 起 · 最多 120 格</span>' +
        '</div>' +
        '<div data-period-checkin-body>' + checkinBodyHTML(period) + '</div>' +
      '</section>' +

      '<section class="task-block task-period-material-block">' +
        '<div class="task-block-head">' +
          '<div><span class="task-block-kicker">MATERIALS</span><h2>' + ui.icon('paperclip', 17) + '本阶段可用资料</h2></div>' +
          '<span class="tiny muted">打字即自动保存</span>' +
        '</div>' +
        '<label class="field">' +
          '<span class="field-label">文字资料</span>' +
          '<textarea class="task-note-input" rows="5" maxlength="20000" placeholder="这一期用到的笔记、清单、链接……" data-period-note>' + U.escapeHTML(period.note) + '</textarea>' +
        '</label>' +
        '<div data-period-attachments>' + PP.attachments.html(period.attachments) + '</div>' +
      '</section>' +
    '</div>';
  }

  /* ------------------------------ 弹窗 ------------------------------ */

  function openTodoModal(task, periodId, todo, onSaved) {
    var formId = 'editPeriodTodo-' + Date.now();
    ui.modal({
      title: '编辑待办',
      subtitle: '改一下这件事的说法。',
      body: '<form id="' + formId + '">' +
        '<label class="field"><span class="field-label">待办内容</span>' +
          '<input type="text" name="text" required maxlength="140" value="' + U.escapeAttr(todo.text) + '" data-autofocus></label>' +
      '</form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button>' +
        '<button class="btn btn-primary" type="submit" form="' + formId + '">保存修改</button>',
      onMount: function (body, close) {
        var form = body.querySelector('form');
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var data = new FormData(form);
          var value = String(data.get('text') || '').trim();
          if (!value) {
            ui.toast('待办内容不能为空。', 'warning');
            return;
          }
          td.updateTodo(task.id, todo.id, { text: value }, periodId);
          close();
          onSaved();
          ui.toast('待办已更新。', 'success');
        });
      }
    });
  }

  /* ------------------------------ 事件 ------------------------------ */

  function mount(root, route) {
    var task = td.getTask(route && route.taskId);
    if (!task) return;
    var index = periodIndex(task, route && route.periodId);
    if (index < 0) return;

    var taskId = task.id;
    var periodId = task.periods[index].id;
    var status = root.querySelector('[data-period-save]');

    function markSaved() {
      ui.setSaveState(status, 'saved', '已保存 ' + D.nowTime());
    }

    function currentTask() {
      return td.getTask(taskId);
    }

    function currentPeriod() {
      var latest = currentTask();
      if (!latest) return null;
      return latest.periods.filter(function (item) { return item.id === periodId; })[0] || null;
    }

    /* 小目标与资料：自动保存 */
    var goalInput = root.querySelector('[data-period-goal]');
    if (goalInput) {
      ui.bindAutoSave(goalInput, function (value) {
        td.updatePeriod(taskId, periodId, { goal: value });
        return true;
      }, status, { delay: 480 });
    }

    var noteInput = root.querySelector('[data-period-note]');
    if (noteInput) {
      ui.bindAutoSave(noteInput, function (value) {
        td.updatePeriod(taskId, periodId, { note: value });
        return true;
      }, status, { delay: 620 });
    }

    /* 打卡区：改动截止时间会改变格子范围，所以整块重绘 */
    var checkinBody = root.querySelector('[data-period-checkin-body]');
    function renderCheckinBody() {
      var latest = currentPeriod();
      if (!latest || !checkinBody) return;
      checkinBody.innerHTML = checkinBodyHTML(latest);
    }

    function refreshCount() {
      if (!checkinBody) return;
      var countEl = checkinBody.querySelector('[data-period-checkin-count]');
      if (countEl) countEl.textContent = String(td.getPeriodCheckins(taskId, periodId).length);
    }

    if (checkinBody) {
      checkinBody.addEventListener('click', function (event) {
        var cell = event.target.closest('[data-period-checkin]');
        if (!cell) return;
        var iso = cell.getAttribute('data-date');
        var checked = td.togglePeriodCheckin(taskId, periodId, iso);
        cell.classList.toggle('is-checked', checked);
        cell.setAttribute('aria-pressed', String(checked));
        refreshCount();
        markSaved();
      });
    }

    /* 截止时间 */
    var dueInput = root.querySelector('[data-period-due]');
    var dueClear = root.querySelector('[data-period-due-clear]');
    var dueBlock = root.querySelector('.task-due-block');
    var dueLabel = root.querySelector('[data-period-due-label]');
    var dueHint = root.querySelector('[data-period-due-hint]');

    function syncDueUI() {
      var hasValue = !!(dueInput && dueInput.value);
      if (dueBlock) dueBlock.classList.toggle('is-empty', !hasValue);
      if (dueLabel) dueLabel.textContent = hasValue ? '本阶段截止时间' : '设置截止时间';
      if (dueHint) dueHint.textContent = hasValue ? '打卡格子会一直显示到这一天。' : '不填也没关系：打卡格子先显示创建日起的 30 天。';
      if (dueClear) dueClear.hidden = !hasValue;
    }

    function commitDue() {
      var value = dueInput ? dueInput.value : '';
      var latest = currentPeriod();
      if (latest && latest.due === value) {
        syncDueUI();
        return;
      }
      td.updatePeriod(taskId, periodId, { due: value });
      syncDueUI();
      renderCheckinBody();
      markSaved();
    }

    if (dueInput) {
      dueInput.addEventListener('change', commitDue);
      dueInput.addEventListener('input', commitDue);
    }
    if (dueClear) {
      dueClear.addEventListener('click', function () {
        if (dueInput) dueInput.value = '';
        commitDue();
      });
    }

    /* 本阶段资料附件：ownerType = task-period，ownerId = taskId:periodId */
    var attachBox = root.querySelector('[data-period-attachments]');
    if (attachBox) {
      PP.attachments.mount(attachBox, {
        ownerType: 'task-period',
        ownerId: taskId + ':' + periodId,
        getAttachments: function () {
          var latest = currentPeriod();
          return latest ? latest.attachments : [];
        },
        setAttachments: function (list) {
          td.updatePeriod(taskId, periodId, { attachments: list });
        },
        onChange: markSaved
      });
    }

    /* 待办 */
    var todoListEl = root.querySelector('[data-period-todo-list]');
    function renderTodoList() {
      var latest = currentTask();
      if (!latest || !todoListEl) return;
      todoListEl.innerHTML = todoListHTML(latest, periodId);
    }

    var todoForm = root.querySelector('[data-period-todo-form]');
    if (todoForm) {
      var todoInput = todoForm.querySelector('[data-period-todo-input]');
      todoForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var value = String(todoInput && todoInput.value || '').trim();
        if (!value) {
          ui.toast('先写一件要做的事。', 'warning');
          if (todoInput) todoInput.focus();
          return;
        }
        td.addTodo(taskId, value, periodId);
        if (todoInput) {
          todoInput.value = '';
          todoInput.focus();
        }
        renderTodoList();
        markSaved();
      });
    }

    if (todoListEl) {
      todoListEl.addEventListener('click', function (event) {
        var row = event.target.closest('[data-period-todo-id]');
        if (!row) return;
        var todoId = row.getAttribute('data-period-todo-id');
        var latest = currentTask();
        if (!latest) return;
        var period = latest.periods.filter(function (item) { return item.id === periodId; })[0];
        if (!period) return;
        var todo = period.todos.filter(function (item) { return item.id === todoId; })[0];

        if (event.target.closest('[data-period-todo-toggle]')) {
          td.toggleTodo(taskId, todoId, periodId);
          renderTodoList();
          markSaved();
          return;
        }
        if (event.target.closest('[data-period-todo-delete]')) {
          ui.confirm({
            title: '删除待办',
            message: '确定删除「<strong>' + U.escapeHTML(todo ? todo.text : '这条待办') + '</strong>」吗？',
            confirmText: '删除'
          }).then(function (confirmed) {
            if (!confirmed) return;
            td.removeTodo(taskId, todoId, periodId);
            renderTodoList();
            markSaved();
            ui.toast('待办已删除。', 'success');
          });
          return;
        }
        if (event.target.closest('[data-period-todo-edit]') && todo) {
          openTodoModal(latest, periodId, todo, function () {
            renderTodoList();
            markSaved();
          });
        }
      });
    }
  }

  PP.pages['task-period'] = { render: render, mount: mount };
}());
