let isAdminLoggedIn = false;

// ------------------------------------
// إعداد Firebase المجاني (ضع معلومات مشروعك من Firebase Console هنا)
// ------------------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "elwihda-scout.firebaseapp.com",
  projectId: "elwihda-scout",
  storageBucket: "elwihda-scout.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

// تهيئة الخدمة فقط إذا تم إدخال الإعدادات
if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY") {
  firebase.initializeApp(firebaseConfig);
}

// فتح وإغلاق النوافذ المنبثقة
function openModal(id) {
  const navMenu = document.getElementById('navMenu');
  if (navMenu) navMenu.classList.remove('active');
  
  const targetModal = document.getElementById(id);
  if (targetModal) targetModal.style.display = 'flex';
}

function closeModal(id) {
  const targetModal = document.getElementById(id);
  if (targetModal) targetModal.style.display = 'none';
}

function switchModal(closeId, openId) {
  closeModal(closeId);
  openModal(openId);
}

function toggleMobileMenu() {
  const navMenu = document.getElementById('navMenu');
  if (navMenu) navMenu.classList.toggle('active');
}

// دالة إظهار/إخفاء الشريط الجانبي للأدمن
function toggleAdminSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
  }
}

// دالة تسجيل الخروج للأدمن
function logoutAdmin() {
  isAdminLoggedIn = false;
  
  // إخفاء زري الـ 3 خطوط
  const desktopToggle = document.getElementById('adminDesktopToggleBtn');
  const mobileToggleLi = document.getElementById('adminMobileToggleLi');
  if (desktopToggle) desktopToggle.style.display = 'none';
  if (mobileToggleLi) mobileToggleLi.style.display = 'none';

  // إعادة إظهار أزرار الزوار في الهيدر والقائمة الجانبية
  const guestBtns = document.querySelectorAll('.auth-guest-btn');
  guestBtns.forEach(btn => btn.style.removeProperty('display'));

  // إغلاق الشريط الجانبي
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

// دالة إظهار/إخفاء كلمة المرور
function togglePasswordVisibility(icon) {
  const input = icon.previousElementSibling;
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

// دالة تصفية المعرض الرقمي
function filterGallery(category, btnElement) {
  const filterBtns = document.querySelectorAll('.gallery-filter-btn');
  filterBtns.forEach(btn => btn.classList.remove('active'));
  btnElement.classList.add('active');

  const galleryCards = document.querySelectorAll('.gallery-card');
  galleryCards.forEach(card => {
    if (category === 'all' || card.getAttribute('data-category') === category) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {

  // ------------------------------------
  // فحص نموذج إنشاء حساب جديد
  // ------------------------------------
  const regFirstName = document.getElementById('regFirstName');
  const regLastName = document.getElementById('regLastName');
  const regEmail = document.getElementById('regEmail');
  const regParentPhone = document.getElementById('regParentPhone');
  const regScoutPhone = document.getElementById('regScoutPhone');
  const regPassword = document.getElementById('regPassword');
  const regConfirmPassword = document.getElementById('regConfirmPassword');

  const parentPhoneMask = document.getElementById('parentPhoneMask');
  const scoutPhoneMask = document.getElementById('scoutPhoneMask');

  const checkLen = document.getElementById('checkLen');
  const checkNum = document.getElementById('checkNum');
  const checkSym = document.getElementById('checkSym');

  function applyStatus(inputEl, isValid) {
    const parentBox = inputEl.parentElement;
    if (inputEl.value.trim() === '') {
      parentBox.classList.remove('field-error', 'field-success');
    } else if (isValid) {
      parentBox.classList.remove('field-error');
      parentBox.classList.add('field-success');
    } else {
      parentBox.classList.remove('field-success');
      parentBox.classList.add('field-error');
    }
  }

  function validateName(input) {
    const nameRegex = /^[a-zA-Zأ-يإأآؤئءبةتثجحخدذرزسشصضطظعغفقكلمنهويةى\s]+$/;
    const val = input.value.trim();
    const isValid = val.length >= 2 && nameRegex.test(val);
    applyStatus(input, isValid);
    return isValid;
  }

  if (regFirstName) regFirstName.addEventListener('input', () => validateName(regFirstName));
  if (regLastName) regLastName.addEventListener('input', () => validateName(regLastName));

  function validateEmail(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(input.value.trim());
    applyStatus(input, isValid);
    return isValid;
  }

  if (regEmail) regEmail.addEventListener('input', () => validateEmail(regEmail));

  function handlePhoneInput(input, maskEl) {
    input.value = input.value.replace(/[^0-9]/g, '');
    let val = input.value;

    let isValidPrefix = false;
    if (val.length >= 2) {
      const prefix = val.substring(0, 2);
      isValidPrefix = ['05', '06', '07'].includes(prefix);
    }

    let remainingX = 10 - val.length;
    if (remainingX < 0) remainingX = 0;

    let maskText = '';
    for (let i = 0; i < remainingX; i++) {
      maskText += 'x';
    }
    if (maskEl) maskEl.textContent = maskText;

    const isFullValid = val.length === 10 && isValidPrefix;
    applyStatus(input, isFullValid);
    return isFullValid;
  }

  if (regParentPhone) {
    regParentPhone.addEventListener('input', () => handlePhoneInput(regParentPhone, parentPhoneMask));
  }
  if (regScoutPhone) {
    regScoutPhone.addEventListener('input', () => handlePhoneInput(regScoutPhone, scoutPhoneMask));
  }

  function validatePassword() {
    const val = regPassword.value;

    const has8Char = val.length >= 8;
    updateCheckItem(checkLen, has8Char);

    const hasNumbers = /[0-9]/.test(val);
    updateCheckItem(checkNum, hasNumbers);

    const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(val);
    updateCheckItem(checkSym, hasSymbols);

    const isAllValid = has8Char && hasNumbers && hasSymbols;
    applyStatus(regPassword, isAllValid);

    if (regConfirmPassword && regConfirmPassword.value !== '') {
      validateConfirmPassword();
    }

    return isAllValid;
  }

  function updateCheckItem(el, isValid) {
    if (!el) return;
    const icon = el.querySelector('.check-icon');
    if (isValid) {
      el.classList.remove('invalid');
      el.classList.add('valid');
      if (icon) icon.className = 'fa-solid fa-circle-check check-icon';
    } else {
      el.classList.remove('valid');
      el.classList.add('invalid');
      if (icon) icon.className = 'fa-solid fa-circle-xmark check-icon';
    }
  }

  function validateConfirmPassword() {
    const isValid = regConfirmPassword.value !== '' && regConfirmPassword.value === regPassword.value;
    applyStatus(regConfirmPassword, isValid);
    return isValid;
  }

  if (regPassword) regPassword.addEventListener('input', validatePassword);
  if (regConfirmPassword) regConfirmPassword.addEventListener('input', validateConfirmPassword);

  // 1. معالجة إنشاء حساب مع تأثير الانتظار
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const regError = document.getElementById('regError');
      const checkingBox = document.getElementById('regCheckingBox');
      const submitBtn = document.getElementById('regSubmitBtn');

      if (regError) regError.textContent = '';

      const isNameOk = validateName(regFirstName) && validateName(regLastName);
      const isEmailOk = validateEmail(regEmail);
      const isParentPhoneOk = handlePhoneInput(regParentPhone, parentPhoneMask);
      const isScoutPhoneOk = handlePhoneInput(regScoutPhone, scoutPhoneMask);
      const isPassOk = validatePassword();
      const isConfirmOk = validateConfirmPassword();

      // إظهار تأثير الانتظار في كل الأحوال للتأكد من الشروط
      if (checkingBox) checkingBox.style.display = 'flex';
      if (submitBtn) submitBtn.style.display = 'none';

      setTimeout(() => {
        if (checkingBox) checkingBox.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'block';

        if (!isNameOk) {
          if (regError) regError.textContent = 'يرجى إدخال اسم ولقب حقيقيين (حروف فقط)';
          return;
        }
        if (!isEmailOk) {
          if (regError) regError.textContent = 'يرجى إدخال بريد إلكتروني صحيح';
          return;
        }
        if (!isParentPhoneOk || !isScoutPhoneOk) {
          if (regError) regError.textContent = 'يرجى التأكد من أرقام الهواتف (تبدأ بـ 05/06/07 وتتكون من 10 أرقام)';
          return;
        }
        if (!isPassOk) {
          if (regError) regError.textContent = 'كلمة المرور لا تستوفي الشروط المطلوب تحققها';
          return;
        }
        if (!isConfirmOk) {
          if (regError) regError.textContent = 'كلمتا المرور غير متطابقتين!';
          return;
        }

        closeModal('registerModal');
        registerForm.reset();
        document.querySelectorAll('#registerForm .input-box').forEach(b => b.classList.remove('field-success', 'field-error'));
        if (parentPhoneMask) parentPhoneMask.textContent = '';
        if (scoutPhoneMask) scoutPhoneMask.textContent = '';
        validatePassword();
      }, 1500);
    });
  }

  // 2. معالجة تسجيل دخول الكشاف مع تأثير الانتظار
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const loginError = document.getElementById('loginError');
      const checkingBox = document.getElementById('loginCheckingBox');
      const submitBtn = document.getElementById('loginSubmitBtn');

      if (loginError) loginError.textContent = '';
      if (checkingBox) checkingBox.style.display = 'flex';
      if (submitBtn) submitBtn.style.display = 'none';

      setTimeout(() => {
        if (checkingBox) checkingBox.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'block';

        // مثال للتحقق المؤقت
        if (loginError) loginError.textContent = 'البريد الإلكتروني أو كلمة المرور غير صحيحة!';
      }, 1500);
    });
  }

  // 3. معالجة دخول بوابة القيادة مع تأثير الانتظار
  const leaderForm = document.getElementById('leaderPortalForm');
  if (leaderForm) {
    leaderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const leaderError = document.getElementById('leaderError');
      const checkingBox = document.getElementById('leaderCheckingBox');
      const submitBtn = document.getElementById('leaderSubmitBtn');

      if (leaderError) leaderError.textContent = '';
      if (checkingBox) checkingBox.style.display = 'flex';
      if (submitBtn) submitBtn.style.display = 'none';

      setTimeout(() => {
        if (checkingBox) checkingBox.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'block';

        // مثال للتحقق المؤقت
        if (leaderError) leaderError.textContent = 'بيانات دخول القائد غير صحيحة أو الحساب غير مفعل!';
      }, 1500);
    });
  }

  // 4. معالجة تسجيل دخول الأدمن المعزز بالتحقق والتأثير
  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const adminEmail = document.getElementById('adminEmail').value.trim();
      const adminPassword = document.getElementById('adminPassword').value.trim();
      const adminError = document.getElementById('adminError');
      const checkingBox = document.getElementById('adminCheckingBox');
      const submitBtn = document.getElementById('adminSubmitBtn');

      if (adminError) adminError.textContent = '';

      if (checkingBox) checkingBox.style.display = 'flex';
      if (submitBtn) submitBtn.style.display = 'none';

      setTimeout(() => {
        if (checkingBox) checkingBox.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'block';

        if (adminEmail === 'Kherfi_mohamed@solution4all.dz' && adminPassword === 'Kherfi*2@@9') {
          isAdminLoggedIn = true;

          closeModal('adminLoginModal');
          adminLoginForm.reset();

          // إخفاء أزرار الزوار بالكامل (تسجيل الدخول، بوابة القيادة، الأدمن)
          const guestBtns = document.querySelectorAll('.auth-guest-btn');
          guestBtns.forEach(btn => btn.style.setProperty('display', 'none', 'important'));

          // إظهار زري الـ 3 خطوط للأدمن (للحواسيب والهواتف)
          const desktopToggle = document.getElementById('adminDesktopToggleBtn');
          const mobileToggleLi = document.getElementById('adminMobileToggleLi');
          if (desktopToggle) desktopToggle.style.display = 'inline-flex';
          if (mobileToggleLi) mobileToggleLi.style.display = 'block';

          // فتح الشريط الجانبي تلقائياً
          toggleAdminSidebar();
        } else {
          if (adminError) adminError.textContent = 'البريد الإلكتروني أو كلمة المرور الخاصة بالأدمن غير صحيحة!';
        }
      }, 1500);
    });
  }

});