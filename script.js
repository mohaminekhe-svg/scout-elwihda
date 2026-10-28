/* =========================================================
   فوج الوحدة الكشفي - script.js
   نظام تسجيل الدخول وبوابة الإعلام والنشر وإدارة القادة والحسابات
   ========================================================= */

// بيانات إعداد مشروع Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCOI6oGNz7D56fSodL3Ijcd6pIrWpnBszI",
  authDomain: "elwihda-scout.firebaseapp.com",
  projectId: "elwihda-scout",
  storageBucket: "elwihda-scout.firebasestorage.app",
  messagingSenderId: "918650608903",
  appId: "1:918650608903:web:a26a170b109a06609b39a2",
  measurementId: "G-D425GT5QVR"
};

// تهيئة خدمات Firebase الأساسية
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// تطبيق ثانٍ مؤقت لـ Auth لإنشاء حسابات القادة دون إخراج الأدمن الحالي
let secondaryApp = null;
function getSecondaryAuth() {
  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryAppForLeaders");
  }
  return secondaryApp.auth();
}

const auth = firebase.auth();
const db = firebase.firestore();

let pendingDeleteUserId = null;
let pendingEditAnnouncementId = null;
let pendingDeleteAnnouncementId = null;


// ============ أدوات أمان العرض (منع XSS) ============
// escHtml: ترميز آمن وغير مزدوج — يفك الترميز السابق (من sanitizeInput) ثم يعيد ترميز النص بالكامل.
function escHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&')
    .replace(/[&<>"'`]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;', '`': '&#096;' }[m]));
}
// safeImgUrl: يقبل فقط روابط https بلا رموز خطرة أو مسارات نسبية داخل assets/، وإلا يرجع ''.
function safeImgUrl(u) {
  if (typeof u !== 'string') return '';
  const t = u.trim();
  if (!t) return '';
  if (/^https:\/\/[^\s"'<>`\\]+$/i.test(t)) return t;
  if (/^assets\/images\/[A-Za-z0-9_\/.\-]+$/.test(t) && t.indexOf('..') === -1) return t;
  return '';
}
// jsArg: وسيط نصي آمن داخل خاصية onclick (سواء بعلامات اقتباس مفردة أو مزدوجة).
function jsArg(v) { return escHtml(JSON.stringify(String(v === null || v === undefined ? '' : v))); }

// تنقية النصوص وحمايتها من الإدخالات الضارة
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// منع إدخال الأرقام والرموز في حقول الاسم واللقب
function validateAlphaOnly(input) {
  input.value = input.value.replace(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '');
}

// التهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  enforcePasswordFieldsMasking();
  checkAndEnforceLockOnBoot();
  initPhoneInputs();
  initPasswordValidationLeader();
  initPasswordValidationAdminLeader();
  initPasswordValidationScout();
  initHelpButtons();
  initDateTimePickers();
  initDriveDropzones();
  attachImageFileChecker('announcementImageFileInput', 'announcements');
  attachImageFileChecker('galleryImageFileInput', 'gallery');
  listenToAuthStatus();
});

/* --- التبديل بين ألسنة لوحة الأدمن --- */
function switchAdminTab(tabId, btnElement) {
  // منع التبديل أو عرض أي تبويب إداري إذا كانت الجلسة مقفلة
  if (isSessionLocked()) {
    lockIdleSession(tabId);
    return;
  }

  const tabs = document.querySelectorAll('.admin-tab-content');
  tabs.forEach(tab => tab.classList.remove('active-tab'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add('active-tab');
  }

  const viewport = document.querySelector('.admin-main-viewport');
  if (viewport) {
    viewport.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const buttons = document.querySelectorAll('.admin-nav-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  if (btnElement) {
    btnElement.classList.add('active');
  }

  // إغلاق القائمة الجانبية تلقائياً على الهاتف بعد اختيار تبويب
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('adminSidebarOverlay');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  }

  if (tabId === 'units-tab' && window.V3) { V3.loadAdminUnits(); }

  // تحميل بيانات الإعلانات عند فتح تبويب الإعلانات
  if (tabId === 'announcements-tab') {
    ensureGoogleDriveConfigLoaded();
    loadAnnouncementsAdmin();
    prefillMarqueeQuickEdit();
  }

  // تحميل قائمة القادة وحسابات الحذف عند فتح تبويبهم
  if (tabId === 'leaders-tab') {
    fetchLeadersList();
    fetchAllAccountsForDeleteView();
  }

  // تحميل قائمة الكشافة والأولياء عند فتح تبويبهم
  if (tabId === 'scouts-tab') {
    loadScoutsParentsAdmin();
  }

  // تحميل صور المعرض عند فتح تبويبه
  if (tabId === 'gallery-tab') {
    ensureGoogleDriveConfigLoaded();
    loadGalleryAdmin();
  }

  if (tabId === 'settings-tab') {
    refreshSettingsTab();
  }

  // تحميل الإحصائيات الحقيقية عند فتح تبويبها
  if (tabId === 'statistics-tab') {
    loadStatisticsAdmin();
  }

  // حفظ التبويب الحالي في الرابط باستخدام replaceState (لتجنب تكديس سجل المتصفح بحالات يمكن الرجوع إليها)
  if (!isSessionLocked()) {
    history.replaceState({ adminTab: tabId }, '', window.location.pathname + '#admin-' + tabId);
  }
}

/* --- إدارة النوافذ المنبثقة (Modals) --- */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (modalId === 'deleteAccountsListModal') {
      fetchAllAccountsForDeleteView();
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
    if (!document.body.classList.contains('admin-view-open')) {
      document.body.style.overflow = 'auto';
    }
  }
}

window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
    if (!document.body.classList.contains('admin-view-open')) {
      document.body.style.overflow = 'auto';
    }
  }
});

/* --- إخفاء صارم لكلمات المرور (تم إلغاء إظهار كلمة المرور بالكامل لأسباب أمنية) --- */
function enforcePasswordFieldsMasking() {
  // إزالة أي أيقونة عين متبقية ومنع تحويل حقول كلمة المرور إلى نص واضح
  document.querySelectorAll('.toggle-password').forEach((el) => el.remove());
  const pwInputs = document.querySelectorAll('input[type="password"]');
  pwInputs.forEach((input) => {
    input.setAttribute('autocomplete', input.getAttribute('autocomplete') || 'off');
    const obs = new MutationObserver(() => {
      if (input.type !== 'password') {
        input.type = 'password';
      }
    });
    obs.observe(input, { attributes: true, attributeFilter: ['type'] });
  });
}

/* --- التحكم في نافذة "من أنت؟" --- */
function handleRoleSelectionChange() {
  const nextBtn = document.getElementById('roleNextBtn');
  if (nextBtn) {
    nextBtn.style.display = 'block';
  }
}

function proceedToRoleRegistration() {
  const selectedRole = document.querySelector('input[name="userRoleChoice"]:checked');
  if (!selectedRole) return;

  const spinner = document.getElementById('roleSelectionSpinner');
  const nextBtn = document.getElementById('roleNextBtn');

  spinner.style.display = 'flex';
  nextBtn.style.display = 'none';

  setTimeout(() => {
    spinner.style.display = 'none';
    closeModal('roleSelectionModal');

    if (selectedRole.value === 'leader') {
      openLeaderRegistration('leader_request');
    } else {
      // تحديد الاختيار المسبق (كشاف/ولي) داخل الاستمارة حسب ما اختير في "من أنت؟"
      const matchingRadio = document.querySelector(`input[name="scoutParentRoleChoice"][value="${selectedRole.value}"]`);
      if (matchingRadio) matchingRadio.checked = true;
      const headingEl = document.getElementById('scoutParentModalHeading');
      if (headingEl) {
        headingEl.innerText = selectedRole.value === 'parent' ? 'إنشاء حساب ولي أمر' : 'إنشاء حساب كشاف';
      }
      openModal('scoutParentRegisterModal');
    }
  }, 1000);
}

/* --- مراقبة حالة تسجيل الدخول --- */
/* =========================================================
   نظام الصلاحيات المركزي — انعكاس على الواجهة فقط لإظهار/إخفاء الأزرار بذكاء.
   ⚠️ هذا ليس مصدر الحماية الحقيقي. المصدر الحقيقي هو Firestore/Storage
   Security Rules (انظر firestore.rules / storage.rules) — أي طلب سيُرفض من
   طرف Firebase نفسه حتى لو تجاوز هذا الفحص عبر التلاعب بالواجهة أو DevTools.
   ========================================================= */
const ADMIN_ONLY_PERMISSIONS = [
  'roles.manage', 'permissions.manage', 'users.delete', 'users.suspend',
  'users.reactivate', 'security.manage', 'settings.manage', 'admin.access',
  'admin.manage', 'system.manage'
];

let currentUserRole = null;
let currentUserPermissions = {};
let currentUserAccountStatus = null;

function can(action) {
  if (currentUserAccountStatus === 'suspended' || currentUserAccountStatus === 'locked') return false;
  if (currentUserRole === 'admin') return true;
  if (ADMIN_ONLY_PERMISSIONS.indexOf(action) !== -1) return false;
  return currentUserPermissions[action] === true;
}

function resetCurrentUserPermissionState() {
  currentUserRole = null;
  currentUserPermissions = {};
  currentUserAccountStatus = null;
}

// تطبيق واجهة لوحة الأدمن الصحيحة حسب الدور الحقيقي — هذا هو الإصلاح الجوهري
// لمشكلة "القائد يرى نفس واجهة الأدمن بالضبط". يُستدعى بعد كل تسجيل دخول
// (أدمن، بوابة الإعلام، أو استعادة الجلسة بعد Refresh) بعد أن تكون
// currentUserRole/currentUserPermissions قد تحدّثت فعلياً من Firestore.
function applyAdminPanelUIForRole() {
  const isAdminUser = currentUserRole === 'admin';

  document.querySelectorAll('.admin-only-nav').forEach((btn) => {
    btn.style.display = isAdminUser ? '' : 'none';
  });

  document.querySelectorAll('.admin-nav-btn[data-requires-permission]').forEach((btn) => {
    const perm = btn.getAttribute('data-requires-permission');
    btn.style.display = (isAdminUser || can(perm)) ? '' : 'none';
  });

  const titleEl = document.getElementById('adminWelcomeTitle');
  const subtitleEl = document.getElementById('adminWelcomeSubtitle');
  const sidebarTitleEl = document.getElementById('adminSidebarTitle');

  if (titleEl) {
    titleEl.innerText = isAdminUser ? 'مرحبا بك في لوحة الإدارة' : 'مرحبًا بك في بوابة الإعلام والنشر';
  }
  if (subtitleEl) {
    subtitleEl.innerText = isAdminUser
      ? 'من هنا يمكنك إدارة وتحديث كافة أقسام ومحتويات الموقع بكل سهولة ودون الحاجة لتعديل البرمجة في كل مرة.'
      : 'من هنا يمكنك إدارة الإعلانات والمعرض الرقمي حسب الصلاحيات الممنوحة لحسابك من طرف الإدارة.';
  }
  const settingsNavLabel = document.getElementById('settingsNavLabel');
  if (settingsNavLabel) settingsNavLabel.innerText = isAdminUser ? 'إعدادات الأدمن' : 'إعدادات الحساب';
  document.querySelectorAll('[data-requires-action]').forEach((el) => {
    el.style.display = can(el.getAttribute('data-requires-action')) ? '' : 'none';
  });

  if (sidebarTitleEl) {
    sidebarTitleEl.innerText = isAdminUser ? 'واجهة الأدمن' : 'بوابة الإعلام والنشر';
  }

  // إن كان التبويب المفتوح حالياً لا يُفترض أن يراه هذا المستخدم (مثلاً بقي
  // مفتوحاً من جلسة أدمن سابقة على نفس المتصفح)، أعده للرئيسية فوراً
  if (!isAdminUser) {
    const activeTab = document.querySelector('.admin-tab-content.active-tab');
    if (activeTab && activeTab.id !== 'welcome-tab') {
      const correspondingBtn = document.querySelector(`.admin-nav-btn[onclick*="'${activeTab.id}'"]`);
      if (!correspondingBtn || correspondingBtn.style.display === 'none') {
        const homeBtn = document.querySelector('.admin-nav-btn[onclick*="\'welcome-tab\'"]');
        switchAdminTab('welcome-tab', homeBtn);
      }
    }
  }
}

// إظهار/إخفاء عنصر حسب حالة الدخول. عناصر القائمة الجانبية للهاتف (.mobile-only) تتحكم فيها
// قاعدة CSS بـ !important، ولا يستطيع style.display المضمّن تجاوزها، لذلك نستخدم صنفاً (auth-hidden).
function setAuthVisible(el, visible, displayType) {
  if (el.classList.contains('mobile-only')) {
    el.classList.toggle('auth-hidden', !visible);
  } else {
    el.style.display = visible ? displayType : 'none';
  }
}

function listenToAuthStatus() {
  auth.onAuthStateChanged((user) => {
    const guestBtns = document.querySelectorAll('.auth-guest-btn');
    const userBtns = document.querySelectorAll('.auth-user-btn');
    const cardSection = document.getElementById('userCardDisplaySection');

    // المعرض وصفحة الإعلانات: الوصول يعتمد فقط على كون المستخدم مسجلاً دخوله
    // أم لا (أي دور)، وليس على انتظار جلب بيانات الدور/الصلاحيات
    updateGalleryAccessUI(user);
    updateAnnouncementsAccessUI(user);

    if (user) {
      guestBtns.forEach(b => setAuthVisible(b, false, 'inline-flex'));
      userBtns.forEach(b => setAuthVisible(b, true, 'inline-flex'));

      db.collection('users').doc(user.uid).get().then((doc) => {
        if (doc.exists) {
          const userData = doc.data();
          currentUserRole = userData.role || null;
          currentUserPermissions = userData.permissions || {};
          currentUserAccountStatus = userData.accountStatus || null;
          if (currentUserRole === 'admin') { fetchLeadersList(); fetchAllAccountsForDeleteView(); }

          renderScoutOrLeaderCard(userData);
          if (cardSection) cardSection.style.display = 'block';
          updateNavUserChip(userData);
          updateDashboardAccessButton(userData);
          syncAuthEmailToFirestore(user, userData);

          // التحقق الصارم من حالة القفل قبل استعادة أي شاشة إدارية بعد التحديث (F5)
          if (verifySessionLockStateForUser(userData)) {
            return;
          }
          restoreAdminRouteIfAny(userData);
        }
      });
    } else {
      clearPersistedSessionLock();
      guestBtns.forEach(b => setAuthVisible(b, true, 'inline-flex'));
      userBtns.forEach(b => setAuthVisible(b, false, 'inline-flex'));
      if (cardSection) cardSection.style.display = 'none';
      clearNavUserChip();
      updateDashboardAccessButton(null);
      resetCurrentUserPermissionState();
      closeAllModalsAndOverlays();
      if (window.location.hash.indexOf('#admin-') === 0 || window.location.hash === '#locked') {
        history.replaceState(null, '', window.location.pathname + '#home-page');
      }
    }
  });
}

// التحكم في وصول الزوار لصفحة المعرض: محجوبة عن غير المسجلين
function updateGalleryAccessUI(user) {
  const lockBox = document.getElementById('galleryLoginRequiredBox');
  const authedContent = document.getElementById('galleryAuthedContent');
  if (!lockBox || !authedContent) return;

  if (user) {
    lockBox.style.display = 'none';
    authedContent.style.display = 'block';
    renderPublicGallery();
  } else {
    lockBox.style.display = 'block';
    authedContent.style.display = 'none';
    if (unsubscribePublicGalleryListener) {
      unsubscribePublicGalleryListener();
      unsubscribePublicGalleryListener = null;
    }
  }
}

// التحكم في وصول الزوار لصفحة الإعلانات: محجوبة عن غير المسجلين
// (الشريط العلوي settings/announcements منفصل تماماً ويبقى عاماً للجميع)
function updateAnnouncementsAccessUI(user) {
  // الأخبار/الإعلانات المنشورة عامة للجميع (قرار الإدارة). المسودات تبقى محمية بقواعد Firestore.
  const lockBox = document.getElementById('announcementsLoginRequiredBox');
  const container = document.getElementById('publicAnnouncementsContainer');
  if (!container) return;
  if (lockBox) lockBox.style.display = 'none';
  container.style.display = 'flex';
  if (!unsubscribePublicAnnouncementsListener) renderPublicAnnouncements();
}

