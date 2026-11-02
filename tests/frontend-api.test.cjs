'use strict';

// Pengujian memakai layanan tiruan, tanpa request atau transaksi Google nyata.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const root = path.resolve(__dirname, '..');
const source = function (name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
};
const channel = 'a'.repeat(32);
const origin = 'https://amihaji.github.io';

// Keluaran Google ditampung di memori agar target postMessage dapat diperiksa.
function backend(configuredOrigins) {
  function output(text, kind) {
    return {
      text: text,
      kind: kind,
      setMimeType: function () { return this; },
      setXFrameOptionsMode: function (mode) {
        this.frameMode = mode;
        return this;
      }
    };
  }
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: function () {
        return { getProperty: function () { return configuredOrigins || ''; } };
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: function (text) { return output(text, 'json'); }
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput: function (text) { return output(text, 'html'); }
    }
  });
  vm.runInContext(source('apps-script/Store.gs'), context);
  vm.runInContext(source('apps-script/Api.gs'), context);
  context.withLock_ = function (operation) { return operation(); };
  return context;
}

function post(context, request, options) {
  return context.doPost({
    parameter: Object.assign({
      clientOrigin: origin,
      channel: channel,
      payload: JSON.stringify(request)
    }, options)
  });
}

// Evaluasi hanya tag script respons untuk memeriksa hasil dan tujuan balasan.
function readReply(output) {
  let received;
  vm.runInNewContext(output.text.match(/<script>\n([\s\S]*?)<\/script>/)[1], {
    window: {
      top: {
        postMessage: function (message, target) {
          received = { message: message, target: target };
        }
      }
    }
  });
  return received;
}

test('GET API tidak membagikan database atau konfigurasi rahasia', function () {
  const result = JSON.parse(backend().doGet().text);
  assert.deepEqual(result, {
    service: 'Healthy Vibes API',
    protocol: 'healthyvibes-api-v1'
  });
});

test('POST publik memberikan hasil server dengan target origin tepat', function () {
  const context = backend();
  context.catalog_ = function () { return { products: [] }; };
  const output = post(context, { action: 'catalog', data: {} });
  const reply = readReply(output);
  assert.equal(reply.target, origin);
  assert.equal(reply.message.channel, channel);
  assert.equal(reply.message.response.ok, true);
  assert.equal(output.frameMode, 'ALLOWALL');
});

test('Login membaca password dari badan POST, bukan query event', function () {
  const context = backend();
  let supplied;
  context.login_ = function (data) {
    supplied = data;
    return { token: 'server-session' };
  };
  const output = post(context, {
    action: 'login',
    data: { username: 'admin', password: 'Password-hanya-POST-123' }
  }, { password: 'query-diabaikan' });
  assert.equal(supplied.password, 'Password-hanya-POST-123');
  assert.equal(readReply(output).message.response.data.token, 'server-session');
  assert.ok(!output.text.includes(supplied.password));
});

test('POST origin asing dan kanal salah tidak menjalankan operasi', function () {
  const context = backend();
  context.api_ = function () { throw new Error('Operasi tidak boleh dijalankan'); };
  for (const options of [
    { clientOrigin: 'https://evil.example' },
    { channel: 'invalid' }
  ]) {
    const output = post(context, { action: 'catalog' }, options);
    assert.equal(output.kind, 'json');
    assert.equal(JSON.parse(output.text).ok, false);
    assert.ok(!output.text.includes('Operasi tidak boleh'));
  }
});

test('Origin konfigurasi bersifat exact, bukan prefix atau wildcard', function () {
  const context = backend('https://amihaji.github.io');
  context.catalog_ = function () { return {}; };
  assert.equal(post(context, { action: 'catalog' }, {
    clientOrigin: 'https://amihaji.github.io.evil.example'
  }).kind, 'json');
  assert.throws(function () { backend('*').frontendOrigins_(); });
  assert.throws(function () {
    backend('https://amihaji.github.io/healthyvibes/').frontendOrigins_();
  });
});

test('Payload JSON rusak dan bentuk request salah mendapat error server', function () {
  const context = backend();
  for (const payload of ['{', '[]', 'null', '{"action":"catalog","data":[]}']) {
    const result = readReply(post(context, {}, { payload: payload }));
    assert.equal(result.message.response.ok, false);
  }
});

test('Operasi staf tetap memeriksa sesi dan level backend', function () {
  const context = backend();
  let calls = 0;
  context.authorize_ = function (token, roles) {
    calls += 1;
    assert.equal(token, 'invalid-session');
    assert.deepEqual(Array.from(roles), ['Admin']);
    throw new Error('Sesi ditolak');
  };
  const result = readReply(post(context, {
    action: 'saveSettings', token: 'invalid-session', data: {}
  }));
  assert.equal(calls, 1);
  assert.equal(result.message.response.ok, false);
  assert.equal(result.message.response.message, 'Sesi ditolak');
});

