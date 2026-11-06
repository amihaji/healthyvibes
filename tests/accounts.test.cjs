'use strict';

// Akun, email dan WhatsApp ditiru di memori; tidak menyentuh layanan produksi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function accountFixture() {
  const tables = { Users: [], Sessions: [], PasswordResets: [] };
  const properties = new Map([['FONNTE_TOKEN', 'provider-test-only']]);
  const cache = new Map();
  const deliveries = [];
  const audits = [];
  let serial = 0;
  const context = vm.createContext({
    Date, console,
    Utilities: { newBlob: text => ({ getBytes: () => Array.from(Buffer.from(text)) }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) || '',
      deleteProperty: key => properties.delete(key)
    }) },
    CacheService: { getScriptCache: () => ({
      get: key => cache.get(key) || null, put: (key, value) => cache.set(key, value),
      remove: key => cache.delete(key)
    }) },
    MailApp: { sendEmail: data => deliveries.push({ channel: 'email', ...data }) },
    UrlFetchApp: { fetch: (url, options) => {
      deliveries.push({ channel: 'whatsapp', url, ...options });
      return { getResponseCode: () => 200, getContentText: () => '{"status":true}' };
    } }
  });
  for (const file of ['Store.gs', 'Schema.gs', 'Auth.gs', 'Accounts.gs', 'Api.gs', 'Admin.gs']) {
    vm.runInContext(source('apps-script/' + file), context);
  }
  context.requireAuthRuntime_ = () => {};
  context.withLock_ = operation => operation();
  context.now_ = () => new Date().toISOString();
  context.id_ = () => 'id-' + (++serial);
  context.token_ = () => crypto.randomBytes(32).toString('base64url');
  context.digest_ = value => crypto.createHash('sha256').update(String(value)).digest('hex');
  // bcrypt sudah diuji terpisah; tiruan ini hanya memeriksa alur perubahan akun.
  context.bcrypt_ = () => ({
    hashSync: value => 'test-hash:' + value,
    compareSync: (value, hash) => hash === 'test-hash:' + value
  });
  context.rows_ = name => (tables[name] || []);
  context.patch_ = (name, row, changes) => Object.assign(row, changes);
  context.append_ = (name, record) => {
    const row = { ...record };
    (tables[name] ||= []).push(row);
    return row;
  };
  context.audit_ = (...args) => audits.push(args);
  context.settings_ = () => ({ sessionMaxHours: 8, sessionIdleMinutes: 30 });
  const user = {
    id: 'user1', username: 'operator1', name: 'Operator Uji', role: 'Operator',
    active: true, version: 1, passwordHash: 'test-hash:benar123',
    email: 'operator@example.test', phone: '628123456789',
    permissionsJson: '["Dashboard","Products","Backup","Pesanan"]',
    failedAttempts: 0, blockedAt: ''
  };
  tables.Users.push(user);
  return { context, tables, properties, cache, deliveries, audits, user };
}

test('Centang menu mengizinkan Operator dan menolak menu lain di backend', () => {
  const { context, user } = accountFixture();
  for (const page of ['Products', 'Backup', 'Pesanan']) {
    assert.doesNotThrow(() => context.requireMenu_(user, page, true));
  }
  for (const page of ['Users', 'Pengaturan', 'Sessions']) {
    assert.throws(() => context.requireMenu_(user, page, false), /tidak diizinkan/);
  }
  context.authorize_ = () => user;
  context.backup_ = () => ({ done: true });
  context.saveSettings_ = () => { throw new Error('Tidak boleh dijalankan'); };
  assert.equal(context.api_({ action: 'backup' }).ok, true);
  assert.equal(context.api_({ action: 'saveSettings', data: {} }).ok, false);
});

test('Viewer hanya membaca; Setup User hanya ditulis Admin; Konsumen tanpa Panel', () => {
  const { context, user } = accountFixture();
  user.permissionsJson = '["Products","Users","Backup"]';
  for (const role of ['Viewer', 'Operator', 'Admin', 'Konsumen']) {
    user.role = role;
    for (const page of ['Products', 'Users', 'Backup']) {
      if (role === 'Konsumen') {
        assert.throws(() => context.requireMenu_(user, page, false));
      } else {
        assert.doesNotThrow(() => context.requireMenu_(user, page, false));
      }
      if (role === 'Viewer' || role === 'Konsumen' || role === 'Operator' && page === 'Users') {
        assert.throws(() => context.requireMenu_(user, page, true));
      }
    }
  }
  assert.deepEqual(plain(context.userMenus_(user)), []);
});