// تحديث بطاقة المستخدم المصغّرة في القائمة (اسم حقيقي + صورة حقيقية أو placeholder)
// بعد تأكيد تغيير البريد من Firebase، نحدّث نسخة Firestore ليتطابق البريد (بحسب Auth الفعلي)
function syncAuthEmailToFirestore(user, userData) {
  if (!user.email || !userData.email) return;
  if (user.email.toLowerCase() === String(userData.email).toLowerCase()) return;
  const update = { email: user.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  db.collection('users').doc(user.uid).update(update).catch(() => {});
  db.collection('leaders').doc(user.uid).update(update).catch(() => {}); // يُرفض لغير الأدمن حسب Rules، وهذا متوقع
}

function updateNavUserChip(userData) {
  const fullName = sanitizeInput(userData.fullName || (userData.firstName ? `${userData.firstName} ${userData.lastName || ''}`.trim() : 'عضو الفوج'));
  const photoURL = userData.photoURL || null;

  ['desktop', 'mobile'].forEach((prefix) => {
    const nameEl = document.getElementById(`${prefix}UserChipName`);
    const avatarEl = document.getElementById(`${prefix}UserChipAvatar`);
    if (nameEl) nameEl.innerText = fullName;
    if (avatarEl) {
      avatarEl.innerHTML = photoURL
        ? (safeImgUrl(photoURL) ? `<img src="${safeImgUrl(photoURL)}" alt="${escHtml(fullName)}">` : `<i class="fa-solid fa-circle-user"></i>`)
        : `<i class="fa-solid fa-circle-user"></i>`;
    }
  });
}

// تفريغ بطاقة المستخدم المصغّرة بالكامل عند تسجيل الخروج (لا تبقي بيانات المستخدم السابق ظاهرة)
function clearNavUserChip() {
  ['desktop', 'mobile'].forEach((prefix) => {
    const nameEl = document.getElementById(`${prefix}UserChipName`);
    const avatarEl = document.getElementById(`${prefix}UserChipAvatar`);
    if (nameEl) nameEl.innerText = '';
    if (avatarEl) avatarEl.innerHTML = `<i class="fa-solid fa-circle-user"></i>`;
  });
}

/* =========================================================
   التنقل بين صفحات الموقع العامة والتحكم بالرابط (#hash)
   ========================================================= */
const pdfFormUrl = './registration-form.pdf';
const VALID_SITE_PAGES = ['home-page', 'latest-news-page', 'next-gathering-page', 'bulletin-page', 'units-page', 'gallery-page', 'about-page'];

function showPage(pageId, opts) {
  const pages = document.querySelectorAll('.site-page');
  pages.forEach((p) => p.classList.remove('active-page'));

  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add('active-page');
  }

  const buttons = document.querySelectorAll('.nav-btn');
  buttons.forEach((btn) => btn.classList.remove('active'));

  const activeBtn = document.querySelector(`.nav-btn[onclick*="'${pageId}'"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const navMenu = document.getElementById('navMenu');
  if (navMenu) navMenu.classList.remove('active');

  if (document.body.classList.contains('menu-scroll-locked')) window.__forceScrollTop = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (VALID_SITE_PAGES.includes(pageId)) {
    // كل واجهة تأخذ مدخلاً في سجل المتصفح ليعمل زر الرجوع بين الواجهات؛ لا نضيف مدخلاً مكرراً ولا عند الاستعادة من الرابط
    const targetHash = '#' + pageId;
    if (window.location.hash === targetHash || (opts && opts.noHistory)) {
      if (window.location.hash !== targetHash && opts && opts.noHistory === 'replace') history.replaceState(null, '', targetHash);
    } else {
      history.pushState(null, '', targetHash);
    }
  }
}

// استرجاع المكان الصحيح عند تحميل/تحديث الصفحة اعتماداً على الرابط (#hash)
(function restoreInitialRouteFromHash() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) return;

  if (hash === 'locked') {
    window.__pendingAdminLock = true;
    return;
  }

  if (hash.indexOf('admin-') === 0) {
    // قسم إداري: يُستعاد فقط بعد التحقق من صلاحية المستخدم الحقيقية وعدم قفل الجلسة (انظر restoreAdminRouteIfAny)
    window.__pendingAdminRoute = hash.replace('admin-', '');
  } else if (VALID_SITE_PAGES.includes(hash)) {
    showPage(hash);
  }
})();

// الضغط على بطاقة المستخدم المصغّرة ينتقل إلى بطاقته الكاملة في الصفحة الرئيسية
function scrollToUserCard() {
  showPage('home-page');
  const cardSection = document.getElementById('userCardDisplaySection');
  if (cardSection) {
    setTimeout(() => cardSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
  }
}

// استعادة قسم لوحة الأدمن من الرابط (#admin-xxx) بعد Refresh — فقط إذا كان المستخدم يملك صلاحية فعلية
const VALID_ADMIN_TABS = ['welcome-tab', 'leaders-tab', 'scouts-tab', 'announcements-tab', 'gallery-tab', 'units-tab', 'statistics-tab', 'settings-tab'];

function setAdminViewActive(active) {
  const fullBlueScreen = document.getElementById('fullAdminBlueScreen');
  if (fullBlueScreen) fullBlueScreen.style.display = active ? 'flex' : 'none';
  if (active) {
    document.body.classList.add('admin-view-open');
    document.documentElement.classList.add('admin-view-open');
  } else {
    document.body.classList.remove('admin-view-open');
    document.documentElement.classList.remove('admin-view-open');
  }
}

function restoreAdminRouteIfAny(userData) {
  const pendingTab = window.__pendingAdminRoute;
  if (!pendingTab) return;
  window.__pendingAdminRoute = null;

  if ((userData.role === 'admin' || userData.role === 'leader')
      && userData.accountStatus !== 'suspended' && userData.accountStatus !== 'locked') {
    // إذا كانت الجلسة مقفلة أو انتهت مهلة عدم النشاط، يُمنع فتح لوحة الإدارة عند F5 ويُفرض قفل الجلسة فوراً
    if (isSessionLocked() || hasInactivityExpired()) {
      lockIdleSession(VALID_ADMIN_TABS.includes(pendingTab) ? pendingTab : 'welcome-tab');
      return;
    }

    setAdminViewActive(true);

    const tabId = VALID_ADMIN_TABS.includes(pendingTab) ? pendingTab : 'welcome-tab';
    const btnElement = document.querySelector(`.admin-nav-btn[onclick*="'${tabId}'"]`);
    switchAdminTab(tabId, btnElement);
    applyAdminPanelUIForRole();
  } else {
    // المستخدم لا يملك صلاحية admin/leader — إعادة توجيه آمنة بدل عرض محتوى الأدمن
    history.replaceState(null, '', window.location.pathname);
    showPage('home-page');
  }
}

function handleUserLogout() {
  clearPersistedSessionLock();
  auth.signOut().then(() => {
    closeAllModalsAndOverlays();
    history.replaceState(null, '', window.location.pathname + '#home-page');
    window.location.reload();
  });
}

/* --- تسجيل دخول المستخدم العادي (كشاف/ولي/قائد صاحب حساب موجود) --- */
const userLoginForm = document.getElementById('userLoginForm');
if (userLoginForm) {
  userLoginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = document.getElementById('userLoginEmail').value.trim();
    const password = document.getElementById('userLoginPassword').value;
    const checkingBox = document.getElementById('userLoginCheckingBox');
    const errorMsg = document.getElementById('userLoginError');
    const submitBtn = document.getElementById('userLoginSubmitBtn');

    errorMsg.innerText = '';
    checkingBox.style.display = 'flex';
    submitBtn.disabled = true;

    auth.signInWithEmailAndPassword(email, password)
      .then((userCredential) => db.collection('users').doc(userCredential.user.uid).get())
      .then((doc) => {
        const status = doc.exists ? doc.data().accountStatus : null;
        if (status === 'suspended' || status === 'locked') {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'تم توقيف هذا الحساب لأغراض أمنية. سيتم مراجعته من طرف الإدارة.';
          return;
        }
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        userLoginForm.reset();
        closeModal('roleSelectionModal');
        showAdminNotification('تم تسجيل الدخول بنجاح!', 'success');
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        logFailedLoginAttempt(email);
        errorMsg.innerText = getFriendlyAuthErrorMessage(error) || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      });
  });
}

// نسيت كلمة المرور — يستخدم Firebase Auth الأصلي، برسالة عامة لا تكشف عن وجود الحساب من عدمه
/* =========================================================
   حماية تسجيل الدخول من المحاولات الفاشلة
   ⚠️ قرار تصميم مقصود: لا نقوم ببناء عدّاد "قفل تلقائي بعد N محاولات" يعتمد
   على كتابة Firestore من طرف مستخدم غير موقّع دخوله (محاولة فاشلة = بلا جلسة).
   السبب: أي رقم/Endpoint مفتوح للكتابة من مجهول لتغيير accountStatus لحساب
   معيّن يفتح ثغرة عكسية خطيرة: أي شخص (حتى بدون معرفة كلمة المرور) يستطيع
   قفل حساب أي عضو — بما فيه الأدمن — بمجرد إرسال طلبات وهمية متكررة. هذا
   أخطر من عدم وجود قفل أصلاً.
   الحماية الحقيقية ضد Brute Force هنا هي حماية Firebase Auth نفسها
   (auth/too-many-requests) — وهي حماية Google الحقيقية من طرف الخادم، تعمل
   تلقائياً ولا يمكن تجاوزها من الواجهة، ولا تحتاج أي كود إضافي منا لتفعيلها.
   ما نضيفه هنا هو فقط: (1) رسالة واضحة للمستخدم عند حدوثها، و(2) سجل تدقيق
   Write-only في securityEvents لمراجعة الأدمن لاحقاً — بدون أي قفل تلقائي
   لأي حساب، وبالتأكيد بدون قفل حساب الأدمن أبداً بهذه الطريقة.
   ========================================================= */
function logFailedLoginAttempt(email) {
  db.collection('securityEvents').add({
    type: 'failed_login',
    email: email || 'unknown',
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => { /* تجاهل بصمت — هذا سجل تدقيق ثانوي، لا يجب أن يعطل تجربة الدخول */ });
}

function getFriendlyAuthErrorMessage(error) {
  if (error && error.code === 'auth/too-many-requests') {
    return 'تم إيقاف محاولات الدخول مؤقتاً من طرف Firebase بسبب عدة محاولات خاطئة متتالية لهذا الحساب. هذا إجراء أمني مؤقت من Google نفسها (وليس قفلاً دائماً للحساب) — أعد المحاولة بعد قليل، أو استخدم "نسيت كلمة المرور؟" لاسترجاع الدخول فوراً دون انتظار.';
  }
  return null; // لا توجد رسالة خاصة؛ استخدم الرسالة العامة المعتادة
}

let lastResetRequestAt = 0;
function handleForgotPassword() {
  const emailInput = document.getElementById('userLoginEmail');
  const errorMsg = document.getElementById('userLoginError');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errorMsg.innerText = 'يرجى كتابة بريد إلكتروني صحيح في حقل البريد أعلاه أولاً.';
    return;
  }
  // حد مبدئي في الواجهة (ليس حماية أمنية؛ الحماية الفعلية من Firebase): طلب واحد كل 60 ثانية
  const wait = 60000 - (Date.now() - lastResetRequestAt);
  if (wait > 0) {
    errorMsg.innerText = 'تم إرسال طلب قبل قليل. انتظر ' + Math.ceil(wait / 1000) + ' ثانية قبل إعادة المحاولة.';
    return;
  }
  lastResetRequestAt = Date.now();

  errorMsg.innerText = 'جاري الإرسال...';
  // رسالة موحّدة لا تكشف إن كان البريد مسجلاً أم لا
  const genericMsg = 'إذا كان هذا البريد مرتبطاً بحساب، فستصلك رسالة بخطوات إعادة تعيين كلمة المرور. تفقّد أيضاً مجلد الرسائل غير المرغوبة (Spam).';

  auth.sendPasswordResetEmail(email)
    .then(() => { errorMsg.innerText = genericMsg; })
    .catch((err) => {
      if (err && err.code === 'auth/network-request-failed') { errorMsg.innerText = 'تعذّر الاتصال بالإنترنت. حاول مجدداً.'; lastResetRequestAt = 0; return; }
      if (err && err.code === 'auth/too-many-requests') { errorMsg.innerText = 'طلبات كثيرة. انتظر بعض الوقت ثم أعد المحاولة.'; return; }
      errorMsg.innerText = genericMsg;
    });
}

// مهلة لأي Promise (لمنع بقاء العملية معلّقة للأبد)
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('انتهت المهلة (' + Math.round(ms / 1000) + ' ثانية)')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// رسائل خطأ التسجيل بالعربية — مع شرح حالة "البريد موجود" بعد حذف حساب من الموقع فقط
function getRegistrationErrorMessage(error) {
  switch (error && error.code) {
    case 'auth/email-already-in-use':
      return 'هذا البريد مسجّل بالفعل في Firebase Authentication. إن كان الحساب قد حُذف سابقاً من الموقع فقط، فحساب الدخول نفسه ما زال موجوداً (الموقع لا يستطيع حذفه). على الأدمن حذفه من: Firebase Console ← Authentication ← Users ← ⋮ ← Delete account، ثم أعد التسجيل.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صحيحة.';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل مع أرقام ورموز.';
    case 'auth/network-request-failed':
      return 'تعذّر الاتصال بالإنترنت. تحقق من الشبكة وحاول مجدداً.';
    case 'permission-denied':
      return 'تم إنشاء حساب الدخول لكن تعذّر حفظ بياناتك (رُفض من قواعد Firestore). تواصل مع الإدارة.';
    default:
      return 'خطأ في إنشاء الحساب: ' + (error && error.message ? error.message : '') + (error && error.code ? ' (' + error.code + ')' : '');
  }
}

function reloadPageAfterRegister() {
  window.location.reload();
}

/* =========================================================
   تسجيل حساب قائد جديد (ذاتي) — الحساب يبقى "قيد المراجعة" حتى يوافق الأدمن
   ========================================================= */
const leaderRegisterForm = document.getElementById('leaderRegisterForm');
if (leaderRegisterForm) {
  leaderRegisterForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const fullName = sanitizeInput(document.getElementById('leaderFullName').value.trim());
    const email = document.getElementById('leaderRegEmail').value.trim();
    const password = document.getElementById('leaderRegPassword').value;
    const confirmPassword = document.getElementById('leaderRegConfirmPassword').value;

    const checkingBox = document.getElementById('leaderRegCheckingBox');
    const errorMsg = document.getElementById('leaderRegError');
    const successMsg = document.getElementById('leaderRegSuccess');
    const submitBtn = document.getElementById('leaderRegSubmitBtn');

    errorMsg.innerText = '';
    successMsg.style.display = 'none';

    if (!fullName || !/^[\u0600-\u06FFa-zA-Z\s]+$/.test(fullName)) {
      errorMsg.innerText = 'يرجى إدخال اسم صحيح بدون أرقام أو رموز.';
      return;
    }
    if (password !== confirmPassword) {
      errorMsg.innerText = 'كلمتا المرور غير متطابقتين!';
      return;
    }
    if (password.length < 8 || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errorMsg.innerText = 'كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل مع أرقام ورموز!';
      return;
    }

    if (!document.getElementById('leaderRegConsent').checked) {
      errorMsg.innerText = 'يجب الموافقة على سياسة الخصوصية للمتابعة.';
      return;
    }

    checkingBox.style.display = 'flex';
    submitBtn.disabled = true;

    const signupType = currentLeaderSignupType;
    let authUserCreated = false;

    // فحص حديث لحالة التسجيل قبل إنشاء حساب Authentication (تفادياً لحسابات يتيمة).
    // الحماية الحقيقية في Firestore Rules أيضاً — هذا الفحص لتجربة المستخدم فقط.
    isMediaSignupOpen()
      .then((open) => {
        if (!open) { const e = new Error('closed'); e.code = 'registration/closed'; throw e; }
        return auth.createUserWithEmailAndPassword(email, password);
      })
      .then((userCredential) => {
        authUserCreated = true;
        const uid = userCredential.user.uid;
        userCredential.user.sendEmailVerification().catch(() => {}); // تحقق من البريد (مجاني)
        const leaderData = {
          uid: uid,
          fullName: fullName,
          email: email,
          role: 'leader',
          signupType: signupType,
          accountStatus: 'pending_verification',
          verificationStatus: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (signupType === 'media_officer') leaderData.leaderRoleTitle = 'مسؤول إعلام';
        return Promise.all([
          db.collection('users').doc(uid).set(leaderData),
          db.collection('leaders').doc(uid).set(leaderData)
        ]);
      })
      .then(() => {
        checkingBox.style.display = 'none';
        submitBtn.style.display = 'none';
        successMsg.innerText = 'تم إنشاء حسابك بنجاح! حالته الآن «بانتظار الموافقة» من الإدارة، ولن تحصل على أي صلاحيات قبل ذلك. أُرسل رابط تحقق إلى بريدك الإلكتروني.';
        successMsg.style.display = 'block';
        fetchLeadersList();
        fetchAllAccountsForDeleteView();
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        const closed = (error && (error.code === 'registration/closed' || error.code === 'permission-denied'));
        // إن أُنشئ حساب Authentication ثم فشلت كتابة بياناته لأي سبب، نحذف الحساب اليتيم
        if (authUserCreated && auth.currentUser) { auth.currentUser.delete().catch(() => {}); }
        if (closed) {
          closeModal('leaderRegisterModal');
          showRegistrationClosed();
          return;
        }
        errorMsg.innerText = getRegistrationErrorMessage(error);
      });
  });
}

/* =========================================================
   تسجيل حساب كشاف/ولي جديد (ذاتي) — نشط فوراً، لا يحتاج مراجعة
   ========================================================= */
const scoutParentRegisterForm = document.getElementById('scoutParentRegisterForm');
if (scoutParentRegisterForm) {
  scoutParentRegisterForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const roleChoice = document.querySelector('input[name="scoutParentRoleChoice"]:checked');
    const selectedRole = roleChoice ? roleChoice.value : 'scout';
    const unitSel = document.getElementById('scoutParentUnit');
    const unitId = unitSel.value;
    const unitOpt = unitSel.options[unitSel.selectedIndex];
    const unit = unitOpt && unitOpt.dataset ? (unitOpt.dataset.name || '') : '';
    const photoFile = document.getElementById('scoutParentPhotoInput').files[0];
    const fullName = sanitizeInput(document.getElementById('scoutParentFullName').value.trim());
    const parentPhone = document.getElementById('scoutParentPhone').value.trim();
    const scoutPhone = document.getElementById('scoutSonPhone').value.trim();
    const email = document.getElementById('scoutParentEmail').value.trim();
    const password = document.getElementById('scoutParentPassword').value;
    const confirmPassword = document.getElementById('scoutParentConfirmPassword').value;

    const checkingBox = document.getElementById('scoutParentCheckingBox');
    const checkingText = checkingBox ? checkingBox.querySelector('p') : null;
    const errorMsg = document.getElementById('scoutParentError');
    const successMsg = document.getElementById('scoutParentSuccess');
    const submitBtn = document.getElementById('scoutParentSubmitBtn');
    const doneBtn = document.getElementById('scoutParentDoneReloadBtn');

    errorMsg.innerText = '';
    successMsg.style.display = 'none';

    if (!unitId || !unit) {
      errorMsg.innerText = 'يرجى اختيار الوحدة.';
      return;
    }
    if (!fullName || !/^[\u0600-\u06FFa-zA-Z\s]+$/.test(fullName)) {
      errorMsg.innerText = 'يرجى إدخال اسم صحيح بدون أرقام أو رموز.';
      return;
    }
    if (!/^0[0-9]{9}$/.test(parentPhone) || !/^0[0-9]{9}$/.test(scoutPhone)) {
      errorMsg.innerText = 'يرجى إدخال رقمي هاتف صحيحين (10 أرقام).';
      return;
    }
    if (password !== confirmPassword) {
      errorMsg.innerText = 'كلمتا المرور غير متطابقتين!';
      return;
    }
    if (password.length < 8 || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errorMsg.innerText = 'كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل مع أرقام ورموز!';
      return;
    }
    if (!document.getElementById('scoutParentConsent').checked) {
      errorMsg.innerText = 'يجب الموافقة على سياسة الخصوصية للمتابعة.';
      return;
    }
    if (photoFile) {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowedTypes.includes(photoFile.type)) {
        errorMsg.innerText = 'نوع الصورة غير مدعوم. الأنواع المسموحة: JPG, PNG, WEBP.';
        return;
      }
      if (photoFile.size > 3 * 1024 * 1024) {
        errorMsg.innerText = 'حجم الصورة كبير جداً. الحد الأقصى 3 ميغابايت.';
        return;
      }
      if (!document.getElementById('scoutParentPhotoConsent').checked) {
        errorMsg.innerText = 'يرجى الموافقة على رفع الصورة وعرضها، أو أزل الصورة للمتابعة بدونها.';
        return;
      }
    }

    checkingBox.style.display = 'flex';
    if (checkingText) checkingText.innerText = 'جاري إنشاء حسابك...';
    submitBtn.disabled = true;

    let createdUid = null;
    let docSaved = false;
    let photoUploadFailed = false;

    auth.createUserWithEmailAndPassword(email, password)
      .then((userCredential) => {
        createdUid = userCredential.user.uid;
        if (!photoFile) return null;

        if (checkingText) checkingText.innerText = 'جاري رفع الصورة إلى Google Drive...';
        // الصورة اختيارية: فشلها لا يُفشل التسجيل، لكن لا نُظهر نجاحاً كاذباً (رسالة صريحة) ولا نحفظ رابطاً إلا بعد نجاح الرفع
        return withTimeout(
          uploadImageToGoogleDrive(photoFile, 'profiles', (m) => { if (checkingText) checkingText.innerText = m; }),
          60000
        ).catch((photoError) => {
          console.warn('[Scout Elwihda] Profile photo upload failed (non-fatal):', photoError && photoError.message);
          photoUploadFailed = true;
          return null;
        });
      })
      .then((media) => {
        if (checkingText) checkingText.innerText = 'جاري حفظ بياناتك...';
        const userData = {
          uid: createdUid,
          fullName: fullName,
          email: email,
          parentPhone: parentPhone,
          scoutPhone: scoutPhone,
          unit: unit,
          unitId: unitId,
          role: selectedRole,
          accountStatus: 'active',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const builtPhotoUrl = (media && media.driveFileId) ? buildGoogleDriveImageUrl(media.driveFileId, 600) : '';
        if (builtPhotoUrl) {
          // نحفظ الرابط فقط بعد نجاح الرفع الفعلي واستخراج رابط صالح
          userData.photoURL = builtPhotoUrl;
          userData.photoFileId = media.driveFileId;
        } else if (photoFile) {
          photoUploadFailed = true;
        }
        return db.collection('users').doc(createdUid).set(userData);
      })
      .then(() => {
        docSaved = true;
        checkingBox.style.display = 'none';
        submitBtn.style.display = 'none';
        if (photoUploadFailed) {
          successMsg.innerText = 'تم إنشاء حسابك، لكن تعذّر رفع الصورة الشخصية فلم تُحفظ. يمكنك المتابعة بدونها وإضافتها لاحقاً عبر الإدارة.';
          showAdminNotification('تم إنشاء الحساب، لكن لم تُرفع الصورة الشخصية.', 'warning');
        }
        successMsg.style.display = 'block';
        doneBtn.style.display = 'block';
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        // حساب Authentication أُنشئ لكن بياناته لم تُحفظ => نحذفه حتى لا يبقى حساب يتيم لا يظهر عند الإدارة
        if (createdUid && !docSaved && auth.currentUser && auth.currentUser.uid === createdUid) {
          auth.currentUser.delete().catch((delErr) => console.warn('[Scout Elwihda] تعذر حذف الحساب اليتيم:', delErr && delErr.code));
        }
        console.error('[Scout Elwihda] scout registration error:', error && error.code, error && error.message);
        errorMsg.innerText = getRegistrationErrorMessage(error);
      });
  });
}

/* --- عرض بطاقة الكشاف / بطاقة القائد --- */
function renderScoutOrLeaderCard(data) {
  const cardContainer = document.getElementById('userCardContainer');
  if (!cardContainer) return;

  const isAdmin = data.role === 'admin';
  const isLeader = data.role === 'leader';
  const isParent = data.role === 'parent';
  const cardTitle = isAdmin ? 'بطاقة الإدارة' : (isLeader ? 'بطاقة القائد' : (isParent ? 'بطاقة الولي' : 'بطاقة الكشاف'));
  const roleBadge = isAdmin ? 'مدير النظام (Admin)' : (data.leaderRoleTitle || (isLeader ? 'قائد كشفي' : (isParent ? 'ولي أمر' : 'كشاف')));
  const fullName = data.fullName || (data.firstName ? `${data.firstName} ${data.lastName}` : 'عضو الفوج');
  const avatarHtml = safeImgUrl(data.photoURL)
    ? `<img src="${safeImgUrl(data.photoURL)}" alt="${escHtml(fullName)}" loading="lazy">`
    : `<i class="fa-solid ${(isLeader || isAdmin) ? 'fa-user-shield' : 'fa-user-graduate'}"></i>`;

  const statusLabel = data.accountStatus === 'active' ? '🟢 نشط'
    : (data.accountStatus === 'pending_verification' ? '🟡 قيد المراجعة'
    : (data.accountStatus ? '🔴 ' + escHtml(data.accountStatus) : ''));

  cardContainer.innerHTML = `
    <div class="digital-scout-card hover-lift">
      <div class="card-header-badge">
        <i class="fa-solid ${isLeader ? 'fa-user-tie' : 'fa-id-card'}"></i>
        <span>${escHtml(cardTitle)}</span>
      </div>
      <div class="card-body-content">
        <div class="card-avatar">
          ${avatarHtml}
        </div>
        <div class="card-details">
          <h3>${escHtml(fullName)}</h3>
          <p class="role-tag">${escHtml(roleBadge)}</p>
          <div class="card-info-grid">
            <div><i class="fa-solid fa-envelope"></i> <strong>البريد:</strong> ${escHtml(data.email) || 'غير مدخل'}</div>
            ${data.parentPhone ? `<div><i class="fa-solid fa-phone"></i> <strong>هاتف الولي:</strong> ${escHtml(data.parentPhone)}</div>` : ''}
            ${data.scoutPhone ? `<div><i class="fa-solid fa-mobile-screen"></i> <strong>هاتف الابن:</strong> ${escHtml(data.scoutPhone)}</div>` : ''}
            ${data.unit ? `<div><i class="fa-solid fa-shield-halved"></i> <strong>الوحدة:</strong> ${escHtml(window.V3 ? V3.unitLabel(data) : data.unit)}</div>` : ''}
            <div><i class="fa-solid fa-flag"></i> <strong>الفوج:</strong> فوج الوحدة الكشفي</div>
            ${statusLabel ? `<div><i class="fa-solid fa-circle-check"></i> <strong>الحالة:</strong> ${statusLabel}</div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* --- تسجيل دخول بوابة الإعلام والنشر --- */
const mediaPortalForm = document.getElementById('mediaPortalForm');
if (mediaPortalForm) {
  mediaPortalForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = document.getElementById('mediaAdminEmail').value.trim();
    const password = document.getElementById('mediaAdminPassword').value;
    const checkingBox = document.getElementById('mediaCheckingBox');
    const errorMsg = document.getElementById('mediaError');
    const submitBtn = document.getElementById('mediaSubmitBtn');

    errorMsg.innerText = '';
    checkingBox.style.display = 'flex';
    submitBtn.disabled = true;

    const handleSuccess = (userData) => {
      currentUserRole = userData.role || null;
      currentUserPermissions = userData.permissions || {};
      currentUserAccountStatus = userData.accountStatus || null;
      clearPersistedSessionLock();
      recordAdminActivity();

      setTimeout(() => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        closeModal('mediaPortalModal');
        mediaPortalForm.reset();
        setAdminViewActive(true);
        applyAdminPanelUIForRole();
      }, 1500);
    };

    auth.signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        const uid = userCredential.user.uid;
        return db.collection('users').doc(uid).get();
      })
      .then((doc) => {
        if (!doc.exists || (doc.data().role !== 'admin' && doc.data().role !== 'leader')) {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'عذراً، هذا الحساب لا يملك صلاحيات الإعلام والنشر!';
        } else if (doc.data().accountStatus === 'pending_verification') {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'حسابك لا يزال قيد المراجعة من طرف الإدارة. سيتم تفعيله بعد الموافقة.';
        } else if (doc.data().accountStatus === 'rejected') {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'تم رفض طلب إنشاء هذا الحساب من طرف الإدارة.';
        } else if (doc.data().accountStatus === 'suspended' || doc.data().accountStatus === 'locked') {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'تم توقيف هذا الحساب لأغراض أمنية. سيتم مراجعته من طرف الإدارة.';
        } else if (doc.data().role === 'leader'
          && !(doc.data().permissions && doc.data().permissions['media.portal'] === true)) {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'حسابك لا يملك صلاحية الوصول إلى بوابة الإعلام والنشر. تواصل مع الأدمن.';
        } else {
          handleSuccess(doc.data());
        }
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        logFailedLoginAttempt(email);
        errorMsg.innerText = getFriendlyAuthErrorMessage(error) || 'البريد الإلكتروني أو كلمة المرور غير صحيحة!';
      });
  });
}

/* --- تسجيل دخول الأدمن الرئيسي --- */
const adminLoginForm = document.getElementById('adminLoginForm');
if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const checkingBox = document.getElementById('adminCheckingBox');
    const errorMsg = document.getElementById('adminError');
    const submitBtn = document.getElementById('adminSubmitBtn');

    errorMsg.innerText = '';
    checkingBox.style.display = 'flex';
    submitBtn.disabled = true;

    const handleSuccessfulLogin = (userData) => {
      currentUserRole = userData.role || null;
      currentUserPermissions = userData.permissions || {};
      currentUserAccountStatus = userData.accountStatus || null;
      clearPersistedSessionLock();
      recordAdminActivity();

      setTimeout(() => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        closeModal('adminLoginModal');
        adminLoginForm.reset();
        setAdminViewActive(true);
        applyAdminPanelUIForRole();
      }, 1500);
    };

    auth.signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        return db.collection('users').doc(userCredential.user.uid).get();
      })
      .then((doc) => {
        if (!doc.exists || doc.data().role !== 'admin') {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'عذراً، هذا الحساب لا يملك صلاحيات الأدمن!';
        } else if (doc.data().accountStatus === 'suspended' || doc.data().accountStatus === 'locked') {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'تم توقيف هذا الحساب لأغراض أمنية. سيتم مراجعته من طرف الإدارة.';
        } else {
          handleSuccessfulLogin(doc.data());
        }
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        logFailedLoginAttempt(email);
        errorMsg.innerText = getFriendlyAuthErrorMessage(error) || 'البريد الإلكتروني أو كلمة المرور غير صحيحة!';
      });
  });
}

// تنظيف شامل لأي Modal/Overlay/Drawer عالق (يُستخدم كخط دفاع إضافي قبل أي reload)
function closeAllModalsAndOverlays() {
  document.querySelectorAll('.modal-overlay').forEach((m) => { m.style.display = 'none'; });
  document.body.style.overflow = 'auto';

  const sidebar = document.getElementById('adminSidebar');
  const sidebarOverlay = document.getElementById('adminSidebarOverlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active');

  const navMenu = document.getElementById('navMenu');
  if (navMenu) navMenu.classList.remove('active');

  setAdminViewActive(false);
}

// إرسال طلب استعادة الوصول (كتابة فقط، آمنة حتى لغير المسجلين حسب Rules)
function submitAccessRecoveryRequest() {
  const email = document.getElementById('recoveryEmail').value.trim();
  const message = sanitizeInput(document.getElementById('recoveryMessage').value.trim());
  const checkingBox = document.getElementById('recoveryCheckingBox');
  const errorMsg = document.getElementById('recoveryError');
  const successMsg = document.getElementById('recoverySuccess');
  const submitBtn = document.getElementById('recoverySubmitBtn');

  errorMsg.innerText = '';
  successMsg.style.display = 'none';

  if (!email || !message) {
    errorMsg.innerText = 'يرجى تعبئة البريد الإلكتروني ووصف المشكلة.';
    return;
  }

  checkingBox.style.display = 'flex';
  submitBtn.disabled = true;

  db.collection('securityRequests').add({
    email: email,
    message: message,
    status: 'new',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    checkingBox.style.display = 'none';
    submitBtn.disabled = false;
    successMsg.style.display = 'block';
    document.getElementById('recoveryEmail').value = '';
    document.getElementById('recoveryMessage').value = '';
  }).catch((error) => {
    checkingBox.style.display = 'none';
    submitBtn.disabled = false;
    errorMsg.innerText = 'حدث خطأ أثناء الإرسال: ' + error.message;
  });
}

// إظهار/إخفاء زر "العودة إلى لوحة التعديلات" حسب الدور الحقيقي فقط
function updateDashboardAccessButton(userData) {
  const canAccess = !!userData && (
    userData.role === 'admin' ||
    (userData.role === 'leader' && userData.accountStatus === 'active'
      && userData.permissions && userData.permissions['media.portal'] === true)
  );

  const desktopBtn = document.getElementById('desktopDashboardReturnBtn');
  const mobileItem = document.getElementById('mobileDashboardReturnItem');
  if (desktopBtn) desktopBtn.style.display = canAccess ? 'inline-flex' : 'none';
  if (mobileItem) setAuthVisible(mobileItem, canAccess, 'block');
}

// العودة إلى لوحة التعديلات — يتحقق أولاً من عدم قفل الجلسة أو انتهاء مهلة عدم النشاط
function returnToDashboard() {
  if (isSessionLocked() || hasInactivityExpired()) {
    lockIdleSession('welcome-tab');
    return;
  }

  recordAdminActivity();
  setAdminViewActive(true);

  const navMenu = document.getElementById('navMenu');
  if (navMenu) navMenu.classList.remove('active');

  const homeBtn = document.querySelector('.admin-nav-btn[onclick*="\'welcome-tab\'"]');
  switchAdminTab('welcome-tab', homeBtn);
  applyAdminPanelUIForRole();
}

// العودة إلى الموقع العام دون تسجيل الخروج — الجلسة تبقى فعّالة تماماً (ما لم تكن مقفلة)
function backToSiteFromAdmin() {
  if (isSessionLocked()) {
    lockIdleSession();
    return;
  }
  closeAllModalsAndOverlays();
  showPage('home-page');
}

function logoutAdmin() {
  clearPersistedSessionLock();
  auth.signOut().then(() => {
    closeAllModalsAndOverlays();
    history.replaceState(null, '', window.location.pathname + '#home-page');
    window.location.reload();
  }).catch(() => {
    closeAllModalsAndOverlays();
    history.replaceState(null, '', window.location.pathname + '#home-page');
    window.location.reload();
  });
}

function toggleMobileMenu() {
  const navMenu = document.getElementById('navMenu');
  if (navMenu) {
    navMenu.classList.toggle('active');
  }
}

/* --- إغلاق بزر Escape: القائمة العلوية، شريط الأدمن، ثم أعلى نافذة مفتوحة (بدون أي تأثير على الجلسة) --- */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  const lightbox = document.getElementById('galleryLightboxOverlay');
  if (lightbox && lightbox.style.display === 'flex') { lightbox.style.display = 'none'; return; }

  const openModals = Array.from(document.querySelectorAll('.modal-overlay'))
    .filter((m) => m.style.display === 'flex' || m.style.display === 'block');
  if (openModals.length > 0) { closeModal(openModals[openModals.length - 1].id); return; }

  const sidebar = document.getElementById('adminSidebar');
  if (sidebar && sidebar.classList.contains('mobile-open')) { toggleAdminSidebar(); return; }

  const navMenu = document.getElementById('navMenu');
  if (navMenu && navMenu.classList.contains('active')) { navMenu.classList.remove('active'); }
});

/* --- فتح/إغلاق القائمة الجانبية للأدمن على الهاتف --- */
function toggleAdminSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('adminSidebarOverlay');
  if (sidebar) sidebar.classList.toggle('mobile-open');
  if (overlay) overlay.classList.toggle('active');
}

/* --- تصفية المعرض الرقمي --- */
// عرض صور المعرض للأعضاء المسجلين (تحديث حي). الصور محلية من مجلد assets/images/gallery/.
let currentGalleryFilter = 'all';
function renderPublicGallery() {
  const container = document.getElementById('galleryContainer');
  if (!container) return;

  if (unsubscribePublicGalleryListener) {
    unsubscribePublicGalleryListener();
    unsubscribePublicGalleryListener = null;
  }

  const categoryLabels = { units: 'الوحدات', gatherings: 'التجمعات الكشفية', camps: 'المخيمات', trips: 'الرحلات', activities: 'الأنشطة' };

  unsubscribePublicGalleryListener = db.collection('gallery').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    if (snapshot.empty) {
      container.innerHTML = '<p class="announcements-empty-text">لا توجد عناصر في المعرض حالياً.</p>';
      return;
    }
    container.innerHTML = '';
    snapshot.forEach((doc) => {
      const data = doc.data();
      const path = getItemImagePath('gallery', data);
      const displayTitle = data.title || categoryLabels[data.category] || 'صورة';
      const driveId = data.driveFileId || extractGoogleDriveFileId(data.imageUrl || data.imageFile || '');
      const downloadName = driveId
        ? ((data.title || 'scout-gallery').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_') + '.jpg')
        : (path ? path.split('/').pop().split('?')[0] : 'image.jpg');

      const card = document.createElement('div');
      card.className = 'gallery-card hover-lift';
      card.setAttribute('data-category', data.category || 'units');
      card.innerHTML = `
        <h3>${escHtml(displayTitle)}</h3>
        ${buildImageAreaHtml('gallery', data, displayTitle, true)}
        <span class="gallery-tag">${escHtml(categoryLabels[data.category] || data.category || '')}</span>
        ${data.description ? buildExpandableHtml(data.description, 'gallery-desc') : ''}
        ${path ? `<button type="button" class="gallery-download-btn hover-lift" data-src="${escHtml(path)}" data-drive-id="${escHtml(driveId || '')}" data-name="${escHtml(downloadName)}" onclick="downloadGalleryImage(this)">
          <i class="fa-solid fa-download"></i> تحميل الصورة
        </button>` : ''}
      `;
      container.appendChild(card);
    });
    applyGalleryFilter(currentGalleryFilter);
  }, (error) => {
    container.innerHTML = '<p class="announcements-empty-text">تعذر تحميل صور المعرض حالياً.</p>';
    console.error('renderPublicGallery error:', error);
  });
}

// تحميل الصورة فعلياً (يدعم التحميل المباشر من Google Drive أو من استضافة الموقع)
function downloadGalleryImage(btn) {
  const src = btn.getAttribute('data-src');
  const driveId = btn.getAttribute('data-drive-id') || extractGoogleDriveFileId(src || '');
  const name = btn.getAttribute('data-name') || 'image.jpg';

  if (driveId) {
    const dlUrl = buildGoogleDriveDownloadUrl(driveId);
    const link = document.createElement('a');
    link.href = dlUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  fetch(src)
    .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.blob(); })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    })
    .catch(() => { window.open(src, '_blank'); });
}

// Lightbox بسيط لعرض الصورة بحجم كامل
function getLightboxSources() {
  return Array.from(document.querySelectorAll('.gallery-card .media-frame[data-lightbox]'))
    .filter((el) => { const c = el.closest('.gallery-card'); return !c || c.style.display !== 'none'; })
    .map((el) => el.getAttribute('data-lightbox'));
}

let lightboxList = [];
let lightboxIndex = 0;

function showLightboxAt(i) {
  if (!lightboxList.length) return;
  lightboxIndex = (i + lightboxList.length) % lightboxList.length;
  const img = document.getElementById('galleryLightboxImg');
  const msg = document.getElementById('galleryLightboxMsg');
  const counter = document.getElementById('galleryLightboxCounter');
  msg.style.display = 'none'; img.style.display = '';
  img.onerror = () => { img.style.display = 'none'; msg.style.display = 'block'; };
  img.src = lightboxList[lightboxIndex];
  counter.textContent = (lightboxIndex + 1) + ' / ' + lightboxList.length;
  const multi = lightboxList.length > 1;
  document.getElementById('galleryLightboxPrev').style.display = multi ? '' : 'none';
  document.getElementById('galleryLightboxNext').style.display = multi ? '' : 'none';
}

function closeGalleryLightbox() {
  const lb = document.getElementById('galleryLightboxOverlay');
  if (lb) lb.style.display = 'none';
}

function openGalleryLightbox(imageUrl) {
  let lightbox = document.getElementById('galleryLightboxOverlay');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'galleryLightboxOverlay';
    lightbox.className = 'gallery-lightbox-overlay';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'عرض الصورة');
    lightbox.innerHTML =
      '<button type="button" id="galleryLightboxClose" class="lb-btn lb-close" aria-label="إغلاق">✕</button>' +
      '<button type="button" id="galleryLightboxPrev" class="lb-btn lb-prev" aria-label="الصورة السابقة">›</button>' +
      '<img id="galleryLightboxImg" src="" alt="">' +
      '<p id="galleryLightboxMsg" class="lb-msg" style="display:none;">تعذّر تحميل هذه الصورة.</p>' +
      '<button type="button" id="galleryLightboxNext" class="lb-btn lb-next" aria-label="الصورة التالية">‹</button>' +
      '<span id="galleryLightboxCounter" class="lb-counter"></span>';
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeGalleryLightbox(); });
    document.body.appendChild(lightbox);
    document.getElementById('galleryLightboxClose').onclick = closeGalleryLightbox;
    document.getElementById('galleryLightboxPrev').onclick = (e) => { e.stopPropagation(); showLightboxAt(lightboxIndex - 1); };
    document.getElementById('galleryLightboxNext').onclick = (e) => { e.stopPropagation(); showLightboxAt(lightboxIndex + 1); };
    document.addEventListener('keydown', (e) => {
      if (lightbox.style.display === 'none') return;
      if (e.key === 'Escape') closeGalleryLightbox();
      else if (e.key === 'ArrowLeft') showLightboxAt(lightboxIndex + 1);   // RTL: اليسار = التالي
      else if (e.key === 'ArrowRight') showLightboxAt(lightboxIndex - 1);
    });
    let touchX = null;
    lightbox.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener('touchend', (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX; touchX = null;
      if (Math.abs(dx) > 60) showLightboxAt(lightboxIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }
  lightboxList = getLightboxSources();
  const idx = lightboxList.indexOf(imageUrl);
  if (idx === -1) lightboxList = [imageUrl];
  lightbox.style.display = 'flex';
  showLightboxAt(idx === -1 ? 0 : idx);
}

function applyGalleryFilter(category) {
  document.querySelectorAll('.gallery-card').forEach((card) => {
    const show = category === 'all' || card.getAttribute('data-category') === category;
    card.style.display = show ? 'block' : 'none';
  });
  const emptyEl = document.getElementById('galleryFilterEmpty');
  if (emptyEl) {
    const total = document.querySelectorAll('.gallery-card').length;
    const visible = Array.from(document.querySelectorAll('.gallery-card')).filter((c) => c.style.display !== 'none').length;
    emptyEl.style.display = (total > 0 && visible === 0) ? 'block' : 'none';
  }
}

function filterGallery(category, btnElement) {
  currentGalleryFilter = category;
  document.querySelectorAll('.gallery-filter-btn').forEach(btn => btn.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  applyGalleryFilter(category);
}

/* --- تهيئة أرقام الهواتف --- */
function initPhoneInputs() {
  const parentInput = document.getElementById('scoutParentPhone');
  const scoutInput = document.getElementById('scoutSonPhone');
  const parentMask = document.getElementById('parentPhoneMask');
  const scoutMask = document.getElementById('scoutPhoneMask');

  const setupPhoneFormatting = (input, mask) => {
    if (!input) return;

    input.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 10) value = value.slice(0, 10);
      e.target.value = value;

      if (mask) {
        if (value.length > 0) {
          let formatted = value.match(/.{1,2}/g)?.join(' ') || value;
          mask.innerText = formatted;
          mask.style.display = 'block';
        } else {
          mask.innerText = '';
          mask.style.display = 'none';
        }
      }
    });
  };

  setupPhoneFormatting(parentInput, parentMask);
  setupPhoneFormatting(scoutInput, scoutMask);
}

/* --- شروط والتحقق من كلمة المرور --- */
function initPasswordValidationLeader() {
  const regPassword = document.getElementById('leaderRegPassword');
  const checkLen = document.getElementById('checkLenLeader');
  const checkNum = document.getElementById('checkNumLeader');
  const checkSym = document.getElementById('checkSymLeader');

  if (!regPassword) return;

  regPassword.addEventListener('input', () => {
    const val = regPassword.value;
    updateCheckStatus(checkLen, val.length >= 8);
    updateCheckStatus(checkNum, /\d/.test(val));
    updateCheckStatus(checkSym, /[!@#$%^&*(),.?":{}|<>]/.test(val));
  });
}

function initPasswordValidationAdminLeader() {
  const regPassword = document.getElementById('adminLeaderPassword');
  const checkLen = document.getElementById('checkLenAdminLeader');
  const checkNum = document.getElementById('checkNumAdminLeader');
  const checkSym = document.getElementById('checkSymAdminLeader');

  if (!regPassword) return;

  regPassword.addEventListener('input', () => {
    const val = regPassword.value;
    updateCheckStatus(checkLen, val.length >= 8);
    updateCheckStatus(checkNum, /\d/.test(val));
    updateCheckStatus(checkSym, /[!@#$%^&*(),.?":{}|<>]/.test(val));
  });
}

function initPasswordValidationScout() {
  const regPassword = document.getElementById('scoutParentPassword');
  const checkLen = document.getElementById('checkLenScout');
  const checkNum = document.getElementById('checkNumScout');
  const checkSym = document.getElementById('checkSymScout');

  if (!regPassword) return;

  regPassword.addEventListener('input', () => {
    const val = regPassword.value;
    updateCheckStatus(checkLen, val.length >= 8);
    updateCheckStatus(checkNum, /\d/.test(val));
    updateCheckStatus(checkSym, /[!@#$%^&*(),.?":{}|<>]/.test(val));
  });
}

function updateCheckStatus(element, isValid) {
  if (!element) return;
  const icon = element.querySelector('.check-icon');

  if (isValid) {
    element.classList.remove('invalid');
    element.classList.add('valid');
    if (icon) {
      icon.classList.remove('fa-circle-xmark');
      icon.classList.add('fa-circle-check');
    }
  } else {
    element.classList.remove('valid');
    element.classList.add('invalid');
    if (icon) {
      icon.classList.remove('fa-circle-check');
      icon.classList.add('fa-circle-xmark');
    }
  }
}

/* --- إظهار / إخفاء حقل الصفة المخصصة (أخرى) --- */
function toggleCustomLeaderRoleInput() {
  const selectedRole = document.querySelector('input[name="adminLeaderRoleType"]:checked');
  const customRoleBox = document.getElementById('customLeaderRoleBox');
  if (selectedRole && selectedRole.value === 'أخرى') {
    customRoleBox.style.display = 'block';
  } else {
    customRoleBox.style.display = 'none';
  }
}

/* --- إدارة حسابات القادة من نافذة إضافة حساب --- */
const adminAddLeaderForm = document.getElementById('adminAddLeaderForm');
if (adminAddLeaderForm) {
  adminAddLeaderForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const fullName = sanitizeInput(document.getElementById('adminLeaderFullName').value.trim());
    const email = sanitizeInput(document.getElementById('adminLeaderEmail').value.trim());
    const password = document.getElementById('adminLeaderPassword').value;
    const confirmPassword = document.getElementById('adminLeaderConfirmPassword').value;

    const selectedRoleType = document.querySelector('input[name="adminLeaderRoleType"]:checked').value;
    let leaderRoleTitle = selectedRoleType;
    if (selectedRoleType === 'أخرى') {
      const customRole = sanitizeInput(document.getElementById('adminLeaderCustomRole').value.trim());
      leaderRoleTitle = customRole || 'مسؤول مخصص';
    }

    const selectedPermissions = {};
    document.querySelectorAll('#adminLeaderPermissionsBox input[type="checkbox"]:checked').forEach((cb) => {
      selectedPermissions[cb.value] = true;
    });

    const errorMsg = document.getElementById('adminLeaderError');
    const successMsg = document.getElementById('adminLeaderSuccess');
    const checkingBox = document.getElementById('adminLeaderCheckingBox');
    const submitBtn = document.getElementById('adminLeaderSubmitBtn');
    const doneBtn = document.getElementById('adminLeaderDoneBtn');

    errorMsg.innerText = '';
    successMsg.style.display = 'none';

    if (password !== confirmPassword) {
      errorMsg.innerText = 'كلمتا المرور غير متطابقتين!';
      return;
    }

    if (password.length < 8 || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errorMsg.innerText = 'كلمة المرور يجب أن تحتوي على 8 أحرف وأرقام ورموز!';
      return;
    }

    checkingBox.style.display = 'flex';
    submitBtn.disabled = true;

    const secAuth = getSecondaryAuth();

    secAuth.createUserWithEmailAndPassword(email, password)
      .then((userCredential) => {
        const uid = userCredential.user.uid;
        const leaderData = {
          uid: uid,
          fullName: fullName,
          email: email,
          role: 'leader',
          leaderRoleTitle: leaderRoleTitle,
          accountStatus: 'active',
          verificationStatus: 'verified',
          permissions: selectedPermissions,
          createdBy: auth.currentUser ? auth.currentUser.uid : null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        return Promise.all([
          db.collection('leaders').doc(uid).set(leaderData),
          db.collection('users').doc(uid).set(leaderData)
        ]);
      })
      .then(() => {
        secAuth.signOut();
        checkingBox.style.display = 'none';
        submitBtn.style.display = 'none';
        successMsg.style.display = 'block';
        doneBtn.style.display = 'block';

        fetchLeadersList();
        fetchAllAccountsForDeleteView();
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        errorMsg.innerText = 'خطأ في إنشاء حساب القائد: ' + error.message;
      });
  });
}

// استعراض القادة في الصفحة الرئيسية لتبويب الأدمن
// تحميل قائمة الكشافة والأولياء (بحث حقيقي، بيانات حقيقية من users)
let allScoutsParentsCache = [];
function loadScoutsParentsAdmin() {
  const container = document.getElementById('scoutsParentsListContainer');
  if (!container) return;

  container.innerHTML = '<p class="announcements-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</p>';

  db.collection('users').where('role', 'in', ['scout', 'parent']).get()
    .then((snapshot) => {
      allScoutsParentsCache = [];
      snapshot.forEach((doc) => allScoutsParentsCache.push({ id: doc.id, ...doc.data() }));
      allScoutsParentsCache.sort((a, b) => {
        const am = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const bm = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return bm - am;
      });
      applyScoutsFilters();
    })
    .catch((error) => {
      const denied = error && error.code === 'permission-denied';
      container.innerHTML = '<p class="announcements-empty-text">' + (denied
        ? 'تعذر جلب الحسابات: ليست لديك صلاحية القراءة، أو أن قواعد Firestore المحدّثة لم تُنشر بعد.'
        : 'حدث خطأ أثناء جلب الحسابات. حاول مرة أخرى.') + '</p>';
      console.error('loadScoutsParentsAdmin error:', error && error.code, error && error.message);
    });
}

function scoutStatusBadge(user) {
  const st = user.accountStatus;
  if (st === 'active') return '<span class="status-badge status-verified"><i class="fa-solid fa-circle-check"></i> نشط</span>';
  if (st === 'pending_verification') return '<span class="status-badge status-pending"><i class="fa-solid fa-hourglass-half"></i> قيد المراجعة</span>';
  if (st === 'suspended' || st === 'locked') return '<span class="status-badge status-rejected"><i class="fa-solid fa-ban"></i> موقوف</span>';
  return '<span class="status-badge status-pending">' + escHtml(st || 'غير محدد') + '</span>';
}

function renderScoutsParentsList(list) {
  const container = document.getElementById('scoutsParentsListContainer');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p class="announcements-empty-text">لا توجد حسابات مطابقة حالياً.</p>';
    return;
  }

  container.innerHTML = '';
  list.forEach((user) => {
    const photo = safeImgUrl(user.photoURL);
    const row = document.createElement('div');
    row.className = 'account-row hover-lift';
    row.innerHTML = `
      <div class="acc-avatar">${photo ? `<img src="${escHtml(photo)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='<i class=&quot;fa-solid fa-user-graduate&quot;></i>'">` : '<i class="fa-solid fa-user-graduate" aria-hidden="true"></i>'}</div>
      <div class="acc-info">
        <h3>${escHtml(user.fullName) || 'بدون اسم'}</h3>
        <p><i class="fa-solid ${user.role === 'scout' ? 'fa-user-graduate' : 'fa-user-shield'}"></i> ${user.role === 'scout' ? 'كشاف' : 'ولي'}${user.unit ? ' — ' + escHtml(window.V3 ? V3.unitLabel(user) : user.unit) : ''} &nbsp; ${scoutStatusBadge(user)}</p>
        <p><i class="fa-solid fa-envelope"></i> <bdi dir="ltr">${escHtml(user.email)}</bdi></p>
        ${user.parentPhone ? `<p><i class="fa-solid fa-phone"></i> ولي الأمر: <bdi dir="ltr">${escHtml(user.parentPhone)}</bdi></p>` : ''}
        ${user.scoutPhone ? `<p><i class="fa-solid fa-mobile-screen"></i> الكشاف: <bdi dir="ltr">${escHtml(user.scoutPhone)}</bdi></p>` : ''}
      </div>
      <div class="acc-actions">
        <button type="button" class="btn-delete" onclick="confirmDeleteUser(${jsArg(user.id)})"><i class="fa-solid fa-trash-can"></i> حذف</button>
      </div>`;
    container.appendChild(row);
  });
}

function applyScoutsFilters() {
  const q = ((document.getElementById('scoutsSearchInput') || {}).value || '').trim().toLowerCase();
  const role = (document.getElementById('scoutsRoleFilter') || {}).value || '';
  const filtered = allScoutsParentsCache.filter((u) =>
    (!role || u.role === role) &&
    (!q || (u.fullName || '').toLowerCase().indexOf(q) !== -1 || (u.email || '').toLowerCase().indexOf(q) !== -1)
  );
  const count = document.getElementById('scoutsCountLabel');
  if (count) count.textContent = filtered.length + ' من ' + allScoutsParentsCache.length;
  renderScoutsParentsList(filtered);
}

function filterScoutsParentsList() { applyScoutsFilters(); }

// إحصائيات حقيقية من Firestore — بدون أي أرقام وهمية
// ملاحظة أداء: تُستخدم .get().size وهي كافية بحجم الفوج الحالي، لكنها تقرأ
// كل مستند في كل مجموعة؛ عند نمو الحسابات لآلاف، يُستحسن استبدالها بـ
// count() aggregation queries (متوفرة في إصدار أحدث من Firebase SDK).
function loadStatisticsAdmin() {
  const grid = document.getElementById('statisticsGrid');
  if (!grid) return;
  grid.innerHTML = '<p class="announcements-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> جاري الحساب...</p>';

  Promise.all([
    db.collection('users').where('role', '==', 'leader').get(),
    db.collection('users').where('role', '==', 'scout').get(),
    db.collection('users').where('role', '==', 'parent').get(),
    db.collection('users').where('role', 'in', ['admin', 'media_manager']).get(),
    db.collection('announcements').where('published', '==', true).get(),
    db.collection('gallery').get()
  ]).then(([leadersSnap, scoutsSnap, parentsSnap, staffSnap, announcementsSnap, gallerySnap]) => {
    const pendingLeaders = leadersSnap.docs.filter(d => d.data().verificationStatus === 'pending').length;
    const totalUsers = leadersSnap.size + scoutsSnap.size + parentsSnap.size + staffSnap.size;

    const stats = [
      { icon: 'fa-users', label: 'إجمالي الحسابات', value: totalUsers },
      { icon: 'fa-user-tie', label: 'القادة', value: leadersSnap.size },
      { icon: 'fa-hourglass-half', label: 'قادة قيد المراجعة', value: pendingLeaders },
      { icon: 'fa-user-graduate', label: 'الكشافة', value: scoutsSnap.size },
      { icon: 'fa-user-shield', label: 'الأولياء', value: parentsSnap.size },
      { icon: 'fa-bullhorn', label: 'الإعلانات المنشورة', value: announcementsSnap.size },
      { icon: 'fa-images', label: 'صور المعرض', value: gallerySnap.size }
    ];

    grid.innerHTML = stats.map(s => `
      <div class="stat-box hover-lift">
        <i class="fa-solid ${s.icon}"></i>
        <div class="stat-box-value">${s.value}</div>
        <div class="stat-box-label">${s.label}</div>
      </div>
    `).join('');
  }).catch((error) => {
    grid.innerHTML = '<p class="announcements-empty-text">حدث خطأ أثناء حساب الإحصائيات.</p>';
    console.error('loadStatisticsAdmin error:', error);
  });
}

// فتح نافذة تعديل صلاحيات قائد
let pendingEditPermissionsUid = null;
function openEditPermissionsModal(uid, name) {
  pendingEditPermissionsUid = uid;
  document.getElementById('editPermissionsLeaderName').innerText = name || '';
  document.getElementById('editPermissionsError').innerText = '';

  db.collection('users').doc(uid).get().then((doc) => {
    const permissions = (doc.exists && doc.data().permissions) ? doc.data().permissions : {};
    document.querySelectorAll('#editLeaderPermissionsBox input[type="checkbox"]').forEach((cb) => {
      cb.checked = permissions[cb.value] === true;
    });
  });

  openModal('editLeaderPermissionsModal');
}

// حفظ صلاحيات القائد المعدّلة
function saveLeaderPermissions() {
  if (!pendingEditPermissionsUid) return;

  const checkingBox = document.getElementById('editPermissionsCheckingBox');
  const errorMsg = document.getElementById('editPermissionsError');
  errorMsg.innerText = '';
  checkingBox.style.display = 'flex';

  const newPermissions = {};
  document.querySelectorAll('#editLeaderPermissionsBox input[type="checkbox"]:checked').forEach((cb) => {
    newPermissions[cb.value] = true;
  });

  const updateData = {
    permissions: newPermissions,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  Promise.all([
    db.collection('users').doc(pendingEditPermissionsUid).update(updateData),
    db.collection('leaders').doc(pendingEditPermissionsUid).update(updateData)
  ]).then(() => {
    checkingBox.style.display = 'none';
    showAdminNotification('تم حفظ الصلاحيات بنجاح!', 'success');
    closeModal('editLeaderPermissionsModal');
    pendingEditPermissionsUid = null;
  }).catch((error) => {
    checkingBox.style.display = 'none';
    errorMsg.innerText = 'حدث خطأ أثناء الحفظ: ' + error.message;
  });
}

function applyLeadersFilter() {
  const q = ((document.getElementById('leadersSearchInput') || {}).value || '').trim().toLowerCase();
  const st = (document.getElementById('leadersStatusFilter') || {}).value || '';
  document.querySelectorAll('#leadersListContainer .leader-item-card').forEach((card) => {
    const textOk = !q || card.textContent.toLowerCase().indexOf(q) !== -1;
    const stOk = !st || card.getAttribute('data-status') === st;
    card.style.display = (textOk && stOk) ? '' : 'none';
  });
}

function fetchLeadersList() {
  const container = document.getElementById('leadersListContainer');
  if (!container) return;
  // القائمة للإدارة فقط: لا نطلبها قبل تسجيل الدخول أو لغير الأدمن (القواعد سترفضها أصلاً)
  if (!auth.currentUser || currentUserRole !== 'admin') return;

  db.collection('leaders').get().then((snapshot) => {
    container.innerHTML = '';

    if (snapshot.empty) {
      container.innerHTML = '<p style="color: rgba(255,255,255,0.6); text-align: center;">لا يوجد حسابات قادة حالياً.</p>';
      return;
    }

    snapshot.forEach((doc) => {
      const leader = doc.data();
      const uid = doc.id;
      const isPending = leader.verificationStatus === 'pending';
      const isRejected = leader.verificationStatus === 'rejected';

      const card = document.createElement('div');
      card.className = 'leader-item-card hover-lift';
      card.setAttribute('data-status', isPending ? 'pending' : (isRejected ? 'rejected' : ((leader.accountStatus === 'suspended' || leader.accountStatus === 'locked') ? 'suspended' : 'active')));

      let statusBadge = '<span class="status-badge status-verified"><i class="fa-solid fa-circle-check"></i> نشط</span>';
      if (isPending) statusBadge = '<span class="status-badge status-pending"><i class="fa-solid fa-hourglass-half"></i> قيد المراجعة</span>';
      if (isRejected) statusBadge = '<span class="status-badge status-rejected"><i class="fa-solid fa-circle-xmark"></i> مرفوض</span>';
      if (leader.accountStatus === 'suspended' || leader.accountStatus === 'locked') {
        statusBadge = '<span class="status-badge status-rejected"><i class="fa-solid fa-ban"></i> موقوف</span>';
      }

      // مصدر الحساب: مُنشأ من الإدارة (createdBy موجود) أو تسجيل ذاتي (غير موجود)
      const sourceBadge = leader.createdBy
        ? '<span class="status-badge source-badge-admin"><i class="fa-solid fa-user-shield"></i> قائد مُنشأ من الإدارة</span>'
        : (leader.signupType === 'media_officer'
            ? '<span class="status-badge source-badge-self"><i class="fa-solid fa-bullhorn"></i> طلب مسؤول إعلام / تسجيل ذاتي</span>'
            : '<span class="status-badge source-badge-self"><i class="fa-solid fa-user-pen"></i> طلب قائد / تسجيل ذاتي</span>');

      card.innerHTML = `
        <div class="leader-card-info">
          <h3>${escHtml(leader.fullName)}</h3>
          <p><i class="fa-solid fa-user-shield"></i> ${escHtml(leader.leaderRoleTitle) || 'قائد كشفي'}</p>
          <p><i class="fa-solid fa-envelope"></i> ${escHtml(leader.email)}</p>
          <p>${statusBadge} ${sourceBadge}</p>
        </div>
        ${isPending ? `
        <div class="announcement-card-actions">
          <button class="btn-edit" style="background: rgba(241,207,121,0.15); color: var(--accent-gold);" onclick="openLeaderDetailsModal(${jsArg(uid)})"><i class="fa-solid fa-id-card"></i> الملف</button>
          <button class="btn-edit" style="background: rgba(34,197,94,0.2); color:#22c55e;" onclick="approveLeaderVerification(${jsArg(uid)}, ${leader.signupType === 'media_officer'})"><i class="fa-solid fa-check"></i> قبول</button>
          <button class="btn-delete" onclick="rejectLeaderVerification(${jsArg(uid)})"><i class="fa-solid fa-xmark"></i> رفض</button>
        </div>` : `
        <div class="announcement-card-actions">
          <button class="btn-edit" style="background: rgba(241,207,121,0.15); color: var(--accent-gold);" onclick="openLeaderDetailsModal(${jsArg(uid)})"><i class="fa-solid fa-id-card"></i> الملف</button>
          <button class="btn-edit" onclick="openEditPermissionsModal(${jsArg(uid)}, ${jsArg(leader.fullName || '')})"><i class="fa-solid fa-key"></i> الصلاحيات</button>
        </div>`}
      `;

      container.appendChild(card);
    });
  }).catch((error) => {
    container.innerHTML = '<p class="announcements-empty-text">حدث خطأ أثناء جلب قائمة القادة: ' + escHtml(error.message) + '</p>';
    console.error('fetchLeadersList error:', error);
  });
}

// قبول تحقق القائد: يفعّل حسابه فعلياً في users وleaders معاً
function approveLeaderVerification(uid, isMediaOfficer) {
  const updateData = {
    accountStatus: 'active',
    verificationStatus: 'verified',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  // قبول «مسؤول إعلام»: يُمنح صلاحيات الإعلام الأساسية فقط (دون حذف/إدارة المعرض)،
  // ويستطيع الأدمن تعديلها لاحقاً من زر «الصلاحيات». غير ذلك: لا صلاحيات تلقائية.
  if (isMediaOfficer) {
    updateData.permissions = {
      'media.portal': true,
      'announcements.view': true, 'announcements.create': true, 'announcements.edit': true,
      'gallery.view': true, 'gallery.upload': true
    };
    updateData.leaderRoleTitle = 'مسؤول إعلام';
  }
  Promise.all([
    db.collection('users').doc(uid).update(updateData),
    db.collection('leaders').doc(uid).update(updateData)
  ]).then(() => {
    showAdminNotification('تم قبول الحساب وتفعيله بنجاح!', 'success');
    fetchLeadersList();
  }).catch((error) => {
    showAdminNotification('حدث خطأ: ' + error.message, 'error');
  });
}

// رفض تحقق القائد
function rejectLeaderVerification(uid) {
  const updateData = {
    accountStatus: 'rejected',
    verificationStatus: 'rejected',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  Promise.all([
    db.collection('users').doc(uid).update(updateData),
    db.collection('leaders').doc(uid).update(updateData)
  ]).then(() => {
    showAdminNotification('تم رفض الحساب.', 'success');
    fetchLeadersList();
  }).catch((error) => {
    showAdminNotification('حدث خطأ: ' + error.message, 'error');
  });
}

/* =========================================================
   الحسابات المشبوهة — نظام حقيقي مبني على بيانات Firestore فعلية
   ========================================================= */

function openSuspiciousAccountsModal() {
  openModal('suspiciousAccountsModal');
  loadSuspiciousAccounts();
  loadSecurityRequests();
}

// جلب طلبات استعادة الوصول الحقيقية (status == 'new' أو 'reviewed' فقط — الطلبات المغلقة تُخفى)
let securityRequestsCache = {};
function loadSecurityRequests() {
  const container = document.getElementById('securityRequestsListContainer');
  if (!container) return;
  container.innerHTML = '<p class="announcements-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</p>';

  db.collection('securityRequests').orderBy('createdAt', 'desc').limit(100).get().then((snapshot) => {
    const relevant = snapshot.docs.filter((d) => d.data().status !== 'closed');
    securityRequestsCache = {};
    relevant.forEach((d) => { securityRequestsCache[d.id] = d.data(); });

    if (relevant.length === 0) {
      container.innerHTML = '<p class="announcements-empty-text">لا توجد طلبات دعم أمني حالياً.</p>';
      return;
    }

    container.innerHTML = '';
    relevant.forEach((doc) => {
      const data = doc.data();
      const dateText = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toLocaleDateString('ar-DZ') : '';
      const statusBadge = data.status === 'reviewed'
        ? '<span class="status-badge status-pending"><i class="fa-solid fa-eye"></i> مراجَع</span>'
        : '<span class="status-badge status-rejected"><i class="fa-solid fa-circle-exclamation"></i> جديد</span>';

      const card = document.createElement('div');
      card.className = 'leader-item-card hover-lift';
      card.innerHTML = `
        <div class="leader-card-info" style="flex:1;">
          <h3><i class="fa-solid fa-envelope"></i> ${escHtml(data.email)}</h3>
          <p><i class="fa-solid fa-calendar"></i> ${escHtml(dateText)}</p>
          <p>${statusBadge}</p>
        </div>
        <div class="announcement-card-actions">
          <button class="btn-edit" onclick="viewSecurityRequest(${jsArg(doc.id)})"><i class="fa-solid fa-eye"></i> عرض المشكلة</button>
        </div>
      `;
      container.appendChild(card);
    });
  }).catch((error) => {
    container.innerHTML = '<p class="announcements-empty-text">حدث خطأ: ' + escHtml(error.message) + '</p>';
    console.error('loadSecurityRequests error:', error);
  });
}

let currentViewedRequestId = null;
function viewSecurityRequest(id) {
  const data = securityRequestsCache[id];
  if (!data) return;
  currentViewedRequestId = id;
  document.getElementById('viewRequestEmail').innerText = data.email || '';
  document.getElementById('viewRequestDate').innerText = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toLocaleString('ar-DZ') : '';
  document.getElementById('viewRequestMessage').innerText = data.message || '';
  openModal('viewSecurityRequestModal');
}

function updateSecurityRequestStatus(newStatus) {
  if (!currentViewedRequestId) return;
  db.collection('securityRequests').doc(currentViewedRequestId).update({ status: newStatus })
    .then(() => {
      showAdminNotification(newStatus === 'closed' ? 'تم إغلاق الطلب.' : 'تم وضع الطلب كمراجَع.', 'success');
      closeModal('viewSecurityRequestModal');
      currentViewedRequestId = null;
      loadSecurityRequests();
    })
    .catch((error) => {
      showAdminNotification('حدث خطأ: ' + error.message, 'error');
    });
}

// جلب الحسابات المشبوهة فعلياً: (أ) قادة موقوفون فعلياً accountStatus
// suspended/locked، (ب) قادة نشطون لديهم محاولات دخول فاشلة حقيقية مسجّلة
// (≥3) في securityEvents — سبب حقيقي، وليس مخترعاً.
function loadSuspiciousAccounts() {
  const container = document.getElementById('suspiciousAccountsListContainer');
  if (!container) return;
  container.innerHTML = '<p class="announcements-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</p>';

  Promise.all([
    db.collection('users').where('role', '==', 'leader').get(),
    db.collection('securityEvents').where('type', '==', 'failed_login').limit(500).get()
  ]).then(([leadersSnap, eventsSnap]) => {
    // عدّ محاولات الدخول الفاشلة الحقيقية لكل بريد إلكتروني
    const failedCountByEmail = {};
    eventsSnap.forEach((doc) => {
      const email = (doc.data().email || '').toLowerCase();
      if (!email) return;
      failedCountByEmail[email] = (failedCountByEmail[email] || 0) + 1;
    });

    const suspiciousList = [];
    leadersSnap.forEach((doc) => {
      const data = doc.data();
      const uid = doc.id;
      const email = (data.email || '').toLowerCase();
      const failedAttempts = failedCountByEmail[email] || 0;

      if (data.accountStatus === 'suspended' || data.accountStatus === 'locked') {
        suspiciousList.push({
          uid, data,
          reason: data.suspicionReason || 'تم إيقاف هذا الحساب من طرف الإدارة.',
          failedAttempts
        });
      } else if (failedAttempts >= 3) {
        suspiciousList.push({
          uid, data,
          reason: `محاولات تسجيل دخول فاشلة (${failedAttempts} مرة) — الحساب لا يزال نشطاً حالياً.`,
          failedAttempts
        });
      }
    });

    renderSuspiciousAccountsList(suspiciousList);
  }).catch((error) => {
    container.innerHTML = '<p class="announcements-empty-text">حدث خطأ أثناء جلب البيانات: ' + escHtml(error.message) + '</p>';
    console.error('loadSuspiciousAccounts error:', error);
  });
}

function renderSuspiciousAccountsList(list) {
  const container = document.getElementById('suspiciousAccountsListContainer');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p class="announcements-empty-text">لا توجد حالياً أي حسابات تحتاج إلى مراجعة.</p>';
    return;
  }

  container.innerHTML = '';
  list.forEach((item) => {
    const isBlocked = item.data.accountStatus === 'suspended' || item.data.accountStatus === 'locked';
    const card = document.createElement('div');
    card.className = 'leader-item-card suspicious-account-card hover-lift';
    card.innerHTML = `
      <div class="leader-card-info" style="flex:1;">
        <h3><i class="fa-solid fa-user"></i> ${escHtml(item.data.fullName) || 'بدون اسم'}</h3>
        <p><i class="fa-solid fa-envelope"></i> ${escHtml(item.data.email)}</p>
        <p>${isBlocked
          ? '<span class="status-badge status-rejected"><i class="fa-solid fa-ban"></i> محظور</span>'
          : '<span class="status-badge status-pending"><i class="fa-solid fa-triangle-exclamation"></i> نشط — يحتاج مراجعة</span>'}
        </p>
        <p class="suspicious-reason-text"><i class="fa-solid fa-circle-info"></i> سبب الاشتباه: ${escHtml(item.reason)}</p>
        <div class="suspicious-actions-row">
          <button class="btn-warn-email" disabled title="يحتاج خدمة بريد إلكتروني حقيقية — غير متاحة حالياً ضمن Firebase Client">
            <i class="fa-solid fa-envelope"></i> إرسال رسالة تحذير (NEEDS EMAIL SERVICE)
          </button>
          ${isBlocked ? `
          <button class="btn-restore-account" onclick="confirmRestoreSuspiciousAccount(${jsArg(item.uid)}, ${jsArg(item.data.fullName || '')})">
            <i class="fa-solid fa-rotate-left"></i> إعادة الحساب للخدمة
          </button>` : ''}
          <button class="btn-delete" onclick="confirmDeleteUser(${jsArg(item.uid)})">
            <i class="fa-solid fa-trash-can"></i> حذف الحساب
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// فتح نافذة إضافة حساب مشبوه يدوياً — تعبئة قائمة القادة أولاً
function openAddSuspiciousModal() {
  const select = document.getElementById('suspiciousLeaderSelect');
  document.getElementById('suspiciousReasonInput').value = '';
  document.getElementById('addSuspiciousError').innerText = '';
  select.innerHTML = '<option value="" disabled selected>جاري التحميل...</option>';

  db.collection('users').where('role', '==', 'leader').get().then((snapshot) => {
    select.innerHTML = '<option value="" disabled selected>اختر قائداً...</option>';
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.accountStatus === 'suspended' || data.accountStatus === 'locked') return; // مستبعد، موقوف فعلاً
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.innerText = `${data.fullName || 'بدون اسم'} (${data.email || ''})`;
      select.appendChild(opt);
    });
  });

  openModal('addSuspiciousAccountModal');
}

