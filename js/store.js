/* ==========================================================================
   localStorage 薄封装：统一前缀、容错、容量提示
   ========================================================================== */
(function () {
  'use strict';

  var PP = window.PP = window.PP || {};
  var PREFIX = 'shiguang.';
  var memory = Object.create(null);
  var available = true;
  var warned = false;

  try {
    var probeKey = PREFIX + '__probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
  } catch (error) {
    available = false;
  }

  function notify(message, type) {
    if (PP.ui && typeof PP.ui.toast === 'function') {
      PP.ui.toast(message, type || 'error');
    } else {
      console.warn(message);
    }
  }

  function read(key, fallback) {
    try {
      var raw = available ? window.localStorage.getItem(PREFIX + key) : memory[key];
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      console.error('[拾光] 读取数据失败：', key, error);
      return fallback;
    }
  }

  function write(key, value) {
    var raw = JSON.stringify(value);
    if (!available) {
      memory[key] = raw;
      if (!warned) {
        warned = true;
        notify('浏览器禁用了本地存储，本次内容只保存在当前页面中，刷新后会丢失。', 'warning');
      }
      return true;
    }
    try {
      window.localStorage.setItem(PREFIX + key, raw);
      return true;
    } catch (error) {
      var isQuota = error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22 || error.code === 1014);
      console.error('[拾光] 写入数据失败：', key, error);
      if (isQuota) {
        notify('本地存储空间不足。请删除一些附件或旧记录后再试；图片 / PDF / Word 附件建议控制在 8MB 以内。', 'error');
      } else {
        notify('保存失败，请检查浏览器是否允许本地存储。', 'error');
      }
      return false;
    }
  }

  function remove(key) {
    if (!available) {
      delete memory[key];
      return;
    }
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch (error) {
      console.error('[拾光] 删除数据失败：', key, error);
    }
  }

  function has(key) {
    if (!available) return Object.prototype.hasOwnProperty.call(memory, key);
    return window.localStorage.getItem(PREFIX + key) != null;
  }

  function keys() {
    if (!available) return Object.keys(memory);
    var result = [];
    try {
      for (var index = 0; index < window.localStorage.length; index += 1) {
        var key = window.localStorage.key(index);
        if (key && key.indexOf(PREFIX) === 0) result.push(key.slice(PREFIX.length));
      }
    } catch (error) {
      console.error('[拾光] 枚举本地数据失败：', error);
    }
    return result;
  }

  function usage() {
    var bytes = 0;
    keys().forEach(function (key) {
      try {
        var raw = available ? window.localStorage.getItem(PREFIX + key) : memory[key];
        bytes += (raw || '').length * 2;
      } catch (error) {
        /* 忽略单个键的异常 */
      }
    });
    return {
      bytes: bytes,
      text: PP.Util.fileSize(bytes),
      available: available
    };
  }

  function clearAll() {
    keys().forEach(remove);
  }

  PP.store = {
    prefix: PREFIX,
    available: available,
    read: read,
    write: write,
    remove: remove,
    has: has,
    keys: keys,
    usage: usage,
    clearAll: clearAll
  };
}());
