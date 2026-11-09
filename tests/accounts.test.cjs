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
    SpreadsheetApp: { flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) || '',
      setProperty: (key, value) => properties.set(key, value),
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

// Quote ditiru karena harga/kuota sudah diuji terpisah; kepemilikan memakai fungsi asli.
function consumerFixture() {
  const fixture = accountFixture();
  const { context, tables } = fixture;
  for (const file of ['Orders.gs', 'Files.gs']) {
    vm.runInContext(source('apps-script/' + file), context);
  }
  for (const name of ['Orders', 'Files', 'OrderItems', 'StockLedger', 'Shipping', 'ServiceAreas']) {
    tables[name] = [];
  }
  context.LockService = { getScriptLock: () => ({ hasLock: () => true }) };
  context.clock_ = () => ({ date: '2026-11-06' });
  context.settings_ = () => ({ ordersEnabled: 'true', sessionMaxHours: 8, sessionIdleMinutes: 30 });
  context.quote_ = () => ({ total: 50000, subtotal: 50000, voucherDiscount: 0,
    items: [{ name: 'Menu Uji', productId: 'p1', poolId: 'pool1', quantity: 1, unitPrice: 50000 }] });
  fixture.signup = { name: 'Konsumen Uji', phone: '081987654321', email: 'pembeli@example.test',
    username: 'pembeli1', password: 'uji12345', requestId: 'signup-1' };
  fixture.orderData = { requestId: 'order-1', name: 'Penerima Uji', phone: '081987654321',
    type: 'DIRECT', receipt: 'PICKUP', date: '2026-11-06', time: '16:00',
    paymentMethod: 'TRANSFER', items: [{ productId: 'p1', quantity: 1 }], acceptPolicy: true };
  fixture.login = () => context.registerCustomer_(fixture.signup);
  return fixture;
}

test('Pendaftaran checkout langsung aktif, otomatis Login, selalu Konsumen dan hash password', () => {
  const f = consumerFixture();
  const result = f.context.registerCustomer_({ ...f.signup, role: 'Admin', permissions: ['Users'] });
  assert.equal(result.user.role, 'Konsumen');
  assert.deepEqual(plain(result.user.permissions), []);
  assert.equal(result.user.mustChangePassword, false);
  const account = f.tables.Users.find(row => row.id === result.user.id);
  assert.equal(account.active, true);
  assert.equal(account.passwordHash, 'test-hash:' + f.signup.password);
  assert.equal(account.phone, '6281987654321');
  assert.equal(f.context.authorize_(result.token, ['Konsumen']).id, account.id);
  for (const field of ['password', 'passwordHash', 'registrationId', 'deliveryJson']) {
    assert.ok(!(field in result.user));
  }
  assert.equal(f.deliveries.length, 0);
  assert.ok(!JSON.stringify(f.audits).includes(f.signup.password));
});

test('Pendaftaran menolak username/kontak ganda termasuk akun staf dan nonaktif', () => {
  for (const changes of [{ username: 'operator1' }, { email: 'OPERATOR@example.test' },
    { phone: '+62 812 3456 789' }]) {
    const f = consumerFixture();
    f.user.active = false;
    assert.throws(() => f.context.registerCustomer_({ ...f.signup, ...changes }), /terdaftar/);
    assert.equal(f.tables.Users.length, 1);
  }
});

test('Pendaftaran terputus aman diulang, tetapi requestId bukan bukti kepemilikan', () => {
  const f = consumerFixture();
  const first = f.login();
  const repeat = f.login();
  assert.equal(first.user.id, repeat.user.id);
  assert.equal(f.tables.Users.length, 2);
  assert.notEqual(first.token, repeat.token);
  assert.throws(() => f.context.registerCustomer_({ ...f.signup, password: 'asing123' }), /terdaftar/);
  assert.equal(f.tables.Users[1].failedAttempts, 0);
});

test('Validasi dan pembatasan pendaftaran tidak menciptakan akun tidak valid', () => {
  for (const changes of [{ username: 'abc' }, { password: 'abc' }, { email: 'salah' },
    { phone: '12', email: '' }, { phone: '', email: '' }, { name: '' }, { requestId: '' }]) {
    const f = consumerFixture();
    assert.throws(() => f.context.registerCustomer_({ ...f.signup, ...changes }));
    assert.equal(f.tables.Users.length, 1);
  }
  const f = consumerFixture();
  f.cache.set('register-global', '10');
  assert.throws(() => f.login(), /Terlalu banyak/);
  assert.equal(f.tables.Users.length, 1);
});