// حفظ وضع حساب قيد المراجعة يدوياً (accountStatus → suspended + سبب حقيقي مكتوب من الأدمن)
function submitAddSuspiciousAccount() {
  const uid = document.getElementById('suspiciousLeaderSelect').value;
  const reason = sanitizeInput(document.getElementById('suspiciousReasonInput').value.trim());
  const checkingBox = document.getElementById('addSuspiciousCheckingBox');
  const errorMsg = document.getElementById('addSuspiciousError');

  if (!uid) {
    errorMsg.innerText = 'يرجى اختيار قائد أولاً.';
    return;
  }

  checkingBox.style.display = 'flex';
  errorMsg.innerText = '';

  const updateData = {
    accountStatus: 'suspended',
    suspicionReason: reason || 'تم وضعه قيد المراجعة يدوياً من طرف الإدارة.',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  Promise.all([
    db.collection('users').doc(uid).update(updateData),
    db.collection('leaders').doc(uid).update(updateData)
  ]).then(() => {
    checkingBox.style.display = 'none';
    closeModal('addSuspiciousAccountModal');
    showAdminNotification('تم إيقاف الحساب ووضعه قيد المراجعة.', 'success');
    loadSuspiciousAccounts();
    fetchLeadersList();
  }).catch((error) => {
    checkingBox.style.display = 'none';
    errorMsg.innerText = 'حدث خطأ: ' + error.message;
  });
}

// تأكيد إعادة حساب موقوف للخدمة
let pendingRestoreUid = null;
function confirmRestoreSuspiciousAccount(uid, name) {
  pendingRestoreUid = uid;
  if (!confirm(`هل أنت متأكد من إعادة حساب "${name}" إلى الخدمة؟`)) {
    pendingRestoreUid = null;
    return;
  }
  executeRestoreSuspiciousAccount();
}

function executeRestoreSuspiciousAccount() {
  if (!pendingRestoreUid) return;
  const uid = pendingRestoreUid;

  const updateData = {
    accountStatus: 'active',
    suspicionReason: firebase.firestore.FieldValue.delete(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  Promise.all([
    db.collection('users').doc(uid).update(updateData),
    db.collection('leaders').doc(uid).update(updateData)
  ]).then(() => {
    showAdminNotification('تمت إعادة الحساب إلى الخدمة بنجاح.', 'success');
    pendingRestoreUid = null;
    loadSuspiciousAccounts();
    fetchLeadersList();
  }).catch((error) => {
    showAdminNotification('فشلت العملية: ' + error.message, 'error');
    pendingRestoreUid = null;
  });
}

// جلب وعرض جميع الحسابات المضافة داخل المستطيلات بستايل أنيق ومميز مع زر الحذف
function fetchAllAccountsForDeleteView() {
  const container = document.getElementById('allAccountsListContainer');
  if (!container) return;

  // فقط حسابات القادة — أبداً الأدمن أو الكشافة أو الأولياء
  db.collection('users').where('role', '==', 'leader').get().then((snapshot) => {
    container.innerHTML = '';

    const myUid = auth.currentUser ? auth.currentUser.uid : null;
    const leaderDocs = snapshot.docs.filter((d) => d.id !== myUid); // استبعاد إضافي احترازي لحساب الأدمن الحالي نفسه

    if (leaderDocs.length === 0) {
      container.innerHTML = '<p style="color: rgba(255,255,255,0.6); text-align: center; width: 100%;">لا توجد حسابات قادة قابلة للحذف حالياً.</p>';
      return;
    }

    leaderDocs.forEach((docSnap) => {
      const userData = docSnap.data();
      const userId = docSnap.id;
      const card = document.createElement('div');
      
      // تصميم مستطيل طويل مع بوردر جميل
      card.className = 'account-row-card hover-lift';
      card.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255, 255, 255, 0.05);
        border: 2px solid var(--accent-gold, #f59e0b);
        border-radius: 12px;
        padding: 15px 20px;
        margin-bottom: 15px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
      `;

      const roleText = userData.leaderRoleTitle || 'قائد كشفي';
      const nameText = userData.fullName || (userData.firstName ? `${userData.firstName} ${userData.lastName}` : 'عضو');

      card.innerHTML = `
        <div class="account-info-part" style="display: flex; align-items: center; gap: 15px;">
          <div class="acc-icon" style="background: var(--accent-gold); color: #000; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 1.2rem;">
            <i class="fa-solid fa-user"></i>
          </div>
          <div>
            <h3 style="color: #fff; margin: 0 0 5px 0; font-size: 1.1rem;">${escHtml(nameText)}</h3>
            <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;"><i class="fa-solid fa-envelope"></i> ${escHtml(userData.email) || 'بدون إيميل'} | <span style="color: var(--accent-gold);">${escHtml(roleText)}</span></p>
          </div>
        </div>
        <div class="account-action-part">
          <button class="btn-action-red hover-lift" onclick="confirmDeleteUser(${jsArg(userId)})" style="padding: 8px 16px; border-radius: 8px; border: none; background: #ef4444; color: #fff; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-trash-can"></i> حذف
          </button>
        </div>
      `;

      container.appendChild(card);
    });
  }).catch(() => {
    container.innerHTML = '<p style="color: #ef4444; text-align: center; width: 100%;">حدث خطأ أثناء جلب الحسابات.</p>';
  });
}

// بدء عملية تأكيد حذف الحساب
function confirmDeleteUser(userId) {
  pendingDeleteUserId = userId;
  
  // إعادة تعيين عناصر نافذة التأكيد
  document.getElementById('deleteLeaderCheckingBox').style.display = 'none';
  document.getElementById('deleteLeaderSuccess').style.display = 'none';
  document.getElementById('deleteConfirmButtons').style.display = 'flex';
  
  openModal('deleteLeaderConfirmModal');
}

// تنفيذ الحذف الفعلي للحساب عند الضغط على "نعم"
function executeDeleteLeader() {
  if (!pendingDeleteUserId) return;

  const uidToDelete = pendingDeleteUserId;
  const checkingBox = document.getElementById('deleteLeaderCheckingBox');
  const successMsg = document.getElementById('deleteLeaderSuccess');
  const buttonsRow = document.getElementById('deleteConfirmButtons');

  buttonsRow.style.display = 'none';
  checkingBox.style.display = 'flex';

  if (auth.currentUser && uidToDelete === auth.currentUser.uid) {
    buttonsRow.style.display = 'flex'; checkingBox.style.display = 'none';
    showAdminNotification('لا يمكنك حذف حسابك الحالي.', 'error');
    return;
  }

  // نقرأ الوثيقة أولاً: نمنع حذف أي حساب بدور admin (المالك/الأدمن)، ونأخذ البريد لتعليمات الحذف اليدوي
  db.collection('users').doc(uidToDelete).get()
    .then((snap) => {
      const d = snap.exists ? snap.data() : {};
      if (d.role === 'admin') {
        const e = new Error('لا يمكن حذف حساب الأدمن/المالك من هذه الواجهة.');
        e.code = 'app/protected-account';
        throw e;
      }
      return d.email || '';
    })
    .then((email) => {
      // حذف مستندات Firestore (users + leaders). حذف حساب الدخول من Authentication
      // لا يمكن تنفيذه من المتصفح بأمان (يحتاج Admin SDK على خادم موثوق).
      return Promise.all([
        db.collection('users').doc(uidToDelete).delete(),
        db.collection('leaders').doc(uidToDelete).delete()
      ]).then(() => email);
    })
    .then((email) => {
      checkingBox.style.display = 'none';
      successMsg.innerHTML = 'تم حذف <strong>بيانات</strong> الحساب من الموقع (Firestore) بنجاح.<br>'
        + '<span style="color:#fbbf24;">⚠️ حساب الدخول نفسه ما زال موجوداً في Firebase Authentication، '
        + 'ولن يستطيع صاحب البريد' + (email ? ' <bdi dir="ltr">' + escHtml(email) + '</bdi>' : '') + ' إعادة التسجيل به قبل حذفه يدوياً:</span><br>'
        + '<small>Firebase Console ← Authentication ← Users ← ابحث عن البريد ← ⋮ ← Delete account.</small>';
      successMsg.style.display = 'block';
      pendingDeleteUserId = null;
      fetchAllAccountsForDeleteView();
      fetchLeadersList();
      loadSuspiciousAccounts();
      setTimeout(() => { closeModal('deleteLeaderConfirmModal'); }, 12000);
    })
    .catch((error) => {
      checkingBox.style.display = 'none';
      buttonsRow.style.display = 'flex';
      showAdminNotification(error && error.code === 'app/protected-account' ? error.message : 'تعذّر حذف الحساب. تحقق من صلاحياتك وحاول مرة أخرى.', 'error');
      console.error('executeDeleteLeader error:', error);
    });
}
// مستويات أهمية الإعلان — قابلة للتوسع مستقبلاً
const ANNOUNCEMENT_LEVELS = {
  critical:  { label: 'هام جدًا', color: '#ef4444' },
  important: { label: 'هام',      color: '#f97316' },
  info:      { label: 'إعلان',    color: '#f1cf79' },
  note:      { label: 'معلومة',   color: '#3b82f6' }
};
let selectedMarqueeLevel = 'important';

// جلب الإعلان النشط من قاعدة البيانات (شريط عاجل مستقل تماماً عن قائمة الإعلانات)
db.collection('settings').doc('announcements').onSnapshot((doc) => {
  const marqueeEl = document.getElementById('announcementMarqueeText');
  const labelEl = document.getElementById('announcementImportanceLabel');
  if (!doc.exists || !marqueeEl) return;

  const data = doc.data();
  const message = data.message || data.urgentText || '';
  const levelKey = ANNOUNCEMENT_LEVELS[data.importanceLevel] ? data.importanceLevel : 'important';
  const levelInfo = ANNOUNCEMENT_LEVELS[levelKey];

  marqueeEl.innerText = message;
  if (labelEl) {
    labelEl.innerText = data.importanceLabel || levelInfo.label;
    labelEl.style.backgroundColor = data.importanceColor || levelInfo.color;
  }
});

// تحديد مستوى الأهمية المختار في واجهة التعديل السريع
function setMarqueeLevelSelection(level) {
  selectedMarqueeLevel = ANNOUNCEMENT_LEVELS[level] ? level : 'important';
  document.querySelectorAll('.marquee-level-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.level === selectedMarqueeLevel);
  });
}

// وظيفة باش الآدمن يبدل نص وشدة الشريط
function updateAnnouncementBar(message, level) {
  const levelKey = ANNOUNCEMENT_LEVELS[level] ? level : 'important';
  const levelInfo = ANNOUNCEMENT_LEVELS[levelKey];
  const currentUser = auth.currentUser;

  return db.collection('settings').doc('announcements').set({
    message: message,
    importanceLevel: levelKey,
    importanceLabel: levelInfo.label,
    importanceColor: levelInfo.color,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser ? currentUser.uid : null
  }, { merge: true }).then(() => {
    showAdminNotification('تم تحديث شريط الإعلانات!', 'success');
  }).catch((error) => {
    showAdminNotification('فشل تحديث شريط الإعلانات: ' + error.message, 'error');
    throw error;
  });
}

// تعبئة حقل التعديل السريع للشريط بالنص والمستوى الحاليين عند فتح تبويب الإعلانات
function prefillMarqueeQuickEdit() {
  const input = document.getElementById('marqueeQuickEditInput');
  if (!input) return;
  db.collection('settings').doc('announcements').get().then((doc) => {
    if (doc.exists) {
      const data = doc.data();
      input.value = data.message || data.urgentText || '';
      const levelKey = ANNOUNCEMENT_LEVELS[data.importanceLevel] ? data.importanceLevel : 'important';
      setMarqueeLevelSelection(levelKey);
    } else {
      setMarqueeLevelSelection('important');
    }
  }).catch(() => { /* تجاهل بصمت، الحقل يبقى فارغاً */ });
}

// حفظ نص الشريط العاجل من زر التعديل السريع
function saveMarqueeText() {
  const input = document.getElementById('marqueeQuickEditInput');
  const msg = document.getElementById('marqueeQuickMsg');
  const btn = document.getElementById('marqueeQuickSaveBtn');
  if (!input || !btn) return;

  const text = sanitizeInput(input.value.trim());
  msg.innerText = '';

  if (!text) {
    msg.innerText = 'يرجى كتابة نص الشريط أولاً.';
    return;
  }

  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  updateAnnouncementBar(text, selectedMarqueeLevel)
    .then(() => {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    })
    .catch(() => {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
      msg.innerText = 'حدث خطأ أثناء الحفظ، حاول مرة أخرى.';
    });
}
/* =========================================================
   نظام الإعلانات (Announcements) — Collection: announcements
   ========================================================= */

// فتح نافذة إنشاء/تعديل إعلان
/* =========================================================
   أدوات التوقيت بمنطقة الجزائر (Africa/Algiers = UTC+1 طوال السنة، بلا توقيت صيفي)
   ========================================================= */

// تحويل قيمة <input type="datetime-local"> (مثل "2026-10-10T17:30") إلى
// كائن Date يمثّل تلك اللحظة بالضبط بتوقيت الجزائر، بغض النظر عن توقيت
// متصفح الأدمن نفسه
function algiersLocalStringToDate(localStr) {
  if (!localStr) return null;
  return new Date(localStr + ':00+01:00');
}

// تحويل Date إلى قيمة مناسبة لملء <input type="datetime-local"> بتوقيت الجزائر
function dateToAlgiersLocalInputValue(date) {
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const get = (t) => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

// نص قابل للقراءة بتوقيت الجزائر
function formatAlgiersDateTime(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('ar-DZ', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(date);
}

// حساب حالة الظهور الفعلية لإعلان بناءً على startAt/endAt الحقيقيين (Firestore Timestamp)
function getAnnouncementTimingStatus(data) {
  const now = new Date();
  const start = data.startAt && data.startAt.toDate ? data.startAt.toDate() : null;
  const end = data.endAt && data.endAt.toDate ? data.endAt.toDate() : null;

  if (start && now < start) return { visible: false, state: 'scheduled', start, end };
  if (end && now >= end) return { visible: false, state: 'expired', start, end };
  return { visible: true, state: 'live', start, end };
}

/* =========================================================
   أدوات مشتركة: الصور المحلية + "عرض المزيد" + فك ترميز النص المحفوظ
   (دوال الصور المحلية الأساسية في content-config.js)
   ========================================================= */

// عكس sanitizeInput عند تعبئة نموذج التعديل، حتى لا يُرمَّز النص مرتين عند الحفظ
function unescapeSanitized(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'").replace(/&amp;/g, '&');
}

// يحدد مصدر الصورة: معرّف Google Drive (driveFileId) أو رابط (imageUrl) أو ملف/رابط في imageFile
function getItemImagePath(kind, data) {
  return safeImgUrl(getItemImagePathRaw(kind, data));
}

function getItemImagePathRaw(kind, data) {
  if (!data) return '';
  if (typeof data.driveFileId === 'string' && data.driveFileId.trim()) {
    const driveUrl = buildGoogleDriveImageUrl(data.driveFileId.trim(), 1600);
    if (driveUrl) return driveUrl;
  }
  if (typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    const driveIdFromUrl = extractGoogleDriveFileId(data.imageUrl);
    if (driveIdFromUrl) return buildGoogleDriveImageUrl(driveIdFromUrl, 1600);
    if (data.imageUrl.indexOf('https://') === 0) return data.imageUrl.trim();
  }
  if (typeof data.imageFile === 'string' && data.imageFile.trim()) {
    const resolved = resolveImageInputSource(data.imageFile, kind);
    if (resolved && resolved.path) return resolved.path;
  }
  return '';
}

// منطقة الصورة: الصورة إن وُجدت، وإلا (أو إن فشل تحميلها) رسالة "الصورة غير متاحة حاليًا."
// لا تُعرض صورة مكسورة أبداً، ولا يختفي محتوى البطاقة بسبب الصورة.
function buildImageAreaHtml(kind, data, altText, clickable) {
  const path = getItemImagePath(kind, data);
  const safeAlt = escHtml(altText || '');
  if (!path) {
    return '<div class="media-frame"><div class="image-unavailable">الصورة غير متاحة حاليًا.</div></div>';
  }
  const driveId = (data && data.driveFileId) || extractGoogleDriveFileId(path);
  const driveAttr = driveId ? ` data-drive-id="${escHtml(driveId)}"` : '';
  const clickAttr = clickable ? ` data-lightbox="${escHtml(path)}"` : '';
  return `<div class="media-frame${clickable ? ' is-clickable' : ''}"${clickAttr}>
    <img src="${escHtml(path)}"${driveAttr} alt="${safeAlt}" loading="lazy" onerror="handleImageLoadError(this)">
    <div class="image-unavailable is-hidden">الصورة غير متاحة حاليًا.</div>
  </div>`;
}

function handleImageLoadError(img) {
  // إذا كانت الصورة من Google Drive، نجرب الرابط البديل (lh3.googleusercontent.com) قبل إعلان الفشل
  const driveId = img.getAttribute('data-drive-id') || extractGoogleDriveFileId(img.src || '');
  if (driveId && !img.getAttribute('data-tried-fallback')) {
    img.setAttribute('data-tried-fallback', '1');
    const fallbackUrl = buildGoogleDriveFallbackUrl(driveId, 1600);
    if (fallbackUrl && fallbackUrl !== img.src) {
      img.src = fallbackUrl;
      const frame = img.parentElement;
      if (frame && frame.hasAttribute('data-lightbox')) {
        frame.setAttribute('data-lightbox', fallbackUrl);
      }
      return;
    }
  }

  console.warn('[الصور] تعذّر تحميل الصورة (404 أو مسار خاطئ): ' + img.src);
  img.style.display = 'none';
  const frame = img.parentElement;
  if (frame) {
    frame.classList.remove('is-clickable');
    frame.removeAttribute('data-lightbox');
    const fallback = frame.querySelector('.image-unavailable');
    if (fallback) fallback.classList.remove('is-hidden');
  }
}

function handleThumbImageError(img) {
  const driveId = extractGoogleDriveFileId(img.src || '');
  if (driveId && !img.getAttribute('data-tried-fallback')) {
    img.setAttribute('data-tried-fallback', '1');
    const fallbackUrl = buildGoogleDriveFallbackUrl(driveId, 800);
    if (fallbackUrl && fallbackUrl !== img.src) {
      img.src = fallbackUrl;
      return;
    }
  }
  img.style.display = 'none';
}

// نص قابل للطي: يظهر الزر فقط إن كان النص طويلاً، وكل بطاقة مستقلة عن غيرها
const EXPANDABLE_TEXT_LIMIT = 200;
function buildExpandableHtml(text, extraClass) {
  const body = text || '';
  // الوصف الطويل في المعرض: معاينة من 6 كلمات (قطع عند حدود الكلمات فقط، آمن للعربية) + «عرض المزيد»
  if (extraClass === 'gallery-desc') {
    const clean = unescapeSanitized(String(body)).trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length > 6) {
      const short = words.slice(0, 6).join(' ') + '…';
      return `<div class="expandable-wrap">
    <p class="expandable-body gallery-desc" data-short="${escHtml(short)}" data-full="${escHtml(clean)}">${escHtml(short)}</p>
    <button type="button" class="read-more-btn" aria-expanded="false" onclick="toggleExpandable(this)">عرض المزيد</button>
  </div>`;
    }
    return `<div class="expandable-wrap"><p class="expandable-body gallery-desc">${escHtml(clean)}</p></div>`;
  }
  const needsToggle = body.length > EXPANDABLE_TEXT_LIMIT || (body.match(/\n/g) || []).length > 4;
  return `<div class="expandable-wrap">
    <p class="expandable-body ${escHtml(extraClass || '')} ${needsToggle ? 'is-collapsed' : ''}">${escHtml(body)}</p>
    ${needsToggle ? '<button type="button" class="read-more-btn" onclick="toggleExpandable(this)">عرض المزيد</button>' : ''}
  </div>`;
}

function toggleExpandable(btn) {
  const body = btn.previousElementSibling;
  if (!body) return;
  if (body.hasAttribute('data-short')) {
    // طيّ/فتح بالنص الكامل دون مغادرة الصفحة (textContent: بلا حقن HTML)
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    body.textContent = expanded ? body.getAttribute('data-short') : body.getAttribute('data-full');
    btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    btn.innerText = expanded ? 'عرض المزيد' : 'عرض أقل';
    return;
  }
  const collapsed = body.classList.toggle('is-collapsed');
  btn.innerText = collapsed ? 'عرض المزيد' : 'عرض أقل';
}

// فتح Lightbox عند الضغط على صورة بطاقة المعرض (تفويض حدث واحد بدل onclick مضمّن)
document.addEventListener('click', (e) => {
  const frame = e.target.closest ? e.target.closest('.media-frame[data-lightbox]') : null;
  if (frame) openGalleryLightbox(frame.getAttribute('data-lightbox'));
});

function openAnnouncementModal(mode, id) {
  const form = document.getElementById('adminAnnouncementForm');
  const titleInput = document.getElementById('announcementTitleInput');
  const contentInput = document.getElementById('announcementContentInput');
  const imageFileInput = document.getElementById('announcementImageFileInput');
  const draftCheckbox = document.getElementById('announcementDraftCheckbox');
  const heading = document.getElementById('announcementModalHeading');
  const modalTitle = document.getElementById('announcementModalTitle');
  const submitBtnText = document.getElementById('announcementSubmitBtnText');
  const errorMsg = document.getElementById('announcementError');
  const successMsg = document.getElementById('announcementSuccess');

  form.reset();
  clearSelectedDriveFile('announcements');
  setPickerValue('announcementStartAtInput', '');
  setPickerValue('announcementEndAtInput', '');
  errorMsg.innerText = '';
  successMsg.style.display = 'none';

  if (mode === 'edit' && id) {
    pendingEditAnnouncementId = id;
    heading.innerText = 'تعديل الإعلان';
    modalTitle.innerText = 'تعديل إعلان';
    submitBtnText.innerText = 'حفظ التعديلات';

    db.collection('announcements').doc(id).get().then((doc) => {
      if (doc.exists) {
        const data = doc.data();
        titleInput.value = unescapeSanitized(data.title || '');
        contentInput.value = unescapeSanitized(data.content || '');
        imageFileInput.value = data.imageFile || (data.driveFileId ? ('https://drive.google.com/file/d/' + data.driveFileId + '/view') : (data.imageUrl || ''));
        draftCheckbox.checked = data.published === false;
        const catEl = document.getElementById('announcementCategoryInput');
        if (catEl) catEl.value = data.category || '';
        setPickerValue('announcementStartAtInput',
          data.startAt && data.startAt.toDate ? dateToAlgiersLocalInputValue(data.startAt.toDate()) : '');
        setPickerValue('announcementEndAtInput',
          data.endAt && data.endAt.toDate ? dateToAlgiersLocalInputValue(data.endAt.toDate()) : '');
      }
    }).catch((error) => {
      errorMsg.innerText = 'تعذر تحميل بيانات الإعلان: ' + error.message;
    });
  } else {
    pendingEditAnnouncementId = null;
    heading.innerText = 'إعلان جديد';
    modalTitle.innerText = 'إنشاء إعلان';
    submitBtnText.innerText = 'حفظ الإعلان';
  }

  openModal('adminAnnouncementModal');
}

// ضغط الصورة قبل الرفع (Canvas API فقط، بدون مكتبات خارجية)
function compressImageFile(file, maxDimension, quality) {
  maxDimension = maxDimension || 1600;
  quality = quality || 0.8;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          resolve(file); // فشل الضغط: نرفع الملف الأصلي بدل إيقاف العملية بالكامل
        }
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // فشل قراءة الصورة للضغط: نرفع الملف الأصلي بدل إيقاف العملية بالكامل
    };

    img.src = objectUrl;
  });
}

// حفظ إعلان صفحة الموقع (إنشاء/تعديل) — يدعم الرفع المباشر إلى Google Drive أو رابط Google Drive أو ملف محلي
const adminAnnouncementForm = document.getElementById('adminAnnouncementForm');
if (adminAnnouncementForm) {
  adminAnnouncementForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = sanitizeInput(document.getElementById('announcementTitleInput').value.trim());
    const content = sanitizeInput(document.getElementById('announcementContentInput').value.trim());
    const rawImageName = document.getElementById('announcementImageFileInput').value.trim();
    const selectedFile = getSelectedDriveFile('announcements');
    const isDraft = document.getElementById('announcementDraftCheckbox').checked;

    const checkingBox = document.getElementById('announcementCheckingBox');
    const checkingText = document.getElementById('announcementCheckingText');
    const submitBtn = document.getElementById('announcementSubmitBtn');
    const errorMsg = document.getElementById('announcementError');
    const successMsg = document.getElementById('announcementSuccess');

    errorMsg.innerText = '';
    successMsg.style.display = 'none';

    if (!title || !content) {
      errorMsg.innerText = 'يرجى كتابة عنوان ومحتوى الإعلان.';
      return;
    }

    // تحليل حقل الرابط / اسم الملف إن لم يكن هناك ملف مختار للرفع المباشر
    const resolvedInput = resolveImageInputSource(rawImageName, 'announcements');
    if (!selectedFile && rawImageName && resolvedInput.type === 'invalid') {
      errorMsg.innerText = 'صيغة الصورة غير صالحة. اختر صورة للرفع إلى Google Drive، أو الصق رابط مشاركة Google Drive، أو اكتب اسم ملف محلي (مثل announcement-001.jpg).';
      return;
    }

    const startAtDate = algiersLocalStringToDate(document.getElementById('announcementStartAtInput').value);
    const endAtDate = algiersLocalStringToDate(document.getElementById('announcementEndAtInput').value);
    if (startAtDate && endAtDate && endAtDate <= startAtDate) {
      errorMsg.innerText = 'يجب أن يكون وقت الانتهاء بعد وقت البداية.';
      return;
    }

    submitBtn.disabled = true;
    checkingBox.style.display = 'flex';
    checkingText.innerText = selectedFile ? 'جاري ضغط الصورة ورفعها إلى Google Drive...' : 'جاري حفظ الإعلان...';

    const isEditing = !!pendingEditAnnouncementId;

    // شبكة أمان: لا يبقى الـLoading معلّقاً للأبد
    let timedOut = false;
    const safetyTimeout = setTimeout(() => {
      timedOut = true;
      checkingBox.style.display = 'none';
      submitBtn.disabled = false;
      errorMsg.innerText = 'استغرقت العملية وقتاً طويلاً بلا استجابة. تحقق من اتصالك وحاول مرة أخرى.';
    }, 45000);

    const uploadStepPromise = selectedFile
      ? uploadImageToGoogleDrive(selectedFile, 'announcements', (msg) => { checkingText.innerText = msg; })
      : Promise.resolve({
          driveFileId: resolvedInput.driveFileId || '',
          imageUrl: resolvedInput.imageUrl || '',
          imageFile: resolvedInput.imageFile || ''
        });

    uploadStepPromise
      .then((mediaInfo) => {
        if (timedOut) return;
        checkingText.innerText = 'جاري حفظ بيانات الإعلان في قاعدة البيانات...';

        const data = {
          title: title,
          content: content,
          imageFile: mediaInfo.imageFile || '',
          imageUrl: mediaInfo.imageUrl || '',
          driveFileId: mediaInfo.driveFileId || '',
          published: !isDraft,
          category: (document.getElementById('announcementCategoryInput') || {}).value || '',
          startAt: startAtDate ? firebase.firestore.Timestamp.fromDate(startAtDate) : null,
          endAt: endAtDate ? firebase.firestore.Timestamp.fromDate(endAtDate) : null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (isEditing) {
          return db.collection('announcements').doc(pendingEditAnnouncementId).update(data);
        } else {
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          data.createdBy = auth.currentUser ? auth.currentUser.uid : null;
          return db.collection('announcements').add(data);
        }
      })
      .then(() => {
        if (timedOut) return;
        clearTimeout(safetyTimeout);
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        successMsg.style.display = 'block';
        clearSelectedDriveFile('announcements');
        showAdminNotification(isEditing ? 'تم تعديل الإعلان بنجاح!' : (isDraft ? 'تم حفظ الإعلان كمسودة.' : 'تم حفظ الإعلان بنجاح!'), 'success');
        setTimeout(() => {
          closeModal('adminAnnouncementModal');
          pendingEditAnnouncementId = null;
        }, 800);
      })
      .catch((error) => {
        if (timedOut) return;
        clearTimeout(safetyTimeout);
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        errorMsg.innerText = 'حدث خطأ أثناء الحفظ: ' + (error && error.message ? error.message : String(error)) + (error && error.code ? ' (الكود: ' + error.code + ')' : '');
      });
  });
}

let unsubscribeAnnouncementsAdminListener = null;
let unsubscribePublicGalleryListener = null;
let unsubscribePublicAnnouncementsListener = null;
function loadAnnouncementsAdmin() {
  const container = document.getElementById('announcementsListContainer');
  if (!container) return;

  // إلغاء أي مستمع سابق لتفادي تراكم عدة مستمعين عند فتح التبويب أكثر من مرة
  if (unsubscribeAnnouncementsAdminListener) {
    unsubscribeAnnouncementsAdminListener();
    unsubscribeAnnouncementsAdminListener = null;
  }

  container.innerHTML = '<p class="announcements-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</p>';

  // onSnapshot بدل get() لمرة واحدة: يضمن ظهور أي إعلان جديد فوراً بمجرد
  // تأكيد الخادم للكتابة (بدل الاعتماد على توقيت setTimeout يدوي قد لا يتزامن
  // مع لحظة حسم قيمة serverTimestamp فعلياً في الخلفية).
  unsubscribeAnnouncementsAdminListener = db.collection('announcements').orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      container.innerHTML = '';

      if (snapshot.empty) {
        container.innerHTML = '<p class="announcements-empty-text">لا توجد إعلانات حالياً. اضغط "إنشاء إعلان جديد" لإضافة أول إعلان.</p>';
        return;
      }

      snapshot.forEach((doc) => {
        const data = doc.data();
        const id = doc.id;
        const dateText = data.createdAt && data.createdAt.toDate
          ? data.createdAt.toDate().toLocaleDateString('ar-DZ')
          : 'جاري الحفظ...';

        const timing = getAnnouncementTimingStatus(data);
        let timingBadge = '<span class="status-badge status-verified"><i class="fa-solid fa-circle-check"></i> منشور</span>';
        if (data.published === false) {
          timingBadge = '<span class="status-badge status-draft"><i class="fa-solid fa-file-pen"></i> مسودة</span>';
        } else if (timing.state === 'scheduled') {
          timingBadge = '<span class="status-badge status-pending"><i class="fa-solid fa-clock"></i> مجدول</span>';
        } else if (timing.state === 'expired') {
          timingBadge = '<span class="status-badge status-rejected"><i class="fa-solid fa-hourglass-end"></i> منتهي</span>';
        }
        const timingDetails = (timing.start || timing.end)
          ? `<p style="color:#94a3b8; font-size:0.75rem; margin-top:4px;">
               ${timing.start ? `<i class="fa-solid fa-play"></i> يبدأ: ${formatAlgiersDateTime(timing.start)}` : ''}
               ${timing.end ? ` &nbsp; <i class="fa-solid fa-stop"></i> ينتهي: ${formatAlgiersDateTime(timing.end)}` : ''}
             </p>`
          : '';

        const card = document.createElement('div');
        card.className = 'announcement-card-item hover-lift';
        card.innerHTML = `
          ${getItemImagePath('announcements', data) ? `<img src="${escHtml(getItemImagePath('announcements', data))}" class="announcement-card-thumb" alt="" loading="lazy" onerror="handleThumbImageError(this)">` : ''}
          <div class="announcement-card-info" style="flex:1;">
            <h3>${escHtml(data.title) || 'بدون عنوان'}</h3>
            <p class="announcement-excerpt">${escHtml(unescapeSanitized(data.content || '').slice(0, 120))}</p>
            <p style="margin-top:4px;">${timingBadge}</p>
            ${timingDetails}
            <p style="color:#94a3b8; font-size:0.75rem; margin-top:4px;"><i class="fa-solid fa-calendar"></i> ${dateText}</p>
          </div>
          <div class="announcement-card-actions">
            ${can('announcements.edit') ? `<button class="btn-edit" onclick="openAnnouncementModal('edit', ${jsArg(id)})"><i class="fa-solid fa-pen"></i> تعديل</button>` : ''}
            ${can('announcements.delete') ? `<button class="btn-delete" onclick="confirmDeleteAnnouncement(${jsArg(id)})"><i class="fa-solid fa-trash-can"></i> حذف</button>` : ''}
          </div>
        `;
        container.appendChild(card);
      });
    }, (error) => {
      container.innerHTML = '<p class="announcements-empty-text">حدث خطأ أثناء جلب الإعلانات.</p>';
      console.error('loadAnnouncementsAdmin error:', error);
    });
}

// بدء تأكيد حذف إعلان
function confirmDeleteAnnouncement(id) {
  pendingDeleteAnnouncementId = id;
  document.getElementById('deleteAnnouncementCheckingBox').style.display = 'none';
  document.getElementById('deleteAnnouncementSuccess').style.display = 'none';
  document.getElementById('deleteAnnouncementConfirmButtons').style.display = 'flex';
  openModal('deleteAnnouncementConfirmModal');
}

// تنفيذ حذف الإعلان فعلياً (مع حذف الصورة من Google Drive إن كان الخيار مفعّلاً)
function executeDeleteAnnouncement() {
  if (!pendingDeleteAnnouncementId) return;

  const checkingBox = document.getElementById('deleteAnnouncementCheckingBox');
  const successMsg = document.getElementById('deleteAnnouncementSuccess');
  const buttonsRow = document.getElementById('deleteAnnouncementConfirmButtons');

  buttonsRow.style.display = 'none';
  checkingBox.style.display = 'flex';

  const docRef = db.collection('announcements').doc(pendingDeleteAnnouncementId);
  docRef.get()
    .then((doc) => {
      const data = doc.exists ? doc.data() : null;
      const driveId = data ? (data.driveFileId || extractGoogleDriveFileId(data.imageUrl || data.imageFile || '')) : '';
      return docRef.delete().then(() => {
        if (driveId) deleteFileFromGoogleDriveIfEnabled(driveId);
      });
    })
    .then(() => {
      checkingBox.style.display = 'none';
      successMsg.style.display = 'block';
      setTimeout(() => {
        closeModal('deleteAnnouncementConfirmModal');
        pendingDeleteAnnouncementId = null;
        loadAnnouncementsAdmin();
      }, 1000);
    })
    .catch((error) => {
      checkingBox.style.display = 'none';
      buttonsRow.style.display = 'flex';
      showAdminNotification('حدث خطأ أثناء الحذف: ' + error.message, 'error');
    });
}

// عرض الإعلانات المنشورة للزوار في الصفحة العامة
// - onSnapshot يحدّث الذاكرة المؤقتة عند أي تغيير فعلي في Firestore.
// - مؤقّت كل ثانية يعيد تقييم نافذة الوقت (startAt/endAt) على الذاكرة المؤقتة:
//   يُظهر الإعلان تلقائياً عند حلول وقت البداية ويخفيه عند الانتهاء دون إعادة
//   تحميل الصفحة، ويحدّث العدّاد التنازلي.
// - الإخفاء هنا عرضي فقط (واجهة): لا يُحذف أي مستند من Firestore إطلاقاً.
let publicAnnouncementsCache = [];
let publicAnnouncementsTickHandle = null;
let publicAnnouncementsLastKey = null;

function stopPublicAnnouncementsTicker() {
  document.body.classList.remove('has-active-announcements');
  if (publicAnnouncementsTickHandle) {
    clearInterval(publicAnnouncementsTickHandle);
    publicAnnouncementsTickHandle = null;
  }
  publicAnnouncementsLastKey = null;
}

// لون العدّاد يتدرّج من الهادئ (أخضر مزرق) إلى البرتقالي ثم الأحمر كلما اقترب الانتهاء.
// الأرقام تُعرض دائماً بجانب اللون، فلا يُعتمد على اللون وحده.
function countdownColorsForRemaining(remainingMs) {
  const FULL_RANGE_MS = 6 * 60 * 60 * 1000; // أكثر من 6 ساعات = اللون الهادئ الكامل
  const t = Math.max(0, Math.min(1, remainingMs / FULL_RANGE_MS));
  const hue = Math.round(150 * Math.pow(t, 0.8)); // 150 (هادئ) → 0 (أحمر)
  return {
    background: `hsl(${hue}, 65%, 22%)`,
    border: `hsl(${hue}, 80%, 52%)`
  };
}

function formatCountdown(remainingMs) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function tickPublicAnnouncements() {
  const container = document.getElementById('publicAnnouncementsContainer');
  if (!container) return;

  const visibleItems = publicAnnouncementsCache.filter((item) => getAnnouncementTimingStatus(item.data).visible);
  // المؤشر الأحمر بجانب زر «الإعلانات»: يظهر فقط عند وجود إعلان نشط فعلاً الآن
  document.body.classList.toggle('has-active-announcements', visibleItems.length > 0);

  // مفتاح يتغير عند تغيّر مجموعة الإعلانات الظاهرة أو تعديل أي منها
  const key = visibleItems.map((item) => {
    const u = item.data.updatedAt && item.data.updatedAt.toMillis ? item.data.updatedAt.toMillis() : 0;
    return item.id + ':' + u;
  }).join('|');

  if (key !== publicAnnouncementsLastKey) {
    publicAnnouncementsLastKey = key;
    if (typeof renderHomeNews === 'function') renderHomeNews(visibleItems);

    if (visibleItems.length === 0) {
      container.innerHTML = '<p class="announcements-empty-text">لا توجد إعلانات منشورة حالياً.</p>';
      return;
    }

    container.innerHTML = '';
    visibleItems.forEach((item) => {
      const data = item.data;
      const dateText = data.createdAt && data.createdAt.toDate
        ? data.createdAt.toDate().toLocaleDateString('ar-DZ')
        : '';
      const endMillis = data.endAt && data.endAt.toMillis ? data.endAt.toMillis() : null;

      const card = document.createElement('div');
      card.className = 'public-announcement-card hover-lift';
      card.setAttribute('data-category', data.category || '');
      card.innerHTML = `
        ${data.category ? `<span class="news-category-badge">${escHtml(newsCategoryLabel(data.category))}</span>` : ''}
        <h3>${escHtml(data.title)}</h3>
        <p class="announcement-date"><i class="fa-solid fa-calendar"></i> ${escHtml(dateText)}</p>
        ${buildImageAreaHtml('announcements', data, data.title, false)}
        ${buildExpandableHtml(data.content || '', 'announcement-body')}
        ${endMillis ? `
          <div class="announcement-countdown" data-end="${endMillis}">
            <i class="fa-solid fa-hourglass-half"></i>
            <span class="countdown-label">ينتهي الإعلان خلال:</span>
            <span class="countdown-digits" dir="ltr">--:--:--</span>
          </div>` : ''}
      `;
      container.appendChild(card);
    });
    if (window.V3) V3.applyBulletinFilter();
  }

  // تحديث العدّادات في مكانها كل ثانية دون إعادة بناء البطاقات
  const now = Date.now();
  container.querySelectorAll('.announcement-countdown').forEach((el) => {
    const endMillis = Number(el.getAttribute('data-end'));
    const remaining = endMillis - now;
    const digitsEl = el.querySelector('.countdown-digits');
    if (digitsEl) digitsEl.innerText = formatCountdown(remaining);
    const colors = countdownColorsForRemaining(remaining);
    el.style.background = colors.background;
    el.style.borderColor = colors.border;
  });
}

function renderPublicAnnouncements() {
  const container = document.getElementById('publicAnnouncementsContainer');
  if (!container) return;

  if (unsubscribePublicAnnouncementsListener) {
    unsubscribePublicAnnouncementsListener();
    unsubscribePublicAnnouncementsListener = null;
  }
  stopPublicAnnouncementsTicker();

  // ملاحظة مهمة: لا نستخدم orderBy مع where على حقلين مختلفين لأن ذلك يتطلب
  // فهرساً مركّباً (Composite Index) يجب إنشاؤه يدوياً في Firebase Console، وغيابه
  // يجعل الاستعلام يفشل بصمت فلا تظهر الإعلانات. نكتفي بـ where على حقل واحد
  // (فهرس تلقائي) ونرتّب محلياً بالأحدث أولاً.
  unsubscribePublicAnnouncementsListener = db.collection('announcements')
    .where('published', '==', true)
    .onSnapshot((snapshot) => {
      publicAnnouncementsCache = [];
      snapshot.forEach((doc) => publicAnnouncementsCache.push({ id: doc.id, data: doc.data() }));
      const createdMillis = (item) => (item.data.createdAt && item.data.createdAt.toMillis)
        ? item.data.createdAt.toMillis() : Number.MAX_SAFE_INTEGER; // الكتابة المعلّقة = الأحدث
      publicAnnouncementsCache.sort((a, b) => createdMillis(b) - createdMillis(a));
      publicAnnouncementsLastKey = null; // إجبار إعادة البناء بعد أي تغيير حقيقي
      tickPublicAnnouncements();

      if (!publicAnnouncementsTickHandle) {
        publicAnnouncementsTickHandle = setInterval(tickPublicAnnouncements, 1000);
      }
    }, (error) => {
      container.innerHTML = '<p class="announcements-empty-text">تعذر تحميل الإعلانات حالياً.</p>';
      const newsGrid = document.getElementById('latestNewsGrid');
      if (newsGrid) newsGrid.innerHTML = '<div class="news-state-box">تعذر تحميل الأخبار حالياً. حاول تحديث الصفحة بعد قليل.</div>';
      console.error('renderPublicAnnouncements error:', error);
    });
}


// رفع صورة للمعرض
/* =========================================================
   إدارة المعرض الرقمي من لوحة الأدمن — رفع مباشر إلى Google Drive أو رابط/ملف
   ========================================================= */
let pendingEditGalleryId = null;

function resetGalleryForm() {
  const form = document.getElementById('adminGalleryUploadForm');
  if (form) form.reset();
  clearSelectedDriveFile('gallery');
  pendingEditGalleryId = null;
  const text = document.getElementById('galleryUploadSubmitText');
  if (text) text.innerText = 'حفظ العنصر';
  const cancelBtn = document.getElementById('galleryCancelEditBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function cancelGalleryEdit() {
  resetGalleryForm();
  document.getElementById('galleryUploadError').innerText = '';
}

const adminGalleryUploadForm = document.getElementById('adminGalleryUploadForm');
if (adminGalleryUploadForm) {
  adminGalleryUploadForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const category = document.getElementById('galleryUploadCategory').value;
    const title = sanitizeInput(document.getElementById('galleryUploadTitle').value.trim());
    const description = sanitizeInput(document.getElementById('galleryUploadDescription').value.trim());
    const rawImageName = document.getElementById('galleryImageFileInput').value.trim();
    const filesToUpload = getSelectedDriveFiles('gallery');
    const errorMsg = document.getElementById('galleryUploadError');
    const submitBtn = document.getElementById('galleryUploadSubmitBtn');
    const submitText = document.getElementById('galleryUploadSubmitText');

    errorMsg.innerText = '';

    if (!category) { errorMsg.innerText = 'يرجى اختيار التصنيف.'; return; }
    if (!title) { errorMsg.innerText = 'يرجى كتابة عنوان للصورة أو الألبوم.'; return; }

    const isEditing = !!pendingEditGalleryId;
    const totalFiles = filesToUpload.length;
    const originalBtnLabel = isEditing ? 'حفظ التعديلات' : (totalFiles > 1 ? ('حفظ ' + totalFiles + ' صور في المعرض') : 'حفظ العنصر');

    if (totalFiles === 0 && !rawImageName) {
      errorMsg.innerText = 'يرجى اختيار صورة واحدة على الأقل لرفعها إلى Google Drive، أو لصق رابط مشاركة.';
      return;
    }

    const resolvedInput = resolveImageInputSource(rawImageName, 'gallery');
    if (totalFiles === 0 && rawImageName && resolvedInput.type === 'invalid') {
      errorMsg.innerText = 'صيغة الصورة غير صالحة. اختر صورة للرفع إلى Google Drive، أو الصق رابط مشاركة Google Drive، أو اكتب اسم ملف محلي (مثل gallery-001.jpg).';
      return;
    }

    submitBtn.disabled = true;

    // 1) وضع التعديل (عنصر واحد محدد)
    if (isEditing) {
      const editFile = filesToUpload[0];
      const uploadStepPromise = editFile
        ? uploadImageToGoogleDrive(editFile, 'gallery', (msg) => { if (submitText) submitText.innerText = msg; })
        : Promise.resolve({
            driveFileId: resolvedInput.driveFileId || '',
            imageUrl: resolvedInput.imageUrl || '',
            imageFile: resolvedInput.imageFile || ''
          });

      uploadStepPromise
        .then((mediaInfo) => {
          if (submitText) submitText.innerText = 'جاري حفظ التعديلات...';
          const data = {
            category: category,
            title: title,
            description: description,
            imageFile: mediaInfo.imageFile || '',
            imageUrl: mediaInfo.imageUrl || '',
            driveFileId: mediaInfo.driveFileId || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          return db.collection('gallery').doc(pendingEditGalleryId).update(data);
        })
        .then(() => {
          submitBtn.disabled = false;
          showAdminNotification('تم تعديل عنصر المعرض بنجاح!', 'success');
          resetGalleryForm();
        })
        .catch((error) => {
          submitBtn.disabled = false;
          if (submitText) submitText.innerText = originalBtnLabel;
          errorMsg.innerText = 'حدث خطأ أثناء الحفظ: ' + (error && error.message ? error.message : String(error));
        });
      return;
    }

    // 2) رفع عدة صور (أو صورة واحدة) محددة من الجهاز إلى Google Drive
    if (totalFiles > 0) {
      let currentIndex = 0;

      const uploadNext = () => {
        if (currentIndex >= totalFiles) {
          submitBtn.disabled = false;
          showAdminNotification(
            totalFiles === 1
              ? 'تم رفع وحفظ صورة المعرض بنجاح!'
              : ('تم رفع وحفظ جميع الصور (' + totalFiles + ' صور) في المعرض بنجاح!'),
            'success'
          );
          resetGalleryForm();
          return;
        }

        const currentFile = filesToUpload[currentIndex];
        const fileNum = currentIndex + 1;
        const progressPrefix = totalFiles > 1 ? ('[' + fileNum + '/' + totalFiles + '] ') : '';

        if (submitText) {
          submitText.innerText = totalFiles === 1
            ? 'جاري الرفع إلى Google Drive...'
            : ('جاري رفع الصورة (' + fileNum + ' من ' + totalFiles + ')...');
        }

        uploadImageToGoogleDrive(currentFile, 'gallery', (msg) => {
          if (submitText) submitText.innerText = progressPrefix + msg;
        })
          .then((mediaInfo) => {
            if (submitText) {
              submitText.innerText = totalFiles === 1
                ? 'جاري الحفظ في المعرض...'
                : ('جاري حفظ الصورة (' + fileNum + ' من ' + totalFiles + ')...');
            }
            const itemTitle = totalFiles > 1 ? (title + ' (' + fileNum + ')') : title;
            const data = {
              category: category,
              title: itemTitle,
              description: description,
              imageFile: mediaInfo.imageFile || '',
              imageUrl: mediaInfo.imageUrl || '',
              driveFileId: mediaInfo.driveFileId || '',
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              uploadedBy: auth.currentUser ? auth.currentUser.uid : null
            };
            return db.collection('gallery').add(data);
          })
          .then(() => {
            currentIndex++;
            uploadNext();
          })
          .catch((error) => {
            submitBtn.disabled = false;
            if (submitText) submitText.innerText = originalBtnLabel;
            errorMsg.innerText = 'توقف الرفع عند الصورة ' + fileNum + ' من ' + totalFiles + ': ' + (error && error.message ? error.message : String(error));
          });
      };

      uploadNext();
      return;
    }

    // 3) الحفظ بواسطة رابط خارجي أو اسم ملف محلي مكتوب في الحقل النصي
    if (submitText) submitText.innerText = 'جاري الحفظ...';

    const data = {
      category: category,
      title: title,
      description: description,
      imageFile: resolvedInput.imageFile || '',
      imageUrl: resolvedInput.imageUrl || '',
      driveFileId: resolvedInput.driveFileId || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy: auth.currentUser ? auth.currentUser.uid : null
    };

    db.collection('gallery').add(data)
      .then(() => {
        submitBtn.disabled = false;
        showAdminNotification('تم حفظ عنصر المعرض بنجاح!', 'success');
        resetGalleryForm();
      })
      .catch((error) => {
        submitBtn.disabled = false;
        if (submitText) submitText.innerText = originalBtnLabel;
        errorMsg.innerText = 'حدث خطأ أثناء الحفظ: ' + (error && error.message ? error.message : String(error));
      });
  });
}

function editGalleryItem(id) {
  db.collection('gallery').doc(id).get().then((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    pendingEditGalleryId = id;
    clearSelectedDriveFile('gallery');
    document.getElementById('galleryUploadCategory').value = data.category || '';
    document.getElementById('galleryUploadTitle').value = unescapeSanitized(data.title || '');
    document.getElementById('galleryUploadDescription').value = unescapeSanitized(data.description || '');
    document.getElementById('galleryImageFileInput').value = data.imageFile || (data.driveFileId ? ('https://drive.google.com/file/d/' + data.driveFileId + '/view') : (data.imageUrl || ''));
    document.getElementById('galleryUploadSubmitText').innerText = 'حفظ التعديلات';
    document.getElementById('galleryCancelEditBtn').style.display = 'inline-flex';
    adminGalleryUploadForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }).catch((error) => {
    showAdminNotification('تعذر تحميل العنصر: ' + error.message, 'error');
  });
}

let unsubscribeGalleryAdminListener = null;
function loadGalleryAdmin() {
  const container = document.getElementById('adminGalleryListContainer');
  if (!container) return;

  if (unsubscribeGalleryAdminListener) {
    unsubscribeGalleryAdminListener();
    unsubscribeGalleryAdminListener = null;
  }

  // إخفاء نموذج الإضافة عمن لا يملك صلاحية الإضافة (الحماية الحقيقية في Firestore Rules)
  if (adminGalleryUploadForm) adminGalleryUploadForm.style.display = can('gallery.upload') ? '' : 'none';

  container.innerHTML = '<p class="announcements-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</p>';
  const categoryLabels = { units: 'الوحدات', gatherings: 'التجمعات الكشفية', camps: 'المخيمات', trips: 'الرحلات', activities: 'الأنشطة' };

  unsubscribeGalleryAdminListener = db.collection('gallery').orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      container.innerHTML = '';
      if (snapshot.empty) {
        container.innerHTML = '<p class="announcements-empty-text">لا توجد عناصر في المعرض حالياً.</p>';
        return;
      }
      snapshot.forEach((doc) => {
        const data = doc.data();
        const path = getItemImagePath('gallery', data);
        const isDrive = !!(data.driveFileId || extractGoogleDriveFileId(data.imageUrl || data.imageFile || ''));
        const sourceTag = path ? (isDrive ? ' — <i class="fa-brands fa-google-drive"></i> Google Drive' : ' — ملف محلي') : ' — بلا صورة';
        const card = document.createElement('div');
        card.className = 'announcement-card-item hover-lift';
        card.innerHTML = `
          ${path ? `<img src="${escHtml(path)}" class="announcement-card-thumb" alt="" loading="lazy" onerror="handleThumbImageError(this)">` : ''}
          <div class="announcement-card-info" style="flex:1;">
            <h3>${escHtml(data.title) || 'بدون عنوان'}</h3>
            <p class="announcement-excerpt">${escHtml(categoryLabels[data.category] || data.category || '')}${sourceTag}</p>
          </div>
          <div class="announcement-card-actions">
            ${can('gallery.manage') ? `<button class="btn-edit" onclick="editGalleryItem(${jsArg(doc.id)})"><i class="fa-solid fa-pen"></i> تعديل</button>` : ''}
            ${can('gallery.manage') ? `<button class="btn-delete" onclick="deleteGalleryImage(${jsArg(doc.id)})"><i class="fa-solid fa-trash-can"></i> حذف</button>` : ''}
          </div>
        `;
        container.appendChild(card);
      });
    }, (error) => {
      container.innerHTML = '<p class="announcements-empty-text">حدث خطأ أثناء جلب العناصر: ' + escHtml(error.message) + '</p>';
      console.error('loadGalleryAdmin error:', error);
    });
}

// حذف سجل المعرض من Firestore (ومع حذف الصورة تلقائياً من Google Drive إن كان الخيار مفعّلاً)
function deleteGalleryImage(id) {
  if (!confirm('هل أنت متأكد من حذف هذا العنصر من المعرض؟')) return;
  const docRef = db.collection('gallery').doc(id);
  docRef.get()
    .then((doc) => {
      const data = doc.exists ? doc.data() : null;
      const driveId = data ? (data.driveFileId || extractGoogleDriveFileId(data.imageUrl || data.imageFile || '')) : '';
      return docRef.delete().then(() => {
        if (driveId) deleteFileFromGoogleDriveIfEnabled(driveId);
      });
    })
    .then(() => showAdminNotification('تم حذف العنصر من المعرض.', 'success'))
    .catch((error) => showAdminNotification('حدث خطأ أثناء الحذف: ' + error.message, 'error'));
}

// showAdminNotification: معرّفة الآن في site-extras.js (نظام إشعارات متاح للقراءة الآلية).

function openLeaderDetailsModal(leaderId) {
  const modal = document.getElementById('leaderDetailsModal');
  if (!modal) return;

  const nameEl = document.getElementById('viewLeaderName');
  const emailEl = document.getElementById('viewLeaderEmail');
  const roleEl = document.getElementById('viewLeaderRole');
  const dateEl = document.getElementById('viewLeaderDate');
  const pdfBtn = document.getElementById('downloadLeaderPdfBtn');

  if (nameEl) nameEl.innerText = 'جاري التحميل...';
  if (emailEl) emailEl.innerText = '...';
  if (roleEl) roleEl.innerText = '...';
  if (dateEl) dateEl.innerText = '...';
  if (pdfBtn) pdfBtn.href = typeof pdfFormUrl !== 'undefined' ? pdfFormUrl : './registration-form.pdf';

  openModal('leaderDetailsModal');

  db.collection('leaders').doc(leaderId).get().then((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    if (nameEl) nameEl.innerText = data.fullName || 'قائد كشفي';
    if (emailEl) emailEl.innerText = data.email || '—';
    if (roleEl) roleEl.innerText = data.leaderRoleTitle || data.role || 'مسؤول إعلام';
    let formattedDate = '—';
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      formattedDate = data.createdAt.toDate().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    if (dateEl) dateEl.innerText = formattedDate;
  }).catch((err) => {
    console.error('openLeaderDetailsModal error:', err);
  });
}

// طباعة بطاقة القائد الكشفي
function printLeaderProfileCard() {
  const rawName = document.getElementById('viewLeaderName') ? document.getElementById('viewLeaderName').innerText : 'القائد';
  const rawEmail = document.getElementById('viewLeaderEmail') ? document.getElementById('viewLeaderEmail').innerText : '—';
  const rawRole = document.getElementById('viewLeaderRole') ? document.getElementById('viewLeaderRole').innerText : '—';
  const rawDate = document.getElementById('viewLeaderDate') ? document.getElementById('viewLeaderDate').innerText : '—';

  // نرمّز القيم قبل كتابتها في نافذة الطباعة (نفس الأصل، فالحقن هنا يعني تنفيذ كود)
  const name = escHtml(rawName), email = escHtml(rawEmail), role = escHtml(rawRole), date = escHtml(rawDate);

  const printWindow = window.open('', '_blank', 'width=700,height=800');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>ملف القائد الكشفي - ${name}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 35px; direction: rtl; text-align: right; background: #fff; color: #1e293b; }
        .print-header { text-align: center; margin-bottom: 25px; border-bottom: 3px solid #003f87; padding-bottom: 15px; }
        .print-header h1 { color: #003f87; margin: 0 0 5px; font-size: 1.55rem; }
        .print-header p { color: #64748b; margin: 0; font-size: 0.95rem; }
        .info-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; background: #f8fafc; margin-top: 20px; }
        .info-row { padding: 12px 14px; margin-bottom: 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 1rem; display: flex; justify-content: space-between; }
        .info-row strong { color: #003f87; }
        .stamp-box { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 20px; }
        .stamp-item { text-align: center; color: #475569; font-weight: bold; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="print-header">
        <h1>الكشافة الإسلامية الجزائرية - محافظة ولاية الجزائر</h1>
        <h2>فوج الوحدة الكشفي (مركب المنار - الحميز)</h2>
        <p>بطاقة اعتماد قائد كشفي رسمي</p>
      </div>
      <div class="info-card">
        <div class="info-row"><span><strong>الاسم واللقب:</strong> ${name}</span></div>
        <div class="info-row"><span><strong>البريد الإلكتروني:</strong> ${email}</span></div>
        <div class="info-row"><span><strong>الصفة / المهام:</strong> ${role}</span></div>
        <div class="info-row"><span><strong>تاريخ الاعتماد:</strong> ${date}</span></div>
        <div class="info-row"><span><strong>الحالة:</strong> حساب معتمد وموثق</span></div>
      </div>
      <div class="stamp-box">
        <div class="stamp-item">توقيع مسؤول الفوج<br><br>_________________</div>
        <div class="stamp-item">ختم الإدارة<br><br>_________________</div>
      </div>
      <script>
        window.onload = function() {
          window.focus();
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/* =========================================================
   إعدادات الحساب (أدمن وقادة): تغيير البريد وكلمة المرور + القفل التلقائي
   كل عمليات الحساب تمر عبر Firebase Authentication مع إعادة مصادقة.
   لا تُخزَّن أي كلمة مرور في أي مكان (لا localStorage ولا متغير دائم).
   ========================================================= */

function refreshSettingsTab() {
  const user = auth.currentUser;
  if (!user) return;
  const roleLabels = { admin: 'أدمن', leader: 'قائد', scout: 'كشاف', parent: 'ولي أمر' };
  const summary = document.getElementById('settingsAccountSummary');
  if (summary) {
    summary.innerHTML = 'الحساب الحالي: <bdi dir="ltr">' + escHtml(user.email || '') + '</bdi> — الدور: ' + (roleLabels[currentUserRole] || '—');
  }
  const select = document.getElementById('idleLockSelect');
  if (select) select.value = String(getIdleLockSeconds());
  if (currentUserRole === 'admin') {
    loadMediaSignupSetting();
    loadGoogleDriveSettingsAdmin();
  }
  ['settingsEmailMsg', 'settingsPasswordMsg', 'gdriveSettingsMsg'].forEach((id) => { const el = document.getElementById(id); if (el) el.innerText = ''; });
}

function mapAccountActionError(error) {
  const friendly = getFriendlyAuthErrorMessage(error);
  if (friendly) return friendly;
  switch (error && error.code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'كلمة المرور الحالية غير صحيحة.';
    case 'auth/email-already-in-use':
      return 'هذا البريد مستخدم في حساب آخر.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صحيحة.';
    case 'auth/weak-password':
      return 'كلمة المرور الجديدة ضعيفة.';
    case 'auth/requires-recent-login':
      return 'يتطلب هذا الإجراء تسجيل دخول حديثاً. سجّل الخروج ثم الدخول وأعد المحاولة.';
    case 'auth/operation-not-allowed':
      return 'تغيير البريد غير مفعّل في إعدادات المشروع (Firebase Console ← Authentication).';
    default:
      return 'حدث خطأ: ' + ((error && error.message) || '') + (error && error.code ? ' (' + error.code + ')' : '');
  }
}

function reauthenticateCurrentUser(password) {
  const user = auth.currentUser;
  if (!user || !user.email) return Promise.reject({ code: 'auth/requires-recent-login' });
  const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
  return user.reauthenticateWithCredential(credential);
}

function changeAccountEmail() {
  const newEmail = document.getElementById('settingsNewEmail').value.trim();
  const passInput = document.getElementById('settingsEmailCurrentPassword');
  const msg = document.getElementById('settingsEmailMsg');
  const btn = document.getElementById('settingsEmailBtn');
  msg.style.color = '';
  msg.innerText = '';

  const user = auth.currentUser;
  if (!user) { msg.innerText = 'يجب تسجيل الدخول أولاً.'; return; }
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { msg.innerText = 'يرجى إدخال بريد إلكتروني صحيح.'; return; }
  if (newEmail.toLowerCase() === (user.email || '').toLowerCase()) { msg.innerText = 'هذا هو بريدك الحالي بالفعل.'; return; }
  if (!passInput.value) { msg.innerText = 'يرجى إدخال كلمة المرور الحالية للتأكيد.'; return; }
  if (typeof user.verifyBeforeUpdateEmail !== 'function') { msg.innerText = 'إصدار Firebase الحالي لا يدعم هذه العملية.'; return; }

  btn.disabled = true;
  reauthenticateCurrentUser(passInput.value)
    .then(() => user.verifyBeforeUpdateEmail(newEmail))
    .then(() => {
      msg.style.color = '#22c55e';
      msg.innerText = 'تم إرسال رابط تأكيد إلى ' + newEmail + '. لن يتغير بريدك فعلياً حتى تضغط الرابط. بعدها سجّل الدخول بالبريد الجديد.';
      document.getElementById('settingsNewEmail').value = '';
    })
    .catch((error) => { msg.innerText = mapAccountActionError(error); })
    .then(() => { passInput.value = ''; btn.disabled = false; });
}

function changeAccountPassword() {
  const currentPw = document.getElementById('settingsCurrentPassword');
  const newPw = document.getElementById('settingsNewPassword');
  const confirmPw = document.getElementById('settingsConfirmPassword');
  const msg = document.getElementById('settingsPasswordMsg');
  const btn = document.getElementById('settingsPasswordBtn');
  msg.style.color = '';
  msg.innerText = '';

  const user = auth.currentUser;
  if (!user) { msg.innerText = 'يجب تسجيل الدخول أولاً.'; return; }
  if (!currentPw.value) { msg.innerText = 'يرجى إدخال كلمة المرور الحالية.'; return; }
  if (newPw.value !== confirmPw.value) { msg.innerText = 'كلمتا المرور الجديدتان غير متطابقتين.'; return; }
  if (newPw.value.length < 8 || !/\d/.test(newPw.value) || !/[!@#$%^&*(),.?":{}|<>]/.test(newPw.value)) {
    msg.innerText = 'كلمة المرور الجديدة يجب أن تحتوي على 8 أحرف على الأقل مع أرقام ورموز.';
    return;
  }
  if (newPw.value === currentPw.value) { msg.innerText = 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.'; return; }

  btn.disabled = true;
  reauthenticateCurrentUser(currentPw.value)
    .then(() => user.updatePassword(newPw.value))
    .then(() => {
      msg.style.color = '#22c55e';
      msg.innerText = 'تم تغيير كلمة المرور بنجاح.';
    })
    .catch((error) => { msg.innerText = mapAccountActionError(error); })
    .then(() => {
      currentPw.value = ''; newPw.value = ''; confirmPw.value = '';
      btn.disabled = false;
    });
}

/* =========================================================
   نظام القفل الأمني للجلسة وحمايتها ضد التحديث (F5) والرجوع للخلف (Back / bfcache)
   - يُحفظ وضع القفل (scoutAdminSessionLocked) ووقت آخر نشاط (scoutAdminLastActivityAt)
     في localStorage و sessionStorage معاً، فلا يمكن لتحديث الصفحة (F5) تجاوز القفل أبداً.
   - عند تفعيل القفل:
     1) تُخفى شاشة الإدارة (#fullAdminBlueScreen) فوراً وتُغلق أي نافذة إدارية مفتوحة.
     2) يُضاف حاجز في سجل المتصفح (history.pushState / popstate) يمنع زر الرجوع للخلف
        من استعادة الشاشة السابقة قبل إدخال كلمة المرور والتحقق منها عبر خادم Firebase.
     3) يُفحص حدث pageshow (لمنع استرجاع نسخة مخزنة في الذاكرة المخبئية bfcache).
   ========================================================= */
const IDLE_LOCK_STORAGE_KEY = 'scoutIdleLockSeconds';
const IDLE_LOCK_STATE_KEY = 'scoutAdminSessionLocked';
const IDLE_LOCK_LAST_TAB_KEY = 'scoutAdminLockedReturnTab';
const IDLE_LAST_ACTIVITY_KEY = 'scoutAdminLastActivityAt';

let idleLocked = false;
let lastActivityAt = Date.now();

function getIdleLockSeconds() {
  const stored = localStorage.getItem(IDLE_LOCK_STORAGE_KEY);
  if (stored !== null) return Number(stored) || 0;
  return currentUserRole === 'admin' ? 900 : 0; // افتراضي: 15 دقيقة للأدمن
}

function isSessionLocked() {
  if (idleLocked) return true;
  try {
    return localStorage.getItem(IDLE_LOCK_STATE_KEY) === '1'
      || sessionStorage.getItem(IDLE_LOCK_STATE_KEY) === '1';
  } catch (_) {
    return idleLocked;
  }
}

function setPersistedSessionLock(locked, returnTab) {
  idleLocked = !!locked;
  try {
    if (locked) {
      localStorage.setItem(IDLE_LOCK_STATE_KEY, '1');
      sessionStorage.setItem(IDLE_LOCK_STATE_KEY, '1');
      if (returnTab && VALID_ADMIN_TABS.includes(returnTab)) {
        localStorage.setItem(IDLE_LOCK_LAST_TAB_KEY, returnTab);
      }
    } else {
      localStorage.removeItem(IDLE_LOCK_STATE_KEY);
      sessionStorage.removeItem(IDLE_LOCK_STATE_KEY);
      localStorage.removeItem(IDLE_LOCK_LAST_TAB_KEY);
    }
  } catch (_) {}
}

function clearPersistedSessionLock() {
  setPersistedSessionLock(false);
  document.body.classList.remove('admin-session-locked');
  const overlay = document.getElementById('idleLockOverlay');
  if (overlay) overlay.style.display = 'none';
}

function recordAdminActivity() {
  if (isSessionLocked()) return;
  lastActivityAt = Date.now();
  try {
    localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, String(lastActivityAt));
  } catch (_) {}
}

function getLastRecordedActivity() {
  try {
    const stored = Number(localStorage.getItem(IDLE_LAST_ACTIVITY_KEY));
    if (stored && stored > 0) return stored;
  } catch (_) {}
  return lastActivityAt;
}

function hasInactivityExpired() {
  const seconds = getIdleLockSeconds();
  if (!seconds || seconds <= 0) return false;
  const last = getLastRecordedActivity();
  return (Date.now() - last) >= seconds * 1000;
}

function saveIdleLockSetting(value) {
  localStorage.setItem(IDLE_LOCK_STORAGE_KEY, String(Number(value) || 0));
  recordAdminActivity();
  showAdminNotification(Number(value) ? 'تم حفظ مدة القفل التلقائي.' : 'تم تعطيل القفل التلقائي.', 'success');
}

// تحديث وقت النشاط بمعدل معتدل (كل ثانيتين كحد أقصى) لتجنب الكتابة المفرطة في localStorage
let lastActivityWriteTs = 0;
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'].forEach((evt) => {
  document.addEventListener(evt, () => {
    if (isSessionLocked()) return;
    const now = Date.now();
    lastActivityAt = now;
    if (now - lastActivityWriteTs > 2000) {
      lastActivityWriteTs = now;
      try { localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, String(now)); } catch (_) {}
    }
  }, { passive: true });
});

// تحييد سجل المتصفح (History Trap) لمنع الرجوع للخلف أثناء القفل
function pushLockedHistoryTrap() {
  try {
    history.replaceState({ adminLocked: true }, '', window.location.pathname + '#locked');
    history.pushState({ adminLocked: true }, '', window.location.pathname + '#locked');
  } catch (_) {}
}

function lockIdleSession(preferredReturnTab) {
  // تحديد التبويب الحالي لحفظه إلى ما بعد فتح القفل بنجاح
  const activeTabEl = document.querySelector('.admin-tab-content.active-tab');
  const currentTabId = preferredReturnTab
    || window.__pendingAdminRoute
    || (activeTabEl && activeTabEl.id)
    || localStorage.getItem(IDLE_LOCK_LAST_TAB_KEY)
    || 'welcome-tab';

  window.__pendingAdminRoute = null;
  setPersistedSessionLock(true, currentTabId);

  // إخفاء لوحة التحكم بالكامل وإغلاق أي نوافذ إدارية مفتوحة لمنع تسرب البيانات في الخلفية
  document.body.classList.add('admin-session-locked');
  setAdminViewActive(false);

  document.querySelectorAll('.modal-overlay').forEach((m) => {
    if (m.id !== 'idleLockOverlay') m.style.display = 'none';
  });

  const pwInput = document.getElementById('idleLockPassword');
  const errEl = document.getElementById('idleLockError');
  const overlay = document.getElementById('idleLockOverlay');

  if (pwInput) {
    pwInput.type = 'password';
    pwInput.value = '';
  }
  if (errEl) errEl.innerText = '';
  if (overlay) overlay.style.display = 'flex';

  pushLockedHistoryTrap();
  setTimeout(() => { if (pwInput) pwInput.focus(); }, 100);
}

// فحص فوري عند إقلاع الصفحة (قبل انتهاء جلب Firebase) لمنع ظهور أي محتوى عند الضغط على F5
function checkAndEnforceLockOnBoot() {
  if (window.__pendingAdminLock || isSessionLocked()) {
    window.__pendingAdminLock = false;
    lockIdleSession();
  }
}

// فحص حالة القفل بعد التحقق من هوية المستخدم في Firebase (عند F5 أو فتح الصفحة)
function verifySessionLockStateForUser(userData) {
  const isPrivileged = userData && (userData.role === 'admin' || userData.role === 'leader');
  if (!isPrivileged) {
    clearPersistedSessionLock();
    return false;
  }

  const wantsAdminRoute = !!window.__pendingAdminRoute || window.location.hash === '#locked';
  if (isSessionLocked() || (wantsAdminRoute && hasInactivityExpired())) {
    lockIdleSession(window.__pendingAdminRoute || localStorage.getItem(IDLE_LOCK_LAST_TAB_KEY) || 'welcome-tab');
    return true;
  }

  recordAdminActivity();
  return false;
}

function unlockIdleSession() {
  const input = document.getElementById('idleLockPassword');
  const errorEl = document.getElementById('idleLockError');
  const btn = document.getElementById('idleLockUnlockBtn');
  if (!input || !input.value) {
    if (errorEl) errorEl.innerText = 'يرجى إدخال كلمة المرور.';
    return;
  }

  // إذا انتهت جلسة Firebase بالكامل أثناء القفل، نوجّه لتسجيل الدخول من جديد
  if (!auth.currentUser) {
    logoutFromIdleLock();
    return;
  }

  const returnTab = localStorage.getItem(IDLE_LOCK_LAST_TAB_KEY) || 'welcome-tab';

  btn.disabled = true;
  errorEl.innerText = '';
  reauthenticateCurrentUser(input.value)
    .then(() => {
      // التحقق مجدداً من صلاحية الحساب في Firestore قبل إعادة فتح اللوحة
      return db.collection('users').doc(auth.currentUser.uid).get();
    })
    .then((doc) => {
      if (!doc.exists || (doc.data().role !== 'admin' && doc.data().role !== 'leader')
          || doc.data().accountStatus === 'suspended' || doc.data().accountStatus === 'locked') {
        throw { code: 'auth/user-disabled', message: 'لم يعد هذا الحساب يملك صلاحية الوصول.' };
      }

      clearPersistedSessionLock();
      recordAdminActivity();

      setAdminViewActive(true);

      const validTab = VALID_ADMIN_TABS.includes(returnTab) ? returnTab : 'welcome-tab';
      const btnElement = document.querySelector(`.admin-nav-btn[onclick*="'${validTab}'"]`);
      switchAdminTab(validTab, btnElement);
      applyAdminPanelUIForRole();
    })
    .catch((error) => {
      errorEl.innerText = mapAccountActionError(error);
      pushLockedHistoryTrap();
    })
    .then(() => {
      input.value = '';
      btn.disabled = false;
    });
}

function logoutFromIdleLock() {
  clearPersistedSessionLock();
  handleUserLogout();
}

// اعتراض زر الرجوع للخلف / التقدم في المتصفح (popstate & hashchange)
window.addEventListener('popstate', () => {
  if (isSessionLocked()) {
    pushLockedHistoryTrap();
    setAdminViewActive(false);
    const overlay = document.getElementById('idleLockOverlay');
    if (overlay) overlay.style.display = 'flex';
    return;
  }

  // إذا لم يكن المستخدم مسجلاً دخوله وحاول الرجوع عبر التاريخ إلى رابط #admin-
  if (!auth.currentUser && (window.location.hash.indexOf('#admin-') === 0 || window.location.hash === '#locked')) {
    closeAllModalsAndOverlays();
    history.replaceState(null, '', window.location.pathname + '#home-page');
    showPage('home-page');
  }
});

window.addEventListener('hashchange', () => {
  if (isSessionLocked() && window.location.hash !== '#locked') {
    pushLockedHistoryTrap();
  }
});

// منع استرجاع نسخة مخبأة من الذاكرة (Back-Forward Cache / bfcache) عند الضغط على زر الرجوع
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    setAdminViewActive(false);
    if (isSessionLocked() || hasInactivityExpired()) {
      lockIdleSession();
    } else if (!auth.currentUser) {
      closeAllModalsAndOverlays();
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (isSessionLocked()) {
    // منع اختصار Escape من إغلاق شاشة القفل
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'idleLockPassword') {
      unlockIdleSession();
    }
  }
}, true);

setInterval(() => {
  if (isSessionLocked()) return;
  const seconds = getIdleLockSeconds();
  if (!seconds || !auth.currentUser) return;
  const panel = document.getElementById('fullAdminBlueScreen');
  if (!panel || panel.style.display !== 'flex') return; // يعمل أثناء فتح لوحة الإدارة/النشر
  if (hasInactivityExpired()) lockIdleSession();
}, 1000);

/* =========================================================
   مساعد التعليمات (علامة ؟) — يُضاف فقط للنوافذ والأقسام المحددة أدناه
   لتعديل نص أي تعليمات: غيّر محتوى HELP_CONTENT فقط.
   ========================================================= */
const HELP_CONTENT = {
  'login-register': {
    title: 'تسجيل الدخول وإنشاء حساب',
    html: '<ul><li><strong>تسجيل الدخول:</strong> أدخل البريد وكلمة المرور ثم اضغط «تسجيل الدخول».</li><li><strong>نسيت كلمة المرور؟</strong> اكتب بريدك في الحقل ثم اضغط الرابط؛ سيصلك بريد لإعادة التعيين إن كان البريد مسجّلاً.</li><li><strong>حساب جديد:</strong> اختر «كشاف» أو «ولي أمر» أو «قائد» لتظهر الاستمارة المناسبة.</li></ul>'
  },
  'register-scout-parent': {
    title: 'إنشاء حساب كشاف / ولي أمر',
    html: '<ul><li>اكتب الاسم واللقب بدون أرقام أو رموز، واختر الوحدة.</li><li>أدخل رقمي الهاتف (10 أرقام لكل منهما) وبريداً صحيحاً تستطيع فتحه.</li><li><strong>كلمة المرور:</strong> 8 أحرف على الأقل مع أرقام ورموز، وأعد كتابتها للتأكيد.</li><li>الصورة الشخصية اختيارية؛ إن تعذّر رفعها يُنشأ الحساب بدونها.</li><li>إن ظهرت رسالة «البريد مسجّل بالفعل» فاستعمل «تسجيل الدخول» أو «نسيت كلمة المرور».</li></ul>'
  },
  'register-leader': {
    title: 'طلب حساب قائد',
    html: '<ul><li>يُنشأ الحساب بحالة «قيد المراجعة» ولا يحصل على صلاحيات حتى يوافق الأدمن.</li><li>أدخل اسمك وبريداً صحيحاً وكلمة مرور قوية (8 أحرف مع أرقام ورموز).</li><li>بعد الموافقة يحدد الأدمن صلاحياتك بنفسه.</li></ul>'
  },
  'leader-portal': {
    title: 'بوابة الإعلام والنشر (القادة)',
    html: '<ul><li>تدخل بالبريد وكلمة المرور الخاصة بحسابك.</li><li>ترى فقط الأقسام التي منحك الأدمن صلاحيتها (إعلانات، معرض...).</li><li>صلاحياتك أقل من صلاحيات الأدمن، ولا يمكنك إدارة الحسابات.</li><li>من «إعدادات الحساب» تغيّر بريدك وكلمة مرورك.</li><li>إن نسيت بياناتك اضغط «هل نسيت الرمز؟» لإرسال طلب للأدمن.</li></ul>'
  },
  'admin-login': {
    title: 'دخول الأدمن',
    html: '<ul><li>الدخول بحساب Firebase الحقيقي الذي دوره «admin» فقط.</li><li>إن ظهر «محاولات كثيرة» فهي حماية مؤقتة من Firebase؛ انتظر قليلاً أو استعمل «نسيت كلمة المرور».</li></ul>'
  },
  'announcement-form': {
    title: 'إنشاء إعلان',
    html: '<ul><li>اكتب العنوان والمحتوى (إلزاميان).</li><li><strong>الصورة (اختيارية):</strong> يمكنك الضغط على مربع الرفع لاختيار صورة من جهازك (تُضغط وتُرفع تلقائياً إلى Google Drive)، أو لصق رابط مشاركة من Google Drive مباشرةً.</li><li><strong>الجدولة:</strong> حدد وقت البداية والانتهاء بتوقيت الجزائر، أو اتركهما فارغين للنشر الفوري بلا انتهاء.</li><li><strong>مسودة:</strong> فعّل الخيار ليُحفظ الإعلان دون ظهوره للزوار.</li><li>بعد انتهاء المدة يختفي الإعلان من الصفحة العامة ويبقى محفوظاً هنا بحالة «منتهي».</li></ul>'
  },
  'gallery-form': {
    title: 'إضافة عنصر للمعرض الرقمي',
    html: '<ul><li>اختر التصنيف واكتب عنواناً (إلزامي) ووصفاً (اختياري).</li><li><strong>رفع الصورة إلى Google Drive:</strong> اضغط على مربع اختيار الصورة أو اسحبها إليه ليتم ضغطها ورفعها تلقائياً إلى مجلد المعرض في Google Drive.</li><li><strong>أو عبر رابط:</strong> يمكنك أيضاً لصق رابط مشاركة صورة من Google Drive أو كتابة اسم ملف محلي موجود على استضافة الموقع (cPanel).</li><li>عند حذف العنصر من المعرض، تُنقل صورته تلقائياً إلى سلة مهملات Google Drive (إن كان الخيار مفعّلاً في إعدادات الأدمن).</li></ul>'
  },
  'create-leader': {
    title: 'إنشاء حساب قائد (من الأدمن)',
    html: '<ul><li>أدخل الاسم والبريد وكلمة مرور قوية، واختر الصلاحيات التي يحتاجها فقط.</li><li>لا تُمنح أي صلاحية تلقائياً.</li><li>سلّم القائد كلمة المرور بطريقة آمنة؛ لا تُخزَّن ولا يمكن عرضها لاحقاً.</li></ul>'
  },
  'recovery': {
    title: 'طلب استعادة الوصول',
    html: '<ul><li>اكتب بريدك ووصف مشكلتك (نسيت البيانات، لا أستطيع الدخول...).</li><li>يُحفظ الطلب ويراه الأدمن في «الحسابات المشبوهة ← طلبات الدعم الأمني».</li><li>لا يصلك بريد تلقائي؛ سيتواصل معك الأدمن.</li></ul>'
  },
  'account-settings': {
    title: 'إعدادات الحساب و Google Drive',
    html: '<ul><li><strong>إعدادات Google Drive (للأدمن):</strong> اربط حسابك على Google Drive بوضع رابط تطبيق الويب (Web App URL) ومجلدات الحفظ، ثم اضغط «اختبار الاتصال». يمكنك عرض ونسخ كود الربط مباشرةً من الزر المخصص.</li><li><strong>تغيير البريد:</strong> يُطلب منك كلمة المرور الحالية، ثم يصل رابط تأكيد للبريد الجديد؛ لا يتغير قبل الضغط عليه.</li><li><strong>تغيير كلمة المرور:</strong> أدخل الحالية ثم الجديدة مرتين (8 أحرف مع أرقام ورموز).</li><li><strong>القفل التلقائي:</strong> اختر المدة؛ بعد عدم النشاط تُطلب كلمة المرور من جديد.</li></ul>'
  }
};

// أي نافذة تحصل على زر ؟ ولأي مفتاح تعليمات
const HELP_MODAL_MAP = {
  roleSelectionModal: 'login-register',
  scoutParentRegisterModal: 'register-scout-parent',
  leaderRegisterModal: 'register-leader',
  mediaPortalModal: 'leader-portal',
  adminLoginModal: 'admin-login',
  adminAnnouncementModal: 'announcement-form',
  adminAddLeaderModal: 'create-leader',
  accessRecoveryModal: 'recovery'
};

// أقسام لوحة الإدارة (عنوان القسم) التي تحصل على زر ؟
const HELP_TAB_MAP = {
  'announcements-tab': 'announcement-form',
  'gallery-tab': 'gallery-form',
  'settings-tab': 'account-settings'
};

function createHelpButton(key) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'help-btn';
  btn.setAttribute('aria-label', 'مساعدة');
  btn.title = 'مساعدة';
  btn.innerText = '؟';
  btn.addEventListener('click', (e) => { e.stopPropagation(); openHelp(key); });
  return btn;
}

function initHelpButtons() {
  Object.keys(HELP_MODAL_MAP).forEach((modalId) => {
    const box = document.querySelector('#' + modalId + ' .scout-card-container');
    if (box && !box.querySelector('.help-btn')) {
      const btn = createHelpButton(HELP_MODAL_MAP[modalId]);
      btn.classList.add('help-btn-floating');
      box.appendChild(btn);
    }
  });
  Object.keys(HELP_TAB_MAP).forEach((tabId) => {
    const heading = document.querySelector('#' + tabId + ' .admin-section-card > h2');
    if (heading && !heading.querySelector('.help-btn')) heading.appendChild(createHelpButton(HELP_TAB_MAP[tabId]));
  });
}

function openHelp(key) {
  const item = HELP_CONTENT[key];
  if (!item) return;
  document.getElementById('helpModalTitle').innerHTML = '<i class="fa-solid fa-circle-question"></i> ' + item.title;
  document.getElementById('helpModalBody').innerHTML = item.html;
  document.getElementById('helpModal').style.display = 'flex';
}

function closeHelp() {
  document.getElementById('helpModal').style.display = 'none';
}

/* =========================================================
   قفل تمرير الصفحة الخلفية عند فتح القوائم الجانبية على الهاتف
   - يُراقَب صنف .active (قائمة الموقع) و .mobile-open (شريط الأدمن) تلقائياً،
     فيعمل القفل مع كل طرق الفتح والإغلاق (زر، ×، Escape، الضغط خارجها، تغيير الصفحة).
   - يُحفظ موضع التمرير ويُستعاد عند الإغلاق دون قفزة.
   ========================================================= */
let menuScrollLocked = false;
let menuScrollY = 0;

function syncMenuScrollLock() {
  const navMenu = document.getElementById('navMenu');
  const sidebar = document.getElementById('adminSidebar');
  const shouldLock = (navMenu && navMenu.classList.contains('active'))
    || (sidebar && sidebar.classList.contains('mobile-open'));

  if (shouldLock && !menuScrollLocked) {
    menuScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = (-menuScrollY) + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.classList.add('menu-scroll-locked');
    menuScrollLocked = true;
  } else if (!shouldLock && menuScrollLocked) {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.classList.remove('menu-scroll-locked');
    menuScrollLocked = false;
    // عند الانتقال إلى صفحة أخرى من القائمة نعود للأعلى، وإلا نستعيد الموضع السابق
    window.scrollTo(0, window.__forceScrollTop ? 0 : menuScrollY);
    window.__forceScrollTop = false;
  }
}

(function initMenuScrollLock() {
  const observer = new MutationObserver(syncMenuScrollLock);
  ['navMenu', 'adminSidebar'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  // الضغط خارج قائمة الموقع يغلقها
  document.addEventListener('click', (e) => {
    const navMenu = document.getElementById('navMenu');
    if (!navMenu || !navMenu.classList.contains('active')) return;
    if (navMenu.contains(e.target) || (e.target.closest && e.target.closest('.mobile-menu-btn, .sidebar-toggle'))) return;
    navMenu.classList.remove('active');
  });

  // عند التكبير إلى شاشة حاسوب لا نترك الصفحة مقفلة
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      const navMenu = document.getElementById('navMenu');
      const sidebar = document.getElementById('adminSidebar');
      if (navMenu) navMenu.classList.remove('active');
      if (sidebar) sidebar.classList.remove('mobile-open');
      const overlay = document.getElementById('adminSidebarOverlay');
      if (overlay) overlay.classList.remove('active');
    }
  });
})();


/* =========================================================
   فحص فوري لرابط Google Drive أو اسم ملف الصورة في نماذج الإدارة
   يُظهر ✔ إن كانت الصورة صالحة ومتاحة للعرض، أو تحذيراً واضحاً.
   ========================================================= */
function attachImageFileChecker(inputId, kind) {
  const input = document.getElementById(inputId);
  if (!input) return;

  // قائمة الاقتراحات
  const listId = inputId + 'List';
  const library = (LOCAL_IMAGE_LIBRARY && LOCAL_IMAGE_LIBRARY[kind]) || [];
  if (library.length) {
    const dl = document.createElement('datalist');
    dl.id = listId;
    library.forEach((name) => { const o = document.createElement('option'); o.value = name; dl.appendChild(o); });
    input.parentNode.appendChild(dl);
    input.setAttribute('list', listId);
  }

  // سطر النتيجة تحت الحقل
  const status = document.createElement('p');
  status.className = 'image-check-msg';
  const anchor = input.closest('.input-box') || input;
  anchor.insertAdjacentElement('afterend', status);

  let timer = null;
  const check = () => {
    const raw = input.value.trim();
    status.className = 'image-check-msg';
    status.innerText = '';
    if (!raw) return;

    const resolved = resolveImageInputSource(raw, kind);
    if (resolved.type === 'invalid') {
      status.classList.add('is-bad');
      status.innerText = '✖ صيغة غير صالحة. الصق رابط مشاركة Google Drive أو اكتب اسم ملف محلي مع امتداده (jpg/png/webp/gif).';
      return;
    }

    if (resolved.type === 'gdrive') {
      const probe = new Image();
      probe.onload = () => {
        status.classList.add('is-ok');
        status.innerText = '✔ صورة Google Drive متاحة وجاهزة للعرض (معرّف: ' + resolved.driveFileId + ')';
      };
      probe.onerror = () => {
        // تجربة الرابط البديل من Google CDN
        const fallbackProbe = new Image();
        fallbackProbe.onload = () => {
          status.classList.add('is-ok');
          status.innerText = '✔ صورة Google Drive متاحة وجاهزة للعرض (معرّف: ' + resolved.driveFileId + ')';
        };
        fallbackProbe.onerror = () => {
          status.classList.add('is-bad');
          status.innerText = '⚠ تعذّر الوصول إلى صورة Google Drive (معرّف: ' + resolved.driveFileId + ') — تأكد أن مشاركة الملف مضبوطة على «أي شخص لديه الرابط» (Anyone with the link).';
        };
        fallbackProbe.src = buildGoogleDriveFallbackUrl(resolved.driveFileId, 800);
      };
      probe.src = resolved.path;
      return;
    }

    if (resolved.type === 'url') {
      const probe = new Image();
      probe.onload = () => { status.classList.add('is-ok'); status.innerText = '✔ الرابط الخارجي للصورة يعمل بنجاح.'; };
      probe.onerror = () => { status.classList.add('is-bad'); status.innerText = '⚠ تعذّر تحميل الصورة من هذا الرابط الخارجي.'; };
      probe.src = resolved.path;
      return;
    }

    const path = resolved.path;
    const probe = new Image();
    probe.onload = () => { status.classList.add('is-ok'); status.innerText = '✔ الصورة المحلية موجودة: ' + path; };
    probe.onerror = () => { status.classList.add('is-bad'); status.innerText = '⚠ الملف غير موجود على الموقع المنشور في: ' + path + ' — تأكد من رفعه إلى الاستضافة (cPanel) أو استخدم الرفع المباشر إلى Google Drive أعلاه.'; };
    probe.src = path + '?v=' + Date.now();
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(check, 400); });
  input.addEventListener('change', check);
}


/* =========================================================
   التسجيل الذاتي لمسؤولي الإعلام/القادة — يتحكم به الأدمن من الإعدادات
   الإعداد محفوظ في Firestore: settings/registration { allowMediaOfficerSignup: true|false }
   الحماية الحقيقية: قواعد Firestore ترفض إنشاء مستند مستخدم بدور leader عندما يكون مغلقاً
   (راجع mediaSignupOpen() في firestore.rules). فحص الواجهة هنا للتجربة فقط.
   ========================================================= */
let currentLeaderSignupType = 'leader_request';

function isMediaSignupOpen() {
  return db.collection('settings').doc('registration').get()
    .then((doc) => doc.exists && doc.data().allowMediaOfficerSignup === true)
    .catch(() => false); // أي فشل = نعتبره مغلقاً (الأكثر أماناً)
}

function showRegistrationClosed() {
  openModal('registrationClosedModal');
}

function openLeaderRegistration(signupType) {
  isMediaSignupOpen().then((open) => {
    if (!open) { showRegistrationClosed(); return; }
    currentLeaderSignupType = signupType;
    const heading = document.getElementById('leaderRegModalHeading');
    if (heading) heading.innerText = signupType === 'media_officer' ? 'طلب إنشاء حساب مسؤول إعلام' : 'طلب إنشاء حساب قائد';
    openModal('leaderRegisterModal');
  });
}

function openMediaOfficerSignup() {
  closeModal('mediaPortalModal');
  openLeaderRegistration('media_officer');
}

// الأدمن: تحميل وحفظ إعداد فتح/إغلاق التسجيل
function loadMediaSignupSetting() {
  const toggle = document.getElementById('allowMediaSignupToggle');
  const label = document.getElementById('allowMediaSignupLabel');
  if (!toggle) return;
  isMediaSignupOpen().then((open) => {
    toggle.checked = open;
    label.innerText = open ? 'التسجيل مفتوح' : 'التسجيل مغلق';
  });
}

function saveMediaSignupSetting(checked) {
  const toggle = document.getElementById('allowMediaSignupToggle');
  const label = document.getElementById('allowMediaSignupLabel');
  const msg = document.getElementById('mediaSignupMsg');
  msg.style.color = '';
  msg.innerText = '';
  toggle.disabled = true;

  db.collection('settings').doc('registration').set({
    allowMediaOfficerSignup: !!checked,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: auth.currentUser ? auth.currentUser.uid : null
  }, { merge: true }).then(() => {
    label.innerText = checked ? 'التسجيل مفتوح' : 'التسجيل مغلق';
    msg.style.color = '#22c55e';
    msg.innerText = checked ? 'تم فتح التسجيل.' : 'تم إغلاق التسجيل.';
  }).catch((error) => {
    toggle.checked = !checked; // تراجع عن الواجهة إن رفض Firestore
    msg.innerText = 'تعذّر حفظ الإعداد: ' + error.message;
  }).then(() => { toggle.disabled = false; });
}

/* =========================================================
   منتقي تاريخ ووقت حديث (flatpickr) لحقول موعد النشر/الانتهاء
   - القيمة المحفوظة تبقى نفس الصيغة السابقة (YYYY-MM-DDTHH:mm بتوقيت الجزائر)
     فلا يتغير منطق الجدولة ولا توافق البيانات القديمة.
   - إن لم تُحمَّل المكتبة (انقطاع CDN) يبقى حقل datetime-local الأصلي يعمل.
   ========================================================= */
function initDateTimePickers() {
  if (typeof flatpickr === 'undefined') return;
  const locale = (flatpickr.l10ns && flatpickr.l10ns.ar) ? flatpickr.l10ns.ar : 'default';
  ['announcementStartAtInput', 'announcementEndAtInput'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el._flatpickr) return;
    flatpickr(el, {
      enableTime: true,
      time_24hr: true,
      minuteIncrement: 1,
      dateFormat: 'Y-m-d\\TH:i',
      altInput: true,
      altFormat: 'l j F Y — H:i',
      altInputClass: 'flatpickr-alt-input',
      locale: locale,
      disableMobile: true,
      allowInput: false,
      onReady: (selected, str, instance) => {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'flatpickr-clear-btn';
        clearBtn.innerText = 'مسح الموعد';
        clearBtn.addEventListener('click', () => { instance.clear(); instance.close(); });
        instance.calendarContainer.appendChild(clearBtn);
      }
    });
  });
}

function setPickerValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el._flatpickr) {
    if (value) el._flatpickr.setDate(value, false); else el._flatpickr.clear(false);
  } else {
    el.value = value || '';
  }
}

/* =========================================================
   إدارة التخزين السحابي الرئيسي (Google Drive) من لوحة الأدمن
   - الإعدادات محفوظة في Firestore: settings/googleDrive
   - تدعم:
     1) الرفع المباشر للصور (بعد ضغطها تلقائياً عبر Canvas) إلى مجلدات Google Drive
     2) اختبار الاتصال وتوليد المجلدات تلقائياً من لوحة الأدمن
     3) الحذف التلقائي للصورة من Google Drive عند حذف الإعلان أو عنصر المعرض
   ========================================================= */
const GDRIVE_LOCAL_CACHE_KEY = 'scout_gdrive_config_v1';
let googleDriveConfigCache = null;
let selectedDriveFiles = {
  announcements: null,
  gallery: []
};

function getCachedGoogleDriveConfig() {
  if (googleDriveConfigCache) return googleDriveConfigCache;
  try {
    const raw = localStorage.getItem(GDRIVE_LOCAL_CACHE_KEY);
    if (raw) {
      googleDriveConfigCache = Object.assign({}, GOOGLE_DRIVE_DEFAULT_CONFIG, JSON.parse(raw));
      delete googleDriveConfigCache.secretToken;
      return googleDriveConfigCache;
    }
  } catch (_) {}
  return Object.assign({}, GOOGLE_DRIVE_DEFAULT_CONFIG);
}

function setCachedGoogleDriveConfig(cfg) {
  googleDriveConfigCache = Object.assign({}, GOOGLE_DRIVE_DEFAULT_CONFIG, cfg || {});
  delete googleDriveConfigCache.secretToken; // لا نحتفظ بأي رمز سري في المتصفح (حتى لو بقي قديماً في Firestore)
  try {
    localStorage.setItem(GDRIVE_LOCAL_CACHE_KEY, JSON.stringify(googleDriveConfigCache));
  } catch (_) {}
  updateGoogleDriveStatusBadge(googleDriveConfigCache);
  updateGoogleDriveDirectLinks(googleDriveConfigCache);
}

function ensureGoogleDriveConfigLoaded() {
  if (!auth.currentUser) return Promise.resolve(getCachedGoogleDriveConfig());
  return db.collection('settings').doc('googleDrive').get()
    .then((doc) => {
      if (doc.exists) {
        setCachedGoogleDriveConfig(doc.data());
      } else {
        updateGoogleDriveStatusBadge(getCachedGoogleDriveConfig());
      }
      return getCachedGoogleDriveConfig();
    })
    .catch(() => getCachedGoogleDriveConfig());
}

function updateGoogleDriveStatusBadge(cfg) {
  const badge = document.getElementById('gdriveConfigStatusBadge');
  if (!badge) return;
  const hasWebApp = !!(cfg && typeof cfg.webAppUrl === 'string' && cfg.webAppUrl.trim().indexOf('https://script.google.com/') === 0);

  if (hasWebApp) {
    badge.className = 'status-badge status-verified';
    badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> جاهز للرفع المباشر إلى Google Drive';
  } else {
    badge.className = 'status-badge status-pending';
    badge.innerHTML = '<i class="fa-solid fa-link"></i> وضع الروابط السريعة (أضف رابط Web App لتفعيل الرفع المباشر)';
  }
}

function updateGoogleDriveDirectLinks(cfg) {
  const rootFolderId = cfg && (cfg.rootFolderId || cfg.rootFolderRaw) ? (cfg.rootFolderId || extractGoogleDriveFolderId(cfg.rootFolderRaw)) : '';
  const galFolderId = cfg && (cfg.galleryFolderId || cfg.galleryFolderRaw) ? (cfg.galleryFolderId || extractGoogleDriveFolderId(cfg.galleryFolderRaw)) : rootFolderId;
  const annFolderId = cfg && (cfg.announcementsFolderId || cfg.announcementsFolderRaw) ? (cfg.announcementsFolderId || extractGoogleDriveFolderId(cfg.announcementsFolderRaw)) : rootFolderId;

  const rootUrl = rootFolderId ? `https://drive.google.com/drive/folders/${rootFolderId}` : 'https://drive.google.com/';
  const galUrl = galFolderId ? `https://drive.google.com/drive/folders/${galFolderId}` : rootUrl;
  const annUrl = annFolderId ? `https://drive.google.com/drive/folders/${annFolderId}` : rootUrl;

  const settingsBtn = document.getElementById('settingsOpenDriveBtn');
  const galleryLink = document.getElementById('galleryOpenDriveLink');
  const annLink = document.getElementById('announcementOpenDriveLink');

  if (settingsBtn) settingsBtn.href = rootUrl;
  if (galleryLink) galleryLink.href = galUrl;
  if (annLink) annLink.href = annUrl;
}

function loadGoogleDriveSettingsAdmin() {
  const webAppInput = document.getElementById('gdriveWebAppUrlInput');
  if (!webAppInput) return;

  ensureGoogleDriveConfigLoaded().then((cfg) => {
    webAppInput.value = cfg.webAppUrl || '';
    const rootInput = document.getElementById('gdriveRootFolderInput');
    const annInput = document.getElementById('gdriveAnnouncementsFolderInput');
    const galInput = document.getElementById('gdriveGalleryFolderInput');
    const autoDelToggle = document.getElementById('gdriveAutoDeleteToggle');

    if (rootInput) rootInput.value = cfg.rootFolderRaw || cfg.rootFolderId || '';
    if (annInput) annInput.value = cfg.announcementsFolderRaw || cfg.announcementsFolderId || '';
    if (galInput) galInput.value = cfg.galleryFolderRaw || cfg.galleryFolderId || '';
    if (autoDelToggle) autoDelToggle.checked = cfg.autoDeleteFromDrive !== false;
    updateGoogleDriveStatusBadge(cfg);
    updateGoogleDriveDirectLinks(cfg);
  });
}

function readGoogleDriveFormInputs() {
  const webAppUrl = (document.getElementById('gdriveWebAppUrlInput')?.value || '').trim();
  const rootFolderRaw = (document.getElementById('gdriveRootFolderInput')?.value || '').trim();
  const announcementsFolderRaw = (document.getElementById('gdriveAnnouncementsFolderInput')?.value || '').trim();
  const galleryFolderRaw = (document.getElementById('gdriveGalleryFolderInput')?.value || '').trim();
  const autoDeleteFromDrive = document.getElementById('gdriveAutoDeleteToggle')
    ? document.getElementById('gdriveAutoDeleteToggle').checked
    : true;

  return {
    webAppUrl: webAppUrl,
    rootFolderRaw: rootFolderRaw,
    rootFolderId: extractGoogleDriveFolderId(rootFolderRaw),
    announcementsFolderRaw: announcementsFolderRaw,
    announcementsFolderId: extractGoogleDriveFolderId(announcementsFolderRaw),
    galleryFolderRaw: galleryFolderRaw,
    galleryFolderId: extractGoogleDriveFolderId(galleryFolderRaw),
    autoDeleteFromDrive: autoDeleteFromDrive
  };
}

function saveGoogleDriveSettings() {
  const msg = document.getElementById('gdriveSettingsMsg');
  const btn = document.getElementById('gdriveSaveBtn');
  if (!msg || !btn) return;

  msg.style.color = '';
  msg.innerText = '';

  const formCfg = readGoogleDriveFormInputs();

  if (formCfg.webAppUrl && formCfg.webAppUrl.indexOf('https://script.google.com/macros/s/') !== 0) {
    msg.innerText = '✖ رابط Web App غير صالح. يجب أن يبدأ بـ https://script.google.com/macros/s/ وينتهي بـ /exec';
    return;
  }
  if (formCfg.rootFolderRaw && !formCfg.rootFolderId) {
    msg.innerText = '✖ رابط أو معرّف المجلد الرئيسي غير صالح.';
    return;
  }
  if (formCfg.announcementsFolderRaw && !formCfg.announcementsFolderId) {
    msg.innerText = '✖ رابط أو معرّف مجلد الإعلانات غير صالح.';
    return;
  }
  if (formCfg.galleryFolderRaw && !formCfg.galleryFolderId) {
    msg.innerText = '✖ رابط أو معرّف مجلد المعرض غير صالح.';
    return;
  }

  btn.disabled = true;
  const payload = Object.assign({}, formCfg, {
    secretToken: firebase.firestore.FieldValue.delete(), // يمسح أي رمز قديم محفوظ (القواعد تمنع تخزينه)
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: auth.currentUser ? auth.currentUser.uid : null
  });

  db.collection('settings').doc('googleDrive').set(payload, { merge: true })
    .then(() => {
      setCachedGoogleDriveConfig(formCfg);
      msg.style.color = '#22c55e';
      msg.innerText = '✔ تم حفظ إعدادات Google Drive بنجاح!';
      showAdminNotification('تم حفظ إعدادات Google Drive بنجاح!', 'success');
    })
    .catch((error) => {
      msg.style.color = '';
      msg.innerText = 'تعذّر حفظ الإعدادات: ' + error.message;
    })
    .then(() => { btn.disabled = false; });
}

function testGoogleDriveConnection() {
  const msg = document.getElementById('gdriveSettingsMsg');
  const testBtn = document.getElementById('gdriveTestBtn');
  if (!msg || !testBtn) return;

  const formCfg = readGoogleDriveFormInputs();
  if (!formCfg.webAppUrl || formCfg.webAppUrl.indexOf('https://script.google.com/macros/s/') !== 0) {
    msg.style.color = '';
    msg.innerText = '✖ يرجى إدخال رابط Google Apps Script Web App الصحيح أولاً (ينتهي بـ /exec). اضغط «كود الربط وطريقة الإعداد» لمعرفة الطريقة.';
    return;
  }

  testBtn.disabled = true;
  msg.style.color = '#fbbf24';
  msg.innerText = '⏳ جاري الاتصال بـ Google Drive والتحقق من المجلدات...';

  (auth.currentUser ? auth.currentUser.getIdToken() : Promise.reject(new Error('سجّل الدخول كأدمن أولاً.')))
    .then((idToken) => fetch(formCfg.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'ping',
        idToken: idToken,
        rootFolderId: formCfg.rootFolderId,
        announcementsFolderId: formCfg.announcementsFolderId,
        galleryFolderId: formCfg.galleryFolderId
      })
    }))
    .then((res) => res.text().then((txt) => {
      try { return JSON.parse(txt); } catch (_) {
        throw new Error('استجابة غير متوقعة من السكربت (ليست JSON). تأكد من النشر بصلاحية «أي شخص» وأنك نشرت أحدث إصدار.');
      }
    }))
    .then((result) => {
      if (!result || !result.ok) {
        throw new Error((result && result.error) || 'فشل الاتصال بالسكربت.');
      }
      // تعبئة معرّفات المجلدات التي أنشأها أو تحقق منها السكربت تلقائياً
      const rootInput = document.getElementById('gdriveRootFolderInput');
      const annInput = document.getElementById('gdriveAnnouncementsFolderInput');
      const galInput = document.getElementById('gdriveGalleryFolderInput');
      if (rootInput && !rootInput.value.trim() && result.rootFolderId) rootInput.value = result.rootFolderId;
      if (annInput && !annInput.value.trim() && result.announcementsFolderId) annInput.value = result.announcementsFolderId;
      if (galInput && !galInput.value.trim() && result.galleryFolderId) galInput.value = result.galleryFolderId;

      msg.style.color = '#22c55e';
      msg.innerText = '✔ متصل بنجاح! المجلد الرئيسي في Google Drive: «' + (result.rootFolderName || 'Scout_ElWihda_Media') + '». جاري حفظ الإعدادات...';
      saveGoogleDriveSettings();
    })
    .catch((err) => {
      msg.style.color = '';
      msg.innerText = '✖ تعذّر الاتصال بـ Google Drive: ' + (err && err.message ? err.message : String(err)) + ' — تأكد من نشر السكربت بصلاحية «أي شخص (Anyone)».';
    })
    .then(() => { testBtn.disabled = false; });
}

// اختيار وسحب وإفلات ملفات الصور للرفع المباشر إلى Google Drive
function triggerDriveFileInput(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.click();
}

function handleDriveFileSelect(kind, inputEl) {
  if (!inputEl || !inputEl.files || inputEl.files.length === 0) return;
  if (kind === 'gallery') {
    addSelectedGalleryFiles(Array.from(inputEl.files));
    inputEl.value = '';
  } else {
    setSelectedDriveFile(kind, inputEl.files[0]);
  }
}

function addSelectedGalleryFiles(files) {
  if (!Array.isArray(selectedDriveFiles.gallery)) {
    selectedDriveFiles.gallery = [];
  }
  const errorEl = document.getElementById('galleryUploadError');
  if (errorEl) errorEl.innerText = '';

  const isEditing = !!pendingEditGalleryId;
  if (isEditing) {
    const firstValid = files.find((f) => f.type && /^image\/(jpeg|jpg|png|webp|gif)$/i.test(f.type));
    if (!firstValid) {
      if (errorEl) errorEl.innerText = 'يرجى اختيار ملف صورة صالح (JPG أو PNG أو WEBP أو GIF).';
      return;
    }
    if (firstValid.size > 25 * 1024 * 1024) {
      if (errorEl) errorEl.innerText = 'حجم الصورة كبير جداً (الأقصى 25 ميغابايت).';
      return;
    }
    selectedDriveFiles.gallery = [firstValid];
  } else {
    let invalidCount = 0;
    let oversizeCount = 0;
    files.forEach((f) => {
      if (!f.type || !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(f.type)) {
        invalidCount++;
        return;
      }
      if (f.size > 25 * 1024 * 1024) {
        oversizeCount++;
        return;
      }
      const duplicate = selectedDriveFiles.gallery.some(
        (existing) => existing.name === f.name && existing.size === f.size && existing.lastModified === f.lastModified
      );
      if (!duplicate) {
        selectedDriveFiles.gallery.push(f);
      }
    });

    if (invalidCount > 0 && errorEl) {
      errorEl.innerText = 'تم تجاهل ' + invalidCount + ' ملف(ات) غير صالحة. يُقبل فقط JPG, PNG, WEBP, GIF.';
    } else if (oversizeCount > 0 && errorEl) {
      errorEl.innerText = 'تم تجاهل ' + oversizeCount + ' ملف(ات) يتجاوز حجمها 25 ميغابايت.';
    }
  }

  renderGalleryPreviews();
}

function removeSelectedGalleryFile(index) {
  if (Array.isArray(selectedDriveFiles.gallery) && index >= 0 && index < selectedDriveFiles.gallery.length) {
    selectedDriveFiles.gallery.splice(index, 1);
    renderGalleryPreviews();
  }
}

function renderGalleryPreviews() {
  const promptEl = document.getElementById('galleryUploadPrompt');
  const previewWrap = document.getElementById('galleryUploadPreviewWrap');
  const grid = document.getElementById('galleryMultiPreviewGrid');
  const countText = document.getElementById('galleryUploadCountText');
  const submitText = document.getElementById('galleryUploadSubmitText');
  const isEditing = !!pendingEditGalleryId;

  const files = Array.isArray(selectedDriveFiles.gallery) ? selectedDriveFiles.gallery : [];
  const count = files.length;

  if (count === 0) {
    if (promptEl) promptEl.style.display = 'flex';
    if (previewWrap) previewWrap.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (submitText) submitText.innerText = isEditing ? 'حفظ التعديلات' : 'حفظ العنصر';
    return;
  }

  if (promptEl) promptEl.style.display = 'none';
  if (previewWrap) previewWrap.style.display = 'flex';

  if (countText) {
    countText.innerText = count === 1 ? 'صورة واحدة مختارة' : (count + ' صور مختارة للرفع');
  }

  if (submitText) {
    if (isEditing) {
      submitText.innerText = 'حفظ التعديلات';
    } else if (count > 1) {
      submitText.innerText = 'حفظ ' + count + ' صور في المعرض';
    } else {
      submitText.innerText = 'حفظ الصورة في المعرض';
    }
  }

  if (grid) {
    grid.innerHTML = '';
    files.forEach((file, idx) => {
      const card = document.createElement('div');
      card.className = 'gdrive-multi-thumb-card hover-lift';
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      const sizeLabel = sizeKb > 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB';

      const img = document.createElement('img');
      img.className = 'gdrive-multi-thumb-img';
      img.alt = file.name;
      const url = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'gdrive-thumb-remove-btn hover-lift';
      removeBtn.title = 'إزالة هذه الصورة';
      removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeSelectedGalleryFile(idx);
      };

      const info = document.createElement('div');
      info.className = 'gdrive-multi-thumb-info';
      info.dir = 'ltr';
      info.innerText = sizeLabel;

      card.appendChild(img);
      card.appendChild(removeBtn);
      card.appendChild(info);
      grid.appendChild(card);
    });
  }
}

function setSelectedDriveFile(kind, file) {
  if (kind === 'gallery') {
    addSelectedGalleryFiles([file]);
    return;
  }

  const prefix = 'announcement';
  const errorEl = document.getElementById('announcementError');

  if (!file.type || !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
    if (errorEl) errorEl.innerText = 'يرجى اختيار ملف صورة صالح (JPG أو PNG أو WEBP أو GIF).';
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    if (errorEl) errorEl.innerText = 'حجم الصورة كبير جداً (الأقصى 25 ميغابايت قبل الضغط التلقائي).';
    return;
  }
  if (errorEl) errorEl.innerText = '';

  selectedDriveFiles.announcements = file;

  const promptEl = document.getElementById(prefix + 'UploadPrompt');
  const previewWrap = document.getElementById(prefix + 'UploadPreviewWrap');
  const previewImg = document.getElementById(prefix + 'UploadPreviewImg');
  const previewName = document.getElementById(prefix + 'UploadPreviewName');

  if (promptEl) promptEl.style.display = 'none';
  if (previewWrap) previewWrap.style.display = 'flex';
  if (previewName) {
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    previewName.innerText = file.name + ' (' + (sizeKb > 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB') + ' — سيُضغط تلقائياً قبل الرفع)';
  }
  if (previewImg) {
    const url = URL.createObjectURL(file);
    previewImg.onload = () => URL.revokeObjectURL(url);
    previewImg.src = url;
  }
}

function clearSelectedDriveFile(kind) {
  if (kind === 'gallery') {
    selectedDriveFiles.gallery = [];
    const fileInput = document.getElementById('galleryFileUploadInput');
    if (fileInput) fileInput.value = '';
    renderGalleryPreviews();
  } else {
    selectedDriveFiles.announcements = null;
    const fileInput = document.getElementById('announcementFileUploadInput');
    const promptEl = document.getElementById('announcementUploadPrompt');
    const previewWrap = document.getElementById('announcementUploadPreviewWrap');
    const previewImg = document.getElementById('announcementUploadPreviewImg');

    if (fileInput) fileInput.value = '';
    if (promptEl) promptEl.style.display = 'flex';
    if (previewWrap) previewWrap.style.display = 'none';
    if (previewImg) previewImg.src = '';
  }
}

function getSelectedDriveFile(kind) {
  if (kind === 'gallery') {
    return (Array.isArray(selectedDriveFiles.gallery) && selectedDriveFiles.gallery[0]) || null;
  }
  return selectedDriveFiles.announcements || null;
}

function getSelectedDriveFiles(kind) {
  if (kind === 'gallery') {
    return Array.isArray(selectedDriveFiles.gallery) ? selectedDriveFiles.gallery : [];
  }
  return selectedDriveFiles.announcements ? [selectedDriveFiles.announcements] : [];
}

function initDriveDropzones() {
  [
    { id: 'announcementDriveDropzone', kind: 'announcements' },
    { id: 'galleryDriveDropzone', kind: 'gallery' }
  ].forEach((item) => {
    const zone = document.getElementById(item.id);
    if (!zone) return;
    ['dragenter', 'dragover'].forEach((evt) => {
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('is-dragover');
      });
    });
    zone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;
      if (item.kind === 'gallery') {
        addSelectedGalleryFiles(Array.from(files));
      } else {
        setSelectedDriveFile(item.kind, files[0]);
      }
    });
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = String(reader.result || '');
      const commaIdx = res.indexOf(',');
      resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(new Error('تعذّر قراءة ملف الصورة.'));
    reader.readAsDataURL(blob);
  });
}

