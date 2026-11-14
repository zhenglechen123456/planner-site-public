/* ==========================================================================
   写作：灵感 / 片段卡片，可多次编辑，显示最近保存时间
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  function countWords(text) {
    return String(text || '').replace(/\s/g, '').length;
  }

  function render() {
    var items = PP.data.getWritings();
    var attachmentCount = items.reduce(function (total, item) {
      return total + (Array.isArray(item.attachments) ? item.attachments.length : 0);
    }, 0);

    return '<div class="page-shell library-page writing-page">' +
      '<header class="page-head">' +
        '<div class="page-head-copy">' +
          '<span class="eyebrow">WRITING DESK</span>' +
          '<h1>写作</h1>' +
          '<p class="lede">把灵感和片段先放在卡片里。它们不必完整，也不用立刻成为一篇文章；每一次保存，都会留下时间。</p>' +
          '<div class="library-meta">' +
            '<span>' + ui.icon('writing', 13) + items.length + ' 张卡片</span>' +
            '<span>' + ui.icon('clock', 13) + '自动记录最近保存时间</span>' +
            '<span>' + ui.icon('paperclip', 13) + attachmentCount + ' 个附件</span>' +
          '</div>' +
        '</div>' +
        '<div class="page-head-actions">' +
          '<button class="btn btn-primary" type="button" data-add-writing>' + ui.icon('plus', 16) + '新建卡片</button>' +
        '</div>' +
      '</header>' +

      (items.length
        ? '<div class="library-grid writing-grid">' + items.map(function (item, index) { return renderCard(item, index); }).join('') + '</div>'
        : ui.emptyState('✍️', '还没有写作卡片', '有时候只是一句话、一个画面，也值得先把它留住。',
            '<button class="btn btn-primary" type="button" data-add-writing>' + ui.icon('plus', 15) + '写第一段</button>')) +
    '</div>';
  }

  function renderCard(item, index) {
    return '<article class="panel library-card writing-card" data-writing-card data-writing-id="' + U.escapeAttr(item.id) + '">' +
      '<div class="writing-card-head">' +
        '<span class="library-index">FRAGMENT ' + U.pad2(index + 1) + '</span>' +
        '<div class="writing-head-actions">' +
          '<span class="save-state" data-writing-status>已保存 ' + D.formatSaved(item.updatedAt) + '</span>' +
          '<button class="icon-btn is-small is-danger" type="button" data-writing-delete aria-label="删除写作卡片" title="删除这张卡片">' + ui.icon('trash', 14) + '</button>' +
        '</div>' +
      '</div>' +
      '<label class="sr-only" for="writing-title-' + U.escapeAttr(item.id) + '">片段标题</label>' +
      '<input class="writing-title-input" id="writing-title-' + U.escapeAttr(item.id) + '" type="text" data-writing-field="title" maxlength="100" value="' + U.escapeAttr(item.title) + '" placeholder="给这段文字一个名字">' +
      '<label class="sr-only" for="writing-content-' + U.escapeAttr(item.id) + '">写作内容</label>' +
      '<textarea class="writing-content" id="writing-content-' + U.escapeAttr(item.id) + '" data-writing-field="content" rows="7" maxlength="20000" placeholder="从这里开始写……">' + U.escapeHTML(item.content) + '</textarea>' +
      PP.attachments.html(item.attachments) +
      '<div class="writing-card-foot">' +
        '<span class="writing-time">' + ui.icon('clock', 12) + '最近一次保存：<time data-writing-time>' + D.formatSaved(item.updatedAt) + '</time></span>' +
        '<span class="writing-wordcount" data-writing-count>' + countWords(item.content) + ' 字</span>' +
      '</div>' +
    '</article>';
  }

  function openAddModal() {
    var formId = 'addWriting-' + Date.now();
    ui.modal({
      title: '新建写作卡片',
      subtitle: '先留下一个开头，之后随时回来继续。',
      body: '<form id="' + formId + '">' +
        '<div class="field">' +
          '<label class="field-label" for="new-writing-title">标题 <span class="optional">可选</span></label>' +
          '<input id="new-writing-title" type="text" name="title" maxlength="100" placeholder="例如：雨停之后" data-autofocus>' +
        '</div>' +
        '<div class="field" style="margin-top:16px">' +
          '<label class="field-label" for="new-writing-content">第一段 <span class="optional">可选</span></label>' +
          '<textarea id="new-writing-content" name="content" rows="6" maxlength="20000" placeholder="写下一句话、一个画面或一个念头……"></textarea>' +
        '</div>' +
      '</form>',
      footer: '<button class="btn" type="button" data-modal-close>取消</button>' +
        '<button class="btn btn-primary" type="submit" form="' + formId + '">' + ui.icon('plus', 15) + '创建卡片</button>',
      onMount: function (body, close) {
        var form = body.querySelector('form');
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var data = new FormData(form);
          var title = String(data.get('title') || '').trim();
          var content = String(data.get('content') || '');
          if (!title && !content.trim()) {
            ui.toast('先写一个标题或一句话吧。', 'warning');
            return;
          }
          PP.data.addWriting({
            title: title || '未命名片段',
            content: content,
            attachments: []
          });
          close();
          ui.toast('写作卡片已创建。', 'success');
          PP.router.refresh();
        });
      }
    });
  }

  function mount(root) {
    root.querySelectorAll('[data-add-writing]').forEach(function (button) {
      button.addEventListener('click', openAddModal);
    });

    root.querySelectorAll('[data-writing-card]').forEach(function (card) {
      var id = card.getAttribute('data-writing-id');
      var timeEl = card.querySelector('[data-writing-time]');
      var statusEl = card.querySelector('[data-writing-status]');
      var countEl = card.querySelector('[data-writing-count]');
      var contentField = card.querySelector('[data-writing-field="content"]');

      function resizeContent() {
        if (!contentField) return;
        contentField.style.height = 'auto';
        contentField.style.height = Math.max(170, Math.min(contentField.scrollHeight + 4, 620)) + 'px';
      }

      function afterSave(updated) {
        if (!updated) return;
        if (timeEl) timeEl.textContent = D.formatSaved(updated.updatedAt);
        if (statusEl) {
          statusEl.classList.remove('is-saving');
          statusEl.classList.add('is-saved');
          statusEl.textContent = '已保存 ' + D.nowTime();
        }
        if (countEl) countEl.textContent = countWords(updated.content) + ' 字';
      }

      card.querySelectorAll('[data-writing-field]').forEach(function (field) {
        ui.bindAutoSave(field, function (value) {
          var patch = {};
          patch[field.getAttribute('data-writing-field')] = value;
          var updated = PP.data.updateWriting(id, patch);
          afterSave(updated);
          return true;
        }, statusEl, { delay: 500 });
      });

      if (contentField) {
        contentField.addEventListener('input', resizeContent);
        resizeContent();
      }

      PP.attachments.mount(card, {
        ownerType: 'writing',
        ownerId: id,
        getAttachments: function () {
          var current = PP.data.getWritings().filter(function (entry) { return entry.id === id; })[0];
          return current ? current.attachments : [];
        },
        setAttachments: function (list) {
          var updated = PP.data.updateWriting(id, { attachments: list });
          afterSave(updated);
        },
        onChange: function () {
          var updated = PP.data.getWritings().filter(function (entry) { return entry.id === id; })[0];
          if (updated) afterSave(updated);
        }
      });

      var deleteButton = card.querySelector('[data-writing-delete]');
      if (deleteButton) {
        deleteButton.addEventListener('click', function () {
          var latest = PP.data.getWritings().filter(function (entry) { return entry.id === id; })[0];
          ui.confirm({
            title: '删除写作卡片',
            message: '确定删除「<strong>' + U.escapeHTML(latest ? latest.title : '这张卡片') + '</strong>」吗？<br><br>文字和附件都会一并删除，无法恢复。',
            confirmText: '删除卡片'
          }).then(function (confirmed) {
            if (!confirmed) return;
            var attachments = latest && Array.isArray(latest.attachments) ? latest.attachments.slice() : [];
            Promise.all(attachments.map(function (meta) { return PP.attachments.remove(meta); })).catch(function (error) {
              console.warn('[拾光] 清理写作附件失败：', error);
            }).finally(function () {
              PP.data.removeWriting(id);
              ui.toast('写作卡片已删除。', 'success');
              PP.router.refresh();
            });
          });
        });
      }
    });
  }

  PP.pages.writing = { render: render, mount: mount };
}());