test('Aksi internal tidak dapat dipanggil melalui nama action', function () {
  const result = readReply(post(backend(), {
    action: 'createFirstAdmin_', data: {}
  }));
  assert.equal(result.message.response.ok, false);
});

test('Data berbahaya tidak dapat menutup tag script respons', function () {
  const context = backend();
  const value = '</script><script>alert("x")</script>&\u2028\u2029';
  context.catalog_ = function () { return { name: value }; };
  const output = post(context, { action: 'catalog' });
  assert.equal((output.text.match(/<\/script>/g) || []).length, 1);
  assert.equal(readReply(output).message.response.data.name, value);
});

// DOM dan jam tiruan memastikan payload dibersihkan tanpa membuat file debug.
function transportFixture(config) {
  const listeners = new Set();
  const timers = new Map();
  const elements = [];
  let timerId = 0;
  let submission;
  function element(tag) {
    const item = {
      tag: tag,
      children: [],
      contentWindow: {},
      appendChild: function (child) { this.children.push(child); },
      remove: function () { this.removed = true; }
    };
    Object.defineProperty(item, 'elements', {
      get: function () { return item.children; }
    });
    elements.push(item);
    return item;
  }
  const window = {
    HV_CONFIG: Object.assign({
      apiUrl: 'https://script.google.com/macros/s/test-deployment/exec',
      requestTimeoutMs: 5000
    }, config),
    addEventListener: function (type, callback) { listeners.add(callback); },
    removeEventListener: function (type, callback) { listeners.delete(callback); }
  };
  window.self = window;
  window.top = window;
  vm.runInNewContext(source('js/transport.js'), {
    window: window,
    location: { origin: origin },
    crypto: crypto,
    document: {
      createElement: element,
      body: { appendChild: function () {} }
    },
    HTMLFormElement: {
      prototype: {
        submit: function () {
          submission = Object.fromEntries(this.children.map(function (input) {
            return [input.name, input.value];
          }));
        }
      }
    },
    setTimeout: function (callback, delay) {
      timers.set(++timerId, { callback: callback, delay: delay });
      return timerId;
    },
    clearTimeout: function (id) { timers.delete(id); }
  });
  function respond(options) {
    const frame = elements.find(function (item) { return item.tag === 'iframe'; });
    const event = Object.assign({
      origin: 'https://test-script.googleusercontent.com',
      source: { parent: frame.contentWindow },
      data: {
        protocol: 'healthyvibes-api-v1',
        channel: submission.channel,
        response: { ok: true, data: 'confirmed' }
      }
    }, options);
    Array.from(listeners).forEach(function (callback) { callback(event); });
  }
  return {
    api: window.HealthyVibesApi,
    listeners: listeners,
    timers: timers,
    elements: elements,
    window: window,
    respond: respond,
    submitted: function () { return submission; }
  };
}

test('Transport memakai POST dan membersihkan elemen setelah konfirmasi', async function () {
  const fixture = transportFixture();
  const pending = fixture.api.request({
    action: 'login', data: { password: 'Tidak-di-URL-123' }
  });
  const form = fixture.elements.find(function (item) { return item.tag === 'form'; });
  assert.equal(form.method, 'POST');
  assert.ok(!form.action.includes('Tidak-di-URL'));
  assert.equal(JSON.parse(fixture.submitted().payload).data.password, 'Tidak-di-URL-123');
  fixture.respond();
  assert.equal((await pending).data, 'confirmed');
  assert.equal(fixture.listeners.size, 0);
  assert.equal(fixture.timers.size, 0);
  assert.ok(fixture.elements.filter(function (item) {
    return ['form', 'iframe'].includes(item.tag);
  }).every(function (item) { return item.removed; }));
  assert.ok(form.children.every(function (input) { return input.value === ''; }));
});

test('Pesan palsu ditolak sampai origin, iframe, dan kanal cocok', async function () {
  const fixture = transportFixture();
  const pending = fixture.api.request({ action: 'catalog' });
  fixture.respond({ origin: 'https://evil.example' });
  fixture.respond({ source: {} });
  fixture.respond({
    data: {
      protocol: 'healthyvibes-api-v1',
      channel: 'wrong-channel',
      response: { ok: true }
    }
  });
  assert.equal(fixture.listeners.size, 1);
  fixture.respond();
  assert.equal((await pending).ok, true);
});

test('Respons tanpa status server ditolak, bukan dianggap berhasil', async function () {
  const fixture = transportFixture();
  const pending = fixture.api.request({ action: 'createOrder' });
  fixture.respond({
    data: {
      protocol: 'healthyvibes-api-v1',
      channel: fixture.submitted().channel,
      response: {}
    }
  });
  await assert.rejects(pending, /belum dipastikan/);
  assert.equal(fixture.listeners.size, 0);
});

