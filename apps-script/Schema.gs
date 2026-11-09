/**
 * Daftar kolom database. ID berkas menunjuk ke Drive, bukan gambar di sel.
 * Semua waktu transaksi disimpan sebagai ISO UTC, lalu ditampilkan dalam WITA.
 */
const HV_SCHEMA = {
  Settings: ['key', 'value'],
  Categories: ['id', 'name', 'active', 'updatedAt'],
  Products: [
    'id', 'categoryId', 'name', 'description', 'price',
    'photoFileId', 'active', 'updatedAt', 'unit', 'sizeUnit', 'sizeValue'
  ],
  Discounts: [
    'id', 'productId', 'type', 'value', 'startsAt', 'endsAt', 'active'
  ],
  Vouchers: [
    'id', 'code', 'type', 'value', 'minimum', 'maximum',
    'startsAt', 'endsAt', 'orderType', 'active'
  ],
  ReadyStock: ['id', 'productId', 'capacity', 'updatedAt'],
  PreorderCapacity: ['id', 'productId', 'date', 'capacity', 'updatedAt'],
  ServiceHours: ['id', 'weekday', 'opens', 'closes', 'active'],
  ServiceAreas: ['id', 'name', 'active', 'updatedAt'],
  ShippingRates: ['id', 'name', 'price', 'active', 'updatedAt'],
  Users: [
    'id', 'username', 'name', 'passwordHash', 'role', 'active',
    'mustChangePassword', 'version', 'updatedAt', 'email', 'phone',
    'permissionsJson', 'failedAttempts', 'blockedAt', 'lastLoginAt',
    'deliveryJson', 'registrationId'
  ],
  PasswordResets: ['id', 'userId', 'tokenHash', 'channel', 'createdAt', 'expiresAt', 'usedAt', 'version'],
  Sessions: [
    'id', 'tokenHash', 'userId', 'version', 'createdAt',
    'lastSeenAt', 'expiresAt', 'revoked'
  ],
  Orders: [
    'id', 'requestId', 'requestHash', 'createdAt',
    'type', 'receipt', 'date', 'time', 'name', 'phone',
    'areaId', 'address', 'paymentMethod', 'subtotal', 'voucherCode',
    'voucherDiscount', 'total', 'paymentDeadline', 'paymentStatus',
    'fulfillment', 'preparedAt', 'cancelRequestedAt', 'cancelReason',
    'cancelledAt', 'cancelledBy', 'refundAmount', 'refundDueAt',
    'refundStatus', 'invoiceFileId', 'transactionState', 'snapshotJson', 'customerId'
  ],
  OrderItems: [
    'id', 'orderId', 'productId', 'name', 'quantity', 'originalPrice',
    'unitPrice', 'discountAmount', 'subtotal'
  ],
  StockLedger: [
    'id', 'orderId', 'productId', 'poolId', 'quantity', 'state', 'createdAt'
  ],
  Payments: [
    'id', 'requestId', 'orderId', 'amount', 'reference',
    'verifiedAt', 'verifiedBy'
  ],
  Refunds: [
    'id', 'requestId', 'orderId', 'amount', 'reference',
    'completedAt', 'completedBy'
  ],
  Shipping: [
    'id', 'orderId', 'provider', 'fee', 'courier', 'tracking', 'updatedAt'
  ],
  Files: [
    'id', 'requestId', 'orderId', 'productId', 'kind',
    'driveFileId', 'mimeType', 'size', 'createdAt', 'uploadedBy'
  ],
  AuditLog: ['id', 'createdAt', 'actorId', 'action', 'entityId', 'detail'],
  BackupLog: ['id', 'createdAt', 'folderId', 'databaseFileId', 'status']
};

// Pengaturan belum lengkap: pesanan ditutup sampai Admin mengisinya.
const HV_DEFAULTS = {
  storeName: 'Healthy Vibes',
  logoFileId: '',
  address: '',
  contact: '',
  bankInstructions: '',
  qrisFileId: '',
  intervalMinutes: '',
  preparationMinutes: '',
  ordersEnabled: 'false',
  discountRounding: '',
  maxVouchersPerOrder: '1',
  sessionIdleMinutes: '30',
  sessionMaxHours: '8',
  uploadMaxBytes: '5242880',
  backupRetentionDays: '30'
};

// Pilih nama tanpa akhiran _ pada daftar fungsi editor Apps Script.
function installHealthyVibes() {
  requireSetupAccess_();
  const result = installHealthyVibes_();
  console.info('Database: ' + result.databaseUrl);
  console.info('Folder Drive: ' + result.driveUrl);
  return result;
}

