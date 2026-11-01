// Menyiapkan harga dan kuota dari server; harga dari browser selalu diabaikan.
function quote_(data) {
  const config = settings_();
  const available = slots_(data.type, config, rows_('ServiceHours'));
  if (data.date !== available.date || available.times.indexOf(data.time) < 0) {
    throw new Error('Waktu tidak tersedia lagi. Pilih ulang jadwal.');
  }
  if (['PICKUP', 'DELIVERY'].indexOf(data.receipt) < 0) {
    throw new Error('Cara penerimaan tidak valid.');
  }
  if (data.receipt === 'DELIVERY' && config.deliveryVerified !== 'true') {
    throw new Error('Pengantaran belum diaktifkan: dukungan ongkir GoSend belum diverifikasi.');
  }
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 50) {
    throw new Error('Keranjang tidak valid.');
  }
  const products = rows_('Products');
  const discounts = rows_('Discounts');
  const orders = rows_('Orders');
  const seen = {};
  const items = data.items.map(function (input) {
    const product = products.find(function (row) {
      return row.id === input.productId && active_(row.active);
    });
    if (!product || seen[product.id]) {
      throw new Error('Produk tidak tersedia atau terdapat item ganda.');
    }
    seen[product.id] = true;
    const quantity = integer_(input.quantity, 'Jumlah', 1, 100);
    const pool = pool_(product.id, data.type, data.date);
    if (Number(pool.capacity) - usedCapacity_(pool.id, orders) < quantity) {
      throw new Error('Ketersediaan ' + product.name + ' tidak mencukupi.');
    }
    const discount = discounts.find(function (row) {
      return row.productId === product.id && validPeriod_(row);
    });
    const original = Number(product.price);
    let cut = 0;
    if (discount) {
      cut = discount.type === 'PERCENT'
        ? original * Number(discount.value) / 100
        : Number(discount.value);
      cut = Math.min(original, rounded_(cut, config.discountRounding));
    }
    return {
      productId: product.id,
      categoryId: product.categoryId,
      name: product.name,
      quantity: quantity,
      originalPrice: original,
      unitPrice: original - cut,
      discountAmount: cut,
      hasDiscount: Boolean(discount),
      poolId: pool.id
    };
  });
  const code = text_(data.voucherCode || '', 'Voucher', 40, true).toUpperCase();
  let voucher = null;
  if (code) {
    voucher = rows_('Vouchers').find(function (row) {
      return row.code === code && validPeriod_(row) &&
        (row.orderType === 'ALL' || row.orderType === data.type);
    });
    if (!voucher) {
      throw new Error('Voucher tidak berlaku.');
    }
  }
  return Object.assign(
    { items: items, voucherCode: code },
    calculate_(items, voucher, config)
  );
}

// Menyelesaikan tulisan anak yang terputus tanpa membuat reservasi kedua.
function finishOrder_(order) {
  const snapshot = JSON.parse(order.snapshotJson);
  snapshot.items.forEach(function (item, index) {
    const key = order.id + ':' + index;
    if (!rows_('OrderItems').some(function (row) { return row.id === key; })) {
      append_('OrderItems', Object.assign({}, item, {
        id: key,
        orderId: order.id,
        subtotal: item.quantity * item.unitPrice
      }));
    }
    if (!rows_('StockLedger').some(function (row) { return row.id === key; })) {
      append_('StockLedger', {
        id: key,
        orderId: order.id,
        productId: item.productId,
        poolId: item.poolId,
        quantity: item.quantity,
        state: 'RESERVED',
        createdAt: order.createdAt
      });
    }
  });
  SpreadsheetApp.flush();
  return patch_('Orders', order, { transactionState: 'COMMITTED' });
}

function recoverOrders_() {
  rows_('Orders').filter(function (row) {
    return row.transactionState === 'PREPARING';
  }).forEach(finishOrder_);
}