test('Timeout tidak mengakui transaksi sukses dan tetap membersihkan DOM', async function () {
  const fixture = transportFixture();
  const pending = fixture.api.request({ action: 'createOrder' });
  Array.from(fixture.timers.values())[0].callback();
  await assert.rejects(pending, /belum mengonfirmasi hasil/);
  assert.equal(fixture.listeners.size, 0);
  assert.equal(fixture.timers.size, 0);
});

test('Konfigurasi kosong dan aplikasi dalam iframe ditolak', async function () {
  await assert.rejects(
    transportFixture({ apiUrl: '' }).api.request({ action: 'catalog' }),
    /Isi URL API/
  );
  const fixture = transportFixture();
  fixture.window.top = {};
  await assert.rejects(fixture.api.request({ action: 'catalog' }), /langsung/);
});

test('Kolom Jam Layanan selalu memakai format 24 jam tanpa kontrol AM/PM', function () {
  const client = source('js/client.js');
  const start = client.indexOf('  function field(');
  const end = client.indexOf('  function selectField(', start);
  const context = vm.createContext({ safe: String });
  vm.runInContext(client.slice(start, end), context);
  const markup = context.field('Jam buka WITA (24 jam)', 'opens', '17:00', 'time');
  assert.ok(markup.includes('type="text"'));
  assert.ok(markup.includes('value="17:00"'));
  assert.ok(markup.includes('placeholder="HH:mm"'));
  assert.ok(markup.includes('maxlength="5"'));
  assert.ok(markup.includes(' required'));
  assert.ok(!markup.includes('type="time"'));
  const pattern = new RegExp('^(?:' + markup.match(/pattern="([^"]+)"/)[1] + ')$');
  for (const time of ['00:00', '08:00', '12:00', '17:00', '23:59']) {
    assert.ok(pattern.test(time), time);
  }
  for (const time of ['8:00', '24:00', '17:60', '05:00 PM', '08.00']) {
    assert.ok(!pattern.test(time), time);
  }
  const password = context.field('Password', 'password', '', 'password');
  assert.ok(password.includes('type="password"'));
  assert.ok(password.includes('minlength="6"'));
  assert.ok(!password.includes('pattern='));
});

test('Semua source dapat diparse dan frontend tidak memakai template Google', function () {
  const backendRuntime = vm.createContext({});
  for (const directory of ['js', 'apps-script']) {
    for (const file of fs.readdirSync(path.join(root, directory))) {
      if (/\.(js|gs)$/.test(file)) {
        new vm.Script(source(directory + '/' + file), { filename: file });
        if (directory === 'apps-script') {
          vm.runInContext(source(directory + '/' + file), backendRuntime);
        }
      }
    }
  }
  assert.ok(!source('index.html').includes('<?'));
  assert.ok(!source('js/client.js').includes('google.script.run'));
  assert.ok(!fs.readdirSync(path.join(root, 'apps-script')).some(function (file) {
    return file.endsWith('.html');
  }));
});

test('Aturan WITA, voucher, refund, dan reservasi tetap lulus', function () {
  const context = vm.createContext({});
  for (const file of ['Store.gs', 'Rules.gs', 'Orders.gs', 'Tests.gs']) {
    vm.runInContext(source('apps-script/' + file), context);
  }
  const results = context.runRuleTests_();
  assert.ok(results.length >= 12);
  assert.ok(results.every(function (result) { return result.status === 'PASS'; }));
});

// Fungsi setup yang dapat dipilih di editor tetap menolak identitas web anonim.
function setupContext(activeEmail, effectiveEmail) {
  const context = vm.createContext({
    Session: {
      getActiveUser: function () {
        return { getEmail: function () { return activeEmail; } };
      },
      getEffectiveUser: function () {
        return { getEmail: function () { return effectiveEmail; } };
      }
    },
    console: { info: function () {} }
  });
  for (const file of ['Store.gs', 'Schema.gs', 'Auth.gs', 'Tests.gs']) {
    vm.runInContext(source('apps-script/' + file), context);
  }
  return context;
}

test('Password menerima 6 karakter dan tetap menolak lebih dari 72 byte', function () {
  const context = setupContext('owner@example.com', 'owner@example.com');
  context.Utilities = {
    newBlob: function (value) {
      return { getBytes: function () { return Array.from(Buffer.from(value, 'utf8')); } };
    }
  };
  assert.equal(context.password_('Abc123'), 'Abc123');
  assert.throws(function () { context.password_('Ab123'); }, /minimal 6 karakter/);
  assert.throws(function () { context.password_(''); }, /minimal 6 karakter/);
  assert.equal(context.password_('a'.repeat(72)), 'a'.repeat(72));
  assert.throws(function () { context.password_('a'.repeat(73)); }, /maksimal 72 byte/);
  const multibyte = String.fromCharCode(233);
  assert.equal(context.password_(multibyte.repeat(36)), multibyte.repeat(36));
  assert.throws(function () { context.password_(multibyte.repeat(37)); }, /maksimal 72 byte/);
});