function uploadImageToGoogleDrive(file, kind, onProgress) {
  const notify = (m) => { if (onProgress) onProgress(m); };
  const user = auth.currentUser;
  if (!user) return Promise.reject(new Error('يجب تسجيل الدخول قبل رفع الصور.'));
  let cfg = null;

  return ensureGoogleDriveConfigLoaded().then((loaded) => {
    cfg = loaded;
    if (!cfg || !cfg.webAppUrl || cfg.webAppUrl.indexOf('https://script.google.com/macros/s/') !== 0) {
      throw new Error('لم يتم ضبط رابط Google Drive Web App بعد. يضبطه الأدمن من «الإعدادات ← إعدادات Google Drive».');
    }
    notify('جاري ضغط الصورة لتحسين السرعة...');
    return compressImageFile(file, kind === 'profiles' ? 600 : 1600, 0.82);
  }).then((compressedBlob) => {
    notify('جاري رفع الصورة إلى Google Drive...');
    return Promise.all([blobToBase64(compressedBlob), user.getIdToken()]);
  }).then((parts) => {
    const cleanBase = (file.name || (kind + '-photo')).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || kind;
    const finalName = cleanBase + '-' + Date.now() + '.jpg';
    return fetch(cfg.webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'upload',
        kind: kind,
        fileName: finalName,
        mimeType: 'image/jpeg',
        base64Data: parts[0],
        idToken: parts[1], // يتحقق منه السكربت لدى Google؛ لا يوجد أي سر ثابت في المتصفح
        rootFolderId: cfg.rootFolderId || '',
        announcementsFolderId: cfg.announcementsFolderId || '',
        galleryFolderId: cfg.galleryFolderId || ''
      })
    });
  }).then((res) => res.text().then((txt) => {
    let json = null;
    try { json = JSON.parse(txt); } catch (_) { json = null; }
    if (!json) {
      // السبب الشائع للصفحة الغريبة/الخطأ: السكربت منشور بصلاحية «أنا فقط» أو تعديل لم يُنشر كإصدار جديد
      console.error('[Scout Elwihda] استجابة غير JSON من Apps Script (HTTP ' + res.status + '):', String(txt).slice(0, 200));
      throw new Error('استجاب Google Apps Script بصفحة غير متوقعة بدل نتيجة الرفع. تأكد أن السكربت منشور كتطبيق ويب بصلاحية «أي شخص» وأنك نشرت أحدث إصدار منه.');
    }
    return json;
  })).then((result) => {
    if (!result || !result.ok || !result.fileId) {
      throw new Error((result && result.error) || 'فشل رفع الصورة إلى Google Drive.');
    }
    return {
      driveFileId: result.fileId,
      imageUrl: buildGoogleDriveImageUrl(result.fileId, 1600),
      imageFile: ''
    };
  });
}

