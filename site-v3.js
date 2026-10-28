/* =========================================================
   site-v3.js — يُحمَّل بعد script.js و site-extras.js
   شاشة الترحيب، القائمة الجانبية، الوحدات الكشفية، النشاطات،
   التجمع القادم، تصفية الإعلانات، إدارة الوحدات والنشاطات.
   كل نص قادم من Firestore يمر عبر escHtml/safeImgUrl.
   ========================================================= */
(function () {
  'use strict';

  var V3 = window.V3 = {};
  var unitsCache = [];          // وحدات نشطة (عامة)
  var unitsLoaded = false;
  var activitiesCache = [];     // نشاطات منشورة (عامة)
  var activitiesLoaded = false;
  var bulletinFilter = 'all';
  var detailSortDesc = false;

  var KIND_LABELS = { gathering: 'تجمع كشفي', camp: 'مخيم', trip: 'رحلة', weekly: 'نشاط أسبوعي', other: 'نشاط' };
  var DEFAULT_UNITS = ['وحدة الشبل المبتدئ', 'وحدة الكشاف ألف', 'وحدة الكشاف باء', 'وحدة الكشاف المتقدم', 'عشيرة الجوالة', 'التداريب والإعداد'];

  function $(id) { return document.getElementById(id); }
  function notify(msg, type) { if (typeof showAdminNotification === 'function') showAdminNotification(msg, type || 'info'); }
  function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function imgPath(kind, name) {
    if (!name || typeof resolveLocalImagePath !== 'function') return '';
    return safeImgUrl(resolveLocalImagePath(kind, name));
  }
  function millis(ts) { return ts && ts.toMillis ? ts.toMillis() : (ts && ts.toDate ? ts.toDate().getTime() : null); }
  function fmtDate(ms) {
    if (ms == null) return '';
    try { return new Date(ms).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return ''; }
  }
  function fmtTime(ms) {
    if (ms == null) return '';
    try { return new Date(ms).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function stateBox(msg, icon) {
    return '<div class="news-state-box">' + (icon ? '<i class="fa-solid ' + icon + '" aria-hidden="true"></i> ' : '') + escHtml(msg) + '</div>';
  }

  /* المقدمة والقائمة الجانبية وتنقل الواجهات: انتقلت إلى site-v4.js */
  function renderNavUnits() {
    var ul = $('navUnitsSub');
    if (!ul) return;
    if (!unitsLoaded) return;
    if (!unitsCache.length) { ul.innerHTML = '<li><span class="nav-sub-note">لا توجد وحدات منشورة حالياً (قيد التطوير)</span></li>'; return; }
    ul.innerHTML = unitsCache.map(function (u) {
      return '<li><button type="button" class="nav-sub-btn" data-page="units-page" data-unit="' + escHtml(u.id) + '">' + escHtml(u.name) + '</button></li>';
    }).join('');
  }

  /* ---------------- تصفية الإعلانات ---------------- */
  var GENERAL = ['official', '', 'upcoming'];
  V3.setBulletinFilter = function (f) {
    bulletinFilter = f || 'all';
    document.querySelectorAll('#bulletinFilters .gallery-filter-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-bfilter') === bulletinFilter);
    });
    V3.applyBulletinFilter();
  };
  V3.applyBulletinFilter = function () {
    var cards = document.querySelectorAll('#publicAnnouncementsContainer .public-announcement-card');
    var shown = 0;
    cards.forEach(function (c) {
      var cat = c.getAttribute('data-category') || '';
      var ok = bulletinFilter === 'all'
        || (bulletinFilter === 'general' && GENERAL.indexOf(cat) !== -1)
        || (bulletinFilter === 'scout_gathering' && (cat === 'scout_gathering' || cat === 'gathering'))
        || (bulletinFilter === 'weekly' && (cat === 'weekly' || cat === 'unit'))
        || cat === bulletinFilter;
      c.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    var empty = $('bulletinFilterEmpty');
    if (empty) empty.style.display = (cards.length > 0 && shown === 0) ? 'block' : 'none';
  };

  /* ---------------- تحميل الوحدات والنشاطات (عام) ---------------- */
  function loadUnits() {
    return db.collection('units').where('status', '==', 'active').get().then(function (snap) {
      unitsCache = [];
      snap.forEach(function (d) { var x = d.data(); x.id = d.id; unitsCache.push(x); });
      unitsCache.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      unitsLoaded = true;
    }).catch(function (e) {
      unitsLoaded = true; unitsCache = [];
      console.warn('[Scout Elwihda] units load failed:', e && e.code);
      V3.unitsError = true;
    }).then(function () { renderUnitsGrid(); renderNavUnits(); fillRegistrationUnits(); });
  }
  function loadActivities() {
    return db.collection('activities').where('status', '==', 'published').get().then(function (snap) {
      activitiesCache = [];
      snap.forEach(function (d) { var x = d.data(); x.id = d.id; activitiesCache.push(x); });
      activitiesLoaded = true;
    }).catch(function (e) {
      activitiesLoaded = true; activitiesCache = []; V3.activitiesError = true;
      console.warn('[Scout Elwihda] activities load failed:', e && e.code);
    }).then(function () { renderNextActivity(); renderRecentActivities(); });
  }

  V3.unitLabel = function (u) {
    if (u && u.unitId) {
      for (var i = 0; i < unitsCache.length; i++) if (unitsCache[i].id === u.unitId) return unitsCache[i].name;
    }
    return (u && u.unit) || '';
  };

  /* ---------------- صفحة الوحدات ---------------- */
  function renderUnitsGrid() {
    var grid = $('unitsGrid');
    if (!grid) return;
    if (V3.unitsError) { grid.innerHTML = stateBox('تعذّر تحميل الوحدات حالياً. حاول تحديث الصفحة بعد قليل.', 'fa-triangle-exclamation'); return; }
    if (!unitsCache.length) { grid.innerHTML = stateBox('لا توجد وحدات منشورة حالياً — قيد التطوير.', 'fa-hourglass-half'); return; }
    var colors = ['amber', 'green', 'red', 'blue'];
    grid.innerHTML = unitsCache.map(function (u, i) {
      var img = imgPath('units', u.imageName);
      var pub = u.pub || {};
      return '<div class="unit-card v3-unit-card hover-lift">' +
        (img ? '<img class="v3-unit-img" src="' + escHtml(img) + '" alt="' + escHtml(u.name) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
        '<div class="unit-badge ' + colors[i % 4] + '">' + escHtml(u.name) + '</div>' +
        '<p>' + (u.description ? escHtml(u.description) : 'سيتم توفير وصف الوحدة قريباً.') + '</p>' +
        (typeof u.scoutCount === 'number' ? '<p class="v3-meta"><i class="fa-solid fa-user-group" aria-hidden="true"></i> عدد الكشافين: ' + u.scoutCount + '</p>' : '') +
        (pub.leaderName ? '<p class="v3-meta"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> القائد: ' + escHtml(pub.leaderName) + '</p>' : '') +
        '<button type="button" class="v3-btn" data-unit="' + escHtml(u.id) + '">عرض التفاصيل</button></div>';
    }).join('');
    grid.querySelectorAll('[data-unit]').forEach(function (b) { b.addEventListener('click', function () { V3.openUnitDetail(b.getAttribute('data-unit')); }); });
  }

  function activityCardHtml(a, withUnit) {
    var ms = millis(a.startAt);
    var img = imgPath('activities', a.imageName);
    return '<article class="news-card v3-act-card">' +
      (img ? '<img class="news-card-img" src="' + escHtml(img) + '" alt="' + escHtml(a.title) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
      '<div class="news-card-body"><div class="news-card-meta"><span class="news-category-badge">' + escHtml(KIND_LABELS[a.kind] || 'نشاط') + '</span> <span class="news-date">' + escHtml(fmtDate(ms)) + '</span></div>' +
      '<h3>' + escHtml(a.title) + '</h3>' +
      (a.location ? '<p class="v3-meta"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + escHtml(a.location) + '</p>' : '') +
      '<button type="button" class="v3-btn" data-act="' + escHtml(a.id) + '">عرض التفاصيل</button></div></article>';
  }
  function bindActButtons(root) {
    root.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function () { V3.openActivityDetail(b.getAttribute('data-act')); }); });
  }

  V3.openUnitDetail = function (id) {
    var u = unitsCache.filter(function (x) { return x.id === id; })[0];
    if (!u) { notify('تعذّر العثور على هذه الوحدة.', 'error'); return; }
    var pub = u.pub || {};
    var img = imgPath('units', u.imageName);
    var rows = [];
    function row(label, val) { if (val) rows.push('<li><strong>' + escHtml(label) + ':</strong> ' + escHtml(val) + '</li>'); }
    row('قائد الوحدة', pub.leaderName); row('هاتف القائد', pub.leaderPhone); row('بريد القائد', pub.leaderEmail);
    row('نائب العريف / المسؤول الثاني', pub.secondName); row('هاتف المسؤول الثاني', pub.secondPhone);
    row('العريف الأول', pub.firstName); row('الاتصال بالعريف الأول', pub.firstContact);
    var staffHtml = rows.length ? '<ul class="v3-list">' + rows.join('') + '</ul>' : '<p class="v3-muted">سيتم توفير معلومات المسؤولين قريباً.</p>';
    var acts = activitiesCache.filter(function (a) { return a.unitId === id; });
    var now = Date.now();
    var up = acts.filter(function (a) { return (millis(a.startAt) || 0) >= now; });
    var past = acts.filter(function (a) { return (millis(a.startAt) || 0) < now; });
    function sorter(a, b) { var d = (millis(a.startAt) || 0) - (millis(b.startAt) || 0); return detailSortDesc ? -d : d; }
    up.sort(sorter); past.sort(function (a, b) { var d = (millis(a.startAt) || 0) - (millis(b.startAt) || 0); return detailSortDesc ? d : -d; });
    var body = $('unitDetailBody');
    body.innerHTML = (img ? '<img class="v3-detail-img" src="' + escHtml(img) + '" alt="' + escHtml(u.name) + '" onerror="this.style.display=\'none\'">' : '') +
      '<h2 id="unitDetailTitle">' + escHtml(u.name) + '</h2>' +
      '<p>' + (u.description ? escHtml(u.description) : 'سيتم توفير وصف الوحدة قريباً.') + '</p>' +
      (typeof u.scoutCount === 'number' ? '<p class="v3-meta"><i class="fa-solid fa-user-group" aria-hidden="true"></i> عدد الكشافين: ' + u.scoutCount + '</p>' : '') +
      '<h3 class="v3-sub-title">المسؤولون</h3>' + staffHtml +
      '<div class="v3-sort-row"><h3 class="v3-sub-title">النشاطات القادمة</h3><button type="button" class="v3-btn v3-btn-small" id="unitSortBtn">' + (detailSortDesc ? 'الأحدث أولاً' : 'الأقرب أولاً') + ' ⇅</button></div>' +
      (up.length ? '<div class="news-grid">' + up.map(function (a) { return activityCardHtml(a); }).join('') + '</div>' : '<p class="v3-muted">لا توجد نشاطات قادمة معلنة حالياً.</p>') +
      '<h3 class="v3-sub-title">النشاطات السابقة</h3>' +
      (past.length ? '<div class="news-grid">' + past.map(function (a) { return activityCardHtml(a); }).join('') + '</div>' : '<p class="v3-muted">لا توجد نشاطات سابقة منشورة.</p>') +
      '<p class="v3-muted">صور النشاطات وتقاريرها المرتبطة: قيد التطوير.</p>';
    bindActButtons(body);
    var sb = $('unitSortBtn'); if (sb) sb.addEventListener('click', function () { detailSortDesc = !detailSortDesc; V3.openUnitDetail(id); });
    openModal('unitDetailModal');
  };

  V3.openActivityDetail = function (id) {
    var a = activitiesCache.filter(function (x) { return x.id === id; })[0];
    if (!a) { notify('تعذّر العثور على هذا النشاط.', 'error'); return; }
    var ms = millis(a.startAt), img = imgPath('activities', a.imageName);
    var unit = a.unitId ? unitsCache.filter(function (u) { return u.id === a.unitId; })[0] : null;
    $('activityDetailBody').innerHTML = (img ? '<img class="v3-detail-img" src="' + escHtml(img) + '" alt="' + escHtml(a.title) + '" onerror="this.style.display=\'none\'">' : '') +
      '<span class="news-category-badge">' + escHtml(KIND_LABELS[a.kind] || 'نشاط') + '</span>' +
      '<h2 id="activityDetailTitle">' + escHtml(a.title) + '</h2>' +
      '<ul class="v3-list"><li><i class="fa-solid fa-calendar" aria-hidden="true"></i> ' + escHtml(fmtDate(ms)) + ' — ' + escHtml(fmtTime(ms)) + '</li>' +
      (a.location ? '<li><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + escHtml(a.location) + '</li>' : '') +
      (unit ? '<li><i class="fa-solid fa-people-group" aria-hidden="true"></i> ' + escHtml(unit.name) + '</li>' : '') + '</ul>' +
      '<p class="v3-pre">' + (a.description ? escHtml(a.description) : 'سيتم توفير التفاصيل قريباً.') + '</p>';
    openModal('activityDetailModal');
  };

  /* ---------------- الصفحة الرئيسية: التجمع القادم + آخر الأنشطة ---------------- */
  function renderNextActivity() {
    ['nextActivityBox', 'gatheringPageBox'].forEach(function (id) { renderNextActivityInto($(id), id === 'gatheringPageBox'); });
  }
  function renderNextActivityInto(box, full) {
    if (!box) return;
    if (V3.activitiesError) { box.innerHTML = stateBox('تعذّر تحميل النشاط القادم حالياً.', 'fa-triangle-exclamation'); return; }
    var now = Date.now();
    var up = activitiesCache.filter(function (a) { return (millis(a.startAt) || 0) >= now; })
      .sort(function (a, b) { return millis(a.startAt) - millis(b.startAt); });
    if (!up.length) { box.innerHTML = '<div class="news-state-box">لا يوجد تجمع كشفي قادم معلن حاليًا. تابعوا الإعلانات لمعرفة المواعيد الجديدة.</div>'; return; }
    var a = up[0], ms = millis(a.startAt), img = imgPath('activities', a.imageName);
    var desc = a.description ? (full || a.description.length <= 160 ? a.description : a.description.slice(0, 160) + '…') : '';
    box.innerHTML = '<div class="v3-next-card">' +
      (img ? '<img class="v3-next-img" src="' + escHtml(img) + '" alt="' + escHtml(a.title) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
      '<div class="v3-next-body"><span class="news-category-badge">' + escHtml(KIND_LABELS[a.kind] || 'نشاط') + '</span>' +
      '<h3>' + escHtml(a.title) + '</h3>' +
      '<p class="v3-meta"><i class="fa-solid fa-calendar" aria-hidden="true"></i> ' + escHtml(fmtDate(ms)) + ' — ' + escHtml(fmtTime(ms)) + '</p>' +
      (a.location ? '<p class="v3-meta"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + escHtml(a.location) + '</p>' : '') +
      (desc ? '<p' + (full ? ' class="v3-pre"' : '') + '>' + escHtml(desc) + '</p>' : '') +
      '<button type="button" class="v3-btn" data-act="' + escHtml(a.id) + '">عرض التفاصيل</button></div></div>';
    bindActButtons(box);
  }
  function renderRecentActivities() {
    var box = $('recentActivitiesBox');
    if (!box) return;
    if (V3.activitiesError) { box.innerHTML = stateBox('تعذّر تحميل الأنشطة حالياً.', 'fa-triangle-exclamation'); return; }
    var now = Date.now();
    var past = activitiesCache.filter(function (a) { return (millis(a.startAt) || 0) < now; })
      .sort(function (a, b) { return millis(b.startAt) - millis(a.startAt); }).slice(0, 3);
    if (!past.length) { box.innerHTML = stateBox('لا توجد أنشطة سابقة منشورة بعد.'); return; }
    box.innerHTML = past.map(function (a) { return activityCardHtml(a); }).join('');
    bindActButtons(box);
  }

  /* ---------------- نموذج التسجيل ---------------- */
  function fillRegistrationUnits() {
    var sel = $('scoutParentUnit'), hint = $('scoutParentUnitHint');
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '';
    var first = document.createElement('option');
    first.value = ''; first.disabled = true; first.selected = true;
    if (!unitsCache.length) {
      first.textContent = V3.unitsError ? 'تعذّر تحميل الوحدات' : 'لا توجد وحدات متاحة حالياً';
      sel.appendChild(first);
      sel.disabled = true;
      if (hint) { hint.style.display = 'block'; hint.textContent = 'التسجيل غير متاح مؤقتاً: لم تُنشر الوحدات بعد. تواصل مع إدارة الفوج.'; }
      return;
    }
    first.textContent = 'اختر الوحدة';
    sel.appendChild(first);
    unitsCache.forEach(function (u) {
      var o = document.createElement('option');
      o.value = u.id; o.textContent = u.name; o.dataset.name = u.name;
      sel.appendChild(o);
    });
    sel.disabled = false;
    if (hint) hint.style.display = 'none';
    if (prev) sel.value = prev;
  }

  /* ---------------- إدارة الوحدات (أدمن) ---------------- */
  var adminUnits = [], adminActs = [], editingUnitId = null, editingActId = null;
  function adminMsg(t, ok) { var m = $('unitsAdminMsg'); if (m) { m.textContent = t || ''; m.style.color = ok ? '#4ade80' : ''; } }
  function isAdminNow() { return typeof currentUserRole !== 'undefined' && currentUserRole === 'admin'; }

  V3.loadAdminUnits = function () {
    if (!isAdminNow()) { adminMsg('هذه الصفحة للأدمن فقط.'); return; }
    Promise.all([db.collection('units').get(), db.collection('activities').get()]).then(function (r) {
      adminUnits = []; adminActs = [];
      r[0].forEach(function (d) { var x = d.data(); x.id = d.id; adminUnits.push(x); });
      r[1].forEach(function (d) { var x = d.data(); x.id = d.id; adminActs.push(x); });
      adminUnits.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      adminActs.sort(function (a, b) { return (millis(b.startAt) || 0) - (millis(a.startAt) || 0); });
      renderAdminUnits(); renderAdminActs(); adminMsg('');
    }).catch(function (e) {
      console.error('[Scout Elwihda] admin units load', e && e.code);
      adminMsg(e && e.code === 'permission-denied' ? 'رُفض الوصول من قواعد Firestore. تأكد من نشر القواعد الجديدة.' : 'تعذّر تحميل البيانات. تحقق من الاتصال.');
    });
  };

  function renderAdminUnits() {
    var box = $('unitsAdminList');
    if (!adminUnits.length) { box.innerHTML = '<p class="v3-muted">لا توجد وحدات بعد. استخدم «إضافة وحدة» أو «إضافة الوحدات المقترحة».</p>'; return; }
    box.innerHTML = adminUnits.map(function (u, i) {
      return '<div class="v3-admin-row" data-id="' + escHtml(u.id) + '"><div class="v3-admin-info"><strong>' + escHtml(u.name) + '</strong> ' +
        '<span class="v3-chip ' + (u.status === 'active' ? 'on' : 'off') + '">' + (u.status === 'active' ? 'نشطة' : 'مؤرشفة') + '</span>' +
        (typeof u.scoutCount === 'number' ? ' <span class="v3-muted">(' + u.scoutCount + ' كشاف)</span>' : '') + '</div>' +
        '<div class="v3-admin-btns">' +
        '<button type="button" data-a="up" ' + (i === 0 ? 'disabled' : '') + ' aria-label="رفع">↑</button>' +
        '<button type="button" data-a="down" ' + (i === adminUnits.length - 1 ? 'disabled' : '') + ' aria-label="خفض">↓</button>' +
        '<button type="button" data-a="toggle">' + (u.status === 'active' ? 'إخفاء' : 'تفعيل') + '</button>' +
        '<button type="button" data-a="edit">تعديل</button>' +
        '<button type="button" data-a="del" class="danger">حذف</button></div></div>';
    }).join('');
    box.querySelectorAll('.v3-admin-row').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () { unitAction(id, b.getAttribute('data-a')); });
      });
    });
    // خيارات قائمة نموذج النشاط
    var sel = $('actUnit');
    if (sel) {
      var cur = sel.value;
      sel.innerHTML = '<option value="">نشاط عام للفوج</option>' + adminUnits.map(function (u) { return '<option value="' + escHtml(u.id) + '">' + escHtml(u.name) + '</option>'; }).join('');
      sel.value = cur;
    }
  }

  function unitAction(id, act) {
    var idx = adminUnits.findIndex(function (u) { return u.id === id; });
    if (idx < 0) return;
    var u = adminUnits[idx];
    if (act === 'edit') return V3.openUnitForm(id);
    if (act === 'toggle') {
      return db.collection('units').doc(id).update({ status: u.status === 'active' ? 'archived' : 'active', updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () { notify('تم تحديث حالة الوحدة.', 'success'); V3.loadAdminUnits(); loadUnits(); })
        .catch(function (e) { notify('تعذّر التحديث: ' + (e && e.code || ''), 'error'); });
    }
    if (act === 'up' || act === 'down') {
      var j = act === 'up' ? idx - 1 : idx + 1;
      if (j < 0 || j >= adminUnits.length) return;
      var other = adminUnits[j];
      var b = db.batch();
      b.update(db.collection('units').doc(u.id), { order: j + 1 });
      b.update(db.collection('units').doc(other.id), { order: idx + 1 });
      // نعيد ترقيم الجميع لضمان تسلسل صحيح
      return b.commit().then(function () { V3.loadAdminUnits(); loadUnits(); })
        .catch(function (e) { notify('تعذّر الترتيب: ' + (e && e.code || ''), 'error'); });
    }
    if (act === 'del') {
      Promise.all([
        db.collection('users').where('unitId', '==', id).limit(1).get(),
        db.collection('activities').where('unitId', '==', id).limit(1).get()
      ]).then(function (r) {
        if (!r[0].empty || !r[1].empty) { notify('لا يمكن حذف وحدة مرتبطة بكشافين أو نشاطات. أرشفها (إخفاء) بدلاً من ذلك.', 'warning'); return; }
        if (!window.confirm('حذف الوحدة «' + u.name + '» نهائياً؟')) return;
        var b2 = db.batch();
        b2.delete(db.collection('units').doc(id));
        b2.delete(db.collection('unitPrivate').doc(id));
        return b2.commit().then(function () { notify('تم حذف الوحدة.', 'success'); V3.loadAdminUnits(); loadUnits(); });
      }).catch(function (e) { notify('تعذّر الحذف: ' + (e && e.code || ''), 'error'); });
    }
  }

  V3.openUnitForm = function (id) {
    editingUnitId = id || null;
    $('unitFormError').textContent = '';
    $('unitFormTitle').textContent = id ? 'تعديل وحدة' : 'إضافة وحدة';
    var u = id ? adminUnits.filter(function (x) { return x.id === id; })[0] : null;
    function set(i, v) { $(i).value = v || ''; }
    set('unitName', u && u.name); set('unitDesc', u && u.description); set('unitImageName', u && u.imageName);
    $('unitStatus').value = (u && u.status) || 'active';
    $('unitPublishNames').checked = !!(u && u.publishNames);
    $('unitPublishContacts').checked = !!(u && u.publishContacts);
    ['unitLeaderName', 'unitLeaderEmail', 'unitLeaderPhone', 'unitSecondName', 'unitSecondPhone', 'unitFirstName', 'unitFirstContact'].forEach(function (k) { set(k, ''); });
    openModal('unitFormModal');
    if (id) {
      db.collection('unitPrivate').doc(id).get().then(function (d) {
        var p = d.exists ? d.data() : {};
        set('unitLeaderName', p.leaderName); set('unitLeaderEmail', p.leaderEmail); set('unitLeaderPhone', p.leaderPhone);
        set('unitSecondName', p.secondName); set('unitSecondPhone', p.secondPhone);
        set('unitFirstName', p.firstName); set('unitFirstContact', p.firstContact);
      }).catch(function () { $('unitFormError').textContent = 'تعذّر تحميل بيانات المسؤولين الخاصة.'; });
    }
  };

  function initUnitForm() {
    var f = $('unitForm');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!isAdminNow()) return;
      var err = $('unitFormError'); err.textContent = '';
      var name = $('unitName').value.trim();
      if (!name || name.length > 80) { err.textContent = 'اسم الوحدة مطلوب (80 حرفاً كحد أقصى).'; return; }
      var imageName = $('unitImageName').value.trim();
      if (imageName && !imgPath('units', imageName)) { err.textContent = 'اسم ملف الصورة غير صالح (حروف لاتينية/أرقام وامتداد jpg/png/webp).'; return; }
      var emailV = $('unitLeaderEmail').value.trim();
      if (emailV && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailV)) { err.textContent = 'بريد القائد غير صحيح.'; return; }
      var priv = {
        leaderName: $('unitLeaderName').value.trim(), leaderEmail: emailV, leaderPhone: $('unitLeaderPhone').value.trim(),
        secondName: $('unitSecondName').value.trim(), secondPhone: $('unitSecondPhone').value.trim(),
        firstName: $('unitFirstName').value.trim(), firstContact: $('unitFirstContact').value.trim()
      };
      var pn = $('unitPublishNames').checked, pc = $('unitPublishContacts').checked;
      var pub = {};
      if (pn) { pub.leaderName = priv.leaderName; pub.secondName = priv.secondName; pub.firstName = priv.firstName; }
      if (pc) { pub.leaderPhone = priv.leaderPhone; pub.leaderEmail = priv.leaderEmail; pub.secondPhone = priv.secondPhone; pub.firstContact = priv.firstContact; }
      Object.keys(pub).forEach(function (k) { if (!pub[k]) delete pub[k]; });
      var ts = firebase.firestore.FieldValue.serverTimestamp();
      var data = { name: name, description: $('unitDesc').value.trim(), imageName: imageName, status: $('unitStatus').value,
        publishNames: pn, publishContacts: pc, pub: pub, updatedAt: ts };
      var btn = $('unitFormSubmit'); btn.disabled = true;
      var ref = editingUnitId ? db.collection('units').doc(editingUnitId) : db.collection('units').doc();
      if (!editingUnitId) { data.order = adminUnits.length + 1; data.createdAt = ts; }
      var b = db.batch();
      if (editingUnitId) b.update(ref, data); else b.set(ref, data);
      b.set(db.collection('unitPrivate').doc(ref.id), priv);
      b.commit().then(function () {
        closeModal('unitFormModal'); notify('تم حفظ الوحدة.', 'success'); V3.loadAdminUnits(); loadUnits();
      }).catch(function (er) { err.textContent = 'تعذّر الحفظ (' + (er && er.code || 'خطأ') + ').'; })
        .then(function () { btn.disabled = false; });
    });
  }

  V3.seedDefaultUnits = function () {
    if (!isAdminNow()) return;
    if (adminUnits.length) { notify('القائمة غير فارغة: لم يُضف شيء حتى لا تتكرر الوحدات.', 'warning'); return; }
    if (!window.confirm('إضافة الوحدات المقترحة (' + DEFAULT_UNITS.length + ')؟ يمكنك تعديل أسمائها لاحقاً بحسب التسميات الرسمية.')) return;
    var b = db.batch(), ts = firebase.firestore.FieldValue.serverTimestamp();
    DEFAULT_UNITS.forEach(function (n, i) {
      var r = db.collection('units').doc();
      b.set(r, { name: n, description: '', imageName: '', status: 'active', publishNames: false, publishContacts: false, pub: {}, order: i + 1, createdAt: ts, updatedAt: ts });
      b.set(db.collection('unitPrivate').doc(r.id), {});
    });
    b.commit().then(function () { notify('تمت إضافة الوحدات.', 'success'); V3.loadAdminUnits(); loadUnits(); })
      .catch(function (e) { notify('تعذّر الإضافة: ' + (e && e.code || ''), 'error'); });
  };

  V3.refreshScoutCounts = function () {
    if (!isAdminNow()) return;
    adminMsg('جاري الحساب...');
    db.collection('users').where('role', '==', 'scout').get().then(function (snap) {
      var counts = {};
      snap.forEach(function (d) { var x = d.data(); if (x.unitId && x.accountStatus === 'active') counts[x.unitId] = (counts[x.unitId] || 0) + 1; });
      var b = db.batch();
      adminUnits.forEach(function (u) { b.update(db.collection('units').doc(u.id), { scoutCount: counts[u.id] || 0, scoutCountUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }); });
      return b.commit();
    }).then(function () { adminMsg('تم تحديث الأعداد (حسابات الكشافين النشطة المرتبطة بمعرّف الوحدة فقط).', true); V3.loadAdminUnits(); loadUnits(); })
      .catch(function (e) { adminMsg('تعذّر التحديث: ' + (e && e.code || '')); });
  };

  /* ---------------- إدارة النشاطات (أدمن) ---------------- */
  function toLocalInput(ms) {
    if (ms == null) return '';
    var d = new Date(ms), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function renderAdminActs() {
    var box = $('activitiesAdminList');
    if (!adminActs.length) { box.innerHTML = '<p class="v3-muted">لا توجد نشاطات بعد.</p>'; return; }
    var st = { draft: 'مسودة', published: 'منشور', archived: 'مؤرشف' };
    box.innerHTML = adminActs.map(function (a) {
      var u = adminUnits.filter(function (x) { return x.id === a.unitId; })[0];
      return '<div class="v3-admin-row" data-id="' + escHtml(a.id) + '"><div class="v3-admin-info"><strong>' + escHtml(a.title) + '</strong> ' +
        '<span class="v3-chip ' + (a.status === 'published' ? 'on' : 'off') + '">' + escHtml(st[a.status] || a.status) + '</span> ' +
        '<span class="v3-muted">' + escHtml(fmtDate(millis(a.startAt))) + (u ? ' — ' + escHtml(u.name) : '') + '</span></div>' +
        '<div class="v3-admin-btns"><button type="button" data-a="edit">تعديل</button>' +
        '<button type="button" data-a="pub">' + (a.status === 'published' ? 'إلغاء النشر' : 'نشر') + '</button>' +
        '<button type="button" data-a="arch">أرشفة</button><button type="button" data-a="del" class="danger">حذف</button></div></div>';
    }).join('');
    box.querySelectorAll('.v3-admin-row').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { actAction(id, b.getAttribute('data-a')); }); });
    });
  }
  function actAction(id, act) {
    var a = adminActs.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    if (act === 'edit') return V3.openActivityForm(id);
    var ref = db.collection('activities').doc(id), ts = firebase.firestore.FieldValue.serverTimestamp();
    var p;
    if (act === 'pub') p = ref.update({ status: a.status === 'published' ? 'draft' : 'published', updatedAt: ts });
    else if (act === 'arch') p = ref.update({ status: 'archived', updatedAt: ts });
    else if (act === 'del') { if (!window.confirm('حذف النشاط «' + a.title + '» نهائياً؟')) return; p = ref.delete(); }
    p.then(function () { notify('تم تنفيذ العملية.', 'success'); V3.loadAdminUnits(); loadActivities(); })
      .catch(function (e) { notify('تعذّر التنفيذ: ' + (e && e.code || ''), 'error'); });
  }
  V3.openActivityForm = function (id) {
    editingActId = id || null;
    $('activityFormError').textContent = '';
    $('activityFormTitle').textContent = id ? 'تعديل نشاط' : 'إضافة نشاط';
    var a = id ? adminActs.filter(function (x) { return x.id === id; })[0] : null;
    $('actTitle').value = (a && a.title) || ''; $('actDesc').value = (a && a.description) || '';
    $('actKind').value = (a && a.kind) || 'gathering'; $('actUnit').value = (a && a.unitId) || '';
    $('actStart').value = a ? toLocalInput(millis(a.startAt)) : ''; $('actLocation').value = (a && a.location) || '';
    $('actImageName').value = (a && a.imageName) || ''; $('actStatus').value = (a && a.status) || 'draft';
    openModal('activityFormModal');
  };
  function initActivityForm() {
    var f = $('activityForm');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!isAdminNow()) return;
      var err = $('activityFormError'); err.textContent = '';
      var title = $('actTitle').value.trim();
      if (!title) { err.textContent = 'عنوان النشاط مطلوب.'; return; }
      var startVal = $('actStart').value;
      var startMs = startVal ? new Date(startVal).getTime() : NaN;
      if (isNaN(startMs)) { err.textContent = 'يرجى تحديد تاريخ وساعة صحيحين.'; return; }
      var imageName = $('actImageName').value.trim();
      if (imageName && !imgPath('activities', imageName)) { err.textContent = 'اسم ملف الصورة غير صالح.'; return; }
      var ts = firebase.firestore.FieldValue.serverTimestamp();
      var data = { title: title, description: $('actDesc').value.trim(), kind: $('actKind').value, unitId: $('actUnit').value || '',
        startAt: firebase.firestore.Timestamp.fromMillis(startMs), location: $('actLocation').value.trim(), imageName: imageName,
        status: $('actStatus').value, updatedAt: ts };
      var btn = $('activityFormSubmit'); btn.disabled = true;
      var p;
      if (editingActId) p = db.collection('activities').doc(editingActId).update(data);
      else { data.createdAt = ts; p = db.collection('activities').add(data); }
      p.then(function () { closeModal('activityFormModal'); notify('تم حفظ النشاط.', 'success'); V3.loadAdminUnits(); loadActivities(); })
        .catch(function (er) { err.textContent = 'تعذّر الحفظ (' + (er && er.code || 'خطأ') + ').'; })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---------------- التهيئة ---------------- */
  function init() {
    initUnitForm();
    initActivityForm();
    loadUnits();
    loadActivities();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