// Jalankan dari editor untuk menghapus konfirmasi ongkir lama pada database yang sama.
function removeShippingConfirmation() {
  requireSetupAccess_();
  const result = withLock_(function () {
    const result = removeShippingConfirmation_(database_());
    SpreadsheetApp.flush();
    return result;
  });
  console.info('Dihapus: ' + result.columns + ' kolom konfirmasi ongkir dan ' +
    result.settings + ' pengaturan lama. Tarif, kurir, dan pesanan tetap disimpan.');
  return result;
}

// Nama kolom diperiksa agar tarif dan riwayat pengiriman tidak ikut terhapus.
function removeShippingConfirmation_(db) {
  const result = { columns: 0, settings: 0 };
  const shipping = db.getSheetByName('Shipping');
  if (shipping && shipping.getLastRow() > 0) {
    const headers = shipping.getRange(1, 1, 1, shipping.getLastColumn()).getValues()[0];
    for (let index = headers.length - 1; index >= 0; index -= 1) {
      if (['customerAgreedAt', 'feePaidToCourier'].includes(headers[index])) {
        shipping.deleteColumn(index + 1);
        result.columns += 1;
      }
    }
  }
  const settings = db.getSheetByName('Settings');
  if (settings && settings.getLastRow() > 1) {
    const rows = settings.getRange(2, 1, settings.getLastRow() - 1, 1).getValues();
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index][0] === 'deliveryVerified') {
        settings.deleteRow(index + 2);
        result.settings += 1;
      }
    }
  }
  return result;
}

/**
 * Implementasi internal installer; jalankan melalui installHealthyVibes.
 * Install ulang memakai ID tersimpan; hanya konfirmasi ongkir usang yang dibersihkan.
 */
function installHealthyVibes_() {
  return withLock_(function () {
    const props = PropertiesService.getScriptProperties();
    let rootId = props.getProperty('ROOT_FOLDER_ID');

    if (!rootId) {
      rootId = DriveApp.createFolder('HEALTHY VIBES').getId();
      props.setProperty('ROOT_FOLDER_ID', rootId);
    }

    const root = DriveApp.getFolderById(rootId);
    const names = ['PRODUK', 'INVOICE', 'STRUK', 'TANDATERIMA', 'BACKUP'];

    names.forEach(function (name) {
      const key = 'FOLDER_' + name;
      let id = props.getProperty(key);

      if (!id) {
        const matches = root.getFoldersByName(name);
        const folder = matches.hasNext() ? matches.next() : root.createFolder(name);
        id = folder.getId();
        props.setProperty(key, id);
      }

      // Memastikan folder tersimpan masih dapat diakses, tanpa mengubah izin.
      DriveApp.getFolderById(id).getName();
    });

    let dbId = props.getProperty('DATABASE_ID');

    if (!dbId) {
      const created = SpreadsheetApp.create('Healthy Vibes - Database');
      dbId = created.getId();
      props.setProperty('DATABASE_ID', dbId);
      DriveApp.getFileById(dbId).moveTo(root);
    }

    const db = SpreadsheetApp.openById(dbId);
    db.setSpreadsheetTimeZone('Asia/Makassar');
    db.setSpreadsheetLocale('id_ID');
    removeShippingConfirmation_(db);
    removeLegacyOrderAccessColumn_(db);
    extendAccountSchema_(db);
    extendOrderAccountSchema_(db);
    extendSchemaColumns_(db, 'Products');

    Object.keys(HV_SCHEMA).forEach(function (name) {
      const headers = HV_SCHEMA[name];
      let sheet = db.getSheetByName(name);

      if (!sheet) {
        sheet = db.insertSheet(name);
      }

      if (sheet.getMaxColumns() < headers.length) {
        sheet.insertColumnsAfter(
          sheet.getMaxColumns(),
          headers.length - sheet.getMaxColumns()
        );
      }

      if (sheet.getLastRow() > 0) {
        const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
        if (JSON.stringify(actual) !== JSON.stringify(headers)) {
          throw new Error('Kolom ' + name + ' berbeda. Instalasi dihentikan tanpa menimpa data.');
        }
      } else {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }

      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#065b55')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      sheet.autoResizeColumns(1, headers.length);
    });

    const existing = rows_('Settings');
    Object.keys(HV_DEFAULTS).forEach(function (key) {
      if (!existing.some(function (row) { return row.key === key; })) {
        append_('Settings', { key: key, value: HV_DEFAULTS[key] });
      }
    });

    SpreadsheetApp.flush();
    return {
      databaseUrl: db.getUrl(),
      driveUrl: 'https://drive.google.com/drive/folders/' + rootId,
      message: 'Database dan folder siap. Isi konfigurasi serta buat Admin pertama.'
    };
  });
}

