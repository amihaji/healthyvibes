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
    createOrder: function () { return createOrder_(data); },
    orderStatus: function () { return customerOrder_(customerAccess_(data)); },
    cancelRequest: function () { return requestCancellation_(data); },
    customerUpload: function () { return upload_(null, data); },
    customerInvoice: function () {
      return download_(null, Object.assign({}, data, { kind: 'INVOICE' }));
    },
    productPhoto: function () { return productPhoto_(data); },
    storeAsset: function () { return storeAsset_(data); },
    login: function () { return login_(data); },
    logout: function () { return logout_(request.token || ''); }
  };
  if (Object.prototype.hasOwnProperty.call(anonymous, action)) {
    return anonymous[action]();
  }
  const roles = {
    adminData: ['Admin', 'Operator', 'Viewer'],
    changePassword: ['Admin', 'Operator', 'Viewer'],
    saveMaster: ['Admin', 'Operator'],
    saveSettings: ['Admin'],
    uploadStoreAsset: ['Admin'],
    verifyPayment: ['Admin', 'Operator'],
    cancelOrder: ['Admin', 'Operator'],
    rejectCancellation: ['Admin', 'Operator'],
    refund: ['Admin', 'Operator'],
    fulfillment: ['Admin', 'Operator'],
    upload: ['Admin', 'Operator'],
    download: ['Admin', 'Operator'],
    shipping: ['Admin', 'Operator'],
    report: ['Admin', 'Operator', 'Viewer'],
    backup: ['Admin'],
    restoreStaging: ['Admin']
  };
  if (!roles[action]) {
    throw new Error('Operasi tidak dikenal.');
  }
  const user = authorize_(request.token, roles[action], action === 'changePassword');
  const operations = {
    adminData: function () { return adminData_(user); },
    changePassword: function () { return changePassword_(user, data); },
    saveMaster: function () { return saveMaster_(user, data); },
    saveSettings: function () { return saveSettings_(user, data); },
    uploadStoreAsset: function () { return uploadStoreAsset_(user, data); },
    verifyPayment: function () { return verifyPayment_(user, data); },
    cancelOrder: function () { return cancelOrder_(user, data); },
    rejectCancellation: function () {
      const order = rows_('Orders').find(function (row) { return row.id === data.orderId; });
      if (!order || !order.cancelRequestedAt || order.fulfillment === 'CANCELLED') {
        throw new Error('Tidak ada permintaan pembatalan aktif.');
      }
      patch_('Orders', order, { cancelRequestedAt: '', cancelReason: '' });
      audit_(user, 'REJECT_CANCELLATION', order.id, text_(data.reason, 'Alasan', 500));
      return true;
    },
    refund: function () { return completeRefund_(user, data); },
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
    }
    try {
      const pool = pool_(product.id, type, schedule.date);
      view.available = Math.max(0, Number(pool.capacity) - usedCapacity_(pool.id, orders));
    } catch (error) {
      view.available = 0;
    }
    return view;
  });
  return {
    products: result,
    categories: rows_('Categories').filter(function (row) { return active_(row.active); })
      .map(function (row) { return publicRecord_(row, ['id', 'name']); }),
    areas: rows_('ServiceAreas').filter(function (row) { return active_(row.active); })
      .map(function (row) { return publicRecord_(row, ['id', 'name']); }),
    schedule: schedule,
    settings: publicRecord_(config, [
      'storeName', 'address', 'contact', 'bankInstructions',
      'ordersEnabled', 'deliveryVerified', 'logoFileId', 'qrisFileId'
    ])
  };
}