function deleteFileFromGoogleDriveIfEnabled(driveFileId) {
  const cleanId = extractGoogleDriveFileId(driveFileId);
  if (!cleanId) return;
  ensureGoogleDriveConfigLoaded().then((cfg) => {
    if (!cfg || cfg.autoDeleteFromDrive === false || !cfg.webAppUrl || !auth.currentUser) return;
    return auth.currentUser.getIdToken().then((idToken) => fetch(cfg.webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete', fileId: cleanId, idToken: idToken })
    }));
  }).catch((e) => console.warn('[Scout Elwihda] تعذر حذف الملف من Drive:', e && e.message));
}

// نافذة عرض ونسخ كود Google Apps Script مباشرة من لوحة الأدمن
const GOOGLE_APPS_SCRIPT_BRIDGE_CODE = `/**
 * ============================================================================
 * Scout El Wihda — Google Drive Storage Bridge (Google Apps Script) — الإصدار 2
 * ============================================================================
 * ما الجديد (أمان): لم يعد الرابط وحده كافياً للرفع. كل طلب يجب أن يحمل
 * «رمز هوية Firebase» (idToken) لمستخدم مسجّل دخوله، ويتحقق السكربت منه بنفسه
 * عبر Google Identity Toolkit، ثم يقرأ صلاحيات المستخدم من Firestore بنفس الرمز
 * (تُطبَّق قواعد Firestore عليه). لا يوجد أي رمز سري في المتصفح أو في Firestore.
 *
 * طريقة التثبيت/التحديث:
 * 1. افتح https://script.google.com وافتح مشروع السكربت الحالي (أو مشروعاً جديداً).
 * 2. امسح الكود القديم والصق هذا الكود بالكامل، ثم احفظ.
 * 3. نشر (Deploy) ← «إدارة عمليات النشر» ← تعديل (قلم) ← الإصدار: «إصدار جديد» ← نشر.
 *    (أو «نشر جديد» ← تطبيق ويب). التنفيذ بصفتي (Me) — من لديه حق الوصول: أي شخص (Anyone).
 *    ⚠️ إن لم تُنشر نسخة جديدة فسيبقى الرابط يشغّل الكود القديم.
 * 4. عند أول تشغيل وافق على الصلاحيات (Drive + الاتصال بخدمة خارجية UrlFetch).
 * 5. الرابط (/exec) لا يتغير عند «إصدار جديد» لنفس النشر.
 * ============================================================================
 */

// قيمتان عامتان (ليستا سرّيتين): تطابقان firebaseConfig في script.js
const FIREBASE_API_KEY = 'AIzaSyCOI6oGNz7D56fSodL3Ijcd6pIrWpnBszI';
const FIREBASE_PROJECT_ID = 'elwihda-scout';

const DEFAULT_ROOT_FOLDER_NAME = 'Scout_ElWihda_Media';
const MAX_BASE64_LENGTH = 4200000;            // ≈ 3MB بعد فك الترميز
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

function doGet(e) {
  return jsonResponse({ ok: true, service: 'Scout El Wihda — Google Drive Bridge', version: 2, status: 'ready' });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const action = body.action || 'upload';

    // 1) هوية المستخدم من Firebase (إلزامية لكل الإجراءات)
    const caller = verifyFirebaseUser(body.idToken);
    if (!caller) return jsonResponse({ ok: false, error: 'تعذر التحقق من هويتك. سجّل الدخول من جديد ثم أعد المحاولة.' });
    const profile = readUserProfile(caller.uid, body.idToken); // قد يكون null أثناء التسجيل (الوثيقة لم تُنشأ بعد)
    const isAdmin = !!(profile && profile.role === 'admin' && profile.accountStatus !== 'suspended' && profile.accountStatus !== 'locked');
    const perms = (profile && profile.accountStatus === 'active') ? (profile.permissions || {}) : {};

    if (action === 'ping') {
      if (!isAdmin) return jsonResponse({ ok: false, error: 'اختبار الاتصال للأدمن فقط.' });
      const f = ensureFolders(body.rootFolderId, body.announcementsFolderId, body.galleryFolderId, true);
      return jsonResponse({
        ok: true, message: 'تم الاتصال بـ Google Drive بنجاح!',
        rootFolderName: f.root.getName(), rootFolderId: f.root.getId(),
        announcementsFolderId: f.announcements.getId(), galleryFolderId: f.gallery.getId()
      });
    }

    if (action === 'upload') {
      const kind = body.kind === 'announcements' ? 'announcements' : (body.kind === 'profiles' ? 'profiles' : 'gallery');
      // 2) الصلاحية حسب نوع الرفع
      let allowed = false;
      if (kind === 'profiles') allowed = true; // أي مستخدم مسجّل (الصورة الشخصية)
      else if (kind === 'gallery') allowed = isAdmin || perms['gallery.upload'] === true;
      else allowed = isAdmin || perms['announcements.create'] === true || perms['announcements.edit'] === true;
      if (!allowed) return jsonResponse({ ok: false, error: 'ليست لديك صلاحية رفع هذا النوع من الصور.' });

      const base64Data = body.base64Data;
      if (!base64Data || typeof base64Data !== 'string') return jsonResponse({ ok: false, error: 'لم يتم إرسال بيانات الصورة.' });
      if (base64Data.length > MAX_BASE64_LENGTH) return jsonResponse({ ok: false, error: 'حجم الصورة كبير جداً.' });
      const mimeType = ALLOWED_MIME.indexOf(body.mimeType) !== -1 ? body.mimeType : 'image/jpeg';
      const safeName = String(body.fileName || (kind + '-' + new Date().getTime() + '.jpg')).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

      // المجلدات المخصصة من الواجهة تُقبل من الأدمن فقط؛ غيره يُرفع إلى المجلدات الافتراضية
      const f = ensureFolders(isAdmin ? body.rootFolderId : '', isAdmin ? body.announcementsFolderId : '', isAdmin ? body.galleryFolderId : '', false);
      const target = kind === 'announcements' ? f.announcements : (kind === 'profiles' ? f.profiles : f.gallery);

      const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, safeName);
      const file = target.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const fileId = file.getId();
      return jsonResponse({
        ok: true, fileId: fileId, fileName: file.getName(), folderId: target.getId(),
        imageUrl: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1600',
        fallbackUrl: 'https://lh3.googleusercontent.com/d/' + fileId + '=w1600',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId
      });
    }

    if (action === 'delete') {
      const mayDelete = isAdmin || perms['gallery.manage'] === true || perms['announcements.delete'] === true || perms['announcements.edit'] === true;
      if (!mayDelete) return jsonResponse({ ok: false, error: 'ليست لديك صلاحية حذف الصور.' });
      const fileId = String(body.fileId || '');
      if (!/^[a-zA-Z0-9_-]{15,80}$/.test(fileId)) return jsonResponse({ ok: false, error: 'معرّف الملف غير صالح.' });
      const file = DriveApp.getFileById(fileId);
      // لا نحذف إلا ملفات داخل مجلدات الوسائط الخاصة بالموقع
      const f = ensureFolders('', '', '', false);
      const okParents = [f.announcements.getId(), f.gallery.getId(), f.profiles.getId()];
      if (isAdmin && body.rootFolderId) okParents.push(String(body.rootFolderId));
      let inside = false;
      const it = file.getParents();
      while (it.hasNext()) { if (okParents.indexOf(it.next().getId()) !== -1) inside = true; }
      if (!inside && !isAdmin) return jsonResponse({ ok: false, error: 'هذا الملف خارج مجلدات الموقع.' });
      file.setTrashed(true);
      return jsonResponse({ ok: true, deletedFileId: fileId });
    }

    return jsonResponse({ ok: false, error: 'إجراء غير معروف.' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

// يتحقق من رمز هوية Firebase لدى Google ويرجع {uid,email} أو null
function verifyFirebaseUser(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length < 100) return null;
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ idToken: idToken })
  });
  if (res.getResponseCode() !== 200) return null;
  const data = JSON.parse(res.getContentText());
  const u = data && data.users && data.users[0];
  return u ? { uid: u.localId, email: u.email || '' } : null;
}

// يقرأ وثيقة users/{uid} عبر REST بنفس رمز المستخدم (فتُطبَّق قواعد Firestore). null إن لم توجد.
function readUserProfile(uid, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/users/' + encodeURIComponent(uid);
  const res = UrlFetchApp.fetch(url, { method: 'get', headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const f = JSON.parse(res.getContentText()).fields || {};
  const str = function (k) { return f[k] && f[k].stringValue ? f[k].stringValue : ''; };
  const perms = {};
  const pm = f.permissions && f.permissions.mapValue && f.permissions.mapValue.fields ? f.permissions.mapValue.fields : {};
  Object.keys(pm).forEach(function (k) { perms[k] = pm[k].booleanValue === true; });
  return { role: str('role'), accountStatus: str('accountStatus'), permissions: perms };
}

function ensureFolders(rootFolderId, announcementsFolderId, galleryFolderId, allowShare) {
  let root = null;
  if (rootFolderId) { try { root = DriveApp.getFolderById(rootFolderId); } catch (_) { root = null; } }
  if (!root) {
    const iter = DriveApp.getFoldersByName(DEFAULT_ROOT_FOLDER_NAME);
    root = iter.hasNext() ? iter.next() : DriveApp.createFolder(DEFAULT_ROOT_FOLDER_NAME);
  }
  let announcements = null;
  if (announcementsFolderId) { try { announcements = DriveApp.getFolderById(announcementsFolderId); } catch (_) { announcements = null; } }
  if (!announcements) announcements = getOrCreateSubfolder(root, 'announcements');
  let gallery = null;
  if (galleryFolderId) { try { gallery = DriveApp.getFolderById(galleryFolderId); } catch (_) { gallery = null; } }
  if (!gallery) gallery = getOrCreateSubfolder(root, 'gallery');
  const profiles = getOrCreateSubfolder(root, 'profiles');
  return { root: root, announcements: announcements, gallery: gallery, profiles: profiles };
}

function getOrCreateSubfolder(parentFolder, name) {
  const iter = parentFolder.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(name);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`;

