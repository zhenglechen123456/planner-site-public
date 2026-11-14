/* ==========================================================================
   附件：图片 / PDF / Word
   - 文件本体以 base64 DataURL 存入 IndexedDB
   - IndexedDB 不可用时退回 localStorage（单文件限制更严格）
   - localStorage 只保存轻量元数据
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  var DB_NAME = 'shiguang-planner';
  var DB_VERSION = 1;
  var STORE_NAME = 'attachments';
  var MAX_FILE_SIZE = 8 * 1024 * 1024;
  var LOCAL_FALLBACK_LIMIT = 2.2 * 1024 * 1024;
  var ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,image/png,image/jpeg,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  var WORD_EXT = ['doc', 'docx'];

  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB 不可用'));
        return;
      }
      var request;
      try {
        request = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = function () {
        var db = request.result;
        db.onversionchange = function () { db.close(); };
        resolve(db);
      };
      request.onerror = function () {
        reject(request.error || new Error('无法打开 IndexedDB'));
      };
      request.onblocked = function () {
        reject(new Error('IndexedDB 被其他页面占用'));
      };
    });
    return dbPromise;
  }

  function idbPut(record) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = function () { resolve(record); };
        tx.onerror = function () { reject(tx.error || new Error('写入 IndexedDB 失败')); };
        tx.onabort = function () { reject(tx.error || new Error('写入 IndexedDB 被中止')); };
      });
    });
  }

  function idbGet(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error || new Error('读取 IndexedDB 失败')); };
      });
    });
  }

  function idbDelete(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error('删除 IndexedDB 数据失败')); };
      });
    });
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('读取文件失败')); };
      reader.readAsDataURL(file);
    });
  }

  function extensionOf(name) {
    var parts = String(name || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function kindOf(name, mime) {
    var ext = extensionOf(name);
    if (IMAGE_EXT.indexOf(ext) >= 0 || /^image\//.test(mime || '')) return 'image';
    if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
    if (WORD_EXT.indexOf(ext) >= 0) return 'word';
    return 'other';
  }

  function kindEmoji(kind) {
    if (kind === 'image') return '🖼️';
    if (kind === 'pdf') return '📕';
    if (kind === 'word') return '📄';
    return '📎';
  }

  function validateFile(file) {
    if (!file) return '没有选择文件';
    if (!file.size) return '文件内容为空';
    if (file.size > MAX_FILE_SIZE) return '「' + file.name + '」超过 8MB，请压缩后再上传';
    var ext = extensionOf(file.name);
    var mime = file.type || '';
    if (IMAGE_EXT.indexOf(ext) >= 0 || /^image\//.test(mime)) return '';
    if (ext === 'pdf' || mime === 'application/pdf') return '';
    if (WORD_EXT.indexOf(ext) >= 0 || mime === 'application/msword' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '';
    return '「' + file.name + '」格式不支持，请上传图片、PDF 或 Word 文档';
  }

  async function saveRecord(record) {
    try {
      await idbPut(record);
      return 'idb';
    } catch (error) {
      console.warn('[拾光] IndexedDB 不可用，尝试 localStorage 回退：', error);
      if (record.dataUrl.length > LOCAL_FALLBACK_LIMIT) {
        throw new Error('浏览器无法使用 IndexedDB，且该附件超过 2MB，无法安全保存到 localStorage。请更换浏览器，或上传更小的文件。');
      }
      var ok = PP.store.write('attachment.' + record.id, record);
      if (!ok) {
        throw new Error('本地存储空间不足，附件未能保存。');
      }
      return 'local';
    }
  }

  async function loadRecord(meta) {
    if (!meta || !meta.id) return null;
    if (meta.storage === 'local') {
      var local = PP.store.read('attachment.' + meta.id, null);
      if (local) return local;
    }
    try {
      var byIdb = await idbGet(meta.id);
      if (byIdb) return byIdb;
    } catch (error) {
      console.warn('[拾光] 从 IndexedDB 读取附件失败：', error);
    }
    return PP.store.read('attachment.' + meta.id, null);
  }

  async function deleteRecord(meta) {
    if (!meta || !meta.id) return;
    try {
      await idbDelete(meta.id);
    } catch (error) {
      console.warn('[拾光] 删除 IndexedDB 附件失败：', error);
    }
    PP.store.remove('attachment.' + meta.id);
  }

  function dataUrlToBytes(dataUrl) {
    var comma = dataUrl.indexOf(',');
    if (comma < 0) throw new Error('附件格式无效');
    var binary = window.atob(dataUrl.slice(comma + 1));
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function dataUrlToBlob(dataUrl, fallbackType) {
    var match = /^data:([^;,]+)/.exec(dataUrl);
    var mime = match ? match[1] : (fallbackType || 'application/octet-stream');
    return new Blob([dataUrlToBytes(dataUrl)], { type: mime });
  }

  function downloadRecord(record) {
    if (!record || !record.dataUrl) {
      ui.toast('附件数据已丢失，无法下载。', 'error');
      return;
    }
    var link = document.createElement('a');
    link.href = record.dataUrl;
    link.download = record.name || '附件';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /* -------------------------- DOCX 纯文本预览 -------------------------- */

  function readU16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readU32(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function findZipEntry(bytes, targetName) {
    var eocd = -1;
    var min = Math.max(0, bytes.length - 65557);
    for (var cursor = bytes.length - 22; cursor >= min; cursor -= 1) {
      if (readU32(bytes, cursor) === 0x06054b50) {
        eocd = cursor;
        break;
      }
    }
    if (eocd < 0) throw new Error('不是有效的 DOCX 压缩包');

    var count = readU16(bytes, eocd + 10);
    var offset = readU32(bytes, eocd + 16);
    for (var index = 0; index < count; index += 1) {
      if (offset + 46 > bytes.length) break;
      if (readU32(bytes, offset) !== 0x02014b50) break;
      var method = readU16(bytes, offset + 10);
      var compressedSize = readU32(bytes, offset + 20);
      var nameLength = readU16(bytes, offset + 28);
      var extraLength = readU16(bytes, offset + 30);
      var commentLength = readU16(bytes, offset + 32);
      var localOffset = readU32(bytes, offset + 42);
      var nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
      var name = new TextDecoder('utf-8').decode(nameBytes);
      if (name === targetName || name.endsWith('/' + targetName)) {
        if (readU32(bytes, localOffset) !== 0x04034b50) throw new Error('DOCX 压缩包结构异常');
        var localNameLength = readU16(bytes, localOffset + 26);
        var localExtraLength = readU16(bytes, localOffset + 28);
        var dataStart = localOffset + 30 + localNameLength + localExtraLength;
        return {
          method: method,
          data: bytes.slice(dataStart, dataStart + compressedSize)
        };
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error('DOCX 中没有找到正文');
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('当前浏览器不支持 DOCX 在线预览');
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    var buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  function decodeXmlEntities(text) {
    return text
      .replace(/&#x([0-9a-f]+);/gi, function (match, code) {
        try { return String.fromCodePoint(parseInt(code, 16)); } catch (error) { return match; }
      })
      .replace(/&#(\d+);/g, function (match, code) {
        try { return String.fromCodePoint(parseInt(code, 10)); } catch (error) { return match; }
      })
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  async function extractDocxText(dataUrl) {
    var bytes = dataUrlToBytes(dataUrl);
    var entry = findZipEntry(bytes, 'word/document.xml');
    var xmlBytes = entry.method === 0 ? entry.data : await inflateRaw(entry.data);
    var xml = new TextDecoder('utf-8').decode(xmlBytes);
    var text = xml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '');
    text = decodeXmlEntities(text)
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text) throw new Error('没有读取到文字内容（可能是扫描件或特殊排版）');
    return text.length > 180000 ? text.slice(0, 180000) + '\n\n…（内容较长，预览已截断）' : text;
  }

  /* ------------------------------- 预览 ------------------------------- */

  function previewFooter(showNewWindow) {
    return '<button class="btn" type="button" data-modal-close>关闭</button>' +
      (showNewWindow ? '<button class="btn" type="button" data-preview-newwindow>' + ui.icon('arrowUpRight', 15) + '新窗口打开</button>' : '') +
      '<button class="btn btn-primary" type="button" data-preview-download>' + ui.icon('download', 15) + '下载原文件</button>';
  }

  async function openPreview(meta, contextList) {
    if (!meta) return;
    var record = await loadRecord(meta);
    if (!record || !record.dataUrl) {
      ui.toast('没有找到附件文件，可能已被浏览器清理。', 'error');
      return;
    }
    var kind = kindOf(meta.name, meta.type);
    var objectUrl = '';
    var apiCleanup = null;

    function bindActions(api, getRecord) {
      var downloadButton = api.card.querySelector('[data-preview-download]');
      if (downloadButton) {
        downloadButton.addEventListener('click', function () { downloadRecord(getRecord()); });
      }
      var newWindowButton = api.card.querySelector('[data-preview-newwindow]');
      if (newWindowButton) {
        newWindowButton.addEventListener('click', function () {
          var current = getRecord();
          if (!current || !current.dataUrl) return;
          try {
            var url = URL.createObjectURL(dataUrlToBlob(current.dataUrl, current.type));
            window.open(url, '_blank', 'noopener');
            window.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
          } catch (error) {
            console.warn('[拾光] 新窗口打开附件失败：', error);
            ui.toast('新窗口打开失败，请使用下载。', 'error');
          }
        });
      }
    }

    if (kind === 'image') {
      var images = (Array.isArray(contextList) ? contextList : [meta]).filter(function (item) {
        return item && kindOf(item.name, item.type) === 'image';
      });
      if (!images.length) images = [meta];
      var imageIndex = images.map(function (item) { return item.id; }).indexOf(meta.id);
      if (imageIndex < 0) {
        images.push(meta);
        imageIndex = images.length - 1;
      }
      var currentRecord = record;
      var counter = '<span class="lightbox-counter" data-lightbox-counter>' + (imageIndex + 1) + ' / ' + images.length + '</span>';
      var nav = images.length > 1
        ? '<button class="lightbox-nav is-prev" type="button" data-lightbox-prev aria-label="上一张图片">' + ui.icon('chevronLeft', 22) + '</button>' +
          '<button class="lightbox-nav is-next" type="button" data-lightbox-next aria-label="下一张图片">' + ui.icon('chevronRight', 22) + '</button>'
        : '';
      var imageApi = ui.modal({
        title: meta.name,
        subtitle: '图片附件 · ' + U.fileSize(meta.size) + ' · 支持左右翻页',
        wide: true,
        bodyClass: 'preview-body',
        body: '<div class="lightbox-shell">' +
          '<img data-lightbox-image src="' + U.escapeAttr(record.dataUrl) + '" alt="' + U.escapeAttr(meta.name) + '">' +
          nav + counter +
        '</div>',
        footer: previewFooter(false),
        onMount: function (body, close, card) {
          bindActions({ card: card }, function () { return currentRecord; });
          var imageEl = body.querySelector('[data-lightbox-image]');
          var counterEl = body.querySelector('[data-lightbox-counter]');
          var titleEl = card.querySelector('.modal-head h2');

          async function show(index) {
            imageIndex = (index + images.length) % images.length;
            try {
              var nextRecord = await loadRecord(images[imageIndex]);
              if (!nextRecord || !nextRecord.dataUrl) throw new Error('missing');
              currentRecord = nextRecord;
              imageEl.src = nextRecord.dataUrl;
              imageEl.alt = images[imageIndex].name;
              if (titleEl) titleEl.textContent = images[imageIndex].name;
              if (counterEl) counterEl.textContent = (imageIndex + 1) + ' / ' + images.length;
            } catch (error) {
              ui.toast('这张图片的数据已丢失。', 'error');
            }
          }

          var prev = body.querySelector('[data-lightbox-prev]');
          var next = body.querySelector('[data-lightbox-next]');
          if (prev) prev.addEventListener('click', function () { show(imageIndex - 1); });
          if (next) next.addEventListener('click', function () { show(imageIndex + 1); });

          function onKey(event) {
            if (event.key === 'ArrowLeft') show(imageIndex - 1);
            if (event.key === 'ArrowRight') show(imageIndex + 1);
          }
          document.addEventListener('keydown', onKey);
          apiCleanup = function () { document.removeEventListener('keydown', onKey); };
        },
        onClose: function () {
          if (apiCleanup) apiCleanup();
          apiCleanup = null;
        }
      });
      return imageApi;
    }

    if (kind === 'pdf') {
      try {
        objectUrl = URL.createObjectURL(dataUrlToBlob(record.dataUrl, 'application/pdf'));
      } catch (error) {
        ui.toast('PDF 预览失败，请直接下载。', 'error');
      }
      var pdfApi = ui.modal({
        title: meta.name,
        subtitle: 'PDF 附件 · ' + U.fileSize(meta.size),
        wide: true,
        bodyClass: 'preview-body',
        body: objectUrl
          ? '<iframe src="' + U.escapeAttr(objectUrl) + '" title="' + U.escapeAttr(meta.name) + '"></iframe>'
          : '<div class="preview-note"><span class="preview-big">📕</span><p>当前浏览器未能内嵌 PDF，请下载或在新窗口打开。</p></div>',
        footer: previewFooter(true),
        onMount: function (body, close, card) { bindActions({ card: card }, function () { return record; }); },
        onClose: function () {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
      });
      return pdfApi;
    }

    if (kind === 'word') {
      if (extensionOf(meta.name) === 'doc') {
        return ui.modal({
          title: meta.name,
          subtitle: 'Word 附件 · ' + U.fileSize(meta.size),
          wide: true,
          body: '<div class="preview-note"><span class="preview-big">📄</span>' +
            '<p>旧版 .doc 是二进制格式，浏览器无法直接排版预览。可下载后用 Word / WPS 打开；新版 .docx 支持在此预览文字。</p></div>',
          footer: previewFooter(false),
          onMount: function (body, close, card) { bindActions({ card: card }, function () { return record; }); }
        });
      }
      var wordApi = ui.modal({
        title: meta.name,
        subtitle: 'Word 附件 · ' + U.fileSize(meta.size),
        wide: true,
        body: '<div class="preview-note"><span class="spinner"></span><p>正在读取 Word 正文…</p></div>',
        footer: previewFooter(false),
        onMount: function (body, close, card) { bindActions({ card: card }, function () { return record; }); }
      });
      extractDocxText(record.dataUrl).then(function (text) {
        wordApi.body.innerHTML = '<pre class="preview-text">' + U.escapeHTML(text) + '</pre>';
      }).catch(function (error) {
        console.warn('[拾光] Word 预览失败：', error);
        wordApi.body.innerHTML = '<div class="preview-note"><span class="preview-big">📄</span>' +
          '<p>' + U.escapeHTML(error && error.message ? error.message : '无法预览这份 Word 文档') +
          '<br>你仍然可以在下方下载原文件。</p></div>';
      });
      return wordApi;
    }

    return ui.modal({
      title: meta.name,
      subtitle: '附件 · ' + U.fileSize(meta.size),
      body: '<div class="preview-note"><span class="preview-big">📎</span><p>暂不支持预览这种格式，请下载后查看。</p></div>',
      footer: previewFooter(false),
      onMount: function (body, close, card) { bindActions({ card: card }, function () { return record; }); }
    });
  }

  /* ------------------------------- 列表 ------------------------------- */

  function itemHTML(meta) {
    var kind = kindOf(meta.name, meta.type);
    return '<div class="attach-item" data-attach-id="' + U.escapeAttr(meta.id) + '">' +
      '<span class="attach-kind" aria-hidden="true">' + kindEmoji(kind) + '</span>' +
      '<span class="attach-name" title="' + U.escapeAttr(meta.name) + '">' + U.escapeHTML(meta.name) + '</span>' +
      '<span class="attach-size">' + U.fileSize(meta.size) + '</span>' +
      '<span class="attach-actions">' +
        '<button class="icon-btn" type="button" data-attach-action="preview" title="预览" aria-label="预览 ' + U.escapeAttr(meta.name) + '">' + ui.icon('eye', 12) + '</button>' +
        '<button class="icon-btn" type="button" data-attach-action="download" title="下载" aria-label="下载 ' + U.escapeAttr(meta.name) + '">' + ui.icon('download', 12) + '</button>' +
        '<button class="icon-btn is-danger" type="button" data-attach-action="delete" title="删除" aria-label="删除 ' + U.escapeAttr(meta.name) + '">' + ui.icon('trash', 12) + '</button>' +
      '</span>' +
    '</div>';
  }

  function attachmentHTML(attachments) {
    var list = Array.isArray(attachments) ? attachments : [];
    return '<div class="attachment-block" data-attachments>' +
      '<div class="attachment-head">' +
        '<span class="attachment-label">' + ui.icon('paperclip', 13) + '附件 <span data-attach-count>' + list.length + '</span></span>' +
        '<label class="btn btn-xs btn-ghost attachment-upload">' +
          '<span class="upload-label">' + ui.icon('upload', 13) + '上传附件</span>' +
          '<input type="file" multiple accept="' + ACCEPT + '" aria-label="上传图片、PDF 或 Word 附件">' +
        '</label>' +
      '</div>' +
      '<div class="attachment-list">' + list.map(itemHTML).join('') + '</div>' +
    '</div>';
  }

  async function uploadFiles(files, options, block) {
    var list = files.slice();
    if (!list.length) return;
    var input = block.querySelector('input[type="file"]');
    var label = block.querySelector('.upload-label');
    var originalLabel = label ? label.innerHTML : '';
    if (input) input.disabled = true;
    if (label) label.innerHTML = '<span class="spinner"></span>上传中…';

    var added = 0;
    for (var index = 0; index < list.length; index += 1) {
      var file = list[index];
      var error = validateFile(file);
      if (error) {
        ui.toast(error, 'error');
        continue;
      }
      try {
        var dataUrl = await readAsDataURL(file);
        var id = U.uid('att');
        var record = {
          id: id,
          ownerType: options.ownerType || '',
          ownerId: options.ownerId || '',
          name: file.name || ('附件-' + (index + 1)),
          type: file.type || '',
          size: file.size,
          dataUrl: dataUrl,
          createdAt: D.nowISO()
        };
        var storage = await saveRecord(record);
        var meta = {
          id: id,
          name: record.name,
          type: record.type,
          size: record.size,
          storage: storage,
          createdAt: record.createdAt
        };
        var current = options.getAttachments() || [];
        options.setAttachments(current.concat(meta));
        added += 1;
        refresh(block, options);
        if (typeof options.onChange === 'function') options.onChange();
      } catch (uploadError) {
        console.error('[拾光] 附件保存失败：', uploadError);
        ui.toast(uploadError && uploadError.message ? uploadError.message : '附件保存失败，请重试。', 'error');
      }
    }

    if (input) {
      input.disabled = false;
      input.value = '';
    }
    if (label) label.innerHTML = originalLabel;
    if (added) ui.toast('已添加 ' + added + ' 个附件。', 'success');
  }

  function refresh(block, options) {
    if (!block || !document.contains(block)) return;
    var list = options.getAttachments() || [];
    var listEl = block.querySelector('.attachment-list');
    var countEl = block.querySelector('[data-attach-count]');
    if (listEl) listEl.innerHTML = list.map(itemHTML).join('');
    if (countEl) countEl.textContent = String(list.length);
  }

  function mount(scope, options) {
    if (!scope || !options) return;
    var block = scope.querySelector('[data-attachments]');
    if (!block) return;
    var input = block.querySelector('input[type="file"]');
    var busy = false;

    if (input) {
      input.addEventListener('change', function () {
        if (busy) return;
        busy = true;
        uploadFiles(Array.prototype.slice.call(input.files || []), options, block).finally(function () {
          busy = false;
        });
      });
    }

    block.addEventListener('click', async function (event) {
      var actionButton = event.target.closest('[data-attach-action]');
      if (!actionButton) return;
      event.preventDefault();
      var item = actionButton.closest('[data-attach-id]');
      if (!item) return;
      var id = item.getAttribute('data-attach-id');
      var list = options.getAttachments() || [];
      var meta = list.filter(function (entry) { return entry.id === id; })[0];
      if (!meta) return;
      var action = actionButton.getAttribute('data-attach-action');

      if (action === 'preview') {
        try {
          await openPreview(meta, list);
        } catch (error) {
          console.error('[拾光] 预览附件失败：', error);
          ui.toast('预览失败，请尝试下载后查看。', 'error');
        }
        return;
      }

      if (action === 'download') {
        try {
          var record = await loadRecord(meta);
          if (!record) {
            ui.toast('附件文件已丢失，无法下载。', 'error');
            return;
          }
          downloadRecord(record);
        } catch (error) {
          console.error('[拾光] 下载附件失败：', error);
          ui.toast('下载失败，请重试。', 'error');
        }
        return;
      }

      if (action === 'delete') {
        var confirmed = await ui.confirm({
          title: '删除附件',
          message: '确定删除附件「<strong>' + U.escapeHTML(meta.name) + '</strong>」吗？文件会一并移除，无法恢复。',
          confirmText: '删除附件'
        });
        if (!confirmed) return;
        options.setAttachments(list.filter(function (entry) { return entry.id !== id; }));
        await deleteRecord(meta);
        refresh(block, options);
        if (typeof options.onChange === 'function') options.onChange();
        ui.toast('附件已删除。', 'success');
      }
    });
  }

  async function clearAll() {
    try {
      var db = await openDB();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('清空 IndexedDB 失败')); };
      });
    } catch (error) {
      console.warn('[拾光] 清空 IndexedDB 附件失败：', error);
    }
    PP.store.keys().forEach(function (key) {
      if (key.indexOf('attachment.') === 0) PP.store.remove(key);
    });
  }

  async function exportForMetas(metas) {
    var seen = {};
    var records = [];
    for (var index = 0; index < (metas || []).length; index += 1) {
      var meta = metas[index];
      if (!meta || !meta.id || seen[meta.id]) continue;
      seen[meta.id] = true;
      var record = await loadRecord(meta);
      if (record && record.dataUrl) records.push(record);
    }
    return records;
  }

  async function importRecords(records) {
    var count = 0;
    for (var index = 0; index < (records || []).length; index += 1) {
      var record = records[index];
      if (!record || !record.id || !record.dataUrl) continue;
      try {
        await saveRecord(record);
        count += 1;
      } catch (error) {
        console.error('[拾光] 恢复附件失败：', record.name, error);
      }
    }
    return count;
  }

  PP.attachments = {
    html: attachmentHTML,
    mount: mount,
    openPreview: openPreview,
    maxSize: MAX_FILE_SIZE,
    accept: ACCEPT,
    kindOf: kindOf,
    kindEmoji: kindEmoji,
    itemHTML: itemHTML,
    remove: deleteRecord,
    exportForMetas: exportForMetas,
    importRecords: importRecords,
    clearAll: clearAll,
    _loadRecord: loadRecord
  };
}());
