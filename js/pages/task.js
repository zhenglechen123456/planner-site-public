/* ==========================================================================
   长期任务详情：任务名称 / 截止 / 资料 / 分期 / 待办
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

  function dueText(iso) {
    var date = D.parseISO(iso);
    if (!date) return '';
    var today = D.parseISO(D.today());
    var days = Math.round((date.getTime() - today.getTime()) / 86400000);
    var relative = days < 0 ? '已过期 ' + Math.abs(days) + ' 天' : days === 0 ? '就是今天' : '还剩 ' + days + ' 天';
    return D.fullDateCN(iso) + ' · ' + relative;
  }

  function todoRowHTML(todo) {
    return '<div class="task-todo-row' + (todo.done ? ' is-done' : '') + '" data-task-todo-id="' + U.escapeAttr(todo.id) + '">' +
      '<button class="check-control' + (todo.done ? ' is-checked' : '') + '" type="button" data-task-todo-toggle role="checkbox" aria-checked="' + String(todo.done) + '" aria-label="' + (todo.done ? '标记为未完成' : '标记为已完成') + '：' + U.escapeAttr(todo.text) + '">' +
        ui.icon('check', 13) +
      '</button>' +
      '<span class="task-todo-text">' + U.escapeHTML(todo.text) + '</span>' +
      '<span class="task-todo-actions">' +
        '<button class="icon-btn is-small" type="button" data-task-todo-edit aria-label="编辑待办">' + ui.icon('pencil', 13) + '</button>' +
        '<button class="icon-btn is-small is-danger" type="button" data-task-todo-delete aria-label="删除待办">' + ui.icon('trash', 13) + '</button>' +
      '</span>' +
    '</div>';
  }

  function todoListHTML(task) {
    var todos = td.getSortedTodos(task.id);
    if (!todos.length) {
      return '<p class="task-bare-hint">还没有待办。先记下一件小事，完成一项就划掉一项。</p>';
    }
    return todos.map(todoRowHTML).join('');
  }

  function todoSectionHTML(task) {
    var todos = td.getSortedTodos(task.id);
    var pending = todos.filter(function (todo) { return !todo.done; }).length;
    return '<section class="task-block task-todo-block">' +
      '<div class="task-block-head">' +
        '<div><span class="task-block-kicker">TASK TODOS</span><h2>' + ui.icon('todo', 17) + '任务待办</h2></div>' +
        '<span class="tiny muted">' + pending + ' 项待完成 / ' + (todos.length - pending) + ' 项已完成</span>' +
      '</div>' +
      '<form class="task-todo-form" data-task-todo-form>' +
        '<input type="text" maxlength="140" placeholder="加一件要在这个任务里完成的事" aria-label="任务待办内容" data-task-todo-input>' +
        '<button class="btn btn-sm btn-soft" type="submit">' + ui.icon('plus', 13) + '添加</button>' +
      '</form>' +
      '<div class="task-todo-list" data-task-todo-list>' + todoListHTML(task) + '</div>' +
    '</section>';
  }

  function periodCardHTML(task, period, index) {
    var pending = period.todos.filter(function (todo) { return !todo.done; }).length;
    var checkinDays = Object.keys(period.checkins).length;
    return '<article class="task-period-card" tabindex="0" role="link" aria-label="进入第 ' + (index + 1) + ' 期" data-period-card data-period-id="' + U.escapeAttr(period.id) + '">' +
      '<div class="task-period-top">' +
        '<span class="task-period-index">第 ' + (index + 1) + ' 期</span>' +
        '<span class="task-period-actions">' +
          '<button class="icon-btn is-small" type="button" data-period-edit aria-label="编辑第 ' + (index + 1) + ' 期">' + ui.icon('pencil', 13) + '</button>' +
          '<button class="icon-btn is-small is-danger" type="button" data-period-delete aria-label="删除第 ' + (index + 1) + ' 期">' + ui.icon('trash', 13) + '</button>' +
        '</span>' +
      '</div>' +
      '<h3 class="task-period-goal">' +
        (period.goal ? U.escapeHTML(period.goal) : '<span class="task-period-empty">还没有写小目标</span>') +
      '</h3>' +
      (period.due ? '<p class="task-period-due">' + ui.icon('clock', 12) + '截止 ' + U.escapeHTML(D.fullDateCN(period.due)) + '</p>' : '') +
      '<p class="task-period-meta">' +
        '<span>' + pending + ' 项待办</span>' +
        '<span>打卡 ' + checkinDays + ' 天</span>' +
        (period.note ? '<span>有资料</span>' : '') +
      '</p>' +
    '</article>';
  }

  function periodSectionHTML(task) {
    if (!task.periods.length) {
      return '<div class="task-bare-hint">' +
        ui.icon('list', 15) +
        '<span>还没有分期。把任务拆成「第 1 期」，小目标会更容易开始。</span>' +
        '<button class="btn btn-sm btn-soft" type="button" data-add-period>' + ui.icon('plus', 13) + '新增分期</button>' +
      '</div>';
    }
    return '<section class="task-block task-period-block">' +
      '<div class="task-block-head">' +
        '<div><span class="task-block-kicker">MILESTONES</span><h2>' + ui.icon('list', 17) + '任务分期</h2></div>' +
        '<div class="task-block-actions">' +
          '<span class="tiny muted">共 ' + task.periods.length + ' 期</span>' +
          '<button class="btn btn-sm btn-soft" type="button" data-add-period>' + ui.icon('plus', 13) + '新增分期</button>' +
        '</div>' +
      '</div>' +
      '<div class="task-period-grid">' +
        task.periods.map(function (period, index) { return periodCardHTML(task, period, index); }).join('') +
      '</div>' +
    '</section>';
  }

  function notFoundHTML() {
    return '<div class="page-shell task-page">' +
      '<div class="task-crumb">' +
        '<a class="task-back" href="#/tasks">' + ui.icon('chevronLeft', 14) + '返回长期任务</a>' +
      '</div>' +
      '<h1 class="task-head-title">没有找到这个任务</h1>' +
      '<p class="task-bare-hint">它可能已经被删除，或者链接里的编号不完整。</p>' +
      '<p class="task-bare-hint"><a class="btn btn-sm btn-soft" href="#/tasks">回到长期任务列表</a></p>' +
    '</div>';
  }

  function render(route) {
    var task = td.getTask(route && route.taskId);
    if (!task) return notFoundHTML();

    var todos = td.getSortedTodos(task.id);
    var pending = todos.filter(function (todo) { return !todo.done; }).length;

    return '<div class="page-shell task-page task-detail-page">' +
      '<h1 class="sr-only">任务详情</h1>' +
      '<div class="task-crumb">' +
        '<a class="task-back" href="#/tasks">' + ui.icon('chevronLeft', 14) + '返回长期任务</a>' +
        '<span class="task-crumb-path">' +
          '<a href="#/tasks">长期任务</a>' +
          '<span class="task-crumb-sep">/</span>' +
          '<span class="task-crumb-now">任务详情</span>' +
        '</span>' +
      '</div>' +

      '<section class="task-block task-overview-block">' +
        '<div class="task-block-head">' +
          '<div><span class="task-block-kicker">TASK</span><h2>' + ui.icon('sparkles', 17) + '任务名称</h2></div>' +
          '<span class="save-state" data-task-save>最近保存 ' + U.escapeHTML(D.formatSaved(task.updatedAt)) + '</span>' +
        '</div>' +
        '<label class="field">' +
          '<span class="sr-only">任务名称</span>' +
          '<input class="task-title-input" type="text" maxlength="120" value="' + U.escapeAttr(task.title) + '" placeholder="给这件事起个名字" data-task-title>' +
        '</label>' +
        '<div class="task-due-row">' +
          '<span class="task-due-label">截止时间' + (task.due ? '' : '（可选）') + '</span>' +
          '<input class="task-due-input" type="date" value="' + U.escapeAttr(task.due) + '" aria-label="任务截止时间" data-task-due>' +
          '<button class="task-due-clear" type="button" data-task-due-clear' + (task.due ? '' : ' hidden') + '>清除截止时间</button>' +
          (task.due ? '<span class="tiny muted">' + U.escapeHTML(dueText(task.due)) + '</span>' : '') +
        '</div>' +
        '<div class="task-overview-foot">' +
          '<span class="tiny muted">' + task.periods.length + ' 期 · ' + pending + ' 项待办未完成</span>' +
          '<button class="task-danger-action" type="button" data-task-delete>删除这个任务</button>' +
        '</div>' +
      '</section>' +

      '<section class="task-block task-material-block">' +
        '<div class="task-block-head">' +
          '<div><span class="task-block-kicker">MATERIALS</span><h2>' + ui.icon('writing', 17) + '任务资料</h2></div>' +
          '<span class="tiny muted">打字即自动保存</span>' +
        '</div>' +
        '<label class="field">' +
          '<span class="field-label">文字资料</span>' +
          '<textarea class="task-note-input" rows="5" maxlength="20000" placeholder="背景、参考资料、思路、链接……都可以先堆在这里。" data-task-note>' + U.escapeHTML(task.note) + '</textarea>' +
        '</label>' +
        '<div data-task-attachments>' + PP.attachments.html(task.attachments) + '</div>' +
      '</section>' +

      periodSectionHTML(task) +
      todoSectionHTML(task) +
    '</div>';
  }

  /* ------------------------------ 弹窗 ------------------------------ */

  function openPeriodModal(task, period, onDone) {
    var editing = !!period;
    var formId = (editing ? 'editPeriod-' : 'addPeriod-') + Date.now();
    ui.modal({
      title: editing ? '编辑分期' : '新增分期',
      subtitle: editing ? '修改这一期的小目标或截止时间。' : '把长期任务拆成一小段，先完成这一段。',
      body: '<form id="' + formId + '">' +
        '<div class="form-grid">' +
          '<label class="field span-2"><span class="field-label">本阶段小目标</span>' +
            '<textarea name="goal" rows="3" maxlength="500" placeholder="这一期只想完成什么？" data-autofocus>' + U.escapeHTML(editing ? period.goal : '') + '</textarea></label>' +
          '<label class="field span-2"><span class="field-label">本阶段截止时间 <span class="optional">可选</span></span>' +
            '<input type="date" name="due" value="' + U.escapeAttr(editing ? period.due : '') + '"></label>' +
        '</div>' +
      '</form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button>' +
        '<button class="btn btn-primary" type="submit" form="' + formId + '">' + (editing ? '保存修改' : '创建分期') + '</button>',
      onMount: function (body, close) {
        var form = body.querySelector('form');
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var data = new FormData(form);
          var goal = String(data.get('goal') || '');
          var due = String(data.get('due') || '');
          if (editing) {
            td.updatePeriod(task.id, period.id, { goal: goal, due: due });
            ui.toast('分期已更新。', 'success');
          } else {
            td.addPeriod(task.id, { goal: goal, due: due });
            ui.toast('新的一期已创建。', 'success');
          }
          close();
          onDone();
        });
      }
    });
  }

  function openTodoModal(task, todo, onSaved) {
    var formId = 'editTaskTodo-' + Date.now();
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
          td.updateTodo(task.id, todo.id, { text: value });
          close();
          onSaved();
          ui.toast('待办已更新。', 'success');
        });
      }
    });
  }

  /* ------------------------------ 事件 ------------------------------ */

  function attachmentMetas(task) {
    var metas = (task.attachments || []).slice();
    task.periods.forEach(function (period) {
      metas = metas.concat(period.attachments || []);
    });
    return metas;
  }

  function mount(root, route) {
    var task = td.getTask(route && route.taskId);
    if (!task) return;
    var taskId = task.id;
    var status = root.querySelector('[data-task-save]');

    function markSaved() {
      ui.setSaveState(status, 'saved', '已保存 ' + D.nowTime());
    }

    function currentTask() {
      return td.getTask(taskId);
    }

    /* 名称与资料：自动保存 */
    var titleInput = root.querySelector('[data-task-title]');
    if (titleInput) {
      ui.bindAutoSave(titleInput, function (value) {
        td.updateTask(taskId, { title: value });
        return true;
      }, status, { delay: 480 });
    }

    var noteInput = root.querySelector('[data-task-note]');
    if (noteInput) {
      ui.bindAutoSave(noteInput, function (value) {
        td.updateTask(taskId, { note: value });
        return true;
      }, status, { delay: 620 });
    }

    /* 截止时间：日期控件改动即保存，可清除 */
    var dueInput = root.querySelector('[data-task-due]');
    var dueClear = root.querySelector('[data-task-due-clear]');
    function syncDueClear() {
      if (dueClear) dueClear.hidden = !(dueInput && dueInput.value);
    }
    if (dueInput) {
      var commitDue = function () {
        var latest = currentTask();
        if (latest && latest.due === dueInput.value) {
          syncDueClear();
          return;
        }
        td.updateTask(taskId, { due: dueInput.value });
        markSaved();
        syncDueClear();
      };
      dueInput.addEventListener('change', commitDue);
      dueInput.addEventListener('input', commitDue);
    }
    if (dueClear) {
      dueClear.addEventListener('click', function () {
        if (dueInput) dueInput.value = '';
        td.updateTask(taskId, { due: '' });
        markSaved();
        syncDueClear();
      });
    }

    /* 任务资料附件 */
    var attachBox = root.querySelector('[data-task-attachments]');
    if (attachBox) {
      PP.attachments.mount(attachBox, {
        ownerType: 'task',
        ownerId: taskId,
        getAttachments: function () {
          var latest = currentTask();
          return latest ? latest.attachments : [];
        },
        setAttachments: function (list) {
          td.updateTask(taskId, { attachments: list });
        },
        onChange: markSaved
      });
    }

    /* 待办 */
    var todoListEl = root.querySelector('[data-task-todo-list]');
    function renderTodoList() {
      var latest = currentTask();
      if (!latest || !todoListEl) return;
      todoListEl.innerHTML = todoListHTML(latest);
    }

    var todoForm = root.querySelector('[data-task-todo-form]');
    if (todoForm) {
      var todoInput = todoForm.querySelector('[data-task-todo-input]');
      todoForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var value = String(todoInput && todoInput.value || '').trim();
        if (!value) {
          ui.toast('先写一件要做的事。', 'warning');
          if (todoInput) todoInput.focus();
          return;
        }
        td.addTodo(taskId, value);
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
        var row = event.target.closest('[data-task-todo-id]');
        if (!row) return;
        var todoId = row.getAttribute('data-task-todo-id');
        var latest = currentTask();
        if (!latest) return;
        var todo = latest.todos.filter(function (item) { return item.id === todoId; })[0];

        if (event.target.closest('[data-task-todo-toggle]')) {
          td.toggleTodo(taskId, todoId);
          renderTodoList();
          markSaved();
          return;
        }
        if (event.target.closest('[data-task-todo-delete]')) {
          ui.confirm({
            title: '删除待办',
            message: '确定删除「<strong>' + U.escapeHTML(todo ? todo.text : '这条待办') + '</strong>」吗？',
            confirmText: '删除'
          }).then(function (confirmed) {
            if (!confirmed) return;
            td.removeTodo(taskId, todoId);
            renderTodoList();
            markSaved();
            ui.toast('待办已删除。', 'success');
          });
          return;
        }
        if (event.target.closest('[data-task-todo-edit]') && todo) {
          openTodoModal(latest, todo, function () {
            renderTodoList();
            markSaved();
          });
        }
      });
    }

    /* 分期 */
    root.querySelectorAll('[data-add-period]').forEach(function (button) {
      button.addEventListener('click', function () {
        var latest = currentTask();
        if (!latest) return;
        openPeriodModal(latest, null, function () { PP.router.refresh(); });
      });
    });

    var periodGrid = root.querySelector('.task-period-grid');
    if (periodGrid) {
      function periodFromEvent(event) {
        var card = event.target.closest('[data-period-card]');
        if (!card) return null;
        var latest = currentTask();
        if (!latest) return null;
        var periodId = card.getAttribute('data-period-id');
        var period = latest.periods.filter(function (item) { return item.id === periodId; })[0];
        return period ? { card: card, period: period, task: latest } : null;
      }

      periodGrid.addEventListener('click', function (event) {
        var found = periodFromEvent(event);
        if (!found) return;
        if (event.target.closest('[data-period-edit]')) {
          event.preventDefault();
          event.stopPropagation();
          openPeriodModal(found.task, found.period, function () { PP.router.refresh(); });
          return;
        }
        if (event.target.closest('[data-period-delete]')) {
          event.preventDefault();
          event.stopPropagation();
          ui.confirm({
            title: '删除分期',
            message: '确定删除「<strong>第 ' + (found.task.periods.indexOf(found.period) + 1) + ' 期</strong>」吗？<br><br>这一期的待办、打卡和资料附件会一并删除。',
            confirmText: '删除这一期'
          }).then(function (confirmed) {
            if (!confirmed) return;
            var metas = (found.period.attachments || []).slice();
            Promise.all(metas.map(function (meta) { return PP.attachments.remove(meta); })).catch(function (error) {
              console.warn('[拾光] 清理分期的附件失败：', error);
            }).finally(function () {
              td.removePeriod(taskId, found.period.id);
              ui.toast('分期已删除。', 'success');
              PP.router.refresh();
            });
          });
          return;
        }
        PP.router.go('#/tasks/' + encodeURIComponent(taskId) + '/period/' + encodeURIComponent(found.period.id));
      });

      periodGrid.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var found = periodFromEvent(event);
        if (!found || event.target.closest('button')) return;
        event.preventDefault();
        PP.router.go('#/tasks/' + encodeURIComponent(taskId) + '/period/' + encodeURIComponent(found.period.id));
      });
    }

    /* 删除整个任务 */
    var deleteTaskButton = root.querySelector('[data-task-delete]');
    if (deleteTaskButton) {
      deleteTaskButton.addEventListener('click', function () {
        var latest = currentTask();
        if (!latest) return;
        ui.confirm({
          title: '删除长期任务',
          message: '确定删除「<strong>' + U.escapeHTML(latest.title || '这个任务') + '</strong>」吗？<br><br>它的分期、待办、打卡与资料附件都会被删除，无法恢复。',
          confirmText: '删除任务'
        }).then(function (confirmed) {
          if (!confirmed) return;
          var metas = attachmentMetas(latest);
          Promise.all(metas.map(function (meta) { return PP.attachments.remove(meta); })).catch(function (error) {
            console.warn('[拾光] 清理任务的附件失败：', error);
          }).finally(function () {
            td.removeTask(taskId);
            ui.toast('任务已删除。', 'success');
            PP.router.go('#/tasks');
          });
        });
      });
    }
  }

  PP.pages.task = { render: render, mount: mount };
}());