// Request ID + token pelanggan + hash payload mencegah duplikasi retry.
function createOrder_(data) {
  recoverOrders_();
  const config = settings_();
  const requestId = text_(data.requestId, 'ID permintaan', 100);
  const accessToken = text_(data.accessToken, 'Kunci akses', 100);
  if (!/^[A-Za-z0-9_-]{43}$/.test(accessToken)) {
    throw new Error('Kunci akses pelanggan tidak valid.');
  }
  const payload = {
    type: data.type,
    receipt: data.receipt,
    date: data.date,
    time: data.time,
    name: text_(data.name, 'Nama', 100),
    phone: text_(data.phone, 'Nomor HP', 20),
    areaId: data.areaId || '',
    address: text_(data.address || '', 'Alamat', 1000, true),
    paymentMethod: data.paymentMethod,
    voucherCode: data.voucherCode || '',
    items: data.items
  };
  if (!/^0[0-9]{8,14}$/.test(payload.phone)) {
    throw new Error('Nomor HP diawali 0 dan terdiri dari 9-15 angka.');
  }
  if (data.acceptPolicy !== true) {
    throw new Error('Persetujuan kebijakan diperlukan.');
  }
  const requestHash = digest_(JSON.stringify(payload));
  const prior = rows_('Orders').find(function (row) {
    return row.requestId === requestId;
  });
  if (prior) {
    if (
      !equal_(prior.requestHash, requestHash) ||
      !equal_(prior.accessHash, digest_(accessToken))
    ) {
      throw new Error('ID permintaan sudah digunakan untuk data berbeda.');
    }
    return customerOrder_(prior);
  }
  if (config.ordersEnabled !== 'true') {
    throw new Error('Toko belum membuka pemesanan.');
  }
  if (payload.receipt === 'DELIVERY') {
    const area = rows_('ServiceAreas').find(function (row) {
      return row.id === payload.areaId && active_(row.active);
    });
    if (!area || !payload.address) {
      throw new Error('Pilih wilayah aktif dan isi alamat lengkap.');
    }
  }
  const pickupCash = payload.type === 'DIRECT' && payload.receipt === 'PICKUP';
  if (
    ['TRANSFER', 'QRIS', 'PICKUP_CASH'].indexOf(payload.paymentMethod) < 0 ||
    (payload.paymentMethod === 'PICKUP_CASH' && !pickupCash)
  ) {
    throw new Error('Bayar saat ambil hanya untuk pesanan langsung ambil sendiri.');
  }
  const priced = quote_(payload);
  const stamp = now_();
  const order = append_('Orders', Object.assign({}, payload, priced, {
    id: 'HV-' + id_(),
    requestId: requestId,
    requestHash: requestHash,
    accessHash: digest_(accessToken),
    createdAt: stamp,
    paymentDeadline: payload.type === 'PREORDER'
      ? new Date(clock_().date + 'T18:00:00+08:00').toISOString()
      : '',
    paymentStatus: 'UNPAID',
    fulfillment: 'NEW',
    refundStatus: 'NONE',
    transactionState: 'PREPARING',
    snapshotJson: JSON.stringify({
      items: priced.items,
      refundCustomerPercent: 90,
      refundStorePercent: 100,
      refundWithinHours: 24,
      refundRounding: config.refundRounding
    })
  }));
  SpreadsheetApp.flush();
  const complete = finishOrder_(order);
  audit_(null, 'CREATE_ORDER', complete.id, 'Pesanan dan reservasi tersimpan.');
  return customerOrder_(complete);
}

// Status hanya dapat dibuka memakai nomor pesanan dan kunci acak pelanggan.
function customerAccess_(data) {
  const order = rows_('Orders').find(function (row) { return row.id === data.orderId; });
  if (!order || !equal_(order.accessHash, digest_(data.accessToken || ''))) {
    throw new Error('Pesanan atau kunci akses tidak valid.');
  }
  if (order.transactionState !== 'COMMITTED') {
    throw new Error('Pesanan menunggu rekonsiliasi. Jangan membuat pesanan baru.');
  }
  return order;
}

