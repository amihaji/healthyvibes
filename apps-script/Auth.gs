// Kunci acak 32 byte dibuat pemilik di perangkatnya, bukan Math.random atau UUID.
function securityKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('SECURITY_KEY');
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error('Kunci keamanan belum disiapkan oleh pemilik.');
  }
  return key;
}

// Membentuk byte tak tertebak dari kunci rahasia dan penghitung persisten.
function secureBytes_(length) {
  const props = PropertiesService.getScriptProperties();
  const count = Number(props.getProperty('RANDOM_COUNTER') || 0) + 1;
  props.setProperty('RANDOM_COUNTER', String(count));
  const bytes = Utilities.computeHmacSha256Signature(
    'hv-random-v1|' + count + '|' + id_(),
    securityKey_()
  ).map(function (byte) { return byte & 255; });
  if (length > bytes.length) {
    throw new Error('Permintaan byte keamanan terlalu panjang.');
  }
  return bytes.slice(0, length);
}

function token_() {
  return Utilities.base64EncodeWebSafe(secureBytes_(32)).replace(/=+$/, '');
}

// Database hanya menyimpan hash token. Token asli tidak dicatat di log.
function digest_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  ).map(function (byte) {
    return ('0' + (byte & 255).toString(16)).slice(-2);
  }).join('');
}

