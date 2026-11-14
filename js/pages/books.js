/* ==========================================================================
   读书笔记：每本书一张卡片，四个可编辑板块 + 附件
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  PP.pages = PP.pages || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  function render() {
    var books = PP.data.getBooks();
    var attachmentCount = books.reduce(function (total, book) {
      return total + (Array.isArray(book.attachments) ? book.attachments.length : 0);
    }, 0);

    var cards = books.map(function (book, index) { return renderCard(book, index); }).join('');

    return '<div class="page-shell library-page books-page">' +
      '<header class="page-head">' +
        '<div class="page-head-copy">' +
          '<span class="eyebrow">READING NOTES</span>' +
          '<h1>读书笔记</h1>' +
          '<p class="lede">一本书一张卡片。记下阅读时间、作者、摘抄与想法，也把封面、PDF 或 Word 笔记收进同一个地方。</p>' +
          '<div class="library-meta">' +
            '<span>' + ui.icon('book', 13) + books.length + ' 本书</span>' +
            '<span>' + ui.icon('paperclip', 13) + attachmentCount + ' 个附件</span>' +
            '<span>' + ui.icon('sparkles', 13) + '四个板块均可直接编辑</span>' +
          '</div>' +
        '</div>' +
        '<div class="page-head-actions">' +
          '<button class="btn btn-primary" type="button" data-add-book>' + ui.icon('plus', 16) + '新增书籍</button>' +
        '</div>' +
      '</header>' +

      (books.length
        ? '<div class="library-grid">' + cards + '</div>'
        : ui.emptyState('📖', '书架还是空的', '从最近在读的一本书开始，给它在你的日程本里留一个位置。',
            '<button class="btn btn-primary" type="button" data-add-book>' + ui.icon('plus', 15) + '添加第一本书</button>')) +
    '</div>';
  }

  function readingBlockHTML(book) {
    var ym = D.today().slice(0, 7);
    var stats = PP.data.getBookReadingStats(book, ym);
    var logs = book.readingLogs.slice().sort(function (a, b) {
      return b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));
    });
    var listHTML = logs.length
      ? logs.slice(0, 10).map(function (log) {
          return '<div class="reading-log-item" data-reading-id="' + U.escapeAttr(log.id) + '">' +
            '<span class="reading-log-date">' + U.escapeHTML(log.date.slice(5).replace('-', '/')) + '</span>' +
            '<strong>' + U.formatMinutes(log.minutes) + '</strong>' +
            (log.note ? '<em>' + U.escapeHTML(log.note) + '</em>' : '<em></em>') +
            '<button class="icon-btn is-small is-danger" type="button" data-reading-delete aria-label="删除这条阅读记录" title="删除">' + ui.icon('trash', 12) + '</button>' +
          '</div>';
        }).join('') + (logs.length > 10 ? '<p class="tiny muted">还有 ' + (logs.length - 10) + ' 条更早记录未展开。</p>' : '')
      : '<p class="tiny muted reading-log-empty">还没有阅读记录。每次读完随手记一笔，月底就能看到累计时长。</p>';

    return '<section class="reading-block" data-reading-block>' +
      '<div class="reading-block-head">' +
        '<div><span class="field-label">阅读时间</span><p><strong>本月 ' + stats.monthSessions + '</strong> 次 / <strong>' + U.formatMinutes(stats.monthMinutes) + '</strong></p></div>' +
        '<span class="reading-total">累计 ' + U.formatMinutes(stats.totalMinutes) + '</span>' +
      '</div>' +
      '<form class="reading-form" data-reading-form>' +
        '<label class="field"><span class="field-label">日期</span><input type="date" name="date" value="' + D.today() + '" max="' + D.today() + '" required></label>' +
        '<label class="field"><span class="field-label">分钟</span><input type="number" name="minutes" min="1" max="1440" step="1" required placeholder="45"></label>' +
        '<label class="field reading-note-field"><span class="field-label">备注 <span class="optional">可选</span></span><input type="text" name="note" maxlength="120" placeholder="读了哪一章 / 在哪里读"></label>' +
        '<button class="btn btn-sm btn-soft" type="submit">' + ui.icon('plus', 13) + '记一条</button>' +
      '</form>' +
      '<div class="reading-log-list" data-reading-list>' + listHTML + '</div>' +
      (book.readingTime ? '<p class="tiny muted">旧版记录：' + U.escapeHTML(book.readingTime) + '（可在下方按新方式重新记录）</p>' : '') +
    '</section>';
  }

  function renderCard(book, index) {
    return '<article class="panel library-card book-card" data-book-card data-book-id="' + U.escapeAttr(book.id) + '">' +
      '<div class="library-card-top">' +
        '<span class="library-index">BOOK ' + U.pad2(index + 1) + '</span>' +
        '<button class="icon-btn is-small is-danger" type="button" data-book-delete aria-label="删除《' + U.escapeAttr(book.title) + '》" title="删除这本书">' + ui.icon('trash', 14) + '</button>' +
      '</div>' +
      '<label class="sr-only" for="book-title-' + U.escapeAttr(book.id) + '">书名</label>' +
      '<input class="library-title-input" id="book-title-' + U.escapeAttr(book.id) + '" type="text" data-book-field="title" maxlength="80" value="' + U.escapeAttr(book.title) + '" placeholder="书名">' +
      '<div class="book-meta-grid">' +
        '<label class="field"><span class="field-label">作者</span>' +
          '<input type="text" data-book-field="author" maxlength="60" value="' + U.escapeAttr(book.author) + '" placeholder="作者名"></label>' +
        '<div class="book-reading-total"><span>累计阅读</span><strong>' + U.formatMinutes(PP.data.getBookReadingStats(book).totalMinutes) + '</strong><em>' + PP.data.getBookReadingStats(book).totalSessions + ' 次记录</em></div>' +
      '</div>' +
      readingBlockHTML(book) +
      '<label class="field book-section"><span class="field-label">阅读笔记 <span class="optional">摘抄、页码、想法</span></span>' +
        '<textarea rows="5" data-book-field="notes" maxlength="8000" placeholder="这本书留下了什么？">' + U.escapeHTML(book.notes) + '</textarea>' +
      '</label>' +
      '<label class="field book-section"><span class="field-label">free talk <span class="optional">随意聊聊</span></span>' +
        '<textarea rows="3" data-book-field="freeTalk" maxlength="4000" placeholder="如果可以和作者喝一杯咖啡，你想说什么？">' + U.escapeHTML(book.freeTalk) + '</textarea>' +
      '</label>' +
      PP.attachments.html(book.attachments) +
      '<div class="library-card-foot">' +
        '<span class="save-state" data-book-save>最近保存 ' + D.formatSaved(book.updatedAt) + '</span>' +
        '<span class="library-tag">READING</span>' +
      '</div>' +
    '</article>';
  }

  function openAddModal() {
    var formId = 'addBook-' + Date.now();
    ui.modal({
      title: '新增一本书',
      subtitle: '先写基本信息，卡片创建后可以继续补充笔记和附件。',
      body: '<form id="' + formId + '">' +
        '<div class="form-grid">' +
          '<label class="field span-2"><span class="field-label">书名</span>' +
            '<input type="text" name="title" required maxlength="80" placeholder="例如：月亮与六便士" data-autofocus></label>' +
          '<label class="field span-2"><span class="field-label">作者 <span class="optional">可选</span></span>' +
            '<input type="text" name="author" maxlength="60" placeholder="作者名"></label>' +
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
          if (!title) {
            ui.toast('请先填写书名。', 'warning');
            return;
          }
          PP.data.addBook({
            title: title,
            author: String(data.get('author') || '').trim(),
            readingLogs: [],
            notes: '',
            freeTalk: ''
          });
          close();
          ui.toast('已经为这本书建好卡片。', 'success');
          PP.router.refresh();
        });
      }
    });
  }

  function mount(root) {
    root.querySelectorAll('[data-add-book]').forEach(function (button) {
      button.addEventListener('click', openAddModal);
    });

    root.querySelectorAll('[data-book-card]').forEach(function (card) {
      var id = card.getAttribute('data-book-id');
      var status = card.querySelector('[data-book-save]');
      var book = PP.data.getBooks().filter(function (entry) { return entry.id === id; })[0];
      if (!book) return;

      card.querySelectorAll('[data-book-field]').forEach(function (field) {
        ui.bindAutoSave(field, function (value) {
          var patch = {};
          patch[field.getAttribute('data-book-field')] = value;
          PP.data.updateBook(id, patch);
          return true;
        }, status, { delay: 520 });
      });

      function latestBook() {
        return PP.data.getBooks().filter(function (entry) { return entry.id === id; })[0];
      }

      function refreshReadingBlock() {
        var bookNow = latestBook();
        var oldBlock = card.querySelector('[data-reading-block]');
        if (!bookNow || !oldBlock) return;
        oldBlock.outerHTML = readingBlockHTML(bookNow);
      }

      card.addEventListener('submit', function (event) {
        var form = event.target.closest('[data-reading-form]');
        if (!form) return;
        event.preventDefault();
        var data = new FormData(form);
        var date = String(data.get('date') || '');
        var minutes = parseInt(data.get('minutes'), 10);
        if (!D.parseISO(date) || !minutes || minutes < 1) {
          ui.toast('请选择日期，并填写大于 0 的分钟数。', 'warning');
          return;
        }
        PP.data.addReadingLog(id, {
          date: date,
          minutes: minutes,
          note: String(data.get('note') || '').trim()
        });
        refreshReadingBlock();
        ui.setSaveState(status, 'saved', '已保存 ' + D.nowTime());
        ui.toast('已记录 ' + U.formatMinutes(minutes) + ' 阅读。', 'success');
      });

      card.addEventListener('click', function (event) {
        var deleteButton = event.target.closest('[data-reading-delete]');
        if (!deleteButton) return;
        var item = deleteButton.closest('[data-reading-id]');
        var logId = item ? item.getAttribute('data-reading-id') : '';
        var bookNow = latestBook();
        var log = bookNow && bookNow.readingLogs.filter(function (entry) { return entry.id === logId; })[0];
        ui.confirm({
          title: '删除阅读记录',
          message: '确定删除 ' + (log ? U.escapeHTML(D.shortDateCN(log.date) + ' · ' + U.formatMinutes(log.minutes)) : '这条记录') + ' 吗？',
          confirmText: '删除'
        }).then(function (confirmed) {
          if (!confirmed) return;
          PP.data.removeReadingLog(id, logId);
          refreshReadingBlock();
          ui.setSaveState(status, 'saved', '已保存 ' + D.nowTime());
          ui.toast('阅读记录已删除。', 'success');
        });
      });

      PP.attachments.mount(card, {
        ownerType: 'book',
        ownerId: id,
        getAttachments: function () {
          var current = PP.data.getBooks().filter(function (entry) { return entry.id === id; })[0];
          return current ? current.attachments : [];
        },
        setAttachments: function (list) {
          PP.data.updateBook(id, { attachments: list });
        },
        onChange: function () {
          ui.setSaveState(status, 'saved', '已保存 ' + D.nowTime());
        }
      });

      var deleteButton = card.querySelector('[data-book-delete]');
      if (deleteButton) {
        deleteButton.addEventListener('click', function () {
          var latest = PP.data.getBooks().filter(function (entry) { return entry.id === id; })[0];
          ui.confirm({
            title: '删除这本书',
            message: '确定删除「<strong>' + U.escapeHTML(latest ? latest.title : '这本书') + '</strong>」的卡片吗？<br><br>卡片内的笔记和附件也会一并删除，无法恢复。',
            confirmText: '删除卡片'
          }).then(function (confirmed) {
            if (!confirmed) return;
            var attachments = latest && Array.isArray(latest.attachments) ? latest.attachments.slice() : [];
            Promise.all(attachments.map(function (meta) { return PP.attachments.remove(meta); })).catch(function (error) {
              console.warn('[拾光] 清理附件失败：', error);
            }).finally(function () {
              PP.data.removeBook(id);
              ui.toast('书籍卡片已删除。', 'success');
              PP.router.refresh();
            });
          });
        });
      }
    });
  }

  PP.pages.books = { render: render, mount: mount };
}());
