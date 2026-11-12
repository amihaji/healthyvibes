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
  vm.runInContext(source('apps-script/Accounts.gs'), context);
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

test('Foto publik tidak mengantre lock, transaksi lainnya tetap memakai lock', function () {
  const context = backend();
  let locks = 0;
  context.withLock_ = function (operation) { locks += 1; return operation(); };
  context.productPhoto_ = function (data) { return { mimeType: 'image/jpeg', base64: data.productId }; };
  context.quote_ = function () { return {}; };
  context.createOrder_ = function () { return {}; };
  context.authorize_ = function (token, roles) {
    assert.deepEqual(Array.from(roles), ['Konsumen']);
    return { id: 'customer-test', role: 'Konsumen' };
  };
  const photo = readReply(post(context, { action: 'productPhoto', data: { productId: 'foto-uji' } }));
  assert.equal(photo.message.response.data.base64, 'foto-uji');
  assert.equal(locks, 0);
  for (const action of ['quote', 'createOrder']) {
    assert.equal(readReply(post(context, { action: action, data: {} })).message.response.ok, true);
  }
  assert.equal(locks, 2);
});

test('Foto produk nonaktif tidak dibaca dari Drive', function () {
  const context = backend();
  vm.runInContext(source('apps-script/Files.gs'), context);
  context.rows_ = function () { return [{ id: 'p1', active: false, photoFileId: 'private-file' }]; };
  context.active_ = function (value) { return value === true; };
  context.DriveApp = { getFileById: function () { throw new Error('Drive tidak boleh dibaca'); } };
  assert.equal(context.api_({ action: 'productPhoto', data: { productId: 'p1' } }).data, null);
});

test('Kompresi 800px hanya untuk foto produk, dokumen tetap 1200px', async function () {
  const client = source('js/client.js');
  const canvas = {
    width: 0, height: 0,
    getContext: function () { return { drawImage: function () {} }; },
    toDataURL: function (mime, quality) { this.quality = quality; return 'data:image/jpeg;base64,test'; }
  };
  const context = vm.createContext({
    createImageBitmap: async function () { return { width: 2000, height: 1000, close: function () {} }; },
    document: { createElement: function () { return canvas; } }
  });
  vm.runInContext(client.slice(client.indexOf('  async function photoData('),
    client.indexOf('  function saveDownload(')), context);
  const file = { type: 'image/jpeg', size: 200000 };
  await context.photoData(file, true);
  assert.equal(canvas.width, 800);
  assert.equal(canvas.height, 400);
  assert.equal(canvas.quality, 0.8);
  await context.photoData(file);
  assert.equal(canvas.width, 1200);
  assert.equal(canvas.height, 600);
  assert.equal(canvas.quality, 0.85);
  assert.ok(client.includes("photoData(form.elements.photo.files[0], form.id === 'product-photo-form')"));
  await assert.rejects(context.photoData({ type: 'text/plain', size: 100 }), /JPG/);
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
    assert.deepEqual(Array.from(roles), ['Admin', 'Operator']);
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
  const dateClock = context.field('Mulai WITA', 'startsAt', '02/11/2026 17:00', 'datetime-local');
  assert.ok(dateClock.includes('type="text"'));
  assert.ok(dateClock.includes('value="02/11/2026 17:00"'));
  assert.ok(dateClock.includes('placeholder="DD/MM/YYYY HH:mm"'));
  assert.ok(!dateClock.includes('type="datetime-local"'));
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

test('Branding memakai aset pemilik, tombol Login dan gambar ikut publikasi', function () {
  const html = source('index.html');
  const client = source('js/client.js');
  const workflow = source('.github/workflows/jekyll-docker.yml');
  assert.ok(html.includes('image/Logo_HealthyVibes_Trans.png'));
  assert.ok(client.includes('image/Header_HealthyVibes.jpg'));
  assert.ok(html.includes('aria-label="Login"'));
  assert.ok(html.includes('id="nav-toggle"'));
  assert.ok(html.includes('aria-controls="site-nav"'));
  assert.ok(!html.includes('>Pengelola</button>'));
  assert.ok(!client.includes('brand.replaceChildren'));
  assert.ok(workflow.includes('"image/**"'));
  assert.ok(workflow.includes('cp -R css js image'));
  for (const file of ['Header_HealthyVibes.jpg', 'Logo_HealthyVibes_Trans.png']) {
    assert.ok(fs.statSync(path.join(root, 'image', file)).size > 0);
  }
});

test('Label awal memakai Katalog dan Login dengan navigasi HP berikon', function () {
  const html = source('index.html');
  assert.match(html, /data-nav="shop"[^>]*>[\s\S]*?<span>Katalog<\/span>/);
  const toggle = html.match(/<button[^>]*id="nav-toggle"[\s\S]*?<\/button>/)[0];
  assert.ok(toggle.includes('<svg'));
  assert.ok(!toggle.includes('<span'));
  assert.ok(toggle.includes('aria-label="Buka menu navigasi"'));
  assert.match(html, /class="header-action-text">Login<\/span>/);
  assert.ok(source('js/client.js').includes("buttonLabel('menu', 'Lihat Katalog')"));
  assert.ok(!source('js/client.js').includes("buttonLabel('menu', 'Lihat Menu')"));
  assert.match(source('css/styles.css'), /\.settings-button \.header-action-text \{ display: none; \}/);
});

// Katalog statis harus ikut publikasi agar tautan tidak menghasilkan halaman 404.
test('Lihat Katalog membuka PDF dengan sumber produk dan gambar lokal yang lengkap', function () {
  const client = source('js/client.js');
  assert.match(client, /href="pdf\/Katalog_Menu_Healthy_Vibes\.pdf" target="_blank" rel="noopener" type="application\/pdf"/);
  const workflow = source('.github/workflows/jekyll-docker.yml');
  assert.ok(workflow.includes('"pdf/**"'));
  assert.ok(workflow.includes('cp -R css js image pdf'));
  const pdf = fs.readFileSync(path.join(root, 'pdf/Katalog_Menu_Healthy_Vibes.pdf'));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 10000);
  const catalog = JSON.parse(source('image/katalog-produk.json'));
  assert.ok(catalog.products.length > 0);
  assert.ok(Number.isFinite(Date.parse(catalog.createdAt)));
  for (const product of catalog.products) {
    assert.ok(product.name);
    assert.ok(Number.isFinite(product.price) && product.price >= 0);
    if (product.image) {
      assert.match(product.image, /^katalog-[a-z0-9-]+\.jpg$/);
      assert.ok(fs.statSync(path.join(root, 'image', product.image)).size > 0);
    }
  }
});

// Penutup HTML harus lengkap agar katalog dan keranjang tidak masuk ke dalam banner.
test('Banner, katalog, dan keranjang memiliki struktur HTML terpisah dan lengkap', function () {
  const app = { innerHTML: '' };
  const context = vm.createContext({
    window: {}, app: app, safe: String, rupiah: String,
    state: {
      type: 'DIRECT',
      catalog: { settings: { ordersEnabled: 'true' }, categories: [] }
    },
    renderCart: function () { return '<h2>Keranjang Anda</h2>'; },
    cartSummary: function () { return { total: 0 }; },
    renderProducts: function () {}
  });
  vm.runInContext(source('js/icons.js'), context);
  context.buttonLabel = context.window.HV_UI.label;
  const client = source('js/client.js');
  vm.runInContext(client.slice(client.indexOf('  function renderShop('),
    client.indexOf('  function renderProducts(')), context);
  context.renderShop();
  const stack = [];
  const topLevel = [];
  const voidTags = new Set(['img', 'input', 'br', 'hr']);
  for (const match of app.innerHTML.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    if (match[0].startsWith('</')) {
      assert.equal(stack.pop(), tag, 'Penutup tidak cocok: ' + match[0]);
    } else {
      if (stack.length === 0) { topLevel.push(tag); }
      if (/class="(?:shop-layout|mobile-cart)"/.test(match[0])) {
        assert.equal(stack.length, 0, 'Katalog/keranjang harus berada di luar banner');
      }
      if (!voidTags.has(tag) && !match[0].endsWith('/>')) { stack.push(tag); }
    }
  }
  assert.deepEqual(stack, [], 'Masih ada elemen HTML yang belum ditutup');
  assert.deepEqual(topLevel, ['section', 'div', 'div']);
});

test('Halaman produk dibatasi dua baris dan nomor halaman tetap valid setelah filter', function () {
  const client = source('js/client.js');
  for (const mobile of [false, true]) {
    const context = vm.createContext({ state: { productPage: 0 }, adminViewport: { matches: mobile } });
    vm.runInContext(client.slice(client.indexOf('  function productPageData('),
      client.indexOf('  function renderProducts(')), context);
    const products = Array.from({ length: 20 }, function (_, id) { return { id: id }; });
    const size = mobile ? 4 : 6;
    let result = context.productPageData(products);
    assert.equal(result.items.length, size);
    assert.equal(result.count, Math.ceil(20 / size));
    context.state.productPage = 99;
    result = context.productPageData(products);
    assert.equal(context.state.productPage, result.count - 1);
    assert.equal(result.last, 20);
    result = context.productPageData(products.slice(0, 1));
    assert.equal(context.state.productPage, 0);
    assert.equal(result.items.length, 1);
    result = context.productPageData([]);
    assert.equal(result.first, 0);
    assert.equal(result.last, 0);
  }
});

test('Checkbox tersedia berbentuk persegi tanpa mengikuti tinggi minimum input umum', function () {
  const css = source('css/styles.css');
  const rule = css.match(/\.availability-option \.form-check-input \{([^}]+)\}/)[1];
  for (const declaration of ['width: 22px', 'height: 22px', 'min-height: 22px', 'border-radius: 0']) {
    assert.ok(rule.includes(declaration));
  }
  assert.match(css, /\.availability-option \{[^}]*min-height: 44px/);
  const frame = css.match(/\.availability-option \{([^}]+)\}/)[1];
  for (const declaration of [
    'height: 44px', 'padding: 6px 10px',
    'border: 1px solid var(--bs-border-color, #dee2e6)',
    'border-radius: var(--bs-border-radius, .375rem)', 'background: white'
  ]) {
    assert.ok(frame.includes(declaration), 'Bingkai filter: ' + declaration);
  }
});

test('Filter tersedia menyaring stok/kuota aktif sebelum halaman serta bekerja dengan pencarian dan kategori', function () {
  const client = source('js/client.js');
  const context = vm.createContext({ state: { availableOnly: true } });
  vm.runInContext(client.slice(client.indexOf('  function filterCatalogProducts('),
    client.indexOf('  function renderProducts(')), context);
  const products = [
    { id: 'a', name: 'Wafel', categoryId: 'snack', available: 0 },
    { id: 'b', name: 'Wafel Keju', categoryId: 'snack', available: 5 },
    { id: 'c', name: 'Teh', categoryId: 'drink', available: 10 },
    { id: 'd', name: 'Produk rusak', categoryId: 'snack', available: 'bukan angka' }
  ];
  const ids = function (result) { return Array.from(result, function (row) { return row.id; }); };
  assert.deepEqual(ids(context.filterCatalogProducts(products, '', '')), ['b', 'c']);
  assert.deepEqual(ids(context.filterCatalogProducts(products, 'wafel', 'snack')), ['b']);
  assert.deepEqual(ids(context.filterCatalogProducts(products, 'wafel', 'drink')), []);
  // Saat jenis pesanan berubah, hasil mengikuti kuota katalog terbaru, bukan stok sebelumnya.
  const preorder = products.map(function (row) {
    return Object.assign({}, row, { available: row.id === 'a' ? 20 : 0 });
  });
  assert.deepEqual(ids(context.filterCatalogProducts(preorder, '', '')), ['a']);
  context.state.availableOnly = false;
  assert.deepEqual(ids(context.filterCatalogProducts(products, '', '')), ['a', 'b', 'c', 'd']);
  assert.match(client, /id="availability-filter"/);
  assert.ok(client.includes('class="catalog-filters"'));
  assert.ok(client.includes('</select><div class="availability-option">'));
  assert.match(source('css/styles.css'), /\.catalog-filters #product-search \{ grid-column: 1 \/ -1; \}/);
  assert.ok(client.includes("availableOnly: true"));
  assert.ok(client.includes('state.availableOnly = event.target.checked'));
});

test('Render halaman hanya meminta foto produk pada halaman aktif', function () {
  const client = source('js/client.js');
  const requested = [];
  const holder = {
    innerHTML: '',
    querySelectorAll: function () {
      return Array.from(this.innerHTML.matchAll(/data-photo="([^"]+)"/g), function (match) {
        return { dataset: { photo: match[1] } };
      });
    }
  };
  const pager = { innerHTML: '' };
  const products = Array.from({ length: 20 }, function (_, id) {
    return { id: 'p' + id, name: 'Produk ' + id, photoFileId: 'file' + id, categoryId: 'c1', available: 5, unitPrice: 15000 };
  });
  const context = vm.createContext({
    state: { productPage: 2, catalog: { products: products } },
    adminViewport: { matches: true }, window: {}, photoObserver: null,
    safe: String, rupiah: String, buttonLabel: function (name, text) { return text; },
    loadProductPhoto: function (element) { requested.push(element.dataset.photo); },
    document: {
      getElementById: function (id) {
        return { products: holder, 'product-pagination': pager,
          'product-search': { value: '' }, 'category-filter': { value: '' } }[id];
      }
    }
  });
  vm.runInContext(client.slice(client.indexOf('  function productPageData('),
    client.indexOf('  async function startCheckout(')), context);
  context.renderProducts();
  assert.deepEqual(requested, ['p8', 'p9', 'p10', 'p11']);
  assert.ok(pager.innerHTML.includes('Halaman 3 dari 5'));
  products.forEach(function (row, index) { row.available = index < 18 ? 0 : 5; });
  requested.length = 0;
  context.state.availableOnly = true;
  context.renderProducts();
  assert.deepEqual(requested, ['p18', 'p19']);
  assert.equal(pager.innerHTML, '');
  assert.equal(context.state.productPage, 0);
  products.forEach(function (row) { row.available = 0; });
  context.renderProducts();
  assert.ok(holder.innerHTML.includes('Belum ada produk tersedia sesuai filter'));
});

// Halaman tidak menunggu server, tetapi harga/stok tidak dianggap siap sebelum balasan.
test('Tampilan katalog langsung dibuat, memberi penjelasan setelah 5 detik, dan mengabaikan respons lama', async function () {
  const client = source('js/client.js');
  const requests = [];
  const timers = [];
  const renders = [];
  const state = { type: 'DIRECT', page: 'shop' };
  const context = vm.createContext({
    state: state,
    rpc: function (action, data, background) {
      assert.equal(background, true);
      return new Promise(function (resolve, reject) { requests.push({ resolve: resolve, reject: reject, data: data }); });
    },
    renderShop: function () { renders.push({ loading: state.catalogLoading, slow: state.catalogSlow }); },
    setTimeout: function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; },
    clearTimeout: function () {}
  });
  vm.runInContext(client.slice(client.indexOf('  let catalogRequest ='),
    client.indexOf('  function cartLines(')), context);
  const first = context.loadCatalog();
  assert.equal(renders.length, 1);
  assert.equal(state.catalog.products.length, 0);
  assert.equal(timers[0].delay, 5000);
  timers[0].callback();
  assert.equal(state.catalogSlow, true);
  state.type = 'PREORDER';
  const second = context.loadCatalog();
  requests[1].resolve({ products: ['baru'] });
  await second;
  requests[0].resolve({ products: ['lama'] });
  await first;
  assert.deepEqual(state.catalog.products, ['baru']);
  assert.equal(state.catalogLoading, false);
  const third = context.loadCatalog();
  state.page = 'status';
  const count = renders.length;
  requests[2].reject(new Error('Server lambat'));
  await third;
  assert.equal(renders.length, count);
  assert.equal(state.catalogError, 'Server lambat');
});

test('Foto latar tidak menahan indikator tindakan pengguna', async function () {
  const client = source('js/client.js');
  const requests = [];
  const changes = [];
  const context = vm.createContext({
    state: { token: '' },
    HealthyVibesApi: {
      request: function () { return new Promise(function (resolve) { requests.push(resolve); }); }
    },
    document: {
      getElementById: function () {
        return { classList: {
          remove: function () { changes.push('show'); },
          toggle: function (name, hidden) { changes.push(hidden ? 'hide' : 'show'); }
        } };
      }
    }
  });
  vm.runInContext(client.slice(client.indexOf('  let pending ='),
    client.indexOf('  function notify(')), context);
  const photo = context.rpc('productPhoto', {}, true);
  const action = context.rpc('quote', {});
  await Promise.resolve();
  requests[1]({ ok: true, data: {} });
  await action;
  assert.deepEqual(changes, ['show', 'hide']);
  requests[0]({ ok: true, data: {} });
  await photo;
  assert.deepEqual(changes, ['show', 'hide']);
});

