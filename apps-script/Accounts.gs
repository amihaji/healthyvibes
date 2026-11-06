// Menu Healthy Vibes memakai ID yang sama di backend dan frontend.
const HV_ACCOUNT_MENUS = [
  'Dashboard', 'Pesanan', 'Categories', 'Products', 'ReadyStock', 'PreorderCapacity',
  'Discounts', 'Vouchers', 'Users', 'ServiceHours', 'ServiceAreas', 'ShippingRates',
  'Pengaturan', 'Backup', 'Laporan'
];

// Akun lama mempertahankan hak semula sampai Admin mengedit centangnya.
function userMenus_(user) {
  if (!user || user.role === 'Konsumen') { return []; }
  if (user.permissionsJson) {
    const list = JSON.parse(user.permissionsJson);
    if (!Array.isArray(list) || list.some(function (page) { return !HV_ACCOUNT_MENUS.includes(page); })) {
      throw new Error('Hak akses akun tidak valid.');
    }
    return HV_ACCOUNT_MENUS.filter(function (page) { return list.includes(page); });
  }
  return user.role === 'Admin' ? HV_ACCOUNT_MENUS.slice() : user.role === 'Operator'
    ? ['Dashboard', 'Pesanan', 'Categories', 'Products', 'ReadyStock', 'PreorderCapacity', 'Laporan']
    : user.role === 'Viewer' ? ['Dashboard', 'Laporan'] : [];
}

// Centang menentukan akses menu; Viewer hanya membaca, Setup User dikelola Admin.
function requireMenu_(user, page, write) {
  if (!userMenus_(user).includes(page) ||
    (write && !['Admin', 'Operator'].includes(user.role)) ||
    (write && page === 'Users' && user.role !== 'Admin')) {
    throw new Error('Anda tidak berwenang: hak akses menu tidak diizinkan.');
  }
}

function accountContact_(input, old) {
  const email = text_(input.email || '', 'Email', 254, true).toLowerCase();
  let phone = text_(input.phone || '', 'Nomor WhatsApp', 20, true).replace(/[ +()-]/g, '');
  if (phone.startsWith('0')) { phone = '62' + phone.slice(1); }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { throw new Error('Email tidak valid.'); }
  if (phone && !/^62[0-9]{8,13}$/.test(phone)) { throw new Error('Nomor WhatsApp tidak valid.'); }
  if (!email && !phone) { throw new Error('Isi Email atau WhatsApp untuk pemulihan password.'); }
  const permissions = input.permissions;
  if (!Array.isArray(permissions) || permissions.some(function (page) { return !HV_ACCOUNT_MENUS.includes(page); })) {
    throw new Error('Daftar hak akses tidak valid.');
  }
  if (input.role !== 'Konsumen' && !permissions.length) { throw new Error('Centang sedikitnya satu menu.'); }
  return { email: email, phone: phone,
    permissionsJson: JSON.stringify(input.role === 'Konsumen' ? [] :
      HV_ACCOUNT_MENUS.filter(function (page) { return permissions.includes(page); })),
    failedAttempts: old ? Number(old.failedAttempts || 0) : 0,
    blockedAt: old ? old.blockedAt || '' : '', lastLoginAt: old ? old.lastLoginAt || '' : '' };
}

// Pemulihan pemilik tetap tersedia jika Admin terakhir terkunci sebelum email terisi.
function unlockHealthyVibesAdmin() {
  requireSetupAccess_();
  return withLock_(function () {
    const name = username_(PropertiesService.getScriptProperties().getProperty('INITIAL_ADMIN_USERNAME'));
    const user = rows_('Users').find(function (row) { return row.username === name && row.role === 'Admin'; });
    if (!user) { throw new Error('Username Admin tidak ditemukan.'); }
    patch_('Users', user, { failedAttempts: 0, blockedAt: '', version: Number(user.version) + 1, updatedAt: now_() });
    CacheService.getScriptCache().remove('login-' + digest_(user.username));
    PropertiesService.getScriptProperties().deleteProperty('INITIAL_ADMIN_USERNAME');
    return 'Blokir Admin dibuka. Password tidak diubah.';
  });
}

// Reset publik memberikan jawaban sama untuk akun ada/tidak ada.
function requestPasswordReset_(data) {
  requireAuthRuntime_();
  const username = username_(data.username);
  const channel = data.channel;
  if (!['email', 'whatsapp'].includes(channel)) { throw new Error('Pilih Email atau WhatsApp.'); }
  const cache = CacheService.getScriptCache();
  const key = 'password-reset-' + digest_(username);
  const globalKey = 'password-reset-global';
  const attempts = Number(cache.get(globalKey) || 0);
  if (cache.get(key) || attempts >= 10) { return { accepted: true }; }
  cache.put(key, '1', 60);
  cache.put(globalKey, String(attempts + 1), 60);
  const user = rows_('Users').find(function (row) { return row.username === username && active_(row.active); });
  if (user) {
    try { sendPasswordReset_(user, channel); }
    catch (error) {
      // Pesan provider dapat berisi tautan rahasia; jangan simpan error mentah.
      audit_({ id: 'SYSTEM' }, 'PASSWORD_RESET_DELIVERY_FAILED', user.id, channel);
    }
  }
  return { accepted: true };
}

