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
  listenToAuthStatus();
  fetchLeadersList();
  fetchAllAccountsForDeleteView();
  renderPublicAnnouncements();
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
      openModal('scoutParentRegisterModal');
    }
  }, 1000);
}

/* --- مراقبة حالة تسجيل الدخول --- */
function listenToAuthStatus() {
  auth.onAuthStateChanged((user) => {
    const guestBtns = document.querySelectorAll('.auth-guest-btn');
    const userBtns = document.querySelectorAll('.auth-user-btn');
    const cardSection = document.getElementById('userCardDisplaySection');

    if (user) {
      guestBtns.forEach(b => b.style.display = 'none');
      userBtns.forEach(b => b.style.display = 'inline-flex');

      db.collection('users').doc(user.uid).get().then((doc) => {
        if (doc.exists) {
          const userData = doc.data();
          renderScoutOrLeaderCard(userData);
          if (cardSection) cardSection.style.display = 'block';
        }
      });
    } else {
      guestBtns.forEach(b => b.style.display = 'inline-flex');
      userBtns.forEach(b => b.style.display = 'none');
      if (cardSection) cardSection.style.display = 'none';
    }
  });
}

function handleUserLogout() {
  auth.signOut().then(() => {
    window.location.reload();
  });
}

function reloadPageAfterRegister() {
  window.location.reload();
}