// Perbandingan digest tidak berhenti pada karakter pertama yang berbeda.
function equal_(left, right) {
  left = String(left);
  right = String(right);
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

// Nama login dipakai dengan aturan yang sama saat setup, login dan edit pengguna.
function username_(value) {
  const username = text_(value, 'Username', 60).toLowerCase();
  if (username.length < 6) {
    throw new Error('Username minimal 6 karakter.');
  }
  return username;
}

// Password minimal 6 karakter; batas 72 byte mencegah pemotongan oleh bcrypt.
function password_(value) {
  const password = String(value || '');
  const size = Utilities.newBlob(password).getBytes().length;
  if (password.length < 6 || size > 72) {
    throw new Error('Password minimal 6 karakter dan maksimal 72 byte.');
  }
  return password;
}

function bcrypt_() {
  const library = dcodeIO.bcrypt;
  library.setRandomFallback(secureBytes_);
  return library;
}

// Fungsi setup tanpa _ dapat dipilih di editor, bukan endpoint pelanggan.
function verifyAuthRuntime() {
  requireSetupAccess_();
  const result = verifyAuthRuntime_();
  console.info('Uji login lulus dalam ' + result.milliseconds + ' ms.');
  return result;
}

function createFirstAdmin() {
  requireSetupAccess_();
  const result = createFirstAdmin_();
  console.info(result);
  return result;
}

// Membuktikan bcrypt tersedia dan cukup cepat pada runtime Google.
function verifyAuthRuntime_() {
  return withLock_(function () {
    securityKey_();
    const start = Date.now();
    const hash = bcrypt_().hashSync('Uji-runtime-bukan-akun-123', 12);
    const valid = bcrypt_().compareSync('Uji-runtime-bukan-akun-123', hash);
    const invalid = bcrypt_().compareSync('Password-yang-salah', hash);
    const milliseconds = Date.now() - start;

    if (!valid || invalid || milliseconds > 30000) {
      throw new Error('Uji bcrypt gagal atau terlalu lambat. Login tetap ditutup.');
    }
    PropertiesService.getScriptProperties()
      .setProperty('AUTH_RUNTIME_VERIFIED', 'true');
    return { passed: true, milliseconds: milliseconds };
  });
}

// Admin pertama dibuat dari properti sementara, tidak lewat endpoint publik.
function createFirstAdmin_() {
  return withLock_(function () {
    requireAuthRuntime_();
    if (rows_('Users').length) {
      throw new Error('Akun sudah ada. Gunakan Setup User.');
    }
    const props = PropertiesService.getScriptProperties();
    const username = username_(props.getProperty('INITIAL_ADMIN_USERNAME'));
    const password = password_(props.getProperty('INITIAL_ADMIN_PASSWORD'));
    append_('Users', {
      id: id_(),
      username: username,
      name: 'Admin Healthy Vibes',
      passwordHash: bcrypt_().hashSync(password, 12),
      role: 'Admin',
      active: true,
      mustChangePassword: true,
      version: 1,
      updatedAt: now_()
    });
    SpreadsheetApp.flush();
    props.deleteProperty('INITIAL_ADMIN_PASSWORD');
    props.deleteProperty('INITIAL_ADMIN_USERNAME');
    return 'Admin dibuat; password sementara dihapus dari Script Properties.';
  });
}

function requireAuthRuntime_() {
  securityKey_();
  if (PropertiesService.getScriptProperties()
    .getProperty('AUTH_RUNTIME_VERIFIED') !== 'true') {
    throw new Error('Login belum lulus uji runtime pemilik.');
  }
}

// Membatasi percobaan per akun dan secara global pada jendela satu menit.
function login_(data) {
  requireAuthRuntime_();
  const username = username_(data.username);
  const cache = CacheService.getScriptCache();
  const keys = ['login-global', 'login-' + digest_(username)];
  keys.forEach(function (key, index) {
    const attempts = Number(cache.get(key) || 0);
    if (attempts >= (index ? 5 : 30)) {
      throw new Error('Terlalu banyak percobaan. Tunggu satu menit.');
    }
    cache.put(key, String(attempts + 1), 60);
  });

  const user = rows_('Users').find(function (row) {
    return row.username === username && active_(row.active);
  });
  // Hash dummy mengurangi perbedaan waktu akun ada dan tidak ada.
  const dummy = '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
  const supplied = String(data.password || '');
  if (user && user.blockedAt) { throw new Error('Akun diblokir. Gunakan Lupa Password.'); }
  const valid = Utilities.newBlob(supplied).getBytes().length <= 72 &&
    bcrypt_().compareSync(supplied, user ? user.passwordHash : dummy);
  if (!user || !valid) {
    if (user) {
      const failures = Number(user.failedAttempts || 0) + 1;
      const changes = { failedAttempts: failures, updatedAt: now_() };
      if (failures >= 3) {
        changes.blockedAt = now_();
        changes.version = Number(user.version) + 1;
      }
      patch_('Users', user, changes);
      if (failures >= 3) {
        audit_({ id: 'SYSTEM' }, 'LOGIN_BLOCKED', user.id, 'Tiga kesalahan password.');
        throw new Error('Akun diblokir. Gunakan Lupa Password.');
      }
    }
    throw new Error('Username atau password salah.');
  }

  const loginChanges = { failedAttempts: 0, lastLoginAt: now_() };
  patch_('Users', user, loginChanges);
  Object.assign(user, loginChanges);
  const settings = settings_();
  const token = token_();
  append_('Sessions', {
    id: id_(),
    tokenHash: digest_(token),
    userId: user.id,
    version: user.version,
    createdAt: now_(),
    lastSeenAt: now_(),
    expiresAt: new Date(
      Date.now() + Number(settings.sessionMaxHours) * 3600000
    ).toISOString(),
    revoked: false
  });
  return { token: token, user: userView_(user) };
}

function userView_(user) {
  const result = publicRecord_(user, ['id', 'username', 'name', 'role']);
  result.mustChangePassword = active_(user.mustChangePassword);
  result.permissions = userMenus_(user);
  result.email = user.email || '';
  result.phone = user.phone || '';
  result.failedAttempts = Number(user.failedAttempts || 0);
  result.blocked = !!user.blockedAt;
  result.lastLoginAt = user.lastLoginAt || '';
  return result;
}

// Memeriksa status akun dan versi izin setiap request, bukan hanya saat login.
function authorize_(token, roles, allowPasswordChange) {
  requireAuthRuntime_();
  const hash = digest_(text_(token, 'Sesi', 100));
  const session = rows_('Sessions').find(function (row) {
    return equal_(row.tokenHash, hash);
  });
  const user = session && rows_('Users').find(function (row) {
    return row.id === session.userId;
  });
  const idle = Number(settings_().sessionIdleMinutes) * 60000;
  if (
    !session || !user || active_(session.revoked) || !active_(user.active) || user.blockedAt ||
    Number(session.version) !== Number(user.version) ||
    Date.parse(session.expiresAt) <= Date.now() ||
    Date.parse(session.lastSeenAt) + idle <= Date.now()
  ) {
    throw new Error('Sesi berakhir. Silakan login kembali.');
  }
  if (roles.indexOf(user.role) < 0) {
    throw new Error('Level akun tidak diizinkan untuk tindakan ini.');
  }
  if (active_(user.mustChangePassword) && !allowPasswordChange) {
    throw new Error('Ganti password sementara sebelum menggunakan aplikasi.');
  }
  patch_('Sessions', session, { lastSeenAt: now_() });
  return user;
}

function logout_(token) {
  const hash = digest_(token);
  const session = rows_('Sessions').find(function (row) {
    return equal_(row.tokenHash, hash);
  });
  if (session) {
    patch_('Sessions', session, { revoked: true });
  }
  return true;
}

// Pergantian password mencabut seluruh sesi lewat peningkatan versi akun.
function changePassword_(user, data) {
  if (!bcrypt_().compareSync(String(data.currentPassword || ''), user.passwordHash)) {
    throw new Error('Password saat ini salah.');
  }
  patch_('Users', user, {
    passwordHash: bcrypt_().hashSync(password_(data.newPassword), 12),
    mustChangePassword: false,
    version: Number(user.version) + 1,
    updatedAt: now_()
  });
  audit_(user, 'CHANGE_PASSWORD', user.id, 'Seluruh sesi dicabut.');
  return true;
}
