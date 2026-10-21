/* =========================================================
   content-config.js — إعدادات الصور المحلية (مجانية، بدون Firebase Storage)
   =========================================================
   طريقة إضافة صورة جديدة:
   1) انسخ ملف الصورة إلى المجلد المناسب داخل المشروع:
        assets/images/announcements/   ← صور الإعلانات
        assets/images/gallery/         ← صور المعرض الرقمي
   2) (اختياري) أضف اسم الملف إلى القائمة LOCAL_IMAGE_LIBRARY أدناه ليظهر
      كاقتراح تلقائي أثناء الكتابة في لوحة الإدارة.
   3) في لوحة الإدارة اكتب "اسم الملف فقط" (مثال: announcement-001.jpg)
      في خانة «اسم ملف الصورة» — ستخبرك الخانة فوراً إن كان الملف موجوداً أم لا.
   4) ارفع تعديلات المشروع (بما فيها الصورة) إلى GitHub، فتظهر بنفس التنسيق الموحّد.
   لا تحتاج إلى تعديل أي كود أو CSS عند إضافة صورة جديدة.

   ⚠️ GitHub Pages حسّاس لحالة الأحرف: Photo.JPG ≠ photo.jpg. اكتب الاسم تماماً كما هو.
   ========================================================= */

// مجلدات الصور — مسارات نسبية متوافقة مع GitHub Pages (المشروع منشور تحت /scout-elwihda/)
// ⚠️ اكتب هنا "اسم المجلد" فقط، وليس اسم ملف صورة. إن كانت صورك في مجلد آخر (مثل Photos/)
// عدّل هذين السطرين فقط. (أي قيمة تنتهي بـ .png/.jpg تُعتبر خطأً وتُتجاهل تلقائياً.)
const LOCAL_IMAGE_FOLDERS = {
  announcements: 'assets/images/announcements/',
  gallery: 'assets/images/gallery/'
};

// المجلدات الافتراضية الاحتياطية (لا تعدّلها)
const LOCAL_IMAGE_DEFAULT_FOLDERS = {
  announcements: 'assets/images/announcements/',
  gallery: 'assets/images/gallery/'
};

// قائمة اختيارية بأسماء الملفات المتوفرة (اقتراحات تلقائية فقط — ليست شرطاً لظهور الصورة).
// مثال: announcements: ['announcement-001.jpg', 'announcement-002.png']
const LOCAL_IMAGE_LIBRARY = {
  announcements: [],
  gallery: []
};

const LOCAL_IMAGE_EXT_PATTERN = /\.(jpg|jpeg|png|webp|gif)$/i;
// اسم الملف المسموح: حروف/أرقام/نقطة/شرطة فقط + امتداد صورة (حماية من مسارات خبيثة أو روابط خارجية).
const LOCAL_IMAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.(jpg|jpeg|png|webp|gif)$/i;

// يرجع مسار مجلد صالح ينتهي بشرطة مائلة واحدة. إن كان الإعداد خاطئاً (مثلاً اسم ملف بدل مجلد
// — وهو سبب الرابط المكرر .../announcements-10.png/announcements-10.png) يعود للمجلد الافتراضي.
function getImageFolder(kind) {
  const fallback = LOCAL_IMAGE_DEFAULT_FOLDERS[kind] || '';
  let folder = LOCAL_IMAGE_FOLDERS[kind];
  if (typeof folder !== 'string' || !folder.trim()) return fallback;

  folder = folder.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const invalid = !folder || LOCAL_IMAGE_EXT_PATTERN.test(folder) || folder.indexOf('..') !== -1 || /^[a-z][a-z0-9+.-]*:/i.test(folder);
  if (invalid) {
    console.error('[content-config] LOCAL_IMAGE_FOLDERS.' + kind + ' يجب أن يكون "مجلداً" وليس اسم ملف أو رابطاً: ' + LOCAL_IMAGE_FOLDERS[kind] + ' — تم استخدام المجلد الافتراضي: ' + fallback);
    return fallback;
  }
  return folder + '/';
}

// ينظّف اسم الملف المكتوب من الأدمن ويرجع '' إن كان غير صالح.
// يقبل أيضاً المسار الكامل داخل المجلد المعتمد (assets/images/gallery/x.jpg) ويختصره إلى x.jpg
// حتى لا يتكرر اسم الملف أو المجلد في الرابط النهائي.
function cleanLocalImageFileName(rawName, kind) {
  let name = (rawName || '').trim().replace(/\\/g, '/');
  if (!name) return '';
  if (name.indexOf('/') !== -1) {
    const folder = kind ? getImageFolder(kind) : '';
    const normalized = name.replace(/^\.\//, '').replace(/^\//, '');
    if (folder && normalized.indexOf(folder) === 0 && normalized.slice(folder.length).indexOf('/') === -1) {
      name = normalized.slice(folder.length);
    } else {
      return '';
    }
  }
  if (name.indexOf('..') !== -1) return '';
  return LOCAL_IMAGE_NAME_PATTERN.test(name) ? name : '';
}

// يبني المسار الكامل للصورة (مجلد + اسم الملف مرة واحدة فقط)، أو '' إن لم يكن هناك اسم صالح
function resolveLocalImagePath(kind, fileName) {
  const folder = getImageFolder(kind);
  const clean = cleanLocalImageFileName(fileName, kind);
  return (folder && clean) ? folder + clean : '';
}