/* ==========================================================================
   设置：本地存储说明 + 同步与账号 + JSON 备份 / 恢复入口
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var U = PP.Util;
  var D = PP.Dates;
  var ui = PP.ui;

  function attachmentCount() {
    var count = 0;
    PP.data.getBooks().forEach(function (book) { count += (book.attachments || []).length; });
    PP.data.getWritings().forEach(function (item) { count += (item.attachments || []).length; });
    return count;
  }

  /* --------------------------- 同步与账号区块 --------------------------- */

  function providerOptions() {
    var providers = (PP.sync && PP.sync.providers) || {};
    return Object.keys(providers).map(function (key) {
      var item = providers[key] || {};
      return '<option value="' + U.escapeAttr(key) + '">' + U.escapeHTML(item.label || key) + '</option>';
    }).join('');
  }

  function syncSection() {
    if (!PP.sync || typeof PP.sync.status !== 'function') {
      return '<section class="settings-section">' +
        '<div class="settings-section-head"><span class="settings-icon">' + ui.icon('info', 17) + '</span>' +
        '<div><h3>同步与账号</h3><p>同步模块没有加载成功，刷新页面后重试。</p></div></div>' +
      '</section>';
    }
    var info = PP.sync.status();
    var config = PP.sync.config ? PP.sync.config() : { provider: 'server', serverUrl: '', github: {} };
    var gh = config.github || {};
    var isGithub = config.provider === 'github';
    var lastSync = info.lastSyncAt ? D.formatSaved(info.lastSyncAt) : '还没有同步过';
    var versionText = typeof info.version === 'string' ? 'sha ' + String(info.version).slice(0, 7) : 'v' + info.version;
    return '<section class="settings-section">' +
      '<div class="settings-section-head">' +
        '<span class="settings-icon">' + ui.icon('arrowUpRight', 17) + '</span>' +
        '<div><h3>同步与账号</h3><p>同一个网址 + 同一个存储后端，手机和电脑的打卡、日程就会互相同步。' +
        '本地优先：所有编辑先存本机，断网也能继续用，联网后再推上去。</p></div>' +
      '</div>' +
      '<div class="settings-sync-row">' +
        '<label class="field">' +
          '<span class="field-label">存储后端</span>' +
          '<select data-settings-provider>' + providerOptions() + '</select>' +
        '</label>' +
        '<label class="field" data-settings-server-field' + (isGithub ? ' hidden' : '') + '>' +
          '<span class="field-label">服务器地址 <span class="optional">留空＝同源</span></span>' +
          '<input type="text" data-settings-server spellcheck="false" inputmode="url" ' +
            'placeholder="https://planner.example.com" value="' + U.escapeAttr(config.serverUrl || '') + '">' +
        '</label>' +
      '</div>' +
      '<div class="settings-github" data-settings-github' + (isGithub ? '' : ' hidden') + '>' +
        '<div class="settings-sync-row">' +
          '<label class="field"><span class="field-label">仓库 owner</span>' +
            '<input type="text" data-gh="owner" spellcheck="false" placeholder="your-name" value="' + U.escapeAttr(gh.owner || '') + '"></label>' +
          '<label class="field"><span class="field-label">仓库 repo</span>' +
            '<input type="text" data-gh="repo" spellcheck="false" placeholder="planner-data" value="' + U.escapeAttr(gh.repo || '') + '"></label>' +
        '</div>' +
        '<div class="settings-sync-row">' +
          '<label class="field"><span class="field-label">分支</span>' +
            '<input type="text" data-gh="branch" spellcheck="false" placeholder="main" value="' + U.escapeAttr(gh.branch || 'main') + '"></label>' +
          '<label class="field"><span class="field-label">数据文件路径</span>' +
            '<input type="text" data-gh="path" spellcheck="false" placeholder="data/planner.json" value="' + U.escapeAttr(gh.path || 'data/planner.json') + '"></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">附件目录</span>' +
          '<input type="text" data-gh="attachmentsDir" spellcheck="false" placeholder="data/attachments" value="' + U.escapeAttr(gh.attachmentsDir || 'data/attachments') + '"></label>' +
        '<label class="field"><span class="field-label">令牌 PAT <span class="optional">私有仓库需 contents 读写</span></span>' +
          '<input type="password" data-gh="token" spellcheck="false" autocomplete="off" placeholder="github_pat_… 或 ghp_…" value="' + U.escapeAttr(gh.token || '') + '"></label>' +
        '<details class="settings-advanced"><summary>高级：API 地址</summary>' +
          '<label class="field"><span class="field-label">apiBase</span>' +
            '<input type="text" data-gh="apiBase" spellcheck="false" placeholder="https://api.github.com" value="' + U.escapeAttr(gh.apiBase || 'https://api.github.com') + '"></label>' +
        '</details>' +
        '<div class="settings-actions">' +
          '<button class="btn btn-primary" type="button" data-gh-save>' + ui.icon('check', 15) + '保存并登录</button>' +
          '<button class="btn" type="button" data-gh-test>' + ui.icon('eye', 15) + '测试连接</button>' +
        '</div>' +
        '<p class="gh-result" data-gh-result role="status" aria-live="polite"></p>' +
        '<p class="tiny muted">令牌只保存这台设备的 <code>shiguang.sync</code> 里（不勾「记住这台设备」时只放会话）；' +
          '数据用你进入时输入的密码加密后入仓，<b>密码丢了云端数据就解不开</b>。附件只在预览时按需下载。</p>' +
      '</div>' +
      '<div class="settings-stats settings-sync-stats">' +
        '<div><strong data-sync-stat-state>' + U.escapeHTML(info.text) + '</strong><span>同步状态</span></div>' +
        '<div><strong data-sync-stat-version>' + U.escapeHTML(versionText) + '</strong><span>数据版本</span></div>' +
        '<div><strong data-sync-stat-time>' + U.escapeHTML(lastSync) + '</strong><span>上次同步</span></div>' +
        '<div><strong data-sync-stat-auth>' + (info.authed ? '已登录' : '未登录') + '</strong><span>登录状态</span></div>' +
      '</div>' +
      '<div class="settings-actions">' +
        '<button class="btn btn-primary" type="button" data-settings-sync-now>' + ui.icon('arrowUpRight', 15) + '立即同步</button>' +
        '<button class="btn" type="button" data-open-sync>' + ui.icon('eye', 15) + '打开同步面板</button>' +
        '<button class="btn" type="button" data-settings-save-server>' + ui.icon('check', 15) + '保存地址</button>' +
        '<button class="btn btn-ghost" type="button" data-settings-sync-logout>退出登录</button>' +
      '</div>' +
      '<p class="tiny muted">用自建服务端时，附件不同步（只留在本机）；用 GitHub 后端时，附件会加密后按内容哈希上传。</p>' +
    '</section>';
  }

  function bindSyncSection(body, close) {
    if (!PP.sync) return;
    var select = body.querySelector('[data-settings-provider]');
    var serverInput = body.querySelector('[data-settings-server]');
    var serverField = body.querySelector('[data-settings-server-field]');
    var ghBlock = body.querySelector('[data-settings-github]');
    var ghResult = body.querySelector('[data-gh-result]');
    var info = PP.sync.status();

    function ghFields() {
      var out = {};
      body.querySelectorAll('[data-gh]').forEach(function (input) {
        out[input.getAttribute('data-gh')] = input.value;
      });
      return out;
    }

    function showGithub(isGithub) {
      if (ghBlock) ghBlock.hidden = !isGithub;
      if (serverField) serverField.hidden = isGithub;
    }

    function setGhResult(message, tone) {
      if (!ghResult) return;
      ghResult.textContent = message || '';
      ghResult.className = 'gh-result' + (tone ? ' is-' + tone : '');
    }

    function paint() {
      var next = PP.sync.status();
      var stateEl = body.querySelector('[data-sync-stat-state]');
      if (stateEl) stateEl.textContent = next.text;
      var versionEl = body.querySelector('[data-sync-stat-version]');
      if (versionEl) {
        versionEl.textContent = typeof next.version === 'string'
          ? 'sha ' + String(next.version).slice(0, 7)
          : 'v' + next.version;
      }
      var timeEl = body.querySelector('[data-sync-stat-time]');
      if (timeEl) timeEl.textContent = next.lastSyncAt ? D.formatSaved(next.lastSyncAt) : '还没有同步过';
      var authEl = body.querySelector('[data-sync-stat-auth]');
      if (authEl) authEl.textContent = next.authed ? '已登录' : '未登录';
    }

    if (select) {
      select.value = info.provider;
      select.addEventListener('change', function () {
        var result = PP.sync.useProvider(select.value);
        if (!result.ok) {
          ui.toast(result.message || '切换后端失败。', 'error');
          select.value = info.provider;
          return;
        }
        showGithub(select.value === 'github');
        paint();
        if (select.value === 'github') {
          setGhResult('填好仓库信息后点「保存并登录」，然后输入加密密码。', 'info');
          return;
        }
        if (!PP.sync.isAuthed()) {
          var available = typeof PP.sync.backendAvailable === 'function' ? PP.sync.backendAvailable() : true;
          if (available && PP.gate && typeof PP.gate.open === 'function') {
            if (typeof close === 'function') close();
            PP.gate.open('已切换存储后端，请输入访问密码。');
          }
        }
      });
    }

    var ghSave = body.querySelector('[data-gh-save]');
    if (ghSave) {
      ghSave.addEventListener('click', async function () {
        var fields = ghFields();
        if (!String(fields.owner || '').trim() || !String(fields.repo || '').trim()) {
          setGhResult('请先填写 owner 和 repo。', 'error');
          return;
        }
        if (!String(fields.token || '').trim()) {
          setGhResult('请填写 GitHub 令牌（PAT）；私有仓库需要 contents 读写权限。', 'error');
          return;
        }
        var result = PP.sync.useProvider('github', { github: fields });
        if (!result.ok) {
          setGhResult(result.message || '保存失败。', 'error');
          return;
        }
        setGhResult('已保存。接下来输入加密密码（忘记密码云端数据就解不开）。', 'ok');
        paint();
        if (!PP.sync.isAuthed() && PP.gate && typeof PP.gate.open === 'function') {
          if (typeof close === 'function') close();
          PP.gate.open('请输入 GitHub 数据的加密密码。');
        }
      });
    }

    var ghTest = body.querySelector('[data-gh-test]');
    if (ghTest) {
      ghTest.addEventListener('click', async function () {
        var provider = PP.sync.providers && PP.sync.providers.github;
        if (!provider || typeof provider.testConnection !== 'function') {
          setGhResult('GitHub 后端没有加载成功，刷新页面后重试。', 'error');
          return;
        }
        ghTest.disabled = true;
        setGhResult('正在测试连接…', 'info');
        try {
          PP.sync.useProvider('github', { github: ghFields() });
          var result = await provider.testConnection(PP.sync.config());
          setGhResult(result.message, result.ok ? 'ok' : 'error');
        } catch (error) {
          setGhResult((error && error.message) || '测试失败。', 'error');
        } finally {
          ghTest.disabled = false;
        }
      });
    }

    var saveServer = body.querySelector('[data-settings-save-server]');
    if (saveServer) {
      saveServer.addEventListener('click', function () {
        var value = serverInput ? serverInput.value : '';
        var result = PP.sync.setServer(value);
        if (!result.ok) {
          ui.toast(result.message, 'error');
          return;
        }
        paint();
        if (!result.changed) {
          ui.toast('服务器地址没有变化。', 'info');
          return;
        }
        ui.toast('服务器地址已保存。', 'success');
        if (PP.sync.provider() === 'github') {
          // 当前用 GitHub 后端，改自建服务端地址不需要跳登录
          return;
        }
        if (PP.sync.isAuthed()) {
          ui.toast('地址变了，请重新登录新服务器。', 'warning', 4200);
          if (typeof close === 'function') close();
          PP.sync.logout();
        } else if (PP.gate && typeof PP.gate.open === 'function') {
          var available = typeof PP.sync.backendAvailable === 'function' ? PP.sync.backendAvailable() : true;
          if (!available) return;
          if (typeof close === 'function') close();
          PP.gate.open('请用新服务器地址的访问密码登录。');
        }
      });
    }

    var syncNow = body.querySelector('[data-settings-sync-now]');
    if (syncNow) {
      syncNow.addEventListener('click', async function () {
        syncNow.disabled = true;
        try {
          var result = await PP.sync.syncNow({ force: true });
          if (result && result.ok) ui.toast('同步完成。', 'success', 2200);
        } finally {
          syncNow.disabled = false;
          paint();
        }
      });
    }

    var logout = body.querySelector('[data-settings-sync-logout]');
    if (logout) {
      logout.addEventListener('click', async function () {
        var confirmed = await ui.confirm({
          title: '退出登录',
          message: '会清除这台设备上的登录 token，<b>本地数据不会删除</b>。确定退出吗？',
          confirmText: '退出登录',
          cancelText: '取消'
        });
        if (!confirmed) return;
        if (typeof close === 'function') close();
        await PP.sync.logout();
      });
    }
  }

  /* ------------------------------- 设置弹窗 ------------------------------- */

  function open() {
    var usage = PP.store.usage();
    var books = PP.data.getBooks().length;
    var writings = PP.data.getWritings().length;
    var todos = PP.data.getTodos().length;
    var habits = PP.data.getHabits().length;

    ui.modal({
      title: '设置与数据备份',
      subtitle: '默认只存这台设备；开启同步后，结构化数据会同步到你自己指定的存储后端。',
      body: '<div class="settings-page">' +
        '<section class="settings-section">' +
          '<div class="settings-section-head"><span class="settings-icon">' + ui.icon('database', 17) + '</span><div><h3>数据存在哪里</h3><p>结构化数据在 localStorage，图片 / PDF / Word 的 base64 在 IndexedDB（不可用时回退 localStorage）。</p></div></div>' +
          '<div class="settings-stats">' +
            '<div><strong>' + usage.text + '</strong><span>localStorage 已用</span></div>' +
            '<div><strong>' + attachmentCount() + '</strong><span>个附件</span></div>' +
            '<div><strong>' + books + '</strong><span>本书</span></div>' +
            '<div><strong>' + writings + '</strong><span>张写作卡</span></div>' +
            '<div><strong>' + todos + '</strong><span>项截止待办</span></div>' +
            '<div><strong>' + habits + '</strong><span>个习惯</span></div>' +
          '</div>' +
        '</section>' +

        syncSection() +

        '<section class="settings-section">' +
          '<div class="settings-section-head"><span class="settings-icon">' + ui.icon('download', 17) + '</span><div><h3>导出备份</h3><p>导出为 JSON 文件。完整备份包含附件 base64，文件可能较大；建议先看体积提示，再决定是否导出。</p></div></div>' +
          '<div class="settings-actions">' +
            '<button class="btn btn-primary" type="button" data-export-all>' + ui.icon('download', 15) + '导出全部数据（含附件）</button>' +
            '<button class="btn" type="button" data-export-data>' + ui.icon('file', 15) + '仅导出结构化数据</button>' +
          '</div>' +
        '</section>' +

        '<section class="settings-section">' +
          '<div class="settings-section-head"><span class="settings-icon">' + ui.icon('upload', 17) + '</span><div><h3>导入备份</h3><p>选择之前导出的 JSON。导入会先校验格式与版本，并连续两次确认是否覆盖当前数据。</p></div></div>' +
          '<div class="settings-actions">' +
            '<label class="btn btn-soft settings-import-label">' + ui.icon('upload', 15) + '选择备份文件' +
              '<input type="file" accept=".json,application/json" data-import-file hidden>' +
            '</label>' +
            '<span class="tiny muted">恢复到这台浏览器 · 不会上传到网络</span>' +
          '</div>' +
        '</section>' +

        '<section class="settings-note">' +
          ui.icon('info', 16) +
          '<p>浏览器数据可能因清除站点数据、无痕模式或设备更换而丢失。建议定期导出完整备份。同步只覆盖结构化数据，附件始终留在这台设备上。</p>' +
        '</section>' +
      '</div>',
      wide: true,
      footer: '<button class="btn" type="button" data-modal-close>关闭</button>',
      onMount: function (body, close) {
        var exportAll = body.querySelector('[data-export-all]');
        var exportData = body.querySelector('[data-export-data]');
        var importInput = body.querySelector('[data-import-file]');
        if (exportAll) {
          exportAll.addEventListener('click', function () { PP.backup.exportBackup(true); });
        }
        if (exportData) {
          exportData.addEventListener('click', function () { PP.backup.exportBackup(false); });
        }
        if (importInput) {
          importInput.addEventListener('change', function () {
            var file = importInput.files && importInput.files[0];
            importInput.value = '';
            if (file) PP.backup.importBackup(file);
          });
        }
        try {
          bindSyncSection(body, close);
        } catch (error) {
          console.error('[拾光] 同步区块绑定失败：', error);
        }
      }
    });
  }

  function init() {
    document.querySelectorAll('[data-open-settings]').forEach(function (button) {
      button.addEventListener('click', open);
    });
  }

  PP.settings = { open: open, init: init };
}());