test('Katalog menampilkan rincian diskon dan voucher yang aktif sesuai jenis pesanan', function () {
  const context = backend();
  vm.runInContext(source('apps-script/Rules.gs'), context);
  const stamp = Date.parse('2026-11-05T03:00:00Z');
  context.validPeriod_ = function (row) {
    return row.active && Date.parse(row.startsAt) <= stamp && Date.parse(row.endsAt) >= stamp;
  };
  let rounding = 'NEAREST';
  context.settings_ = function () { return { discountRounding: rounding }; };
  context.slots_ = function () { return { date: '2026-11-06', times: [] }; };
  const period = { active: true, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-10T09:00:00Z' };
  const tables = {
    Products: [{ id: 'p1', price: 10000, active: true, unit: 'Botol', sizeValue: 250, sizeUnit: 'ml',
      internal: 'RAHASIA' }, { id: 'p2', price: 10000, active: true }],
    Discounts: [
      Object.assign({}, period, { productId: 'p1', type: 'PERCENT', value: 20, internal: 'RAHASIA' }),
      Object.assign({}, period, { productId: 'p2', type: 'AMOUNT', value: 1000, endsAt: '2026-11-02T00:00:00Z' })
    ],
    Vouchers: ['ALL', 'DIRECT', 'PREORDER'].map(function (type) {
      return Object.assign({}, period, { code: type, orderType: type, type: 'PERCENT', value: 10,
        minimum: 5000, maximum: 20000, internal: 'RAHASIA' });
    })
  };
  tables.Vouchers.push(Object.assign({}, tables.Vouchers[0], { code: 'EXPIRED', endsAt: '2026-11-02T00:00:00Z' }));
  tables.Vouchers.push(Object.assign({}, tables.Vouchers[0], { code: 'FUTURE', startsAt: '2026-11-08T00:00:00Z' }));
  tables.Vouchers.push(Object.assign({}, tables.Vouchers[0], { code: 'INACTIVE', active: false }));
  context.rows_ = function (name) { return tables[name] || []; };
  for (const type of ['DIRECT', 'PREORDER']) {
    const result = context.catalog_({ type: type });
    assert.equal(result.products[0].unit, 'Botol');
    assert.equal(result.products[0].sizeValue, 250);
    assert.equal(result.products[0].sizeUnit, 'ml');
    assert.equal(result.products[0].unitPrice, 8000);
    assert.equal(result.products[0].discount.startsAt, period.startsAt);
    assert.equal(result.products[0].discount.endsAt, period.endsAt);
    assert.equal(result.products[1].discount, undefined);
    assert.deepEqual(Array.from(result.vouchers, function (row) { return row.code; }), ['ALL', type]);
    assert.ok(!JSON.stringify(result).includes('RAHASIA'));
  }
  rounding = '';
  const result = context.catalog_({ type: 'DIRECT' });
  assert.equal(result.products[0].unitPrice, 10000);
  assert.equal(result.products[0].discount, undefined);
  assert.equal(result.vouchers.length, 0);
});

test('Tampilan promo memberi tanggal WITA, syarat voucher, dan mengamankan kode', function () {
  const client = source('js/client.js');
  const context = vm.createContext({ window: {}, state: {} });
  vm.runInContext(source('js/icons.js'), context);
  context.buttonLabel = context.window.HV_UI.label;
  vm.runInContext(client.slice(client.indexOf('  function safe('), client.indexOf('  let pending =')), context);
  vm.runInContext(client.slice(client.indexOf('  function renderVouchers('),
    client.indexOf('  const productPhotos =')), context);
  vm.runInContext(client.slice(client.indexOf('  function renderProductDiscount('),
    client.indexOf('  function renderProducts(')), context);
  const period = { startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-10T09:00:00Z' };
  const discount = Object.assign({}, period, { type: 'PERCENT', value: 20 });
  const html = context.renderProductDiscount({ price: 10000, unitPrice: 8000, discount: discount });
  assert.ok(html.includes('Diskon 20%'));
  assert.ok(html.includes('01/11/2026 08:00 WITA'));
  assert.ok(html.includes('10/11/2026 17:00 WITA'));
  assert.equal(context.renderProductDiscount({ price: 10000, unitPrice: 10000 }), '');
  const voucher = Object.assign({}, period, { code: '<img src=x>', type: 'PERCENT', value: 10,
    minimum: 5000, maximum: 20000, orderType: 'ALL' });
  const vouchers = context.renderVouchers([voucher]);
  assert.ok(vouchers.includes('Minimum belanja'));
  assert.ok(vouchers.includes('Maksimal potongan'));
  assert.ok(vouchers.includes('produk tanpa diskon'));
  assert.ok(vouchers.includes('&lt;img'));
  assert.ok(!vouchers.includes('<img'));
  assert.equal(context.renderVouchers([]), '');
  context.state.catalogLoading = true;
  assert.equal(context.renderVouchers([voucher]), '');
});

test('Katalog membaca stok sekali dan mempertahankan aturan reservasi', function () {
  const context = backend();
  vm.runInContext(source('apps-script/Rules.gs'), context);
  context.settings_ = function () { return { discountRounding: 'NEAREST' }; };
  context.slots_ = function () { return { date: '2026-11-05', times: ['10:00'] }; };
  const makeOrder = function (state, fulfillment, prepared, quantity, json) {
    return { transactionState: state, fulfillment: fulfillment, preparedAt: prepared,
      snapshotJson: json || JSON.stringify({ items: [{ poolId: 'pool0', quantity: quantity }] }) };
  };
  const orders = [
    makeOrder('COMMITTED', 'NEW', '', 2), makeOrder('PREPARING', 'NEW', '', 1),
    makeOrder('COMMITTED', 'CANCELLED', '', 4), makeOrder('COMMITTED', 'CANCELLED', 'stamp', 1),
    makeOrder('ROLLED_BACK', 'NEW', '', 5)
  ];
  const calls = {};
  const products = Array.from({ length: 30 }, function (_, i) {
    return { id: 'p' + i, active: true, price: 10000 };
  });
  context.rows_ = function (name) {
    calls[name] = (calls[name] || 0) + 1;
    if (name === 'Products') { return products; }
    if (name === 'Orders') { return orders; }
    if (name === 'ReadyStock' || name === 'PreorderCapacity') {
      return products.map(function (product, i) {
        return { id: 'pool' + i, productId: product.id, capacity: 10, date: '2026-11-05' };
      });
    }
    return [];
  };
  for (const type of ['DIRECT', 'PREORDER']) {
    const result = context.catalog_({ type: type });
    assert.equal(calls[type === 'DIRECT' ? 'ReadyStock' : 'PreorderCapacity'], 1);
    assert.equal(result.products[0].available, 10 - context.usedCapacity_('pool0', orders));
    assert.equal(result.products[1].available, 10);
  }
  orders.push(makeOrder('COMMITTED', 'NEW', '', 1, '{invalid'));
  assert.equal(context.catalog_({ type: 'DIRECT' }).products[0].available, 0);
});

// Ikon dekoratif tidak menggantikan label tombol dan tidak menerima HTML dari data.
test('Ikon lokal mempertahankan teks tombol dan mengamankan label', function () {
  const context = vm.createContext({ window: {} });
  vm.runInContext(source('js/icons.js'), context);
  const markup = context.window.HV_UI.label('save', '<img src=x onerror=alert(1)>');
  assert.ok(markup.includes('class="ui-icon"'));
  assert.ok(markup.includes('aria-hidden="true"'));
  assert.ok(markup.includes('focusable="false"'));
  assert.ok(markup.includes('&lt;img'));
  assert.ok(!markup.includes('<img'));
  const html = source('index.html');
  assert.ok(html.indexOf('js/icons.js') < html.indexOf('js/client.js'));
});

// Data per menu diuji memakai database tiruan, tanpa mengakses akun pengelola nyata.
function adminContext(tables, reads) {
  const context = backend();
  for (const file of ['Schema.gs', 'Auth.gs', 'Admin.gs']) {
    vm.runInContext(source('apps-script/' + file), context);
  }
  context.rows_ = function (name) { reads.push(name); return tables[name] || []; };
  context.settings_ = function () { reads.push('Settings'); return { storeName: 'Toko uji' }; };
  return context;
}

test('Dashboard menghitung KPI dan grafik dari data transaksi tanpa laporan lengkap', function () {
  const reads = [];
  const context = adminContext({
    Orders: [
      { id: 'a', transactionState: 'COMMITTED', paymentStatus: 'UNPAID', fulfillment: 'NEW', type: 'PREORDER', date: '2026-11-12' },
      { id: 'b', transactionState: 'COMMITTED', paymentStatus: 'PAID', fulfillment: 'COMPLETED', type: 'DIRECT', date: '2026-11-11' },
      { id: 'c', transactionState: 'PREPARING', paymentStatus: 'UNPAID' }
    ],
    Payments: [{ orderId: 'a', amount: 100 }, { orderId: 'b', amount: 200 }, { orderId: 'c', amount: 500 }],
    Categories: [{ id: 'cat', name: 'Minuman' }],
    Products: [{ id: 'p', name: 'Teh', categoryId: 'cat' }],
    OrderItems: [{ orderId: 'a', productId: 'p', name: 'Teh', quantity: 2, subtotal: 100 }]
  }, reads);
  context.clock_ = function () { return { date: '2026-11-12' }; };
  context.report_ = function () { throw new Error('Dashboard tidak boleh menyusun laporan'); };
  const result = context.adminData_({ role: 'Admin' }, { page: 'Dashboard' });
  assert.deepEqual(reads, ['Orders', 'Payments', 'Categories', 'Products', 'OrderItems']);
  const kpi = JSON.parse(JSON.stringify(result.kpi));
  assert.equal(kpi.orders, 2);
  assert.equal(kpi.payments, 300);
  assert.equal(kpi.pending, 1);
  assert.equal(kpi.newOrders, 1);
  assert.equal(kpi.preorderToday, 1);
  assert.deepEqual(kpi.byCategory, [{ name: 'Minuman', value: 100 }]);
  assert.deepEqual(kpi.topProducts, [{ name: 'Teh', value: 2 }]);
  assert.deepEqual(kpi.preorderProducts, [{ name: 'Teh', quantity: 2 }]);
  assert.deepEqual(Object.keys(result.tables), []);
});

test('Data Admin hanya memuat tabel menu aktif beserta kebutuhan formulirnya', function () {
  for (const [page, expected] of [
    ['Products', ['Products', 'Categories']], ['ReadyStock', ['ReadyStock', 'Products']],
    ['PreorderCapacity', ['PreorderCapacity', 'Products']], ['Discounts', ['Discounts', 'Products']],
    ['Pesanan', ['Orders', 'Files', 'Shipping']], ['Laporan', ['Categories']],
    ['Pengaturan', ['Settings']], ['Backup', []], ['Users', ['Users']], ['ShippingRates', ['ShippingRates']]
  ]) {
    const reads = [];
    const context = adminContext({ Users: [{ id: 'u', name: 'Admin uji', role: 'Admin', passwordHash: 'RAHASIA' }],
      Orders: [{ id: 'o', accessHash: 'RAHASIA', requestHash: 'RAHASIA', snapshotJson: 'RAHASIA' }] }, reads);
    const result = context.adminData_({ role: 'Admin' }, { page: page });
    assert.deepEqual(reads, expected, page);
    assert.ok(!JSON.stringify(result).includes('RAHASIA'));
    assert.equal(result.kpi, undefined);
  }
});

test('Menu Admin tetap memeriksa sesi dan menolak menu di luar hak akses', function () {
  const reads = [];
  const context = adminContext({}, reads);
  for (const role of ['Viewer', 'Operator']) {
    for (const page of ['Users', 'ShippingRates', 'Pengaturan', 'Backup', 'Sessions']) {
      assert.throws(function () { context.adminData_({ role: role }, { page: page }); }, /tidak diizinkan/);
    }
  }
  assert.throws(function () { context.adminData_({ role: 'Viewer' }, { page: 'Pesanan' }); }, /tidak diizinkan/);
  assert.deepEqual(reads, []);
  context.authorize_ = function (token, roles) {
    assert.deepEqual(Array.from(roles), ['Admin', 'Operator', 'Viewer']);
    if (token !== 'sesi-uji') { throw new Error('Sesi tidak valid'); }
    return { role: 'Operator' };
  };
  assert.equal(readReply(post(context, { action: 'adminData', data: { page: 'Products' } })).message.response.ok, false);
  assert.equal(readReply(post(context, { action: 'adminData', token: 'sesi-uji', data: { page: 'Products' } })).message.response.ok, true);
  assert.deepEqual(reads, ['Products', 'Categories']);
});

test('Panel Admin tampil sebelum data selesai dan mengabaikan respons menu lama', async function () {
  const requests = [];
  const renders = [];
  const state = { token: 'sesi-uji', page: 'admin', adminPage: 'Dashboard' };
  const context = vm.createContext({
    state: state,
    renderAdmin: function () { renders.push({ loading: state.adminLoading, page: state.adminPage }); },
    rpc: function (action, data) {
      return new Promise(function (resolve, reject) { requests.push({ action, data, resolve, reject }); });
    }
  });
  const client = source('js/client.js');
  vm.runInContext(client.slice(client.indexOf('  let adminRequest ='),
    client.indexOf('  function adminMenu(')), context);
  const first = context.loadAdmin();
  assert.equal(renders[0].loading, true);
  assert.equal(requests[0].data.page, 'Dashboard');
  state.adminPage = 'Products';
  const second = context.loadAdmin();
  requests[1].resolve({ user: { role: 'Admin' }, tables: { Products: [] } });
  await second;
  assert.equal(state.adminLoading, false);
  const current = state.admin;
  const rendered = renders.length;
  requests[0].resolve({ user: { role: 'Admin' }, kpi: {} });
  await first;
  assert.equal(state.admin, current);
  assert.equal(renders.length, rendered);
  const third = context.loadAdmin();
  requests[2].reject(new Error('Server belum merespons'));
  await assert.rejects(third, /Server belum merespons/);
  assert.equal(state.adminLoading, false);
  assert.equal(state.adminError, 'Server belum merespons');
  const fourth = context.loadAdmin();
  state.token = '';
  requests[3].resolve({ user: { role: 'Admin' }, tables: {} });
  await fourth;
  assert.equal(state.admin, current);
});

// Render pengelola diuji tanpa akun atau transaksi Google nyata.
test('Navigasi pengelola berikon sesuai role, halaman aktif, dan ukuran layar', function () {
  const client = source('js/client.js');
  for (const role of ['Admin', 'Operator', 'Viewer']) {
    for (const mobile of [false, true]) {
      const body = { innerHTML: '' };
      const app = { innerHTML: '' };
      const context = vm.createContext({
        window: {}, app: app, safe: String, rupiah: String, renderAccountHeader() {},
        adminViewport: { matches: mobile },
        state: {
          adminPage: 'Dashboard', user: { name: 'Akun uji', role: role },
          admin: { kpi: { orders: 0, pending: 0, payments: 0, refundPending: 0, refunds: 0 } }
        },
        document: { getElementById: function () { return body; } }
      });
      vm.runInContext(source('js/icons.js'), context);
      context.buttonLabel = context.window.HV_UI.label;
      vm.runInContext(client.slice(client.indexOf('  function adminMenu('),
        client.indexOf('  function renderOrders(')), context);
      context.state.adminLoading = true;
      context.renderAdmin();
      assert.ok(body.innerHTML.includes('Mengambil data Dashboard'));
      assert.ok(!body.innerHTML.includes('class="kpis"'));
      context.state.adminLoading = false;
      context.renderAdmin();
      assert.ok(app.innerHTML.includes('id="admin-navigation"' + (mobile ? '>' : ' open>')));
      assert.ok(app.innerHTML.includes('aria-current="page"'));
      const buttons = Array.from(app.innerHTML.matchAll(/<button\b[^>]*data-admin-page="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g));
      assert.equal(buttons.length, role === 'Admin' ? 15 : role === 'Operator' ? 7 : 2);
      for (const button of buttons) {
        assert.ok(button[2].includes('<svg'), button[1]);
        assert.ok(button[2].includes('class="button-text"'), button[1]);
      }
      if (role !== 'Admin') { assert.ok(!app.innerHTML.includes('data-admin-page="Users"')); }
    }
  }
});

function sheetDateContext() {
  const context = vm.createContext({
    Date: Date,
    Utilities: {
      formatDate: function (date, timezone, format) {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(date);
        const get = function (key) { return parts.find(function (part) { return part.type === key; }).value; };
        return format === 'HH:mm' ? get('hour') + ':' + get('minute')
          : get('year') + '-' + get('month') + '-' + get('day');
      }
    }
  });
  for (const file of ['Store.gs', 'Schema.gs', 'Rules.gs']) {
    vm.runInContext(source('apps-script/' + file), context);
  }
  return context;
}

test('Jam 1899 dari Sheets memakai tampilan asli, tanpa selisih offset historis', function () {
  const context = sheetDateContext();
  const legacy = new Date('1899-12-30T00:02:24.000Z');
  assert.equal(context.sheetReadValue_('opens', legacy, '08:00:00', 'Asia/Makassar'), '08:00');
  assert.equal(context.sheetReadValue_('closes', legacy, '10:00:00 PM', 'Asia/Makassar'), '22:00');
  assert.equal(context.sheetReadValue_('opens', legacy, '12:00 AM', 'Asia/Makassar'), '00:00');
  assert.equal(context.sheetReadValue_('opens', legacy, '08.00.00', 'Asia/Makassar'), '08:00');
  assert.equal(context.sheetReadValue_('opens', '08:00', '08:00', 'Asia/Makassar'), '08:00');
  const schedule = [{
    weekday: 1, active: true,
    opens: context.sheetReadValue_('opens', legacy, '08:00', 'Asia/Makassar'),
    closes: context.sheetReadValue_('closes', legacy, '22:00', 'Asia/Makassar')
  }];
  const slots = context.slots_('DIRECT',
    { intervalMinutes: '30', preparationMinutes: '30' }, schedule,
    new Date('2026-11-02T07:49:00Z'));
  assert.equal(slots.times[0], '16:30');
});

test('Tanggal Sheet kembali ke format API, timestamp tetap ISO UTC', function () {
  const context = sheetDateContext();
  const date = new Date('2026-11-01T16:00:00Z');
  assert.equal(context.sheetReadValue_('date', date, '', 'Asia/Makassar'), '2026-11-02');
  assert.equal(context.sheetReadValue_('createdAt', date, '', 'Asia/Makassar'), date.toISOString());
  assert.equal(context.sheetWriteValue_('date', '2026-11-02').toISOString(), date.toISOString());
  assert.equal(context.sheetWriteValue_('createdAt', date.toISOString()).toISOString(), date.toISOString());
  assert.equal(context.sheetWriteValue_('opens', '08:00'), '08:00');
  assert.equal(context.temporalFormat_('timestamp'), 'dd/MM/yyyy HH:mm');
  assert.equal(context.temporalFormat_('time'), '@');
  assert.equal(context.sheetWriteValue_('name', '=IMPORTDATA("url")'), "'=IMPORTDATA(\"url\")");
});

test('Penulisan baris menjaga format kolom lain dan mencegah konversi jam ke 1899', function () {
  const context = sheetDateContext();
  const calls = [];
  const range = {
    getNumberFormats: function () { return [['General', 'General', '0.00']]; },
    setNumberFormats: function (value) { calls.push(['formats', value]); },
    setValues: function (value) { calls.push(['values', value]); }
  };
  context.writeSheetRow_({ getRange: function () { return range; } }, 2,
    ['opens', 'createdAt', 'price'], {
      opens: '08:00', createdAt: '2026-11-02T09:00:00Z', price: 25000
    });
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify([['@', 'dd/MM/yyyy HH:mm', '0.00']]));
  assert.equal(calls[1][1][0][0], '08:00');
  assert.equal(calls[1][1][0][1].toISOString(), '2026-11-02T09:00:00.000Z');
  assert.equal(calls[1][1][0][2], 25000);
});

test('Perbaikan Sheet mempertahankan ID, formula, dan hasil saat dijalankan ulang', function () {
  const context = sheetDateContext();
  const data = {
    ServiceHours: {
      headers: ['id', 'weekday', 'opens', 'closes', 'active'],
      rows: [['jam-1', 1, new Date('1899-12-30T00:02:24Z'),
        new Date('1899-12-30T14:02:24Z'), true]],
      display: [['jam-1', '1', '08:00:00', '22:00:00', 'TRUE']],
      formulas: [['', '', '', '', '']]
    },
    AuditLog: {
      headers: ['id', 'createdAt', 'actorId', 'action', 'entityId', 'detail'],
      rows: [
        ['log-1', '2026-11-02T09:00:00Z', 'admin-1', 'SAVE', 'jam-1', 'Asli'],
        ['log-2', new Date('2026-11-02T09:00:00Z'), 'admin-1', 'SAVE', 'jam-1', 'Formula']
      ],
      display: [
        ['log-1', '2026-11-02T09:00:00Z', 'admin-1', 'SAVE', 'jam-1', 'Asli'],
        ['log-2', '02/11/2026 17:00', 'admin-1', 'SAVE', 'jam-1', 'Formula']
      ],
      formulas: [['', '', '', '', '', ''], ['', '=NOW()', '', '', '', '']]
    }
  };
  const formats = [];
  context.requireSetupAccess_ = function () {};
  context.withLock_ = function (operation) { return operation(); };
  context.console = { info: function () {} };
  context.SpreadsheetApp = { flush: function () {} };
  context.database_ = function () {
    return {
      setSpreadsheetTimeZone: function (value) { assert.equal(value, 'Asia/Makassar'); },
      setSpreadsheetLocale: function (value) { assert.equal(value, 'id_ID'); },
      getSheetByName: function (name) {
        const table = data[name];
        if (!table) { return null; }
        return {
          getLastRow: function () { return table.rows.length + 1; },
          getRange: function (row, column, count, width) {
            const read = function (rows) {
              return rows.slice(row - 2, row - 2 + count)
                .map(function (values) { return values.slice(column - 1, column - 1 + width); });
            };
            return {
              getValues: function () { return row === 1 ? [table.headers] : read(table.rows); },
              getDisplayValues: function () { return read(table.display); },
              getFormulas: function () { return read(table.formulas); },
              setNumberFormat: function (format) { formats.push([name, column, format]); },
              setValues: function (values) {
                values.forEach(function (values, index) {
                  table.rows[row - 2 + index][column - 1] = values[0];
                });
              }
            };
          }
        };
      }
    };
  };
  assert.equal(context.formatHealthyVibesDates(), true);
  assert.equal(data.ServiceHours.rows[0][0], 'jam-1');
  assert.equal(data.ServiceHours.rows[0][2], '08:00');
  assert.equal(data.ServiceHours.rows[0][3], '22:00');
  assert.equal(data.AuditLog.rows[0][1].toISOString(), '2026-11-02T09:00:00.000Z');
  assert.equal(data.AuditLog.rows[1][1], '=NOW()');
  const snapshot = JSON.stringify(data);
  assert.equal(context.formatHealthyVibesDates(), true);
  assert.equal(JSON.stringify(data), snapshot);
  assert.ok(formats.some(function (item) { return item[2] === 'dd/MM/yyyy HH:mm'; }));
});

test('Tampilan WITA memakai DD/MM/YYYY HH:mm dan menolak tanggal yang tidak ada', function () {
  const client = source('js/client.js');
  const context = vm.createContext({});
  vm.runInContext(client.slice(client.indexOf('  function dateText('),
    client.indexOf('  let pending =')), context);
  vm.runInContext(client.slice(client.indexOf('  function toWitaInput('),
    client.indexOf('  function renderMaster(')), context);
  assert.equal(context.dateText('2026-11-02'), '02/11/2026');
  assert.equal(context.dateTimeText('2026-11-02T09:00:00Z'), '02/11/2026 17:00');
  assert.equal(context.dateTimeText('2026-11-01T16:00:00Z'), '02/11/2026 00:00');
  assert.equal(context.masterText('weekday', 1), 'Senin');
  assert.equal(context.fromWitaInput('02/11/2026 17:00'), '2026-11-02T09:00:00.000Z');
  assert.throws(function () { context.fromWitaInput('31/02/2026 17:00'); }, /tidak valid/);
  assert.throws(function () { context.fromWitaInput('02/11/2026 24:00'); }, /tidak valid/);
});

test('Aturan WITA, voucher, tagihan ongkir, dan reservasi tetap lulus', function () {
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
  for (const file of ['Store.gs', 'Schema.gs', 'Auth.gs', 'Accounts.gs', 'Tests.gs']) {
    vm.runInContext(source('apps-script/' + file), context);
  }
  return context;
}

function orderNumberContext(saved, locked) {
  const properties = new Map(saved ? [['ORDER_NUMBER_COUNTER', saved]] : []);
  const context = vm.createContext({
    Date: Date,
    LockService: { getScriptLock: function () {
      return { hasLock: function () { return locked !== false; } };
    } },
    PropertiesService: { getScriptProperties: function () {
      return {
        getProperty: function (key) { return properties.get(key) || null; },
        setProperty: function (key, value) { properties.set(key, value); }
      };
    } }
  });
  for (const file of ['Store.gs', 'Rules.gs', 'Orders.gs', 'Accounts.gs']) {
    vm.runInContext(source('apps-script/' + file), context);
  }
  return { context: context, properties: properties };
}

test('Nomor pesanan memakai HV-ddMMYY-0001 dengan reset pada tengah malam WITA', function () {
  const { context } = orderNumberContext();
  assert.equal(context.nextOrderId_('2026-11-01T16:00:00Z', []), 'HV-021126-0001');
  assert.equal(context.nextOrderId_('2026-11-02T15:59:59Z', []), 'HV-021126-0002');
  assert.equal(context.nextOrderId_('2026-11-02T16:00:00Z', []), 'HV-031126-0001');
  assert.equal(context.nextOrderId_('2028-02-28T16:00:00Z', []), 'HV-290228-0001');
});

test('Nomor pesanan membandingkan counter dan data, termasuk pesanan batal', function () {
  const { context } = orderNumberContext(JSON.stringify({ date: '2026-11-02', sequence: 2 }));
  const orders = [
    { id: 'HV-021126-0007', fulfillment: 'CANCELLED' },
    { id: 'HV-021126-0003', transactionState: 'PREPARING' },
    { id: 'HV-031126-9999' }, { id: 'HV-uuid-lama' }
  ];
  assert.equal(context.nextOrderId_('2026-11-02T09:00:00Z', orders), 'HV-021126-0008');
  assert.equal(context.nextOrderId_('2026-11-02T09:00:01Z', orders), 'HV-021126-0009');
  const restored = orderNumberContext().context;
  assert.equal(restored.nextOrderId_('2026-11-02T09:00:00Z', orders), 'HV-021126-0008');
});

test('Nomor pesanan menolak tanpa lock, counter rusak, dan nomor lebih dari 9999', function () {
  const noLock = orderNumberContext(null, false);
  assert.throws(function () {
    noLock.context.nextOrderId_('2026-11-02T09:00:00Z', []);
  }, /lock transaksi/);
  assert.equal(noLock.properties.size, 0);
  for (const saved of ['rusak', '{"date":"2026-11-02","sequence":-1}', 'null']) {
    const { context } = orderNumberContext(saved);
    assert.throws(function () { context.nextOrderId_('2026-11-02T09:00:00Z', []); }, /tidak valid/);
  }
  const { context, properties } = orderNumberContext(JSON.stringify({
    date: '2026-11-02', sequence: 9998
  }));
  assert.equal(context.nextOrderId_('2026-11-02T09:00:00Z', []), 'HV-021126-9999');
  const prior = properties.get('ORDER_NUMBER_COUNTER');
  assert.throws(function () { context.nextOrderId_('2026-11-02T09:00:00Z', []); }, /9999/);
  assert.equal(properties.get('ORDER_NUMBER_COUNTER'), prior);
  assert.equal(context.nextOrderId_('2026-11-02T16:00:00Z', []), 'HV-031126-0001');
});

test('Checkout dan tampilan akun tidak menyediakan akses kunci privat lama', function () {
  const client = source('js/client.js');
  const code = client.slice(client.indexOf('  function checkoutPayload('),
    client.indexOf('  // Menampilkan langkah penerima'));
  const context = vm.createContext({
    state: { recipient: {}, type: 'DIRECT', requestId: 'request1', accessToken: 'legacy-only',
      catalog: { schedule: { date: '2026-11-06' } } },
    cartLines: () => [{ product: { id: 'p1' }, quantity: 1 }]
  });
  vm.runInContext(code, context);
  assert.ok(!('accessToken' in context.checkoutPayload()));
  assert.ok(!client.includes('function randomToken('));
  for (const removed of ['Unduh Kunci Akses', 'legacy-orders', 'reset-access-form',
    'orderAccessForm', 'state.accessToken', "'customerUpload'", "'orderStatus'", "'customerInvoice'"]) {
    assert.ok(!client.includes(removed), removed);
  }
});

test('Status hanya dapat dibuka melalui pemilik akun dan tidak membocorkan hash', function () {
  const { context } = orderNumberContext();
  const digest = function (value) {
    return require('node:crypto').createHash('sha256').update(value).digest('hex');
  };
  context.digest_ = digest;
  context.equal_ = function (left, right) { return left === right; };
  for (const key of ['AbC123_-xy', 'a'.repeat(43)]) {
    const order = {
      id: 'HV-051126-0001', customerId: 'consumer1', accessHash: digest(key),
      transactionState: 'COMMITTED', snapshotJson: '{"items":[]}'
    };
    context.rows_ = function () { return [order]; };
    const user = { id: 'consumer1', role: 'Konsumen' };
    assert.equal(context.accountOrderAccess_(user, { orderId: order.id }), order);
    for (const wrong of [null, { id: 'other', role: 'Konsumen' }, { id: 'consumer1', role: 'Admin' }]) {
      assert.throws(function () {
        context.accountOrderAccess_(wrong, { orderId: order.id, accessToken: key });
      }, /Login|tidak ditemukan/);
    }
    context.publicRecord_ = function (record, fields) {
      return Object.fromEntries(fields.map(function (field) { return [field, record[field]]; }));
    };
    const customer = context.customerOrder_(order);
    assert.ok(!Object.hasOwn(customer, 'accessHash'));
    assert.ok(!Object.hasOwn(customer, 'accessToken'));
  }
});

// Rotasi memakai data tiruan: tidak menyentuh pesanan maupun akun produksi.
function recoveryContext(role) {
  const context = backend();
  vm.runInContext(source('apps-script/Admin.gs'), context);
  vm.runInContext(source('apps-script/Auth.gs'), context);
  vm.runInContext(source('apps-script/Orders.gs'), context);
  const digest = value => require('node:crypto').createHash('sha256').update(String(value)).digest('hex');
  const order = {
    id: 'HV-051126-0001', phone: '081234567890', transactionState: 'COMMITTED',
    accessHash: digest('oldKey1234'), snapshotJson: '{"items":[]}', total: 50000,
    paymentStatus: 'PAID', fulfillment: 'CONFIRMED', requestHash: 'unchanged'
  };
  const audits = [];
  const writes = [];
  let locks = 0;
  context.digest_ = digest;
  context.secureBytes_ = length => Array.from(require('node:crypto').randomBytes(length));
  context.rows_ = name => name === 'Orders' ? [order] : [];
  context.patch_ = (name, record, changes) => {
    writes.push({ name, changes });
    Object.assign(record, changes);
  };
  context.audit_ = (user, action, id, detail) => audits.push({ action, id, detail });
  context.authorize_ = (token, roles) => {
    if (token !== 'session' || !roles.includes(role)) { throw new Error('Tidak diizinkan'); }
    return { id: 'admin1', role };
  };
  context.withLock_ = operation => { locks += 1; return operation(); };
  return { context, order, audits, writes, locks: () => locks };
}

test('Endpoint pemulihan kunci lama tidak lagi tersedia untuk Admin', function () {
  const fixture = recoveryContext('Admin');
  const before = { ...fixture.order };
  const result = fixture.context.api_({
    action: 'resetOrderAccess', token: 'session',
    data: { orderId: before.id, phone: before.phone, confirmed: true }
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /tidak dikenal/);
  assert.equal(fixture.locks(), 1);
  assert.equal(fixture.writes.length, 0);
  assert.deepEqual(fixture.order, before);
  assert.equal(fixture.audits.length, 0);
});

test('Pemulihan kunci lama ditolak untuk seluruh level dan tanpa sesi', function () {
  for (const role of ['Operator', 'Viewer', 'Admin']) {
    const fixture = recoveryContext(role);
    const data = { orderId: fixture.order.id, phone: fixture.order.phone, confirmed: true };
    const result = fixture.context.api_({
      action: 'resetOrderAccess', token: role === 'Admin' ? '' : 'session', data
    });
    assert.equal(result.ok, false);
    assert.equal(fixture.writes.length, 0);
    assert.equal(fixture.audits.length, 0);
    assert.equal(fixture.context.resetOrderAccess_, undefined);
  }
});

test('Payload lama apa pun tidak dapat mengaktifkan kembali pemulihan kunci', function () {
  const fixture = recoveryContext('Admin');
  const valid = { orderId: fixture.order.id, phone: fixture.order.phone, confirmed: true };
  for (const changes of [
    { orderId: 'tidak-ada' }, { phone: '089999999999' },
    { confirmed: false }, { confirmed: 'true' }, { phone: '' }
  ]) {
    const result = fixture.context.api_({
      action: 'resetOrderAccess', token: 'session', data: { ...valid, ...changes }
    });
    assert.equal(result.ok, false);
  }
  fixture.order.transactionState = 'PREPARING';
  assert.equal(fixture.context.api_({
    action: 'resetOrderAccess', token: 'session', data: valid
  }).ok, false);
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.audits.length, 0);
});

test('Form pesanan hanya menampilkan Login tanpa formulir kunci lama', function () {
  const client = source('js/client.js');
  const context = vm.createContext({
    safe: value => String(value || ''),
    buttonLabel: (icon, label) => label,
    app: { innerHTML: '' }
  });
  vm.runInContext(client.slice(client.indexOf('  function renderStatusForm('),
    client.indexOf('  function fulfillmentLabel(')), context);
  context.renderStatusForm();
  assert.ok(context.app.innerHTML.includes('Login'));
  assert.ok(!context.app.innerHTML.includes('<form'));
  assert.ok(!context.app.innerHTML.includes('<details'));
  assert.ok(!client.includes('orderAccessForm('));
  assert.ok(client.includes("dialog.addEventListener('close'"));
});

test('Retry pesanan mempertahankan nomor lama tanpa mengambil urutan baru', function () {
  const { context, properties } = orderNumberContext();
  context.recoverOrders_ = function () {};
  context.settings_ = function () { return { ordersEnabled: 'true' }; };
  context.digest_ = function () { return 'hash'; };
  context.equal_ = function (left, right) { return left === right; };
  context.saveCustomerDelivery_ = function () {};
  context.rows_ = function () {
    return [{ id: 'HV-021126-0001', requestId: 'retry-1', requestHash: 'hash', customerId: 'consumer1' }];
  };
  context.customerOrder_ = function (order) { return { id: order.id }; };
  context.nextOrderId_ = function () { throw new Error('Tidak boleh mengambil nomor baru saat retry.'); };
  const data = {
    requestId: 'retry-1', name: 'Pelanggan', phone: '081234567890', acceptPolicy: true
  };
  assert.equal(context.createOrder_(data, { id: 'consumer1', role: 'Konsumen' }).id, 'HV-021126-0001');
  assert.throws(() => context.createOrder_(data), /akun Konsumen/);
  assert.throws(() => context.createOrder_(data, { id: 'other', role: 'Konsumen' }), /data berbeda/);
  assert.equal(properties.size, 0);
  assert.ok(source('apps-script/Files.gs').includes("const name = 'NO-' + order.id + '.pdf';"));
});

test('Pembuatan pesanan menyimpan nomor baru dan retry tidak menaikkan counter', function () {
  const { context, properties } = orderNumberContext();
  const orders = [];
  context.recoverOrders_ = function () {};
  context.settings_ = function () { return { ordersEnabled: 'true', refundRounding: 'NEAREST' }; };
  context.rows_ = function () { return orders; };
  context.now_ = function () { return '2026-11-02T09:00:00Z'; };
  context.digest_ = function () { return 'hash'; };
  context.equal_ = function (left, right) { return left === right; };
  context.quote_ = function () { return {
    subtotal: 25000, total: 25000, voucherDiscount: 0,
    items: [{ name: 'Produk', quantity: 1, unitPrice: 25000 }]
  }; };
  context.append_ = function (table, record) {
    assert.equal(table, 'Orders');
    orders.push(record);
    return record;
  };
  context.finishOrder_ = function (order) { order.transactionState = 'COMMITTED'; return order; };
  context.audit_ = function () {};
  context.saveCustomerDelivery_ = function () {};
  context.SpreadsheetApp = { flush: function () {} };
  const data = {
    requestId: 'pesanan-1', accessToken: 'AbC123_-xy', name: 'Pelanggan',
    phone: '081234567890', acceptPolicy: true, type: 'DIRECT',
    receipt: 'PICKUP', paymentMethod: 'PICKUP_CASH', date: '2026-11-02', time: '17:00'
  };
  const user = { id: 'consumer1', role: 'Konsumen' };
  assert.equal(context.createOrder_(data, user).id, 'HV-021126-0001');
  assert.equal(context.createOrder_(data, user).id, 'HV-021126-0001');
  assert.equal(orders.length, 1);
  assert.equal(JSON.parse(properties.get('ORDER_NUMBER_COUNTER')).sequence, 1);
  assert.equal(context.createOrder_(Object.assign({}, data, { requestId: 'pesanan-2' }), user).id,
    'HV-021126-0002');
  assert.equal(orders.length, 2);
});

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
      'installHealthyVibes', 'verifyAuthRuntime', 'createFirstAdmin', 'runRuleTests',
      'formatHealthyVibesDates'
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

// Form tiruan memeriksa aturan enabled/disabled tanpa mengakses backend nyata.
function actionFormContext() {
  const client = source('js/client.js');
  const order = {
    id: 'order1', total: 50000, fulfillment: 'NEW', paymentStatus: 'UNPAID',
    receipt: 'DELIVERY', cancelRequestedAt: '2026-11-05T00:00:00Z', refundAmount: 45000
  };
  const nodes = {};
  const form = { dataset: { id: order.id }, elements: { action: { value: '' } },
    querySelector: selector => nodes[selector] || (nodes[selector] = {}) };
  for (const name of ['status', 'amount', 'reference', 'courier', 'tracking']) {
    form.elements[name] = {
      type: 'text',
      value: 'nilai lama', checked: true, disabled: false, required: true
    };
  }
  const context = vm.createContext({
    state: { admin: { tables: { Orders: [order], Shipping: [] } } },
    safe: String, fulfillmentLabel: String
  });
  vm.runInContext(client.slice(client.indexOf('  function orderActionRules('),
    client.indexOf('  function masterFields(')), context);
  return { context, form, order };
}

test('Semua input tindakan nonaktif secara default; pilihan hanya mengaktifkan input terkait', function () {
  const { context, form, order } = actionFormContext();
  context.updateOrderAction(form);
  assert.ok(form.querySelector('[type="submit"]').disabled);
  assert.ok(Object.entries(form.elements).filter(([key]) => key !== 'action')
    .every(([, input]) => input.disabled && !input.required));
  const expected = {
    verifyPayment: ['amount', 'reference'], fulfillment: ['status'], shipping: ['courier', 'tracking']
  };
  for (const [action, fields] of Object.entries(expected)) {
    order.fulfillment = 'NEW';
    form.elements.action.value = action;
    context.updateOrderAction(form);
    const enabled = Object.entries(form.elements).filter(([key, input]) => key !== 'action' && !input.disabled)
      .map(([key]) => key).sort();
    assert.deepEqual(enabled, fields.slice().sort());
    assert.equal(form.querySelector('[type="submit"]').disabled, false);
    assert.ok(form.querySelector('#order-action-help').textContent.length > 40);
    for (const name of context.orderActionRules(action).required) {
      assert.equal(form.elements[name].required, true);
    }
  }
  assert.equal(form.elements.reference.value, '');
  assert.equal(form.elements.amount.value, '');
  assert.equal(context.orderActionRules('tidak-valid'), null);
});

test('Tahap tidak dapat dilompati; tindakan tidak berlaku tetap disabled', function () {
  const { context, form, order } = actionFormContext();
  form.elements.action.value = 'fulfillment';
  order.fulfillment = 'READY';
  order.receipt = 'PICKUP';
  context.updateOrderAction(form);
  assert.ok(form.elements.status.innerHTML.includes('COMPLETED'));
  assert.ok(!form.elements.status.innerHTML.includes('DISPATCHED'));
  const cases = [
    ['shipping', { receipt: 'PICKUP' }], ['verifyPayment', { paymentStatus: 'PAID' }],
    ['fulfillment', { fulfillment: 'COMPLETED' }]
  ];
  for (const [action, changes] of cases) {
    Object.assign(order, changes);
    form.elements.action.value = action;
    context.updateOrderAction(form);
    assert.equal(form.querySelector('[type="submit"]').disabled, true, action);
    assert.ok(Object.entries(form.elements).filter(([key]) => key !== 'action')
      .every(([, input]) => input.disabled && !input.required));
  }
});

test('Status pelanggan memisahkan pembayaran dan tahap; riwayat lama tetap terbaca tanpa opsi pembatalan', function () {
  const client = source('js/client.js');
  const context = vm.createContext({ safe: String, rupiah: String, dateTimeText: String });
  vm.runInContext(client.slice(client.indexOf('  function fulfillmentLabel('),
    client.indexOf('  function renderOrder(')), context);
  for (const fulfillment of ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'COMPLETED']) {
    const html = context.orderStatusPanel({ fulfillment, receipt: 'DELIVERY', paymentStatus: 'PAID' });
    assert.ok(html.includes('Lunas'));
    assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
    assert.ok(html.includes(context.fulfillmentLabel(fulfillment)));
    assert.ok(!html.includes('>PAID<'));
  }
  const pending = context.orderStatusPanel({
    fulfillment: 'PREPARING', receipt: 'PICKUP', paymentStatus: 'UNPAID', cancelRequestedAt: 'stamp'
  });
  assert.ok(pending.includes('Belum lunas'));
  assert.ok(!pending.includes('Permintaan pembatalan'));
  assert.ok(!pending.includes('Sedang dikirim'));
  const cancelled = context.orderStatusPanel({
    fulfillment: 'CANCELLED', paymentStatus: 'PAID', refundStatus: 'PENDING',
    refundAmount: 45000, refundDueAt: '2026-11-06'
  });
  assert.ok(cancelled.includes('Dibatalkan'));
  assert.ok(!cancelled.includes('Menunggu transfer toko'));
  assert.ok(!cancelled.includes('order-progress'));
});

test('Detail pelanggan memuat bagian terpisah dan tidak meminta bukti untuk pesanan lunas', function () {
  const client = source('js/client.js');
  const context = vm.createContext({
    app: { innerHTML: '' }, state: { accessToken: 'AbC123_-xy', order: {
      id: 'order1', receipt: 'PICKUP', fulfillment: 'COMPLETED', paymentStatus: 'PAID',
      items: [{ name: 'Produk', quantity: 2, unitPrice: 10000 }], total: 20000
    } }, safe: String, rupiah: String, dateText: String, dateTimeText: String,
    buttonLabel: (icon, label) => label, field: () => ''
  });
  vm.runInContext(client.slice(client.indexOf('  function fulfillmentLabel('),
    client.indexOf('  function renderLogin(')), context);
  context.renderOrder();
  const html = context.app.innerHTML;
  for (const title of ['Jadwal dan Penerima', 'Rincian Produk', 'Dokumen Pesanan', 'Perbarui Status']) {
    assert.ok(html.includes(title));
  }
  assert.ok(!html.includes('id="proof-form"'));
  assert.ok(!html.includes('id="cancel-form"'));
  context.state.order.paymentStatus = 'UNPAID';
  context.state.order.fulfillment = 'NEW';
  context.renderOrder();
  assert.ok(context.app.innerHTML.includes('id="proof-form"'));
  assert.ok(!context.app.innerHTML.includes('id="cancel-form"'));
});

test('Detail Admin menampilkan struk terbaru tanpa pemulihan kunci', function () {
  const client = source('js/client.js');
  let html = '';
  const context = vm.createContext({
    state: { user: { role: 'Admin' }, admin: { tables: {
      Orders: [{ id: 'order1', name: 'Uji', phone: '08123', transactionState: 'COMMITTED' }],
      Files: [
        { orderId: 'order1', kind: 'STRUK', driveFileId: 'old', createdAt: '2026-11-01' },
        { orderId: 'order1', kind: 'STRUK', driveFileId: 'latest', createdAt: '2026-11-05' },
        { orderId: 'order2', kind: 'STRUK', driveFileId: 'other', createdAt: '2026-11-06' }
      ]
    } } }, safe: String, rupiah: String, orderStatusPanel: () => '', orderCharges: () => '',
    canManageMaster: () => true,
    buttonLabel: (icon, label) => label, field: () => '', selectField: () => '',
    showEditor: (title, content) => { html = content; }
  });
  vm.runInContext(client.slice(client.indexOf('  function orderEditor('),
    client.indexOf('  function masterFields(')), context);
  context.orderEditor('order1');
  assert.equal((html.match(/Lihat Struk/g) || []).length, 1);
  assert.ok(html.includes('data-file="latest"'));
  assert.ok(!html.includes('data-file="old"'));
  assert.ok(!html.includes('id="handover-form"'));
  assert.ok(!html.includes('id="reset-access-form"'));
  assert.ok(html.includes('id="order-action-result"'));
});

test('Status tanda terima selalu terlihat; input hanya aktif setelah dikirim atau siap diambil', function () {
  const client = source('js/client.js');
  const context = vm.createContext({
    app: { innerHTML: '' }, state: { accessToken: 'key', order: { id: 'o1', items: [], paymentStatus: 'PAID' } },
    safe: String, rupiah: String, dateText: String, dateTimeText: String,
    buttonLabel: (icon, label) => label, field: () => ''
  });
  vm.runInContext(client.slice(client.indexOf('  function fulfillmentLabel('),
    client.indexOf('  function renderLogin(')), context);
  for (const receipt of ['PICKUP', 'DELIVERY']) {
    for (const fulfillment of ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'COMPLETED', 'CANCELLED']) {
      Object.assign(context.state.order, { receipt, fulfillment, handoverUploaded: false });
      context.renderOrder();
      const eligible = receipt === 'PICKUP' ? fulfillment === 'READY' : fulfillment === 'DISPATCHED';
      assert.ok(context.app.innerHTML.includes('Status: Belum diunggah.'));
      assert.ok(context.app.innerHTML.includes('id="handover-form"'));
      assert.equal(/id="handover-photo"[^>]* disabled/.test(context.app.innerHTML), !eligible, receipt + '/' + fulfillment);
    }
  }
  context.state.order.handoverUploaded = true;
  context.renderOrder();
  assert.ok(context.app.innerHTML.includes('Foto tanda terima sudah tersimpan'));
  assert.ok(!context.app.innerHTML.includes('id="handover-form"'));
});

// Drive dan gambar ditiru; pemeriksaan kepemilikan memakai fungsi backend asli.
function handoverContext() {
  const fixture = recoveryContext('Konsumen');
  const context = fixture.context;
  const files = [];
  Object.assign(fixture.order, { customerId: 'admin1', receipt: 'DELIVERY', fulfillment: 'DISPATCHED' });
  vm.runInContext(source('apps-script/Files.gs'), context);
  context.rows_ = name => name === 'Orders' ? [fixture.order] : name === 'Files' ? files : [];
  context.id_ = () => 'record1';
  context.now_ = () => '2026-11-05T08:00:00Z';
  context.append_ = (table, record) => { assert.equal(table, 'Files'); files.push(record); };
  context.imageBlob_ = () => ({
    getName: () => 'proof.jpg', getBytes: () => Array(32).fill(0),
    setName: function () { return this; }
  });
  context.folder_ = kind => {
    assert.equal(kind, 'TANDATERIMA');
    return { getFiles: () => ({ hasNext: () => false }), createFile: () => ({
      getId: () => 'private-proof-id', setDescription() {}, setName() {}
    }) };
  };
  return { ...fixture, files, data: {
    orderId: fixture.order.id, accessToken: 'oldKey1234', received: true,
    kind: 'TANDATERIMA', requestId: 'upload-1', mimeType: 'image/jpeg', base64: 'test'
  } };
}

test('Konsumen mengunggah tanda terima dengan sesi valid; retry tidak menggandakan berkas', function () {
  const { context, files, data, order } = handoverContext();
  const result = context.api_({ action: 'myOrderUpload', token: 'session', data });
  assert.equal(result.ok, true);
  assert.equal(files.length, 1);
  assert.equal(files[0].uploadedBy, 'CUSTOMER');
  assert.equal(files[0].orderId, order.id);
  assert.equal(context.api_({ action: 'myOrderUpload', token: 'session', data }).ok, true);
  assert.equal(files.length, 1);
  const customer = context.customerOrder_(order);
  assert.equal(customer.handoverUploaded, true);
  assert.ok(!JSON.stringify(customer).includes('private-proof-id'));
  assert.ok(!Object.hasOwn(customer, 'accessHash'));
  context.paidAmount_ = () => Number(order.total);
  context.fulfillment_({ id: 'admin1' }, { orderId: order.id, status: 'COMPLETED' });
  assert.equal(order.fulfillment, 'COMPLETED');
});

test('Unggahan tanda terima menolak Admin, tanpa sesi, tahap awal, dan tanpa konfirmasi', function () {
  const { context, files, data, order } = handoverContext();
  for (const role of ['Admin', 'Operator', 'Viewer']) {
    assert.throws(() => context.upload_({ role }, data), /konsumen/);
  }
  assert.equal(context.api_({ action: 'myOrderUpload', data }).ok, false);
  for (const changes of [{ orderId: 'other' }, { received: false }, { received: 'true' }]) {
    assert.equal(context.api_({ action: 'myOrderUpload', token: 'session', data: { ...data, ...changes } }).ok, false);
  }
  for (const fulfillment of ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']) {
    order.fulfillment = fulfillment;
    assert.equal(context.api_({ action: 'myOrderUpload', token: 'session', data }).ok, false);
  }
  order.receipt = 'PICKUP';
  order.fulfillment = 'READY';
  assert.equal(context.api_({ action: 'myOrderUpload', token: 'session', data }).ok, true);
  assert.equal(files.length, 1);
});

test('Sedang dikirim memerlukan pelunasan, tanpa konfirmasi ongkir tambahan', function () {
  const { context, order, writes } = recoveryContext('Admin');
  Object.assign(order, { receipt: 'DELIVERY', fulfillment: 'READY' });
  let paid = false;
  context.rows_ = name => name === 'Orders' ? [order] : [];
  context.paidAmount_ = () => paid ? order.total : 0;
  context.settings_ = () => { throw new Error('Tidak perlu pengaturan GoSend'); };
  const run = () => context.fulfillment_({ id: 'admin1' }, { orderId: order.id, status: 'DISPATCHED' });
  assert.throws(run, /lunas/);
  paid = true;
  assert.equal(writes.length, 0);
  run();
  assert.equal(order.fulfillment, 'DISPATCHED');
  assert.equal(writes.length, 1);
  assert.throws(() => context.fulfillment_({ id: 'admin1' }, { orderId: order.id, status: 'COMPLETED' }), /konsumen/);
});

test('Form tanda terima memakai endpoint akun tanpa mengirim kunci privat', async function () {
  const client = source('js/client.js');
  let request;
  const context = vm.createContext({
    state: { page: 'status', order: { id: 'order1' }, accessToken: 'customer-key' }, crypto,
    formData: () => ({ received: 'on' }),
    photoData: async () => ({ mimeType: 'image/jpeg', base64: 'photo' }),
    rpc: async (action, data) => { request = { action, data }; },
    renderOrder: () => {}, notify: () => {}
  });
  vm.runInContext(client.slice(client.indexOf('  async function submitAction('),
    client.indexOf('  // Menangani halaman sebelum instalasi')), context);
  await context.submitAction({ id: 'handover-form', elements: { photo: { files: [{}] } } });
  assert.equal(request.action, 'myOrderUpload');
  assert.equal(request.data.kind, 'TANDATERIMA');
  assert.equal(request.data.orderId, 'order1');
  assert.ok(!Object.hasOwn(request.data, 'accessToken'));
  assert.equal(request.data.received, true);
  assert.equal(context.state.order.handoverUploaded, true);
});

// Seluruh transaksi ongkir memakai Sheets/Drive tiruan, bukan layanan produksi.
function shippingContext() {
  const { context, properties } = orderNumberContext();
  properties.set('DATABASE_ID', 'testdb');
  for (const file of ['Schema.gs', 'Admin.gs', 'Api.gs', 'Files.gs']) {
    vm.runInContext(source('apps-script/' + file), context);
  }
  const tables = Object.fromEntries(Object.keys(context.HV_SCHEMA || vm.runInContext('HV_SCHEMA', context))
    .map(name => [name, []]));
  tables.Products.push({ id: 'p1', name: 'Produk', categoryId: 'cat', price: 50000, active: true });
  tables.ReadyStock.push({ id: 'pool1', productId: 'p1', capacity: 20 });
  tables.PreorderCapacity.push({ id: 'prepool1', productId: 'p1', date: '2026-11-06', capacity: 20 });
  tables.ServiceAreas.push({ id: 'area1', name: 'Makassar', active: true });
  tables.ShippingRates.push(
    { id: 'gojek', name: 'Gojek', price: 10000, active: true },
    { id: 'grab', name: 'Grab', price: 11000, active: true },
    { id: 'off', name: 'Tidak aktif', price: 1, active: false });
  tables.Vouchers.push({ code: 'HEMAT', type: 'AMOUNT', value: 5000, minimum: 50000,
    maximum: 0, orderType: 'ALL', active: true });
  const schema = vm.runInContext('HV_SCHEMA', context);
  context.rows_ = name => tables[name] || [];
  context.withLock_ = operation => operation();
  context.settings_ = () => ({ ordersEnabled: 'true', discountRounding: 'NEAREST', storeName: 'Toko Uji' });
  context.slots_ = type => ({ date: type === 'PREORDER' ? '2026-11-06' : '2026-11-05', times: ['16:00'] });
  context.clock_ = () => ({ date: '2026-11-05', tomorrow: '2026-11-06' });
  context.now_ = () => '2026-11-05T07:00:00Z';
  context.validPeriod_ = row => row.active === true;
  context.digest_ = value => require('node:crypto').createHash('sha256').update(String(value)).digest('hex');
  context.equal_ = (a, b) => a === b;
  let counter = 0;
  context.id_ = () => 'id' + (++counter);
  context.audit_ = () => {};
  context.saveCustomerDelivery_ = () => {};
  const createOrder = context.createOrder_;
  context.createOrder_ = data => createOrder(data, { id: 'consumer1', role: 'Konsumen' });
  context.append_ = (table, record) => {
    const saved = Object.fromEntries(Array.from(schema[table], key => [key, record[key] == null ? '' : record[key]]));
    tables[table].push(saved);
    return saved;
  };
  context.patch_ = (table, record, changes) => Object.assign(record, changes);
  context.SpreadsheetApp = { flush: () => {} };
  context.authorize_ = (token, roles) => {
    const role = token || 'Admin';
    if (!roles.includes(role)) { throw new Error('Tidak berwenang'); }
    return { id: 'admin1', role };
  };
  return { context, tables, properties, data: {
    requestId: 'order-request-1', accessToken: 'AbC123_-xy', name: 'Pelanggan',
    phone: '081234567890', type: 'DIRECT', receipt: 'DELIVERY', shippingRateId: 'gojek',
    areaId: 'area1', address: 'Alamat Makassar', paymentMethod: 'TRANSFER', acceptPolicy: true,
    date: '2026-11-05', time: '16:00', items: [{ productId: 'p1', quantity: 1 }], voucherCode: 'HEMAT'
  } };
}

test('Quote menjumlahkan produk setelah voucher dan ongkir; nominal dari browser diabaikan', function () {
  const { context, data } = shippingContext();
  const result = context.quote_({ ...data, shippingFee: 1, total: 1 });
  assert.equal(result.productTotal, 45000);
  assert.equal(result.shippingFee, 10000);
  assert.equal(result.total, 55000);
  assert.equal(result.shipping.provider, 'Gojek');
  assert.equal(context.quote_({ ...data, shippingRateId: 'grab' }).total, 56000);
  const pickup = context.quote_({ ...data, receipt: 'PICKUP', shippingRateId: 'off' });
  assert.equal(pickup.shippingFee, 0);
  assert.equal(pickup.total, 45000);
  for (const id of ['', 'missing', 'off']) {
    assert.throws(() => context.quote_({ ...data, shippingRateId: id }), /pengiriman/);
  }
});

test('Ambil sendiri tidak dikenakan ongkir; preorder antar tetap memasukkan ongkir dan batas pembayaran', function () {
  const { context, tables, data } = shippingContext();
  const pickup = context.createOrder_({ ...data, receipt: 'PICKUP', paymentMethod: 'PICKUP_CASH' });
  assert.equal(pickup.total, 45000);
  assert.equal(pickup.shippingFee, 0);
  assert.equal(tables.Shipping.length, 0);
  const preorder = context.createOrder_({ ...data, requestId: 'preorder-1', type: 'PREORDER', date: '2026-11-06' });
  assert.equal(preorder.total, 55000);
  assert.equal(preorder.shippingFee, 10000);
  assert.equal(preorder.paymentDeadline, '2026-11-05T10:00:00.000Z');
  assert.equal(tables.Shipping.length, 1);
  assert.throws(() => context.createOrder_({ ...data, requestId: 'wrong-cash', paymentMethod: 'PICKUP_CASH' }), /Bayar saat ambil/);
});

test('Minimum voucher tidak dihitung dari ongkir, termasuk layanan dengan tarif nol', function () {
  const { context, tables, data } = shippingContext();
  tables.Products[0].price = 49000;
  assert.throws(() => context.quote_(data), /Minimum belanja/);
  tables.ShippingRates[0].price = 0;
  const free = context.quote_({ ...data, voucherCode: '' });
  assert.equal(free.total, 49000);
  assert.equal(free.shippingFee, 0);
  assert.equal(free.shipping.included, true);
});

test('Ongkir baru disimpan di snapshot; retry dan rekonsiliasi tidak memakai harga terbaru', function () {
  const { context, tables, data, properties } = shippingContext();
  const result = context.createOrder_(data);
  assert.equal(result.total, 55000);
  assert.equal(result.productTotal, 45000);
  assert.equal(result.shippingFee, 10000);
  assert.equal(tables.Shipping.length, 1);
  assert.equal(tables.Shipping[0].fee, 10000);
  tables.ShippingRates[0].price = 20000;
  tables.ShippingRates[0].name = 'Nama baru';
  assert.equal(context.createOrder_(data).shippingProvider, 'Gojek');
  assert.equal(context.createOrder_(data).total, 55000);
  assert.equal(tables.Orders.length, 1);
  assert.equal(tables.Shipping.length, 1);
  assert.equal(JSON.parse(properties.get('ORDER_NUMBER_COUNTER')).sequence, 1);
  assert.throws(() => context.createOrder_({ ...data, shippingRateId: 'grab' }), /data berbeda/);
  tables.Orders[0].transactionState = 'PREPARING';
  tables.Shipping.length = 0;
  context.recoverOrders_();
  assert.equal(tables.Shipping[0].fee, 10000);
  assert.equal(tables.Shipping[0].provider, 'Gojek');
  assert.equal(tables.OrderItems.length, 1);
  assert.equal(tables.StockLedger.length, 1);
});

test('Pembayaran dan pengiriman memakai total termasuk ongkir tanpa checkbox tambahan', function () {
  const { context, tables, data } = shippingContext();
  const order = context.createOrder_(data);
  assert.throws(() => context.verifyPayment_({ id: 'admin1' }, {
    orderId: order.id, amount: 45000, reference: 'BANK-1'
  }), /total tagihan/);
  context.verifyPayment_({ id: 'admin1' }, { orderId: order.id, amount: 55000, reference: 'BANK-1' });
  assert.equal(tables.Payments[0].amount, 55000);
  for (const status of ['CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED']) {
    context.fulfillment_({ id: 'admin1' }, { orderId: order.id, status });
  }
  assert.equal(tables.Orders[0].fulfillment, 'DISPATCHED');
  context.saveShipping_({ id: 'admin1' }, { orderId: order.id, fee: 1, courier: 'Kurir Uji', tracking: 'TRACK-1' });
  assert.equal(tables.Shipping[0].fee, 10000);
  assert.equal(tables.Shipping[0].provider, 'Gojek');
  assert.equal(tables.Shipping[0].courier, 'Kurir Uji');
  assert.equal(tables.Orders[0].total, 55000);
});

test('Tarif hanya dikelola Admin; katalog hanya menampilkan tarif aktif tanpa data privat', function () {
  const { context, tables, data } = shippingContext();
  for (const role of ['Operator', 'Viewer']) {
    assert.throws(() => context.saveMaster_({ role }, { table: 'ShippingRates', record: { name: 'Lain', price: 12000 } }), /berwenang/);
  }
  context.saveMaster_({ role: 'Admin' }, { table: 'ShippingRates', record: { name: 'Lain', price: 12000, active: true } });
  assert.equal(tables.ShippingRates.length, 4);
  assert.throws(() => context.saveMaster_({ role: 'Admin' },
    { table: 'ShippingRates', record: { name: 'Gojek', price: 1 } }), /sudah digunakan/);
  assert.throws(() => context.saveMaster_({ role: 'Admin' },
    { table: 'ShippingRates', record: { name: 'Negatif', price: -1 } }), /tidak valid/);
  assert.throws(() => context.saveMaster_({ role: 'Admin' },
    { table: 'ShippingRates', record: { name: 'Pecahan', price: 10.5 } }), /tidak valid/);
  const catalog = context.catalog_(data);
  assert.equal(catalog.shippingRates.length, 3);
  assert.deepEqual(Object.keys(catalog.shippingRates[0]).sort(), ['id', 'name', 'price']);
  assert.ok(!JSON.stringify(catalog).includes('081234567890'));
});

test('API pembatalan/refund sudah dihapus, sementara riwayat tagihan lama tidak berubah', function () {
  const { context } = shippingContext();
  for (const action of ['cancelRequest', 'cancelOrder', 'rejectCancellation', 'refund']) {
    const reply = context.api_({ action, token: 'Admin', data: {} });
    assert.equal(reply.ok, false);
    assert.match(reply.message, /Operasi tidak dikenal/);
  }
  const previous = { total: 50000, snapshotJson: '{"items":[],"refundCustomerPercent":90}' };
  assert.equal(context.orderAmounts_(previous).productTotal, 50000);
  assert.equal(context.orderAmounts_(previous).shippingIncluded, false);
  const client = source('js/client.js');
  for (const old of ['cancel-form', 'cancelRequest', 'cancelOrder', 'rejectCancellation',
    'refundRounding', 'deliveryVerified', 'customerAgreed', 'feePaidToCourier']) {
    assert.ok(!client.includes(old), old);
  }
  assert.ok(!source('apps-script/Files.gs').includes('refund 90'));
  assert.ok(!source('apps-script/Rules.gs').includes('function refundValue_'));
});

test('Invoice dan laporan merinci ongkir dari snapshot tanpa mengubah jumlah pembayaran', function () {
  const { context, tables, data } = shippingContext();
  const customer = context.createOrder_(data);
  let html = '';
  let pdfName = '';
  context.Utilities = {
    formatDate: () => '05/11/2026 15:00',
    newBlob: text => {
      html = text;
      return { getAs: () => ({ setName: name => { pdfName = name; return {}; } }) };
    }
  };
  context.folder_ = () => ({ getFilesByName: () => ({ hasNext: () => false }),
    createFile: () => ({ getId: () => 'invoice-id' }) });
  context.invoice_(tables.Orders[0]);
  assert.equal(pdfName, 'NO-' + customer.id + '.pdf');
  assert.ok(html.includes('Total produk: Rp 45000'));
  assert.ok(html.includes('Pengiriman Gojek: Rp 10000'));
  assert.ok(html.includes('Total pembayaran: Rp 55000'));
  assert.ok(!html.includes('Pembatalan'));
  context.verifyPayment_({ id: 'admin1' }, { orderId: customer.id, amount: 55000, reference: 'BANK-1' });
  const report = context.report_({ role: 'Admin' }, {});
  assert.equal(report.rows[0].produkSetelahDiskon, 45000);
  assert.equal(report.rows[0].ongkirDalamTagihan, 10000);
  assert.equal(report.rows[0].pembayaran, 55000);
  assert.equal(report.summary.payments, 55000);
});

test('Installer menambah ShippingRates tanpa mengganti database, folder, atau isi tabel lama', function () {
  const context = setupContext('owner@example.com', 'owner@example.com');
  // Migrasi kode diuji terpisah dengan adapter Sheet lengkap.
  context.assignMasterCodes_ = () => ({ updatedCells: 0 });
  const schema = vm.runInContext('HV_SCHEMA', context);
  const sheets = new Map();
  const makeSheet = rows => ({
    rows,
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0] ? rows[0].length : 0,
    getMaxColumns: () => 100,
    setFrozenRows: () => {},
    autoResizeColumns: () => {},
    getRange: (row, column, count, width) => {
      const range = {
        getValues: () => [Array.from({ length: width }, (_, i) => (rows[row - 1] || [])[column - 1 + i] || '')],
        setValues: values => { rows[row - 1] = Array.from(values[0]); return range; },
        setBackground: () => range, setFontColor: () => range, setFontWeight: () => range
      };
      return range;
    }
  });
  for (const name of Object.keys(schema).filter(name => name !== 'ShippingRates')) {
    sheets.set(name, makeSheet([Array.from(schema[name]), ['DATA-LAMA-' + name]]));
  }
  const before = JSON.stringify(Array.from(sheets, ([name, sheet]) => [name, sheet.rows]));
  const props = new Map([['ROOT_FOLDER_ID', 'root'], ['DATABASE_ID', 'db']]);
  for (const name of ['PRODUK', 'INVOICE', 'STRUK', 'TANDATERIMA', 'BACKUP']) {
    props.set('FOLDER_' + name, 'folder-' + name);
  }
  let created = 0;
  context.PropertiesService = { getScriptProperties: () => ({
    getProperty: key => props.get(key), setProperty: (key, value) => props.set(key, value)
  }) };
  context.DriveApp = {
    getFolderById: () => ({ getName: () => 'Existing' }),
    createFolder: () => { throw new Error('Tidak boleh membuat folder lagi'); }
  };
  const db = {
    setSpreadsheetTimeZone: () => {}, setSpreadsheetLocale: () => {},
    getSheetByName: name => sheets.get(name), getUrl: () => 'https://example.test/existing',
    insertSheet: name => {
      assert.equal(name, 'ShippingRates');
      created += 1;
      const sheet = makeSheet([]);
      sheets.set(name, sheet);
      return sheet;
    }
  };
  context.SpreadsheetApp = {
    openById: id => { assert.equal(id, 'db'); return db; }, flush: () => {},
    create: () => { throw new Error('Tidak boleh membuat database lagi'); }
  };
  context.rows_ = () => Object.keys(vm.runInContext('HV_DEFAULTS', context)).map(key => ({ key }));
  context.withLock_ = operation => operation();
  context.installHealthyVibes_();
  context.installHealthyVibes_();
  assert.equal(created, 1);
  assert.deepEqual(sheets.get('ShippingRates').rows[0], ['id', 'name', 'price', 'active', 'updatedAt']);
  assert.equal(JSON.stringify(Array.from(sheets, ([name, sheet]) => [name, sheet.rows])
    .filter(([name]) => name !== 'ShippingRates')), before);
  assert.equal(props.get('DATABASE_ID'), 'db');
});

test('Pembersihan hanya menghapus konfirmasi ongkir dan aman dijalankan berulang', function () {
  const context = setupContext('owner@example.com', 'owner@example.com');
  const sheets = new Map();
  const sheet = rows => ({
    rows,
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0].length,
    getRange: (row, column, count, width) => ({
      getValues: () => rows.slice(row - 1, row - 1 + count)
        .map(values => values.slice(column - 1, column - 1 + width))
    }),
    deleteColumn: column => rows.forEach(values => values.splice(column - 1, 1)),
    deleteRow: row => rows.splice(row - 1, 1)
  });
  sheets.set('Shipping', sheet([
    ['id', 'orderId', 'provider', 'fee', 'customerAgreedAt', 'courier', 'tracking', 'feePaidToCourier', 'updatedAt'],
    ['ship1', 'order1', 'Gojek', 10000, '2026-11-05', 'Kurir Uji', 'TRACK1', true, '2026-11-06']
  ]));
  sheets.set('Settings', sheet([
    ['key', 'value'], ['ordersEnabled', true], ['deliveryVerified', true],
    ['address', 'Makassar'], ['deliveryVerified', false]
  ]));
  sheets.set('ShippingRates', sheet([['id', 'name', 'price'], ['gojek', 'Gojek', 10000]]));
  sheets.set('Orders', sheet([['id', 'total'], ['order1', 55000]]));
  const ratesBefore = JSON.stringify(sheets.get('ShippingRates').rows);
  const ordersBefore = JSON.stringify(sheets.get('Orders').rows);
  const db = { getSheetByName: name => sheets.get(name) };
  context.database_ = () => db;
  context.withLock_ = operation => operation();
  context.SpreadsheetApp = { flush: () => {} };
  context.console = { info: () => {} };
  const result = context.removeShippingConfirmation();
  assert.equal(result.columns, 2);
  assert.equal(result.settings, 2);
  assert.deepEqual(sheets.get('Shipping').rows, [
    ['id', 'orderId', 'provider', 'fee', 'courier', 'tracking', 'updatedAt'],
    ['ship1', 'order1', 'Gojek', 10000, 'Kurir Uji', 'TRACK1', '2026-11-06']
  ]);
  assert.deepEqual(sheets.get('Settings').rows, [
    ['key', 'value'], ['ordersEnabled', true], ['address', 'Makassar']
  ]);
  assert.equal(JSON.stringify(sheets.get('ShippingRates').rows), ratesBefore);
  assert.equal(JSON.stringify(sheets.get('Orders').rows), ordersBefore);
  const again = context.removeShippingConfirmation();
  assert.equal(again.columns, 0);
  assert.equal(again.settings, 0);
  context.Session.getActiveUser = () => ({ getEmail: () => 'other@example.com' });
  assert.throws(() => context.removeShippingConfirmation(), /pemilik project/);
});

