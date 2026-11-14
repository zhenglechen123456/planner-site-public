/* ==========================================================================
   启动流程：主题 / 导航 → 密码门禁 → 示例数据 → 路由 → 同步引擎
   --------------------------------------------------------------------------
   门禁说明：没有有效 token 时先渲染全屏密码页，登录成功后才会执行 startApp()，
   因此密码页阶段不会渲染任何页面内容。file:// 双击打开时门禁自动放行（本地模式）。
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};

  function startApp() {
    try {
      PP.data.migrate();
    } catch (migrationError) {
      console.error('[拾光] 数据迁移失败：', migrationError);
    }

    try {
      var seeded = PP.seed.installIfNeeded();
      if (seeded) {
        console.info('[拾光] 已写入首次访问的示例数据。');
      }
    } catch (error) {
      console.error('[拾光] 示例数据初始化失败：', error);
      PP.ui.toast('示例数据没有完全写入，但不影响继续使用。', 'warning');
    }

    // 内置课表：只在第一次运行时播种一次，用户之后改了不会被覆盖
    try {
      if (PP.courseData && typeof PP.courseData.installIfNeeded === 'function') {
        if (PP.courseData.installIfNeeded()) {
          console.info('[拾光] 已写入内置课表。');
        }
      }
    } catch (error) {
      console.error('[拾光] 课表初始化失败：', error);
    }

    if (!PP.store.available) {
      PP.ui.toast('浏览器禁用了本地存储，关闭页面后内容可能丢失。', 'warning', 6500);
    }

    try {
      PP.router.init();
    } catch (error) {
      console.error('[拾光] 路由启动失败：', error);
      var view = document.getElementById('view');
      if (view) {
        view.innerHTML = '<div class="page-shell"><div class="error-panel">' +
          '<h1>拾光日程没有成功启动</h1>' +
          '<p>请刷新页面重试，或换用最新版 Chrome / Edge 打开。</p>' +
          '<button class="btn btn-primary" type="button" onclick="window.location.reload()">刷新页面</button>' +
          '</div></div>';
      }
      return;
    }

    // 同步引擎：包一层 PP.store.write（本地优先，写完防抖推送），再拉一次云端
    try {
      if (PP.sync && typeof PP.sync.start === 'function') PP.sync.start();
    } catch (error) {
      console.error('[拾光] 同步引擎启动失败：', error);
    }
  }

  function boot() {
    // 主题、移动端菜单、设置先初始化：密码页也需要正确的配色
    try {
      PP.ui.theme.init();
      PP.ui.initMenu();
      PP.settings.init();
    } catch (error) {
      console.error('[拾光] 主题、导航或设置初始化失败：', error);
    }

    // 密码门禁：有有效 token 直接进，否则先渲染密码页，登录成功后再 startApp()
    if (PP.gate && typeof PP.gate.start === 'function') {
      try {
        PP.gate.start(startApp);
        return;
      } catch (error) {
        console.error('[拾光] 密码门禁启动失败，直接进入应用：', error);
      }
    }
    startApp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