/* --- عرض بطاقة الكشاف / بطاقة القائد --- */
function renderScoutOrLeaderCard(data) {
  const cardContainer = document.getElementById('userCardContainer');
  if (!cardContainer) return;

  const isLeader = data.role === 'leader';
  const cardTitle = isLeader ? 'بطاقة القائد' : 'بطاقة الكشاف';
  const roleBadge = data.leaderRoleTitle || (isLeader ? 'قائد كشفي' : 'كشاف / ولي');
  const fullName = data.fullName || (data.firstName ? `${data.firstName} ${data.lastName}` : 'عضو الفوج');

  cardContainer.innerHTML = `
    <div class="digital-scout-card hover-lift">
      <div class="card-header-badge">
        <i class="fa-solid ${isLeader ? 'fa-user-tie' : 'fa-id-card'}"></i>
        <span>${cardTitle}</span>
      </div>
      <div class="card-body-content">
        <div class="card-avatar">
          <i class="fa-solid ${isLeader ? 'fa-user-shield' : 'fa-user-graduate'}"></i>
        </div>
        <div class="card-details">
          <h3>${fullName}</h3>
          <p class="role-tag">${roleBadge}</p>
          <div class="card-info-grid">
            <div><i class="fa-solid fa-envelope"></i> <strong>البريد:</strong> ${data.email || 'غير مدخل'}</div>
            ${data.parentPhone ? `<div><i class="fa-solid fa-phone"></i> <strong>هاتف الولي:</strong> ${data.parentPhone}</div>` : ''}
            ${data.scoutPhone ? `<div><i class="fa-solid fa-mobile-screen"></i> <strong>هاتف الابن:</strong> ${data.scoutPhone}</div>` : ''}
            <div><i class="fa-solid fa-flag"></i> <strong>الفوج:</strong> فوج الوحدة الكشفي</div>
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

    const handleSuccess = () => {
      setTimeout(() => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        closeModal('mediaPortalModal');
        mediaPortalForm.reset();
        
        const fullBlueScreen = document.getElementById('fullAdminBlueScreen');
        if (fullBlueScreen) {
          fullBlueScreen.style.display = 'flex';
        }
      }, 1500);
    };

    auth.signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        const uid = userCredential.user.uid;
        return db.collection('users').doc(uid).get();
      })
      .then((doc) => {
        if (doc.exists && (doc.data().role === 'admin' || doc.data().role === 'leader')) {
          handleSuccess();
        } else {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'عذراً، هذا الحساب لا يملك صلاحيات الإعلام والنشر!';
        }
      })
      .catch(() => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        errorMsg.innerText = 'البريد الإلكتروني أو كلمة المرور غير صحيحة!';
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

    const handleSuccessfulLogin = () => {
      setTimeout(() => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        closeModal('adminLoginModal');
        adminLoginForm.reset();
        
        const fullBlueScreen = document.getElementById('fullAdminBlueScreen');
        if (fullBlueScreen) {
          fullBlueScreen.style.display = 'flex';
        }
      }, 1500);
    };

    auth.signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        return db.collection('users').doc(userCredential.user.uid).get();
      })
      .then((doc) => {
        if (doc.exists && doc.data().role === 'admin') {
          handleSuccessfulLogin();
        } else {
          auth.signOut();
          checkingBox.style.display = 'none';
          submitBtn.disabled = false;
          errorMsg.innerText = 'عذراً، هذا الحساب لا يملك صلاحيات الأدمن!';
        }
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        console.error('[Admin Login - تشخيص مؤقت] code:', error.code, '| message:', error.message);
        errorMsg.innerText = `[تشخيص مؤقت] ${error.code || 'no-code'}: ${error.message || 'خطأ غير معروف'}`;
      });
  });
}

function logoutAdmin() {
  auth.signOut().then(() => {
    const fullBlueScreen = document.getElementById('fullAdminBlueScreen');
    if (fullBlueScreen) {
      fullBlueScreen.style.display = 'none';
    }
  });
}

function toggleMobileMenu() {
  const navMenu = document.getElementById('navMenu');
  if (navMenu) {
    navMenu.classList.toggle('active');
  }
}

/* --- فتح/إغلاق القائمة الجانبية للأدمن على الهاتف --- */
function toggleAdminSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('adminSidebarOverlay');
  if (sidebar) sidebar.classList.toggle('mobile-open');
  if (overlay) overlay.classList.toggle('active');
}

/* --- تصفية المعرض الرقمي --- */
function filterGallery(category, btnElement) {
  const buttons = document.querySelectorAll('.gallery-filter-btn');
  buttons.forEach(btn => btn.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  const cards = document.querySelectorAll('.gallery-card');
  cards.forEach(card => {
    if (category === 'all' || card.getAttribute('data-category') === category) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
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
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
      const card = document.createElement('div');
      card.className = 'leader-item-card hover-lift';

      card.innerHTML = `
        <div class="leader-card-info">
          <h3>${leader.fullName}</h3>
          <p><i class="fa-solid fa-user-shield"></i> ${leader.leaderRoleTitle || 'قائد كشفي'}</p>
        </div>
      `;

      container.appendChild(card);
    });
  });
}

// دالة الزر الأصفر (حسابات مشبوهة)
function showSuspiciousAccountsNotice() {
  alert('تنبيه: لا توجد حالياً أي حسابات مشبوهة أو نشاطات غير مرغوب فيها مسجلة في النظام.');
}

// جلب وعرض جميع الحسابات المضافة داخل المستطيلات بستايل أنيق ومميز مع زر الحذف
function fetchAllAccountsForDeleteView() {
  const container = document.getElementById('allAccountsListContainer');
  if (!container) return;

  db.collection('users').get().then((snapshot) => {
    container.innerHTML = '';

    if (snapshot.empty) {
      container.innerHTML = '<p style="color: rgba(255,255,255,0.6); text-align: center; width: 100%;">لا توجد حسابات مسجلة حالياً.</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
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

      const roleText = userData.role === 'leader' ? (userData.leaderRoleTitle || 'قائد كشفي') : (userData.role === 'admin' ? 'مدير النظام (أدمن)' : 'كشاف / ولي');
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

  const checkingBox = document.getElementById('deleteLeaderCheckingBox');
  const successMsg = document.getElementById('deleteLeaderSuccess');
  const buttonsRow = document.getElementById('deleteConfirmButtons');

  buttonsRow.style.display = 'none';
  checkingBox.style.display = 'flex';

  // حذف من مجموعة users ومجموعة leaders إن وجدت
  const deletePromises = [
    db.collection('users').doc(pendingDeleteUserId).delete(),
    db.collection('leaders').doc(pendingDeleteUserId).delete()
  ];

  Promise.all(deletePromises)
    .then(() => {
      setTimeout(() => {
        checkingBox.style.display = 'none';
        successMsg.style.display = 'block';

        setTimeout(() => {
          closeModal('deleteLeaderConfirmModal');
          pendingDeleteUserId = null;
          fetchAllAccountsForDeleteView();
          fetchLeadersList();
        }, 1200);
      }, 1000);
    })
    .catch(() => {
      checkingBox.style.display = 'none';
      buttonsRow.style.display = 'flex';
      alert('حدث خطأ أثناء محاولة حذف الحساب.');
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
// جلب الإعلان النشط من قاعدة البيانات
db.collection('settings').doc('announcements').onSnapshot(doc => {
  if(doc.exists) {
    document.getElementById('announcementMarqueeText').innerText = doc.data().urgentText;
  }
});

// وظيفة باش الآدمن يبدل النص
function updateAnnouncementBar(newText) {
  return db.collection('settings').doc('announcements').set({
    urgentText: newText,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(() => {
    showAdminNotification('تم تحديث شريط الإعلانات!', 'success');
  }).catch((error) => {
    showAdminNotification('فشل تحديث شريط الإعلانات: ' + error.message, 'error');
    throw error;
  });
}

// تعبئة حقل التعديل السريع للشريط بالنص الحالي عند فتح تبويب الإعلانات
function prefillMarqueeQuickEdit() {
  const input = document.getElementById('marqueeQuickEditInput');
  if (!input) return;
  db.collection('settings').doc('announcements').get().then((doc) => {
    if (doc.exists && doc.data().urgentText) {
      input.value = doc.data().urgentText;
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

  updateAnnouncementBar(text)
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
function openAnnouncementModal(mode, id) {
  const form = document.getElementById('adminAnnouncementForm');
  const titleInput = document.getElementById('announcementTitleInput');
  const contentInput = document.getElementById('announcementContentInput');
  const imageInput = document.getElementById('announcementImageInput');
  const imagePreview = document.getElementById('announcementImagePreview');
  const heading = document.getElementById('announcementModalHeading');
  const modalTitle = document.getElementById('announcementModalTitle');
  const submitBtnText = document.getElementById('announcementSubmitBtnText');
  const errorMsg = document.getElementById('announcementError');
  const successMsg = document.getElementById('announcementSuccess');

  form.reset();
  imagePreview.style.display = 'none';
  imagePreview.innerHTML = '';
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
        titleInput.value = data.title || '';
        contentInput.value = data.content || '';
        if (data.imageUrl) {
          imagePreview.style.display = 'block';
          imagePreview.innerHTML = `<img src="${data.imageUrl}" alt="صورة الإعلان">`;
        }
      }
    });
  } else {
    pendingEditAnnouncementId = null;
    heading.innerText = 'إعلان جديد';
    modalTitle.innerText = 'إنشاء إعلان';
    submitBtnText.innerText = 'نشر الإعلان';
  }

  openModal('adminAnnouncementModal');
}

// إرسال نموذج إنشاء/تعديل الإعلان
const adminAnnouncementForm = document.getElementById('adminAnnouncementForm');
if (adminAnnouncementForm) {
  adminAnnouncementForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = sanitizeInput(document.getElementById('announcementTitleInput').value.trim());
    const content = sanitizeInput(document.getElementById('announcementContentInput').value.trim());
    const imageFile = document.getElementById('announcementImageInput').files[0];

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

    // التحقق من الصورة إن وُجدت: نوع وحجم الملف
    if (imageFile) {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowedTypes.includes(imageFile.type)) {
        errorMsg.innerText = 'نوع الصورة غير مدعوم. الأنواع المسموحة: JPG, PNG, WEBP.';
        return;
      }
      if (imageFile.size > 3 * 1024 * 1024) {
        errorMsg.innerText = 'حجم الصورة كبير جداً. الحد الأقصى 3 ميغابايت.';
        return;
      }
    }

    submitBtn.disabled = true;
    checkingBox.style.display = 'flex';
    checkingText.innerText = imageFile ? 'جاري رفع الصورة وحفظ الإعلان...' : 'جاري حفظ الإعلان...';

    const isEditing = !!pendingEditAnnouncementId;

    const uploadImageIfNeeded = () => {
      if (!imageFile) return Promise.resolve(null);
      const safeName = `${Date.now()}_${imageFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      const imageRef = firebase.storage().ref().child(`announcements/${safeName}`);
      return imageRef.put(imageFile).then((snap) => snap.ref.getDownloadURL());
    };

    uploadImageIfNeeded()
      .then((imageUrl) => {
        const data = {
          title: title,
          content: content,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (imageUrl) data.imageUrl = imageUrl;

        if (isEditing) {
          return db.collection('announcements').doc(pendingEditAnnouncementId).update(data);
        } else {
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          data.published = true;
          return db.collection('announcements').add(data);
        }
      })
      .then(() => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        successMsg.style.display = 'block';
        showAdminNotification(isEditing ? 'تم تعديل الإعلان بنجاح!' : 'تم نشر الإعلان بنجاح!', 'success');

        setTimeout(() => {
          closeModal('adminAnnouncementModal');
          pendingEditAnnouncementId = null;
          loadAnnouncementsAdmin();
        }, 900);
      })
      .catch((error) => {
        checkingBox.style.display = 'none';
        submitBtn.disabled = false;
        errorMsg.innerText = 'حدث خطأ أثناء الحفظ: ' + error.message;
      });
  });
}