test('Skema dan tampilan baru tidak memakai persetujuan ongkir lama', function () {
  const context = setupContext('owner@example.com', 'owner@example.com');
  const schema = vm.runInContext('HV_SCHEMA', context);
  assert.deepEqual(Array.from(schema.Shipping),
    ['id', 'orderId', 'provider', 'fee', 'courier', 'tracking', 'updatedAt']);
  assert.ok(!source('js/client.js').includes('Ongkir dikonfirmasi terpisah'));
  assert.ok(!source('apps-script/Recovery.gs').includes('deliveryVerified'));
});

test('Simpan/edit ongkir memberi petunjuk installer jika tab ShippingRates belum ada', function () {
  const context = backend();
  context.database_ = () => ({ getSheetByName: () => null });
  let writes = 0;
  context.writeSheetRow_ = () => { writes += 1; };
  for (const run of [
    () => context.append_('ShippingRates', { name: 'Gojek', price: 10000 }),
    () => context.patch_('ShippingRates', { _row: 2 }, { price: 11000 })
  ]) {
    assert.throws(run, error => {
      assert.ok(error.message.includes('Tab ShippingRates belum ada'));
      assert.ok(error.message.includes('installHealthyVibes'));
      assert.ok(!error.message.includes('getLastRow'));
      return true;
    });
  }
  assert.equal(writes, 0);
});

