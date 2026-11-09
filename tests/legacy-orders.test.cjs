'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function fixture(options = {}) {
  const trashed = [];
  const context = vm.createContext({
    console: { info() {} },
    Session: { getActiveUser: () => ({ getEmail: () => options.anonymous ? '' : 'owner@test' }),
      getEffectiveUser: () => ({ getEmail: () => 'owner@test' }) },
    SpreadsheetApp: { flush() {} },
    DriveApp: { getFileById: id => ({ setTrashed: value => {
      assert.equal(value, true);
      if (options.driveFailure) { throw new Error('Drive tidak tersedia'); }
      trashed.push(id);
    } }) }
  });
  for (const file of ['Store.gs', 'Schema.gs']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', file), 'utf8'), context);
  }
  const schema = vm.runInContext('HV_SCHEMA', context);
  const sheets = new Map();
  for (const [name, keys] of Object.entries(schema)) {
    const headers = Array.from(keys);
    if (name === 'Orders') { headers.splice(3, 0, 'accessHash'); }
    const sheet = {
      rows: [headers],
      getLastRow() { return this.rows.length; },
      getLastColumn() { return this.rows[0].length; },
      getRange(row, column, height, width) {
        return { getValues: () => this.rows.slice(row - 1, row - 1 + height)
          .map(values => values.slice(column - 1, column - 1 + width)) };
      },
      deleteRow(row) { this.rows.splice(row - 1, 1); },
      deleteColumn(column) { this.rows.forEach(row => row.splice(column - 1, 1)); }
    };
    sheets.set(name, sheet);
  }
  const db = { getSheetByName: name => sheets.get(name) };
  function append(name, record) {
    const sheet = sheets.get(name);
    sheet.rows.push(sheet.rows[0].map(key => record[key] === undefined ? '' : record[key]));
  }
  function records(name) {
    const rows = sheets.get(name).rows;
    return rows.slice(1).map(row => Object.fromEntries(rows[0].map((key, index) => [key, row[index]])));
  }
  context.database_ = () => db;
  context.withLock_ = operation => operation();
  append('Orders', { id: 'legacy1', accessHash: 'secret', invoiceFileId: 'invoice-old', transactionState: 'COMMITTED' });
  append('Orders', { id: 'account1', customerId: 'consumer1', total: 50000, invoiceFileId: 'invoice-account' });
  append('Orders', { id: 'legacy2', transactionState: 'PREPARING', invoiceFileId: 'shared-file' });
  for (const name of ['OrderItems', 'StockLedger', 'Payments', 'Refunds', 'Shipping']) {
    append(name, { id: 'old-child', orderId: 'legacy1' });
    append(name, { id: 'account-child', orderId: 'account1' });
    append(name, { id: 'preparing-child', orderId: 'legacy2' });
  }
  append('Files', { id: 'old-proof', orderId: 'legacy1', driveFileId: 'proof-old' });
  append('Files', { id: 'shared-proof', orderId: 'legacy2', driveFileId: 'shared-file' });
  append('Files', { id: 'account-proof', orderId: 'account1', driveFileId: 'proof-account' });
  append('Files', { id: 'product-file', productId: 'product1', driveFileId: 'product-photo' });
  append('Products', { id: 'product1', photoFileId: 'shared-file' });
  append('Settings', { key: 'ordersEnabled', value: 'true' });
  append('Users', { id: 'consumer1', name: 'Pembeli' });
  append('AuditLog', { id: 'old-audit', entityId: 'legacy1' });
  append('AuditLog', { id: 'account-audit', entityId: 'account1' });
  append('AuditLog', { id: 'master-audit', entityId: 'product1' });
  return { context, db, sheets, append, records, trashed };
}

