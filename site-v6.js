/* =========================================================
   site-v6.js — مرحلة ما قبل الإطلاق (تُحمَّل بعد site-v5.js)
   SEBell: زر الإشعارات + اللوحة (حالة القراءة خاصة بكل مستخدم، تحديث لحظي onSnapshot)
   أقسام الإعدادات • صفحة الوحدة (روابط #unit-<id>) • الإصدار وسجل التغييرات • تشخيص رفع الصور
   لا أسرار هنا؛ الصلاحيات الحقيقية في firestore.rules.
   ========================================================= */
(function () {
  'use strict';
  var V6 = window.V6 = window.V6 || {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function msOf(ts) { return ts && ts.toMillis ? ts.toMillis() : null; }
  function fmtDT(ms) { try { return new Intl.DateTimeFormat('ar-DZ', { timeZone: 'Africa/Algiers', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)); } catch (e) { return ''; } }
  function toast(m, t) { if (typeof showAdminNotification === 'function') showAdminNotification(m, t || 'info'); }
  var PAGE_IDS = ['latest-news-page', 'next-gathering-page', 'past-programs-page', 'bulletin-page', 'units-page', 'gallery-page', 'about-page', 'home-page', 'skills-page', 'settings-page'];

  /* =========================================================
     1) الإصدار وسجل التغييرات
     ========================================================= */
  function initVersion() {
    if (typeof SITE_VERSION === 'undefined') return;
    var b = $('footerVersion'); if (b) { b.textContent = SITE_VERSION.code; b.addEventListener('click', function () { if (window.showPage) { showPage('settings-page'); if (V6.openSection) V6.openSection('about'); } }); }
    var c = $('aboutVersionCode'); if (c) c.textContent = SITE_VERSION.code + '  (' + SITE_VERSION.date + ')';
    var box = $('changelogBox');
    if (box && typeof SITE_CHANGELOG !== 'undefined') box.innerHTML = SITE_CHANGELOG.map(function (e) {
      return '<div class="cl-entry"><h5 dir="ltr">' + esc(e.code) + ' <small>' + esc(e.date) + '</small></h5><ul>' + e.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
  }

  /* =========================================================
     2) SEBell — الإشعارات الشخصية
     ========================================================= */
  var SEBell = window.SEBell = (function () {
    var notices = [], states = {}, tab = 'all', unsubN = null, unsubS = null, timer = null, uid = null, openState = false, expanded = {}, lastFocus = null;
    function me() { return (window.V5 && V5.me) || {}; }
    function activeUser() { var m = me(); return !!(m.uid && m.data && m.data.accountStatus === 'active'); }
    function audienceOk(n) { var a = n.audience || 'all'; return a === 'all' || a === 'members'; }   // الجرس للمسجلين فقط
    function started(n, now) { var s = msOf(n.startAt); return s == null || s <= now; }
    function live(n, now) { var e = msOf(n.endAt); return started(n, now) && (e == null || now < e); }
    function stOf(id) { return (states[id] && states[id].status) || 'new'; }
    function listAll() {
      var now = Date.now();
      return notices.filter(function (n) { return n.published === true && audienceOk(n) && started(n, now) && (live(n, now) || stOf(n.id) === 'read' || stOf(n.id) === 'later'); })
        .sort(function (a, b) { return (msOf(b.startAt) || 0) - (msOf(a.startAt) || 0); });
    }
    function counts() {
      var now = Date.now(), all = listAll(), c = { all: all.length, unread: 0, later: 0, read: 0 };
      all.forEach(function (n) { var s = stOf(n.id); if (s === 'read') c.read++; else { if (live(n, now)) c.unread++; if (s === 'later') c.later++; } });
      return c;
    }
    function isRead(id) { return stOf(id) === 'read'; }
    function paintBadge() {
      var c = counts(), b = $('notifBadge'), bell = $('notifBell'); if (!b || !bell) return;
      b.textContent = c.unread > 99 ? '99+' : String(c.unread); b.hidden = c.unread === 0;
      bell.setAttribute('aria-label', 'الإشعارات' + (c.unread ? ' — ' + c.unread + ' غير مقروء' : ''));
      if (openState) renderPanel();
    }
    function filterFor(t) {
      var now = Date.now();
      return listAll().filter(function (n) {
        var s = stOf(n.id);
        if (t === 'unread') return s !== 'read' && live(n, now);
        if (t === 'later') return s === 'later';
        if (t === 'read') return s === 'read';
        return true;
      });
    }
    function linkHtml(n) {
      if (!n.link) return '';
      if (n.link.indexOf('https://') === 0) return '<a class="nb-open" href="' + esc(n.link) + '" target="_blank" rel="noopener noreferrer">فتح الرابط</a>';
      return PAGE_IDS.indexOf(n.link) !== -1 ? '<button type="button" class="nb-open" data-go="' + esc(n.link) + '">فتح الصفحة</button>' : '';
    }
    function renderPanel() {
      var c = counts();
      $('notifSub').textContent = c.unread ? (c.unread + ' غير مقروء') : 'لا توجد إشعارات غير مقروءة';
      document.querySelectorAll('.notif-tab').forEach(function (t) {
        var k = t.getAttribute('data-tab'); t.querySelector('b').textContent = c[k]; var on = k === tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var items = filterFor(tab), box = $('notifList'), now = Date.now();
      if (!items.length) { box.innerHTML = '<p class="notif-empty">' + ({ all: 'لا توجد إشعارات.', unread: 'لا توجد إشعارات غير مقروءة.', later: 'لا توجد إشعارات محفوظة للقراءة لاحقًا.', read: 'لا يوجد سجل مقروء بعد.' }[tab]) + '</p>'; return; }
      box.innerHTML = items.map(function (n) {
        var s = stOf(n.id), chip = s === 'read' ? ['مقروء', 'read'] : (s === 'later' ? ['للقراءة لاحقًا', 'later'] : ['جديد', 'new']);
        var exp = !!expanded[n.id], expired = !live(n, now);
        return '<article class="nitem st-' + chip[1] + (exp ? ' open' : '') + '" data-id="' + esc(n.id) + '"><div class="nitem-top"><span class="nchip ' + chip[1] + '">' + chip[0] + '</span>' + (expired ? '<span class="nchip exp">منتهٍ</span>' : '') + '<time>' + esc(msOf(n.startAt) ? fmtDT(msOf(n.startAt)) : '') + '</time></div>' +
          '<h3 class="nitem-title"><button type="button" class="nitem-toggle" aria-expanded="' + exp + '">' + esc(n.title) + '</button></h3>' +
          '<p class="nitem-body">' + esc(n.body) + '</p>' +
          '<p class="nitem-from">من: <strong>' + esc((n.issuer ? n.issuer + ' — ' : '') + (n.issuerName || '')) + '</strong></p>' +
          '<div class="nitem-actions">' + (s !== 'read' ? '<button type="button" class="nb nb-read" data-a="read">قرأت</button>' : '') + (s === 'new' ? '<button type="button" class="nb nb-later" data-a="later">أقرأها لاحقًا</button>' : '') + linkHtml(n) + '</div></article>';
      }).join('');
    }
    function setState(id, status) {
      if (!activeUser()) { toast('حسابك قيد المراجعة؛ لا يمكن حفظ حالة الإشعارات بعد.', 'warning'); return Promise.resolve(); }
      return db.collection('users').doc(uid).collection('notificationStates').doc(id).set({ status: status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(function (e) { toast('تعذّر حفظ حالة الإشعار (' + (e && e.code || 'خطأ') + ').', 'error'); });
    }
    function open() {
      lastFocus = document.activeElement; openState = true; $('notifOverlay').hidden = false; document.body.classList.add('notif-open'); $('notifBell').setAttribute('aria-expanded', 'true'); renderPanel(); $('notifClose').focus();
    }
    function close() { openState = false; $('notifOverlay').hidden = true; document.body.classList.remove('notif-open'); $('notifBell').setAttribute('aria-expanded', 'false'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
    function stop() { if (unsubN) unsubN(); if (unsubS) unsubS(); unsubN = unsubS = null; clearInterval(timer); notices = []; states = {}; }
    function start(user) {
      stop(); uid = user ? user.uid : null; var bell = $('notifBell');
      if (!uid) { if (bell) bell.hidden = true; if (openState) close(); return; }
      bell.hidden = false;
      // تحديث لحظي بدون إعادة تحميل الصفحة
      unsubN = db.collection('siteNotifications').where('published', '==', true).onSnapshot(function (snap) {
        notices = []; snap.forEach(function (d) { var x = d.data(); x.id = d.id; notices.push(x); }); paintBadge();
      }, function (e) { console.warn('[Scout Elwihda] notifications listener:', e && e.code); });
      unsubS = db.collection('users').doc(uid).collection('notificationStates').onSnapshot(function (snap) {
        states = {}; snap.forEach(function (d) { states[d.id] = d.data(); }); paintBadge();
      }, function (e) { console.warn('[Scout Elwihda] states listener:', e && e.code); });
      timer = setInterval(paintBadge, 60000);   // إشعار تبدأ مدته/تنتهي أثناء الجلسة
    }
    function init() {
      var bell = $('notifBell'); if (!bell) return;
      bell.addEventListener('click', function () { if (openState) close(); else open(); });
      $('notifClose').addEventListener('click', close);
      $('notifOverlay').addEventListener('click', function (e) { if (e.target === $('notifOverlay')) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openState) close(); });
      document.querySelectorAll('.notif-tab').forEach(function (t) { t.addEventListener('click', function () { tab = t.getAttribute('data-tab'); renderPanel(); $('notifList').scrollTop = 0; }); });
      $('notifList').addEventListener('click', function (e) {
        var item = e.target.closest('.nitem'); if (!item) return; var id = item.getAttribute('data-id');
        var a = e.target.closest('[data-a]'), g = e.target.closest('[data-go]');
        if (a) { var act = a.getAttribute('data-a'); a.disabled = true; setState(id, act === 'read' ? 'read' : 'later'); return; }
        if (g) { var pid = g.getAttribute('data-go'); close(); if (window.showPage) showPage(pid); return; }
        if (e.target.closest('.nitem-toggle')) { expanded[id] = !expanded[id]; item.classList.toggle('open', !!expanded[id]); e.target.closest('.nitem-toggle').setAttribute('aria-expanded', String(!!expanded[id])); }
      });
      auth.onAuthStateChanged(start);
    }
    return { init: init, isRead: isRead, counts: counts, open: open, close: close };
  })();

  /* =========================================================
     3) أقسام الإعدادات
     ========================================================= */
  function initSettings() {
    var menu = $('settingsMenu'); if (!menu) return;
    function openSection(sec, noHash) {
      var panels = document.querySelectorAll('.set-panel'), found = false;
      panels.forEach(function (p) { var on = p.getAttribute('data-sec') === sec; p.hidden = !on; if (on) found = true; });
      menu.hidden = found;
      if (found) { var h = document.querySelector('.set-panel:not([hidden]) .set-title'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } window.scrollTo({ top: 0, behavior: 'auto' }); }
      if (!noHash) { try { history.pushState(null, '', found ? '#settings-' + sec : '#settings-page'); } catch (e) {} }
    }
    V6.openSection = function (s) { openSection(s, true); };
    // الضغط على «الإعدادات» في الشريط الجانبي يعيدك دائمًا إلى قائمة الأقسام
    var navSet = document.querySelector('#navMenu .nav-group-btn[data-page="settings-page"]');
    if (navSet) navSet.addEventListener('click', function () { openSection('', true); });
    menu.addEventListener('click', function (e) { var t = e.target.closest('[data-sec]'); if (t) openSection(t.getAttribute('data-sec')); });
    document.querySelectorAll('.set-back').forEach(function (b) { b.addEventListener('click', function () { openSection('', false); }); });
    // رجوع/تقدم المتصفح + روابط مباشرة #settings-<قسم>
    function fromHash() {
      var h = String(location.hash || '').replace('#', '');
      if (h.indexOf('settings-') === 0 && h !== 'settings-page') { var sec = h.slice(9); if (document.querySelector('.set-panel[data-sec="' + sec + '"]')) { if (!$('settings-page').classList.contains('active-page')) showPage('settings-page', { noHistory: true }); openSection(sec, true); } }
      else if (h === 'settings-page') openSection('', true);
    }
    window.addEventListener('hashchange', fromHash);
    setTimeout(fromHash, 900);
    // الخصوصية
    function setPref(path, val, msgId, okText) {
      var m = (window.V5 && V5.me) || {}; if (!m.uid || !m.data) return;
      if (m.data.accountStatus !== 'active') { var el = $(msgId); if (el) { el.textContent = 'حسابك غير نشط بعد.'; el.classList.add('bad'); } return; }
      var prefs = Object.assign({}, m.data.prefs || {}); prefs[path] = val;
      db.collection('users').doc(m.uid).update({ prefs: prefs, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).then(function () { m.data.prefs = prefs; var el = $(msgId); if (el) { el.textContent = okText; el.classList.remove('bad'); } })
        .catch(function (er) { var el = $(msgId); if (el) { el.textContent = 'تعذّر الحفظ (' + (er && er.code || 'خطأ') + ').'; el.classList.add('bad'); } });
    }
    document.querySelectorAll('input[name=prvName]').forEach(function (r) { r.addEventListener('change', function () { setPref('commentName', r.value, 'privacyMsg', 'تم حفظ إعداد الخصوصية.'); }); });
    var pp = $('prefNoticePopup'); if (pp) pp.addEventListener('change', function () { setPref('noticePopup', pp.checked, 'prefNoticeMsg', 'تم حفظ الإعداد.'); });
    V6.syncPrefs = function () {
      var m = (window.V5 && V5.me) || {}, p = (m.data && m.data.prefs) || {};
      document.querySelectorAll('input[name=prvName]').forEach(function (r) { r.checked = r.value === (p.commentName || 'full'); });
      if (pp) pp.checked = p.noticePopup !== false;
    };
    var pr = $('cardPrintBtn'); if (pr) pr.addEventListener('click', function () { document.body.classList.add('printing-card'); setTimeout(function () { window.print(); }, 50); });
    window.addEventListener('afterprint', function () { document.body.classList.remove('printing-card'); });
    // عند تغيّر بيانات الحساب
    var iv = setInterval(function () { if (window.V5 && V5.me && V5.me.data) { V6.syncPrefs(); } }, 1500); setTimeout(function () { clearInterval(iv); }, 12000);
    if (window.auth) auth.onAuthStateChanged(function () { setTimeout(V6.syncPrefs, 800); });
  }

  /* =========================================================
     4) صفحة الوحدة: رجوع وروابط عميقة #unit-<id>
     ========================================================= */
  function initUnitPage() {
    var back = $('unitBackBtn');
    if (back) back.addEventListener('click', function () {
      // نعود لصفحة الوحدات دون إضافة مداخل جديدة إن أمكن
      if (window.history.length > 1 && /^#unit-/.test(location.hash)) history.back(); else showPage('units-page');
    });
    function openFromHash(retries) {
      var h = String(location.hash || ''); if (h.indexOf('#unit-') !== 0 || h === '#unit-detail-page') return;
      var id = h.slice(6);
      if (window.V3 && V3.unitsReady && V3.unitsReady()) {
        if (V3.getUnit(id)) { V3.openUnitDetail(id, true); showPage('unit-detail-page', { noHistory: true }); try { history.replaceState(null, '', '#unit-' + id); } catch (e) {} }
        else { showPage('units-page', { noHistory: true }); toast('هذه الوحدة غير متاحة حالياً.', 'warning'); }
      } else if (retries > 0) setTimeout(function () { openFromHash(retries - 1); }, 300);
    }
    window.addEventListener('hashchange', function () { openFromHash(0); });
    openFromHash(40);
  }

  /* =========================================================
     5) تشخيص رفع الصور (يكشف سبب فشل الرفع على موقعك)
     ========================================================= */
  V6.diagUpload = function () {
    var out = [];
    function line(ok, t) { out.push((ok === true ? '✔ ' : ok === false ? '✘ ' : '• ') + t); }
    return ensureGoogleDriveConfigLoaded().then(function (cfg) {
      if (!cfg || !cfg.webAppUrl) { line(false, 'رابط Apps Script غير مضبوط في «الإعدادات ← Google Drive».'); return out; }
      line(true, 'رابط Apps Script مضبوط.');
      return fetch(cfg.webAppUrl.trim(), { method: 'GET' }).then(function (r) { return r.text(); }).then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!j) line(false, 'الرابط لا يُرجع JSON: السكربت غير منشور كتطبيق ويب بصلاحية «أي شخص» أو لم تُنشر نسخة جديدة.');
        else if (!j.version || j.version < 2) line(false, 'إصدار Apps Script قديم (يجب 2 أو أعلى). الصق الكود المحدّث وانشر «إصدار جديد».');
        else line(true, 'Apps Script يعمل (الإصدار ' + j.version + ').');
      }).catch(function (e) { line(false, 'تعذّر الاتصال بالرابط: ' + (e && e.message) + ' (CORS/نشر/إنترنت).'); }).then(function () { return out; });
    });
  };

  /* =========================================================
     التهيئة
     ========================================================= */
  function init() {
    initVersion(); SEBell.init(); initSettings(); initUnitPage();
    // تشخيص الرفع ضمن تشخيص الوحدات
    if (window.V5 && V5.runUnitsDiagnostics && !V5.__ext) {
      var orig = V5.runUnitsDiagnostics; V5.__ext = true;
      V5.runUnitsDiagnostics = function () { orig(); setTimeout(function () { V6.diagUpload().then(function (l) { var o = $('unitsDiagOut'); if (o) o.textContent += '\n' + l.join('\n'); }); }, 2500); };
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
