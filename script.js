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
const storage = firebase.storage();

let pendingDeleteUserId = null;
let pendingEditAnnouncementId = null;
let pendingDeleteAnnouncementId = null;

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
  initPhoneInputs();
  initPasswordValidationLeader();
  initPasswordValidationAdminLeader();
  initPasswordValidationScout();
  initHelpButtons();
  listenToAuthStatus();
  fetchLeadersList();
  fetchAllAccountsForDeleteView();
});

/* --- التبديل بين ألسنة لوحة الأدمن --- */
function switchAdminTab(tabId, btnElement) {
  const tabs = document.querySelectorAll('.admin-tab-content');
  tabs.forEach(tab => tab.classList.remove('active-tab'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add('active-tab');
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

  // تحميل بيانات الإعلانات عند فتح تبويب الإعلانات
  if (tabId === 'announcements-tab') {
    loadAnnouncementsAdmin();
    prefillMarqueeQuickEdit();
  }

  // تحميل قائمة الكشافة والأولياء عند فتح تبويبهم
  if (tabId === 'scouts-tab') {
    loadScoutsParentsAdmin();
  }

  // تحميل صور المعرض عند فتح تبويبه
  if (tabId === 'gallery-tab') {
    loadGalleryAdmin();
  }

  if (tabId === 'settings-tab') {
    refreshSettingsTab();
  }

  // تحميل الإحصائيات الحقيقية عند فتح تبويبها
  if (tabId === 'statistics-tab') {
    loadStatisticsAdmin();
  }

  // حفظ التبويب الحالي في الرابط حتى يبقى المستخدم فيه بعد Refresh
  window.location.hash = 'admin-' + tabId;
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
    document.body.style.overflow = 'auto';
  }
}

window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
});

