/*
 * app.js — 页面状态、数据加载与渲染。
 *
 * 数据来自 assets/data/certificates.json（由 tools/build-data.ps1 生成，
 * 不需要手工维护 DOM）。
 */
(function (global) {
  'use strict';

  var state = {
    all: [],
    pdfs: [],
    owner: '',
    school: '',
    category: 'all',
    award: 'all',
    query: ''
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // 统一的 HTML 转义：证书信息里可能有引号、书名号等字符
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function load() {
    return fetch('assets/data/certificates.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.owner = data.owner || '';
        state.school = data.school || '';
        // 归属待确认或明确不属于本人的证书不展示
        state.all = (data.items || []).filter(function (item) { return !item.excluded; });
        state.pdfs = (data.pdfs || []).filter(function (item) { return !item.excluded; });
        renderHeader();
        renderStats();
        renderPdfs();
        return data;
      });
  }

  function renderHeader() {
    var title = $('#page-title');
    if (title) title.textContent = state.owner ? state.owner + '的获奖证书' : '我的获奖证书';
    var sub = $('#page-subtitle');
    if (sub) sub.textContent = state.school || '';
    document.title = (state.owner ? state.owner + '的获奖证书' : '获奖证书') + ' · 扫码查看';
  }

  function renderStats() {
    var host = $('#stats');
    if (!host) return;
    var total = state.all.length;
    var first = state.all.filter(function (i) { return i.award.indexOf('一等奖') >= 0; }).length;
    var years = {};
    state.all.forEach(function (i) {
      var m = String(i.date).match(/(20\d\d)/);
      if (m) years[m[1]] = true;
    });
    var yearText = Object.keys(years).sort().join('、');

    var cells = [
      ['证书总数', total + ' 项'],
      ['一等奖', first + ' 项'],
      ['时间跨度', yearText || '—']
    ];
    host.innerHTML = cells.map(function (pair) {
      return '<div class="stat"><span class="stat-value">' + esc(pair[1]) +
        '</span><span class="stat-label">' + esc(pair[0]) + '</span></div>';
    }).join('');
  }

  function visibleItems() {
    var q = state.query.toLowerCase();
    return state.all.filter(function (item) {
      if (state.category !== 'all' && item.category !== state.category) return false;
      if (state.award !== 'all' && item.award.indexOf(state.award) < 0) return false;
      if (!q) return true;
      var haystack = [item.event, item.eventShort, item.award, item.org, item.certNo,
        item.teacher, item.team, item.work, item.level, item.date].join(' ').toLowerCase();
      return haystack.indexOf(q) >= 0;
    });
  }

  function byId(id) {
    return state.all.filter(function (i) { return String(i.id) === String(id); })[0] || null;
  }

  function cardHtml(item) {    var badges = [];
    if (item.level) badges.push('<span class="badge badge-level">' + esc(item.level) + '</span>');
    if (item.award) badges.push('<span class="badge badge-award">' + esc(item.award) + '</span>');

    var meta = [];
    if (item.date) meta.push(esc(item.date));
    if (item.certNo) meta.push('编号 ' + esc(item.certNo));

    var team = item.team
      ? '<p class="card-line"><span class="k">团队</span>' + esc(item.team) + '</p>' : '';
    var work = item.work
      ? '<p class="card-line"><span class="k">项目</span>' + esc(item.work) + '</p>' : '';
    var teacher = item.teacher
      ? '<p class="card-line"><span class="k">指导</span>' + esc(item.teacher) + '</p>' : '';
    var org = item.org
      ? '<p class="card-line"><span class="k">颁发</span>' + esc(item.org) + '</p>' : '';

    return '' +
      '<article class="card" data-id="' + esc(item.id) + '" tabindex="0" role="button" ' +
      'aria-label="查看证书大图：' + esc(item.eventShort) + ' ' + esc(item.award) + '">' +
        '<div class="card-thumb">' +
          '<img src="' + esc(item.src) + '" alt="' + esc(item.event + ' ' + item.award) + '" ' +
          'loading="lazy" decoding="async">' +
          '<div class="card-zoom" aria-hidden="true">点击放大</div>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-badges">' + badges.join('') + '</div>' +
          '<h3 class="card-title">' + esc(item.eventShort || item.event) + '</h3>' +
          '<p class="card-event">' + esc(item.event) + '</p>' +
          '<p class="card-meta">' + meta.join(' · ') + '</p>' +
          team + work + teacher + org +
        '</div>' +
      '</article>';
  }

  function renderPdfs() {
    var section = $('#pdf-section');
    var host = $('#pdf-list');
    if (!section || !host) return;

    if (!state.pdfs.length) {
      section.hidden = true;
      return;
    }
    host.innerHTML = state.pdfs.map(function (pdf) {
      return '' +
        '<li>' +
          '<span class="pdf-icon" aria-hidden="true">PDF</span>' +
          '<div class="pdf-info">' +
            '<strong>' + esc(pdf.event) + '</strong>' +
            (pdf.award ? '<span class="badge badge-award">' + esc(pdf.award) + '</span>' : '') +
            '<p class="muted">' + esc(pdf.note || '') + '</p>' +
          '</div>' +
          '<a class="btn btn-primary" href="' + esc(pdf.src) + '" target="_blank" rel="noopener">打开查看</a>' +
        '</li>';
    }).join('');
    section.hidden = false;
  }

  function render() {
    var host = $('#grid');
    var empty = $('#empty');
    var count = $('#result-count');
    if (!host) return;

    var items = visibleItems();
    if (count) {
      count.textContent = items.length === state.all.length
        ? '共 ' + items.length + ' 项'
        : '筛选出 ' + items.length + ' / ' + state.all.length + ' 项';
    }
    host.innerHTML = items.map(cardHtml).join('');
    if (empty) empty.hidden = items.length > 0;

    // 同步筛选按钮的选中态
    $$('[data-filter]').forEach(function (chip) {
      var group = chip.getAttribute('data-filter');
      var value = chip.getAttribute('data-value');
      var active = (group === 'category' && state.category === value) ||
                   (group === 'award' && state.award === value);
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    $('#loading').hidden = true;
  }

  global.AwardsApp = {
    state: state,
    $: $,
    $$: $$,
    esc: esc,
    load: load,
    render: render,
    renderPdfs: renderPdfs,
    visibleItems: visibleItems,
    byId: byId
  };
})(window);