// Semua penghapusan berikut memakai tabel tiruan, bukan database Google.
function deleteContext() {
  const { context, tables } = shippingContext();
  const audits = [];
  const deleted = [];
  context.rows_ = name => (tables[name] || []).map((row, index) => Object.assign(row, { _row: index + 2 }));
  context.database_ = () => ({ getSheetByName: name => ({
    deleteRow: row => { deleted.push([name, row]); tables[name].splice(row - 2, 1); }
  }) });
  context.audit_ = (...args) => audits.push(args);
  return { context, tables, audits, deleted };
}

test('Setiap tabel master mendukung hapus nyata dengan audit dan nomor baris server', function () {
  const contextSchema = shippingContext().context;
  const tablesAllowed = vm.runInContext('Object.keys(HV_MASTER_ROLES)', contextSchema);
  for (const table of tablesAllowed) {
    const { context, tables, audits, deleted } = deleteContext();
    tables[table].push({ id: 'target', name: 'Data Uji', role: 'Operator', active: true });
    const expectedRow = tables[table].length + 1;
    const result = context.deleteMaster_({ id: 'admin1', role: 'Admin' },
      { table, id: 'target', confirmed: true, _row: 2 });
    assert.equal(result.deleted, true, table);
    assert.ok(!tables[table].some(row => row.id === 'target'), table);
    assert.deepEqual(deleted, [[table, expectedRow]]);
    assert.equal(audits[0][1], 'DELETE_' + table);
    assert.equal(audits[0][2], 'target');
  }
});

