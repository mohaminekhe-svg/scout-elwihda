// فتح وإغلاق النوافذ المنبثقة
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function switchModal(closeId, openId) {
  closeModal(closeId);
  openModal(openId);
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

document.addEventListener('DOMContentLoaded', () => {

  // ------------------------------------
  // نظام فحص نموذج إنشاء حساب جديد
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

  // دالة تحكم بالحواف الحمراء والخضراء
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

  // 1. فحص الاسم واللقب (حروف فقط بدون أرقام)
  function validateName(input) {
    const nameRegex = /^[a-zA-Zأ-يإأآؤئءبةتثجحخدذرزسشصضطظعغفقكلمنهويةى\s]+$/;
    const val = input.value.trim();
    const isValid = val.length >= 2 && nameRegex.test(val);
    applyStatus(input, isValid);
    return isValid;
  }

  if (regFirstName) regFirstName.addEventListener('input', () => validateName(regFirstName));
  if (regLastName) regLastName.addEventListener('input', () => validateName(regLastName));

  // 2. فحص البريد الإلكتروني
  function validateEmail(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(input.value.trim());
    applyStatus(input, isValid);
    return isValid;
  }

  if (regEmail) regEmail.addEventListener('input', () => validateEmail(regEmail));

  // 3. فحص الهاتف ونظام xxxxxxxx
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
    maskEl.textContent = maskText;

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

  // 4. فحص كلمة المرور والشروط الثلاثة
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

    if (regConfirmPassword.value !== '') {
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

  // 5. التقديم والتحقق عند الضغط على إنشاء حساب
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const regError = document.getElementById('regError');
      regError.textContent = '';

      const isNameOk = validateName(regFirstName) && validateName(regLastName);
      const isEmailOk = validateEmail(regEmail);
      const isParentPhoneOk = handlePhoneInput(regParentPhone, parentPhoneMask);
      const isScoutPhoneOk = handlePhoneInput(regScoutPhone, scoutPhoneMask);
      const isPassOk = validatePassword();
      const isConfirmOk = validateConfirmPassword();

      if (!isNameOk) {
        regError.textContent = 'يرجى إدخال اسم ولقب حقيقيين (حروف فقط)';
        return;
      }
      if (!isEmailOk) {
        regError.textContent = 'يرجى إدخال بريد إلكتروني صحيح';
        return;
      }
      if (!isParentPhoneOk || !isScoutPhoneOk) {
        regError.textContent = 'يرجى التأكد من أرقام الهواتف (تبدأ بـ 05/06/07 وتتكون من 10 أرقام)';
        return;
      }
      if (!isPassOk) {
        regError.textContent = 'كلمة المرور لا تستوفي الشروط المطلوب تحققها';
        return;
      }
      if (!isConfirmOk) {
        regError.textContent = 'كلمتا المرور غير متطابقتين!';
        return;
      }

      alert('تم إنشاء الحساب بنجاح!');
      closeModal('registerModal');
      registerForm.reset();
      
      document.querySelectorAll('#registerForm .input-box').forEach(b => b.classList.remove('field-success', 'field-error'));
      if (parentPhoneMask) parentPhoneMask.textContent = '';
      if (scoutPhoneMask) scoutPhoneMask.textContent = '';
      validatePassword();
    });
  }

  // نماذج تسجيل الدخول والبوابة
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('تم تسجيل الدخول بنجاح!');
      closeModal('loginModal');
      loginForm.reset();
    });
  }

  const leaderForm = document.getElementById('leaderPortalForm');
  if (leaderForm) {
    leaderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('مرحباً بك في بوابة القيادة!');
      closeModal('leaderPortalModal');
      leaderForm.reset();
    });
  }

});