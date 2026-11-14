/* ==========================================================================
   长期任务：一件事可以走很久，先给它一个位置
   列表只负责「看见」和「新建」，编辑与删除都在详情页。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;
  var td = PP.taskData;

  function quoteParts(raw) {
    var value = String(raw || '').trim();
    var index = value.lastIndexOf('——');
    if (index > 0) {
      return { text: value.slice(0, index).trim(), author: value.slice(index + 2).trim() };
    }
    return { text: value, author: '' };
  }

  function quoteHTML(raw) {
    var parts = quoteParts(raw);
    if (!parts.text) return '';
    return '<blockquote class="task-quote" data-task-quote>' +
      '<span class="task-quote-text">「' + U.escapeHTML(parts.text) + '」</span>' +
      (parts.author ? '<cite>—— ' + U.escapeHTML(parts.author) + '</cite>' : '') +
    '</blockquote>';
  }

  function dueInfo(iso) {
    var date = D.parseISO(iso);
    if (!date) return null;
    var today = D.parseISO(D.today());
    var days = Math.round((date.getTime() - today.getTime()) / 86400000);
    return {
      text: D.fullDateCN(iso),
      relative: days < 0 ? '已过期 ' + Math.abs(days) + ' 天' : days === 0 ? '就是今天' : '还剩 ' + days + ' 天',
      overdue: days < 0
    };
  }

  function dueHTML(task) {
    if (!task.due) return '';
    var info = dueInfo(task.due);
    if (!info) return '';
    return '<p class="task-card-due' + (info.overdue ? ' is-overdue' : '') + '" data-task-due>' +
      ui.icon('clock', 13) +
      '<span>截止 ' + U.escapeHTML(info.text) + ' · ' + U.escapeHTML(info.relative) + '</span>' +
    '</p>';
  }

  function periodStats(task) {
    var pending = 0;
    var done = 0;
    task.todos.forEach(function (todo) {
      if (todo.done) done += 1;
      else pending += 1;
    });
    return { periods: task.periods.length, pending: pending, done: done };
  }

  function cardHTML(task) {
    var stats = periodStats(task);
    return '<a class="task-card" href="#/tasks/' + encodeURIComponent(task.id) + '" data-task-card data-task-id="' + U.escapeAttr(task.id) + '">' +
      '<span class="task-card-kicker">LONG-TERM GOAL</span>' +
      '<h2 class="task-card-title">' + U.escapeHTML(task.title || '未命名任务') + '</h2>' +
      dueHTML(task) +
      quoteHTML(task.quote) +
      '<span class="task-card-foot">' +
        '<span>' + stats.periods + ' 期 · ' + stats.pending + ' 项待办' + (stats.done ? ' · ' + stats.done + ' 项已完成' : '') + '</span>' +
        ui.icon('arrowRight', 14) +
      '</span>' +
    '</a>';
  }

  function emptyHint() {
    return '<div class="task-bare-hint">' +
      ui.icon('sparkles', 15) +
      '<span>还没有长期任务。先写下一件需要几个月去做的事，再慢慢拆成几期。</span>' +
      '<button class="btn btn-sm btn-soft" type="button" data-add-task>' + ui.icon('plus', 13) + '新建任务</button>' +
    '</div>';
  }

  function render() {
    var tasks = td.getTasks();
    var periods = tasks.reduce(function (total, task) { return total + task.periods.length; }, 0);

    return '<div class="page-shell tasks-page task-page">' +
      '<header class="page-head">' +
        '<div class="page-head-copy">' +
          '<span class="eyebrow">LONG-TERM GOALS</span>' +
          '<h1>长期任务</h1>' +
          '<p class="lede">有些事不是一天做完的。给它们一个名字、一个方向，再拆成几期小目标，一期一期地走。</p>' +
          (tasks.length
            ? '<div class="library-meta">' +
                '<span>' + ui.icon('list', 13) + tasks.length + ' 个任务</span>' +
                '<span>' + ui.icon('todo', 13) + periods + ' 个分期</span>' +
                '<span>' + ui.icon('sparkles', 13) + '每张卡片配一句提醒自己的话</span>' +
              '</div>'
            : '') +
        '</div>' +
        '<div class="page-head-actions">' +
          '<button class="btn btn-primary" type="button" data-add-task>' + ui.icon('plus', 16) + '新建任务</button>' +
        '</div>' +
      '</header>' +
      (tasks.length ? '<div class="task-grid">' + tasks.map(cardHTML).join('') + '</div>' : emptyHint()) +
    '</div>';
  }

  function openCreateModal() {
    var formId = 'addTask-' + Date.now();
    var initialQuote = td.pickQuote();
    ui.modal({
      title: '新建长期任务',
      subtitle: '先立一个方向，之后再在详情页里拆成分期小目标。',
      body: '<form id="' + formId + '">' +
        '<div class="form-grid">' +
          '<label class="field span-2"><span class="field-label">任务名称</span>' +
            '<input type="text" name="title" required maxlength="120" placeholder="例如：把日语学到能开口交流" data-autofocus></label>' +
          '<label class="field span-2"><span class="field-label">截止时间 <span class="optional">可选</span></span>' +
            '<input type="date" name="due"></label>' +
          '<label class="field span-2"><span class="field-label">提醒自己的话 <span class="optional">可换一句</span></span>' +
            '<textarea name="quote" rows="2" maxlength="160">' + U.escapeHTML(initialQuote) + '</textarea></label>' +
        '</div>' +
      '</form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button>' +
        '<button class="btn" type="button" data-shuffle-quote>' + ui.icon('sparkles', 15) + '换一句</button>' +
        '<button class="btn btn-primary" type="submit" form="' + formId + '">' + ui.icon('plus', 15) + '创建任务</button>',
      onMount: function (body, close) {
        var form = body.querySelector('form');
        var quoteField = form.querySelector('[name="quote"]');
        var shuffle = body.querySelector('[data-shuffle-quote]');
        if (shuffle) {
          shuffle.addEventListener('click', function () {
            quoteField.value = td.pickQuote();
            quoteField.focus();
          });
        }
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var data = new FormData(form);
          var title = String(data.get('title') || '').trim();
          if (!title) {
            ui.toast('请先填写任务名称。', 'warning');
            return;
          }
          td.addTask({
            title: title,
            due: String(data.get('due') || ''),
            quote: String(data.get('quote') || '')
          });
          close();
          ui.toast('长期任务已创建。', 'success');
          PP.router.refresh();
        });
      }
    });
  }

  function mount(root) {
    root.querySelectorAll('[data-add-task]').forEach(function (button) {
      button.addEventListener('click', openCreateModal);
    });
  }

  PP.pages.tasks = { render: render, mount: mount };
}());