function openGoogleDriveScriptModal() {
  let modal = document.getElementById('gdriveScriptGuideModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'gdriveScriptGuideModal';
    modal.className = 'modal-overlay help-modal-overlay';
    modal.innerHTML = `
      <div class="scout-card-container help-modal-box hover-lift" style="max-width:640px;">
        <button type="button" class="close-btn hover-lift" onclick="document.getElementById('gdriveScriptGuideModal').style.display='none'">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="form-box">
          <h2 style="color:var(--accent-gold);"><i class="fa-brands fa-google-drive"></i> ربط الموقع بحسابك على Google Drive</h2>
          <div class="help-modal-body">
            <ol style="padding-right:18px; line-height:1.85; font-size:0.86rem;">
              <li>افتح <a href="https://script.google.com" target="_blank" rel="noopener" style="color:var(--accent-gold); text-decoration:underline;">script.google.com</a> بحساب Google Drive الخاص بك واضغط <strong>مشروع جديد (New project)</strong>.</li>
              <li>اضغط زر <strong>«نسخ الكود»</strong> أدناه، وامسح الكود الافتراضي في الصفحة والصق هذا الكود مكانه ثم احفظه (<bdi dir="ltr">Ctrl+S</bdi>).</li>
              <li>اضغط <strong>نشر (Deploy) ← نشر جديد (New deployment)</strong> واختر النوع: <strong>تطبيق ويب (Web app)</strong>.</li>
              <li>اجعل «التنفيذ بصفتي» = <strong>أنا (Me)</strong>، و«من لديه حق الوصول» = <strong>أي شخص (Anyone)</strong>، ثم اضغط <strong>نشر (Deploy)</strong> ووافق على الصلاحيات.</li>
              <li>انسخ <strong>رابط تطبيق الويب (Web app URL)</strong> الذي ينتهي بـ <bdi dir="ltr">/exec</bdi> والصقه في حقل الرابط في إعدادات الأدمن، ثم اضغط <strong>«اختبار الاتصال وتجهيز المجلدات»</strong>.</li>
            </ol>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-top:10px;">
              <a href="guide-configuration-google-drive.pdf" target="_blank" rel="noopener noreferrer" class="glow-btn btn-gdrive-pdf hover-lift" style="padding:6px 14px; font-size:0.82rem; text-decoration:none;">
                <i class="fa-solid fa-file-pdf"></i> تحميل دليل الإعداد (PDF)
              </a>
              <button type="button" class="glow-btn btn-green hover-lift" style="padding:6px 14px; font-size:0.82rem;" onclick="copyGoogleDriveBridgeCode(this)">
                <i class="fa-solid fa-copy"></i> نسخ الكود
              </button>
            </div>
            <pre class="gdrive-code-pre" id="gdriveBridgeCodePre"></pre>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const pre = document.getElementById('gdriveBridgeCodePre');
    if (pre) pre.textContent = GOOGLE_APPS_SCRIPT_BRIDGE_CODE;
  }
  modal.style.display = 'flex';
}

function copyGoogleDriveBridgeCode(btn) {
  navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_BRIDGE_CODE).then(() => {
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ!';
    setTimeout(() => { btn.innerHTML = oldHtml; }, 2000);
  });
}