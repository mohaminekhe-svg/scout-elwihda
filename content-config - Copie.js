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
   4) ارفع تعديلات المشروع (بما فيها الصورة) إلى استضافة cPanel (s4a.solution4all.dz)، فتظهر بنفس التنسيق الموحّد.
   لا تحتاج إلى تعديل أي كود أو CSS عند إضافة صورة جديدة.

   ⚠️ خادم الاستضافة (Linux/cPanel) حسّاس لحالة الأحرف: Photo.JPG ≠ photo.jpg. اكتب الاسم تماماً كما هو.
   ========================================================= */

// مجلدات الصور — مسارات نسبية متوافقة مع الاستضافة (https://s4a.solution4all.dz/)
// ⚠️ اكتب هنا "اسم المجلد" فقط، وليس اسم ملف صورة. إن كانت صورك في مجلد آخر (مثل Photos/)
// عدّل هذين السطرين فقط. (أي قيمة تنتهي بـ .png/.jpg تُعتبر خطأً وتُتجاهل تلقائياً.)
const LOCAL_IMAGE_FOLDERS = {
  announcements: 'assets/images/announcements/',
  gallery: 'assets/images/gallery/',
  units: 'assets/images/units/',
  activities: 'assets/images/activities/'
};

// المجلدات الافتراضية الاحتياطية (لا تعدّلها)
const LOCAL_IMAGE_DEFAULT_FOLDERS = {
  announcements: 'assets/images/announcements/',
  gallery: 'assets/images/gallery/',
  units: 'assets/images/units/',
  activities: 'assets/images/activities/'
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

/* =========================================================
   إعدادات ودوال Google Drive (التخزين السحابي الرئيسي للصور)
   - يمكن ضبط الإعدادات مباشرة من لوحة الإدارة (تبويب الإعدادات ← إعدادات Google Drive)
     حيث تُحفظ في Firestore (settings/googleDrive).
   - القيم أدناه احتياطية افتراضية إن لم تُضبط بعد من لوحة الإدارة.
   ========================================================= */
const GOOGLE_DRIVE_DEFAULT_CONFIG = {
  enabled: true,
  webAppUrl: '',              // رابط Google Apps Script Web App (يُضبط من لوحة الأدمن)
  rootFolderId: '',           // معرّف أو رابط المجلد الرئيسي في Google Drive (اختياري)
  announcementsFolderId: '',  // معرّف أو رابط مجلد صور الإعلانات (اختياري)
  galleryFolderId: '',        // معرّف أو رابط مجلد صور المعرض (اختياري)
  secretToken: ''             // رمز حماية اختياري بين الموقع والسكربت
};

// يستخرج معرّف ملف Google Drive من أي رابط مشاركة أو رابط مباشر أو معرّف خام
function extractGoogleDriveFileId(input) {
  if (typeof input !== 'string') return '';
  const str = input.trim();
  if (!str) return '';

  // أنماط روابط Google Drive الشائعة:
  // 1) https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // 2) https://drive.google.com/open?id=FILE_ID
  // 3) https://drive.google.com/uc?id=FILE_ID أو ?export=view&id=FILE_ID
  // 4) https://drive.google.com/thumbnail?id=FILE_ID&sz=w1600
  // 5) https://lh3.googleusercontent.com/d/FILE_ID=w1600
  const fileDMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/);
  if (fileDMatch) return fileDMatch[1];

  const lh3Match = str.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{15,})/);
  if (lh3Match) return lh3Match[1];

  const idParamMatch = str.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (idParamMatch && (str.indexOf('drive.google.com') !== -1 || str.indexOf('docs.google.com') !== -1)) {
    return idParamMatch[1];
  }

  // معرّف Google Drive خام (بدون نقاط امتداد ملفات مثل .jpg وبطول 25-60 حرفاً)
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(str) && !LOCAL_IMAGE_EXT_PATTERN.test(str)) {
    return str;
  }

  return '';
}

