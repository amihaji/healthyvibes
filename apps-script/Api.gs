// Halaman publik tidak menerima ID database, rahasia atau sesi dari template.
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Healthy Vibes')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Hanya berkas frontend tetap yang boleh disertakan; tidak dipanggil browser.
function include_(name) {
  if (!['Styles', 'Client'].includes(name)) {
    throw new Error('Berkas frontend tidak dikenal.');
  }
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// Satu-satunya pintu operasi browser. Fungsi internal berakhiran _ tidak RPC publik.
function api(request) {
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
