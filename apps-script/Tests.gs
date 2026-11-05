// Pilih runRuleTests di editor; hasil tiap aturan tampil di Execution log.
function runRuleTests() {
  requireSetupAccess_();
  const results = runRuleTests_();
  results.forEach(function (result) {
    console.info(result.status + ': ' + result.name);
  });
  if (results.some(function (result) { return result.status !== 'PASS'; })) {
    throw new Error('Ada aturan yang gagal. Periksa hasil pengujian sebelum melanjutkan.');
  }
  return results;
}

// Uji murni tidak membuat akun, pesanan, pembayaran atau berkas produksi.
function runRuleTests_() {
  const results = [];
  function test(name, operation) {
    try {
      operation();
      results.push({ name: name, status: 'PASS' });
    } catch (error) {
      results.push({ name: name, status: 'FAIL', message: error.message });
    }
  }
  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Hasil tidak sesuai.');
    }
  }
  const config = {
    intervalMinutes: '30',
    preparationMinutes: '30',
    discountRounding: 'NEAREST'
  };
  const hours = [0, 1, 2, 3, 4, 5, 6].map(function (day) {
    return { weekday: day, opens: '08:00', closes: '20:00', active: true };
  });
  test('Batas preorder sebelum 17.00 WITA', function () {
    assert(slots_('PREORDER', config, hours, new Date('2026-11-01T08:59:00Z')).times.length > 0);
  });
  test('Tolak preorder tepat 17.00 WITA', function () {
    assert(slots_('PREORDER', config, hours, new Date('2026-11-01T09:00:00Z')).times.length === 0);
  });
  test('Waktu langsung memenuhi persiapan', function () {
    const result = slots_('DIRECT', config, hours, new Date('2026-11-01T00:01:00Z'));
    assert(result.times[0] === '09:00');
    assert(result.date === '2026-11-01');
  });
  test('Hari layanan sesuai WITA', function () {
    const sunday = [{ weekday: 0, opens: '08:00', closes: '09:00', active: true }];
    const result = slots_('PREORDER', config, sunday, new Date('2026-10-31T00:00:00Z'));
    assert(result.date === '2026-11-01' && result.times.length === 2);
  });
  test('Hari tutup tidak mengubah tanggal', function () {
    const result = slots_('PREORDER', config, [], new Date('2026-11-01T00:00:00Z'));
    assert(result.date === '2026-11-02' && result.times.length === 0);
  });
  test('Voucher hanya item non-diskon dan minimum seluruh subtotal', function () {
    const result = calculate_([
      { unitPrice: 30000, quantity: 1, hasDiscount: true },
      { unitPrice: 20000, quantity: 1, hasDiscount: false }
    ], { type: 'PERCENT', value: 10, minimum: 50000, maximum: 0 }, config);
    assert(result.subtotal === 50000 && result.voucherDiscount === 2000 && result.total === 48000);
  });
  test('Voucher tidak melebihi basis non-diskon', function () {
    const result = calculate_([
      { unitPrice: 30000, quantity: 1, hasDiscount: true },
      { unitPrice: 20000, quantity: 1, hasDiscount: false }
    ], { type: 'AMOUNT', value: 90000, minimum: 0, maximum: 0 }, config);
    assert(result.voucherDiscount === 20000);
  });
  test('Tagihan ongkir baru dan pesanan lama dibedakan dari snapshot', function () {
    const priced = orderAmounts_({ total: 58000,
      snapshotJson: JSON.stringify({ shipping: { included: true, provider: 'Gojek', fee: 10000 } }) });
    assert(priced.productTotal === 48000 && priced.shippingFee === 10000);
    assert(orderAmounts_({ total: 48000, snapshotJson: '{"items":[]}' }).shippingFee === 0);
  });
  test('Stok aktif dan reservasi terputus tetap dihitung', function () {
    const snapshot = JSON.stringify({ items: [{ poolId: 'p', quantity: 2 }] });
    const orders = [
      { transactionState: 'PREPARING', fulfillment: 'NEW', snapshotJson: snapshot },
      { transactionState: 'COMMITTED', fulfillment: 'NEW', snapshotJson: snapshot }
    ];
    assert(usedCapacity_('p', orders) === 4);
    assert(usedCapacity_('lain', orders) === 0);
  });
  test('Reservasi pesanan lama tetap sesuai riwayat tersimpan', function () {
    const snapshot = JSON.stringify({ items: [{ poolId: 'p', quantity: 2 }] });
    assert(usedCapacity_('p', [
      { transactionState: 'COMMITTED', fulfillment: 'CANCELLED', preparedAt: '', snapshotJson: snapshot },
      { transactionState: 'COMMITTED', fulfillment: 'CANCELLED', preparedAt: '2026', snapshotJson: snapshot }
    ]) === 2);
  });
  test('Formula injection dinetralkan', function () {
    assert(cell_('=IMPORTXML("x")').startsWith("'"));
    assert(cell_(25000) === 25000);
  });
  test('Input bilangan pecahan ditolak', function () {
    let denied = false;
    try {
      integer_('1.5', 'Jumlah', 1, 100);
    } catch (error) {
      denied = true;
    }
    assert(denied);
  });
  return results;
}