test('Pembersihan menghapus hanya pesanan tanpa akun beserta relasi dan kolom kunci', () => {
  const f = fixture();
  const preserved = ['Products', 'Users', 'Settings', 'ReadyStock', 'PreorderCapacity', 'Sessions', 'BackupLog'];
  const before = preserved.map(name => JSON.stringify(f.sheets.get(name).rows));
  const account = f.records('Orders').find(row => row.id === 'account1');
  delete account.accessHash;
  const result = f.context.removeLegacyOrders();
  assert.equal(result.orders, 2);
  assert.equal(result.relatedRows, 13);
  assert.equal(result.files, 2);
  assert.equal(result.columns, 1);
  assert.deepEqual(f.records('Orders'), [account]);
  for (const name of ['OrderItems', 'StockLedger', 'Payments', 'Refunds', 'Shipping']) {
    assert.deepEqual(f.records(name).map(row => row.orderId), ['account1']);
  }
  assert.deepEqual(f.records('Files').map(row => row.id), ['account-proof', 'product-file']);
  assert.deepEqual(f.records('AuditLog').map(row => row.id), ['account-audit', 'master-audit']);
  assert.deepEqual(f.trashed.sort(), ['invoice-old', 'proof-old']);
  assert.deepEqual(preserved.map(name => JSON.stringify(f.sheets.get(name).rows)), before);
  const after = JSON.stringify([...f.sheets].map(([name, sheet]) => [name, sheet.rows]));
  assert.equal(f.context.removeLegacyOrders().orders, 0);
  assert.equal(JSON.stringify([...f.sheets].map(([name, sheet]) => [name, sheet.rows])), after);
});

test('Pesanan pra-migrasi tanpa kolom customerId dapat dibersihkan', () => {
  const f = fixture();
  const orders = f.sheets.get('Orders');
  orders.deleteRow(3);
  orders.deleteColumn(orders.rows[0].indexOf('customerId') + 1);
  assert.equal(f.context.removeLegacyOrders().orders, 2);
  assert.equal(f.records('Orders').length, 0);
});

test('Nama kolom tidak sesuai ditolak sebelum baris atau Drive diubah', () => {
  const f = fixture();
  f.sheets.get('Payments').rows[0][2] = 'kolom-tidak-dikenal';
  const before = JSON.stringify([...f.sheets].map(([name, sheet]) => [name, sheet.rows]));
  assert.throws(() => f.context.removeLegacyOrders(), /Kolom Payments berbeda/);
  assert.equal(JSON.stringify([...f.sheets].map(([name, sheet]) => [name, sheet.rows])), before);
  assert.deepEqual(f.trashed, []);
});

test('Kegagalan Drive mempertahankan data agar pembersihan bisa diulang', () => {
  const f = fixture({ driveFailure: true });
  const before = JSON.stringify([...f.sheets].map(([name, sheet]) => [name, sheet.rows]));
  assert.throws(() => f.context.removeLegacyOrders(), /Drive tidak tersedia/);
  assert.equal(JSON.stringify([...f.sheets].map(([name, sheet]) => [name, sheet.rows])), before);
});

test('Pemanggilan anonim ditolak sebelum database dibuka', () => {
  const f = fixture({ anonymous: true });
  f.context.database_ = () => { throw new Error('Database tidak boleh dibuka'); };
  assert.throws(() => f.context.removeLegacyOrders(), /akun pemilik/);
  assert.deepEqual(f.trashed, []);
});

test('Pembersihan baris terputus dapat dilanjutkan tanpa menghapus pesanan akun', () => {
  const f = fixture();
  const sheet = f.sheets.get('Payments');
  const original = sheet.deleteRow;
  let interrupted = false;
  sheet.deleteRow = function (row) {
    if (!interrupted) { interrupted = true; throw new Error('Sheets terputus'); }
    original.call(this, row);
  };
  assert.throws(() => f.context.removeLegacyOrders(), /Sheets terputus/);
  assert.deepEqual(f.records('Orders').map(row => row.id), ['legacy1', 'account1', 'legacy2']);
  assert.equal(f.context.removeLegacyOrders().orders, 2);
  assert.deepEqual(f.records('Orders').map(row => row.id), ['account1']);
  assert.deepEqual(f.records('Payments').map(row => row.orderId), ['account1']);
});

test('Migrasi kolom kunci tidak menghapus baris dan aman diulang', () => {
  const f = fixture();
  assert.equal(f.context.removeLegacyOrderAccessColumn_(f.db), 1);
  assert.equal(f.context.removeLegacyOrderAccessColumn_(f.db), 0);
  assert.deepEqual(f.records('Orders').map(row => row.id), ['legacy1', 'account1', 'legacy2']);
  assert.equal(f.context.removeLegacyOrders().orders, 2);
});