function customerOrder_(order) {
  const result = publicRecord_(order, [
    'id', 'createdAt', 'type', 'receipt', 'date', 'time',
    'name', 'phone', 'address', 'paymentMethod', 'subtotal',
    'voucherDiscount', 'total', 'paymentDeadline', 'paymentStatus',
    'fulfillment', 'preparedAt', 'cancelRequestedAt', 'cancelledAt',
    'refundAmount', 'refundDueAt', 'refundStatus'
  ]);
  result.items = JSON.parse(order.snapshotJson).items.map(function (item) {
    return publicRecord_(item, ['name', 'quantity', 'unitPrice']);
  });
  return result;
}

function requestCancellation_(data) {
  const order = customerAccess_(data);
  if (order.preparedAt || ['CANCELLED', 'COMPLETED'].indexOf(order.fulfillment) >= 0) {
    throw new Error('Pembatalan tidak diperbolehkan pada tahap ini.');
  }
  patch_('Orders', order, {
    cancelRequestedAt: now_(),
    cancelReason: text_(data.reason, 'Alasan', 500)
  });
  return true;
}

// Pembayaran diverifikasi dari mutasi masuk dan referensi unik, bukan foto.
function verifyPayment_(user, data) {
  const order = rows_('Orders').find(function (row) { return row.id === data.orderId; });
  if (!order || order.fulfillment === 'CANCELLED' || order.transactionState !== 'COMMITTED') {
    throw new Error('Pesanan tidak dapat menerima pembayaran.');
  }
  const reference = text_(data.reference, 'Referensi transaksi', 150);
  const amount = integer_(data.amount, 'Pembayaran', 1, 1000000000);
  if (amount !== Number(order.total)) {
    throw new Error('Pembayaran produk harus sama dengan total tagihan.');
  }
  const existing = rows_('Payments').find(function (row) {
    return row.orderId === order.id;
  });
  if (existing) {
    if (existing.reference !== reference || Number(existing.amount) !== amount) {
      throw new Error('Pembayaran sudah tercatat dengan referensi lain.');
    }
  } else {
    if (rows_('Payments').some(function (row) { return row.reference === reference; })) {
      throw new Error('Referensi pembayaran sudah digunakan.');
    }
    append_('Payments', {
      id: id_(),
      requestId: reference,
      orderId: order.id,
      amount: amount,
      reference: reference,
      verifiedAt: now_(),
      verifiedBy: user.id
    });
    SpreadsheetApp.flush();
  }
  patch_('Orders', order, { paymentStatus: 'PAID' });
  audit_(user, 'VERIFY_PAYMENT', order.id, reference);
  return true;
}

function paidAmount_(orderId) {
  return rows_('Payments').filter(function (row) {
    return row.orderId === orderId;
  }).reduce(function (sum, row) { return sum + Number(row.amount); }, 0);
}

// Pembatalan dan pengembalian dipisahkan. Ledger pelepasan punya ID deterministik.
function cancelOrder_(user, data) {
  const order = rows_('Orders').find(function (row) { return row.id === data.orderId; });
  if (!order || order.transactionState !== 'COMMITTED') {
    throw new Error('Pesanan belum dapat dibatalkan.');
  }
  if (order.fulfillment === 'CANCELLED' && order.cancelledBy !== data.party) {
    throw new Error('Pesanan sudah dibatalkan oleh pihak yang berbeda.');
  }
  if (order.fulfillment === 'COMPLETED') {
    throw new Error('Pesanan selesai tidak dapat dibatalkan.');
  }
  const party = data.party;
  if (['CUSTOMER', 'STORE'].indexOf(party) < 0) {
    throw new Error('Pihak pembatal tidak valid.');
  }
  if (party === 'CUSTOMER' && (order.preparedAt || !order.cancelRequestedAt)) {
    throw new Error('Permintaan pelanggan tidak memenuhi ketentuan pembatalan.');
  }
  if (order.fulfillment !== 'CANCELLED') {
    const paid = paidAmount_(order.id);
    const snapshot = JSON.parse(order.snapshotJson);
    const refund = refundValue_(paid, party, snapshot.refundRounding);
    patch_('Orders', order, {
      fulfillment: 'CANCELLED',
      cancelledAt: now_(),
      cancelledBy: party,
      cancelReason: text_(data.reason, 'Alasan', 500),
      refundAmount: refund,
      refundDueAt: refund ? new Date(Date.now() + 86400000).toISOString() : '',
      refundStatus: refund ? 'PENDING' : 'NONE'
    });
    SpreadsheetApp.flush();
  }
  JSON.parse(order.snapshotJson).items.forEach(function (item, index) {
    const key = order.id + ':release:' + index;
    if (!rows_('StockLedger').some(function (row) { return row.id === key; })) {
      append_('StockLedger', {
        id: key,
        orderId: order.id,
        productId: item.productId,
        poolId: item.poolId,
        quantity: order.preparedAt ? 0 : -item.quantity,
        state: order.preparedAt ? 'CONSUMED_CANCELLED' : 'RELEASED',
        createdAt: now_()
      });
    }
  });
  audit_(user, 'CANCEL_ORDER', order.id, party);
  return true;
}

