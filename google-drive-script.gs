/**
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