test('Pesanan baru wajib sesi Konsumen dan customerId dari sesi, bukan input browser', () => {
  const f = consumerFixture();
  assert.equal(f.context.api_({ action: 'createOrder', data: f.orderData }).ok, false);
  const staff = f.context.login_({ username: f.user.username, password: 'benar123' });
  assert.equal(f.context.api_({ action: 'createOrder', token: staff.token, data: f.orderData }).ok, false);
  const session = f.login();
  const result = f.context.api_({ action: 'createOrder', token: session.token,
    data: { ...f.orderData, customerId: f.user.id, email: 'ignored', password: 'ignored' } });
  assert.equal(result.ok, true);
  assert.equal(f.tables.Orders[0].customerId, session.user.id);
  assert.equal(result.data.accountOwned, true);
  assert.equal(result.data.paymentStatus, 'UNPAID');
  for (const field of ['accessHash', 'accessToken', 'customerId', 'password']) {
    assert.ok(!(field in result.data));
  }
  assert.ok(!('password' in f.tables.Orders[0]));
});

test('Retry pesanan akun tidak menggandakan stok/transaksi dan menolak akun lain', () => {
  const f = consumerFixture();
  const session = f.login();
  const user = f.context.authorize_(session.token, ['Konsumen']);
  const order = f.context.createOrder_(f.orderData, user);
  const retry = f.context.createOrder_(f.orderData, user);
  assert.equal(order.id, retry.id);
  assert.equal(f.tables.Orders.length, 1);
  assert.equal(f.tables.StockLedger.length, 1);
  assert.equal(f.tables.OrderItems.length, 1);
  assert.throws(() => f.context.createOrder_(f.orderData, { ...user, id: 'another-user' }), /digunakan/);
  assert.throws(() => f.context.createOrder_({ ...f.orderData, name: 'Berbeda' }, user), /digunakan/);
});

test('Pesanan Saya memaginasi akun sendiri tanpa mengaitkan pesanan lama dari nomor HP', () => {
  const f = consumerFixture();
  const session = f.login();
  for (let i = 0; i < 13; i++) {
    f.tables.Orders.push({ id: 'own-' + i, customerId: session.user.id,
      createdAt: new Date(2026, 0, i + 1).toISOString(), total: 1000,
      paymentStatus: 'UNPAID', fulfillment: 'NEW', transactionState: 'COMMITTED',
      accessHash: 'SECRET', snapshotJson: 'SECRET' });
  }
  f.tables.Orders.push(
    { id: 'foreign', customerId: f.user.id, transactionState: 'COMMITTED', phone: f.signup.phone },
    { id: 'legacy', customerId: '', transactionState: 'COMMITTED', phone: f.signup.phone },
    { id: 'preparing', customerId: session.user.id, transactionState: 'PREPARING' });
  const result = f.context.api_({ action: 'myOrders', token: session.token, data: { customerId: f.user.id } });
  assert.equal(result.ok, true);
  assert.equal(result.data.total, 13);
  assert.equal(result.data.orders.length, 10);
  assert.equal(result.data.pageCount, 2);
  assert.equal(result.data.orders[0].id, 'own-12');
  assert.ok(!JSON.stringify(result.data).includes('SECRET'));
  const next = f.context.api_({ action: 'myOrders', token: session.token, data: { page: 1 } });
  assert.equal(next.data.orders.length, 3);
  assert.equal(f.context.api_({ action: 'myOrders', token: session.token, data: { page: -1 } }).ok, false);
});

test('Status akun menolak ID milik orang lain, pesanan lama dan pesanan belum selesai', () => {
  const f = consumerFixture();
  const session = f.login();
  const user = f.context.authorize_(session.token, ['Konsumen']);
  const order = f.context.createOrder_(f.orderData, user);
  assert.equal(f.context.api_({ action: 'myOrderStatus', token: session.token, data: { orderId: order.id } }).ok, true);
  f.tables.Orders[0].customerId = 'foreign';
  assert.equal(f.context.api_({ action: 'myOrderStatus', token: session.token,
    data: { orderId: order.id, customerId: 'foreign', phone: f.signup.phone } }).ok, false);
  f.tables.Orders[0].customerId = '';
  assert.throws(() => f.context.accountOrderAccess_(user, { orderId: order.id }), /tidak ditemukan/);
  f.tables.Orders[0].customerId = user.id;
  f.tables.Orders[0].transactionState = 'PREPARING';
  assert.throws(() => f.context.accountOrderAccess_(user, { orderId: order.id }), /rekonsiliasi/);
});

