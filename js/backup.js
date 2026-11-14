/* ==========================================================================
   JSON 备份：全量（含附件 base64）/ 仅结构化数据 / 导入恢复
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;
  var D = PP.Dates;
  var FORMAT = 'shiguang-planner-backup';
  var VERSION = 1;
  var DATA_KEYS = ['meta', 'settings', 'days', 'habits', 'habitLogs', 'important', 'books', 'todos', 'tasks', 'writings', 'monthSummaries'];

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function collectAttachmentMetas(data) {
    var metas = [];
    (Array.isArray(data.books) ? data.books : []).forEach(function (book) {
      (book.attachments || []).forEach(function (meta) { metas.push(meta); });
    });
    (Array.isArray(data.writings) ? data.writings : []).forEach(function (item) {
      (item.attachments || []).forEach(function (meta) { metas.push(meta); });
    });
    // 长期任务：任务资料附件 + 每一期的资料附件
    (Array.isArray(data.tasks) ? data.tasks : []).forEach(function (task) {
      (task.attachments || []).forEach(function (meta) { metas.push(meta); });
      (task.periods || []).forEach(function (period) {
        (period.attachments || []).forEach(function (meta) { metas.push(meta); });
      });
    });
    return metas;
  }

  function stripAttachments(data) {
    if (Array.isArray(data.books)) {
      data.books = data.books.map(function (book) {
        book.attachments = [];
        return book;
      });
    }
    if (Array.isArray(data.writings)) {
      data.writings = data.writings.map(function (item) {
        item.attachments = [];
        return item;
      });
    }
    if (Array.isArray(data.tasks)) {
      data.tasks = data.tasks.map(function (task) {
        task.attachments = [];
        task.periods = (task.periods || []).map(function (period) {
          period.attachments = [];
          return period;
        });
        return task;
      });
    }
    return data;
  }

  async function create(includeAttachments) {
    var data = {};
    DATA_KEYS.forEach(function (key) {
      data[key] = clone(PP.store.read(key, key === 'meta' ? {} : key === 'settings' ? {} : key === 'days' || key === 'habitLogs' || key === 'important' || key === 'monthSummaries' ? {} : []));
    });

    var attachmentRecords = [];
    if (includeAttachments) {
      attachmentRecords = await PP.attachments.exportForMetas(collectAttachmentMetas(data));
    } else {
      stripAttachments(data);
    }

    return {
      format: FORMAT,
      version: VERSION,
      app: '拾光日程',
      appVersion: PP.VERSION,
      exportedAt: D.nowISO(),
      includesAttachments: !!includeAttachments,
      timezone: 'local',
      data: data,
      attachments: attachmentRecords,
      note: includeAttachments
        ? '完整备份，包含附件 base64。恢复时会覆盖当前浏览器中的全部内容。'
        : '仅结构化数据，不含附件文件，书籍/写作/长期任务的附件元数据已被清空。'
    };
  }

  function sizeText(backup) {
    var bytes = new Blob([JSON.stringify(backup)]).size;
    return U.fileSize(bytes);
  }

  function jsonText(backup) {
    return JSON.stringify(backup, null, 2);
  }

  function fileName(includeAttachments) {
    var now = new Date();
    return '拾光日程-' + (includeAttachments ? '完整备份-' : '结构化备份-') +
      now.getFullYear() + U.pad2(now.getMonth() + 1) + U.pad2(now.getDate()) + '-' +
      U.pad2(now.getHours()) + U.pad2(now.getMinutes()) + '.json';
  }

  function download(backup, includeAttachments) {
    var blob = new Blob([jsonText(backup)], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName(includeAttachments);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  async function exportBackup(includeAttachments) {
    if (includeAttachments) PP.ui.toast('正在整理全部数据与附件，请稍候…', 'info');
    var backup;
    try {
      backup = await create(includeAttachments);
    } catch (error) {
      console.error('[拾光] 创建备份失败：', error);
      PP.ui.toast('备份创建失败：' + (error && error.message ? error.message : '未知错误'), 'error');
      return false;
    }
    var size = sizeText(backup);
    var attachmentCount = backup.attachments ? backup.attachments.length : 0;
    var confirmed = await PP.ui.confirm({
      title: includeAttachments ? '导出完整备份' : '导出结构化数据',
      message: (includeAttachments
        ? '将导出全部结构化数据与 <strong>' + attachmentCount + '</strong> 个附件（附件以 base64 写入 JSON）。'
        : '将导出全部结构化数据，<strong>不包含附件文件</strong>，书籍/写作/长期任务中的附件引用会被清空。') +
        '<br><br>预计文件大小：<strong>' + size + '</strong>。文件会直接下载到浏览器默认下载目录。',
      confirmText: '开始下载',
      cancelText: '取消',
      danger: false
    });
    if (!confirmed) return false;
    download(backup, includeAttachments);
    PP.ui.toast('备份文件已开始下载（约 ' + size + '）。', 'success');
    return true;
  }

  function validateBackup(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('不是有效的 JSON 对象');
    if (raw.format !== FORMAT) throw new Error('不是拾光日程的备份文件（format 不匹配）');
    if (!raw.version || Number(raw.version) > VERSION) throw new Error('备份版本过新，请升级应用后再导入');
    if (!raw.data || typeof raw.data !== 'object') throw new Error('备份缺少 data 字段');
    if (raw.attachments && !Array.isArray(raw.attachments)) throw new Error('附件列表格式不正确');
    return raw;
  }

  async function importBackup(file) {
    if (!file) return;
    if (file.size > 250 * 1024 * 1024) {
      PP.ui.toast('备份文件超过 250MB，浏览器可能无法处理。', 'error');
      return;
    }
    var text;
    try {
      text = await file.text();
    } catch (error) {
      PP.ui.toast('读取备份文件失败。', 'error');
      return;
    }
    var backup;
    try {
      backup = validateBackup(JSON.parse(text));
    } catch (error) {
      console.error('[拾光] 备份校验失败：', error);
      PP.ui.toast('导入失败：' + (error && error.message ? error.message : '文件格式不正确'), 'error');
      return;
    }

    var counts = {
      days: Object.keys(backup.data.days || {}).length,
      books: (backup.data.books || []).length,
      todos: (backup.data.todos || []).length,
      writings: (backup.data.writings || []).length,
      habits: (backup.data.habits || []).length,
      attachments: (backup.attachments || []).length
    };

    var first = await PP.ui.confirm({
      title: '导入备份',
      message: '备份导出时间：<strong>' + U.escapeHTML(D.formatSaved(backup.exportedAt)) + '</strong><br>' +
        '包含：' + counts.days + ' 个日期、' + counts.books + ' 本书、' + counts.todos + ' 项待办、' +
        counts.writings + ' 张写作卡、' + counts.habits + ' 个习惯、' + counts.attachments + ' 个附件。<br><br>' +
        '<strong style="color:var(--danger)">导入会覆盖当前浏览器中的全部数据与附件，无法自动恢复。</strong>',
      confirmText: '继续',
      cancelText: '取消'
    });
    if (!first) return;

    var second = await PP.ui.confirm({
      title: '再次确认覆盖',
      message: '这是最后一次确认。当前数据将被清空，并替换为备份内容。<br><br>如果还没有导出当前数据，建议先取消并做一次备份。',
      confirmText: '确认覆盖并导入',
      cancelText: '返回'
    });
    if (!second) return;

    try {
      PP.ui.toast('正在恢复数据，请勿关闭页面…', 'info', 6000);
      PP.store.clearAll();
      await PP.attachments.clearAll();

      var failed = false;
      DATA_KEYS.forEach(function (key) {
        if (backup.data[key] == null) return;
        if (!PP.store.write(key, backup.data[key])) failed = true;
      });
      if (failed) {
        PP.ui.toast('有一部分数据因本地存储空间不足而未能写入，请清理空间后重试。', 'error', 8000);
        return;
      }
      var restored = await PP.attachments.importRecords(backup.attachments || []);
      PP.ui.toast('导入完成：已恢复 ' + restored + ' 个附件。即将刷新页面。', 'success', 2500);
      window.setTimeout(function () { window.location.reload(); }, 900);
    } catch (error) {
      console.error('[拾光] 导入失败：', error);
      PP.ui.toast('导入过程中出现错误，请刷新页面检查数据。', 'error', 8000);
    }
  }

  PP.backup = {
    format: FORMAT,
    version: VERSION,
    keys: DATA_KEYS,
    create: create,
    exportBackup: exportBackup,
    importBackup: importBackup,
    validate: validateBackup,
    sizeText: sizeText
  };
}());
