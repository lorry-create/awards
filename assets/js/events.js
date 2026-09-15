/*
 * events.js — 把应用状态和 DOM 事件全部集中在这里初始化。
 *
 * index.html 里没有任何内联脚本，好处是可以给页面加一行严格的 CSP
 * （default-src 'self'），杜绝外部脚本注入；代价就是初始化要单独写一个文件。
 */
(function () {
  'use strict';

  var App = window.AwardsApp;
  var $ = App.$;
  var $$ = App.$$;

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  // ---------- 主题 ----------
  var THEME_KEY = 'awards-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = $('#theme-toggle');
    if (btn) {
      var isDark = theme === 'dark';
      btn.textContent = isDark ? '浅色' : '深色';
      btn.setAttribute('aria-label', isDark ? '切换到浅色模式' : '切换到深色模式');
    }
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* 隐私模式下会抛错，忽略 */ }
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));

    var btn = $('#theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 忽略 */ }
    });
  }

  // ---------- 二维码 ----------
  function initQr() {
    var canvas = $('#qr-canvas');
    if (!canvas) return;

    var url = location.href.split('#')[0];
    // file:// 直接打开时二维码没有意义，给出提示而不是画一个扫不开的码
    var isLocalFile = location.protocol === 'file:';
    var input = $('#qr-url');

    function draw(value) {
      try {
        window.QR.render(canvas, value, { level: 'M', quiet: 4 });
        $('#qr-error').hidden = true;
      } catch (err) {
        $('#qr-error').hidden = false;
        $('#qr-error').textContent = '二维码生成失败：' + err.message;
      }
    }

    function refresh() {
      var value = (input && input.value.trim()) || url;
      $('#qr-url-text').textContent = value;
      draw(value);
    }

    if (isLocalFile) {
      $('#qr-hint').textContent = '当前是用 file:// 直接打开的本地文件，手机扫不到。' +
        '部署到公网后，把地址填进下面的输入框即可生成可用的二维码。';
    }

    if (input) {
      input.value = url;
      input.addEventListener('input', debounce(refresh, 250));
    }
    refresh();

    // 保存二维码图片
    var saveBtn = $('#qr-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var a = document.createElement('a');
        a.download = '奖状二维码.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
      });
    }

    // 复制链接
    var copyBtn = $('#qr-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var value = $('#qr-url-text').textContent;
        var done = function () {
          copyBtn.textContent = '已复制';
          setTimeout(function () { copyBtn.textContent = '复制链接'; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(done, function () { window.prompt('手动复制：', value); });
        } else {
          window.prompt('手动复制：', value);
        }
      });
    }
  }

  // ---------- 灯箱：查看大图，支持缩放和拖动 ----------
  var viewer = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0 };

  function applyTransform() {
    var img = $('#viewer-img');
    if (!img) return;
    img.style.transform = 'translate(' + viewer.x + 'px,' + viewer.y + 'px) scale(' + viewer.scale + ')';
    $('#viewer-zoom-label').textContent = Math.round(viewer.scale * 100) + '%';
  }

  function resetViewer() {
    viewer.scale = 1; viewer.x = 0; viewer.y = 0;
    applyTransform();
  }

  function zoomBy(factor) {
    var next = Math.min(6, Math.max(0.3, viewer.scale * factor));
    viewer.scale = next;
    if (next <= 1) { viewer.x = 0; viewer.y = 0; }
    applyTransform();
  }

  function openViewer(item) {
    var dlg = $('#viewer');
    var img = $('#viewer-img');
    img.src = item.src;
    img.alt = item.event + ' — ' + item.award;
    $('#viewer-event').textContent = item.event;
    $('#viewer-award').textContent = item.award;
    $('#viewer-meta').textContent = [item.date, item.certNo ? '编号 ' + item.certNo : '', item.level]
      .filter(Boolean).join(' · ');
    viewer.target = item;
    resetViewer();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function closeViewer() {
    var dlg = $('#viewer');
    var img = $('#viewer-img');
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
    img.removeAttribute('src'); // 释放内存，手机上很关键
    resetViewer();
  }

  function initViewer() {
    var dlg = $('#viewer');
    if (!dlg) return;

    $('#viewer-close').addEventListener('click', closeViewer);
    $('#viewer-zoom-in').addEventListener('click', function () { zoomBy(1.35); });
    $('#viewer-zoom-out').addEventListener('click', function () { zoomBy(1 / 1.35); });
    $('#viewer-reset').addEventListener('click', resetViewer);

    $('#viewer-download').addEventListener('click', function () {
      if (!viewer.target) return;
      var a = document.createElement('a');
      a.href = viewer.target.src;
      a.download = viewer.target.eventShort + '.jpg';
      a.click();
    });

    // 点击遮罩区域关闭
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) closeViewer();
    });

    var stage = $('#viewer-stage');

    // 滚轮缩放
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
      applyTransform();
    }, { passive: false });

    // 拖动查看
    stage.addEventListener('pointerdown', function (e) {
      viewer.dragging = true;
      viewer.startX = e.clientX - viewer.x;
      viewer.startY = e.clientY - viewer.y;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', function (e) {
      if (!viewer.dragging) return;
      viewer.x = e.clientX - viewer.startX;
      viewer.y = e.clientY - viewer.startY;
      applyTransform();
    });
    stage.addEventListener('pointerup', function (e) {
      viewer.dragging = false;
      stage.classList.remove('is-dragging');
      try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    });

    // 双击在原尺寸和适应窗口之间切换
    stage.addEventListener('dblclick', function () {
      if (viewer.scale > 1.01) resetViewer();
      else zoomBy(2);
    });

    dlg.addEventListener('cancel', function (e) {
      e.preventDefault();
      closeViewer();
    });
  }

  // ---------- 初始化 ----------
  function init() {
    App.load()
      .then(function () {
        App.render();
      })
      .catch(function (err) {
        $('#loading').hidden = true;
        $('#load-error').hidden = false;
        $('#load-error').textContent = '证书数据加载失败：' + err.message +
          '（如果是用 file:// 直接打开的，请改用本地服务器或部署到公网后再访问）';
      });

    initTheme();
    initViewer();
    initQr();

    // 搜索
    var search = $('#search');
    if (search) {
      search.addEventListener('input', debounce(function () {
        App.state.query = search.value.trim();
        App.render();
      }, 180));
    }

    // 分类筛选按钮
    document.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-filter]');
      if (chip) {
        var group = chip.getAttribute('data-filter');
        var value = chip.getAttribute('data-value');
        if (group === 'category') App.state.category = value;
        if (group === 'award') App.state.award = value;
        App.render();
        return;
      }

      // 证书卡片：点开大图
      var card = e.target.closest('.card');
      if (card && card.dataset.id) {
        var item = App.byId(card.dataset.id);
        if (item) openViewer(item);
      }
    });

    // 键盘：Esc 关闭由 dialog 原生处理，这里补充左右方向键切换
    document.addEventListener('keydown', function (e) {
      if (!$('#viewer').open) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var items = App.visibleItems();
      if (!items.length || !viewer.target) return;
      var idx = items.findIndex(function (i) { return i.id === viewer.target.id; });
      if (idx < 0) return;
      var next = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
      if (next < 0 || next >= items.length) return;
      openViewer(items[next]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