test('Endpoint akses kunci lama dihapus, termasuk untuk sesi Konsumen', () => {
  const f = consumerFixture();
  const session = f.login();
  const user = f.context.authorize_(session.token, ['Konsumen']);
  const order = f.context.createOrder_(f.orderData, user);
  assert.equal(f.context.customerAccess_, undefined);
  assert.equal(f.context.resetOrderAccess_, undefined);
  f.tables.Orders[0].customerId = '';
  for (const action of ['orderStatus', 'customerUpload', 'customerInvoice', 'resetOrderAccess', 'removeLegacyOrders']) {
    const result = f.context.api_({ action, token: session.token,
      data: { orderId: order.id, accessToken: 'Known12345' } });
    assert.equal(result.ok, false);
    assert.match(result.message, /tidak dikenal/);
  }
  assert.throws(() => f.context.upload_(null, { kind: 'STRUK', orderId: order.id }), /Login/);
  assert.throws(() => f.context.download_(null, { kind: 'INVOICE', orderId: order.id }), /Login/);
});

test('Alamat penerima tersimpan untuk belanja berikutnya tanpa mengganti kontak pemulihan', () => {
  const f = consumerFixture();
  const session = f.login();
  const user = f.context.authorize_(session.token, ['Konsumen']);
  const contact = user.phone;
  const order = f.context.createOrder_({ ...f.orderData, name: 'Penerima Lain', phone: '081111111111' }, user);
  assert.equal(user.phone, contact);
  const login = f.context.login_({ username: f.signup.username, password: f.signup.password });
  assert.equal(login.user.delivery.name, 'Penerima Lain');
  assert.equal(login.user.delivery.phone, order.phone);
  assert.equal(login.user.phone, contact);
  assert.equal(f.context.customerDelivery_({ name: 'Nama', phone: '628123456789', deliveryJson: 'rusak' }).phone, '08123456789');
});

test('Invoice dan unggah konsumen memakai kepemilikan akun sebelum menyentuh Drive', () => {
  const f = consumerFixture();
  const session = f.login();
  const user = f.context.authorize_(session.token, ['Konsumen']);
  const order = f.context.createOrder_(f.orderData, user);
  let driveReads = 0;
  const blob = { getBytes: () => [1, 2], getContentType: () => 'application/pdf',
    getName: () => 'photo.png', setName() { return this; } };
  f.context.Utilities.base64Encode = bytes => Buffer.from(bytes).toString('base64');
  f.context.invoice_ = () => { driveReads++; return { getBlob: () => blob, getName: () => 'invoice.pdf' }; };
  f.context.imageBlob_ = () => blob;
  f.context.folder_ = () => ({ getFiles: () => ({ hasNext: () => false }),
    createFile: () => { driveReads++; return { getId: () => 'file-test' }; } });
  f.tables.Orders.push({ ...f.tables.Orders[0], id: 'foreign', customerId: 'other' });
  for (const action of ['myInvoice', 'myOrderUpload']) {
    const denied = f.context.api_({ action, token: session.token,
      data: { orderId: 'foreign', kind: 'STRUK', requestId: 'upload-1' } });
    assert.equal(denied.ok, false);
    assert.equal(driveReads, 0);
  }
  assert.equal(f.context.api_({ action: 'myInvoice', token: session.token,
    data: { orderId: order.id, kind: 'FILE', fileId: 'foreign-file' } }).ok, true);
  assert.equal(f.context.api_({ action: 'myOrderUpload', token: session.token,
    data: { orderId: order.id, kind: 'STRUK', requestId: 'upload-1', mimeType: 'image/jpeg' } }).ok, true);
  assert.equal(f.context.api_({ action: 'myOrderUpload', token: session.token,
    data: { orderId: order.id, kind: 'PRODUK', productId: 'p1' } }).ok, false);
  assert.equal(driveReads, 2);
  f.tables.Orders[0].fulfillment = 'READY';
  assert.equal(f.context.api_({ action: 'myOrderUpload', token: session.token,
    data: { orderId: order.id, kind: 'TANDATERIMA', requestId: 'handover-1', received: true } }).ok, true);
});

test('Akun dengan pesanan tetap tidak dapat dihapus setelah akses lama dihapus', () => {
  const f = consumerFixture();
  const session = f.login();
  const user = f.context.authorize_(session.token, ['Konsumen']);
  const order = f.context.createOrder_(f.orderData, user);
  const admin = { ...f.user, role: 'Admin', permissionsJson: '["Users","Pesanan"]' };
  assert.throws(() => f.context.deleteMaster_(admin, { table: 'Users', id: user.id, confirmed: true }), /masih dipakai/);
  assert.equal(f.context.resetOrderAccess_, undefined);
});

test('Migrasi Orders menambah customerId tanpa mengisi pemilik untuk pesanan lama', () => {
  const f = consumerFixture();
  const expected = plain(vm.runInContext('HV_SCHEMA.Orders', f.context));
  const original = expected.slice(0, -1);
  const order = original.map(key => key === 'id' ? 'legacy' : '');
  let headers = original.slice();
  let columns = headers.length;
  const sheet = {
    getLastRow: () => 2, getLastColumn: () => headers.length, getMaxColumns: () => columns,
    insertColumnsAfter: (start, count) => { columns += count; },
    getRange: (row, col, height, width) => ({
      getValues: () => [headers.slice()],
      setValues: values => { assert.equal(row, 1); headers = Array.from(values[0]); }
    })
  };
  f.context.extendOrderAccountSchema_({ getSheetByName: () => sheet });
  f.context.extendOrderAccountSchema_({ getSheetByName: () => sheet });
  assert.deepEqual(headers, expected);
  assert.equal(columns, expected.length);
  assert.equal(order[0], 'legacy');
  assert.equal(order.length, original.length);
  assert.equal(order[expected.indexOf('customerId')], undefined);
});