// Installer hanya menghapus kolom usang, bukan baris transaksi.
function removeLegacyOrderAccessColumn_(db) {
  const sheet = db.getSheetByName('Orders');
  if (!sheet || !sheet.getLastRow()) { return 0; }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const remaining = headers.filter(function (key) { return key !== 'accessHash'; });
  if (remaining.length > HV_SCHEMA.Orders.length ||
    remaining.some(function (key, index) { return key !== HV_SCHEMA.Orders[index]; }) ||
    headers.filter(function (key) { return key === 'accessHash'; }).length > 1) {
    throw new Error('Kolom Orders berbeda. Pembersihan dihentikan tanpa menimpa data.');
  }
  const index = headers.indexOf('accessHash');
  if (index < 0) { return 0; }
  sheet.deleteColumn(index + 1);
  return 1;
}

// Hanya dapat dijalankan pemilik dari editor, tidak tersedia melalui API.
function removeLegacyOrders() {
  requireSetupAccess_();
  const result = withLock_(function () {
    const result = removeLegacyOrders_(database_());
    SpreadsheetApp.flush();
    return result;
  });
  console.info('Pesanan tanpa akun dihapus: ' + result.orders +
    '; baris terkait: ' + result.relatedRows + '; berkas ke sampah: ' + result.files +
    '; kolom kunci dihapus: ' + result.columns + '. Pesanan akun tetap disimpan.');
  return result;
}

function removeLegacyOrders_(db) {
  // Baca nama kolom asli agar aman sebelum/sesudah migrasi akun dan kunci.
  const tables = {};
  Object.keys(HV_SCHEMA).forEach(function (name) {
    const sheet = db.getSheetByName(name);
    if (!sheet || !sheet.getLastRow()) { tables[name] = []; return; }
    const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    const headers = values[0];
    const expected = HV_SCHEMA[name];
    const known = name === 'Orders' ? headers.filter(function (key) { return key !== 'accessHash'; }) : headers;
    if (known.length > expected.length ||
      known.some(function (key, index) { return key !== expected[index]; }) ||
      new Set(headers).size !== headers.length) {
      throw new Error('Kolom ' + name + ' berbeda. Pembersihan dihentikan.');
    }
    tables[name] = values.slice(1).map(function (row, index) {
      const record = { _row: index + 2 };
      headers.forEach(function (key, position) { record[key] = row[position]; });
      return record;
    });
  });
  const legacy = tables.Orders.filter(function (order) {
    return order.id && !String(order.customerId || '').trim();
  });
  const ids = new Set(legacy.map(function (order) { return order.id; }));
  const related = ['OrderItems', 'StockLedger', 'Payments', 'Refunds', 'Shipping', 'Files', 'AuditLog'];
  const selected = {};
  related.forEach(function (name) {
    selected[name] = tables[name].filter(function (row) {
      return ids.has(name === 'AuditLog' ? row.entityId : row.orderId);
    });
  });
  const files = new Set(legacy.map(function (row) { return row.invoiceFileId; }).filter(Boolean));
  selected.Files.forEach(function (row) { if (row.driveFileId) { files.add(row.driveFileId); } });
  // Jangan buang berkas yang juga dirujuk pesanan akun, produk, atau aset toko.
  const retained = new Set();
  tables.Files.filter(function (row) { return !ids.has(row.orderId); })
    .forEach(function (row) { retained.add(row.driveFileId); });
  tables.Orders.filter(function (row) { return !ids.has(row.id); })
    .forEach(function (row) { retained.add(row.invoiceFileId); });
  tables.Products.forEach(function (row) { retained.add(row.photoFileId); });
  tables.Settings.filter(function (row) { return ['logoFileId', 'qrisFileId'].includes(row.key); })
    .forEach(function (row) { retained.add(row.value); });
  const result = { orders: legacy.length, relatedRows: 0, files: 0, columns: 0 };
  files.forEach(function (id) {
    if (!retained.has(id)) {
      DriveApp.getFileById(id).setTrashed(true);
      result.files += 1;
    }
  });
  related.forEach(function (name) {
    selected[name].sort(function (a, b) { return b._row - a._row; }).forEach(function (row) {
      db.getSheetByName(name).deleteRow(row._row);
      result.relatedRows += 1;
    });
  });
  // Induk dihapus terakhir agar pengulangan dapat melanjutkan pembersihan terputus.
  legacy.sort(function (a, b) { return b._row - a._row; }).forEach(function (row) {
    db.getSheetByName('Orders').deleteRow(row._row);
  });
  result.columns = removeLegacyOrderAccessColumn_(db);
  return result;
}
