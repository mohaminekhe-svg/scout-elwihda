/* =========================================================
   site-v4.js — الهوية الكشفية الملكية (يُحمَّل بعد site-v3.js)
   1) مقدمة سينمائية تظهر عند كل تحميل كامل (بلا تخزين وبلا أزرار)
   2) تنقل الواجهات المستقلة + القائمة الجانبية القابلة للإخفاء
   3) مؤشر تقدم التمرير الحقيقي
   4) إحصائيات «التعريف بالفوج» (من ABOUT_STATS في content-config.js)
   لا يستعمل localStorage ولا sessionStorage إطلاقاً.
   ========================================================= */
(function () {
  'use strict';

  var PAGES = ['home-page', 'latest-news-page', 'next-gathering-page', 'bulletin-page', 'units-page', 'gallery-page', 'about-page'];
  var DESKTOP_MIN = 901;
  function $(id) { return document.getElementById(id); }
  function reduceMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function isDesktop() { return window.innerWidth >= DESKTOP_MIN; }

  /* ---------------- 1) المقدمة ---------------- */
  // التوقيتات (مللي ثانية): تبدأ الخروج السينمائي عند EXIT_AT ثم تُزال بعد EXIT_MS.
  var EXIT_AT = 5600, EXIT_MS = 800, EXIT_AT_REDUCED = 2800;
  function initIntro() {
    var el = $('splashScreen');
    if (!el) return;
    var lockables = [document.querySelector('.header-fixed-wrapper'), document.querySelector('main.main-content-viewport'), document.querySelector('footer.site-footer')];
    lockables.forEach(function (n) { if (n) n.setAttribute('inert', ''); }); // لا تركيز لوحة مفاتيح خلف المقدمة
    document.body.classList.add('splash-open');
    var finished = false;
    function finish() {
      if (finished) return; finished = true;
      el.classList.add('intro-exit');
      document.body.classList.add('site-revealing');
      lockables.forEach(function (n) { if (n) n.removeAttribute('inert'); });
      setTimeout(function () {
        el.style.display = 'none';
        document.body.classList.remove('splash-open');
        setTimeout(function () { document.body.classList.remove('site-revealing'); }, 900);
        updateRail();
      }, reduceMotion() ? 0 : EXIT_MS);
    }
    setTimeout(finish, reduceMotion() ? EXIT_AT_REDUCED : EXIT_AT);
  }

  /* ---------------- 2) القائمة الجانبية ---------------- */
  var menu, toggleBtn, backdrop;
  function setHeaderHeight() {
    var h = document.querySelector('.header-fixed-wrapper');
    if (h) document.documentElement.style.setProperty('--hdr-h', h.offsetHeight + 'px');
  }
  function sidebarOpen() { return isDesktop() ? !document.body.classList.contains('sidebar-collapsed') : menu.classList.contains('active'); }
  function syncToggleState() {
    if (!toggleBtn) return;
    var open = sidebarOpen();
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleBtn.classList.toggle('is-open', open);
  }
  function openSidebar() {
    if (isDesktop()) document.body.classList.remove('sidebar-collapsed'); else menu.classList.add('active');
    syncToggleState(); afterLayoutChange();
  }
  function closeSidebar() {
    if (isDesktop()) document.body.classList.add('sidebar-collapsed'); else menu.classList.remove('active');
    syncToggleState(); afterLayoutChange();
  }
  function toggleSidebar() { if (sidebarOpen()) closeSidebar(); else openSidebar(); }
  function afterLayoutChange() { setTimeout(updateRail, 340); }

  function toggleGroup(group, forceOpen) {
    var btn = group.querySelector('.nav-group-btn'), sub = group.querySelector('.nav-sub');
    if (!btn || !sub) return;
    var open = forceOpen === undefined ? btn.getAttribute('aria-expanded') !== 'true' : forceOpen;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    sub.hidden = !open;
    group.classList.toggle('open', open);
  }
  function markActive(pageId) {
    menu.querySelectorAll('.nav-group').forEach(function (g) {
      var on = g.getAttribute('data-page') === pageId;
      var b = g.querySelector('.nav-group-btn');
      if (b) { b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
      if (!on) toggleGroup(g, false); else toggleGroup(g, true);
    });
  }
  function closeDrawerIfMobile() { if (!isDesktop()) { menu.classList.remove('active'); syncToggleState(); } }

  function initNav() {
    menu = $('navMenu'); toggleBtn = $('sidebarToggle'); backdrop = $('sidebarBackdrop');
    if (!menu) return;

    // تغليف showPage: تمييز العنصر النشط، العودة للأعلى، تحديث المؤشر وعدّادات التعريف
    var orig = window.showPage;
    window.showPage = function (id, opts) {
      orig(id, opts);
      markActive(id);
      onPageShown(id);
    };

    menu.addEventListener('click', function (e) {
      var sub = e.target.closest('.nav-sub-btn');
      var grp = e.target.closest('.nav-group-btn');
      if (sub) {
        var page = sub.getAttribute('data-page');
        window.showPage(page);
        if (sub.dataset.bfilter && window.V3) V3.setBulletinFilter(sub.dataset.bfilter);
        if (sub.dataset.gfilter) {
          var gb = Array.prototype.filter.call(document.querySelectorAll('#galleryAuthedContent .gallery-filter-btn'), function (b) {
            return (b.getAttribute('onclick') || '').indexOf("'" + sub.dataset.gfilter + "'") !== -1;
          })[0];
          if (typeof filterGallery === 'function') filterGallery(sub.dataset.gfilter, gb);
        }
        if (sub.dataset.unit && window.V3) V3.openUnitDetail(sub.dataset.unit);
        closeDrawerIfMobile();
      } else if (grp) {
        var g = grp.closest('.nav-group');
        var pageId = g.getAttribute('data-page');
        var hasSub = !!g.querySelector('.nav-sub');
        var isActive = $(pageId).classList.contains('active-page');
        if (!hasSub) { window.showPage(pageId); closeDrawerIfMobile(); return; }
        if (!isActive) { window.showPage(pageId); toggleGroup(g, true); }  // أول نقرة: افتح الواجهة
        else toggleGroup(g);                                                 // نقرة ثانية: اطوِ/افتح القائمة الفرعية
        if (!isDesktop() && !isActive) { menu.classList.add('active'); }     // على الهاتف تبقى القائمة مفتوحة لاختيار فرعي
      }
    });

    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !isDesktop() && menu.classList.contains('active')) { closeSidebar(); if (toggleBtn) toggleBtn.focus(); }
    });
    window.addEventListener('resize', function () {
      setHeaderHeight();
      if (isDesktop()) menu.classList.remove('active'); // لا تبقى حالة الدرج الهاتفي عالقة على الحاسوب
      syncToggleState(); updateRail();
    });
    if (window.ResizeObserver) { var h = document.querySelector('.header-fixed-wrapper'); if (h) new ResizeObserver(setHeaderHeight).observe(h); }
    setHeaderHeight();

    // بطاقات الرئيسية (data-goto)
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-goto]');
      if (t) { e.preventDefault(); window.showPage(t.getAttribute('data-goto')); }
    });

    // زر الرجوع/التقدم في المتصفح بين الواجهات (بدون إضافة مداخل جديدة للسجل)
    window.addEventListener('hashchange', function () {
      if (typeof isSessionLocked === 'function' && isSessionLocked()) return;
      var id = String(location.hash || '').replace('#', '');
      if (PAGES.indexOf(id) !== -1) { if (!$(id).classList.contains('active-page')) window.showPage(id, { noHistory: true }); }
      else if (id === '' && !$('home-page').classList.contains('active-page') && !document.body.classList.contains('admin-view-open')) window.showPage('home-page', { noHistory: true });
    });

    // الحالة الابتدائية
    var cur = document.querySelector('.site-page.active-page');
    if (cur) markActive(cur.id);
    syncToggleState();
    if (cur) onPageShown(cur.id, true);
  }

  /* ---------------- 3) مؤشر تقدم التمرير ---------------- */
  var rail, railFill, railKnot, railTick = false;
  function updateRail() {
    if (!rail) return;
    var doc = document.documentElement;
    var range = Math.max(0, (doc.scrollHeight || 0) - window.innerHeight);
    var y = window.pageYOffset || doc.scrollTop || 0;
    if (document.body.classList.contains('menu-scroll-locked')) { return; } // أثناء قفل التمرير (الدرج مفتوح) نُبقي القيمة الأخيرة
    var show = range > 40 && !document.body.classList.contains('admin-view-open') && !document.body.classList.contains('splash-open');
    rail.classList.toggle('visible', show);
    if (!show) return;
    var p = Math.min(1, Math.max(0, y / range));
    railFill.style.transform = 'scaleY(' + p.toFixed(4) + ')';
    railKnot.style.top = (p * 100).toFixed(2) + '%';
    rail.setAttribute('data-progress', String(Math.round(p * 100)));
  }
  function requestRail() { if (railTick) return; railTick = true; requestAnimationFrame(function () { railTick = false; updateRail(); }); }
  function initRail() {
    rail = $('scrollRail'); railFill = $('scrollRailFill'); railKnot = $('scrollRailKnot');
    if (!rail) return;
    window.addEventListener('scroll', requestRail, { passive: true });
    window.addEventListener('load', updateRail);
    if (window.ResizeObserver) new ResizeObserver(requestRail).observe(document.body); // الصفحات تتغير طولاً عند وصول البيانات
    updateRail();
  }

  /* ---------------- 4) إحصائيات التعريف بالفوج ---------------- */
  var statsBuilt = false, statsAnimated = false;
  function fmt(n, plain) { return plain ? String(n) : n.toLocaleString('en-US'); }
  function buildStats() {
    var box = $('aboutStats');
    if (!box || statsBuilt) return;
    statsBuilt = true;
    var list = (typeof ABOUT_STATS !== 'undefined' && ABOUT_STATS.length) ? ABOUT_STATS : [];
    var html = list.map(function (s) {
      return '<div class="about-stat" role="listitem"><span class="about-stat-num" dir="ltr" data-target="' + s.value + '" data-suffix="' + (s.suffix || '') + '" data-plain="' + (s.plain ? '1' : '') + '">' +
        fmt(s.value, s.plain) + (s.suffix || '') + '</span><span class="about-stat-label">' + escHtml(s.label) + '</span></div>';
    }).join('');
    var goals = (typeof ABOUT_GOALS_TEXT !== 'undefined') ? ABOUT_GOALS_TEXT : '';
    if (goals) html += '<div class="about-stat about-stat-goals" role="listitem"><span class="about-stat-text">' + escHtml(goals) + '</span><span class="about-stat-label">أهدافنا</span></div>';
    box.innerHTML = html;
    var note = $('aboutStatsNote');
    if (note && list.some(function (s) { return s.confirmed === false; })) {
      note.hidden = false;
      note.textContent = 'ملاحظة: بعض الأرقام أعلاه قيد التأكيد من إدارة الفوج.';
    }
  }
  function animateStats() {
    if (statsAnimated || reduceMotion()) { statsAnimated = true; return; }
    statsAnimated = true;
    var nodes = document.querySelectorAll('.about-stat-num');
    var start = null, DUR = 1400;
    nodes.forEach(function (n) { n.textContent = fmt(0, n.dataset.plain) + (n.dataset.suffix || ''); });
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / DUR), e = 1 - Math.pow(1 - t, 3);
      nodes.forEach(function (n) {
        var target = Number(n.dataset.target) || 0;
        n.textContent = fmt(Math.round(target * e), n.dataset.plain) + (n.dataset.suffix || '');
      });
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function onPageShown(id, initial) {
    requestRail(); setTimeout(updateRail, 120); setTimeout(updateRail, 600);
    if (id === 'about-page') { buildStats(); animateStats(); }
    var pg = $(id);
    if (pg && !initial) { var h = pg.querySelector('h1, h2'); if (h) { h.setAttribute('tabindex', '-1'); } }
  }

  /* ---------------- تشغيل ---------------- */
  function init() {
    initIntro();
    initNav();
    initRail();
    buildStats();
  }
  window.SE_ROYAL = { toggleSidebar: toggleSidebar, openSidebar: openSidebar, closeSidebar: closeSidebar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