function completeRefund_(user, data) {
  const order = rows_('Orders').find(function (row) { return row.id === data.orderId; });
  if (!order || order.fulfillment !== 'CANCELLED' || !Number(order.refundAmount)) {
    throw new Error('Tidak ada refund yang perlu diselesaikan.');
  }
  const reference = text_(data.reference, 'Referensi refund', 150);
  const existing = rows_('Refunds').find(function (row) { return row.orderId === order.id; });
  if (existing && existing.reference !== reference) {
    throw new Error('Refund sudah tercatat.');
  }
  if (!existing) {
    append_('Refunds', {
      id: id_(),
      requestId: reference,
      orderId: order.id,
      amount: Number(order.refundAmount),
      reference: reference,
      completedAt: now_(),
      completedBy: user.id
    });
    SpreadsheetApp.flush();
  }
  patch_('Orders', order, { refundStatus: 'COMPLETED' });
  audit_(user, 'COMPLETE_REFUND', order.id, reference);
  return true;
}

function fulfillment_(user, data) {
  const order = rows_('Orders').find(function (row) { return row.id === data.orderId; });
  const transitions = {
    NEW: ['CONFIRMED'],
    CONFIRMED: ['PREPARING'],
    PREPARING: ['READY'],
    READY: ['DISPATCHED', 'COMPLETED'],
    DISPATCHED: ['COMPLETED']
  };
  if (!order || !(transitions[order.fulfillment] || []).includes(data.status)) {
    throw new Error('Perubahan tahap tidak valid.');
  }
  const paid = paidAmount_(order.id) === Number(order.total);
  const cashPickup = order.type === 'DIRECT' && order.receipt === 'PICKUP';
  if (data.status === 'PREPARING' && !paid && !cashPickup) {
    throw new Error('Pembayaran produk belum terverifikasi.');
  }
  if (
    (data.status === 'DISPATCHED' && (order.receipt !== 'DELIVERY' || !paid)) ||
    (data.status === 'COMPLETED' && !paid)
  ) {
    throw new Error('Produk harus lunas dan tahap penerimaan harus sesuai.');
  }
  if (data.status === 'COMPLETED' && !rows_('Files').some(function (row) {
    return row.orderId === order.id && row.kind === 'TANDATERIMA';
  })) {
    throw new Error('Unggah foto tanda terima sebelum menyelesaikan pesanan.');
  }
  if (data.status === 'DISPATCHED') {
    const shipping = rows_('Shipping').find(function (row) {
      return row.orderId === order.id;
    });
    if (!shipping || !shipping.customerAgreedAt ||
      settings_().deliveryVerified !== 'true') {
      throw new Error('Verifikasi layanan dan persetujuan ongkir diperlukan sebelum pengiriman.');
    }
  }
  if (data.status === 'COMPLETED' &&
    order.receipt === 'DELIVERY' && order.fulfillment !== 'DISPATCHED') {
    throw new Error('Pesanan antar harus dikirim sebelum diselesaikan.');
  }
  patch_('Orders', order, {
    fulfillment: data.status,
    preparedAt: data.status === 'PREPARING' ? now_() : order.preparedAt
  });
  audit_(user, 'FULFILLMENT', order.id, data.status);
  return true;
}
