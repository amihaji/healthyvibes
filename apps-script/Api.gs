// URL Google sekarang menjadi API; tampilan pelanggan disajikan dari GitHub.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    service: 'Healthy Vibes API',
    protocol: 'healthyvibes-api-v1'
  })).setMimeType(ContentService.MimeType.JSON);
}

// Origin menentukan tujuan balasan, bukan bukti login atau hak akses pengguna.
function frontendOrigins_() {
  const configured = PropertiesService.getScriptProperties()
    .getProperty('FRONTEND_ORIGINS');
  const origins = configured
    ? configured.split(',').map(function (origin) { return origin.trim(); })
    : ['https://amihaji.github.io', 'https://www.beratidealku.com'];
  if (origins.some(function (origin) {
    return !/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(origin) &&
      !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?$/.test(origin);
  })) {
    throw new Error('FRONTEND_ORIGINS harus berisi origin tanpa path.');
  }
  return origins;
}

// Mencegah data pelanggan menutup tag script pada respons HTML.
function jsonForHtml_(value) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Balasan dibaca oleh transport frontend, bukan dianggap sukses karena POST terkirim.
function transportReply_(origin, channel, response) {
  const envelope = {
    protocol: 'healthyvibes-api-v1',
    channel: channel,
    response: response
  };
  const html = [
    '<!doctype html>',
    '<html lang="id"><head><meta charset="utf-8">',
    '<meta name="referrer" content="no-referrer">',
    '<title>Respons API Healthy Vibes</title></head><body>',
    '<script>',
    '"use strict";',
    'window.top.postMessage(',
    jsonForHtml_(envelope),
    ',',
    jsonForHtml_(origin),
    ');',
    '</script>',
    '</body></html>'
  ].join('\n');
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Password dan token diterima melalui badan POST, tidak melalui query URL.
function doPost(event) {
  const params = event && event.parameter || {};
  const origin = String(params.clientOrigin || '');
  const channel = String(params.channel || '');
  try {
    if (frontendOrigins_().indexOf(origin) < 0 || !/^[a-f0-9]{32}$/.test(channel)) {
      throw new Error('Asal frontend atau kanal respons tidak diizinkan.');
    }
  } catch {
    // Tidak mengirim payload atau data privat ke origin yang belum diizinkan.
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      message: 'Asal frontend atau kanal respons tidak diizinkan.'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  let response;
  try {
    const request = JSON.parse(text_(params.payload, 'Payload', 8000000));
    if (
      !request || typeof request !== 'object' || Array.isArray(request) ||
      typeof request.action !== 'string' ||
      (request.data !== undefined &&
        (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)))
    ) {
      throw new Error('Format permintaan tidak valid.');
    }
    response = api_(request);
  } catch (error) {
    response = { ok: false, message: String(error.message || 'Permintaan tidak valid.') };
  }
  return transportReply_(origin, channel, response);
}

// Dispatcher tetap memeriksa sesi, level, harga, dan stok di backend.
function api_(request) {
  try {
    if (!request || typeof request !== 'object') {
      throw new Error('Permintaan tidak valid.');
    }
    // Foto hanya dibaca, jadi tidak perlu mengantre lock transaksi stok/pembayaran.
    // Dispatcher tetap membatasi foto ke produk aktif; izin Drive tidak diubah.
    if (request.action === 'productPhoto') {
      return { ok: true, data: dispatch_(request) };
    }
    return { ok: true, data: withLock_(function () { return dispatch_(request); }) };
  } catch (error) {
    // Detail rahasia atau stack tidak dikirim ke pelanggan.
    return { ok: false, message: String(error.message || 'Operasi gagal.') };
  }
}

function dispatch_(request) {
  const action = request.action;
  const data = request.data || {};
  const anonymous = {
    catalog: function () { return catalog_(data); },
    quote: function () { return quote_(data); },
    registerCustomer: function () { return registerCustomer_(data); },
    productPhoto: function () { return productPhoto_(data); },
    storeAsset: function () { return storeAsset_(data); },
    login: function () { return login_(data); },
    requestPasswordReset: function () { return requestPasswordReset_(data); },
    completePasswordReset: function () { return completePasswordReset_(data); },
    logout: function () { return logout_(request.token || ''); }
  };
  if (Object.prototype.hasOwnProperty.call(anonymous, action)) {
    return anonymous[action]();
  }
  const roles = {
    createOrder: ['Konsumen'],
    myOrders: ['Konsumen'],
    myOrderStatus: ['Konsumen'],
    myOrderUpload: ['Konsumen'],
    myInvoice: ['Konsumen'],
    adminData: ['Admin', 'Operator', 'Viewer'],
    changePassword: ['Admin', 'Operator', 'Viewer', 'Konsumen'],
    sendPasswordReset: ['Admin'],
    saveMaster: ['Admin', 'Operator'],
    deleteMaster: ['Admin', 'Operator'],
    saveSettings: ['Admin', 'Operator'],
    uploadStoreAsset: ['Admin', 'Operator'],
    verifyPayment: ['Admin', 'Operator'],
    fulfillment: ['Admin', 'Operator'],
    upload: ['Admin', 'Operator'],
    download: ['Admin', 'Operator'],
    shipping: ['Admin', 'Operator'],
    report: ['Admin', 'Operator', 'Viewer'],
    backup: ['Admin', 'Operator'],
    restoreStaging: ['Admin']
  };
  if (!roles[action]) {
    throw new Error('Operasi tidak dikenal.');
  }
  const user = authorize_(request.token, roles[action], action === 'changePassword');
  const pages = {
    saveMaster: data.table, deleteMaster: data.table, sendPasswordReset: 'Users',
    saveSettings: 'Pengaturan', uploadStoreAsset: 'Pengaturan',
    verifyPayment: 'Pesanan', fulfillment: 'Pesanan',
    upload: data.kind === 'PRODUK' ? 'Products' : 'Pesanan', download: 'Pesanan',
    shipping: 'Pesanan', report: 'Laporan', backup: 'Backup', restoreStaging: 'Backup'
  };
  if (pages[action]) { requireMenu_(user, pages[action], !['download', 'report'].includes(action)); }
  const operations = {
    createOrder: function () { return createOrder_(data, user); },
    myOrders: function () { return myOrders_(user, data); },
    myOrderStatus: function () { return customerOrder_(accountOrderAccess_(user, data)); },
    myOrderUpload: function () { return upload_(null, data, user); },
    myInvoice: function () {
      return download_(null, Object.assign({}, data, { kind: 'INVOICE' }), user);
    },
    adminData: function () { return adminData_(user, data); },
    changePassword: function () { return changePassword_(user, data); },
    sendPasswordReset: function () {
      const target = rows_('Users').find(function (row) { return row.id === data.userId; });
      if (!target) { throw new Error('Akun tidak ditemukan.'); }
      if (!['email', 'whatsapp'].includes(data.channel)) { throw new Error('Pilih Email atau WhatsApp.'); }
      return sendPasswordReset_(target, data.channel);
    },
    saveMaster: function () { return saveMaster_(user, data); },
    deleteMaster: function () { return deleteMaster_(user, data); },
    saveSettings: function () { return saveSettings_(user, data); },
    uploadStoreAsset: function () { return uploadStoreAsset_(user, data); },
    verifyPayment: function () { return verifyPayment_(user, data); },
    fulfillment: function () { return fulfillment_(user, data); },
    upload: function () { return upload_(user, data); },
    download: function () { return download_(user, data); },
    shipping: function () { return saveShipping_(user, data); },
    report: function () { return report_(user, data); },
    backup: function () { return backup_(user); },
    restoreStaging: function () { return restoreStaging_(user, data); }
  };
  return operations[action]();
}

// Katalog hanya melepas kolom publik; data pesanan/pelanggan tidak ikut dimuat.
function catalog_(data) {
  const config = settings_();
  const type = data.type || 'DIRECT';
  let schedule = { date: type === 'PREORDER' ? clock_().tomorrow : clock_().date, times: [] };
  try {
    schedule = slots_(type, config, rows_('ServiceHours'));
  } catch (error) {
    // Konfigurasi belum lengkap berarti tidak ada waktu tersedia.
  }
  const products = rows_('Products').filter(function (row) { return active_(row.active); });
  const discounts = rows_('Discounts');
  const orders = rows_('Orders');
  // Tabel stok dibaca satu kali untuk semua produk, bukan satu kali per produk.
  const pools = rows_(type === 'DIRECT' ? 'ReadyStock' : 'PreorderCapacity');
  let reserved = Object.create(null);
  try {
    // Setiap snapshot pesanan dibaca satu kali; aturan reservasi tetap sama.
    orders.forEach(function (order) {
      if (!['PREPARING', 'COMMITTED'].includes(order.transactionState) ||
        (order.fulfillment === 'CANCELLED' && !order.preparedAt)) {
        return;
      }
      JSON.parse(order.snapshotJson).items.forEach(function (item) {
        reserved[item.poolId] = (reserved[item.poolId] || 0) + item.quantity;
      });
    });
  } catch (error) {
    // Data reservasi rusak tidak boleh membuat stok terlihat tersedia.
    reserved = null;
  }
  const result = products.map(function (product) {
    const view = publicRecord_(product, [
      'id', 'categoryId', 'name', 'description', 'price', 'photoFileId'
    ]);
    const discount = discounts.find(function (row) {
      return row.productId === product.id && validPeriod_(row);
    });
    view.unitPrice = Number(product.price);
    if (discount && config.discountRounding) {
      const amount = discount.type === 'PERCENT'
        ? view.unitPrice * Number(discount.value) / 100
        : Number(discount.value);
      view.unitPrice -= Math.min(view.unitPrice, rounded_(amount, config.discountRounding));
      // Rincian publik hanya diberikan jika diskon benar-benar mengurangi harga.
      if (view.unitPrice < Number(product.price)) {
        view.discount = publicRecord_(discount, ['type', 'value', 'startsAt', 'endsAt']);
      }
    }
    const pool = pools.find(function (row) {
      return row.productId === product.id && (type === 'DIRECT' || row.date === schedule.date);
    });
    view.available = pool && reserved
      ? Math.max(0, Number(pool.capacity) - (reserved[pool.id] || 0)) : 0;
    return view;
  });
  return {
    products: result,
    shippingRates: rows_('ShippingRates').filter(function (row) { return active_(row.active); })
      .map(function (row) { return publicRecord_(row, ['id', 'name', 'price']); }),
    // Voucher harus aktif, masih dalam masa berlaku, dan cocok dengan jenis pesanan.
    vouchers: config.discountRounding ? rows_('Vouchers').filter(function (row) {
      return validPeriod_(row) && (row.orderType === 'ALL' || row.orderType === type);
    }).map(function (row) {
      return publicRecord_(row, ['code', 'type', 'value', 'minimum', 'maximum', 'orderType', 'startsAt', 'endsAt']);
    }) : [],
    categories: rows_('Categories').filter(function (row) { return active_(row.active); })
      .map(function (row) { return publicRecord_(row, ['id', 'name']); }),
    areas: rows_('ServiceAreas').filter(function (row) { return active_(row.active); })
      .map(function (row) { return publicRecord_(row, ['id', 'name']); }),
    schedule: schedule,
    settings: publicRecord_(config, [
      'storeName', 'address', 'contact', 'bankInstructions',
      'ordersEnabled', 'logoFileId', 'qrisFileId'
    ])
  };
}
