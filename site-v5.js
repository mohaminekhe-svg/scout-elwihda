/* =========================================================
   site-v5.js — المنصة الرقمية والإعلامية (تُحمَّل بعد site-v4.js)
   الوحدات: SEImage (رفع صور موحّد عبر Google Apps Script الحالي) • SEViewer (عارض صور)
   SEPost (إعجاب/تفاعلات/تعليقات/حفظ) • SENotice (إشعارات الإدارة) • SEMod (إشراف)
   SEI18n (لغات) • صفحات الحساب (ملف شخصي/بطاقة/إعدادات) • تشخيص الوحدات • أدوات وقت الإعلان
   لا أسرار هنا. كل الصلاحيات تُفرض في firestore.rules؛ إخفاء الأزرار هنا للتجربة فقط.
   ========================================================= */
(function () {
  'use strict';
  var V5 = window.V5 = window.V5 || {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return (typeof escHtml === 'function') ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function notify(m, t) { if (typeof showAdminNotification === 'function') showAdminNotification(m, t || 'info'); }
  function fsv() { return firebase.firestore.FieldValue; }
  function serverTs() { return fsv().serverTimestamp(); }
  function msOf(ts) { return ts && ts.toMillis ? ts.toMillis() : (ts && ts.toDate ? ts.toDate().getTime() : null); }
  function fmtDT(ms) { try { return new Intl.DateTimeFormat('ar-DZ', { timeZone: 'Africa/Algiers', dateStyle: 'full', timeStyle: 'short' }).format(new Date(ms)); } catch (e) { return ''; } }
  function fmtD(ms) { try { return new Intl.DateTimeFormat('ar-DZ', { timeZone: 'Africa/Algiers', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(ms)); } catch (e) { return ''; } }
  function afterIntro(fn) {
    if (!document.body.classList.contains('splash-open')) return fn();
    var t = setInterval(function () { if (!document.body.classList.contains('splash-open')) { clearInterval(t); setTimeout(fn, 350); } }, 200);
  }

  /* ---------------- المستخدم الحالي ---------------- */
  var me = { uid: null, data: null };
  V5.me = me;
  function active() { return !!(me.uid && me.data && me.data.accountStatus === 'active'); }
  function isAdmin() { return !!(me.data && me.data.role === 'admin'); }
  var meWaiters = [];
  function onMe(cb) { meWaiters.push(cb); }
  function loadMe(user) {
    if (!user) { me.uid = null; me.data = null; return Promise.resolve(); }
    me.uid = user.uid;
    return db.collection('users').doc(user.uid).get().then(function (d) { me.data = d.exists ? d.data() : null; }).catch(function () { me.data = null; });
  }

  /* =========================================================
     1) SEImage — رفع الصور الموحّد (يعيد استخدام uploadImageToGoogleDrive الحالية)
     ========================================================= */
  var SEImage = window.SEImage = (function () {
    var MAX_BYTES = 12 * 1024 * 1024, OK = ['image/jpeg', 'image/png', 'image/webp'];
    function mount(host, opt) {
      opt = opt || {};
      var st = { current: null, file: null, removed: false, cache: null, objUrl: null };
      host.innerHTML =
        '<div class="se-up ' + (opt.shape === 'circle' ? 'is-circle' : '') + '">' +
        '<div class="se-up-prev"><span class="se-up-ph" aria-hidden="true"><i class="fa-solid fa-image"></i></span></div>' +
        '<div class="se-up-ctl"><label class="v3-btn se-up-pick"><input type="file" accept="image/jpeg,image/png,image/webp" hidden><span>' + esc(opt.label || 'اختيار صورة') + '</span></label>' +
        '<button type="button" class="v3-btn se-up-rm" hidden>إزالة الصورة</button>' +
        '<p class="se-up-msg" role="status"></p></div></div>';
      var input = host.querySelector('input'), prev = host.querySelector('.se-up-prev'), msg = host.querySelector('.se-up-msg'), rm = host.querySelector('.se-up-rm');
      function say(t, bad) { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); }
      function paint(url) {
        if (st.objUrl && url !== st.objUrl) { try { URL.revokeObjectURL(st.objUrl); } catch (e) {} st.objUrl = null; }
        prev.innerHTML = url ? '<img src="' + esc(url) + '" alt="معاينة الصورة">' : '<span class="se-up-ph" aria-hidden="true"><i class="fa-solid fa-image"></i></span>';
        rm.hidden = !url;
      }
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) return;
        if (OK.indexOf(f.type) === -1) { input.value = ''; say('نوع الملف غير مدعوم. اختر صورة JPG أو PNG أو WebP.', true); return; }
        if (f.size > MAX_BYTES) { input.value = ''; say('حجم الصورة كبير جداً (الحد 12MB). اختر صورة أصغر.', true); return; }
        st.file = f; st.removed = false; st.cache = null;
        st.objUrl = URL.createObjectURL(f); paint(st.objUrl);
        say('تمت المعاينة. ستُرفع الصورة إلى Google Drive عند الحفظ.');
      });
      rm.addEventListener('click', function () { st.file = null; st.cache = null; st.removed = true; input.value = ''; paint(''); say('ستُزال الصورة عند الحفظ.'); });
      var ctl = {
        reset: function (cur) { st.current = cur || null; st.file = null; st.removed = false; st.cache = null; input.value = ''; paint(cur && cur.url || ''); say(''); },
        hasChange: function () { return !!st.file || st.removed; },
        // يرفع عند الحاجة فقط. لا نكتب في Firestore قبل نجاح الرفع، ولا نعيد رفع الملف نفسه عند إعادة المحاولة.
        commit: function (progress) {
          if (st.removed && !st.file) return Promise.resolve({ imageUrl: '', driveFileId: '' });
          if (!st.file) return Promise.resolve({ unchanged: true });
          var f = st.file, key = f.name + '|' + f.size + '|' + f.lastModified;
          if (st.cache && st.cache.key === key) return Promise.resolve(st.cache.res);
          if (typeof uploadImageToGoogleDrive !== 'function') return Promise.reject(Object.assign(new Error('خدمة الرفع غير متاحة.'), { isUploadError: true }));
          say('جاري الرفع إلى Google Drive...');
          return uploadImageToGoogleDrive(f, opt.kind || 'announcements', function (m) { say(m); if (progress) progress(m); }).then(function (r) {
            if (!r || !r.driveFileId) throw new Error('لم يُرجع Google Drive معرّف الملف.');
            var res = { imageUrl: buildGoogleDriveImageUrl(r.driveFileId, opt.kind === 'profiles' ? 600 : 1600), driveFileId: r.driveFileId };
            st.cache = { key: key, res: res }; say('تم رفع الصورة.');
            return res;
          }).catch(function (e) { say((e && e.message) || 'فشل رفع الصورة.', true); var er = e instanceof Error ? e : new Error(String(e)); er.isUploadError = true; throw er; });
        }
      };
      return ctl;
    }
    return { mount: mount };
  })();

  /* =========================================================
     2) SEViewer — عارض الصور (contain + إغلاق + سابق/تالي)
     ========================================================= */
  var SEViewer = window.SEViewer = (function () {
    var items = [], idx = 0, lastFocus = null;
    function el(id) { return $(id); }
    function show() {
      var it = items[idx]; if (!it) return;
      var img = el('seViewerImg'); img.src = it.url; img.alt = it.caption || '';
      el('seViewerCap').textContent = it.caption || '';
      el('seViewerCount').textContent = items.length > 1 ? (idx + 1) + ' / ' + items.length : '';
      el('seViewerPrev').hidden = el('seViewerNext').hidden = items.length < 2;
    }
    function open(list, i) {
      if (!list || !list.length) return;
      items = list; idx = Math.max(0, Math.min(i || 0, list.length - 1));
      lastFocus = document.activeElement;
      el('seViewer').hidden = false; document.body.classList.add('se-viewer-open');
      show(); el('seViewerClose').focus();
    }
    function close() { el('seViewer').hidden = true; document.body.classList.remove('se-viewer-open'); el('seViewerImg').removeAttribute('src'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
    function step(d) { if (items.length < 2) return; idx = (idx + d + items.length) % items.length; show(); }
    function init() {
      el('seViewerClose').addEventListener('click', close);
      el('seViewerPrev').addEventListener('click', function () { step(-1); });
      el('seViewerNext').addEventListener('click', function () { step(1); });
      el('seViewer').addEventListener('click', function (e) { if (e.target === el('seViewer') || e.target.classList.contains('se-viewer-stage')) close(); });
      document.addEventListener('keydown', function (e) {
        if (el('seViewer').hidden) return;
        if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(1); else if (e.key === 'ArrowRight') step(-1);
      });
      el('seViewerImg').addEventListener('error', function () { el('seViewerCap').textContent = 'تعذّر تحميل هذه الصورة.'; });
      document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-viewer]');
        if (!t) return;
        e.preventDefault(); e.stopPropagation();
        var grp = t.closest('[data-viewer-group]');
        var nodes = grp ? Array.prototype.slice.call(grp.querySelectorAll('[data-viewer]')) : [t];
        var list = nodes.map(function (n) { return { url: n.getAttribute('data-viewer'), caption: n.getAttribute('data-caption') || '' }; });
        open(list, nodes.indexOf(t));
      }, true);
    }
    return { init: init, open: open, close: close };
  })();

  /* =========================================================
     3) SEPost — تفاعلات حقيقية: إعجاب/تفاعلات، تعليقات، حفظ
     كل تفاعل = وثيقة (reactions/{uid}) ⇒ لا تكرار؛ الأعداد تُحسب من الوثائق نفسها.
     ========================================================= */
  var REACTIONS = [
    { type: 'like', label: 'إعجاب', svg: '<path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm2 9V10.5l3.4-6.2A1.7 1.7 0 0 1 15 5.9V9h4.2a1.8 1.8 0 0 1 1.8 2.2l-1.4 6.6A2.2 2.2 0 0 1 17.4 19.5H11a2 2 0 0 1-2-.5z"/>' },
    { type: 'heart', label: 'قلب', svg: '<path d="M12 20.5S3.5 15.3 3.5 9.1A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.1C20.5 15.3 12 20.5 12 20.5z"/>' },
    { type: 'clap', label: 'تصفيق', svg: '<path d="M8.5 4l1.2 2.6M5 6.2l2 1.8M12 3.5l.3 2.8M7.2 9.3l4.1-2.7a1.5 1.5 0 0 1 2.1.4l3.6 5.4a5.3 5.3 0 0 1-1.4 7.3l-.6.4a6 6 0 0 1-8-1.6L4.6 13a1.4 1.4 0 0 1 2.2-1.6l1.6 1.9"/>' , stroke: true },
    { type: 'wow', label: 'دهشة', svg: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="1.2"/><circle cx="15" cy="10" r="1.2"/><ellipse cx="12" cy="15.5" rx="2.2" ry="2.8"/>' },
    { type: 'support', label: 'دعم', svg: '<path d="M12 21c-5-3.3-8-6.4-8-10a4 4 0 0 1 7-2.6L12 9.5l1-1.1A4 4 0 0 1 20 11c0 3.6-3 6.7-8 10z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v6M9 11h6" stroke="currentColor" stroke-width="1.8" fill="none"/>' },
    // التحية الكشفية: ثلاثة أصابع مرفوعة والإبهام يغطي الخنصر (رسم مخصص، ليس شعاراً رسمياً)
    { type: 'salute', label: 'التحية الكشفية', svg: '<g fill="currentColor"><rect x="6.2" y="3" width="3" height="10" rx="1.5"/><rect x="10.5" y="2" width="3" height="11" rx="1.5"/><rect x="14.8" y="3" width="3" height="10" rx="1.5"/><path d="M5 12.5h14v3.2A5.3 5.3 0 0 1 13.7 21h-3.4A5.3 5.3 0 0 1 5 15.7z"/></g><path d="M6 17.2c2.6-.2 5-1.6 6.6-3.6" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" fill="none" stroke-linecap="round"/>' }
  ];
  V5.REACTIONS = REACTIONS;
  function rIcon(r, cls) { return '<svg class="' + (cls || 'rx-ico') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"' + (r.stroke ? ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' : ' fill="currentColor"') + '>' + r.svg + '</svg>'; }
  var BANNED = (typeof COMMENT_BANNED_WORDS !== 'undefined' && COMMENT_BANNED_WORDS) || [];
  function commentProblem(t) {
    if (!t || !t.trim()) return 'اكتب تعليقاً أولاً.';
    if (t.length > 500) return 'التعليق طويل (الحد 500 حرف).';
    if (/(https?:\/\/|www\.)/i.test(t)) return 'لا يُسمح بالروابط في التعليقات.';
    if (/(.)\1{9,}/.test(t)) return 'التعليق يحتوي تكراراً مفرطاً.';
    var low = t.toLowerCase();
    for (var i = 0; i < BANNED.length; i++) if (BANNED[i] && low.indexOf(String(BANNED[i]).toLowerCase()) !== -1) return 'التعليق يحتوي عبارات غير مسموحة.';
    return '';
  }
  V5.commentProblem = commentProblem;
  function postRef(id) { return db.collection('announcements').doc(id); }

  function fetchStats(id) {
    var ref = postRef(id);
    return Promise.all([
      ref.collection('reactions').get(),
      ref.collection('comments').where('hidden', '==', false).get(),
      ref.collection('saves').get()
    ]).then(function (r) {
      var counts = {}, mine = null, total = 0;
      r[0].forEach(function (d) { var x = d.data(); counts[x.type] = (counts[x.type] || 0) + 1; total++; if (me.uid && d.id === me.uid) mine = x.type; });
      var comments = [];
      r[1].forEach(function (d) { var x = d.data(); x.id = d.id; comments.push(x); });
      comments.sort(function (a, b) { return (msOf(b.createdAt) || 0) - (msOf(a.createdAt) || 0); });
      var saved = false; r[2].forEach(function (d) { if (me.uid && d.id === me.uid) saved = true; });
      return { counts: counts, mine: mine, total: total, comments: comments, saves: r[2].size, saved: saved };
    });
  }
  V5.fetchStats = fetchStats;

  var SEPost = window.SEPost = {
    mount: function (host, opt) {
      if (!host) return;
      var id = opt.id;
      host.innerHTML = '<p class="v3-muted"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> جاري تحميل التفاعلات...</p>';
      function guard() {
        if (!me.uid) { notify('سجّل الدخول للتفاعل مع المنشورات.', 'warning'); if (typeof openModal === 'function') { try { closeModal('newsDetailModal'); } catch (e) {} openModal('roleSelectionModal'); } return false; }
        if (!active()) { notify('حسابك قيد المراجعة أو غير نشط؛ لا يمكنك التفاعل بعد.', 'warning'); return false; }
        return true;
      }
      function render(s) {
        var rx = REACTIONS.map(function (r) {
          var c = s.counts[r.type] || 0, on = s.mine === r.type;
          return '<button type="button" class="rx-btn' + (on ? ' on' : '') + '" data-rx="' + r.type + '" aria-pressed="' + on + '" title="' + esc(r.label) + '" aria-label="' + esc(r.label) + ': ' + c + '">' + rIcon(r) + '<span class="rx-n">' + c + '</span></button>';
        }).join('');
        var cm = s.comments.map(function (c) {
          var mineC = me.uid && c.uid === me.uid;
          return '<li class="cm-item" data-cid="' + esc(c.id) + '"><div class="cm-head"><strong>' + esc(c.authorName || 'عضو') + '</strong><time>' + esc(msOf(c.createdAt) ? fmtD(msOf(c.createdAt)) : '') + '</time></div><p>' + esc(c.text) + '</p>' +
            ((mineC || isAdmin()) ? '<button type="button" class="cm-del" data-del="' + esc(c.id) + '">حذف</button>' : '') + '</li>';
        }).join('');
        host.innerHTML =
          '<div class="rx-total" aria-live="polite">' + s.total + ' تفاعل • ' + s.comments.length + ' تعليق • ' + s.saves + ' حفظ</div>' +
          '<div class="rx-bar" role="group" aria-label="التفاعلات">' + rx +
          '<button type="button" class="rx-btn rx-save' + (s.saved ? ' on' : '') + '" data-save="1" aria-pressed="' + s.saved + '" title="حفظ المنشور"><svg class="rx-ico" viewBox="0 0 24 24" aria-hidden="true" fill="' + (s.saved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span class="rx-n">' + s.saves + '</span></button></div>' +
          '<div class="cm-wrap"><h4 class="v3-sub-title">التعليقات (' + s.comments.length + ')</h4>' +
          (me.uid ? '<form class="cm-form" novalidate><textarea maxlength="500" rows="2" placeholder="اكتب تعليقك..." aria-label="تعليق"></textarea><div class="cm-actions"><span class="cm-count">0/500</span><button type="submit" class="v3-btn">نشر التعليق</button></div><p class="v5-msg cm-msg" role="status"></p></form>'
            : '<p class="v3-muted">سجّل الدخول لإضافة تعليق.</p>') +
          '<ul class="cm-list">' + (cm || '<li class="v3-muted">لا توجد تعليقات بعد.</li>') + '</ul></div>';
        bind(s);
      }
      function refresh() { return fetchStats(id).then(render).catch(function (e) { host.innerHTML = '<p class="v5-msg bad">تعذّر تحميل التفاعلات (' + esc(e && e.code || 'خطأ') + ').</p>'; }); }
      function bind(s) {
        host.querySelectorAll('[data-rx]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!guard()) return;
            var t = b.getAttribute('data-rx'), ref = postRef(id).collection('reactions').doc(me.uid);
            b.disabled = true;
            var p = (s.mine === t) ? ref.delete() : ref.set({ uid: me.uid, type: t, createdAt: serverTs() });
            p.then(refresh).catch(function (e) { notify('تعذّر تسجيل التفاعل: ' + (e && e.code || ''), 'error'); b.disabled = false; });
          });
        });
        var sv = host.querySelector('[data-save]');
        if (sv) sv.addEventListener('click', function () {
          if (!guard()) return;
          sv.disabled = true;
          var bt = db.batch(), a = postRef(id).collection('saves').doc(me.uid), u = db.collection('users').doc(me.uid).collection('saved').doc(id);
          if (s.saved) { bt.delete(a); bt.delete(u); } else { bt.set(a, { uid: me.uid, savedAt: serverTs() }); bt.set(u, { postId: id, savedAt: serverTs() }); }
          bt.commit().then(function () { notify(s.saved ? 'أُلغي حفظ المنشور.' : 'تم حفظ المنشور في حسابك.', 'success'); return refresh(); })
            .catch(function (e) { notify('تعذّر الحفظ: ' + (e && e.code || ''), 'error'); sv.disabled = false; });
        });
        var form = host.querySelector('.cm-form');
        if (form) {
          var ta = form.querySelector('textarea'), cnt = form.querySelector('.cm-count'), msg = form.querySelector('.cm-msg');
          ta.addEventListener('input', function () { cnt.textContent = ta.value.length + '/500'; });
          form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!guard()) return;
            var t = ta.value.trim(), prob = commentProblem(t);
            if (prob) { msg.textContent = prob; msg.classList.add('bad'); return; }
            var btn = form.querySelector('button[type=submit]'); btn.disabled = true; msg.textContent = '';
            var name = (me.data && (me.data.fullName || ((me.data.firstName || '') + ' ' + (me.data.lastName || '')).trim())) || 'عضو';
            if (me.data && me.data.prefs && me.data.prefs.commentName === 'first') name = String(name).trim().split(/\s+/)[0] || 'عضو';
            postRef(id).collection('comments').add({ uid: me.uid, authorName: String(name).slice(0, 80), text: t, createdAt: serverTs(), hidden: false })
              .then(refresh).catch(function (er) { msg.textContent = 'تعذّر نشر التعليق (' + (er && er.code || 'خطأ') + ').'; msg.classList.add('bad'); btn.disabled = false; });
          });
        }
        host.querySelectorAll('[data-del]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!window.confirm('حذف هذا التعليق؟')) return;
            postRef(id).collection('comments').doc(b.getAttribute('data-del')).delete().then(refresh)
              .catch(function (e) { notify('تعذّر الحذف: ' + (e && e.code || ''), 'error'); });
          });
        });
      }
      return refresh();
    }
  };

  // ---- إحصاءات مصغّرة على بطاقات الأخبار (تُجلب عند ظهور البطاقة فقط) ----
  var statQueue = [], statBusy = false, statCache = {};
  function runStatQueue() {
    if (statBusy || !statQueue.length) return; statBusy = true;
    var job = statQueue.shift();
    var pr; try { pr = fetchStats(job.id); } catch (e) { pr = Promise.reject(e); }
    pr.then(function (s) { statCache[job.id] = s; paintStats(job.el, s); }).catch(function () { /* الإحصاءات اختيارية: لا تكسر الصفحة */ }).then(function () { statBusy = false; runStatQueue(); });
  }
  function paintStats(el, s) {
    var box = el.querySelector('.card-stats'); if (!box) { box = document.createElement('div'); box.className = 'card-stats'; el.querySelector('.news-card-body').appendChild(box); }
    box.innerHTML = '<span title="تفاعلات"><i class="fa-solid fa-heart" aria-hidden="true"></i> ' + s.total + '</span><span title="تعليقات"><i class="fa-solid fa-comment" aria-hidden="true"></i> ' + s.comments.length + '</span><span title="حفظ"><i class="fa-solid fa-bookmark" aria-hidden="true"></i> ' + s.saves + '</span>';
  }
  var io = null;
  function observeCards() {
    document.querySelectorAll('.news-card[data-post-id]').forEach(function (c) {
      if (c.__obs) return; c.__obs = true;
      if (!('IntersectionObserver' in window)) { statQueue.push({ id: c.getAttribute('data-post-id'), el: c }); runStatQueue(); return; }
      if (!io) io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); statQueue.push({ id: en.target.getAttribute('data-post-id'), el: en.target }); runStatQueue(); } }); }, { rootMargin: '120px' });
      io.observe(c);
    });
  }
  V5.refreshCardStats = observeCards;

  /* =========================================================
     4) SENotice — إشعارات الإدارة (من Firestore، لا بيانات ثابتة)
     ========================================================= */
  var SENotice = window.SENotice = (function () {
    var queue = [], shown = false, dismissed = {}, timer = null, editingId = null, adminList = [];
    function audienceOk(n) { var a = n.audience || 'all'; return a === 'all' || (a === 'members' && !!me.uid) || (a === 'guests' && !me.uid); }
    function timeOk(n, now) { var s = msOf(n.startAt), e = msOf(n.endAt); return (s == null || s <= now) && (e == null || now < e); }
    function load() {
      return db.collection('siteNotifications').where('published', '==', true).get().then(function (snap) {
        var now = Date.now(), list = [];
        snap.forEach(function (d) { var x = d.data(); x.id = d.id; if (timeOk(x, now) && audienceOk(x) && !dismissed[x.id] && !(window.SEBell && SEBell.isRead(x.id))) list.push(x); });
        if (me.data && me.data.prefs && me.data.prefs.noticePopup === false) list = [];
        list.sort(function (a, b) { return (msOf(b.startAt) || 0) - (msOf(a.startAt) || 0); });
        queue = list; if (!shown) next();
      }).catch(function (e) { console.warn('[Scout Elwihda] notifications load failed:', e && e.code); });
    }
    function next() {
      var host = $('seNoticeHost'); if (!host) return;
      var n = queue.shift();
      if (!n) { shown = false; host.innerHTML = ''; return; }
      shown = true;
      var delay = Math.max(0, Math.min(60, parseInt(n.closeDelaySec, 10) || 0));
      host.innerHTML = '<section class="se-notice" role="region" aria-label="إشعار من الإدارة"><div class="se-notice-ico" aria-hidden="true"><i class="fa-solid fa-bell"></i></div>' +
        '<div class="se-notice-main"><h3>' + esc(n.title) + '</h3><p class="se-notice-body">' + esc(n.body) + '</p>' +
        '<p class="se-notice-from">صادر عن: <strong>' + esc((n.issuer ? n.issuer + ' — ' : '') + (n.issuerName || '')) + '</strong></p></div>' +
        '<button type="button" class="se-notice-close" disabled aria-label="إغلاق الإشعار">' + (delay ? 'يمكن الإغلاق بعد <b>' + delay + '</b> ث' : 'إغلاق') + '</button></section>';
      var btn = host.querySelector('.se-notice-close'), left = delay;
      function ready() { btn.disabled = false; btn.textContent = 'إغلاق'; }
      if (delay === 0) ready(); else {
        clearInterval(timer);
        timer = setInterval(function () { left--; if (left <= 0) { clearInterval(timer); ready(); } else { var b = btn.querySelector('b'); if (b) b.textContent = left; } }, 1000);
      }
      btn.addEventListener('click', function () { if (btn.disabled) return; dismissed[n.id] = true; clearInterval(timer); next(); });
    }
    /* ---- الأدمن ---- */
    function msgA(t, ok) { var m = $('noticesAdminMsg'); if (m) { m.textContent = t || ''; m.classList.toggle('bad', !ok && !!t); } }
    function loadAdmin() {
      if (!isAdmin()) { msgA('هذه الصفحة للأدمن فقط.'); return; }
      db.collection('siteNotifications').get().then(function (snap) {
        adminList = []; snap.forEach(function (d) { var x = d.data(); x.id = d.id; adminList.push(x); });
        adminList.sort(function (a, b) { return (msOf(b.startAt) || 0) - (msOf(a.startAt) || 0); });
        renderAdmin(); msgA('');
      }).catch(function (e) { msgA(window.V3 && V3.dbErrorText ? V3.dbErrorText(e, 'تحميل الإشعارات') : 'تعذّر التحميل'); });
    }
    function stateOf(n) {
      var now = Date.now(); if (!n.published) return ['مخفي', 'off'];
      var s = msOf(n.startAt), e = msOf(n.endAt);
      if (s != null && s > now) return ['مجدول', 'off']; if (e != null && e <= now) return ['منتهٍ', 'off']; return ['نشط', 'on'];
    }
    function renderAdmin() {
      var box = $('noticesAdminList'); if (!box) return;
      if (!adminList.length) { box.innerHTML = '<p class="v3-muted">لا توجد إشعارات بعد.</p>'; return; }
      box.innerHTML = adminList.map(function (n) {
        var st = stateOf(n);
        return '<div class="v3-admin-row" data-id="' + esc(n.id) + '"><div class="v3-admin-info"><strong>' + esc(n.title) + '</strong> <span class="v3-chip ' + st[1] + '">' + st[0] + '</span> ' +
          '<span class="v3-muted">' + esc(n.issuer || '') + ' — ' + esc(n.issuerName || '') + ' • ' + esc(msOf(n.startAt) ? fmtD(msOf(n.startAt)) : '') + (msOf(n.endAt) ? ' → ' + esc(fmtD(msOf(n.endAt))) : '') + '</span></div>' +
          '<div class="v3-admin-btns"><button type="button" data-a="edit">تعديل</button><button type="button" data-a="toggle">' + (n.published ? 'إخفاء' : 'نشر') + '</button><button type="button" data-a="del" class="danger">حذف</button></div></div>';
      }).join('');
      box.querySelectorAll('.v3-admin-row').forEach(function (row) {
        var id = row.getAttribute('data-id');
        row.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { act(id, b.getAttribute('data-a')); }); });
      });
    }
    function act(id, a) {
      var n = adminList.filter(function (x) { return x.id === id; })[0]; if (!n) return;
      var ref = db.collection('siteNotifications').doc(id);
      if (a === 'edit') return openForm(id);
      var p;
      if (a === 'toggle') p = ref.update({ published: !n.published, updatedAt: serverTs() });
      else { if (!window.confirm('حذف الإشعار «' + n.title + '» نهائياً؟')) return; p = ref.delete(); }
      p.then(function () { msgA('تم تنفيذ العملية.', true); loadAdmin(); }).catch(function (e) { msgA(window.V3 ? V3.dbErrorText(e, 'تنفيذ العملية') : 'تعذّر التنفيذ'); });
    }
    function toLocal(ms) { return ms ? dateToAlgiersLocalInputValue(new Date(ms)) : ''; }
    function openForm(id) {
      editingId = id || null; $('noticeFormError').textContent = '';
      $('noticeFormTitle').textContent = id ? 'تعديل إشعار' : 'إشعار جديد';
      var n = id ? adminList.filter(function (x) { return x.id === id; })[0] : null;
      $('ntTitle').value = (n && n.title) || ''; $('ntBody').value = (n && n.body) || '';
      $('ntIssuer').value = (n && n.issuer) || 'قائد الفوج'; $('ntIssuerName').value = (n && n.issuerName) || '';
      $('ntStart').value = n ? toLocal(msOf(n.startAt)) : toLocal(Date.now()); $('ntEnd').value = n ? toLocal(msOf(n.endAt)) : '';
      $('ntDelay').value = n && n.closeDelaySec != null ? n.closeDelaySec : 5; $('ntAudience').value = (n && n.audience) || 'all';
      $('ntPublished').checked = n ? n.published !== false : true;
      var lk = (n && n.link) || ''; $('ntLinkPage').value = (lk && lk.indexOf('https://') !== 0) ? lk : ''; $('ntLinkUrl').value = (lk.indexOf('https://') === 0) ? lk : '';
      openModal('noticeFormModal');
    }
    function initForm() {
      var f = $('noticeForm'); if (!f) return;
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var err = $('noticeFormError'); err.textContent = '';
        if (!isAdmin()) { err.textContent = 'الحفظ للأدمن فقط.'; return; }
        var title = $('ntTitle').value.trim(), body = $('ntBody').value.trim(), who = $('ntIssuerName').value.trim();
        if (!title || !body || !who) { err.textContent = 'العنوان والنص والمُصدِر مطلوبة.'; return; }
        var s = algiersLocalStringToDate($('ntStart').value), en = algiersLocalStringToDate($('ntEnd').value);
        if (!s) { err.textContent = 'حدّد تاريخ ووقت بداية العرض.'; return; }
        if (en && en <= s) { err.textContent = 'يجب أن تكون نهاية العرض بعد بدايته.'; return; }
        var delay = Math.max(0, Math.min(60, parseInt($('ntDelay').value, 10) || 0));
        var lurl = $('ntLinkUrl').value.trim(), lpage = $('ntLinkPage').value;
        if (lurl && !/^https:\/\/[^\s]+$/.test(lurl)) { err.textContent = 'الرابط الخارجي يجب أن يبدأ بـ https://'; return; }
        var link = lurl || lpage || '';
        var data = { title: title, body: body, issuer: $('ntIssuer').value, issuerName: who, startAt: firebase.firestore.Timestamp.fromDate(s),
          endAt: en ? firebase.firestore.Timestamp.fromDate(en) : null, closeDelaySec: delay, link: link, audience: $('ntAudience').value, published: $('ntPublished').checked, updatedAt: serverTs() };
        var btn = $('noticeFormSubmit'); btn.disabled = true;
        var p; if (editingId) p = db.collection('siteNotifications').doc(editingId).update(data); else { data.createdAt = serverTs(); data.createdBy = me.uid; p = db.collection('siteNotifications').add(data); }
        p.then(function () { closeModal('noticeFormModal'); msgA('تم حفظ الإشعار.', true); loadAdmin(); load(); })
          .catch(function (er) { err.textContent = window.V3 ? V3.dbErrorText(er, 'حفظ الإشعار') : 'تعذّر الحفظ'; }).then(function () { btn.disabled = false; });
      });
    }
    return { load: load, loadAdmin: loadAdmin, openForm: openForm, initForm: initForm, reset: function () { dismissed = {}; } };
  })();

  /* =========================================================
     5) SEMod — إشراف التعليقات + طلبات تغيير الوحدة (أدمن)
     ========================================================= */
  var SEMod = window.SEMod = (function () {
    function msg(t, ok) { var m = $('modMsg'); if (m) { m.textContent = t || ''; m.classList.toggle('bad', !ok && !!t); } }
    function load() {
      if (!isAdmin()) { msg('هذه الصفحة للأدمن فقط.'); return; }
      db.collection('announcements').get().then(function (snap) {
        var sel = $('modPostSelect'), cur = sel.value; sel.innerHTML = '<option value="">اختر منشورًا…</option>';
        var arr = []; snap.forEach(function (d) { var x = d.data(); arr.push({ id: d.id, title: unescapeSanitized ? unescapeSanitized(x.title || '') : (x.title || '') }); });
        arr.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.title || p.id; sel.appendChild(o); });
        sel.value = cur; if (cur) loadComments(cur);
      }).catch(function (e) { msg(V3.dbErrorText(e, 'تحميل المنشورات')); });
      loadRequests();
    }
    function loadComments(pid) {
      var box = $('modCommentsList'); if (!pid) { box.innerHTML = ''; return; }
      db.collection('announcements').doc(pid).collection('comments').get().then(function (snap) {
        var arr = []; snap.forEach(function (d) { var x = d.data(); x.id = d.id; arr.push(x); });
        arr.sort(function (a, b) { return (msOf(b.createdAt) || 0) - (msOf(a.createdAt) || 0); });
        if (!arr.length) { box.innerHTML = '<p class="v3-muted">لا توجد تعليقات على هذا المنشور.</p>'; return; }
        box.innerHTML = arr.map(function (c) {
          return '<div class="v3-admin-row" data-id="' + esc(c.id) + '"><div class="v3-admin-info"><strong>' + esc(c.authorName || 'عضو') + '</strong> ' + (c.hidden ? '<span class="v3-chip off">مخفي</span>' : '<span class="v3-chip on">ظاهر</span>') + '<p class="cm-mod-text">' + esc(c.text) + '</p></div>' +
            '<div class="v3-admin-btns"><button type="button" data-a="hide">' + (c.hidden ? 'إظهار' : 'إخفاء') + '</button><button type="button" data-a="del" class="danger">حذف</button></div></div>';
        }).join('');
        box.querySelectorAll('.v3-admin-row').forEach(function (row) {
          var cid = row.getAttribute('data-id'), c = arr.filter(function (x) { return x.id === cid; })[0];
          row.querySelectorAll('button').forEach(function (b) {
            b.addEventListener('click', function () {
              var ref = db.collection('announcements').doc(pid).collection('comments').doc(cid), p;
              if (b.getAttribute('data-a') === 'hide') p = ref.update({ hidden: !c.hidden });
              else { if (!window.confirm('حذف التعليق نهائياً؟')) return; p = ref.delete(); }
              p.then(function () { loadComments(pid); }).catch(function (e) { msg(V3.dbErrorText(e, 'تنفيذ العملية')); });
            });
          });
        });
      }).catch(function (e) { msg(V3.dbErrorText(e, 'تحميل التعليقات')); });
    }
    function loadRequests() {
      var box = $('modUnitRequests');
      db.collection('unitChangeRequests').where('status', '==', 'pending').get().then(function (snap) {
        var arr = []; snap.forEach(function (d) { var x = d.data(); x.id = d.id; arr.push(x); });
        if (!arr.length) { box.innerHTML = '<p class="v3-muted">لا توجد طلبات معلّقة.</p>'; return; }
        box.innerHTML = arr.map(function (r) {
          return '<div class="v3-admin-row" data-id="' + esc(r.id) + '"><div class="v3-admin-info"><strong data-who="' + esc(r.uid) + '">مستخدم ' + esc(r.uid.slice(0, 6)) + '…</strong> يطلب الانتقال إلى <strong>' + esc(r.requestedUnitName) + '</strong></div>' +
            '<div class="v3-admin-btns"><button type="button" data-a="ok">موافقة</button><button type="button" data-a="no" class="danger">رفض</button></div></div>';
        }).join('');
        box.querySelectorAll('.v3-admin-row').forEach(function (row) {
          var id = row.getAttribute('data-id'), r = arr.filter(function (x) { return x.id === id; })[0];
          db.collection('users').doc(r.uid).get().then(function (u) { if (u.exists) { var w = row.querySelector('[data-who]'); if (w) w.textContent = u.data().fullName || w.textContent; } }).catch(function () {});
          row.querySelectorAll('button').forEach(function (b) {
            b.addEventListener('click', function () {
              var reqRef = db.collection('unitChangeRequests').doc(id), p;
              if (b.getAttribute('data-a') === 'ok') {
                var bt = db.batch();
                bt.update(db.collection('users').doc(r.uid), { unitId: r.requestedUnitId, unit: r.requestedUnitName, updatedAt: serverTs() });
                bt.update(reqRef, { status: 'approved', reviewedAt: serverTs() });
                p = bt.commit();
              } else p = reqRef.update({ status: 'rejected', reviewedAt: serverTs() });
              p.then(function () { msg('تم تنفيذ القرار.', true); loadRequests(); }).catch(function (e) { msg(V3.dbErrorText(e, 'تنفيذ القرار')); });
            });
          });
        });
      }).catch(function (e) { box.innerHTML = ''; msg(V3.dbErrorText(e, 'تحميل الطلبات')); });
    }
    function init() {
      var s = $('modPostSelect'); if (s) s.addEventListener('change', function () { loadComments(s.value); });
      var r = $('modReloadBtn'); if (r) r.addEventListener('click', load);
    }
    return { load: load, init: init };
  })();

  /* =========================================================
     6) SEI18n — اللغات (العربية/الفرنسية/الإنجليزية الآن؛ المزابية جاهزة للإضافة لاحقاً)
     تُترجم عناصر الواجهة الموسومة بـ data-i18n فقط (القوائم والحساب)؛ المحتوى المنشور يبقى كما كتبته الإدارة.
     لإضافة لغة لاحقاً: SEI18n.register('mzb', { 'nav.home': '...' }, 'اسم اللغة')
     ========================================================= */
  var SEI18n = window.SEI18n = (function () {
    var dict = {
      fr: { 'nav.home': 'Accueil', 'nav.news': 'Dernières actualités', 'nav.next': 'Prochain programme scout', 'nav.past': 'Programmes passés', 'nav.ann': 'Annonces', 'nav.units': 'Unités scoutes', 'nav.gallery': 'Galerie scoute', 'nav.skills': 'Compétences scoutes', 'nav.about': 'À propos du groupe', 'nav.account': 'Mon compte', 'nav.profile': 'Profil', 'nav.card': 'Ma carte scoute', 'nav.settings': 'Paramètres', 'nav.logout': 'Déconnexion', 'set.account': 'Informations du compte', 'set.photo': 'Photo de profil', 'set.name': 'Nom et prénom', 'set.language': 'Langue', 'set.password': 'Mot de passe' },
      en: { 'nav.home': 'Home', 'nav.news': 'Latest news', 'nav.next': 'Next scout programme', 'nav.past': 'Past programmes', 'nav.ann': 'Announcements', 'nav.units': 'Scout units', 'nav.gallery': 'Scout gallery', 'nav.skills': 'Scout skills', 'nav.about': 'About the group', 'nav.account': 'My account', 'nav.profile': 'Profile', 'nav.card': 'My scout card', 'nav.settings': 'Settings', 'nav.logout': 'Log out', 'set.account': 'Account information', 'set.photo': 'Profile photo', 'set.name': 'Name', 'set.language': 'Language', 'set.password': 'Password' }
    };
    var langs = [{ code: 'ar', label: 'العربية' }, { code: 'fr', label: 'Français' }, { code: 'en', label: 'English' }, { code: 'mzb', label: 'المزابية (ⵎⵣⴰⴱ)', soon: true }];
    var cur = 'ar';
    function hasDict(c) { return c === 'ar' || !!dict[c]; }
    function apply(code) {
      if (!hasDict(code)) code = 'ar'; cur = code;
      document.documentElement.setAttribute('lang', code === 'mzb' ? 'ar' : code);
      document.querySelectorAll('[data-i18n]').forEach(function (n) {
        if (!n.hasAttribute('data-ar')) n.setAttribute('data-ar', n.textContent);
        var k = n.getAttribute('data-i18n'), t = code === 'ar' ? n.getAttribute('data-ar') : (dict[code] && dict[code][k]);
        n.textContent = t || n.getAttribute('data-ar');
      });
      try { localStorage.setItem('se_lang', code); } catch (e) {}
      renderOptions();
    }
    function renderOptions() {
      var box = $('langOptions'); if (!box) return;
      box.innerHTML = langs.map(function (l) {
        var ok = hasDict(l.code), dis = !ok;
        return '<label class="lang-opt' + (dis ? ' disabled' : '') + '"><input type="radio" name="seLang" value="' + l.code + '"' + (cur === l.code ? ' checked' : '') + (dis ? ' disabled' : '') + '> ' + esc(l.label) + (dis ? ' <span class="soon-chip">قريبًا — لم تتوفر الترجمة بعد</span>' : '') + '</label>';
      }).join('');
      box.querySelectorAll('input').forEach(function (i) { i.addEventListener('change', function () { setLang(i.value, true); }); });
      var note = $('langNote'); if (note) note.textContent = 'تُترجم القوائم وصفحات الحساب؛ أما الأخبار والإعلانات فتبقى بلغة كتابتها.';
    }
    function setLang(code, persist) {
      apply(code);
      if (persist && me.uid && active()) db.collection('users').doc(me.uid).update({ language: code, updatedAt: serverTs() }).catch(function () {});
    }
    function register(code, d, label) { dict[code] = d; if (!langs.some(function (l) { return l.code === code; })) langs.push({ code: code, label: label || code }); else langs.forEach(function (l) { if (l.code === code) { l.soon = false; if (label) l.label = label; } }); renderOptions(); }
    function init() { var s = 'ar'; try { s = localStorage.getItem('se_lang') || 'ar'; } catch (e) {} apply(s); }
    return { init: init, apply: apply, set: setLang, register: register, current: function () { return cur; } };
  })();

  /* =========================================================
     7) صفحات الحساب: الملف الشخصي • بطاقتي الكشفية • الإعدادات
     ========================================================= */
  var ROLE_LABELS = { admin: 'مسؤول الإدارة', leader: 'قائد', media_manager: 'مسؤول الإعلام', scout: 'كشاف', parent: 'ولي أمر' };
  function nameOf(d) { return (d && (d.fullName || ((d.firstName || '') + ' ' + (d.lastName || '')).trim())) || 'عضو الفوج'; }
  function unitOf(d) { return (window.V3 && V3.unitLabel ? V3.unitLabel(d) : '') || (d && d.unit) || 'غير محددة'; }
  function avatarHtml(d, extra) {
    var url = d && d.photoURL && typeof safeImgUrl === 'function' ? safeImgUrl(d.photoURL) : '';
    return url ? '<img class="avatar-img" src="' + esc(url) + '" alt="' + esc(nameOf(d)) + '" onerror="this.replaceWith(Object.assign(document.createElement(\'i\'),{className:\'fa-solid fa-user avatar-ph\'}))">' : '<i class="fa-solid fa-user avatar-ph" aria-hidden="true"></i>';
  }
  function phoneKey(d) { return d && d.role === 'scout' ? 'scoutPhone' : (d && d.role === 'parent' ? 'parentPhone' : 'phone'); }
  var settingsImg = null, setBusy = false;

  function renderAccount() {
    var guest = !me.uid || !me.data;
    document.querySelectorAll('.nav-account-item').forEach(function (n) { n.hidden = guest; });
    var sg = $('settingsGuest'), sb = $('settingsBody'); if (sg) sg.hidden = !guest; if (sb) sb.hidden = guest;
    if (guest) return;
    var d = me.data;
    // الملف الشخصي
    $('profileAvatar').innerHTML = avatarHtml(d); $('profileName').textContent = nameOf(d) + (d.nickname ? ' ' + d.nickname : '');
    $('profileRole').textContent = ROLE_LABELS[d.role] || d.role || ''; if ($('pfEmail')) $('pfEmail').value = d.email || '';
    $('pfFullName').value = d.fullName || ''; $('pfNickname').value = d.nickname || ''; $('pfBirthDate').value = d.birthDate || ''; $('pfBirthPlace').value = d.birthPlace || ''; $('pfPhone').value = d[phoneKey(d)] || '';
    $('pfUnitName').textContent = unitOf(d);
    loadUnitRequestState(); loadSaved();
    // البطاقة
    renderCard(d);
    // الإعدادات
    $('settingsInfo').innerHTML = [['الاسم', nameOf(d)], ['البريد الإلكتروني', d.email || ''], ['نوع الحساب', ROLE_LABELS[d.role] || d.role || ''], ['حالة الحساب', d.accountStatus === 'active' ? 'نشط' : (d.accountStatus === 'pending_verification' ? 'قيد المراجعة' : (d.accountStatus || ''))], ['الوحدة', unitOf(d)]]
      .map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
    if (!settingsImg && $('settingsPhotoUploader')) settingsImg = SEImage.mount($('settingsPhotoUploader'), { kind: 'profiles', shape: 'circle', label: 'اختيار صورة شخصية' });
    if (settingsImg) settingsImg.reset(d.photoURL ? { url: safeImgUrl(d.photoURL), fileId: d.photoFileId || '' } : null);
    if (d.language && d.language !== SEI18n.current()) SEI18n.apply(d.language);
  }
  function renderCard(d) {
    var host = $('myCardHost'); if (!host) return;
    function f(label, v, ltr) { return '<div class="idc-row"><dt>' + esc(label) + '</dt><dd' + (ltr ? ' dir="ltr"' : '') + '>' + (v ? esc(v) : '<span class="idc-missing">غير مسجّل</span>') + '</dd></div>'; }
    var phone = d[phoneKey(d)] || '';
    host.innerHTML = '<article class="id-card id-card-h" aria-label="البطاقة الكشفية">' +
      '<div class="idc-band"><img src="logo%20sma.png" alt=""><div class="idc-title"><b>الكشافة الإسلامية الجزائرية</b><span>فوج الوحدة</span></div><img src="logo%20elwihda.png" alt=""></div>' +
      '<div class="idc-main"><div class="avatar-circle avatar-card">' + avatarHtml(d) + '</div>' +
      '<dl class="idc-fields">' + f('الاسم', d.fullName || nameOf(d)) + f('اللقب', d.nickname) + f('الوحدة', unitOf(d)) + f('الهاتف', phone, true) + f('البريد', d.email, true) + '</dl></div>' +
      '<div class="idc-foot"><span>' + esc(ROLE_LABELS[d.role] || '') + '</span><span class="id-card-ornament" aria-hidden="true"></span></div></article>' +
      '<p class="v3-muted idc-hint">هذه البطاقة خاصة بك ولا تظهر لغيرك. لتعديل بياناتها استعمل «الملف الشخصي».</p>';
  }
  function setMsg(id, t, ok) { var m = $(id); if (m) { m.textContent = t || ''; m.classList.toggle('bad', !ok && !!t); } }
  function updateOwn(fields) {
    var data = Object.assign({}, fields, { updatedAt: serverTs() });
    return db.collection('users').doc(me.uid).update(data).then(function () {
      Object.keys(fields).forEach(function (k) { if (fields[k] && fields[k].__op === 'delete') delete me.data[k]; else me.data[k] = fields[k]; });
      return db.collection('users').doc(me.uid).get().then(function (d) { if (d.exists) me.data = d.data(); renderAccount(); if (typeof updateNavUserChip === 'function') updateNavUserChip(me.data); });
    });
  }
  function nameProblem(n) { if (!n || n.trim().length < 3) return 'الاسم قصير جداً.'; if (n.length > 80) return 'الاسم طويل جداً.'; if (/[<>@\d]/.test(n)) return 'الاسم يحتوي رموزاً غير مسموحة.'; return ''; }

  function initAccountForms() {
    ['navLogoutBtn', 'settingsLogoutBtn'].forEach(function (id) { var lo = $(id); if (lo) lo.addEventListener('click', function () { if (typeof handleUserLogout === 'function') handleUserLogout(); }); });
    var pf = $('profileForm');
    if (pf) pf.addEventListener('submit', function (e) {
      e.preventDefault(); if (!active()) { setMsg('profileFormMsg', 'حسابك غير نشط بعد.'); return; }
      var name = $('pfFullName').value.trim(), np = nameProblem(name); if (np) { setMsg('profileFormMsg', np); return; }
      var bd = $('pfBirthDate').value; if (bd && (bd > new Date().toISOString().slice(0, 10) || bd < '1930-01-01')) { setMsg('profileFormMsg', 'تاريخ الميلاد غير منطقي.'); return; }
      var ph = $('pfPhone').value.trim(); if (ph && !/^[0-9+\s]{8,15}$/.test(ph)) { setMsg('profileFormMsg', 'رقم الهاتف غير صالح.'); return; }
      var fields = { fullName: name, nickname: $('pfNickname').value.trim().slice(0, 60), birthDate: bd || '', birthPlace: $('pfBirthPlace').value.trim().slice(0, 80) };
      if (ph || me.data[phoneKey(me.data)]) fields[phoneKey(me.data)] = ph;
      var b = $('profileSaveBtn'); b.disabled = true;
      updateOwn(fields).then(function () { setMsg('profileFormMsg', 'تم حفظ التعديلات.', true); }).catch(function (er) { setMsg('profileFormMsg', 'تعذّر الحفظ (' + (er && er.code || 'خطأ') + ').'); }).then(function () { b.disabled = false; });
    });
    var pb = $('settingsPhotoSave');
    if (pb) pb.addEventListener('click', function () {
      if (!active() || !settingsImg || setBusy) return;
      if (!settingsImg.hasChange()) { setMsg('settingsPhotoMsg', 'لم تختر صورة جديدة.'); return; }
      setBusy = true; pb.disabled = true; setMsg('settingsPhotoMsg', 'جاري المعالجة...', true);
      var oldId = me.data.photoFileId;
      settingsImg.commit().then(function (r) {
        var fields = r.imageUrl ? { photoURL: r.imageUrl, photoFileId: r.driveFileId } : { photoURL: fsv().delete(), photoFileId: fsv().delete() };
        return updateOwn(fields).then(function () {
          if (oldId && oldId !== r.driveFileId && typeof deleteFileFromGoogleDriveIfEnabled === 'function') deleteFileFromGoogleDriveIfEnabled(oldId);
          setMsg('settingsPhotoMsg', 'تم تحديث صورتك الشخصية.', true);
        });
      }).catch(function (er) { setMsg('settingsPhotoMsg', er && er.isUploadError ? 'تعذّر رفع الصورة: ' + er.message : 'تعذّر الحفظ (' + (er && er.code || 'خطأ') + ').'); })
        .then(function () { setBusy = false; pb.disabled = false; });
    });
    var pw = $('settingsPwdBtn'), lastPw = 0;
    if (pw) pw.addEventListener('click', function () {
      if (!me.data || !me.data.email) return;
      if (Date.now() - lastPw < 60000) { setMsg('settingsPwdMsg', 'انتظر دقيقة قبل إعادة الإرسال.'); return; }
      lastPw = Date.now(); pw.disabled = true;
      auth.sendPasswordResetEmail(me.data.email).then(function () { setMsg('settingsPwdMsg', 'إن كان البريد صحيحاً فقد أُرسل رابط التغيير. تفقّد صندوق الوارد والبريد غير المرغوب.', true); })
        .catch(function (er) { setMsg('settingsPwdMsg', er && er.code === 'auth/too-many-requests' ? 'محاولات كثيرة. حاول لاحقاً.' : 'تعذّر الإرسال حالياً. حاول لاحقاً.'); }).then(function () { pw.disabled = false; });
    });
    var ub = $('pfUnitRequestBtn');
    if (ub) ub.addEventListener('click', function () {
      var sel = $('pfUnitSelect'), id = sel.value; if (!id || !active()) { setMsg('pfUnitMsg', 'اختر وحدة أولاً.'); return; }
      var name = sel.options[sel.selectedIndex].textContent;
      db.collection('unitChangeRequests').doc(me.uid).set({ uid: me.uid, requestedUnitId: id, requestedUnitName: name, status: 'pending', createdAt: serverTs() })
        .then(function () { setMsg('pfUnitMsg', 'أُرسل طلبك وسيراجعه المسؤول.', true); loadUnitRequestState(); }).catch(function (er) { setMsg('pfUnitMsg', 'تعذّر إرسال الطلب (' + (er && er.code || 'خطأ') + ').'); });
    });
  }
  function loadUnitRequestState() {
    var sel = $('pfUnitSelect'); if (!sel || !me.uid) return;
    db.collection('units').where('status', '==', 'active').get().then(function (snap) {
      var arr = []; snap.forEach(function (d) { var x = d.data(); x.id = d.id; if (x.id !== me.data.unitId) arr.push(x); }); arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      sel.innerHTML = '<option value="">اختر الوحدة المطلوبة…</option>' + arr.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>'; }).join('');
    }).catch(function () {});
    db.collection('unitChangeRequests').doc(me.uid).get().then(function (d) {
      if (d.exists && d.data().status === 'pending') setMsg('pfUnitMsg', 'لديك طلب قيد المراجعة للانتقال إلى «' + d.data().requestedUnitName + '».', true);
      else if (d.exists && d.data().status === 'rejected') setMsg('pfUnitMsg', 'رُفض طلبك السابق. يمكنك إرسال طلب جديد.');
    }).catch(function () {});
  }
  function loadSaved() {
    var box = $('savedPostsList'); if (!box || !me.uid) return;
    db.collection('users').doc(me.uid).collection('saved').get().then(function (snap) {
      var ids = []; snap.forEach(function (d) { ids.push(d.id); });
      if (!ids.length) { box.innerHTML = '<div class="news-state-box">لا توجد منشورات محفوظة.</div>'; return; }
      return Promise.all(ids.map(function (id) { return db.collection('announcements').doc(id).get().then(function (d) { return d.exists ? Object.assign({ id: id }, d.data()) : null; }).catch(function () { return null; }); })).then(function (arr) {
        arr = arr.filter(function (x) { return x && x.published === true; });
        if (!arr.length) { box.innerHTML = '<div class="news-state-box">المنشورات المحفوظة لم تعد متاحة.</div>'; return; }
        box.innerHTML = arr.map(function (p) {
          return '<article class="news-card saved-card"><div class="news-card-body"><h3 class="news-card-title">' + esc(typeof unescapeSanitized === 'function' ? unescapeSanitized(p.title || '') : p.title) + '</h3><button type="button" class="news-read-more-btn" data-open="' + esc(p.id) + '">فتح المنشور</button></div></article>';
        }).join('');
        box.querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { if (typeof openNewsDetail === 'function') openNewsDetail(b.getAttribute('data-open')); }); });
      });
    }).catch(function (e) { box.innerHTML = '<div class="news-state-box">تعذّر تحميل المحفوظات (' + esc(e && e.code || '') + ').</div>'; });
  }

  /* =========================================================
     8) تشخيص الوحدات والصلاحيات (يكشف السبب الحقيقي على موقعك)
     ========================================================= */
  V5.runUnitsDiagnostics = function () {
    var out = $('unitsDiagOut'); out.hidden = false; out.textContent = '';
    var lines = [];
    function log(ok, t) { lines.push((ok === true ? '✔ ' : ok === false ? '✘ ' : '• ') + t); out.textContent = lines.join('\n'); }
    var user = auth.currentUser;
    if (!user) { log(false, 'لا يوجد مستخدم مسجّل دخوله.'); return; }
    log(null, 'المستخدم: ' + user.uid + ' — ' + (user.email || ''));
    db.collection('users').doc(user.uid).get().then(function (d) {
      if (!d.exists) { log(false, 'وثيقة users/' + user.uid + ' غير موجودة ⇒ القواعد لا تعتبرك أدمن. أنشئ الوثيقة بالحقل role = "admin".'); return; }
      var x = d.data(); log(x.role === 'admin', 'role في Firestore = "' + x.role + '"' + (x.role === 'admin' ? '' : ' ⇒ يجب أن يكون "admin" بالضبط ليسمح الخادم بإنشاء/تعديل الوحدات.')); log(null, 'accountStatus = ' + x.accountStatus);
    }).catch(function (e) { log(false, 'تعذّر قراءة وثيقتك: ' + (e && e.code)); })
      .then(function () { return db.collection('units').get().then(function (s) { log(true, 'قراءة units: ' + s.size + ' وثيقة.'); }).catch(function (e) { log(false, 'قراءة units رُفضت: ' + (e && e.code) + ' ⇒ القواعد المنشورة لا تحتوي أو لا تسمح (انشر firestore.rules المرفقة).'); }); })
      .then(function () { return db.collection('unitPrivate').get().then(function (s) { log(true, 'قراءة unitPrivate: ' + s.size + ' وثيقة.'); }).catch(function (e) { log(false, 'قراءة unitPrivate رُفضت: ' + (e && e.code)); }); })
      .then(function () {
        var id = '__diag_' + Date.now(), ref = db.collection('units').doc(id);
        return ref.set({ name: 'diag', status: 'archived', order: 9999, createdAt: serverTs() }).then(function () { log(true, 'كتابة تجريبية في units نجحت (تم حذفها فوراً).'); return ref.delete().then(function () { log(true, 'حذف الوثيقة التجريبية نجح.'); }); })
          .catch(function (e) { log(false, 'الكتابة في units رُفضت: ' + (e && e.code) + ' — هذا هو سبب خطأ إنشاء الوحدة. الحل: انشر القواعد الجديدة وتأكد أن role = admin.'); });
      })
      .then(function () { return ensureGoogleDriveConfigLoaded().then(function (c) { log(!!(c && c.webAppUrl), c && c.webAppUrl ? 'رابط Google Apps Script مضبوط.' : 'رابط Google Apps Script غير مضبوط (الإعدادات ← Google Drive) ⇒ رفع الصور لن يعمل.'); }).catch(function () { log(false, 'تعذّر قراءة إعدادات Google Drive.'); }); })
      .then(function () { log(null, 'انتهى التشخيص.'); });
  };

  /* =========================================================
     9) أدوات وقت الإعلان (تعديل وقت الانتهاء بوضوح، بتوقيت الجزائر)
     ========================================================= */
  function bindAnnTime() {
    var box = $('annTimeTools'), st = $('announcementStartAtInput'), en = $('announcementEndAtInput');
    if (!box || !st || !en || box.__b) return; box.__b = true;
    box.innerHTML = '<div class="att-row"><span>اختصارات وقت الانتهاء:</span><button type="button" data-h="1">+ ساعة</button><button type="button" data-h="24">+ يوم</button><button type="button" data-h="168">+ أسبوع</button><button type="button" data-clear="1">بدون انتهاء</button></div><p class="att-preview" id="attPreview" role="status"></p>';
    var pv = $('attPreview');
    function base() { var s = algiersLocalStringToDate(st.value); return (s && !isNaN(s)) ? s : new Date(); }
    function preview() {
      en.min = st.value || '';
      if (!en.value) { pv.textContent = 'لن ينتهي الإعلان تلقائياً.'; pv.className = 'att-preview'; return; }
      var e = algiersLocalStringToDate(en.value), s = algiersLocalStringToDate(st.value);
      if (isNaN(e)) { pv.textContent = 'وقت الانتهاء غير صالح.'; pv.className = 'att-preview bad'; return; }
      if (s && !isNaN(s) && e <= s) { pv.textContent = 'وقت الانتهاء يجب أن يكون بعد وقت البداية.'; pv.className = 'att-preview bad'; return; }
      if (e <= new Date()) { pv.textContent = 'تنبيه: وقت الانتهاء في الماضي — سيُعتبر الإعلان منتهياً فوراً.'; pv.className = 'att-preview warn'; return; }
      var mins = Math.round((e - new Date()) / 60000), rel = mins < 60 ? mins + ' دقيقة' : (mins < 2880 ? Math.round(mins / 60) + ' ساعة' : Math.round(mins / 1440) + ' يوم');
      pv.textContent = 'ينتهي: ' + fmtDT(e.getTime()) + ' (توقيت الجزائر) — بعد نحو ' + rel; pv.className = 'att-preview ok';
    }
    box.querySelectorAll('button[data-h]').forEach(function (b) { b.addEventListener('click', function () { en.value = dateToAlgiersLocalInputValue(new Date(base().getTime() + Number(b.getAttribute('data-h')) * 3600000)); preview(); }); });
    box.querySelector('[data-clear]').addEventListener('click', function () { en.value = ''; preview(); });
    ['input', 'change'].forEach(function (ev) { st.addEventListener(ev, preview); en.addEventListener(ev, preview); });
    V5.previewAnnTime = preview;
  }

  /* =========================================================
     التهيئة
     ========================================================= */
  function hookNews() {
    var orig = window.openNewsDetail;
    if (typeof orig === 'function' && !orig.__v5) {
      window.openNewsDetail = function (id) {
        orig(id);
        var h = $('postEngagementHost'); if (h) SEPost.mount(h, { id: id });
        var im = $('newsDetailBody') && $('newsDetailBody').querySelector('.news-detail-img'); if (im) { im.style.cursor = 'zoom-in'; }
      };
      window.openNewsDetail.__v5 = true;
    }
    var oa = window.openAnnouncementModal;
    if (typeof oa === 'function' && !oa.__v5) {
      window.openAnnouncementModal = function (m, id) { oa(m, id); bindAnnTime(); setTimeout(function () { if (V5.previewAnnTime) V5.previewAnnTime(); }, 350); setTimeout(function () { if (V5.previewAnnTime) V5.previewAnnTime(); }, 1200); };
      window.openAnnouncementModal.__v5 = true;
    }
  }
  function markGrids() { document.querySelectorAll('.news-grid').forEach(function (g) { g.setAttribute('data-viewer-group', ''); }); }
  var mo = null;
  function watchCards() {
    if (!window.MutationObserver) return;
    mo = new MutationObserver(function () { markGrids(); observeCards(); });
    ['latestNewsGrid', 'newsPageGrid'].forEach(function (id) { var g = $(id); if (g) mo.observe(g, { childList: true }); });
  }
  function init() {
    SEViewer.init(); SEMod.init(); SENotice.initForm(); initAccountForms(); bindAnnTime(); hookNews(); markGrids(); watchCards();
    SEI18n.init(); observeCards();
    // صور تفاصيل (وحدة/نشاط/خبر) تُفتح في العارض
    document.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.matches || !t.matches('img.v3-detail-img, img.news-detail-img, img.v3-unit-img, img.v3-next-img')) return;
      if (t.closest('[data-viewer]')) return; SEViewer.open([{ url: t.currentSrc || t.src, caption: t.alt || '' }], 0);
    });
    auth.onAuthStateChanged(function (user) {
      loadMe(user).then(function () { renderAccount(); afterIntro(function () { SENotice.load(); }); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