// Tautan hanya dikirim ke kontak tersimpan; token asli tidak masuk Sheet/log/respons publik.
function sendPasswordReset_(user, channel) {
  if (!['email', 'whatsapp'].includes(channel)) { throw new Error('Pilih Email atau WhatsApp.'); }
  if (!active_(user.active)) { throw new Error('Akun tidak aktif.'); }
  const destination = channel === 'email' ? user.email : user.phone;
  if (!destination) { throw new Error('Kontak ' + channel + ' belum terdaftar.'); }
  const props = PropertiesService.getScriptProperties();
  const appUrl = props.getProperty('PUBLIC_APP_URL') || 'https://amihaji.github.io/healthyvibes/';
  if (!/^https:\/\/[a-z0-9.-]+(?:\/[^?#\s]*)?$/i.test(appUrl) ||
    !frontendOrigins_().includes(appUrl.match(/^https:\/\/[^/]+/)[0])) {
    throw new Error('PUBLIC_APP_URL harus memakai alamat website yang diizinkan.');
  }
  const key = channel === 'whatsapp' && props.getProperty('FONNTE_TOKEN');
  if (channel === 'whatsapp' && !key) { throw new Error('FONNTE_TOKEN belum diatur di Script Properties.'); }
  const token = token_();
  const reset = append_('PasswordResets', {
    id: id_(), userId: user.id, tokenHash: digest_(token), channel: channel,
    createdAt: now_(), expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    usedAt: '', version: Number(user.version)
  });
  const message = 'Healthy Vibes\nReset password: ' + appUrl + '#reset=' + encodeURIComponent(token) +
    '\nBerlaku 15 menit, sekali pakai. Abaikan jika bukan permintaan Anda.';
  try {
    if (channel === 'email') {
      MailApp.sendEmail({ to: destination, subject: 'Reset Password Healthy Vibes', body: message });
    } else {
      const response = UrlFetchApp.fetch('https://api.fonnte.com/send', {
        method: 'post', headers: { Authorization: key },
        payload: { target: destination, message: message, countryCode: '62' },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() !== 200 || JSON.parse(response.getContentText()).status !== true) {
        throw new Error('Pengiriman WhatsApp gagal.');
      }
    }
  } catch (error) {
    patch_('PasswordResets', reset, { usedAt: now_() });
    throw new Error('Tautan reset belum dapat dikirim. Periksa konfigurasi pengiriman.');
  }
  audit_({ id: 'SYSTEM' }, 'PASSWORD_RESET_SENT', user.id, channel);
  return { accepted: true };
}

// Token reset memerlukan hash, batas waktu, dan versi akun yang masih sama.
function completePasswordReset_(data) {
  requireAuthRuntime_();
  const token = text_(data.resetToken, 'Tautan reset', 100);
  const hash = digest_(token);
  const reset = rows_('PasswordResets').find(function (row) { return equal_(row.tokenHash, hash); });
  const user = reset && rows_('Users').find(function (row) { return row.id === reset.userId; });
  if (!reset || !user || !active_(user.active) || reset.usedAt ||
    !Number.isFinite(Date.parse(reset.expiresAt)) || Date.parse(reset.expiresAt) <= Date.now() ||
    Number(reset.version) !== Number(user.version)) {
    throw new Error('Tautan tidak valid atau kedaluwarsa. Minta tautan baru.');
  }
  const passwordHash = bcrypt_().hashSync(password_(data.newPassword), 12);
  // Cabut token lebih dahulu; jika penulisan akun gagal, pengguna meminta tautan baru.
  patch_('PasswordResets', reset, { usedAt: now_() });
  patch_('Users', user, { passwordHash: passwordHash, failedAttempts: 0, blockedAt: '',
    mustChangePassword: false, version: Number(user.version) + 1, updatedAt: now_() });
  // Akun yang sudah pulih tidak tertahan hitungan percobaan login sebelumnya.
  CacheService.getScriptCache().remove('login-' + digest_(user.username));
  audit_({ id: user.id }, 'PASSWORD_RESET_COMPLETED', user.id, 'Seluruh sesi dicabut.');
  return { completed: true };
}

// Kolom akun ditambahkan di kanan tanpa memindah atau menimpa data lama.
function extendAccountSchema_(db) {
  const sheet = db.getSheetByName('Users');
  if (!sheet || !sheet.getLastRow()) { return; }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const expected = HV_SCHEMA.Users;
  if (headers.length > expected.length || headers.some(function (key, index) { return key !== expected[index]; })) {
    throw new Error('Kolom Users berbeda. Migrasi dihentikan tanpa menimpa data.');
  }
  if (sheet.getMaxColumns() < expected.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), expected.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
}