test('Hak akun lama dipertahankan; JSON menu rusak ditolak', () => {
  const { context } = accountFixture();
  assert.equal(context.userMenus_({ role: 'Admin' }).length, 15);
  assert.equal(context.userMenus_({ role: 'Operator' }).includes('Users'), false);
  for (const json of ['null', '{}', '["Sessions"]', 'rusak']) {
    assert.throws(() => context.userMenus_({ role: 'Admin', permissionsJson: json }));
  }
});

test('Kontak dan centang divalidasi, nomor lokal dinormalisasi, Konsumen tanpa menu', () => {
  const { context } = accountFixture();
  const input = { role: 'Operator', permissions: ['Products', 'Products'], email: 'UJI@Example.test', phone: '0812 3456 789' };
  const result = context.accountContact_(input);
  assert.equal(result.email, 'uji@example.test');
  assert.equal(result.phone, '628123456789');
  assert.equal(result.permissionsJson, '["Products"]');
  for (const changes of [
    { email: 'salah' }, { phone: '123' }, { permissions: [] }, { permissions: ['Sessions'] },
    { permissions: null }, { email: '', phone: '' }
  ]) {
    assert.throws(() => context.accountContact_({ ...input, ...changes }));
  }
  assert.equal(context.accountContact_({ ...input, role: 'Konsumen', permissions: [] }).permissionsJson, '[]');
});

test('Buat/Edit User menjaga hash privat, menaikkan versi dan menolak level tidak valid', () => {
  const { context, tables, user } = accountFixture();
  const admin = { id: 'admin', role: 'Admin' };
  const record = { username: 'konsumen1', name: 'Konsumen', role: 'Konsumen', email: 'test@example.test',
    permissions: [], password: 'awal123' };
  const created = context.saveMaster_(admin, { table: 'Users', record });
  assert.equal(created.role, 'Konsumen');
  assert.equal(created.mustChangePassword, true);
  assert.ok(!JSON.stringify(created).includes('test-hash'));
  const stored = tables.Users.find(row => row.id === created.id);
  assert.equal(stored.version, 1);
  context.saveMaster_(admin, { table: 'Users', record: { ...record, id: created.id, password: '', name: 'Baru' } });
  assert.equal(stored.version, 2);
  assert.equal(stored.passwordHash, 'test-hash:awal123');
  assert.throws(() => context.saveMaster_(admin, {
    table: 'Users', record: { ...record, id: created.id }
  }), /Gunakan Reset/);
  assert.throws(() => context.saveMaster_(admin, {
    table: 'Users', record: { ...record, role: 'SuperAdmin' }
  }), /Level/);
  user.permissionsJson = '["Users"]';
  assert.throws(() => context.saveMaster_(user, { table: 'Users', record }), /berwenang/);
});

test('Admin terakhir tidak kehilangan centang Setup User atau bergantung Admin terblokir', () => {
  const { context, tables, user } = accountFixture();
  user.role = 'Admin';
  user.permissionsJson = '["Users","Dashboard"]';
  const record = { ...user, permissions: ['Dashboard'] };
  for (const extra of [null, { role: 'Admin', active: true, permissionsJson: '["Dashboard"]' },
    { role: 'Admin', active: true, blockedAt: 'stamp', permissionsJson: '["Users"]' }]) {
    tables.Users.length = 1;
    if (extra) { tables.Users.push({ id: 'other', ...extra }); }
    assert.throws(() => context.saveMaster_(user, { table: 'Users', record }), /Setup User/);
  }
  tables.Users.push({ id: 'usable', role: 'Admin', active: true, permissionsJson: '["Users"]' });
  assert.doesNotThrow(() => context.saveMaster_(user, { table: 'Users', record }));
});

test('Tiga password salah memblokir persisten dan mencabut sesi lama', () => {
  const { context, user, tables, audits } = accountFixture();
  const login = context.login_({ username: user.username, password: 'benar123' });
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.throws(() => context.login_({ username: user.username, password: 'salah123' }),
      attempt === 3 ? /diblokir/ : /password salah/);
    assert.equal(user.failedAttempts, attempt);
    assert.equal(!!user.blockedAt, attempt === 3);
  }
  assert.equal(user.version, 2);
  assert.equal(tables.Sessions[0].version, 1);
  assert.throws(() => context.authorize_(login.token, ['Operator']), /Sesi berakhir/);
  assert.throws(() => context.login_({ username: user.username, password: 'benar123' }), /diblokir/);
  assert.equal(audits.filter(row => row[1] === 'LOGIN_BLOCKED').length, 1);
});

