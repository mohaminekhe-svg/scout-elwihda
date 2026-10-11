/* ============================================
   Kaminz_Studio — السكريبت الرئيسي
   نظام التنقل: صفحات متعددة داخل صفحة واحدة (طبقات)
   ============================================ */

// مساعد: جيب عنصر بأمان (إذا مش موجود يرجع null بدل ما يطيح خطأ)
const $ = (id) => document.getElementById(id);

// ===== التنبيهات (Toast) =====
const toast = $('toast');
let toastTimer;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ===== الهيدر عند التمرير =====
const header = $('header');

window.addEventListener('scroll', () => {
  if (header) header.classList.toggle('scrolled', window.scrollY > 40);
});

// ============================================
// ===== التنقل بين الصفحات (الطبقات) =====
// ============================================
const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('.nav-link');
const menuToggle = $('menu-toggle');
const navList = $('nav-list');

function closeMobileMenu() {
  if (navList) navList.classList.remove('open');
  if (menuToggle) menuToggle.classList.remove('open');
}

function goToPage(pageId) {
  const target = $(pageId);

  // إذا المطلوب ماشي صفحة من صفحاتنا — ما نمنعش السلوك الافتراضي
  if (!target || !target.classList.contains('page')) return false;

  // 1) إخفاء كل الصفحات وإظهار المطلوبة فقط
  pages.forEach(p => p.classList.toggle('active', p === target));

  // 2) تحديث الرابط النشط في القائمة العلوية
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${pageId}`);
  });

  // 3) الرجوع للأعلى باش تبان الطبقة الجديدة كاملة
  const root = document.documentElement;
  const prevScroll = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto'; // نعطّلو السلاسة مؤقتاً باش يرجع فوراً
  window.scrollTo(0, 0);
  root.style.scrollBehavior = prevScroll;

  // 4) إغلاق قائمة الهاتف إذا كانت مفتوحة
  closeMobileMenu();

  return true;
}

// اعتراض كل الروابط الداخلية (#...) — تبدل الصفحة بدل ما تفتح وحدة جديدة
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');

    // رابط "#" فارغ (مثل انستغرام قبل ما تحط الرابط) — نمنع القفزة فقط
    if (href === '#') {
      e.preventDefault();
      return;
    }

    const pageId = href.slice(1);
    if (goToPage(pageId)) {
      e.preventDefault(); // يبقى في نفس الصفحة ✅
      // 💡 ملاحظة: روابط التواصل الاجتماعي ماشي بهذا الشكل (https...) — تتفتح عادي
    }
  });
});

// عند فتح الموقع: إذا الرابط فيه #صفحة (مثلاً بعد مشاركة الرابط) نظهرها مباشرة
if (location.hash) {
  const pageId = location.hash.slice(1);
  if (pageId && $(pageId) && $(pageId).classList.contains('page')) {
    goToPage(pageId);
  }
}

// ===== قائمة الهاتف (الهامبرغر) =====
if (menuToggle && navList) {
  menuToggle.addEventListener('click', () => {
    navList.classList.toggle('open');
    menuToggle.classList.toggle('open');
  });
}

// ===== الوضع الليلي / النهاري (محفوظ تلقائياً) =====
const themeToggle = $('theme-toggle');
const THEME_KEY = 'kaminz_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggle) themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// عند فتح الصفحة: نطبق الوضع المحفوظ (الوسم في head منع الوميض، هنا نزيد الأيقونة)
applyTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light');

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, newTheme); // 💾 يبقى محفوظ حتى لو سكّرت المتصفح
    applyTheme(newTheme);
  });
}

// ===== نافذة تسجيل الدخول / إنشاء حساب =====
const authModal = $('auth-modal');
const authBtn = $('auth-btn');
const modalClose = $('modal-close');
const modalTabs = document.querySelectorAll('.modal-tab');
const loginForm = $('login-form');
const signupForm = $('signup-form');
const USER_KEY = 'kaminz_user';

function openModal() {
  if (!authModal) return;
  authModal.classList.add('open');
  authModal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  if (!authModal) return;
  authModal.classList.remove('open');
  authModal.setAttribute('aria-hidden', 'true');
}

// تحديث زر الحساب حسب حالة الدخول
function refreshAuthBtn() {
  if (!authBtn) return;
  const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  if (user) {
    authBtn.innerHTML = `👋 ${user.name}`;
    authBtn.title = 'اضغط للخروج من الحساب';
  } else {
    authBtn.textContent = 'تسجيل الدخول';
    authBtn.title = '';
  }
}

refreshAuthBtn();

if (authBtn) {
  authBtn.addEventListener('click', () => {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    if (user) {
      // تسجيل الخروج
      localStorage.removeItem(USER_KEY);
      refreshAuthBtn();
      showToast('👋 تم تسجيل الخروج — إلى اللقاء!');
    } else {
      openModal();
    }
  });
}

if (modalClose) modalClose.addEventListener('click', closeModal);

// الإغلاق بالضغط خارج النافذة
if (authModal) {
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeModal();
  });
}

// الإغلاق بزر Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && authModal && authModal.classList.contains('open')) closeModal();
});

// التبديل بين تبويب الدخول وإنشاء الحساب
modalTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    modalTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    if (loginForm) loginForm.classList.toggle('hidden', !isLogin);
    if (signupForm) signupForm.classList.toggle('hidden', isLogin);
  });
});

// تسجيل الدخول (حفظ محلي مؤقت — TODO: ربط بقاعدة بيانات لاحقاً)
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const [email] = loginForm.querySelectorAll('input');
    const name = email.value.split('@')[0]; // اسم مؤقت من الإيميل
    localStorage.setItem(USER_KEY, JSON.stringify({ name, email: email.value }));
    refreshAuthBtn();
    closeModal();
    loginForm.reset();
    showToast(`✅ مرحباً بعودتك يا ${name}!`);
  });
}

// إنشاء حساب جديد
if (signupForm) {
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = $('signup-name');
    const name = nameInput ? nameInput.value.trim() : 'صديقنا';
    const email = signupForm.querySelector('input[type="email"]').value.trim();
    localStorage.setItem(USER_KEY, JSON.stringify({ name, email }));
    refreshAuthBtn();
    closeModal();
    signupForm.reset();
    showToast(`🎉 أهلاً بيك يا ${name}! تم إنشاء حسابك.`);
  });
}

// ===== زر الأدمن (القفل) =====
const adminBtn = $('admin-btn');
if (adminBtn) {
  adminBtn.addEventListener('click', () => {
    // TODO: مستقبلاً هنا يتحقق من صلاحيات الأدمن ويفتح لوحة التحكم
    showToast('🔒 لوحة تحكم الأدمن قيد التطوير — متاحة قريباً!');
  });
}

// ===== حركات الظهور عند التبديل بين الصفحات =====
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      // تأخير بسيط بين العناصر المتجاورة لتحسين المظهر
      setTimeout(() => entry.target.classList.add('visible'), (index % 3) * 120);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ===== عدّاد الأرقام =====
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;

    const el = entry.target;
    const target = +el.dataset.count;
    const duration = 1600;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(target * progress);
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    counterObserver.unobserve(el);
  });
}, { threshold: 0.6 });

document.querySelectorAll('.stat-num').forEach(el => counterObserver.observe(el));

// ===== نموذج النشرة البريدية =====
const newsletterForm = $('newsletter-form');
const newsletterMsg = $('newsletter-msg');

if (newsletterForm && newsletterMsg) {
  newsletterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = newsletterForm.querySelector('input').value.trim();

    if (email) {
      // TODO: لاحقاً نربطو هنا خدمة تخزين الإيميلات (مثل Formspree — مجانية)
      newsletterMsg.textContent = '✅ تم التسجيل بنجاح! نتمنى لك يوم سعيد.';
      newsletterForm.reset();
      setTimeout(() => { newsletterMsg.textContent = ''; }, 5000);
    }
  });
}


// ============================================
// ===== تبويبات فلترة الخدمات (تفاعلي) =====
// ============================================
const filterTabs = document.querySelectorAll('.filter-tab');
const serviceCards = document.querySelectorAll('.service-card[data-category]');

filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // 1) تفعيل التبويب المختار
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const filter = tab.dataset.filter;

    // 2) إظهار/إخفاء البطاقات حسب التصنيف
    serviceCards.forEach(card => {
      const match = filter === 'all' || card.dataset.category === filter;
      card.classList.toggle('hidden-card', !match);

      // 3) حركة ظهور ناعمة للبطاقات المعروضة
      if (match) {
        card.classList.remove('pop');
        void card.offsetWidth; // إعادة تشغيل الأنيميشن
        card.classList.add('pop');
      }
    });
  });
});