test('Username menerima 6 karakter dengan normalisasi dan batas panjang tetap', function () {
  const context = setupContext('owner@example.com', 'owner@example.com');
  assert.equal(context.username_(' ADMIN1 '), 'admin1');
  assert.throws(function () { context.username_('admin'); }, /minimal 6 karakter/);
  assert.throws(function () { context.username_(''); }, /Username tidak valid/);
  assert.equal(context.username_('a'.repeat(60)), 'a'.repeat(60));
  assert.throws(function () { context.username_('a'.repeat(61)); }, /Username tidak valid/);
});

test('Fungsi setup tanpa underscore meneruskan operasi akun editor', function () {
  const context = setupContext('owner@example.com', 'owner@example.com');
  const operations = {
    installHealthyVibes: { databaseUrl: 'database', driveUrl: 'drive' },
    verifyAuthRuntime: { passed: true, milliseconds: 10 },
    createFirstAdmin: 'Admin dibuat',
    runRuleTests: [{ name: 'Aturan uji', status: 'PASS' }]
  };
  for (const [name, expected] of Object.entries(operations)) {
    let calls = 0;
    context[name + '_'] = function () {
      calls += 1;
      return expected;
    };
    assert.equal(context[name](), expected);
    assert.equal(calls, 1);
  }
});

test('Setup menolak anonim dan akun berbeda sebelum mengubah data', function () {
  for (const [active, effective] of [
    ['', 'owner@example.com'],
    ['other@example.com', 'owner@example.com'],
    ['owner@example.com', '']
  ]) {
    const context = setupContext(active, effective);
    for (const name of [
      'installHealthyVibes', 'verifyAuthRuntime', 'createFirstAdmin', 'runRuleTests'
    ]) {
      let calls = 0;
      context[name + '_'] = function () { calls += 1; };
      assert.throws(function () { context[name](); }, /dari editor/);
      assert.equal(calls, 0);
    }
  }
});

test('Run aturan menampilkan error jika implementasi mengembalikan FAIL', function () {
  const context = setupContext('owner@example.com', 'owner@example.com');
  context.runRuleTests_ = function () {
    return [{ name: 'Aturan uji', status: 'FAIL' }];
  };
  assert.throws(function () { context.runRuleTests(); }, /aturan yang gagal/);
});

// VM sengaja tidak menyediakan process, setTimeout, atau setImmediate seperti GAS.
function bcryptWithoutTimers() {
  const context = vm.createContext({});
  vm.runInContext(source('apps-script/VendorBcrypt.gs'), context);
  return context.dcodeIO.bcrypt;
}

test('Bcrypt dimuat tanpa timer dan menghasilkan hash acuan yang sama', function () {
  const bcrypt = bcryptWithoutTimers();
  const expected = '$2a$04$abcdefghijklmnopqrstuughE8Ev8uGFaUgY2cNEySvxngrb/Jzdm';
  assert.equal(bcrypt.hashSync('password', '$2a$04$abcdefghijklmnopqrstuu'), expected);
  assert.equal(bcrypt.compareSync('password', expected), true);
  assert.equal(bcrypt.compareSync('wrong-password', expected), false);
});

test('Salt dan bcrypt cost 12 tetap berjalan sinkron tanpa timer', function () {
  const bcrypt = bcryptWithoutTimers();
  const lengths = [];
  // Byte deterministik hanya untuk fixture; produksi tetap memakai secureBytes_.
  bcrypt.setRandomFallback(function (length) {
    lengths.push(length);
    return Array.from({ length: length }, function (_, index) { return index; });
  });
  const hash = bcrypt.hashSync('Password-sandbox-123', 12);
  assert.ok(hash.startsWith('$2a$12$'));
  assert.deepEqual(lengths, [16]);
  assert.equal(bcrypt.compareSync('Password-sandbox-123', hash), true);
  assert.equal(bcrypt.compareSync('Password-salah-123', hash), false);
});

test('Bcrypt asinkron ditolak jelas jika runtime tidak memiliki scheduler', function () {
  const bcrypt = bcryptWithoutTimers();
  let callbackCalled = false;
  assert.throws(function () {
    bcrypt.genSalt(4, function () { callbackCalled = true; });
  }, function (error) {
    // Periksa penolakan yang benar, bukan kalimat pesan versi tertentu.
    assert.equal(error.name, 'Error');
    assert.match(error.message, /Apps Script/);
    assert.match(error.message, /hashSync\/compareSync/);
    return true;
  });
  assert.equal(callbackCalled, false);
});
