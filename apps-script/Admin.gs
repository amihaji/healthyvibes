// Hanya tabel master berikut yang dapat diedit lewat menu pengelola.
const HV_MASTER_ROLES = {
  Categories: ['Admin', 'Operator'],
  Products: ['Admin', 'Operator'],
  ReadyStock: ['Admin', 'Operator'],
  PreorderCapacity: ['Admin', 'Operator'],
  Discounts: ['Admin'],
  Vouchers: ['Admin'],
  ServiceHours: ['Admin'],
  ServiceAreas: ['Admin'],
  Users: ['Admin']
};

function saveMaster_(user, data) {
  const table = data.table;
  if (!HV_MASTER_ROLES[table] || !HV_MASTER_ROLES[table].includes(user.role)) {
    throw new Error('Anda tidak berwenang mengubah tabel ini.');
  }
  const input = data.record || {};
  const old = rows_(table).find(function (row) { return row.id === input.id; });
  const record = Object.assign({}, old || {}, { id: old ? old.id : id_() });
  const active = input.active !== false;
  record.active = active;
  record.updatedAt = now_();

  if (['Categories', 'ServiceAreas'].includes(table)) {
    record.name = text_(input.name, 'Nama', 100);
    if (rows_(table).some(function (row) {
      return row.id !== record.id && row.name.toLowerCase() === record.name.toLowerCase();
    })) {
      throw new Error('Nama sudah digunakan.');
    }
  }
  if (table === 'Products') {
    record.name = text_(input.name, 'Nama produk', 100);
    record.description = text_(input.description || '', 'Deskripsi', 500, true);
    record.price = integer_(input.price, 'Harga', 1, 1000000000);
    record.categoryId = text_(input.categoryId, 'Kategori', 100);
    if (!rows_('Categories').some(function (row) {
      return row.id === record.categoryId && active_(row.active);
    })) {
      throw new Error('Kategori tidak aktif.');
    }
    // Photo ID hanya boleh berasal dari unggahan aplikasi untuk produk ini.
    if (input.photoFileId) {
      const file = rows_('Files').find(function (row) {
        return row.driveFileId === input.photoFileId &&
          row.productId === record.id && row.kind === 'PRODUK';
      });
      if (!file) {
        throw new Error('Foto tidak berasal dari unggahan produk ini.');
      }
      record.photoFileId = input.photoFileId;
    }
  }
  if (['ReadyStock', 'PreorderCapacity', 'Discounts'].includes(table)) {
    record.productId = text_(input.productId, 'Produk', 100);
    if (!rows_('Products').some(function (row) { return row.id === record.productId; })) {
      throw new Error('Produk tidak ditemukan.');
    }
  }
  if (['ReadyStock', 'PreorderCapacity'].includes(table)) {
    record.capacity = integer_(input.capacity, 'Kapasitas', 0, 1000000);
    if (table === 'PreorderCapacity') {
      record.date = text_(input.date, 'Tanggal', 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
        throw new Error('Tanggal harus YYYY-MM-DD.');
      }
    }
    const duplicate = rows_(table).find(function (row) {
      return row.id !== record.id && row.productId === record.productId &&
        (table === 'ReadyStock' || row.date === record.date);
    });
    if (duplicate) {
      throw new Error('Gunakan edit pada stok/kuota yang sudah ada.');
    }
    if (record.capacity < usedCapacity_(record.id, rows_('Orders'))) {
      throw new Error('Kapasitas tidak boleh di bawah jumlah yang telah ditahan/terpakai.');
    }
  }
  if (['Discounts', 'Vouchers'].includes(table)) {
    if (!['PERCENT', 'AMOUNT'].includes(input.type)) {
      throw new Error('Jenis promo tidak valid.');
    }
    record.type = input.type;
    record.value = integer_(
      input.value, 'Nilai promo', 1, input.type === 'PERCENT' ? 100 : 1000000000
    );
    record.startsAt = new Date(text_(input.startsAt, 'Mulai', 40)).toISOString();
    record.endsAt = new Date(text_(input.endsAt, 'Akhir', 40)).toISOString();
    if (record.endsAt <= record.startsAt) {
      throw new Error('Akhir promo harus setelah mulai.');
    }
    if (table === 'Discounts' && active && rows_('Discounts').some(function (row) {
      return row.id !== record.id && row.productId === record.productId &&
        active_(row.active) && row.startsAt <= record.endsAt && row.endsAt >= record.startsAt;
    })) {
      throw new Error('Periode diskon produk bertumpuk.');
    }
    if (table === 'Vouchers') {
      record.code = text_(input.code, 'Kode', 40).toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(record.code)) {
        throw new Error('Kode hanya huruf, angka, tanda - dan _.');
      }
      if (rows_('Vouchers').some(function (row) {
        return row.id !== record.id && row.code === record.code;
      })) {
        throw new Error('Kode voucher sudah digunakan.');
      }
      record.minimum = integer_(input.minimum || 0, 'Minimum', 0, 1000000000);
      record.maximum = integer_(input.maximum || 0, 'Maksimum', 0, 1000000000);
      record.orderType = input.orderType;
      if (!['ALL', 'DIRECT', 'PREORDER'].includes(record.orderType)) {
        throw new Error('Jenis pesanan voucher tidak valid.');
      }
    }
  }
  if (table === 'ServiceHours') {
    record.weekday = integer_(input.weekday, 'Hari', 0, 6);
    record.opens = text_(input.opens, 'Jam buka', 5);
    record.closes = text_(input.closes, 'Jam tutup', 5);
    if (minutes_(record.closes) <= minutes_(record.opens)) {
      throw new Error('Jam tutup harus setelah jam buka pada hari yang sama.');
    }
    if (rows_('ServiceHours').some(function (row) {
      return row.id !== record.id && Number(row.weekday) === record.weekday;
    })) {
      throw new Error('Edit jadwal yang sudah ada untuk hari ini.');
    }
  }
  if (table === 'Users') {
    record.username = username_(input.username);
    record.name = text_(input.name, 'Nama', 100);
    record.role = input.role;
    if (!['Admin', 'Operator', 'Viewer'].includes(record.role)) {
      throw new Error('Level akun tidak valid.');
    }
    if (rows_('Users').some(function (row) {
      return row.id !== record.id && row.username === record.username;
    })) {
      throw new Error('Username sudah digunakan.');
    }
    if (old && old.role === 'Admin' && active_(old.active) &&
      (!active || record.role !== 'Admin') && !rows_('Users').some(function (row) {
        return row.id !== record.id && row.role === 'Admin' && active_(row.active);
      })) {
      throw new Error('Admin aktif terakhir tidak boleh dihapus atau diturunkan.');
    }
    if (!old || input.password) {
      record.passwordHash = bcrypt_().hashSync(password_(input.password), 12);
      record.mustChangePassword = true;
    }
    record.version = Number(old ? old.version : 0) + 1;
  }

  if (old) {
    patch_(table, old, record);
  } else {
    append_(table, record);
  }
  audit_(user, 'SAVE_' + table, record.id, old ? 'Edit' : 'Tambah');
  return table === 'Users' ? userView_(record) : publicRecord_(record, HV_SCHEMA[table]);
}

