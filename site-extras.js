/* =========================================================
   site-extras.js — إضافات تعتمد على script.js (يُحمَّل بعده):
   آخر الأخبار، نظام الإشعارات، العودة للأعلى، الدعم الفني،
   سياسة الخصوصية، معاينة صورة التسجيل، روابط التواصل.
   كل ما يُعرض من بيانات المستخدم يمر عبر escHtml/safeImgUrl (انظر script.js).
   ========================================================= */

/* ---------- إعدادات يملؤها مالك الموقع (لا قيم مخترعة) ---------- */
const SITE_EXTRAS_CONFIG = {
  // عنوان بريد الدعم الفني — اتركه فارغاً إلى أن تحدده الإدارة. عند تركه فارغاً لا يُرسل شيء ولا تُعرض رسالة نجاح.
  supportEmail: '',
  // بريد طلبات الخصوصية (يظهر في سياسة الخصوصية). فارغ = تُعرض عبارة «تحدده إدارة الفوج».
  privacyContactEmail: '',
  // الروابط الرسمية (https فقط). فارغ = لا يظهر أي رابط.
  instagramUrl: '',
  facebookUrl: ''
};

/* ---------- نظام الإشعارات (يحل محل showAdminNotification القديمة) ---------- */
const TOAST_DURATION_MS = { success: 4500, info: 5000, warning: 7000, error: 9000 };

function getToastStack() {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function showAdminNotification(message, type) {
  const kind = ['success', 'error', 'warning', 'info'].indexOf(type) !== -1 ? type : 'info';
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const labels = { success: 'نجاح', error: 'خطأ', warning: 'تنبيه', info: 'معلومة' };
  const stack = getToastStack();

  const item = document.createElement('div');
  item.className = 'toast-item ' + kind;
  item.setAttribute('role', kind === 'error' || kind === 'warning' ? 'alert' : 'status');
  item.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');

  const icon = document.createElement('i');
  icon.className = 'fa-solid ' + icons[kind] + ' toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = labels[kind] + ': ' + String(message == null ? '' : message); // textContent = بلا حقن HTML
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'إغلاق الإشعار');
  close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    item.classList.add('fade-out');
    setTimeout(() => item.remove(), 420);
  };
  close.addEventListener('click', remove);
  item.appendChild(icon); item.appendChild(text); item.appendChild(close);
  stack.appendChild(item);
  while (stack.children.length > 4) stack.firstChild.remove();
  setTimeout(remove, TOAST_DURATION_MS[kind]);
}

// رسالة خطأ تقنية آمنة للمستخدم + تفاصيل في Console فقط (لا رموز ولا بيانات اعتماد)
function reportUserError(userMessage, technicalError) {
  if (technicalError) console.error('[Scout Elwihda]', userMessage, technicalError && technicalError.code ? technicalError.code : '', technicalError && technicalError.message ? technicalError.message : technicalError);
  showAdminNotification(userMessage, 'error');
}

/* ---------- العودة للأعلى ---------- */
function initBackToTop() {
  const btn = document.createElement('button');
  btn.id = 'backToTopBtn';
  btn.type = 'button';
  btn.className = 'floating-btn';
  btn.setAttribute('aria-label', 'العودة إلى أعلى الصفحة');
  btn.innerHTML = '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
  document.body.appendChild(btn);

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    const main = document.querySelector('.admin-main-viewport');
    if (main && main.scrollTo) main.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
  const toggle = () => {
    const y = window.pageYOffset || document.documentElement.scrollTop || 0;
    btn.classList.toggle('visible', y > 400 && !document.body.classList.contains('admin-view-open'));
  };
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
}

/* ---------- الدعم الفني ---------- */
function openSupportModal() {
  const status = document.getElementById('supportStatus');
  if (status) { status.textContent = ''; status.className = 'extras-status'; }
  openModal('supportModal');
  const first = document.getElementById('supportEmailInput');
  if (first) setTimeout(() => first.focus(), 50);
}

