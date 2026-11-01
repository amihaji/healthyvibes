// Membuka database privat memakai ID dari Script Properties.
function database_() {
  const id = PropertiesService.getScriptProperties().getProperty('DATABASE_ID');
  if (!id) {
    throw new Error('Database belum dipasang. Jalankan installHealthyVibes_ dari editor.');
  }
  return SpreadsheetApp.openById(id);
}

// Membaca baris sebagai objek; nomor baris hanya dipakai di backend.
function rows_(name) {
  const sheet = database_().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  const headers = HV_SCHEMA[name];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
    .getValues()
    .map(function (values, index) {
      const result = { _row: index + 2 };
      headers.forEach(function (key, position) {
        const value = values[position];
        result[key] = value instanceof Date ? value.toISOString() : value;
      });
      return result;
    });
}

// Menghindari input pelanggan dibaca sebagai formula Google Sheets.
function cell_(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
    return "'" + value;
  }
  return value;
}

// Menambah satu baris mengikuti urutan kolom skema.
function append_(name, record) {
  const sheet = database_().getSheetByName(name);
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, HV_SCHEMA[name].length).setValues([
    HV_SCHEMA[name].map(function (key) { return cell_(record[key]); })
  ]);
  return Object.assign({}, record, { _row: row });
}

// Mengubah kolom yang dikenal saja, tanpa menulis objek tak dikenal ke database.
function patch_(name, record, changes) {
  const merged = Object.assign({}, record, changes);
  database_().getSheetByName(name)
    .getRange(record._row, 1, 1, HV_SCHEMA[name].length)
    .setValues([
      HV_SCHEMA[name].map(function (key) { return cell_(merged[key]); })
    ]);
  return merged;
}

// Serialisasi operasi stok, pembayaran dan akun untuk mencegah perubahan bersamaan.
function withLock_(operation) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('Sistem sedang memproses pesanan lain. Silakan coba kembali.');
  }
  try {
    return operation();
  } finally {
    lock.releaseLock();
  }
}

// Membaca konfigurasi toko tanpa membagikan Script Properties atau rahasia.
function settings_() {
  const result = {};
  rows_('Settings').forEach(function (row) {
    result[row.key] = String(row.value);
  });
  return result;
}

// Menulis pengaturan satu per satu; tidak dipakai untuk rahasia keamanan.
function setSetting_(key, value) {
  const record = rows_('Settings').find(function (row) { return row.key === key; });
  if (record) {
    patch_('Settings', record, { value: String(value) });
  } else {
    append_('Settings', { key: key, value: String(value) });
  }
}

// ID untuk relasi data saja; ID ini bukan bukti hak akses.
function id_() {
  return Utilities.getUuid();
}

function now_() {
  return new Date().toISOString();
}

// Menolak teks kosong dan input yang terlalu panjang.
function text_(value, label, maximum, optional) {
  const result = String(value === undefined ? '' : value).trim();
  if ((!result && !optional) || result.length > maximum) {
    throw new Error(label + ' tidak valid.');
  }
  return result;
}

// Semua nominal uang dan jumlah produk berupa bilangan bulat aman.
function integer_(value, label, minimum, maximum) {
  if (value === '' || value === null || value === undefined) {
    throw new Error(label + ' wajib diisi.');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(label + ' tidak valid.');
  }
  return number;
}

function active_(value) {
  return value === true || String(value) === 'true';
}

// Menulis jejak tindakan tanpa password, token, atau seluruh data pelanggan.
function audit_(actor, action, entityId, detail) {
  append_('AuditLog', {
    id: id_(),
    createdAt: now_(),
    actorId: actor ? actor.id : 'CUSTOMER',
    action: action,
    entityId: entityId,
    detail: text_(detail || '', 'Catatan audit', 1000, true)
  });
}

// Hanya tabel yang membutuhkan tampilan umum boleh dilepas lewat fungsi ini.
function publicRecord_(record, fields) {
  const result = {};
  fields.forEach(function (key) { result[key] = record[key]; });
  return result;
}