test('Login sukses mereset kesalahan berturut-turut dan menyimpan jam login', () => {
  const { context, user } = accountFixture();
  for (let i = 0; i < 2; i++) {
    assert.throws(() => context.login_({ username: user.username, password: 'salah' }));
  }
  const result = context.login_({ username: user.username, password: 'benar123' });
  assert.equal(user.failedAttempts, 0);
  assert.ok(Number.isFinite(Date.parse(user.lastLoginAt)));
  assert.equal(result.user.failedAttempts, 0);
  assert.ok(!JSON.stringify(result).includes(user.passwordHash));
});

test('Username tidak ditemukan tidak memblokir akun lain; pembatasan login tetap berlaku', () => {
  const { context, user, tables } = accountFixture();
  for (let i = 0; i < 5; i++) {
    assert.throws(() => context.login_({ username: 'missing', password: 'salah' }), /password salah/);
  }
  assert.throws(() => context.login_({ username: 'missing', password: 'salah' }), /Terlalu banyak/);
  assert.equal(user.failedAttempts, 0);
  assert.equal(tables.Sessions.length, 0);
});

test('Reset email/WA memakai kontak tersimpan dan hanya hash masuk database', () => {
  for (const channel of ['email', 'whatsapp']) {
    const { context, user, deliveries, tables, audits } = accountFixture();
    const before = Date.now();
    assert.deepEqual(plain(context.requestPasswordReset_({
      username: user.username, channel, email: 'evil@example.test', phone: '628999999999'
    })), { accepted: true });
    const delivery = deliveries[0];
    assert.equal(channel === 'email' ? delivery.to : delivery.payload.target,
      channel === 'email' ? user.email : user.phone);
    const message = channel === 'email' ? delivery.body : delivery.payload.message;
    const token = message.match(/#reset=([A-Za-z0-9_-]+)/)[1];
    const reset = tables.PasswordResets[0];
    assert.equal(token.length, 43);
    assert.equal(reset.tokenHash, context.digest_(token));
    assert.ok(!JSON.stringify(tables).includes(token));
    assert.ok(!JSON.stringify(audits).includes(token));
    assert.ok(Date.parse(reset.expiresAt) >= before + 15 * 60000);
    if (channel === 'whatsapp') {
      assert.equal(delivery.url, 'https://api.fonnte.com/send');
      assert.equal(delivery.headers.Authorization, 'provider-test-only');
    }
  }
});

test('Reset publik tidak membocorkan akun/kontak serta dibatasi satu permintaan per menit', () => {
  const { context, user, deliveries } = accountFixture();
  const data = { username: user.username, channel: 'email' };
  const existing = context.requestPasswordReset_(data);
  assert.deepEqual(plain(context.requestPasswordReset_({ ...data, username: 'missing' })), plain(existing));
  assert.deepEqual(plain(context.requestPasswordReset_(data)), plain(existing));
  assert.equal(deliveries.length, 1);
});

test('Batas reset global mencegah lebih dari sepuluh permintaan per menit', () => {
  const { context, user, cache, deliveries } = accountFixture();
  for (let i = 0; i < 10; i++) {
    context.requestPasswordReset_({ username: 'missing' + i, channel: 'email' });
  }
  context.requestPasswordReset_({ username: user.username, channel: 'email' });
  assert.equal(cache.get('password-reset-global'), '10');
  assert.equal(deliveries.length, 0);
});

test('Reset gagal mengirim mencabut token; pesan provider rahasia tidak dikembalikan', () => {
  const { context, user, tables, audits } = accountFixture();
  context.MailApp.sendEmail = () => { throw new Error('RAHASIA PROVIDER'); };
  assert.deepEqual(plain(context.requestPasswordReset_({ username: user.username, channel: 'email' })), { accepted: true });
  assert.ok(tables.PasswordResets[0].usedAt);
  assert.ok(!JSON.stringify(audits).includes('RAHASIA'));
  assert.equal(audits[0][1], 'PASSWORD_RESET_DELIVERY_FAILED');
});

test('Pengiriman menolak konfigurasi WA, origin URL, kanal dan kontak tidak valid', () => {
  const { context, user, tables, properties } = accountFixture();
  properties.delete('FONNTE_TOKEN');
  assert.throws(() => context.sendPasswordReset_(user, 'whatsapp'), /FONNTE_TOKEN/);
  assert.throws(() => context.sendPasswordReset_(user, 'sms'), /Email/);
  for (const url of ['https://evil.test/', 'https://amihaji.github.io/?x=1', 'http://amihaji.github.io/']) {
    properties.set('PUBLIC_APP_URL', url);
    assert.throws(() => context.sendPasswordReset_(user, 'email'), /PUBLIC_APP_URL/);
  }
  properties.delete('PUBLIC_APP_URL');
  assert.throws(() => context.sendPasswordReset_({ ...user, email: '' }, 'email'), /belum terdaftar/);
  assert.throws(() => context.sendPasswordReset_({ ...user, active: false }, 'email'), /tidak aktif/);
  assert.equal(tables.PasswordResets.length, 0);
});

test('Respons Fonnte gagal atau rusak membuat token tidak berlaku', () => {
  for (const [code, body] of [[500, '{"status":true}'], [200, '{"status":false}'], [200, 'rusak']]) {
    const { context, user, tables } = accountFixture();
    context.UrlFetchApp.fetch = () => ({ getResponseCode: () => code, getContentText: () => body });
    assert.throws(() => context.sendPasswordReset_(user, 'whatsapp'), /belum dapat dikirim/);
    assert.ok(tables.PasswordResets[0].usedAt);
  }
});

test('Reset sekali pakai membuka blokir, mengganti password, mencabut sesi dan token lainnya', () => {
  const { context, user, tables, deliveries, cache } = accountFixture();
  const session = context.login_({ username: user.username, password: 'benar123' });
  user.blockedAt = new Date().toISOString();
  user.failedAttempts = 3;
  cache.set('login-' + context.digest_(user.username), '5');
  context.sendPasswordReset_(user, 'email');
  context.sendPasswordReset_(user, 'email');
  const token = deliveries[0].body.match(/#reset=([A-Za-z0-9_-]+)/)[1];
  const second = deliveries[1].body.match(/#reset=([A-Za-z0-9_-]+)/)[1];
  assert.deepEqual(plain(context.completePasswordReset_({ resetToken: token, newPassword: 'baru123' })), { completed: true });
  assert.equal(user.failedAttempts, 0);
  assert.equal(user.blockedAt, '');
  assert.equal(user.mustChangePassword, false);
  assert.equal(user.version, 2);
  assert.equal(user.passwordHash, 'test-hash:baru123');
  assert.ok(tables.PasswordResets[0].usedAt);
  for (const oldToken of [token, second]) {
    assert.throws(() => context.completePasswordReset_({ resetToken: oldToken, newPassword: 'lagi123' }), /tidak valid/);
  }
  assert.throws(() => context.authorize_(session.token, ['Operator']), /Sesi berakhir/);
  assert.equal(cache.has('login-' + context.digest_(user.username)), false);
  assert.doesNotThrow(() => context.login_({ username: user.username, password: 'baru123' }));
});

test('Reset menolak token asing, kedaluwarsa, versi berbeda, akun nonaktif dan password pendek', () => {
  for (const changes of [{ expiresAt: '2000-01-01' }, { expiresAt: 'rusak' }, { version: 9 }, { usedAt: 'stamp' }, {}]) {
    const { context, user, tables, deliveries } = accountFixture();
    context.sendPasswordReset_(user, 'email');
    Object.assign(tables.PasswordResets[0], changes);
    const token = deliveries[0].body.match(/#reset=([A-Za-z0-9_-]+)/)[1];
    if (!Object.keys(changes).length) { user.active = false; }
    assert.throws(() => context.completePasswordReset_({ resetToken: token, newPassword: 'baru123' }), /tidak valid/);
    assert.equal(user.passwordHash, 'test-hash:benar123');
  }
  const { context, user, tables, deliveries } = accountFixture();
  context.sendPasswordReset_(user, 'email');
  assert.throws(() => context.completePasswordReset_({ resetToken: 'asing', newPassword: 'baru123' }));
  const token = deliveries[0].body.match(/#reset=([A-Za-z0-9_-]+)/)[1];
  assert.throws(() => context.completePasswordReset_({ resetToken: token, newPassword: 'abc' }), /minimal 6/);
  assert.equal(tables.PasswordResets[0].usedAt, '');
});

test('Migrasi Users menambah kolom kanan secara idempoten tanpa menimpa isi', () => {
  const { context } = accountFixture();
  const expected = plain(vm.runInContext('HV_SCHEMA.Users', context));
  const row = ['id', 'adminuji', 'Nama', 'hash', 'Admin', true, false, 1, 'stamp'];
  const values = [expected.slice(0, 9), row.slice()];
  let columns = 9;
  const sheet = {
    getLastRow: () => values.length, getLastColumn: () => values[0].length, getMaxColumns: () => columns,
    insertColumnsAfter: (after, count) => { assert.equal(after, columns); columns += count; },
    getRange: (start, column, height, width) => ({
      getValues: () => [values[start - 1].slice(column - 1, column - 1 + width)],
      setValues: data => { assert.equal(start, 1); values[0] = Array.from(data[0]); }
    })
  };
  const db = { getSheetByName: () => sheet };
  context.extendAccountSchema_(db);
  context.extendAccountSchema_(db);
  assert.deepEqual(values[0], expected);
  assert.deepEqual(values[1], row);
  assert.equal(columns, expected.length);
  values[0][1] = 'kolom-asal';
  assert.throws(() => context.extendAccountSchema_(db), /tanpa menimpa data/);
  assert.deepEqual(values[1], row);
});

test('Pemulihan pemilik hanya dari editor, membuka blokir tanpa mengganti password', () => {
  const { context, user, properties } = accountFixture();
  user.role = 'Admin';
  user.blockedAt = 'stamp';
  user.failedAttempts = 3;
  properties.set('INITIAL_ADMIN_USERNAME', user.username);
  context.requireSetupAccess_ = () => { throw new Error('Hanya pemilik'); };
  assert.throws(() => context.unlockHealthyVibesAdmin(), /pemilik/);
  assert.equal(user.blockedAt, 'stamp');
  context.requireSetupAccess_ = () => {};
  context.unlockHealthyVibesAdmin();
  assert.equal(user.blockedAt, '');
  assert.equal(user.failedAttempts, 0);
  assert.equal(user.version, 2);
  assert.equal(user.passwordHash, 'test-hash:benar123');
  assert.ok(!properties.has('INITIAL_ADMIN_USERNAME'));
});

test('Menu Viewer dapat membaca nama master tanpa memperoleh data pelanggan', () => {
  const { context, tables, user } = accountFixture();
  user.role = 'Viewer';
  user.permissionsJson = '["Categories","Pesanan"]';
  tables.Categories = [{ id: 'cat1', name: 'Makanan', active: true }];
  tables.Orders = [{ id: 'order1', name: 'PRIVATE', phone: 'PRIVATE', address: 'PRIVATE', accessHash: 'PRIVATE' }];
  assert.equal(context.adminData_(user, { page: 'Categories' }).tables.Categories[0].name, 'Makanan');
  assert.ok(!JSON.stringify(context.adminData_(user, { page: 'Pesanan' })).includes('PRIVATE'));
});

test('Frontend menyediakan matriks 15 menu, Konsumen tanpa centang, dan token POST', () => {
  const client = source('js/client.js');
  const context = vm.createContext({ safe: String });
  vm.runInContext(client.slice(client.indexOf('  const tableLabels ='),
    client.indexOf('  function renderUsers(')), context);
  const operator = context.defaultUserPermissions('Operator');
  assert.equal(operator.length, 13);
  assert.ok(!operator.includes('Users') && !operator.includes('Pengaturan'));
  const form = context.userPermissionFields({ role: 'Operator', permissions: ['Products'] }, false);
  assert.equal((form.match(/name="permission"/g) || []).length, 15);
  assert.equal((form.match(/ checked/g) || []).length, 1);
  const consumer = context.userPermissionFields({ role: 'Konsumen', permissions: [] }, false);
  assert.equal((consumer.match(/ disabled/g) || []).length, 15);
  assert.equal((consumer.match(/ checked/g) || []).length, 0);
  assert.ok(client.includes('window.history.replaceState'));
  assert.ok(client.includes("rpc('completePasswordReset', { resetToken: form.dataset.token, newPassword: data.newPassword })"));
  assert.ok(!source('index.html').includes('FONNTE_TOKEN'));
  const restore = source('apps-script/Recovery.gs');
  assert.ok(restore.includes('extendAccountSchema_(db)'));
  assert.ok(restore.includes("HV_SCHEMA.PasswordResets.indexOf('usedAt')"));
});