function initSupportForm() {
  const form = document.getElementById('supportForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('supportEmailInput').value.trim();
    const type = document.getElementById('supportTypeInput').value;
    const desc = document.getElementById('supportDescInput').value.trim();
    const status = document.getElementById('supportStatus');
    const btn = document.getElementById('supportSubmitBtn');
    const setStatus = (msg, cls) => { status.textContent = msg; status.className = 'extras-status ' + cls; };

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setStatus('يرجى إدخال بريد إلكتروني صحيح.', 'error'); return; }
    if (!type) { setStatus('يرجى اختيار نوع المشكلة.', 'error'); return; }
    if (desc.length < 10) { setStatus('يرجى وصف المشكلة بما لا يقل عن 10 أحرف.', 'error'); return; }
    if (desc.length > 2000) { setStatus('الوصف طويل جداً (الحد 2000 حرف).', 'error'); return; }

    const to = SITE_EXTRAS_CONFIG.supportEmail;
    if (!to) {
      // لا توجد آلية إرسال حقيقية بعد: لا نتظاهر بالإرسال
      setStatus('خدمة الدعم لم تُفعَّل بعد: لم تحدد الإدارة بريد الدعم الفني. لم يُرسل أي شيء.', 'warning');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> جاري التحضير...';
    // آلية حقيقية ومجانية: فتح تطبيق البريد لدى المستخدم برسالة جاهزة (لا خادم ولا مفاتيح).
    const subject = 'دعم تقني — ' + type;
    const body = 'بريد المرسل: ' + email + '\nنوع المشكلة: ' + type + '\n\n' + desc;
    window.location.href = 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> إرسال';
      setStatus('تم فتح تطبيق البريد لديك. اضغط «إرسال» هناك لإتمام الرسالة (لم تُرسل بعد).', 'warning');
    }, 800);
  });
}

/* ---------- سياسة الخصوصية ---------- */
function openPrivacyPolicy(e) {
  if (e && e.preventDefault) e.preventDefault();
  const el = document.getElementById('privacyContactLine');
  if (el) {
    el.textContent = SITE_EXTRAS_CONFIG.privacyContactEmail
      ? SITE_EXTRAS_CONFIG.privacyContactEmail
      : 'عنوان بريد طلبات الخصوصية تحدده إدارة الفوج (لم يُحدَّد بعد).';
  }
  openModal('privacyModal'); // نافذة مستقلة فوق نافذة التسجيل: لا تُفقد بيانات النموذج
}

