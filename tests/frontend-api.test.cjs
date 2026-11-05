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

test('Foto publik tidak mengantre lock, transaksi lainnya tetap memakai lock', function () {
  const context = backend();
  let locks = 0;
  context.withLock_ = function (operation) { locks += 1; return operation(); };
  context.productPhoto_ = function (data) { return { mimeType: 'image/jpeg', base64: data.productId }; };
  context.quote_ = function () { return {}; };
  context.createOrder_ = function () { return {}; };
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

test('Branding memakai aset pemilik, ikon pengaturan dan gambar ikut publikasi', function () {
  const html = source('index.html');
  const client = source('js/client.js');
  const workflow = source('.github/workflows/jekyll-docker.yml');
  assert.ok(html.includes('image/Logo_HealthyVibes_Trans.png'));
  assert.ok(client.includes('image/Header_HealthyVibes.jpg'));
  assert.ok(html.includes('aria-label="Admin"'));
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

test('Label awal memakai Katalog dan Admin dengan navigasi HP berikon', function () {
  const html = source('index.html');
  assert.match(html, /data-nav="shop"[^>]*>[\s\S]*?<span>Katalog<\/span>/);
  const toggle = html.match(/<button[^>]*id="nav-toggle"[\s\S]*?<\/button>/)[0];
  assert.ok(toggle.includes('<svg'));
  assert.ok(!toggle.includes('<span'));
  assert.ok(toggle.includes('aria-label="Buka menu navigasi"'));
  assert.match(html, /class="header-action-text">Admin<\/span>/);
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
    Products: [{ id: 'p1', price: 10000, active: true }, { id: 'p2', price: 10000, active: true }],
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

test('Dashboard membaca tiga tabel sekali dan tidak menyusun laporan lengkap', function () {
  const reads = [];
  const context = adminContext({
    Orders: [
      { id: 'a', transactionState: 'COMMITTED', paymentStatus: 'PENDING', refundStatus: 'PENDING', snapshotJson: 'Tidak perlu diparse' },
      { id: 'b', transactionState: 'COMMITTED', paymentStatus: 'PAID', refundStatus: 'NONE' },
      { id: 'c', transactionState: 'PREPARING', paymentStatus: 'PENDING', refundStatus: 'PENDING' }
    ],
    Payments: [{ orderId: 'a', amount: 100 }, { orderId: 'b', amount: 200 }, { orderId: 'c', amount: 500 }],
    Refunds: [{ orderId: 'a', amount: 10 }, { orderId: 'unknown', amount: 20 }]
  }, reads);
  context.report_ = function () { throw new Error('Dashboard tidak boleh menyusun laporan'); };
  const result = context.adminData_({ role: 'Admin' }, { page: 'Dashboard' });
  assert.deepEqual(reads, ['Orders', 'Payments', 'Refunds']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.kpi)),
    { orders: 2, payments: 300, refunds: 10, pending: 1, refundPending: 1 });
  assert.deepEqual(Object.keys(result.tables), []);
});

test('Data Admin hanya memuat tabel menu aktif beserta kebutuhan formulirnya', function () {
  for (const [page, expected] of [
    ['Products', ['Products', 'Categories']], ['ReadyStock', ['ReadyStock', 'Products']],
    ['PreorderCapacity', ['PreorderCapacity', 'Products']], ['Discounts', ['Discounts', 'Products']],
    ['Pesanan', ['Orders', 'Files', 'Shipping']], ['Laporan', ['Categories']],
    ['Pengaturan', ['Settings']], ['Backup', []], ['Users', ['Users']]
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
    for (const page of ['Users', 'Pengaturan', 'Backup', 'Sessions']) {
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
        window: {}, app: app, safe: String, rupiah: String,
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
      assert.equal(buttons.length, role === 'Admin' ? 14 : role === 'Operator' ? 7 : 2);
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
  for (const file of ['Store.gs', 'Rules.gs', 'Orders.gs']) {
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

test('Kunci akses baru berisi 10 karakter acak Web Crypto tanpa Math.random', function () {
  const client = source('js/client.js');
  const code = client.slice(client.indexOf('  function randomToken('),
    client.indexOf('  async function navigate('));
  const context = vm.createContext({ crypto: crypto });
  vm.runInContext(code, context);
  const keys = new Set();
  for (let i = 0; i < 128; i += 1) {
    const key = context.randomToken();
    assert.match(key, /^[A-Za-z0-9_-]{10}$/);
    keys.add(key);
  }
  assert.equal(keys.size, 128);
  assert.ok(!code.includes('Math.random'));
  assert.ok(client.includes('Simpan melalui tombol "Unduh Kunci Akses"'));
});

test('Status menerima kunci baru dan lama, tetapi menolak kunci salah serta tidak membocorkan hash', function () {
  const { context } = orderNumberContext();
  const digest = function (value) {
    return require('node:crypto').createHash('sha256').update(value).digest('hex');
  };
  context.digest_ = digest;
  context.equal_ = function (left, right) { return left === right; };
  for (const key of ['AbC123_-xy', 'a'.repeat(43)]) {
    const order = {
      id: 'HV-051126-0001', accessHash: digest(key),
      transactionState: 'COMMITTED', snapshotJson: '{"items":[]}'
    };
    context.rows_ = function () { return [order]; };
    assert.equal(context.customerAccess_({ orderId: order.id, accessToken: key }), order);
    for (const wrong of [key.toUpperCase(), '', 'incorrect1']) {
      assert.throws(function () {
        context.customerAccess_({ orderId: order.id, accessToken: wrong });
      }, /Pesanan atau kunci akses tidak valid/);
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

test('Admin mengganti hash di bawah lock; kunci lama ditolak dan kunci baru diterima', function () {
  const fixture = recoveryContext('Admin');
  const before = { ...fixture.order };
  const result = fixture.context.api_({
    action: 'resetOrderAccess', token: 'session',
    data: { orderId: before.id, phone: before.phone, confirmed: true }
  });
  assert.equal(result.ok, true);
  assert.match(result.data.accessToken, /^[A-Za-z0-9_-]{10}$/);
  assert.equal(result.data.orderId, before.id);
  assert.equal(fixture.locks(), 1);
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.writes[0].name, 'Orders');
  assert.deepEqual(Object.keys(fixture.writes[0].changes), ['accessHash']);
  assert.notEqual(fixture.order.accessHash, before.accessHash);
  assert.deepEqual({ ...fixture.order, accessHash: before.accessHash }, before);
  assert.throws(() => fixture.context.customerAccess_({
    orderId: before.id, accessToken: 'oldKey1234'
  }), /kunci akses tidak valid/);
  assert.equal(fixture.context.customerAccess_({
    orderId: before.id, accessToken: result.data.accessToken
  }), fixture.order);
  assert.equal(fixture.audits.length, 1);
  assert.equal(fixture.audits[0].action, 'RESET_ORDER_ACCESS');
  const audit = JSON.stringify(fixture.audits);
  for (const secret of [result.data.accessToken, fixture.order.accessHash, before.phone]) {
    assert.ok(!audit.includes(secret));
  }
});

test('Rotasi ditolak untuk Operator, Viewer dan tanpa sesi, termasuk panggilan langsung', function () {
  for (const role of ['Operator', 'Viewer', 'Admin']) {
    const fixture = recoveryContext(role);
    const data = { orderId: fixture.order.id, phone: fixture.order.phone, confirmed: true };
    const result = fixture.context.api_({
      action: 'resetOrderAccess', token: role === 'Admin' ? '' : 'session', data
    });
    assert.equal(result.ok, false);
    assert.equal(fixture.writes.length, 0);
    assert.equal(fixture.audits.length, 0);
    if (role !== 'Admin') {
      assert.throws(() => fixture.context.resetOrderAccess_({ role }, data), /Hanya Admin/);
    }
  }
});

test('Nomor pesanan, HP, konfirmasi, dan status transaksi diperiksa sebelum rotasi', function () {
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

test('Form pemulihan meminta HP kosong dan konfirmasi; hasil hanya di dialog', function () {
  const client = source('js/client.js');
  const context = vm.createContext({
    safe: value => String(value || ''),
    buttonLabel: (icon, label) => label,
    field: (label, name, value) => `<input name="${name}" value="${value}">`
  });
  vm.runInContext(client.slice(client.indexOf('  function orderAccessForm('),
    client.indexOf('  function masterFields(')), context);
  const html = context.orderAccessForm({ id: 'order1', phone: '08123', transactionState: 'COMMITTED' });
  assert.ok(html.includes('name="phone" value=""'));
  assert.ok(html.includes('name="confirmed" required'));
  assert.ok(!html.includes('08123'));
  assert.equal(context.orderAccessForm({ transactionState: 'PREPARING' }), '');
  assert.ok(client.includes("state.user.role === 'Admin' ? orderAccessForm(order) : ''"));
  assert.ok(client.includes("dialog.addEventListener('close'"));
  const handler = client.slice(client.indexOf("} else if (form.id === 'reset-access-form')"),
    client.indexOf("} else if (form.id === 'order-action-form')"));
  assert.ok(handler.includes('readonly'));
  assert.ok(!handler.includes('state.accessToken ='));
});

test('Retry pesanan mempertahankan nomor lama tanpa mengambil urutan baru', function () {
  const { context, properties } = orderNumberContext();
  context.recoverOrders_ = function () {};
  context.settings_ = function () { return { ordersEnabled: 'true' }; };
  context.digest_ = function () { return 'hash'; };
  context.equal_ = function (left, right) { return left === right; };
  context.rows_ = function () {
    return [{ id: 'HV-021126-0001', requestId: 'retry-1', requestHash: 'hash', accessHash: 'hash' }];
  };
  context.customerOrder_ = function (order) { return { id: order.id }; };
  context.nextOrderId_ = function () { throw new Error('Tidak boleh mengambil nomor baru saat retry.'); };
  const data = {
    requestId: 'retry-1', name: 'Pelanggan', phone: '081234567890', acceptPolicy: true
  };
  for (const accessToken of ['AbC123_-xy', 'a'.repeat(43)]) {
    assert.equal(context.createOrder_(Object.assign({}, data, { accessToken })).id, 'HV-021126-0001');
  }
  for (const accessToken of ['a'.repeat(9), 'a'.repeat(11), 'a'.repeat(42), 'a'.repeat(44), 'abcde!1234']) {
    assert.throws(function () {
      context.createOrder_(Object.assign({}, data, { accessToken }));
    }, /Kunci akses pelanggan tidak valid/);
  }
  assert.equal(properties.size, 0);
  assert.ok(source('apps-script/Files.gs').includes("const name = order.id + '.pdf';"));
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
  context.SpreadsheetApp = { flush: function () {} };
  const data = {
    requestId: 'pesanan-1', accessToken: 'AbC123_-xy', name: 'Pelanggan',
    phone: '081234567890', acceptPolicy: true, type: 'DIRECT',
    receipt: 'PICKUP', paymentMethod: 'PICKUP_CASH', date: '2026-11-02', time: '17:00'
  };
  assert.equal(context.createOrder_(data).id, 'HV-021126-0001');
  assert.equal(context.createOrder_(data).id, 'HV-021126-0001');
  assert.equal(orders.length, 1);
  assert.equal(JSON.parse(properties.get('ORDER_NUMBER_COUNTER')).sequence, 1);
  assert.equal(context.createOrder_(Object.assign({}, data, { requestId: 'pesanan-2' })).id,
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
  for (const name of ['status', 'party', 'amount', 'reference', 'reason', 'courier',
    'tracking', 'customerAgreed', 'feePaidToCourier']) {
    form.elements[name] = {
      type: ['customerAgreed', 'feePaidToCourier'].includes(name) ? 'checkbox' : 'text',
      value: 'nilai lama', checked: true, disabled: false, required: true
    };
  }
  const context = vm.createContext({
    state: { admin: { tables: { Orders: [order], Shipping: [] } } },
    safe: String, fulfillmentLabel: String
  });
  vm.runInContext(client.slice(client.indexOf('  function orderActionRules('),
    client.indexOf('  function orderAccessForm(')), context);
  return { context, form, order };
}

test('Semua input tindakan nonaktif secara default; pilihan hanya mengaktifkan input terkait', function () {
  const { context, form, order } = actionFormContext();
  context.updateOrderAction(form);
  assert.ok(form.querySelector('[type="submit"]').disabled);
  assert.ok(Object.entries(form.elements).filter(([key]) => key !== 'action')
    .every(([, input]) => input.disabled && !input.required));
  const expected = {
    verifyPayment: ['amount', 'reference'], fulfillment: ['status'],
    cancelOrder: ['party', 'reason'], rejectCancellation: ['reason'],
    refund: ['reference'], shipping: ['amount', 'courier', 'tracking', 'customerAgreed', 'feePaidToCourier']
  };
  for (const [action, fields] of Object.entries(expected)) {
    order.fulfillment = action === 'refund' ? 'CANCELLED' : 'NEW';
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
  assert.equal(form.elements.customerAgreed.checked, false);
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
    ['refund', { fulfillment: 'CANCELLED', refundStatus: 'COMPLETED' }],
    ['rejectCancellation', { cancelRequestedAt: '' }],
    ['cancelOrder', { fulfillment: 'COMPLETED' }],
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

test('Status pelanggan memisahkan pembayaran, tahap berjalan, pembatalan dan refund', function () {
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
  assert.ok(pending.includes('Pesanan belum dibatalkan'));
  assert.ok(!pending.includes('Sedang dikirim'));
  const cancelled = context.orderStatusPanel({
    fulfillment: 'CANCELLED', paymentStatus: 'PAID', refundStatus: 'PENDING',
    refundAmount: 45000, refundDueAt: '2026-11-06'
  });
  assert.ok(cancelled.includes('Dibatalkan'));
  assert.ok(cancelled.includes('Menunggu transfer toko'));
  assert.ok(cancelled.includes('45000'));
  assert.ok(cancelled.includes('Batas pengembalian'));
  assert.ok(!cancelled.includes('order-progress'));
  assert.ok(context.orderStatusPanel({
    fulfillment: 'CANCELLED', refundStatus: 'COMPLETED'
  }).includes('Sudah ditransfer'));
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
  for (const title of ['Jadwal dan Penerima', 'Rincian Produk', 'Dokumen dan Kunci Akses', 'Perbarui Status']) {
    assert.ok(html.includes(title));
  }
  assert.ok(!html.includes('id="proof-form"'));
  assert.ok(!html.includes('id="cancel-form"'));
  context.state.order.paymentStatus = 'UNPAID';
  context.state.order.fulfillment = 'NEW';
  context.renderOrder();
  assert.ok(context.app.innerHTML.includes('id="proof-form"'));
  assert.ok(context.app.innerHTML.includes('id="cancel-form"'));
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