// Pengaturan operasional dapat disimpan belum lengkap, tetapi toko tidak dibuka.
function saveSettings_(user, data) {
  const values = data.values || {};
  Object.keys(values).forEach(function (key) {
    if (!(key in HV_DEFAULTS)) {
      throw new Error('Pengaturan tidak dikenal: ' + key);
    }
    if (['logoFileId', 'qrisFileId'].includes(key)) {
      throw new Error('Aset toko harus diunggah melalui menu upload.');
    }
    const value = text_(values[key], key, 2000, true);
    if (['intervalMinutes', 'preparationMinutes'].includes(key) && value) {
      integer_(value, key, key === 'intervalMinutes' ? 5 : 0, 1440);
    }
    if (['refundRounding', 'discountRounding'].includes(key) && value &&
      !['UP', 'DOWN', 'NEAREST'].includes(value)) {
      throw new Error('Pembulatan tidak valid.');
    }
    if (['sessionIdleMinutes', 'sessionMaxHours', 'uploadMaxBytes', 'backupRetentionDays'].includes(key)) {
      integer_(value, key, 1, key === 'uploadMaxBytes' ? 5242880 : 1440);
    }
    if (['ordersEnabled', 'deliveryVerified'].includes(key) &&
      !['true', 'false'].includes(value)) {
      throw new Error('Nilai aktif harus true atau false.');
    }
    if (key === 'maxVouchersPerOrder' && value !== '1') {
      throw new Error('Build ini mendukung satu voucher per pesanan.');
    }
    setSetting_(key, value);
  });
  const config = settings_();
  if (config.ordersEnabled === 'true') {
    try {
      requireAuthRuntime_();
      integer_(config.intervalMinutes, 'Interval', 5, 240);
      integer_(config.preparationMinutes, 'Persiapan', 0, 1440);
      rounded_(1, config.refundRounding);
      rounded_(1, config.discountRounding);
      if (!config.address || !config.contact || !config.bankInstructions ||
        !rows_('ServiceHours').some(function (row) { return active_(row.active); })) {
        throw new Error('Alamat, kontak, pembayaran dan jadwal aktif wajib dilengkapi.');
      }
    } catch (error) {
      setSetting_('ordersEnabled', 'false');
      throw error;
    }
  }
  audit_(user, 'SAVE_SETTINGS', 'STORE', 'Pengaturan operasional diperbarui.');
  return config;
}