/* ---------- روابط التواصل الاجتماعي (تظهر فقط إن وُجدت روابط https حقيقية) ---------- */
function initSocialLinks() {
  const defs = [
    { url: SITE_EXTRAS_CONFIG.instagramUrl, icon: 'fa-brands fa-instagram', label: 'Instagram' },
    { url: SITE_EXTRAS_CONFIG.facebookUrl, icon: 'fa-brands fa-facebook', label: 'Facebook' }
  ].filter((d) => /^https:\/\/[^\s"'<>]+$/i.test(d.url || ''));
  if (!defs.length) return;
  const build = () => {
    const wrap = document.createElement('span');
    wrap.className = 'social-links';
    defs.forEach((d) => {
      const a = document.createElement('a');
      a.href = d.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', d.label + ' (يفتح في نافذة جديدة)');
      a.innerHTML = '<i class="' + d.icon + '" aria-hidden="true"></i>';
      wrap.appendChild(a);
    });
    return wrap;
  };
  const footer = document.querySelector('.footer-single-line');
  if (footer) footer.appendChild(build());
  const navMenu = document.getElementById('navMenu');
  if (navMenu) { const li = document.createElement('li'); li.className = 'menu-social-item'; li.appendChild(build()); navMenu.appendChild(li); }
}

/* ---------- معاينة صورة الحساب أثناء التسجيل ---------- */
let regPhotoObjectUrl = null;

function getRegPhotoFile() {
  const input = document.getElementById('scoutParentPhotoInput');
  return input && input.files && input.files[0] ? input.files[0] : null;
}

function renderRegPhotoPreview() {
  const box = document.getElementById('scoutParentPhotoPreview');
  const consentRow = document.getElementById('photoConsentRow');
  const input = document.getElementById('scoutParentPhotoInput');
  if (!box || !input) return;
  if (regPhotoObjectUrl) { URL.revokeObjectURL(regPhotoObjectUrl); regPhotoObjectUrl = null; }
  const file = getRegPhotoFile();
  box.innerHTML = '';
  if (!file) { box.style.display = 'none'; if (consentRow) consentRow.style.display = 'none'; return; }

  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (allowed.indexOf(file.type) === -1) {
    input.value = ''; box.style.display = 'none'; if (consentRow) consentRow.style.display = 'none';
    showAdminNotification('نوع الصورة غير مدعوم. المسموح: JPG وPNG وWEBP.', 'error');
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    input.value = ''; box.style.display = 'none'; if (consentRow) consentRow.style.display = 'none';
    showAdminNotification('حجم الصورة كبير جداً. الحد الأقصى 3 ميغابايت.', 'error');
    return;
  }
  regPhotoObjectUrl = URL.createObjectURL(file);
  const wrap = document.createElement('div');
  wrap.className = 'reg-photo-preview';
  const img = document.createElement('img');
  img.src = regPhotoObjectUrl; img.alt = 'معاينة الصورة الشخصية';
  const actions = document.createElement('div');
  actions.className = 'reg-photo-actions';
  const replaceBtn = document.createElement('button');
  replaceBtn.type = 'button'; replaceBtn.textContent = 'استبدال الصورة';
  replaceBtn.addEventListener('click', () => input.click());
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button'; removeBtn.className = 'danger'; removeBtn.textContent = 'إزالة الصورة';
  removeBtn.addEventListener('click', () => { input.value = ''; renderRegPhotoPreview(); });
  actions.appendChild(replaceBtn); actions.appendChild(removeBtn);
  wrap.appendChild(img); wrap.appendChild(actions);
  box.appendChild(wrap);
  box.style.display = 'block';
  if (consentRow) consentRow.style.display = 'flex';
}

function initRegPhotoPreview() {
  const input = document.getElementById('scoutParentPhotoInput');
  if (input) input.addEventListener('change', renderRegPhotoPreview);
}

/* ---------- آخر الأخبار ---------- */
const NEWS_CATEGORY_LABELS = {
  official: 'إعلان رسمي',
  trips: 'رحلات ومخيمات',
  gathering: 'تجمع أسبوعي',
  unit: 'نشاط وحدة',
  report: 'تقرير أسبوعي',
  upcoming: 'نشاط قادم'
};

function newsCategoryLabel(key) { return NEWS_CATEGORY_LABELS[key] || 'أخبار'; }

// تاريخ النشر الفعلي: موعد النشر المجدول إن وُجد وإلا وقت الإنشاء
function newsPublishMillis(data) {
  if (data.startAt && data.startAt.toMillis) return data.startAt.toMillis();
  if (data.createdAt && data.createdAt.toMillis) return data.createdAt.toMillis();
  return Date.now(); // كتابة معلّقة (لم يؤكدها الخادم بعد) = الأحدث
}

function newsExcerpt(text, maxLen) {
  const clean = unescapeSanitized(String(text || '')).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + '…'; // لا نقطع الكلمة العربية
}

let latestNewsItems = [];   // العناصر الظاهرة حالياً مرتبة تنازلياً
let newsPendingDeepLinkId = null;
let newsLastWidthBucket = null;

function newsLimitForScreen() { return window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? 3 : 6; }

function renderHomeNews(visibleItems) {
  const grid = document.getElementById('latestNewsGrid');
  if (!grid) return;
  const sorted = (visibleItems || []).slice().sort((a, b) => newsPublishMillis(b.data) - newsPublishMillis(a.data));
  latestNewsItems = sorted;
  const limit = newsLimitForScreen();
  newsLastWidthBucket = limit;

  grid.innerHTML = '';
  if (sorted.length === 0) {
    grid.innerHTML = '<div class="news-state-box">لا توجد أخبار منشورة حالياً. ترقبوا جديد الفوج قريباً.</div>';
  } else {
    sorted.slice(0, limit).forEach((item) => {
      const d = item.data;
      const img = getItemImagePath('announcements', d);
      const dateText = new Date(newsPublishMillis(d)).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' });
      const card = document.createElement('article');
      card.className = 'news-card hover-lift';
      card.innerHTML =
        '<div class="news-card-media">' +
          (img ? '<img src="' + escHtml(img) + '" alt="' + escHtml(unescapeSanitized(d.title || '')) + '" loading="lazy" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';">' : '') +
          '<div class="news-no-image" style="' + (img ? 'display:none;' : '') + '" aria-hidden="true"><i class="fa-solid fa-campground"></i></div>' +
        '</div>' +
        '<div class="news-card-body">' +
          '<div class="news-card-meta"><span class="news-category-badge">' + escHtml(newsCategoryLabel(d.category)) + '</span>' +
          '<span><i class="fa-solid fa-calendar" aria-hidden="true"></i> ' + escHtml(dateText) + '</span></div>' +
          '<h3 class="news-card-title">' + escHtml(d.title) + '</h3>' +
          '<p class="news-card-excerpt">' + escHtml(newsExcerpt(d.content, 150)) + '</p>' +
          '<button type="button" class="news-read-more-btn" onclick="openNewsDetail(' + jsArg(item.id) + ')">اقرأ المزيد</button>' +
        '</div>';
      grid.appendChild(card);
    });
  }
  if (newsPendingDeepLinkId) {
    const found = sorted.some((i) => i.id === newsPendingDeepLinkId);
    if (found) { const id = newsPendingDeepLinkId; newsPendingDeepLinkId = null; openNewsDetail(id); }
  }
}

function newsShareLink(id) { return window.location.origin + window.location.pathname + '#news-' + encodeURIComponent(id); }

function openNewsDetail(id) {
  const item = (typeof publicAnnouncementsCache !== 'undefined' ? publicAnnouncementsCache : []).find((i) => i.id === id);
  if (!item) { showAdminNotification('تعذر العثور على هذا الخبر (قد يكون انتهى عرضه).', 'warning'); return; }
  const d = item.data;
  const title = unescapeSanitized(d.title || '');
  const img = getItemImagePath('announcements', d);
  const dateText = new Date(newsPublishMillis(d)).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' });
  const body = document.getElementById('newsDetailBody');
  body.innerHTML =
    '<span class="news-category-badge">' + escHtml(newsCategoryLabel(d.category)) + '</span> ' +
    '<span style="color:#94a3b8;font-size:0.82rem;"><i class="fa-solid fa-calendar" aria-hidden="true"></i> ' + escHtml(dateText) + '</span>' +
    '<h2 class="news-detail-title" id="newsDetailTitle">' + escHtml(title) + '</h2>' +
    (img ? '<img class="news-detail-img" src="' + escHtml(img) + '" alt="' + escHtml(title) + '" onerror="this.style.display=\'none\'">' : '') +
    '<div class="news-detail-content">' + escHtml(d.content || '') + '</div>';

  const link = newsShareLink(id);
  const share = document.getElementById('newsShareRow');
  share.innerHTML = '';
  const mk = (cls, icon, label, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'news-share-btn ' + cls;
    b.innerHTML = '<i class="' + icon + '" aria-hidden="true"></i> ' + label;
    b.addEventListener('click', fn);
    share.appendChild(b);
  };
  mk('', 'fa-solid fa-link', 'نسخ الرابط', () => {
    const done = () => showAdminNotification('تم نسخ رابط الخبر.', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => showAdminNotification('تعذر النسخ تلقائياً: ' + link, 'warning'));
    else showAdminNotification('انسخ الرابط يدوياً: ' + link, 'warning');
  });
  mk('wa', 'fa-brands fa-whatsapp', 'واتساب', () => {
    window.open('https://wa.me/?text=' + encodeURIComponent(title + ' ' + link), '_blank', 'noopener');
  });
  if (navigator.share) mk('', 'fa-solid fa-share-nodes', 'مشاركة', () => { navigator.share({ title: title, url: link }).catch(() => {}); });

  try { history.replaceState(null, '', '#news-' + encodeURIComponent(id)); } catch (_) {}
  openModal('newsDetailModal');
}

function closeNewsDetail() {
  closeModal('newsDetailModal');
  if (String(window.location.hash).indexOf('#news-') === 0) { try { history.replaceState(null, '', window.location.pathname); } catch (_) {} }
}

function initNewsDeepLink() {
  const h = String(window.location.hash || '');
  if (h.indexOf('#news-') === 0) newsPendingDeepLinkId = decodeURIComponent(h.slice(6));
}

function initNewsResize() {
  window.addEventListener('resize', () => {
    if (newsLimitForScreen() !== newsLastWidthBucket && latestNewsItems.length) renderHomeNews(latestNewsItems);
  });
}

/* ---------- تشغيل ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initBackToTop();
  initSupportForm();
  initSocialLinks();
  initRegPhotoPreview();
  initNewsDeepLink();
  initNewsResize();
});