test('Checkout tidak menyimpan atau mengirim password dalam data penerima dan pesanan', async () => {
  const client = source('js/client.js');
  const calls = [];
  const state = { checkoutStep: 1, recipient: {}, requestId: 'retry-request', token: '',
    cart: { p1: 1 }, page: 'checkout' };
  const data = { name: 'Pembeli', phone: '081234567890', username: 'pembeli1',
    password: 'contoh123', repeatPassword: 'contoh123', email: 'uji@example.test',
    receipt: 'PICKUP', time: '16:00' };
  const context = vm.createContext({
    state,
    formData: () => data,
    renderCheckout: () => {},
    renderOrder: () => {},
    notify: () => {},
    checkoutPayload: () => ({ ...state.recipient, requestId: state.requestId }),
    rpc: async (action, payload) => {
      calls.push({ action, payload });
      if (action === 'registerCustomer') {
        return { token: 'session-only', user: { id: 'consumer1', role: 'Konsumen' } };
      }
      if (action === 'createOrder') {
        return { id: 'order1', name: data.name, phone: data.phone, receipt: 'PICKUP' };
      }
      return {};
    }
  });
  vm.runInContext(client.slice(client.indexOf('  async function submitCheckout('),
    client.indexOf('  // Menampilkan formulir pengecekan pesanan')), context);
  await context.submitCheckout({});
  assert.equal(state.token, 'session-only');
  assert.equal(state.checkoutStep, 2);
  for (const key of ['username', 'password', 'repeatPassword', 'email']) {
    assert.ok(!(key in state.recipient));
  }
  data.paymentMethod = 'TRANSFER';
  await context.submitCheckout({});
  data.acceptPolicy = 'on';
  await context.submitCheckout({});
  const request = calls.find(call => call.action === 'createOrder');
  assert.equal(request.payload.acceptPolicy, true);
  assert.ok(!JSON.stringify(request).includes('contoh123'));
  assert.equal(calls.filter(call => call.action === 'registerCustomer').length, 1);
  assert.equal(state.page, 'status');
  assert.equal(state.user.delivery.phone, data.phone);
});

test('Sesi konsumen kedaluwarsa meminta Login tanpa menghilangkan checkout dan ID retry', async () => {
  const client = source('js/client.js');
  const state = { page: 'checkout', checkoutStep: 3, user: { role: 'Konsumen' },
    token: 'old-token', requestId: 'same-request', recipient: { name: 'Pembeli' } };
  let shown = 0;
  const context = vm.createContext({
    state, pending: 0,
    document: { getElementById: () => ({ classList: { remove() {}, toggle() {} } }) },
    renderLogin: () => { shown++; },
    HealthyVibesApi: { request: async () => ({ ok: false, message: 'Sesi berakhir. Silakan login kembali.' }) }
  });
  vm.runInContext(client.slice(client.indexOf('  function rpc('),
    client.indexOf('  let notificationTimer')), context);
  await assert.rejects(context.rpc('createOrder', {}), /Sesi berakhir/);
  assert.equal(state.checkoutResume, true);
  assert.equal(state.page, 'admin');
  assert.equal(state.requestId, 'same-request');
  assert.equal(state.checkoutStep, 3);
  assert.equal(state.recipient.name, 'Pembeli');
  assert.equal(state.token, '');
  assert.equal(shown, 1);
});

test('Balasan sesi lama tidak mencabut sesi konsumen baru', async () => {
  const client = source('js/client.js');
  const state = { page: 'status', user: { role: 'Konsumen' }, token: 'old-token' };
  const context = vm.createContext({
    state, pending: 0,
    document: { getElementById: () => ({ classList: { remove() {}, toggle() {} } }) },
    renderLogin: () => { throw new Error('Tidak boleh mencabut sesi baru'); },
    HealthyVibesApi: { request: async request => {
      assert.equal(request.token, 'old-token');
      state.token = 'new-token';
      return { ok: false, message: 'Sesi berakhir.' };
    } }
  });
  vm.runInContext(client.slice(client.indexOf('  function rpc('),
    client.indexOf('  let notificationTimer')), context);
  await assert.rejects(context.rpc('myOrders', {}), /Sesi berakhir/);
  assert.equal(state.token, 'new-token');
});