// Ambil hanya data menu aktif; hak akses dan kolom rahasia tetap dibatasi di server.
function adminData_(user, data) {
  const page = (data || {}).page || 'Dashboard';
  const common = ['Dashboard', 'Laporan'];
  const allowed = user.role === 'Admin'
    ? common.concat(['Pesanan', 'Pengaturan', 'Backup'], Object.keys(HV_MASTER_ROLES))
    : user.role === 'Operator'
      ? common.concat(['Pesanan', 'Categories', 'Products', 'ReadyStock', 'PreorderCapacity'])
      : user.role === 'Viewer' ? common : [];
  if (!allowed.includes(page)) {
    throw new Error('Menu pengelola tidak diizinkan.');
  }
  const result = { user: userView_(user), tables: {}, settings: {} };
  const dependencies = {
    Dashboard: [], Pesanan: ['Orders', 'Files', 'Shipping'], Pengaturan: [], Backup: [],
    Laporan: ['Categories'], Products: ['Products', 'Categories'],
    ReadyStock: ['ReadyStock', 'Products'], PreorderCapacity: ['PreorderCapacity', 'Products'],
    Discounts: ['Discounts', 'Products']
  };
  const tables = dependencies[page] || [page];
  tables.forEach(function (name) {
    result.tables[name] = rows_(name).map(function (row) {
      if (name === 'Users') {
        return Object.assign(userView_(row), { active: active_(row.active) });
      }
      const fields = HV_SCHEMA[name].filter(function (key) {
        const sensitive = ['accessHash', 'requestHash', 'snapshotJson'];
        if (user.role === 'Viewer') {
          sensitive.push('name', 'phone', 'address', 'areaId', 'cancelReason');
        }
        return !sensitive.includes(key);
      });
      return publicRecord_(row, fields);
    });
  });
  if (page === 'Pengaturan') {
    result.settings = settings_();
  }
  if (page === 'Dashboard') {
    result.kpi = adminSummary_();
  }
  return result;
}