test('Hapus memeriksa role, konfirmasi, ID, akun sendiri dan Admin aktif terakhir', function () {
  const { context, tables, deleted } = deleteContext();
  for (const role of ['Viewer', 'Operator']) {
    assert.throws(() => context.deleteMaster_({ id: 'admin1', role },
      { table: 'ShippingRates', id: 'gojek', confirmed: true }), /berwenang/);
  }
  const admin = { id: 'admin1', role: 'Admin' };
  for (const table of ['Orders', 'Payments', 'Sessions', 'AuditLog', 'constructor']) {
    assert.throws(() => context.deleteMaster_(admin, { table, id: 'target', confirmed: true }), /berwenang/);
  }
  assert.throws(() => context.deleteMaster_(admin, { table: 'ShippingRates', id: 'gojek' }), /Konfirmasi/);
  assert.throws(() => context.deleteMaster_(admin,
    { table: 'ShippingRates', id: 'missing', confirmed: true }), /tidak ditemukan/);
  tables.Users.push({ id: 'admin1', role: 'Admin', active: true });
  assert.throws(() => context.deleteMaster_(admin,
    { table: 'Users', id: 'admin1', confirmed: true }), /sedang Anda gunakan/);
  assert.throws(() => context.deleteMaster_({ id: 'different', role: 'Admin' },
    { table: 'Users', id: 'admin1', confirmed: true }), /terakhir/);
  tables.Users.push({ id: 'op', role: 'Operator', active: true });
  tables.Sessions.push({ id: 'session', userId: 'op', revoked: false });
  context.deleteMaster_(admin, { table: 'Users', id: 'op', confirmed: true });
  assert.equal(tables.Sessions[0].revoked, true);
  assert.equal(deleted.length, 1);
});

test('Relasi kategori/produk/kuota/wilayah ke pesanan dilindungi dari penghapusan', function () {
  const cases = [
    ['Categories', 'categoryId'], ['Products', 'productId'],
    ['ReadyStock', 'poolId'], ['PreorderCapacity', 'poolId'], ['ServiceAreas', 'areaId']
  ];
  for (const [table, field] of cases) {
    const { context, tables, deleted } = deleteContext();
    tables[table].push({ id: 'target' });
    if (table === 'Categories') { tables.Products.push({ id: 'child', categoryId: 'target' }); }
    else {
      tables.Orders.push({ areaId: field === 'areaId' ? 'target' : '',
        snapshotJson: JSON.stringify({ items: [{ [field]: 'target' }] }) });
    }
    assert.throws(() => context.deleteMaster_({ id: 'admin1', role: 'Admin' },
      { table, id: 'target', confirmed: true }), /masih dipakai/, table);
    assert.equal(deleted.length, 0);
  }
});

test('Menghapus tarif tidak mengubah snapshot maupun jumlah tagihan pesanan lama', function () {
  const { context, tables, data } = shippingContext();
  const order = context.createOrder_(data);
  const before = JSON.stringify(tables.Orders);
  context.rows_ = name => tables[name].map((row, index) => Object.assign(row, { _row: index + 2 }));
  context.database_ = () => ({ getSheetByName: name => ({ deleteRow: row => tables[name].splice(row - 2, 1) }) });
  context.deleteMaster_({ id: 'admin1', role: 'Admin' },
    { table: 'ShippingRates', id: 'gojek', confirmed: true });
  assert.equal(JSON.stringify(tables.Orders), before);
  assert.equal(context.customerOrder_(tables.Orders[0]).total, order.total);
  assert.equal(context.customerOrder_(tables.Orders[0]).shippingFee, 10000);
  assert.equal(context.api_({ action: 'deleteMaster', token: 'Viewer',
    data: { table: 'ShippingRates', id: 'grab', confirmed: true } }).ok, false);
  assert.equal(context.api_({ action: 'deleteMaster', token: 'Admin',
    data: { table: 'ShippingRates', id: 'grab', confirmed: true } }).ok, true);
});

test('Ikon aksi memiliki tooltip/nama aksesibel, urutan Edit-Hapus-Foto, dan hak tampilan', function () {
  const elements = { 'admin-body': { innerHTML: '' } };
  const context = vm.createContext({
    window: {}, document: { getElementById: id => elements[id] }, safe: String,
    tableLabels: { Products: 'Produk' }, masterText: (key, value) => value,
    state: { user: { role: 'Admin' }, admin: { tables: { Products: [
      { id: 'p1', categoryId: 'cat-private', name: 'Produk Uji', description: 'Deskripsi produk uji',
        unit: 'Paket', sizeUnit: 'gr', sizeValue: 100, code: 'SN001' }
    ] } } }
  });
  vm.runInContext(source('js/icons.js'), context);
  context.buttonLabel = context.window.HV_UI.label;
  const client = source('js/client.js');
  vm.runInContext(client.slice(client.indexOf('  function iconButton('),
    client.indexOf('  // Menu pengelola terbuka')), context);
  vm.runInContext(client.slice(client.indexOf('  function renderMaster('),
    client.indexOf('  // Membuka formulir tambah')), context);
  context.renderMaster('Products');
  const html = elements['admin-body'].innerHTML;
  assert.ok(html.includes('<th>Satuan</th>'));
  assert.ok(html.includes('<th>ID Produk</th>'));
  assert.ok(html.includes('<thead><tr><th>ID Produk</th>'));
  assert.ok(html.includes('<td>SN001</td>'));
  assert.ok(html.includes('<th>Ukuran</th>'));
  assert.ok(html.includes('<td>Paket</td>'));
  assert.ok(html.includes('<td>100 gr</td>'));
  assert.ok(!html.includes('<th>sizeValue</th>'));
  assert.ok(!html.includes('<th>categoryId</th>'));
  assert.ok(!html.includes('<td>cat-private</td>'));
  assert.equal(context.state.admin.tables.Products[0].categoryId, 'cat-private');
  assert.ok(html.includes('class="table products-table"'));
  assert.ok(html.includes('<th class="product-description-column">Keterangan</th>'));
  assert.ok(html.includes('<td class="product-description-column">Deskripsi produk uji</td>'));
  assert.ok(html.includes('<th class="product-name-column">Nama</th>'));
  assert.ok(html.includes('<td class="product-name-column">Produk Uji</td>'));
  assert.equal(context.state.admin.tables.Products[0].description, 'Deskripsi produk uji');
  assert.ok(html.includes('aria-label="Edit Produk" title="Edit"'));
  assert.ok(html.includes('aria-label="Hapus Produk" title="Hapus"'));
  assert.ok(html.includes('title="Foto"'));
  assert.ok(context.iconButton('eye', 'Lihat detail pesanan Uji', '', 'Detail')
    .includes('aria-label="Lihat detail pesanan Uji" title="Detail"'));
  assert.ok(html.indexOf('data-edit=') < html.indexOf('data-delete='));
  assert.ok(html.indexOf('data-delete=') < html.indexOf('data-product-upload='));
  assert.ok(!html.includes('>Edit<'));
  assert.ok(!html.includes('>Foto<'));
  context.state.user.role = 'Viewer';
  context.renderMaster('Products');
  assert.ok(!elements['admin-body'].innerHTML.includes('data-new='));
  assert.ok(!elements['admin-body'].innerHTML.includes('data-delete='));
  const close = source('index.html').match(/<button[^>]+id="close-editor"[\s\S]*?<\/button>/)[0];
  assert.ok(close.includes('aria-label="Tutup dialog"'));
  assert.ok(close.includes('title="Tutup"'));
  assert.ok(!close.includes('<span>'));
  assert.ok(source('css/styles.css').includes('background: #e9ecef'));
  assert.ok(source('css/styles.css').includes('flex-wrap: nowrap'));
  const css = source('css/styles.css');
  const mobileStyles = css.slice(css.indexOf('@media (max-width: 767px)'), css.indexOf('@media (prefers-reduced-motion'));
  assert.match(mobileStyles, /\.products-table \.product-name-column\s*\{\s*white-space:\s*nowrap;\s*\}/);
  assert.match(mobileStyles, /\.products-table \.record-action-cell,\s*\.orders-table \.record-action-cell\s*\{[^}]*position:\s*sticky;[^}]*right:\s*0;[^}]*z-index:\s*1;[^}]*background:\s*white;/);
  assert.match(mobileStyles, /\.products-table th\.record-action-cell,\s*\.orders-table th\.record-action-cell\s*\{\s*z-index:\s*2;[^}]*background:\s*#f2f3f4;/);
  assert.match(css, /\.btn\.action-icon\s*\{[^}]*flex: 0 0 36px;[^}]*width: 36px;[^}]*height: 36px;[^}]*min-height: 36px;/);
  assert.match(css, /\.action-icon \.ui-icon\s*\{[^}]*width: 16px;[^}]*height: 16px;/);
});

