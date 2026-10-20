/* =========================================================
   content-config.js — إعدادات الصور المحلية (مجانية، بدون Firebase Storage)
   =========================================================
   طريقة إضافة صورة جديدة:
   1) انسخ ملف الصورة إلى المجلد المناسب داخل المشروع على حاسوبك:
        assets/images/announcements/   ← صور الإعلانات
        assets/images/gallery/         ← صور المعرض الرقمي
   2) في لوحة الإدارة، عند إنشاء الإعلان/عنصر المعرض، اكتب "اسم الملف فقط"
      (مثال: announcement-001.jpg) في خانة «اسم ملف الصورة».
   3) ارفع تعديلات المشروع (بما فيها الصورة) إلى GitHub، فتظهر الصورة تلقائياً.
   لا تحتاج إلى تعديل أي كود عند إضافة صورة جديدة.
   ========================================================= */

// مجلدات الصور — مسارات نسبية متوافقة مع GitHub Pages (لا تستخدم مسارات الحاسوب مثل C:\...)
// إن أردت تغيير مكان المجلدات مستقبلاً، عدّل هذين السطرين فقط:
const LOCAL_IMAGE_FOLDERS = {
  announcements: 'assets/images/announcements/',
  gallery: 'assets/images/gallery/'
};

// اسم الملف المسموح: حروف/أرقام/نقطة/شرطة فقط + امتداد صورة. لا يُسمح بأي "/" أو ".."
// (حماية من مسارات خبيثة مثل ../../ أو روابط خارجية).
const LOCAL_IMAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.(jpg|jpeg|png|webp|gif)$/i;

// ينظّف اسم الملف المكتوب من الأدمن. يرجع '' إن كان غير صالح.
function cleanLocalImageFileName(rawName) {
  const name = (rawName || '').trim();
  if (!name) return '';
  if (name.indexOf('..') !== -1) return '';
  return LOCAL_IMAGE_NAME_PATTERN.test(name) ? name : '';
}

// يبني المسار الكامل للصورة، أو '' إن لم يكن هناك اسم صالح
function resolveLocalImagePath(kind, fileName) {
  const folder = LOCAL_IMAGE_FOLDERS[kind];
  const clean = cleanLocalImageFileName(fileName);
  return (folder && clean) ? folder + clean : '';
}