/* --- إظهار / إخفاء كلمة المرور --- */
function togglePasswordVisibility(iconElement) {
  const input = iconElement.nextElementSibling;
  if (input && (input.type === 'password' || input.type === 'text')) {
    if (input.type === 'password') {
      input.type = 'text';
      iconElement.classList.remove('fa-eye');
      iconElement.classList.add('fa-eye-slash');
    } else {
      input.type = 'password';
      iconElement.classList.remove('fa-eye-slash');
      iconElement.classList.add('fa-eye');
    }
  }
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
      openModal('leaderRegisterModal');
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
      guestBtns.forEach(b => b.style.display = 'none');
      userBtns.forEach(b => b.style.display = 'inline-flex');

      db.collection('users').doc(user.uid).get().then((doc) => {
        if (doc.exists) {
          const userData = doc.data();
          currentUserRole = userData.role || null;
          currentUserPermissions = userData.permissions || {};
          currentUserAccountStatus = userData.accountStatus || null;

          renderScoutOrLeaderCard(userData);
          if (cardSection) cardSection.style.display = 'block';
          updateNavUserChip(userData);
          updateDashboardAccessButton(userData);
          syncAuthEmailToFirestore(user, userData);
          restoreAdminRouteIfAny(userData);
        }
      });
    } else {
      guestBtns.forEach(b => b.style.display = 'inline-flex');
      userBtns.forEach(b => b.style.display = 'none');
      if (cardSection) cardSection.style.display = 'none';
      clearNavUserChip();
      updateDashboardAccessButton(null);
      resetCurrentUserPermissionState();
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
  const lockBox = document.getElementById('announcementsLoginRequiredBox');
  const container = document.getElementById('publicAnnouncementsContainer');
  if (!lockBox || !container) return;

  if (user) {
    lockBox.style.display = 'none';
    container.style.display = 'flex';
    renderPublicAnnouncements();
  } else {
    lockBox.style.display = 'block';
    container.style.display = 'none';
    if (unsubscribePublicAnnouncementsListener) {
      unsubscribePublicAnnouncementsListener();
      unsubscribePublicAnnouncementsListener = null;
    }
    stopPublicAnnouncementsTicker();
    publicAnnouncementsCache = [];
  }
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
        ? `<img src="${photoURL}" alt="${fullName}">`
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

// الضغط على بطاقة المستخدم المصغّرة ينتقل إلى بطاقته الكاملة في الصفحة الرئيسية
function scrollToUserCard() {
  showPage('home-page');
  const cardSection = document.getElementById('userCardDisplaySection');
  if (cardSection) {
    setTimeout(() => cardSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
  }
}

// استعادة قسم لوحة الأدمن من الرابط (#admin-xxx) بعد Refresh — فقط إذا كان المستخدم يملك صلاحية فعلية
const VALID_ADMIN_TABS = ['welcome-tab', 'leaders-tab', 'scouts-tab', 'announcements-tab', 'gallery-tab', 'statistics-tab', 'settings-tab'];

function restoreAdminRouteIfAny(userData) {
  const pendingTab = window.__pendingAdminRoute;
  if (!pendingTab) return;
  window.__pendingAdminRoute = null;

  if ((userData.role === 'admin' || userData.role === 'leader')
      && userData.accountStatus !== 'suspended' && userData.accountStatus !== 'locked') {
    const fullBlueScreen = document.getElementById('fullAdminBlueScreen');
    if (fullBlueScreen) fullBlueScreen.style.display = 'flex';

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
  auth.signOut().then(() => {
    closeAllModalsAndOverlays();
    window.location.hash = '';
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

function handleForgotPassword() {
  const emailInput = document.getElementById('userLoginEmail');
  const errorMsg = document.getElementById('userLoginError');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email) {
    errorMsg.innerText = 'يرجى كتابة بريدك الإلكتروني في الحقل أعلاه أولاً.';
    return;
  }

  errorMsg.innerText = 'جاري الإرسال...';
  const genericMsg = 'إذا كان هذا البريد مرتبطاً بحساب، فستصلك رسالة تحتوي على خطوات إعادة تعيين كلمة المرور.';

  auth.sendPasswordResetEmail(email)
    .then(() => { errorMsg.innerText = genericMsg; })
    .catch(() => { errorMsg.innerText = genericMsg; });
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

    checkingBox.style.display = 'flex';
    submitBtn.disabled = true;

    auth.createUserWithEmailAndPassword(email, password)
      .then((userCredential) => {
        const uid = userCredential.user.uid;
        const leaderData = {
          uid: uid,
          fullName: fullName,
          email: email,
          role: 'leader',
          accountStatus: 'pending_verification',
          verificationStatus: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        return Promise.all([
          db.collection('users').doc(uid).set(leaderData),
          db.collection('leaders').doc(uid).set(leaderData)
        ]);
      })
      .then(() => {
        checkingBox.style.display = 'none';
        submitBtn.style.display = 'none';
        successMsg.innerText = 'تم إنشاء حسابك بنجاح! حسابك الآن قيد المراجعة من طرف الإدارة قبل تفعيل الصلاحيات الكاملة.';
        successMsg.style.display = 'block';
        fetchLeadersList();
        fetchAllAccountsForDeleteView();
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
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
    const unit = document.getElementById('scoutParentUnit').value;
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

    if (!unit) {
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
    }

    checkingBox.style.display = 'flex';
    if (checkingText) checkingText.innerText = 'جاري إنشاء حسابك...';
    submitBtn.disabled = true;

    let createdUid = null;
    let photoUploadFailed = false;

    auth.createUserWithEmailAndPassword(email, password)
      .then((userCredential) => {
        createdUid = userCredential.user.uid;
        if (!photoFile) return Promise.resolve(null);

        if (checkingText) checkingText.innerText = 'جاري رفع الصورة...';
        // رفع الصورة الشخصية اختياري: إن فشل Storage (غير مفعّل/مهلة) لا نُفشل التسجيل كله
        return withTimeout(
          compressImageFile(photoFile, 800, 0.8).then((compressedBlob) => {
            const photoRef = firebase.storage().ref().child(`profiles/${createdUid}/photo.jpg`);
            return photoRef.put(compressedBlob).then((snap) => snap.ref.getDownloadURL());
          }),
          15000
        ).catch((photoError) => {
          console.warn('Profile photo upload failed (non-fatal):', photoError);
          photoUploadFailed = true;
          return null;
        });
      })
      .then((photoURL) => {
        if (checkingText) checkingText.innerText = 'جاري حفظ بياناتك...';
        const userData = {
          uid: createdUid,
          fullName: fullName,
          email: email,
          parentPhone: parentPhone,
          scoutPhone: scoutPhone,
          unit: unit,
          role: selectedRole,
          accountStatus: 'active',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (photoURL) userData.photoURL = photoURL;
        return db.collection('users').doc(createdUid).set(userData);
      })
      .then(() => {
        checkingBox.style.display = 'none';
        submitBtn.style.display = 'none';
        if (photoUploadFailed) {
          successMsg.innerText = 'تم إنشاء حسابك بنجاح، لكن تعذّر رفع الصورة الشخصية (خدمة الصور غير متاحة حالياً). يمكنك المتابعة بدونها.';
        }
        successMsg.style.display = 'block';
        doneBtn.style.display = 'block';
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
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
  const avatarHtml = data.photoURL
    ? `<img src="${data.photoURL}" alt="${fullName}" loading="lazy">`
    : `<i class="fa-solid ${(isLeader || isAdmin) ? 'fa-user-shield' : 'fa-user-graduate'}"></i>`;

  const statusLabel = data.accountStatus === 'active' ? '🟢 نشط'
    : (data.accountStatus === 'pending_verification' ? '🟡 قيد المراجعة'
    : (data.accountStatus ? '🔴 ' + data.accountStatus : ''));

  cardContainer.innerHTML = `
    <div class="digital-scout-card hover-lift">
      <div class="card-header-badge">
        <i class="fa-solid ${isLeader ? 'fa-user-tie' : 'fa-id-card'}"></i>
        <span>${cardTitle}</span>
      </div>
      <div class="card-body-content">
        <div class="card-avatar">
          ${avatarHtml}
        </div>
        <div class="card-details">
          <h3>${fullName}</h3>
          <p class="role-tag">${roleBadge}</p>
          <div class="card-info-grid">
            <div><i class="fa-solid fa-envelope"></i> <strong>البريد:</strong> ${data.email || 'غير مدخل'}</div>
            ${data.parentPhone ? `<div><i class="fa-solid fa-phone"></i> <strong>هاتف الولي:</strong> ${data.parentPhone}</div>` : ''}
            ${data.scoutPhone ? `<div><i class="fa-solid fa-mobile-screen"></i> <strong>هاتف الابن:</strong> ${data.scoutPhone}</div>` : ''}
            ${data.unit ? `<div><i class="fa-solid fa-shield-halved"></i> <strong>الوحدة:</strong> ${data.unit}</div>` : ''}
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

      setTimeout(() => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        closeModal('mediaPortalModal');
        mediaPortalForm.reset();
        
        const fullBlueScreen = document.getElementById('fullAdminBlueScreen');
        if (fullBlueScreen) {
          fullBlueScreen.style.display = 'flex';
        }
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

      setTimeout(() => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        closeModal('adminLoginModal');
        adminLoginForm.reset();
        
        const fullBlueScreen = document.getElementById('fullAdminBlueScreen');
        if (fullBlueScreen) {
          fullBlueScreen.style.display = 'flex';
        }
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

  const fullBlueScreen = document.getElementById('fullAdminBlueScreen');
  if (fullBlueScreen) fullBlueScreen.style.display = 'none';
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
  if (mobileItem) mobileItem.style.display = canAccess ? 'block' : 'none';
}

// العودة إلى لوحة التعديلات دون الحاجة لإعادة تسجيل الدخول — الجلسة فعّالة أصلاً
function returnToDashboard() {
  const fullBlueScreen = document.getElementById('fullAdminBlueScreen');
  if (fullBlueScreen) fullBlueScreen.style.display = 'flex';

  const navMenu = document.getElementById('navMenu');
  if (navMenu) navMenu.classList.remove('active');

  const homeBtn = document.querySelector('.admin-nav-btn[onclick*="\'welcome-tab\'"]');
  switchAdminTab('welcome-tab', homeBtn);
  applyAdminPanelUIForRole();
}

// العودة إلى الموقع العام دون تسجيل الخروج — الجلسة تبقى فعّالة تماماً
function backToSiteFromAdmin() {
  closeAllModalsAndOverlays();
  showPage('home-page');
}

function logoutAdmin() {
  auth.signOut().then(() => {
    closeAllModalsAndOverlays();
    window.location.hash = '';
    window.location.reload();
  }).catch(() => {
    closeAllModalsAndOverlays();
    window.location.hash = '';
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

  const categoryLabels = { units: 'الوحدات', gatherings: 'التجمعات', camps: 'المخيمات' };

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
      const downloadName = path ? path.split('/').pop() : '';

      const card = document.createElement('div');
      card.className = 'gallery-card hover-lift';
      card.setAttribute('data-category', data.category || 'units');
      card.innerHTML = `
        <h3>${displayTitle}</h3>
        ${buildImageAreaHtml('gallery', data, displayTitle, true)}
        <span class="gallery-tag">${categoryLabels[data.category] || data.category || ''}</span>
        ${data.description ? buildExpandableHtml(data.description, 'gallery-desc') : ''}
        ${path ? `<button type="button" class="gallery-download-btn hover-lift" data-src="${path}" data-name="${downloadName}" onclick="downloadGalleryImage(this)">
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

// تحميل الصورة فعلياً (fetch + blob من نفس الموقع). إن منع المتصفح ذلك نفتحها في تبويب جديد.
function downloadGalleryImage(btn) {
  const src = btn.getAttribute('data-src');
  const name = btn.getAttribute('data-name') || 'image.jpg';
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
function openGalleryLightbox(imageUrl) {
  let lightbox = document.getElementById('galleryLightboxOverlay');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'galleryLightboxOverlay';
    lightbox.className = 'gallery-lightbox-overlay';
    lightbox.onclick = () => { lightbox.style.display = 'none'; };
    lightbox.innerHTML = '<img id="galleryLightboxImg" src="" alt="">';
    document.body.appendChild(lightbox);
  }
  document.getElementById('galleryLightboxImg').src = imageUrl;
  lightbox.style.display = 'flex';
}

function applyGalleryFilter(category) {
  document.querySelectorAll('.gallery-card').forEach((card) => {
    const show = category === 'all' || card.getAttribute('data-category') === category;
    card.style.display = show ? 'block' : 'none';
  });
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
      renderScoutsParentsList(allScoutsParentsCache);
    })
    .catch((error) => {
      container.innerHTML = '<p class="announcements-empty-text">حدث خطأ أثناء جلب الحسابات.</p>';
      console.error('loadScoutsParentsAdmin error:', error);
    });
}

function renderScoutsParentsList(list) {
  const container = document.getElementById('scoutsParentsListContainer');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p class="announcements-empty-text">لا توجد حسابات كشافة/أولياء حالياً.</p>';
    return;
  }

  container.innerHTML = '';
  list.forEach((user) => {
    const card = document.createElement('div');
    card.className = 'leader-item-card hover-lift';
    card.innerHTML = `
      <div class="leader-card-info">
        <h3>${user.fullName || 'بدون اسم'}</h3>
        <p><i class="fa-solid ${user.role === 'scout' ? 'fa-user-graduate' : 'fa-user-shield'}"></i> ${user.role === 'scout' ? 'كشاف' : 'ولي'}${user.unit ? ' — ' + user.unit : ''}</p>
        <p><i class="fa-solid fa-envelope"></i> ${user.email || ''}</p>
      </div>
    `;
    container.appendChild(card);
  });
}

function filterScoutsParentsList(query) {
  const q = sanitizeInput(query.trim().toLowerCase());
  if (!q) { renderScoutsParentsList(allScoutsParentsCache); return; }
  const filtered = allScoutsParentsCache.filter((u) =>
    (u.fullName || '').toLowerCase().indexOf(q) !== -1 ||
    (u.email || '').toLowerCase().indexOf(q) !== -1
  );
  renderScoutsParentsList(filtered);
}

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

function fetchLeadersList() {
  const container = document.getElementById('leadersListContainer');
  if (!container) return;

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

      let statusBadge = '<span class="status-badge status-verified"><i class="fa-solid fa-circle-check"></i> نشط</span>';
      if (isPending) statusBadge = '<span class="status-badge status-pending"><i class="fa-solid fa-hourglass-half"></i> قيد المراجعة</span>';
      if (isRejected) statusBadge = '<span class="status-badge status-rejected"><i class="fa-solid fa-circle-xmark"></i> مرفوض</span>';
      if (leader.accountStatus === 'suspended' || leader.accountStatus === 'locked') {
        statusBadge = '<span class="status-badge status-rejected"><i class="fa-solid fa-ban"></i> موقوف</span>';
      }

      // مصدر الحساب: مُنشأ من الإدارة (createdBy موجود) أو تسجيل ذاتي (غير موجود)
      const sourceBadge = leader.createdBy
        ? '<span class="status-badge source-badge-admin"><i class="fa-solid fa-user-shield"></i> قائد مُنشأ من الإدارة</span>'
        : '<span class="status-badge source-badge-self"><i class="fa-solid fa-user-pen"></i> طلب قائد / تسجيل ذاتي</span>';

      card.innerHTML = `
        <div class="leader-card-info">
          <h3>${leader.fullName}</h3>
          <p><i class="fa-solid fa-user-shield"></i> ${leader.leaderRoleTitle || 'قائد كشفي'}</p>
          <p><i class="fa-solid fa-envelope"></i> ${leader.email || ''}</p>
          <p>${statusBadge} ${sourceBadge}</p>
        </div>
        ${isPending ? `
        <div class="announcement-card-actions">
          <button class="btn-edit" style="background: rgba(34,197,94,0.2); color:#22c55e;" onclick="approveLeaderVerification('${uid}')"><i class="fa-solid fa-check"></i> قبول</button>
          <button class="btn-delete" onclick="rejectLeaderVerification('${uid}')"><i class="fa-solid fa-xmark"></i> رفض</button>
        </div>` : `
        <div class="announcement-card-actions">
          <button class="btn-edit" onclick='openEditPermissionsModal("${uid}", ${JSON.stringify(leader.fullName || '')})'><i class="fa-solid fa-key"></i> الصلاحيات</button>
        </div>`}
      `;

      container.appendChild(card);
    });
  }).catch((error) => {
    container.innerHTML = '<p class="announcements-empty-text">حدث خطأ أثناء جلب قائمة القادة: ' + error.message + '</p>';
    console.error('fetchLeadersList error:', error);
  });
}

// قبول تحقق القائد: يفعّل حسابه فعلياً في users وleaders معاً
function approveLeaderVerification(uid) {
  const updateData = {
    accountStatus: 'active',
    verificationStatus: 'verified',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
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
          <h3><i class="fa-solid fa-envelope"></i> ${data.email || ''}</h3>
          <p><i class="fa-solid fa-calendar"></i> ${dateText}</p>
          <p>${statusBadge}</p>
        </div>
        <div class="announcement-card-actions">
          <button class="btn-edit" onclick="viewSecurityRequest('${doc.id}')"><i class="fa-solid fa-eye"></i> عرض المشكلة</button>
        </div>
      `;
      container.appendChild(card);
    });
  }).catch((error) => {
    container.innerHTML = '<p class="announcements-empty-text">حدث خطأ: ' + error.message + '</p>';
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
    container.innerHTML = '<p class="announcements-empty-text">حدث خطأ أثناء جلب البيانات: ' + error.message + '</p>';
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
        <h3><i class="fa-solid fa-user"></i> ${item.data.fullName || 'بدون اسم'}</h3>
        <p><i class="fa-solid fa-envelope"></i> ${item.data.email || ''}</p>
        <p>${isBlocked
          ? '<span class="status-badge status-rejected"><i class="fa-solid fa-ban"></i> محظور</span>'
          : '<span class="status-badge status-pending"><i class="fa-solid fa-triangle-exclamation"></i> نشط — يحتاج مراجعة</span>'}
        </p>
        <p class="suspicious-reason-text"><i class="fa-solid fa-circle-info"></i> سبب الاشتباه: ${item.reason}</p>
        <div class="suspicious-actions-row">
          <button class="btn-warn-email" disabled title="يحتاج خدمة بريد إلكتروني حقيقية — غير متاحة حالياً ضمن Firebase Client">
            <i class="fa-solid fa-envelope"></i> إرسال رسالة تحذير (NEEDS EMAIL SERVICE)
          </button>
          ${isBlocked ? `
          <button class="btn-restore-account" onclick="confirmRestoreSuspiciousAccount('${item.uid}', ${JSON.stringify(item.data.fullName || '')})">
            <i class="fa-solid fa-rotate-left"></i> إعادة الحساب للخدمة
          </button>` : ''}
          <button class="btn-delete" onclick="confirmDeleteUser('${item.uid}')">
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
            <h3 style="color: #fff; margin: 0 0 5px 0; font-size: 1.1rem;">${nameText}</h3>
            <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;"><i class="fa-solid fa-envelope"></i> ${userData.email || 'بدون إيميل'} | <span style="color: var(--accent-gold);">${roleText}</span></p>
          </div>
        </div>
        <div class="account-action-part">
          <button class="btn-action-red hover-lift" onclick="confirmDeleteUser('${userId}')" style="padding: 8px 16px; border-radius: 8px; border: none; background: #ef4444; color: #fff; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 6px;">
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

  // نقرأ البريد أولاً لنعرضه في تعليمات الحذف اليدوي من Authentication
  db.collection('users').doc(uidToDelete).get()
    .then((snap) => (snap.exists ? (snap.data().email || '') : ''))
    .catch(() => '')
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
        + 'ولن يستطيع صاحب البريد' + (email ? ' <bdi dir="ltr">' + email + '</bdi>' : '') + ' إعادة التسجيل به قبل حذفه يدوياً:</span><br>'
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
      alert('حدث خطأ أثناء محاولة حذف الحساب: ' + error.message + ' (الكود: ' + error.code + ')');
      console.error('executeDeleteLeader error:', error);
    });
}
// جلب جميع القادة من Firestore وعرضهم في لوحة الأدمن
function loadLeadersForAdmin() {
  const container = document.getElementById('leadersListContainer');
  container.innerHTML = '<div class="spinner"></div>'; // تحميل

  db.collection('leaders').get().then((querySnapshot) => {
    container.innerHTML = '';
    querySnapshot.forEach((doc) => {
      const leader = doc.data();
      const leaderId = doc.id;

      // بناء الكرت تاع كل قائد
      const card = `
        <div class="leader-card-item hover-lift">
          <div class="leader-info">
            <i class="fa-solid fa-user-tie" style="color: var(--accent-gold);"></i>
            <strong>${leader.fullName}</strong> - <span class="text-sm opacity-70">${leader.role}</span>
          </div>
          <div class="leader-actions">
            <!-- زر التجميد (المخيف) -->
            <button class="btn-action-suspicious" onclick="toggleLeaderStatus('${leaderId}', '${leader.status}')">
              <i class="fa-solid fa-${leader.status === 'active' ? 'pause' : 'play'}"></i>
              ${leader.status === 'active' ? 'تجميد' : 'تفعيل'}
            </button>
            <!-- زر الحذف -->
            <button class="btn-action-red" onclick="confirmDeleteLeader('${leaderId}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
      container.innerHTML += card;
    });
  });
}

// وظيفة تجميد/تفعيل حساب القائد (مسؤول الإعلام مثلاً)
function toggleLeaderStatus(leaderId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
  db.collection('leaders').doc(leaderId).update({
    status: newStatus
  }).then(() => {
    showAdminNotification(`تم ${newStatus === 'active' ? 'تفعيل' : 'تجميد'} الحساب بنجاح!`, 'success');
    loadLeadersForAdmin(); // تحديث القائمة
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

// يحدد مصدر الصورة: ملف محلي (imageFile) أولاً، ثم رابط قديم محفوظ سابقاً (imageUrl) إن كان https
function getItemImagePath(kind, data) {
  const local = resolveLocalImagePath(kind, data.imageFile);
  if (local) return local;
  if (typeof data.imageUrl === 'string' && data.imageUrl.indexOf('https://') === 0) return data.imageUrl;
  return '';
}

// منطقة الصورة: الصورة إن وُجدت، وإلا (أو إن فشل تحميلها) رسالة "الصورة غير متاحة حاليًا."
// لا تُعرض صورة مكسورة أبداً، ولا يختفي محتوى البطاقة بسبب الصورة.
function buildImageAreaHtml(kind, data, altText, clickable) {
  const path = getItemImagePath(kind, data);
  const safeAlt = (altText || '').replace(/"/g, '&quot;');
  if (!path) {
    return '<div class="media-frame"><div class="image-unavailable">الصورة غير متاحة حاليًا.</div></div>';
  }
  const clickAttr = clickable ? ` data-lightbox="${path}"` : '';
  return `<div class="media-frame${clickable ? ' is-clickable' : ''}"${clickAttr}>
    <img src="${path}" alt="${safeAlt}" loading="lazy" onerror="handleImageLoadError(this)">
    <div class="image-unavailable is-hidden">الصورة غير متاحة حاليًا.</div>
  </div>`;
}

function handleImageLoadError(img) {
  img.style.display = 'none';
  const frame = img.parentElement;
  if (frame) {
    frame.classList.remove('is-clickable');
    frame.removeAttribute('data-lightbox');
    const fallback = frame.querySelector('.image-unavailable');
    if (fallback) fallback.classList.remove('is-hidden');
  }
}

// نص قابل للطي: يظهر الزر فقط إن كان النص طويلاً، وكل بطاقة مستقلة عن غيرها
const EXPANDABLE_TEXT_LIMIT = 200;
function buildExpandableHtml(text, extraClass) {
  const body = text || '';
  const needsToggle = body.length > EXPANDABLE_TEXT_LIMIT || (body.match(/\n/g) || []).length > 4;
  return `<div class="expandable-wrap">
    <p class="expandable-body ${extraClass || ''} ${needsToggle ? 'is-collapsed' : ''}">${body}</p>
    ${needsToggle ? '<button type="button" class="read-more-btn" onclick="toggleExpandable(this)">عرض المزيد</button>' : ''}
  </div>`;
}

function toggleExpandable(btn) {
  const body = btn.previousElementSibling;
  if (!body) return;
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
        imageFileInput.value = data.imageFile || '';
        draftCheckbox.checked = data.published === false;
        document.getElementById('announcementStartAtInput').value =
          data.startAt && data.startAt.toDate ? dateToAlgiersLocalInputValue(data.startAt.toDate()) : '';
        document.getElementById('announcementEndAtInput').value =
          data.endAt && data.endAt.toDate ? dateToAlgiersLocalInputValue(data.endAt.toDate()) : '';
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

// حفظ إعلان صفحة الموقع (إنشاء/تعديل). لا يوجد رفع صور: الصورة اختيارية وتُربط باسم ملف محلي.
const adminAnnouncementForm = document.getElementById('adminAnnouncementForm');
if (adminAnnouncementForm) {
  adminAnnouncementForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = sanitizeInput(document.getElementById('announcementTitleInput').value.trim());
    const content = sanitizeInput(document.getElementById('announcementContentInput').value.trim());
    const rawImageName = document.getElementById('announcementImageFileInput').value.trim();
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

    // اسم ملف الصورة: اختياري، وصيغته مقيّدة (لا مسارات ولا روابط)
    const imageFile = cleanLocalImageFileName(rawImageName);
    if (rawImageName && !imageFile) {
      errorMsg.innerText = 'اسم ملف الصورة غير صالح. اكتب اسم الملف فقط مع امتداده (مثال: announcement-001.jpg).';
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
    checkingText.innerText = 'جاري حفظ الإعلان...';

    const isEditing = !!pendingEditAnnouncementId;

    // شبكة أمان: لا يبقى الـLoading معلّقاً للأبد
    let timedOut = false;
    const safetyTimeout = setTimeout(() => {
      timedOut = true;
      checkingBox.style.display = 'none';
      submitBtn.disabled = false;
      errorMsg.innerText = 'استغرقت العملية وقتاً طويلاً بلا استجابة. تحقق من اتصالك وحاول مرة أخرى.';
    }, 20000);

    const data = {
      title: title,
      content: content,
      imageFile: imageFile,
      published: !isDraft,
      startAt: startAtDate ? firebase.firestore.Timestamp.fromDate(startAtDate) : null,
      endAt: endAtDate ? firebase.firestore.Timestamp.fromDate(endAtDate) : null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    let writePromise;
    if (isEditing) {
      writePromise = db.collection('announcements').doc(pendingEditAnnouncementId).update(data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser ? auth.currentUser.uid : null;
      writePromise = db.collection('announcements').add(data);
    }

    writePromise
      .then(() => {
        if (timedOut) return;
        clearTimeout(safetyTimeout);
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        successMsg.style.display = 'block';
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
        errorMsg.innerText = 'حدث خطأ أثناء الحفظ: ' + error.message + (error.code ? ' (الكود: ' + error.code + ')' : '');
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
          ${getItemImagePath('announcements', data) ? `<img src="${getItemImagePath('announcements', data)}" class="announcement-card-thumb" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="announcement-card-info" style="flex:1;">
            <h3>${data.title || 'بدون عنوان'}</h3>
            <p class="announcement-excerpt">${(data.content || '').slice(0, 120)}</p>
            <p style="margin-top:4px;">${timingBadge}</p>
            ${timingDetails}
            <p style="color:#94a3b8; font-size:0.75rem; margin-top:4px;"><i class="fa-solid fa-calendar"></i> ${dateText}</p>
          </div>
          <div class="announcement-card-actions">
            ${can('announcements.edit') ? `<button class="btn-edit" onclick="openAnnouncementModal('edit', '${id}')"><i class="fa-solid fa-pen"></i> تعديل</button>` : ''}
            ${can('announcements.delete') ? `<button class="btn-delete" onclick="confirmDeleteAnnouncement('${id}')"><i class="fa-solid fa-trash-can"></i> حذف</button>` : ''}
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

// تنفيذ حذف الإعلان فعلياً
function executeDeleteAnnouncement() {
  if (!pendingDeleteAnnouncementId) return;

  const checkingBox = document.getElementById('deleteAnnouncementCheckingBox');
  const successMsg = document.getElementById('deleteAnnouncementSuccess');
  const buttonsRow = document.getElementById('deleteAnnouncementConfirmButtons');

  buttonsRow.style.display = 'none';
  checkingBox.style.display = 'flex';

  db.collection('announcements').doc(pendingDeleteAnnouncementId).delete()
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
      card.innerHTML = `
        <h3>${data.title || ''}</h3>
        <p class="announcement-date"><i class="fa-solid fa-calendar"></i> ${dateText}</p>
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
      console.error('renderPublicAnnouncements error:', error);
    });
}


// رفع صورة للمعرض
/* =========================================================
   إدارة المعرض الرقمي من لوحة الأدمن — بدون رفع صور (الصور محلية)
   ========================================================= */
let pendingEditGalleryId = null;

function resetGalleryForm() {
  const form = document.getElementById('adminGalleryUploadForm');
  if (form) form.reset();
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
    const errorMsg = document.getElementById('galleryUploadError');
    const submitBtn = document.getElementById('galleryUploadSubmitBtn');

    errorMsg.innerText = '';

    if (!category) { errorMsg.innerText = 'يرجى اختيار التصنيف.'; return; }
    if (!title) { errorMsg.innerText = 'يرجى كتابة عنوان للصورة.'; return; }

    const imageFile = cleanLocalImageFileName(rawImageName);
    if (rawImageName && !imageFile) {
      errorMsg.innerText = 'اسم ملف الصورة غير صالح. اكتب اسم الملف فقط مع امتداده (مثال: gallery-001.jpg).';
      return;
    }

    const isEditing = !!pendingEditGalleryId;
    const data = {
      category: category,
      title: title,
      description: description,
      imageFile: imageFile,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    submitBtn.disabled = true;
    let write;
    if (isEditing) {
      write = db.collection('gallery').doc(pendingEditGalleryId).update(data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.uploadedBy = auth.currentUser ? auth.currentUser.uid : null;
      write = db.collection('gallery').add(data);
    }

    write.then(() => {
      submitBtn.disabled = false;
      showAdminNotification(isEditing ? 'تم تعديل عنصر المعرض بنجاح!' : 'تم حفظ عنصر المعرض بنجاح!', 'success');
      resetGalleryForm();
    }).catch((error) => {
      submitBtn.disabled = false;
      errorMsg.innerText = 'حدث خطأ أثناء الحفظ: ' + error.message + (error.code ? ' (الكود: ' + error.code + ')' : '');
    });
  });
}

function editGalleryItem(id) {
  db.collection('gallery').doc(id).get().then((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    pendingEditGalleryId = id;
    document.getElementById('galleryUploadCategory').value = data.category || '';
    document.getElementById('galleryUploadTitle').value = unescapeSanitized(data.title || '');
    document.getElementById('galleryUploadDescription').value = unescapeSanitized(data.description || '');
    document.getElementById('galleryImageFileInput').value = data.imageFile || '';
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
  const categoryLabels = { units: 'الوحدات', gatherings: 'التجمعات', camps: 'المخيمات' };

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
        const card = document.createElement('div');
        card.className = 'announcement-card-item hover-lift';
        card.innerHTML = `
          ${path ? `<img src="${path}" class="announcement-card-thumb" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="announcement-card-info" style="flex:1;">
            <h3>${data.title || 'بدون عنوان'}</h3>
            <p class="announcement-excerpt">${categoryLabels[data.category] || data.category || ''}${path ? '' : ' — بلا صورة'}</p>
          </div>
          <div class="announcement-card-actions">
            ${can('gallery.manage') ? `<button class="btn-edit" onclick="editGalleryItem('${doc.id}')"><i class="fa-solid fa-pen"></i> تعديل</button>` : ''}
            ${can('gallery.manage') ? `<button class="btn-delete" onclick="deleteGalleryImage('${doc.id}')"><i class="fa-solid fa-trash-can"></i> حذف</button>` : ''}
          </div>
        `;
        container.appendChild(card);
      });
    }, (error) => {
      container.innerHTML = '<p class="announcements-empty-text">حدث خطأ أثناء جلب العناصر: ' + error.message + '</p>';
      console.error('loadGalleryAdmin error:', error);
    });
}

// حذف سجل المعرض من Firestore فقط — ملف الصورة نفسه يبقى في مجلد المشروع حتى تحذفه أنت يدوياً.
function deleteGalleryImage(id) {
  if (!confirm('هل أنت متأكد من حذف هذا العنصر من المعرض؟ (ملف الصورة يبقى في مجلد المشروع)')) return;
  db.collection('gallery').doc(id).delete()
    .then(() => showAdminNotification('تم حذف العنصر من المعرض.', 'success'))
    .catch((error) => showAdminNotification('حدث خطأ أثناء الحذف: ' + error.message, 'error'));
}

function showAdminNotification(message, type) {
  const notif = document.createElement('div');
  notif.className = `admin-toast-notification ${type}`;
  notif.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
  document.body.appendChild(notif);

  // يبان ويختفي في 3 ثواني
  setTimeout(() => {
    notif.classList.add('fade-out');
    setTimeout(() => notif.remove(), 500);
  }, 3000);
}
// عرض كروت القادة
function loadLeaders() {
  const list = document.getElementById('leadersListContainer');
  list.innerHTML = ''; // نحياو القديم بسلاسة

  db.collection('leaders').get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      list.innerHTML += `
        <div class="leader-card-item glass-card hover-lift">
          <div class="leader-info">
            <i class="fa-solid fa-user-tie" style="color:var(--scout-blue)"></i>
            <strong>${data.fullName}</strong> <span class="role-badge">${data.role}</span>
          </div>
          <div class="leader-actions">
            <button class="btn-suspend" onclick="suspendLeader('${doc.id}')"><i class="fa-solid fa-ban"></i> تجميد</button>
            <button class="btn-delete" onclick="deleteLeader('${doc.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    });
  });
}
// بحث ذكي (Real-time search)
function smartSearch() {
  const query = document.getElementById('smartSearchInput').value.toLowerCase();
  const cards = document.querySelectorAll('.scout-card-item');
  
  cards.forEach(card => {
    const name = card.getAttribute('data-name').toLowerCase();
    // إظهار أو إخفاء بسلاسة
    if(name.includes(query)) {
      card.style.display = 'flex';
      card.style.opacity = '1';
    } else {
      card.style.display = 'none';
      card.style.opacity = '0';
    }
  });
}

// طباعة بطاقة الكشاف (PDF أو Print)
function printScoutCard(scoutId) {
  // جلب البيانات من Firestore وطبعها في نافذة صغيرة
  db.collection('scouts').doc(scoutId).get().then(doc => {
    const data = doc.data();
    const printWindow = window.open('', '', 'width=400,height=600');
    printWindow.document.write(`
      <h2 style="color:var(--scout-blue); text-align:center;">بطاقة الكشاف - فوج الوحدة</h2>
      <hr>
      <p><strong>الاسم:</strong> ${data.fullName}</p>
      <p><strong>الهاتف:</strong> ${data.phone}</p>
      <!-- باقي المعلومات... -->
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  });
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
    summary.innerHTML = 'الحساب الحالي: <bdi dir="ltr">' + (user.email || '') + '</bdi> — الدور: ' + (roleLabels[currentUserRole] || '—');
  }
  const select = document.getElementById('idleLockSelect');
  if (select) select.value = String(getIdleLockSeconds());
  ['settingsEmailMsg', 'settingsPasswordMsg'].forEach((id) => { const el = document.getElementById(id); if (el) el.innerText = ''; });
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

/* ---------- القفل التلقائي بعد عدم النشاط ---------- */
// ⚠️ هذا القفل واجهة راحة وأمان على الجهاز: الجلسة نفسها تبقى صالحة في Firebase،
// ومن يعبث بأدوات المتصفح يستطيع إزالة الشاشة. الحماية الحقيقية للبيانات هي Firestore Rules.
const IDLE_LOCK_STORAGE_KEY = 'scoutIdleLockSeconds'; // مدة فقط، ليست بيانات حساسة
let lastActivityAt = Date.now();
let idleLocked = false;

function getIdleLockSeconds() {
  const stored = localStorage.getItem(IDLE_LOCK_STORAGE_KEY);
  if (stored !== null) return Number(stored) || 0;
  return currentUserRole === 'admin' ? 900 : 0; // افتراضي: 15 دقيقة للأدمن، معطّل لغيره
}

function saveIdleLockSetting(value) {
  localStorage.setItem(IDLE_LOCK_STORAGE_KEY, String(Number(value) || 0));
  lastActivityAt = Date.now();
  showAdminNotification(Number(value) ? 'تم حفظ مدة القفل التلقائي.' : 'تم تعطيل القفل التلقائي.', 'success');
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'].forEach((evt) => {
  document.addEventListener(evt, () => { if (!idleLocked) lastActivityAt = Date.now(); }, { passive: true });
});

function lockIdleSession() {
  idleLocked = true;
  document.getElementById('idleLockPassword').value = '';
  document.getElementById('idleLockError').innerText = '';
  document.getElementById('idleLockOverlay').style.display = 'flex';
  setTimeout(() => { const i = document.getElementById('idleLockPassword'); if (i) i.focus(); }, 100);
}

function unlockIdleSession() {
  const input = document.getElementById('idleLockPassword');
  const errorEl = document.getElementById('idleLockError');
  const btn = document.getElementById('idleLockUnlockBtn');
  if (!input.value) { errorEl.innerText = 'يرجى إدخال كلمة المرور.'; return; }

  btn.disabled = true;
  errorEl.innerText = '';
  reauthenticateCurrentUser(input.value)
    .then(() => {
      document.getElementById('idleLockOverlay').style.display = 'none';
      idleLocked = false;
      lastActivityAt = Date.now();
    })
    .catch((error) => { errorEl.innerText = mapAccountActionError(error); })
    .then(() => { input.value = ''; btn.disabled = false; });
}

function logoutFromIdleLock() {
  idleLocked = false;
  document.getElementById('idleLockOverlay').style.display = 'none';
  handleUserLogout();
}

document.addEventListener('keydown', (e) => {
  if (idleLocked && e.key === 'Enter' && document.activeElement && document.activeElement.id === 'idleLockPassword') unlockIdleSession();
});

setInterval(() => {
  if (idleLocked) return;
  const seconds = getIdleLockSeconds();
  if (!seconds || !auth.currentUser) return;
  const panel = document.getElementById('fullAdminBlueScreen');
  if (!panel || panel.style.display !== 'flex') return; // يعمل فقط أثناء فتح لوحة الإدارة/النشر
  if (Date.now() - lastActivityAt >= seconds * 1000) lockIdleSession();
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
    html: '<ul><li>اكتب العنوان والمحتوى (إلزاميان).</li><li><strong>الصورة (اختيارية):</strong> انسخ الصورة إلى المجلد <bdi dir="ltr">assets/images/announcements/</bdi> ثم اكتب اسم الملف فقط (مثل <bdi dir="ltr">announcement-001.jpg</bdi>) ورفع الصورة مباشرة غير متاح.</li><li><strong>الجدولة:</strong> حدد وقت البداية والانتهاء بتوقيت الجزائر، أو اتركهما فارغين للنشر الفوري بلا انتهاء.</li><li><strong>مسودة:</strong> فعّل الخيار ليُحفظ الإعلان دون ظهوره للزوار.</li><li>بعد انتهاء المدة يختفي الإعلان من الصفحة العامة ويبقى محفوظاً هنا بحالة «منتهي».</li></ul>'
  },
  'gallery-form': {
    title: 'إضافة عنصر للمعرض الرقمي',
    html: '<ul><li>اختر التصنيف واكتب عنواناً (إلزامي) ووصفاً (اختياري).</li><li>انسخ الصورة إلى المجلد <bdi dir="ltr">assets/images/gallery/</bdi> ثم اكتب اسم الملف فقط (مثل <bdi dir="ltr">gallery-001.jpg</bdi>). لا يوجد رفع مباشر.</li><li>ارفع تعديلات المشروع إلى GitHub لتظهر الصورة على الموقع.</li><li>حذف العنصر يحذف سجله فقط؛ ملف الصورة يبقى في المشروع.</li></ul>'
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
    title: 'إعدادات الحساب',
    html: '<ul><li><strong>تغيير البريد:</strong> يُطلب منك كلمة المرور الحالية، ثم يصل رابط تأكيد للبريد الجديد؛ لا يتغير قبل الضغط عليه.</li><li><strong>تغيير كلمة المرور:</strong> أدخل الحالية ثم الجديدة مرتين (8 أحرف مع أرقام ورموز).</li><li><strong>القفل التلقائي:</strong> اختر المدة؛ بعد عدم النشاط تُطلب كلمة المرور من جديد. الاختيار محفوظ على هذا الجهاز فقط.</li></ul>'
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