// Ringkasan dihitung sekali tanpa menyusun detail laporan atau membaca ulang pesanan.
function adminSummary_() {
  const orders = rows_('Orders').filter(function (order) {
    return order.transactionState === 'COMMITTED';
  });
  const ids = new Set(orders.map(function (order) { return order.id; }));
  function total(table) {
    return rows_(table).reduce(function (sum, row) {
      return sum + (ids.has(row.orderId) ? Number(row.amount) : 0);
    }, 0);
  }
  return {
    orders: orders.length, payments: total('Payments'), refunds: total('Refunds'),
    pending: orders.filter(function (order) { return order.paymentStatus !== 'PAID'; }).length,
    refundPending: orders.filter(function (order) { return order.refundStatus === 'PENDING'; }).length
  };
}

// Laporan memakai pembayaran/refund aktual, bukan jumlah invoice atau ongkir.
function report_(user, data) {
  const orders = rows_('Orders').filter(function (row) {
    const date = clock_(new Date(row.createdAt)).date;
    return row.transactionState === 'COMMITTED' &&
      (!data.from || date >= data.from) && (!data.to || date <= data.to) &&
      (!data.type || row.type === data.type) &&
      (!data.status || row.fulfillment === data.status) &&
      (!data.categoryId || JSON.parse(row.snapshotJson).items.some(function (item) {
        return item.categoryId === data.categoryId;
      }));
  });
  const payments = rows_('Payments');
  const refunds = rows_('Refunds');
  const rows = orders.map(function (order) {
    const paid = payments.filter(function (row) { return row.orderId === order.id; })
      .reduce(function (sum, row) { return sum + Number(row.amount); }, 0);
    const returned = refunds.filter(function (row) { return row.orderId === order.id; })
      .reduce(function (sum, row) { return sum + Number(row.amount); }, 0);
    return {
      nomor: order.id,
      waktuWita: Utilities.formatDate(new Date(order.createdAt), 'Asia/Makassar', 'yyyy-MM-dd HH:mm'),
      jenis: order.type,
      penerimaan: order.receipt,
      produk: JSON.parse(order.snapshotJson).items.map(function (item) {
        return item.name + ' x ' + item.quantity;
      }).join('; '),
      subtotal: Number(order.subtotal),
      voucher: Number(order.voucherDiscount),
      tagihan: Number(order.total),
      pembayaran: paid,
      refund: returned,
      sisaKas: paid - returned,
      status: order.fulfillment,
      statusRefund: order.refundStatus
    };
  });
  return {
    rows: rows,
    summary: {
      orders: rows.length,
      payments: rows.reduce(function (sum, row) { return sum + row.pembayaran; }, 0),
      refunds: rows.reduce(function (sum, row) { return sum + row.refund; }, 0),
      pending: orders.filter(function (order) { return order.paymentStatus !== 'PAID'; }).length,
      refundPending: orders.filter(function (order) { return order.refundStatus === 'PENDING'; }).length
    }
  };
}

function saveShipping_(user, data) {
  const order = rows_('Orders').find(function (row) { return row.id === data.orderId; });
  if (!order || order.receipt !== 'DELIVERY') {
    throw new Error('Bukan pesanan antar.');
  }
  const old = rows_('Shipping').find(function (row) { return row.orderId === order.id; });
  const record = {
    id: old ? old.id : id_(),
    orderId: order.id,
    provider: 'GoSend',
    fee: integer_(data.fee, 'Ongkir', 0, 1000000),
    customerAgreedAt: data.customerAgreed === true ? now_() : '',
    courier: text_(data.courier || '', 'Kurir', 100, true),
    tracking: text_(data.tracking || '', 'Pelacakan', 200, true),
    feePaidToCourier: data.feePaidToCourier === true,
    updatedAt: now_()
  };
  if (old) {
    patch_('Shipping', old, record);
  } else {
    append_('Shipping', record);
  }
  audit_(user, 'SHIPPING', order.id, 'Ongkir terpisah, bukan kas toko.');
  return true;
}
