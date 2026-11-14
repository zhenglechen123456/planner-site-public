/* ==========================================================================
   待办：给“有截止时间但还没排进日程”的事
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  PP.state = PP.state || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  function ensureFilter() {
    if (['pending', 'done', 'all'].indexOf(PP.state.todoFilter) < 0) {
      PP.state.todoFilter = 'pending';
    }
    return PP.state.todoFilter;
  }

  function render(route) {
    var all = PP.data.getSortedTodos();
    var pending = all.filter(function (item) { return !item.done; });
    var done = all.filter(function (item) { return item.done; });
    var overdue = pending.filter(function (item) {
      var due = D.parseDateTimeLocal(item.due);
      return due && due.getTime() < Date.now();
    });
    var focusId = route && route.todoId ? route.todoId : '';
    var filter = focusId ? 'all' : ensureFilter();
    var visible = filter === 'pending' ? pending : filter === 'done' ? done : all;
    var defaultDue = D.addDays(D.today(), 1) + 'T18:00';
    var focusedItem = focusId ? all.filter(function (item) { return item.id === focusId; })[0] : null;

    var filters = [
      { key: 'pending', label: '待完成', count: pending.length },
      { key: 'done', label: '已完成', count: done.length },
      { key: 'all', label: '全部', count: all.length }
    ];

    var listHTML = visible.length
      ? visible.map(function (item) { return renderTodo(item, focusId); }).join('')
      : ui.emptyState(
          filter === 'done' ? '✓' : '🗓️',
          filter === 'done' ? '还没有完成的事项' : filter === 'pending' ? '没有悬着的事了' : '待办列表还是空的',
          filter === 'done' ? '完成一项后，它会安静地移到这边。' : filter === 'pending' ? '所有登记的事项都已完成，或者还没有添加新的事情。' : '把有截止时间、但还没想好什么时候做的事登记在这里。',
          filter === 'all' ? '<button class="btn btn-sm btn-soft" type="button" data-focus-deadline-form>' + ui.icon('plus', 14) + '添加第一条</button>' : ''
        );

    return '<div class="page-shell deadlines-page">' +
      '<header class="page-head">' +
        '<div class="page-head-copy">' +
          '<span class="eyebrow">DEADLINES & ERRANDS</span>' +
          '<h1>待办</h1>' +
          '<p class="lede">专门留给那些「需要在某个时间前完成、但还不确定什么时候做」的事。先记下来，让大脑空出位置。</p>' +
          '<div class="library-meta">' +
            '<span>' + ui.icon('todo', 13) + pending.length + ' 项待完成</span>' +
            '<span>' + ui.icon('clock', 13) + (overdue.length ? overdue.length + ' 项已到期' : '没有逾期') + '</span>' +
            '<span>' + ui.icon('check', 13) + done.length + ' 项已完成</span>' +
            (focusedItem ? '<span class="chip chip-primary">' + ui.icon('sparkles', 11) + '已定位：' + U.escapeHTML(focusedItem.text) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="page-head-actions">' +
          '<a class="btn" href="#/day/' + D.today() + '">' + ui.icon('calendar', 15) + '回每日页</a>' +
        '</div>' +
      '</header>' +

      '<section class="panel deadline-form-panel" id="deadlineForm">' +
        '<div class="section-head">' +
          '<div><span class="section-kicker">NEW DEADLINE</span><h2>' + ui.icon('plus', 17) + '登记一件事</h2></div>' +
          '<span class="tiny muted">按截止时间自动排序</span>' +
        '</div>' +
        '<form data-deadline-form>' +
          '<div class="deadline-form-grid">' +
            '<label class="field deadline-task-field"><span class="field-label">具体事项</span>' +
              '<input type="text" name="text" required maxlength="140" placeholder="例如：提交暑期实习申请" data-autofocus-deadline></label>' +
            '<label class="field"><span class="field-label">截止时间</span>' +
              '<input type="datetime-local" name="due" required value="' + defaultDue + '"></label>' +
            '<label class="field"><span class="field-label">地点</span>' +
              '<input type="text" name="place" required maxlength="80" placeholder="线上 / 图书馆 / 待定"></label>' +
            '<label class="field deadline-note-field"><span class="field-label">备注 <span class="optional">可选</span></span>' +
              '<textarea name="note" rows="2" maxlength="500" placeholder="要带什么、联系人、注意事项……"></textarea></label>' +
          '</div>' +
          '<div class="form-actions">' +
            '<button class="btn btn-primary" type="submit">' + ui.icon('plus', 15) + '加入待办</button>' +
          '</div>' +
        '</form>' +
      '</section>' +

      '<div class="deadline-toolbar">' +
        '<div class="filter-tabs" role="tablist" aria-label="待办筛选">' +
          filters.map(function (item) {
            return '<button class="filter-tab' + (filter === item.key ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' + String(filter === item.key) + '" data-todo-filter="' + item.key + '">' +
              item.label + '<span>' + item.count + '</span></button>';
          }).join('') +
        '</div>' +
        '<span class="tiny muted">' + (filter === 'pending' ? '按截止时间从近到远' : filter === 'done' ? '已完成的事项' : '全部登记事项') + '</span>' +
      '</div>' +

      '<div class="deadline-list">' + listHTML + '</div>' +
    '</div>';
  }

  function renderTodo(item, focusId) {
    var due = D.formatDue(item.due);
    var overdue = !item.done && due.tone === 'danger';
    var dueDate = item.due ? item.due.slice(0, 10) : '';
    var dayImportant = dueDate ? PP.data.getImportant(dueDate) : [];
    var importantLine = dayImportant.length
      ? '<a class="deadline-important-link" href="#/day/' + dueDate + '">' + ui.icon('sparkles', 11) + '当天重要日期：' + U.escapeHTML(dayImportant.map(function (entry) { return entry.title; }).join('、')) + '</a>'
      : '';
    var classes = ['deadline-item'];
    if (item.done) classes.push('is-done');
    if (overdue) classes.push('is-overdue');
    if (focusId && item.id === focusId) classes.push('is-focused');

    return '<article class="' + classes.join(' ') + '" data-deadline-id="' + U.escapeAttr(item.id) + '">' +
      '<button class="check-control deadline-check' + (item.done ? ' is-checked' : '') + '" type="button" data-deadline-toggle role="checkbox" aria-checked="' + String(item.done) + '" aria-label="' + (item.done ? '标记为未完成' : '标记为已完成') + '：' + U.escapeAttr(item.text) + '">' + ui.icon('check', 13) + '</button>' +
      '<div class="deadline-main">' +
        '<div class="deadline-title-row">' +
          '<h3>' + U.escapeHTML(item.text) + '</h3>' +
          (item.done
            ? '<span class="chip chip-success">' + ui.icon('check', 11) + '已完成</span>'
            : '<span class="chip ' + (due.tone === 'danger' ? 'chip-danger' : due.tone === 'warning' ? 'chip-warning' : 'chip-primary') + '">' + U.escapeHTML(due.relative || due.text) + '</span>') +
        '</div>' +
        '<div class="deadline-meta">' +
          '<span>' + ui.icon('clock', 12) + U.escapeHTML(due.text) + '</span>' +
          '<span>' + ui.icon('mapPin', 12) + U.escapeHTML(item.place || '地点待定') + '</span>' +
        '</div>' +
        (item.note ? '<p class="deadline-note">' + U.escapeHTML(item.note) + '</p>' : '') +
        importantLine +
      '</div>' +
      '<div class="deadline-actions">' +
        '<button class="icon-btn is-small" type="button" data-deadline-edit aria-label="编辑待办">' + ui.icon('pencil', 14) + '</button>' +
        '<button class="icon-btn is-small is-danger" type="button" data-deadline-delete aria-label="删除待办">' + ui.icon('trash', 14) + '</button>' +
      '</div>' +
    '</article>';
  }

  function openEditModal(item, onDone) {
    var formId = 'editDeadline-' + Date.now();
    ui.modal({
      title: '编辑待办',
      subtitle: '修改截止时间、地点或备注。',
      body: '<form id="' + formId + '">' +
        '<div class="form-grid">' +
          '<label class="field span-2"><span class="field-label">具体事项</span>' +
            '<input type="text" name="text" required maxlength="140" value="' + U.escapeAttr(item.text) + '" data-autofocus></label>' +
          '<label class="field"><span class="field-label">截止时间</span>' +
            '<input type="datetime-local" name="due" required value="' + U.escapeAttr(item.due) + '"></label>' +
          '<label class="field"><span class="field-label">地点</span>' +
            '<input type="text" name="place" required maxlength="80" value="' + U.escapeAttr(item.place) + '"></label>' +
          '<label class="field span-2"><span class="field-label">备注 <span class="optional">可选</span></span>' +
            '<textarea name="note" rows="3" maxlength="500">' + U.escapeHTML(item.note) + '</textarea></label>' +
        '</div>' +
      '</form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button>' +
        '<button class="btn btn-primary" type="submit" form="' + formId + '">保存修改</button>',
      onMount: function (body, close) {
        var form = body.querySelector('form');
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var data = new FormData(form);
          var text = String(data.get('text') || '').trim();
          var due = String(data.get('due') || '');
          var place = String(data.get('place') || '').trim();
          if (!text || !due || !place) {
            ui.toast('事项、截止时间和地点都需要填写。', 'warning');
            return;
          }
          PP.data.updateTodo(item.id, {
            text: text,
            due: due,
            place: place,
            note: String(data.get('note') || '').trim()
          });
          close();
          onDone();
          ui.toast('待办已更新。', 'success');
        });
      }
    });
  }

  function mount(root, route) {
    var form = root.querySelector('[data-deadline-form]');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var data = new FormData(form);
        var text = String(data.get('text') || '').trim();
        var due = String(data.get('due') || '');
        var place = String(data.get('place') || '').trim();
        if (!text || !due || !place) {
          ui.toast('事项、截止时间和地点都需要填写。', 'warning');
          return;
        }
        PP.data.addTodo({
          text: text,
          due: due,
          place: place,
          note: String(data.get('note') || '').trim()
        });
        ui.toast('已加入待办列表。', 'success');
        PP.state.todoFilter = 'pending';
        PP.router.refresh();
      });
    }

    root.querySelectorAll('[data-todo-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        PP.state.todoFilter = button.getAttribute('data-todo-filter');
        if (route && route.todoId) PP.router.go('#/todos');
        else PP.router.refresh();
      });
    });

    var focusButton = root.querySelector('[data-focus-deadline-form]');
    if (focusButton) {
      focusButton.addEventListener('click', function () {
        var input = root.querySelector('[data-autofocus-deadline]');
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    var focused = root.querySelector('.deadline-item.is-focused');
    if (focused) {
      window.setTimeout(function () {
        focused.scrollIntoView({ behavior: 'smooth', block: 'center' });
        focused.classList.add('is-focus-pulse');
      }, 120);
    }

    root.querySelectorAll('[data-deadline-id]').forEach(function (card) {
      var id = card.getAttribute('data-deadline-id');

      var toggle = card.querySelector('[data-deadline-toggle]');
      if (toggle) {
        toggle.addEventListener('click', function () {
          PP.data.toggleTodo(id);
          PP.router.refresh();
        });
      }

      var edit = card.querySelector('[data-deadline-edit]');
      if (edit) {
        edit.addEventListener('click', function () {
          var item = PP.data.getTodos().filter(function (entry) { return entry.id === id; })[0];
          if (item) openEditModal(item, function () { PP.router.refresh(); });
        });
      }

      var remove = card.querySelector('[data-deadline-delete]');
      if (remove) {
        remove.addEventListener('click', function () {
          var item = PP.data.getTodos().filter(function (entry) { return entry.id === id; })[0];
          ui.confirm({
            title: '删除待办',
            message: '确定删除「<strong>' + U.escapeHTML(item ? item.text : '这件事') + '</strong>」吗？',
            confirmText: '删除'
          }).then(function (confirmed) {
            if (!confirmed) return;
            PP.data.removeTodo(id);
            ui.toast('待办已删除。', 'success');
            PP.router.refresh();
          });
        });
      }
    });
  }

  PP.pages.todos = { render: render, mount: mount };
}());
