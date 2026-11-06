// Setup editor tidak boleh dipicu pelanggan anonim lewat RPC HTML Service.
function requireSetupAccess_() {
  const active = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  if (!active || !effective || active !== effective) {
    throw new Error('Jalankan setup dari editor dengan akun pemilik project.');
  }
}

// Membuka database privat memakai ID dari Script Properties.
function database_() {
  const id = PropertiesService.getScriptProperties().getProperty('DATABASE_ID');
  if (!id) {
    throw new Error('Database belum dipasang. Jalankan installHealthyVibes dari editor.');
  }
  return SpreadsheetApp.openById(id);
}

// Jenis kolom tanggal mengikuti skema; kolom lain tidak diubah formatnya.
function temporalKind_(key) {
  if (['opens', 'closes', 'time'].includes(key)) { return 'time'; }
  if (key === 'date') { return 'date'; }
  return /(?:At|Deadline)$/.test(key) ? 'timestamp' : '';
}

function temporalFormat_(kind) {
  return { time: '@', date: 'dd/MM/yyyy', timestamp: 'dd/MM/yyyy HH:mm' }[kind];
}

// Jam Sheets memakai tanggal dasar 1899 dan offset historis, bukan tanggal transaksi.
function sheetTime_(value, display, timezone) {
  const match = String(display || value).trim()
    .match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(AM|PM)?$/i);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (match[3]) {
      if (hour < 1 || hour > 12) { return value; }
      hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    }
    if (hour < 24 && minute < 60) {
      return String(hour).padStart(2, '0') + ':' + match[2];
    }
  }
  const date = value instanceof Date ? value :
    /^\d{4}-\d{2}-\d{2}T/.test(String(value)) ? new Date(value) : null;
  if (date && !isNaN(date.getTime())) {
    return Utilities.formatDate(date, timezone, 'HH:mm');
  }
  return value;
}

function sheetReadValue_(key, value, display, timezone) {
  const kind = temporalKind_(key);
  if (kind === 'time') { return sheetTime_(value, display, timezone); }
  if (value instanceof Date) {
    return kind === 'date'
      ? Utilities.formatDate(value, timezone, 'yyyy-MM-dd') : value.toISOString();
  }
  return value;
}

// API tetap memakai ISO UTC; Sheet memakai tanggal asli dengan tampilan 24 jam.
function sheetWriteValue_(key, value) {
  const kind = temporalKind_(key);
  if (typeof value === 'string' && value) {
    const date = kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(value + 'T00:00:00+08:00')
      : kind === 'timestamp' && /^\d{4}-\d{2}-\d{2}T/.test(value)
        ? new Date(value) : null;
    if (date && !isNaN(date.getTime())) { return date; }
  }
  return cell_(value);
}

function writeSheetRow_(sheet, row, headers, record) {
  const range = sheet.getRange(row, 1, 1, headers.length);
  if (headers.some(function (key) { return temporalKind_(key); })) {
    const formats = range.getNumberFormats()[0];
    range.setNumberFormats([headers.map(function (key, index) {
      return temporalFormat_(temporalKind_(key)) || formats[index];
    })]);
  }
  range.setValues([headers.map(function (key) {
    return sheetWriteValue_(key, record[key]);
  })]);
}

// Memperbaiki tampilan database yang sudah terpasang, tanpa membuat ulang data.
function formatHealthyVibesDates() {
  requireSetupAccess_();
  return withLock_(function () {
    const db = database_();
    const timezone = 'Asia/Makassar';
    db.setSpreadsheetTimeZone(timezone);
    db.setSpreadsheetLocale('id_ID');
    Object.keys(HV_SCHEMA).forEach(function (name) {
      const sheet = db.getSheetByName(name);
      if (!sheet) { return; }
      const headers = HV_SCHEMA[name];
      const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (JSON.stringify(actual) !== JSON.stringify(headers)) {
        throw new Error('Kolom ' + name + ' berbeda; format dihentikan.');
      }
      headers.forEach(function (key, index) {
        const kind = temporalKind_(key);
        if (!kind) { return; }
        const count = sheet.getLastRow() - 1;
        if (count > 0) {
          const range = sheet.getRange(2, index + 1, count, 1);
          const values = range.getValues();
          const display = range.getDisplayValues();
          const formulas = range.getFormulas();
          const converted = values.map(function (row, position) {
            if (formulas[position][0]) { return [formulas[position][0]]; }
            const value = sheetReadValue_(key, row[0], display[position][0], timezone);
            return [sheetWriteValue_(key, value)];
          });
          range.setNumberFormat(temporalFormat_(kind));
          range.setValues(converted);
        }
      });
    });
    SpreadsheetApp.flush();
    console.info('Format tanggal dan jam selesai: DD/MM/YYYY dan HH:mm WITA.');
    return true;
  });
}

// Membaca baris sebagai objek; nomor baris hanya dipakai di backend.
function rows_(name) {
  const db = database_();
  const sheet = db.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  const headers = HV_SCHEMA[name];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length);
  const display = headers.some(function (key) { return temporalKind_(key) === 'time'; })
    ? range.getDisplayValues() : null;
  const timezone = db.getSpreadsheetTimeZone();
  return range.getValues()
    .map(function (values, index) {
      const result = { _row: index + 2 };
      headers.forEach(function (key, position) {
        const value = values[position];
        result[key] = sheetReadValue_(key, value, display && display[index][position], timezone);
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
  if (!sheet) {
    throw new Error('Tab ' + name + ' belum ada. Jalankan installHealthyVibes dari editor Google Apps Script untuk melengkapi database.');
  }
  const row = sheet.getLastRow() + 1;
  writeSheetRow_(sheet, row, HV_SCHEMA[name], record);
  return Object.assign({}, record, { _row: row });
}

// Mengubah kolom yang dikenal saja, tanpa menulis objek tak dikenal ke database.
function patch_(name, record, changes) {
  const merged = Object.assign({}, record, changes);
  const sheet = database_().getSheetByName(name);
  if (!sheet) {
    throw new Error('Tab ' + name + ' belum ada. Jalankan installHealthyVibes dari editor Google Apps Script untuk melengkapi database.');
  }
  writeSheetRow_(sheet, record._row, HV_SCHEMA[name], merged);
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