// جلب وعرض الإعلانات في لوحة الأدمن
function loadAnnouncementsAdmin() {
  const container = document.getElementById('announcementsListContainer');
  if (!container) return;

  container.innerHTML = '<p class="announcements-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</p>';

  db.collection('announcements').orderBy('createdAt', 'desc').get()
    .then((snapshot) => {
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
          : '';

        const card = document.createElement('div');
        card.className = 'announcement-card-item hover-lift';
        card.innerHTML = `
          ${data.imageUrl ? `<img src="${data.imageUrl}" class="announcement-card-thumb" alt="">` : ''}
          <div class="announcement-card-info" style="flex:1;">
            <h3>${data.title || 'بدون عنوان'}</h3>
            <p class="announcement-excerpt">${(data.content || '').slice(0, 120)}</p>
            <p style="color:#94a3b8; font-size:0.75rem; margin-top:4px;"><i class="fa-solid fa-calendar"></i> ${dateText}</p>
          </div>
          <div class="announcement-card-actions">
            <button class="btn-edit" onclick="openAnnouncementModal('edit', '${id}')"><i class="fa-solid fa-pen"></i> تعديل</button>
            <button class="btn-delete" onclick="confirmDeleteAnnouncement('${id}')"><i class="fa-solid fa-trash-can"></i> حذف</button>
          </div>
        `;
        container.appendChild(card);
      });
    })
    .catch((error) => {
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

// عرض الإعلانات المنشورة للزوار في الصفحة العامة (Live Update عبر onSnapshot)
function renderPublicAnnouncements() {
  const container = document.getElementById('publicAnnouncementsContainer');
  if (!container) return;

  db.collection('announcements')
    .where('published', '==', true)
    .orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        container.innerHTML = '<p class="announcements-empty-text">لا توجد إعلانات منشورة حالياً.</p>';
        return;
      }

      container.innerHTML = '';
      snapshot.forEach((doc) => {
        const data = doc.data();
        const dateText = data.createdAt && data.createdAt.toDate
          ? data.createdAt.toDate().toLocaleDateString('ar-DZ')
          : '';

        const card = document.createElement('div');
        card.className = 'public-announcement-card hover-lift';
        card.innerHTML = `
          ${data.imageUrl ? `<img src="${data.imageUrl}" alt="${data.title || ''}">` : ''}
          <h3>${data.title || ''}</h3>
          <p class="announcement-date"><i class="fa-solid fa-calendar"></i> ${dateText}</p>
          <p class="announcement-body">${data.content || ''}</p>
        `;
        container.appendChild(card);
      });
    }, (error) => {
      container.innerHTML = '<p class="announcements-empty-text">تعذر تحميل الإعلانات حالياً.</p>';
      console.error('renderPublicAnnouncements error:', error);
    });
}


// رفع صورة للمعرض
function uploadGalleryImage(file, category) {
  const storageRef = firebase.storage().ref();
  const imageRef = storageRef.child(`gallery/${category}/${file.name}`);

  imageRef.put(file).then((snapshot) => {
    snapshot.ref.getDownloadURL().then((downloadURL) => {
      // حفظ الرابط في Firestore باش يبان في الموقع
      db.collection('gallery').add({
        imageUrl: downloadURL,
        category: category,
        date: new Date()
      }).then(() => {
        showAdminNotification('تم رفع الصورة بنجاح!', 'success');
      });
    });
  });
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