test('Modal HTML menerima, membatalkan, Escape dan klik ganda tanpa confirm browser', async function () {
  const elements = {};
  for (const id of ['confirmation-title', 'confirmation-message', 'confirmation-accept',
    'confirmation-cancel', 'confirmation-close']) {
    elements[id] = { textContent: '', events: {}, addEventListener(name, callback) { this.events[name] = callback; } };
  }
  const confirmation = {
    open: false, events: {},
    addEventListener(name, callback) { this.events[name] = callback; },
    showModal() { this.open = true; },
    close(value) {
      this.open = false;
      if (value !== undefined) { this.returnValue = value; }
      this.events.close();
    }
  };
  const context = vm.createContext({ confirmation, document: { getElementById: id => elements[id] } });
  const client = source('js/client.js');
  vm.runInContext(client.slice(client.indexOf('  let resolveConfirmation = null;'),
    client.indexOf('  async function navigate(')), context);
  const first = context.confirmAction('<img src=x onerror=alert(1)>', 'Konfirmasi Uji');
  assert.equal(elements['confirmation-message'].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(await context.confirmAction('Klik ganda'), false);
  elements['confirmation-accept'].events.click();
  assert.equal(await first, true);
  assert.equal(elements['confirmation-message'].textContent, '');
  for (const id of ['confirmation-cancel', 'confirmation-close', 'Escape']) {
    const pending = context.confirmAction('Uji pembatalan');
    if (id === 'Escape') { confirmation.close(); }
    else { elements[id].events.click(); }
    assert.equal(await pending, false);
    assert.equal(confirmation.open, false);
  }
  confirmation.showModal = () => { throw new Error('Modal tidak tersedia'); };
  await assert.rejects(context.confirmAction('Uji gagal buka'), /Modal tidak tersedia/);
  confirmation.showModal = () => { confirmation.open = true; };
  const retry = context.confirmAction('Uji ulang');
  confirmation.close();
  assert.equal(await retry, false);
  assert.ok(!/\b(?:alert|confirm|prompt)\s*\(/.test(client));
  assert.ok(source('index.html').includes('aria-describedby="confirmation-message"'));
});

test('Tindakan pesanan dan backup hanya dikirim setelah modal disetujui', async function () {
  const client = source('js/client.js');
  for (const accepted of [false, true]) {
    const calls = [];
    const context = vm.createContext({
      formData: () => ({ action: 'shipping' }), orderActionRules: () => ({}),
      confirmAction: async () => accepted, rpc: async action => {
        calls.push(action); return { folderUrl: 'https://example.test/backup' };
      },
      notify: () => {}, dialog: { close: () => {} }, loadAdmin: async () => {}
    });
    vm.runInContext(client.slice(client.indexOf('  async function submitAction('),
      client.indexOf('  // Menangani halaman sebelum instalasi')), context);
    await context.submitAction({ id: 'order-action-form', dataset: { id: 'order1' } });
    assert.deepEqual(calls, accepted ? ['shipping'] : []);
    vm.runInContext(client.slice(client.indexOf('  async function clickAction('),
      client.indexOf('  // Memperbarui hasil pencarian')), context);
    const button = { id: 'backup', dataset: {}, disabled: false };
    await context.clickAction(button);
    assert.equal(button.disabled, false);
    assert.deepEqual(calls, accepted ? ['shipping', 'backup'] : []);
  }
});

test('Konfirmasi hapus hanya satu pertanyaan dan tombol Hapus mengirim persetujuan', async function () {
  let html;
  let request;
  const context = vm.createContext({
    state: { admin: { tables: { ShippingRates: [{ id: 'rate1' }] } } },
    canManageMaster: () => true, safe: String, tableLabels: { ShippingRates: 'Biaya Pengiriman' },
    showEditor: (title, content) => { html = content; }, buttonLabel: (icon, label) => label,
    formData: () => ({}), dialog: { close: () => {} }, loadAdmin: async () => {}, notify: () => {},
    rpc: async (action, data) => { request = { action, data }; }
  });
  const client = source('js/client.js');
  vm.runInContext(client.slice(client.indexOf('  function deleteMasterDialog('),
    client.indexOf('  // Menampilkan formulir pengaturan')), context);
  context.deleteMasterDialog('ShippingRates', 'rate1');
  assert.ok(html.includes('<p>Apa yakin record ini akan dihapus?</p>'));
  assert.ok(!html.includes('checkbox'));
  assert.ok(!html.includes('alert-warning'));
  vm.runInContext(client.slice(client.indexOf('  async function submitAction('),
    client.indexOf('  // Menangani halaman sebelum instalasi')), context);
  await context.submitAction({ id: 'delete-master-form', dataset: { table: 'ShippingRates', id: 'rate1' } });
  assert.equal(request.action, 'deleteMaster');
  assert.equal(request.data.confirmed, true);
  assert.equal(request.data.id, 'rate1');
});

test('Notifikasi atas hilang setelah 4 detik dan pesan baru tidak memakai timer lama', function () {
  const timers = new Map();
  let next = 0;
  const element = { innerHTML: '', scrollIntoView: () => {} };
  const context = vm.createContext({
    document: { getElementById: () => element }, safe: String,
    setTimeout: (callback, delay) => { const id = ++next; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  const client = source('js/client.js');
  vm.runInContext(client.slice(client.indexOf('  let notificationTimer = null;'),
    client.indexOf('  function field(')), context);
  context.notify('Berhasil tersimpan.');
  assert.ok(element.innerHTML.includes('alert-success'));
  assert.equal(timers.get(1).delay, 4000);
  context.notify('Pesan baru', true);
  assert.equal(timers.has(1), false);
  assert.equal(timers.size, 1);
  assert.ok(element.innerHTML.includes('alert-danger'));
  assert.ok(element.innerHTML.includes('Pesan baru'));
  timers.get(2).callback();
  assert.equal(element.innerHTML, '');
  assert.ok(client.includes("confirmAction('Apa yakin membuat backup?', 'Konfirmasi')"));
  assert.ok(client.includes("confirmAction('Apa yakin menjalankan tindakan ini?', 'Konfirmasi')"));
  assert.match(source('css/styles.css'),
    /#notification \.alert\s*\{[^}]*padding: 8px 12px;[^}]*margin-bottom: 0;[^}]*font-size: 13px;[^}]*line-height: 1\.4;/);
  assert.match(source('css/styles.css'),
    /\.confirmation-dialog,\s*#editor:has\(#delete-master-form\)\s*\{[^}]*width: max-content;[^}]*max-width: min\(400px, calc\(100% - 24px\)\);[^}]*padding: 16px;/);
});

test('Keranjang memakai ikon minus/plus tanpa teks, jumlah sejajar dan perhitungan tetap berjalan', async function () {
  const product = { id: 'p1', name: 'Wafel Coklat', unitPrice: 13500, available: 3 };
  let renders = 0;
  const context = vm.createContext({
    window: {}, safe: String, rupiah: String,
    state: { cart: { p1: 1 }, requestId: 'old', catalog: { products: [product] } },
    cartSummary: () => ({ lines: [{ product, quantity: 1 }], total: 13500 }),
    renderShop: () => { renders += 1; }, dialog: { open: false }
  });
  vm.runInContext(source('js/icons.js'), context);
  context.buttonLabel = context.window.HV_UI.label;
  const client = source('js/client.js');
  vm.runInContext(client.slice(client.indexOf('  function iconButton('),
    client.indexOf('  // Menu pengelola terbuka')), context);
  vm.runInContext(client.slice(client.indexOf('  function renderCart('),
    client.indexOf('  // Menampilkan banner')), context);
  const html = context.renderCart();
  const minus = html.match(/<button[^>]*data-minus="p1"[\s\S]*?<\/button>/)[0];
  const plus = html.match(/<button[^>]*data-add="p1"[\s\S]*?<\/button>/)[0];
  for (const button of [minus, plus]) {
    assert.ok(button.includes('<svg'));
    assert.ok(!button.includes('<span'));
  }
  assert.ok(minus.includes('title="Kurangi"'));
  assert.ok(plus.includes('title="Tambah"'));
  assert.ok(html.includes('<span class="cart-count">1</span>'));
  assert.ok(html.indexOf('data-minus=') < html.indexOf('cart-count'));
  assert.ok(html.indexOf('cart-count') < html.indexOf('data-add='));
  vm.runInContext(client.slice(client.indexOf('  async function clickAction('),
    client.indexOf('  // Memperbarui hasil pencarian')), context);
  await context.clickAction({ dataset: { add: 'p1' } });
  assert.equal(context.state.cart.p1, 2);
  assert.equal(context.state.requestId, '');
  await context.clickAction({ dataset: { minus: 'p1' } });
  await context.clickAction({ dataset: { minus: 'p1' } });
  assert.ok(!Object.hasOwn(context.state.cart, 'p1'));
  assert.equal(renders, 3);
  context.state.cart.p1 = 3;
  await assert.rejects(context.clickAction({ dataset: { add: 'p1' } }), /Ketersediaan/);
  let modalHtml;
  context.dialog.open = true;
  context.document = { getElementById: () => ({ querySelector: () => ({}) }) };
  context.showEditor = (title, content) => { modalHtml = content; };
  context.state.cart.p1 = 1;
  context.cartSummary = () => ({ lines: [{ product, quantity: context.state.cart.p1 }],
    total: product.unitPrice * context.state.cart.p1 });
  await context.clickAction({ dataset: { add: 'p1' } });
  assert.ok(modalHtml.includes('<span class="cart-count">2</span>'));
  assert.ok(modalHtml.includes('27000'));
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

test('Login hanya menampilkan kotak User dan Pass dengan autofill serta pemulihan', function () {
  const client = source('js/client.js');
  const context = vm.createContext({
    renderAccountHeader() {},
    app: { innerHTML: '' }, buttonLabel: (icon, label) => label,
    window: { HV_UI: { icon: () => '<svg aria-hidden="true"></svg>' } }
  });
  vm.runInContext(client.slice(client.indexOf('  function renderLogin('),
    client.indexOf('  function toggleLoginPassword(')), context);
  context.renderLogin();
  const html = context.app.innerHTML;
  assert.ok(html.includes('panel login-card'));
  assert.ok(html.includes('for="login-user">User</label>'));
  assert.ok(html.includes('for="login-pass">Pass</label>'));
  assert.ok(html.includes('autocomplete="username"'));
  assert.ok(html.includes('autocomplete="current-password"'));
  assert.ok(html.includes('autocapitalize="none" spellcheck="false"'));
  assert.ok(html.includes('id="forgot-password"'));
  assert.ok(html.includes('id="login-error" role="alert"'));
  assert.ok(!html.includes('Kelola toko'));
  assert.ok(!html.includes('Login Admin, Operator, Viewer, atau Konsumen'));
  assert.ok(!html.includes('col-md-6'));
  const css = source('css/styles.css');
  const mobileCss = css.slice(css.indexOf('@media (max-width: 767px)'), css.indexOf('@media (prefers-reduced-motion'));
  assert.match(mobileCss, /\.products-table \.product-description-column\s*\{\s*display:\s*none;\s*\}/);
  assert.ok(!css.slice(0, css.indexOf('@media (max-width: 767px)'))
    .includes('.products-table .product-description-column'));
  assert.match(css, /\.products-table th\s*\{\s*white-space:\s*nowrap;\s*\}/);
  assert.ok(css.includes('width: min(100%, 420px)'));
  assert.ok(css.includes('.panel.login-card'));
  assert.ok(css.includes('.login-password .form-control { padding-right: 54px; }'));
});

test('Tampilkan password menjaga isi serta memperbarui status dan nama aksesibel', function () {
  const client = source('js/client.js');
  const input = { type: 'password', value: 'password-uji' };
  const attributes = {};
  const button = { setAttribute: (key, value) => { attributes[key] = value; } };
  const context = vm.createContext({ document: { getElementById: () => input } });
  vm.runInContext(client.slice(client.indexOf('  function toggleLoginPassword('),
    client.indexOf('  function passwordDialog(')), context);
  context.toggleLoginPassword(button);
  assert.equal(input.type, 'text');
  assert.equal(input.value, 'password-uji');
  assert.equal(attributes['aria-pressed'], 'true');
  assert.equal(attributes['aria-label'], 'Sembunyikan password');
  context.toggleLoginPassword(button);
  assert.equal(input.type, 'password');
  assert.equal(input.value, 'password-uji');
  assert.equal(attributes['aria-pressed'], 'false');
  assert.equal(attributes.title, 'Tampilkan password');
});

test('Kesalahan login tampil dalam form dan tombol Masuk aktif kembali', async function () {
  const client = source('js/client.js');
  let handler;
  const submit = { disabled: false };
  const result = { innerHTML: '', scrollIntoView() {} };
  const form = { id: 'login-form', querySelector: selector => {
    if (selector === '[type="submit"]') { return submit; }
    assert.equal(selector, '#login-error');
    return result;
  } };
  const context = vm.createContext({
    document: { addEventListener: (type, callback) => { handler = callback; } },
    submitAction: async () => { throw new Error('User atau password salah <uji>'); },
    safe: value => value.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    notify: () => { throw new Error('Kesalahan login harus tampil dalam form'); }
  });
  vm.runInContext(client.slice(client.indexOf('  // Tombol submit dikunci selama request'),
    client.indexOf('  // Mengirim formulir yang sesuai')), context);
  await handler({ target: form, preventDefault() {} });
  assert.ok(result.innerHTML.includes('User atau password salah &lt;uji&gt;'));
  assert.equal(submit.disabled, false);
});

test('Setup Produk menyediakan pilihan Satuan dan Ukuran untuk tambah serta edit', function () {
  const client = source('js/client.js');
  const context = vm.createContext({
    safe: value => String(value ?? ''),
    state: { admin: { tables: { Products: [], Categories: [{ id: 'cat', name: 'Makanan' }] } } }
  });
  vm.runInContext(client.slice(client.indexOf('  function field('),
    client.indexOf('  // Mengambil isian formulir')), context);
  vm.runInContext(client.slice(client.indexOf('  function masterFields('),
    client.indexOf('  // Menyiapkan tanggal dan jam WITA')), context);
  const empty = context.masterFields('Products', {});
  assert.ok(empty.includes('name="unit"'));
  assert.ok(empty.includes('name="sizeUnit"'));
  assert.ok(empty.includes('name="categoryId"'));
  assert.ok(empty.includes('name="sizeValue" type="number"'));
  assert.ok(empty.includes('step="any"'));
  assert.ok(empty.includes('ID Produk</label>'));
  assert.ok(empty.includes('id="master-code" type="text" readonly'));
  assert.ok(!empty.includes('name="code"'));
  const categoryForm = context.masterFields('Categories', { code: 'HV01', productPrefix: 'SN' });
  assert.ok(categoryForm.includes('ID Kategori</label>'));
  assert.ok(categoryForm.includes('value="HV01"'));
  assert.ok(categoryForm.includes('maxlength="2" readonly'));
  for (const option of ['Biji', 'Slice', 'Paket', 'Loyang', 'Cup', 'Botol', 'ml', 'gr']) {
    assert.ok(empty.includes('<option value="' + option + '">' + option + '</option>'));
  }
  assert.ok(empty.includes('<option value="" selected>Pilih satuan</option>'));
  assert.ok(empty.includes('<option value="" selected>Pilih ukuran</option>'));
  const edited = context.masterFields('Products', { unit: 'Slice', sizeUnit: 'gr', sizeValue: 100 });
  assert.ok(edited.includes('<option value="Slice" selected>Slice</option>'));
  assert.ok(context.masterFields('Products', { unit: 'Loyang' })
    .includes('<option value="Loyang" selected>Loyang</option>'));
  for (const unit of ['Cup', 'Botol']) {
    assert.ok(context.masterFields('Products', { unit })
      .includes('<option value="' + unit + '" selected>' + unit + '</option>'));
  }
  assert.ok(!empty.includes('Slace'));
  assert.ok(context.masterFields('Products', { unit: 'Slace' })
    .includes('<option value="Slice" selected>Slice</option>'));
  assert.ok(edited.includes('<option value="gr" selected>gr</option>'));
  assert.ok(edited.includes('value="100"'));
  assert.ok(empty.includes('col-sm-4'));
  assert.ok(!context.masterFields('Categories', {}).includes('name="sizeUnit"'));
});

test('Satuan dan Ukuran tersimpan serta dikembalikan saat tambah atau edit produk', function () {
  const { context, tables } = shippingContext();
  tables.Categories.push({ id: 'cat', name: 'Makanan', active: true });
  const user = { id: 'admin1', role: 'Admin' };
  const base = { name: 'Produk Uji', categoryId: 'cat', price: 10000, active: true };
  for (const unit of ['Biji', 'Slice', 'Paket', 'Loyang', 'Cup', 'Botol']) {
    for (const sizeUnit of ['ml', 'gr']) {
      const result = context.saveMaster_(user, { table: 'Products', record: { ...base, unit, sizeUnit } });
      assert.equal(result.unit, unit);
      assert.equal(result.sizeUnit, sizeUnit);
      assert.equal(tables.Products.find(row => row.id === result.id).sizeUnit, sizeUnit);
    }
  }
  for (const unit of ['Cup', 'Botol']) {
    const updated = context.saveMaster_(user, { table: 'Products',
      record: { ...base, id: 'p1', unit, sizeUnit: 'ml', sizeValue: 250 } });
    assert.equal(updated.unit, unit);
    assert.equal(tables.Products[0].unit, unit);
    assert.equal(updated.sizeValue, 250);
    const retained = context.saveMaster_(user, { table: 'Products', record: { ...base, id: 'p1' } });
    assert.equal(retained.unit, unit);
    assert.equal(retained.sizeUnit, 'ml');
    assert.equal(retained.sizeValue, 250);
  }
  const edited = context.saveMaster_(user, { table: 'Products',
    record: { ...base, id: 'p1', unit: 'Loyang', sizeUnit: 'gr', sizeValue: '' } });
  assert.equal(edited.unit, 'Loyang');
  assert.equal(tables.Products[0].unit, 'Loyang');
  const retryOldClient = context.saveMaster_(user, { table: 'Products', record: { ...base, id: 'p1' } });
  assert.equal(retryOldClient.unit, 'Loyang');
  assert.equal(retryOldClient.sizeUnit, 'gr');
  const cleared = context.saveMaster_(user, { table: 'Products',
    record: { ...base, id: 'p1', unit: '', sizeUnit: '' } });
  assert.equal(cleared.unit, '');
  assert.equal(cleared.sizeUnit, '');
  assert.equal(context.saveMaster_(user, { table: 'Products', record: base }).unit, '');
});

test('Backend menolak pilihan produk di luar daftar tanpa mengubah data', function () {
  const { context, tables } = shippingContext();
  tables.Categories.push({ id: 'cat', active: true });
  const before = JSON.stringify(tables.Products);
  for (const invalid of [
    { unit: 'Kg' }, { unit: 'slice' }, { unit: 'biji' }, { unit: ['Biji', 'Paket'] },
    { sizeUnit: 'kg' }, { sizeUnit: 'ML' }, { sizeUnit: 100 }, { sizeUnit: null }
  ]) {
    assert.throws(() => context.saveMaster_({ id: 'admin1', role: 'Admin' }, {
      table: 'Products', record: { id: 'p1', name: 'Produk', price: 10000,
        categoryId: 'cat', unit: 'Biji', sizeUnit: 'gr', ...invalid }
    }), /Satuan|Ukuran/);
    assert.equal(JSON.stringify(tables.Products), before);
  }
});

test('Migrasi Products menambahkan kolom kanan tanpa mengubah produk lama dan aman diulang', function () {
  const context = setupContext('owner@test', 'owner@test');
  const expected = Array.from(vm.runInContext('HV_SCHEMA.Products', context));
  const original = expected.slice(0, -4);
  let headers = original.slice();
  let columns = original.length;
  const product = ['p1', 'cat', 'Produk Lama', 'Deskripsi', 10000, 'photo1', true, '2026-11-09'];
  const before = JSON.stringify(product);
  const sheet = {
    getLastRow: () => 2, getLastColumn: () => headers.length, getMaxColumns: () => columns,
    insertColumnsAfter: (start, count) => { assert.equal(start, original.length); columns += count; },
    getRange: (row, col, height, width) => {
      assert.equal(row, 1);
      return { getValues: () => [headers.slice()], setValues: values => { headers = Array.from(values[0]); } };
    }
  };
  const db = { getSheetByName: name => { assert.equal(name, 'Products'); return sheet; } };
  context.extendSchemaColumns_(db, 'Products');
  context.extendSchemaColumns_(db, 'Products');
  assert.deepEqual(headers, expected);
  assert.deepEqual(headers.slice(-4), ['unit', 'sizeUnit', 'sizeValue', 'code']);
  assert.equal(columns, expected.length);
  assert.equal(JSON.stringify(product), before);
  assert.ok(source('apps-script/Schema.gs').includes("extendSchemaColumns_(db, 'Products')"));
  assert.ok(source('apps-script/Recovery.gs').includes("extendSchemaColumns_(db, 'Products')"));
  headers[2] = 'kolom-berbeda';
  assert.throws(() => context.extendSchemaColumns_(db, 'Products'), /Migrasi dihentikan/);
  assert.equal(JSON.stringify(product), before);
});

test('Nilai ukuran positif dan desimal tersimpan sebagai angka serta tetap utuh saat edit lama', function () {
  const { context, tables } = shippingContext();
  tables.Categories.push({ id: 'cat', active: true });
  const user = { id: 'admin1', role: 'Admin' };
  const base = { id: 'p1', name: 'Produk', price: 10000, categoryId: 'cat', unit: 'Biji', sizeUnit: 'gr' };
  for (const sizeValue of ['100', 250, '0.5', '12.75']) {
    const result = context.saveMaster_(user, { table: 'Products', record: { ...base, sizeValue } });
    assert.equal(result.sizeValue, Number(sizeValue));
    assert.equal(tables.Products[0].sizeValue, Number(sizeValue));
  }
  const retained = context.saveMaster_(user, { table: 'Products', record: base });
  assert.equal(retained.sizeValue, 12.75);
  const cleared = context.saveMaster_(user, { table: 'Products', record: { ...base, sizeValue: '' } });
  assert.equal(cleared.sizeValue, '');
  assert.equal(cleared.sizeUnit, 'gr');
});

test('Nilai ukuran tidak valid atau tanpa ml/gr ditolak tanpa mengubah produk', function () {
  const { context, tables } = shippingContext();
  tables.Categories.push({ id: 'cat', active: true });
  const before = JSON.stringify(tables.Products);
  const base = { id: 'p1', name: 'Produk', price: 10000, categoryId: 'cat', sizeUnit: 'gr' };
  for (const sizeValue of [0, -1, 'abc', '100 gr', Infinity, NaN, 1000000001, true, null, [], {}]) {
    assert.throws(() => context.saveMaster_({ id: 'admin1', role: 'Admin' }, {
      table: 'Products', record: { ...base, sizeValue }
    }), /Nilai ukuran/);
    assert.equal(JSON.stringify(tables.Products), before);
  }
  assert.throws(() => context.saveMaster_({ id: 'admin1', role: 'Admin' }, {
    table: 'Products', record: { ...base, sizeValue: 100, sizeUnit: '' }
  }), /Pilih ml atau gr/);
  assert.equal(JSON.stringify(tables.Products), before);
});

test('Migrasi nilai ukuran mempertahankan pilihan Satuan dan Ukuran yang sudah terisi', function () {
  const context = setupContext('owner@test', 'owner@test');
  const expected = Array.from(vm.runInContext('HV_SCHEMA.Products', context));
  let headers = expected.slice(0, -2);
  const product = ['p1', 'cat', 'Produk', '', 10000, 'photo1', true, '', 'Paket', 'gr'];
  const before = JSON.stringify(product);
  const sheet = {
    getLastRow: () => 2, getLastColumn: () => headers.length, getMaxColumns: () => 26,
    getRange: () => ({ getValues: () => [headers.slice()],
      setValues: values => { headers = Array.from(values[0]); } })
  };
  context.extendSchemaColumns_({ getSheetByName: () => sheet }, 'Products');
  context.extendSchemaColumns_({ getSheetByName: () => sheet }, 'Products');
  assert.deepEqual(headers, expected);
  assert.equal(JSON.stringify(product), before);
  assert.equal(product[expected.indexOf('sizeValue')], undefined);
});

test('Ejaan Slace dari data atau client lama disimpan kembali sebagai Slice', function () {
  const { context, tables } = shippingContext();
  tables.Categories.push({ id: 'cat', active: true });
  tables.Products[0].unit = 'Slace';
  const base = { id: 'p1', name: 'Produk', categoryId: 'cat', price: 10000 };
  const user = { id: 'admin1', role: 'Admin' };
  assert.equal(context.saveMaster_(user, { table: 'Products', record: base }).unit, 'Slice');
  assert.equal(tables.Products[0].unit, 'Slice');
  assert.equal(context.saveMaster_(user, { table: 'Products',
    record: { ...base, unit: 'Slace' } }).unit, 'Slice');
});

test('Migrasi ejaan hanya mengoreksi sel Slace dan aman dijalankan ulang', function () {
  const context = setupContext('owner@test', 'owner@test');
  const headers = Array.from(vm.runInContext('HV_SCHEMA.Products', context));
  const column = headers.indexOf('unit') + 1;
  const data = [
    headers, ['p1', 'cat', 'Produk 1', '', 10000, '', true, '', 'Slace', 'gr', 100],
    ['p2', 'cat', 'Produk 2', '', 20000, '', true, '', 'Paket', 'ml', 250],
    ['p3', 'cat', 'Produk 3', '', 30000, '', true, '', 'Slice', 'gr', 50]
  ];
  const expected = structuredClone(data);
  expected[1][column - 1] = 'Slice';
  let writes = 0;
  const sheet = {
    getLastRow: () => data.length, getLastColumn: () => headers.length,
    getRange: (row, col, height = 1, width = 1) => ({
      getValues: () => data.slice(row - 1, row - 1 + height).map(line => line.slice(col - 1, col - 1 + width)),
      setValue: value => {
        assert.equal(col, column);
        data[row - 1][col - 1] = value;
        writes += 1;
      }
    })
  };
  const db = { getSheetByName: () => sheet };
  assert.equal(context.normalizeProductUnits_(db), 1);
  assert.equal(context.normalizeProductUnits_(db), 0);
  assert.equal(writes, 1);
  assert.deepEqual(data, expected);
  assert.equal(context.normalizeProductUnits_({ getSheetByName: () => null }), 0);
  assert.ok(source('apps-script/Schema.gs').includes('normalizeProductUnits_(db);'));
  assert.ok(source('apps-script/Recovery.gs').includes('normalizeProductUnits_(db);'));
});

test('Kode kategori dan produk otomatis, unik, stabil, dan tidak memakai ulang nomor terhapus', function () {
  const { context, tables } = shippingContext();
  tables.Categories.length = 0;
  tables.Products.length = 0;
  const user = { id: 'admin1', role: 'Admin' };
  const categories = ['Snack', 'Smoothies', 'Drik'].map(name =>
    context.saveMaster_(user, { table: 'Categories', record: { name } }));
  assert.deepEqual(categories.map(row => row.code), ['HV01', 'HV02', 'HV03']);
  assert.deepEqual(categories.map(row => row.productPrefix), ['SN', 'SM', 'DR']);
  const create = (category, name) => context.saveMaster_(user, { table: 'Products',
    record: { name, categoryId: category.id, price: 10000, code: 'PALSU' } });
  const snack = create(categories[0], 'Wafel rasa keju');
  assert.equal(snack.code, 'SN001');
  assert.equal(create(categories[1], 'Smoothies Vanila').code, 'SM001');
  assert.equal(create(categories[2], 'Vanila Drink').code, 'DR001');
  const second = create(categories[0], 'Wafel Coklat');
  assert.equal(second.code, 'SN002');
  tables.Products.splice(tables.Products.findIndex(row => row.id === second.id), 1);
  assert.equal(create(categories[0], 'Wafel Baru').code, 'SN003');
  const edited = context.saveMaster_(user, { table: 'Products',
    record: { id: snack.id, name: 'Nama Baru', price: 11000, categoryId: categories[1].id, code: 'SM999' } });
  assert.equal(edited.id, snack.id);
  assert.equal(edited.code, 'SN001');
  const clash = context.saveMaster_(user, { table: 'Categories', record: { name: 'Snack Baru' } });
  assert.equal(clash.code, 'HV04');
  assert.notEqual(clash.productPrefix, 'SN');
  assert.throws(() => context.saveMaster_(user, { table: 'Categories',
    record: { name: 'Kategori Lain', productPrefix: 'SN' } }), /Awalan produk/);
  assert.throws(() => context.saveMaster_(user, { table: 'Categories',
    record: { id: categories[0].id, name: 'Snack Renamed', productPrefix: 'XX' } }), /tidak dapat diubah/);
});

test('Allocator kode memakai maksimum data/counter serta menolak tanpa lock dan counter rusak', function () {
  const { context, properties } = shippingContext();
  assert.equal(context.nextMasterCode_('SN', 3, [{ code: 'SN009' }], 'testdb'), 'SN010');
  assert.equal(context.nextMasterCode_('SN', 3, [], 'testdb'), 'SN011');
  properties.set('MASTER_CODE_testdb_SN', 'rusak');
  assert.throws(() => context.nextMasterCode_('SN', 3, [], 'testdb'), /Counter/);
  context.LockService = { getScriptLock: () => ({ hasLock: () => false }) };
  assert.throws(() => context.nextMasterCode_('HV', 2, [], 'testdb'), /lock transaksi/);
});

test('Migrasi kode mengisi hanya kolom baru, mempertahankan relasi, dan aman diulang', function () {
  const { context } = shippingContext();
  const schema = vm.runInContext('HV_SCHEMA', context);
  const data = {
    Categories: [Array.from(schema.Categories), ['cat-old', 'Snack', true, 'waktu-lama', '', '']],
    Products: [Array.from(schema.Products),
      ['product-old', 'cat-old', 'Wafel', 'Deskripsi', 10000, 'photo-old', true, 'lama', 'Biji', 'gr', 100, '']]
  };
  let writes = 0;
  const db = { getId: () => 'staging-db', getSheetByName: table => ({
    getLastRow: () => data[table].length,
    getRange: (row, column, height = 1, width = 1) => ({
      getValues: () => data[table].slice(row - 1, row - 1 + height)
        .map(line => line.slice(column - 1, column - 1 + width)),
      setValue: value => { data[table][row - 1][column - 1] = value; writes += 1; }
    })
  }) };
  const productBefore = data.Products[1].slice(0, -1);
  const categoryBefore = data.Categories[1].slice(0, -2);
  assert.equal(context.assignMasterCodes_(db).updatedCells, 3);
  assert.deepEqual(data.Categories[1].slice(-2), ['HV01', 'SN']);
  assert.equal(data.Products[1].at(-1), 'SN001');
  assert.deepEqual(data.Products[1].slice(0, -1), productBefore);
  assert.deepEqual(data.Categories[1].slice(0, -2), categoryBefore);
  assert.equal(context.assignMasterCodes_(db).updatedCells, 0);
  assert.equal(writes, 3);
  data.Categories.push(['cat2', 'Snack2', true, '', 'HV01', 'XX']);
  assert.throws(() => context.assignMasterCodes_(db), /duplikat/);
  assert.equal(writes, 3);
  data.Categories.pop();
  data.Products[1][1] = 'category-missing';
  assert.throws(() => context.assignMasterCodes_(db), /tidak ditemukan/);
  assert.equal(writes, 3);
});

function namedUploadContext(kind) {
  const fixture = shippingContext();
  const { context, tables } = fixture;
  tables.Products[0].code = 'SN001';
  tables.Products[0].name = 'Wafel rasa keju';
  tables.Orders.push({ id: 'HV-091126-0001', fulfillment: 'READY', receipt: 'PICKUP' });
  const driveFiles = [];
  context.imageBlob_ = () => ({
    name: '', getBytes: () => Array(32).fill(0),
    setName(name) { this.name = name; return this; }
  });
  context.folder_ = () => ({
    getFiles: () => {
      let i = 0;
      return { hasNext: () => i < driveFiles.length, next: () => driveFiles[i++] };
    },
    createFile: blob => {
      const id = 'file-' + (driveFiles.length + 1);
      const file = {
        name: blob.name, description: '',
        getId: () => id,
        getName() { return this.name; }, getDescription() { return this.description; },
        setName(value) { this.name = value; }, setDescription(value) { this.description = value; }
      };
      driveFiles.push(file);
      return file;
    }
  });
  context.accountOrderAccess_ = () => tables.Orders[0];
  return { ...fixture, driveFiles, data: {
    kind, productId: 'p1', orderId: 'HV-091126-0001', received: true,
    requestId: 'upload1', mimeType: 'image/jpeg', base64: 'test'
  } };
}

test('Nama foto mengikuti TT/BT atau ID Produk-NamaProduk dengan ekstensi sesuai MIME', function () {
  for (const [kind, expected] of [
    ['TANDATERIMA', 'TT-HV-091126-0001.jpg'],
    ['STRUK', 'BT-HV-091126-0001.jpg'],
    ['PRODUK', 'SN001-WafelRasaKeju.jpg']
  ]) {
    const { context, data, driveFiles } = namedUploadContext(kind);
    const user = kind === 'TANDATERIMA' ? null : { id: 'admin1', role: 'Admin' };
    const customer = kind === 'TANDATERIMA' ? { id: 'customer' } : null;
    context.upload_(user, data, customer);
    assert.equal(driveFiles[0].name, expected);
    context.upload_(user, data, customer);
    assert.equal(driveFiles.length, 1);
  }
  const { context, data, driveFiles } = namedUploadContext('STRUK');
  data.mimeType = 'image/png';
  context.upload_({ role: 'Admin' }, data);
  assert.equal(driveFiles[0].name, 'BT-HV-091126-0001.png');
});

test('Retry upload bernama sederhana menemukan file jika penyimpanan metadata gagal', function () {
  const { context, data, driveFiles, tables } = namedUploadContext('PRODUK');
  const append = context.append_;
  context.append_ = () => { throw new Error('Sheet terputus'); };
  assert.throws(() => context.upload_({ role: 'Admin' }, data), /Sheet terputus/);
  assert.equal(driveFiles.length, 1);
  context.append_ = append;
  context.upload_({ role: 'Admin' }, data);
  assert.equal(driveFiles.length, 1);
  assert.equal(tables.Files.length, 1);
  assert.equal(driveFiles[0].name, 'SN001-WafelRasaKeju.jpg');
  data.requestId = 'upload2';
  context.upload_({ role: 'Admin' }, data);
  assert.equal(driveFiles.length, 2);
  assert.equal(tables.Files.length, 2);
});

test('Nama sementara memungkinkan retry jika penanda Drive gagal ditulis', function () {
  const { context, data, driveFiles } = namedUploadContext('STRUK');
  const folder = context.folder_();
  const create = folder.createFile;
  folder.createFile = blob => {
    const file = create(blob);
    let fail = true;
    const set = file.setDescription;
    file.setDescription = function (value) {
      if (fail) { fail = false; throw new Error('Drive terputus'); }
      set.call(this, value);
    };
    return file;
  };
  context.folder_ = () => folder;
  assert.throws(() => context.upload_({ role: 'Admin' }, data), /Drive terputus/);
  assert.ok(driveFiles[0].name.startsWith(context.digest_(data.requestId) + '-'));
  context.upload_({ role: 'Admin' }, data);
  assert.equal(driveFiles.length, 1);
  assert.equal(driveFiles[0].name, 'BT-HV-091126-0001.jpg');
});

test('Header tidak sesuai menyebut posisi serta header aktual/harapan tanpa menulis Sheet', function () {
  const context = setupContext('owner@test', 'owner@test');
  const expected = Array.from(vm.runInContext('HV_SCHEMA.Products', context));
  for (const actual of [
    expected.map((key, index) => index === 9 ? 'sizeValue' : key),
    [...expected, 'kolomTambahan'],
    expected.map((key, index) => index === 2 ? 'Nama Produk' : key)
  ]) {
    let writes = 0;
    const sheet = {
      getLastRow: () => 2, getLastColumn: () => actual.length,
      getRange: () => ({ getValues: () => [actual.slice()],
        setValues: () => { writes += 1; } })
    };
    assert.throws(() => context.extendSchemaColumns_({ getSheetByName: () => sheet }, 'Products'), error => {
      assert.ok(error.message.includes('Header aktual: ' + JSON.stringify(actual)));
      assert.ok(error.message.includes('Header yang diharapkan: ' + JSON.stringify(expected)));
      assert.ok(error.message.includes('inspectHealthyVibesSchema'));
      if (actual[9] === 'sizeValue') {
        assert.ok(error.message.includes('posisi 10. Aktual: "sizeValue"; diharapkan: "sizeUnit"'));
      }
      return true;
    });
    assert.equal(writes, 0);
  }
});

test('Pemeriksaan header baca-saja membedakan skema lama valid dan urutan berbeda', function () {
  const context = setupContext('owner@test', 'owner@test');
  const schema = vm.runInContext('HV_SCHEMA', context);
  const headers = {
    Categories: Array.from(schema.Categories),
    Products: Array.from(schema.Products).slice(0, 8)
  };
  const logs = [];
  context.console = { info: message => logs.push(message) };
  context.database_ = () => ({
    getSheetByName: name => ({
      getLastRow: () => 200, getLastColumn: () => headers[name].length,
      getRange: (row, column, height) => {
        assert.equal(row, 1);
        assert.equal(column, 1);
        assert.equal(height, 1);
        return { getValues: () => [headers[name].slice()] };
      }
    })
  });
  let products = context.inspectHealthyVibesSchema().find(row => row.table === 'Products');
  assert.equal(products.canAppend, true);
  assert.deepEqual(Array.from(products.missingColumns), ['unit', 'sizeUnit', 'sizeValue', 'code']);
  headers.Products.push('sizeValue', 'unit', 'sizeUnit');
  products = context.inspectHealthyVibesSchema().find(row => row.table === 'Products');
  assert.equal(products.canAppend, false);
  assert.equal(products.mismatches[0].column, 9);
  assert.equal(products.mismatches[0].actual, 'sizeValue');
  assert.equal(products.mismatches[0].expected, 'unit');
  assert.ok(logs.some(message => message.startsWith('Products: ')));
});

test('Pemeriksaan header menolak bukan pemilik sebelum membuka database', function () {
  const context = setupContext('other@test', 'owner@test');
  context.database_ = () => { throw new Error('Database tidak boleh dibuka'); };
  assert.throws(() => context.inspectHealthyVibesSchema(), /pemilik project/);
});

function masterPaginationContext(count) {
  const client = source('js/client.js');
  const body = { innerHTML: '', scrollIntoView() {} };
  let inputHandler;
  let focused;
  let selection;
  const input = { focus() { focused = 'master-search'; },
    setSelectionRange(start, end) { selection = [start, end]; } };
  const rows = Array.from({ length: count }, (_, index) => ({
    id: 'p' + (index + 1), code: 'SN' + String(index + 1).padStart(3, '0'),
    name: 'Produk ' + (index + 1), categoryId: 'cat-private', unit: 'Biji',
    sizeUnit: 'gr', sizeValue: 100, active: true
  }));
  const context = vm.createContext({
    window: {}, tableLabels: { Products: 'Setup Produk', Categories: 'Kategori' },
    state: { user: { role: 'Admin' }, admin: { tables: { Products: rows,
      Categories: Array.from({ length: 15 }, (_, index) => ({ id: 'cat' + index, name: 'Kategori ' + index })) } } },
    safe: value => String(value ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    masterText: (key, value) => value, renderUsers() {},
    document: {
      addEventListener: (type, handler) => { if (type === 'input') { inputHandler = handler; } },
      getElementById: id => {
        if (id === 'admin-body') { return body; }
        if (id === 'master-search') { return input; }
        if (!body.innerHTML.includes('id="' + id + '"')) { return null; }
        return { disabled: body.innerHTML.includes('id="' + id + '" type="button" disabled'),
          focus() { focused = id; } };
      },
      querySelectorAll: () => []
    }
  });
  vm.runInContext(source('js/icons.js'), context);
  context.buttonLabel = context.window.HV_UI.label;
  vm.runInContext(client.slice(client.indexOf('  function iconButton('),
    client.indexOf('  // Menu pengelola terbuka')), context);
  vm.runInContext(client.slice(client.indexOf('  function renderMaster('),
    client.indexOf('  // Membuka formulir tambah')), context);
  vm.runInContext(client.slice(client.indexOf('  async function clickAction('),
    client.indexOf('  // Memperbarui hasil pencarian')), context);
  vm.runInContext(client.slice(client.indexOf('  // Memperbarui hasil pencarian'),
    client.indexOf('  // Perubahan pilihan tindakan')), context);
  return { context, body, rows, input: event => inputHandler(event),
    focused: () => focused, selection: () => selection,
    count: () => (body.innerHTML.match(/data-edit=/g) || []).length };
}

function accountHeaderContext() {
  const element = () => ({
    dataset: {}, attributes: {}, innerHTML: '', textContent: '', hidden: true,
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'data-nav') { delete this.dataset.nav; }
    }
  });
  const button = element();
  button.dataset.nav = 'admin';
  const user = element();
  const customerOrders = element();
  const header = { active: false, classList: { toggle(name, value) { header.active = value; } } };
  const client = source('js/client.js');
  const context = vm.createContext({
    state: { token: '', user: null }, window: {},
    document: { getElementById: id => id === 'header-auth' ? button : id === 'header-user' ? user :
      id === 'header-customer-orders' ? customerOrders : null,
      querySelector: () => header }
  });
  vm.runInContext(source('js/icons.js'), context);
  context.buttonLabel = context.window.HV_UI.label;
  vm.runInContext(client.slice(client.indexOf('  function renderAccountHeader('),
    client.indexOf('  // Tombol ringkas')), context);
  return { context, button, user, customerOrders, header, client };
}

test('Pesanan Saya hanya terlihat untuk sesi Konsumen, termasuk setelah logout', function () {
  const { context, customerOrders } = accountHeaderContext();
  for (const role of ['Admin', 'Operator', 'Viewer', 'Konsumen']) {
    context.state.token = 'test-only';
    context.state.user = { username: 'user01', role };
    context.renderAccountHeader();
    assert.equal(customerOrders.hidden, role !== 'Konsumen');
  }
  context.state.token = '';
  context.renderAccountHeader();
  assert.equal(customerOrders.hidden, true);
  context.state.user = null;
  context.renderAccountHeader();
  assert.equal(customerOrders.hidden, true);
  assert.match(source('index.html'), /id="header-customer-orders"[^>]*hidden/);
  assert.match(source('css/styles.css'), /#header-customer-orders\[hidden\] \{ display: none; \}/);
});

test('Kartu produk menampilkan satuan dan ukuran, aman untuk data lama dan teks HTML', function () {
  const client = source('js/client.js');
  const context = vm.createContext({});
  vm.runInContext(client.slice(client.indexOf('  function safe('), client.indexOf('  let pending =')), context);
  vm.runInContext(client.slice(client.indexOf('  function renderProductSpecs('),
    client.indexOf('  async function startCheckout(')), context);
  const html = context.renderProductSpecs({ unit: 'Botol', sizeValue: 250, sizeUnit: 'ml' });
  assert.ok(html.includes('Satuan: <strong>Botol</strong>'));
  assert.ok(html.includes('Ukuran: <strong>250 ml</strong>'));
  assert.ok(context.renderProductSpecs({ unit: 'Slace', sizeValue: 0.5, sizeUnit: 'gr' }).includes('0.5 gr'));
  assert.ok(context.renderProductSpecs({ unit: 'Slace' }).includes('Slice'));
  assert.equal(context.renderProductSpecs({}), '');
  assert.equal(context.renderProductSpecs({ sizeValue: '', sizeUnit: 'gr' }), '');
  assert.equal(context.renderProductSpecs({ sizeValue: 100 }), '');
  assert.ok(!context.renderProductSpecs({ unit: '<img src=x>' }).includes('<img'));
  assert.ok(client.includes("renderProductSpecs(product) + '<p class=\"description\">'"));
});

test('Pesanan pengelola memakai satu tabel, filter dan pagination tetap berfungsi', function () {
  const client = source('js/client.js');
  const list = { innerHTML: '' };
  const search = { value: '' };
  const filter = { value: '' };
  const orders = Array.from({ length: 21 }, (_, i) => ({
    id: 'HV-' + String(i + 1).padStart(4, '0'), name: 'Pelanggan ' + i, phone: '081' + i,
    createdAt: '2026-11-' + String(i + 1).padStart(2, '0'),
    date: '2026-11-10', time: '10:00', total: 10000,
    paymentStatus: 'UNPAID', fulfillment: i === 0 ? 'READY' : 'NEW'
  }));
  const context = vm.createContext({
    state: { user: { role: 'Admin' }, admin: { tables: { Orders: orders } }, listPage: 0 },
    document: { getElementById: id => ({ 'order-search': search, 'order-filter': filter, 'order-list': list })[id] },
    safe: String, dateText: String, rupiah: String, buttonLabel: (_, text) => text,
    paymentLabel: value => value, fulfillmentLabel: value => value,
    iconButton: (_, label, attributes) => '<button ' + attributes + '>' + label + '</button>'
  });
  vm.runInContext(client.slice(client.indexOf('  function filterOrders('), client.indexOf('  // Detail pesanan')), context);
  context.filterOrders();
  assert.equal((list.innerHTML.match(/data-order=/g) || []).length, 20);
  assert.ok(list.innerHTML.includes('class="table orders-table"'));
  assert.ok(list.innerHTML.includes('<th class="record-action-cell">Aksi</th>'));
  assert.ok(!list.innerHTML.includes('<article'));
  context.state.listPage = 1;
  context.filterOrders();
  assert.equal((list.innerHTML.match(/data-order=/g) || []).length, 1);
  search.value = 'HV-0021';
  context.filterOrders();
  assert.equal(context.state.listPage, 0);
  assert.ok(list.innerHTML.includes('data-order="HV-0021"'));
  search.value = '';
  filter.value = 'READY';
  context.filterOrders();
  assert.equal((list.innerHTML.match(/data-order=/g) || []).length, 1);
  assert.ok(list.innerHTML.includes('data-order="HV-0001"'));
  const css = source('css/styles.css');
  assert.match(css, /\.orders-table \.record-action-cell \{[^}]*position: sticky;[^}]*right: 0;/);
  assert.ok(!css.includes('.order-desktop'));
});

test('Tombol orange dan biru tua memakai abu-abu terang saat hover, fokus, dan klik', function () {
  const css = source('css/styles.css');
  assert.match(css, /\.btn\.btn-primary:not\(:disabled\):is\(:hover, :focus, :active\),\s*\.btn\.btn-green:not\(:disabled\):is\(:hover, :focus, :active\) \{\s*background: #e9ecef;/);
  assert.ok(css.includes('--bs-btn-active-bg: #e9ecef;'));
  assert.ok(css.includes('--bs-btn-active-color: var(--ink);'));
});

test('Header menunjukkan username dan Logout untuk semua role, lalu kembali Login saat sesi kosong', function () {
  const { context, button, user, header } = accountHeaderContext();
  for (const role of ['Admin', 'Operator', 'Viewer', 'Konsumen']) {
    context.state.token = 'test-only';
    context.state.user = { id: 'internal-id', username: role.toLowerCase() + '01', role };
    context.renderAccountHeader();
    assert.ok(button.innerHTML.includes('class="header-action-text">Logout</span>'));
    assert.equal(button.attributes['aria-label'], 'Logout');
    assert.equal(button.dataset.nav, undefined);
    assert.equal(button.dataset.action, 'logout');
    assert.equal(user.textContent, context.state.user.username);
    assert.equal(user.hidden, false);
    assert.equal(header.active, true);
    assert.equal(user.attributes['aria-label'], 'Buka akun: ' + context.state.user.username);
  }
  context.state.user.username = '<img src=x onerror=alert(1)>';
  context.renderAccountHeader();
  assert.equal(user.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(user.innerHTML, '');
  context.state.token = '';
  context.renderAccountHeader();
  assert.equal(user.textContent, '');
  assert.equal(user.hidden, true);
  assert.equal(header.active, false);
  assert.equal(button.dataset.action, undefined);
  assert.equal(button.dataset.nav, 'admin');
  assert.ok(button.innerHTML.includes('class="header-action-text">Login</span>'));
  context.state.user = null;
  context.renderAccountHeader();
  assert.equal(button.title, 'Login');
});

test('Login dan tombol Logout header menyinkronkan identitas akun serta membersihkan sesi', async function () {
  const { context, button, user, client } = accountHeaderContext();
  const actions = [];
  context.formData = () => ({});
  context.rpc = async action => {
    actions.push(action);
    return action === 'login' ? { token: 'test-only', user: { id: 'test-id', username: 'admin01', role: 'Admin' } } : {};
  };
  context.loadAdmin = async () => {};
  context.navigate = async () => context.renderAccountHeader();
  vm.runInContext(client.slice(client.indexOf('  async function submitAction('),
    client.indexOf('  // Menangani halaman sebelum instalasi')), context);
  vm.runInContext(client.slice(client.indexOf('  async function clickAction('),
    client.indexOf('  // Memperbarui hasil pencarian')), context);
  await context.submitAction({ id: 'login-form', querySelector: () => ({ textContent: '' }), reset() {} });
  assert.equal(user.textContent, 'admin01');
  assert.equal(button.dataset.action, 'logout');
  button.id = 'header-auth';
  await context.clickAction(button);
  assert.deepEqual(actions, ['login', 'logout']);
  assert.equal(context.state.token, '');
  assert.equal(context.state.user, null);
  assert.equal(context.state.customerOrders, null);
  assert.equal(user.hidden, true);
  assert.equal(button.dataset.nav, 'admin');
});

test('Akun mobile berada setelah tiga tautan menu dan kembali ke header saat resize atau logout', function () {
  const { context, button, user, customerOrders, header, client } = accountHeaderContext();
  const container = children => ({
    children,
    appendChild(child) {
      if (child.parentElement) {
        child.parentElement.children = child.parentElement.children.filter(item => item !== child);
      }
      this.children.push(child);
      child.parentElement = this;
    }
  });
  const desktop = container([]);
  const nav = container(['Home', 'Katalog', 'Pesanan Saya']);
  const account = { children: [user, button] };
  desktop.appendChild(account);
  context.headerViewport = { matches: true };
  context.document.getElementById = id => ({
    'header-auth': button, 'header-user': user, 'header-account': account, 'site-nav': nav,
    'header-customer-orders': customerOrders
  })[id] || null;
  context.document.querySelector = selector => selector === '.header-inner' ? desktop : header;
  context.state.token = 'test-only';
  context.state.user = { username: 'konsumen01', role: 'Konsumen' };
  context.renderAccountHeader();
  assert.equal(customerOrders.hidden, false);
  assert.equal(account.parentElement, nav);
  assert.deepEqual(nav.children.slice(0, 3), ['Home', 'Katalog', 'Pesanan Saya']);
  assert.equal(nav.children[3], account);
  assert.equal(desktop.children.length, 0);
  context.renderAccountHeader();
  assert.equal(nav.children.length, 4);
  context.headerViewport.matches = false;
  context.renderAccountHeader();
  assert.equal(account.parentElement, desktop);
  assert.equal(customerOrders.hidden, false);
  assert.equal(nav.children.length, 3);
  context.state.user.role = 'Admin';
  context.renderAccountHeader();
  assert.equal(customerOrders.hidden, true);
  context.headerViewport.matches = true;
  context.renderAccountHeader();
  assert.equal(account.parentElement, nav);
  context.state.token = '';
  context.state.user = null;
  context.renderAccountHeader();
  assert.equal(account.parentElement, desktop);
  assert.equal(nav.children.length, 3);
  assert.equal(user.hidden, true);
  assert.equal(customerOrders.hidden, true);
  assert.equal(button.dataset.nav, 'admin');
  assert.ok(client.includes("headerViewport.addEventListener('change', renderAccountHeader)"));
  const css = source('css/styles.css');
  const mobileCss = css.slice(css.indexOf('@media (max-width: 767px)'), css.indexOf('@media (prefers-reduced-motion'));
  assert.match(mobileCss, /\.site-nav\s*\{[^}]*display:\s*none;[^}]*grid-row:\s*2;[^}]*flex-direction:\s*column;/);
  assert.match(mobileCss, /\.menu-open \.site-nav\s*\{\s*display:\s*flex;/);
  assert.ok(!mobileCss.includes('.site-header.is-authenticated .site-nav { grid-row: 3; }'));
  assert.ok(!mobileCss.includes('.header-account { grid-column: 1 / -1; grid-row: 2; }'));
});

test('Setup Produk membatasi 10 record, tombol pada batas 10, dan halaman terakhir', async function () {
  for (const total of [0, 9, 10, 11, 25]) {
    const fixture = masterPaginationContext(total);
    const { context, body } = fixture;
    context.renderMaster('Products');
    assert.equal(fixture.count(), Math.min(10, total));
    assert.equal(body.innerHTML.includes('id="next-master"'), total >= 10);
    if (total >= 10) {
      assert.ok(body.innerHTML.includes('id="previous-master" type="button" disabled'));
      assert.equal(body.innerHTML.includes('id="next-master" type="button" disabled'), total === 10);
    }
  }
  const fixture = masterPaginationContext(25);
  fixture.context.renderMaster('Products');
  await fixture.context.clickAction({ id: 'next-master', dataset: {} });
  assert.equal(fixture.count(), 10);
  assert.ok(fixture.body.innerHTML.includes('Halaman 2 dari 3'));
  assert.ok(fixture.body.innerHTML.includes('data-edit="p11"'));
  assert.ok(!fixture.body.innerHTML.includes('data-edit="p1"'));
  await fixture.context.clickAction({ id: 'next-master', dataset: {} });
  assert.equal(fixture.count(), 5);
  assert.ok(fixture.body.innerHTML.includes('id="next-master" type="button" disabled'));
  assert.equal(fixture.focused(), 'previous-master');
  await fixture.context.clickAction({ id: 'previous-master', dataset: {} });
  assert.ok(fixture.body.innerHTML.includes('Halaman 2 dari 3'));
});

test('Pencarian produk mencakup semua halaman dan mempertahankan fokus serta posisi kursor', function () {
  const fixture = masterPaginationContext(25);
  const { context, body } = fixture;
  context.renderMaster('Products');
  context.state.masterPage = 2;
  fixture.input({ target: { id: 'master-search', value: 'SN024', selectionStart: 5, selectionEnd: 5 } });
  assert.equal(context.state.masterPage, 0);
  assert.equal(fixture.count(), 1);
  assert.ok(body.innerHTML.includes('data-edit="p24"'));
  assert.ok(body.innerHTML.includes('value="SN024"'));
  assert.equal(fixture.focused(), 'master-search');
  assert.deepEqual(fixture.selection(), [5, 5]);
  fixture.input({ target: { id: 'master-search', value: 'cat-private', selectionStart: 11, selectionEnd: 11 } });
  assert.equal(fixture.count(), 0);
  assert.ok(body.innerHTML.includes('Tidak ada record yang sesuai pencarian.'));
  fixture.input({ target: { id: 'master-search', value: '', selectionStart: 0, selectionEnd: 0 } });
  assert.equal(fixture.count(), 10);
});

test('Halaman produk dijepit setelah data dihapus dan tidak memengaruhi tabel lain', function () {
  const fixture = masterPaginationContext(25);
  const { context, body, rows } = fixture;
  context.renderMaster('Products');
  context.state.masterPage = 2;
  rows.splice(10);
  context.renderMaster('Products');
  assert.equal(context.state.masterPage, 0);
  assert.equal(fixture.count(), 10);
  context.state.masterSearch = 'SN001';
  context.renderMaster('Categories');
  assert.equal(fixture.count(), 15);
  assert.ok(!body.innerHTML.includes('id="next-master"'));
  assert.equal(context.state.masterSearch, '');
  context.renderMaster('Products');
  context.renderMaster('Users');
  assert.equal(context.state.masterTable, 'Users');
});