// يستخرج معرّف مجلد Google Drive من رابط مجلد (.../folders/FOLDER_ID) أو معرّف خام
function extractGoogleDriveFolderId(input) {
  if (typeof input !== 'string') return '';
  const str = input.trim();
  if (!str) return '';

  const folderMatch = str.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
  if (folderMatch) return folderMatch[1];

  const idParamMatch = str.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (idParamMatch) return idParamMatch[1];

  if (/^[a-zA-Z0-9_-]{18,60}$/.test(str)) return str;
  return '';
}

// يبني رابط عرض سريع وموثوق للصورة من Google Drive عبر شبكة CDN الخاصة بجوجل
function buildGoogleDriveImageUrl(fileId, maxWidth) {
  const cleanId = extractGoogleDriveFileId(fileId);
  if (!cleanId) return '';
  const w = Number(maxWidth) > 0 ? Number(maxWidth) : 1600;
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(cleanId) + '&sz=w' + w;
}

// رابط بديل احتياطي من Google CDN في حال تعذّر الرابط الأول على بعض المتصفحات
function buildGoogleDriveFallbackUrl(fileId, maxWidth) {
  const cleanId = extractGoogleDriveFileId(fileId);
  if (!cleanId) return '';
  const w = Number(maxWidth) > 0 ? Number(maxWidth) : 1600;
  return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(cleanId) + '=w' + w;
}

// رابط تحميل مباشر للصورة من Google Drive
function buildGoogleDriveDownloadUrl(fileId) {
  const cleanId = extractGoogleDriveFileId(fileId);
  if (!cleanId) return '';
  return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(cleanId);
}

// يحلّل أي مدخل صورة (رابط Google Drive، أو معرّف Drive، أو رابط https مباشر، أو اسم ملف محلي)
function resolveImageInputSource(rawInput, kind) {
  const raw = (rawInput || '').trim();
  if (!raw) return { type: 'none', path: '', driveFileId: '', imageFile: '', imageUrl: '' };

  // 1) هل هو رابط أو معرّف Google Drive؟
  const driveId = extractGoogleDriveFileId(raw);
  if (driveId) {
    const url = buildGoogleDriveImageUrl(driveId, 1600);
    return {
      type: 'gdrive',
      path: url,
      driveFileId: driveId,
      imageFile: '',
      imageUrl: url
    };
  }

  // 2) هل هو رابط https خارجي مباشر؟
  if (/^https:\/\/[^\s"'<>]+$/i.test(raw)) {
    return {
      type: 'url',
      path: raw,
      driveFileId: '',
      imageFile: '',
      imageUrl: raw
    };
  }

  // 3) هل هو اسم ملف محلي داخل مجلدات المشروع؟
  const cleanLocal = cleanLocalImageFileName(raw, kind);
  if (cleanLocal) {
    return {
      type: 'local',
      path: resolveLocalImagePath(kind, cleanLocal),
      driveFileId: '',
      imageFile: cleanLocal,
      imageUrl: ''
    };
  }

  return { type: 'invalid', path: '', driveFileId: '', imageFile: '', imageUrl: '' };
}

/* =========================================================
   إحصائيات صفحة «التعريف بالفوج» — عدّل القيم من هنا فقط.
   confirmed:false  => تظهر ملاحظة «قيد التأكيد» أسفل الأرقام في الصفحة.
   بعد التحقق من الرقم غيّر confirmed إلى true وستختفي الملاحظة (إن صارت كلها true).
   ⚠️ سنة التأسيس: نص الموقع الحالي يذكر أن النواة الأولى سنة 1993 (والتوسع 1996، والمقر 2004)،
   بينما ذُكرت 1963 في طلب التطوير. اعتُمدت 1993 لأنها الموجودة في بيانات المشروع؛ عدّلها بعد التأكد.
   ========================================================= */
const ABOUT_STATS = [
  { key: 'members', value: 150, suffix: '+', label: 'كشاف ومشارك', confirmed: false },
  { key: 'camps', value: 300, suffix: '+', label: 'مخيم ونشاط ميداني', confirmed: false },
  { key: 'founded', value: 1993, suffix: '', label: 'سنة التأسيس', confirmed: false, plain: true }
];
// بطاقة نصية رابعة (ليست رقماً)
const ABOUT_GOALS_TEXT = 'التربية والقيادة والمغامرة والخدمة';
