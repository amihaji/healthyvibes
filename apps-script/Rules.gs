// Mengambil tanggal/jam WITA dari waktu server, bukan jam perangkat pelanggan.
function clock_(instant) {
  const shifted = new Date((instant || new Date()).getTime() + 8 * 3600000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
    tomorrow: new Date(shifted.getTime() + 86400000).toISOString().slice(0, 10)
  };
}

function minutes_(time) {
  if (!/^\d{2}:\d{2}$/.test(String(time))) {
    throw new Error('Jam harus HH:mm.');
  }
  const parts = time.split(':').map(Number);
  if (parts[0] > 23 || parts[1] > 59) {
    throw new Error('Jam tidak valid.');
  }
  return parts[0] * 60 + parts[1];
}

function timeLabel_(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, '0') +
    ':' + String(minutes % 60).padStart(2, '0');
}

// Menghasilkan waktu layanan yang masih valid; tidak mengganti jenis/tanggal pesanan.
function slots_(type, config, hours, instant) {
  const clock = clock_(instant);
  if (['DIRECT', 'PREORDER'].indexOf(type) < 0) {
    throw new Error('Jenis pesanan tidak valid.');
  }
  const date = type === 'PREORDER' ? clock.tomorrow : clock.date;
  if (type === 'PREORDER' && clock.minutes >= 17 * 60) {
    return { date: date, times: [] };
  }
  const actualDay = new Date(date + 'T12:00:00Z').getUTCDay();
  const schedule = hours.find(function (row) {
    return Number(row.weekday) === actualDay && active_(row.active);
  });
  const interval = integer_(config.intervalMinutes, 'Interval', 5, 240);
  const preparation = integer_(config.preparationMinutes, 'Persiapan', 0, 1440);
  if (!schedule) {
    return { date: date, times: [] };
  }
  const open = minutes_(String(schedule.opens));
  const close = minutes_(String(schedule.closes));
  const result = [];
  for (let current = open; current < close; current += interval) {
    if (type === 'PREORDER' || current >= clock.minutes + preparation) {
      result.push(timeLabel_(current));
    }
  }
  return { date: date, times: result };
}

function validPeriod_(record, instant) {
  const stamp = (instant || new Date()).getTime();
  return active_(record.active) &&
    Date.parse(record.startsAt) <= stamp &&
    Date.parse(record.endsAt) >= stamp;
}

// Diskon dipotong sekali; voucher hanya mendapat basis dari item non-diskon.
function calculate_(items, voucher, config) {
  let subtotal = 0;
  let eligible = 0;
  items.forEach(function (item) {
    subtotal += item.unitPrice * item.quantity;
    if (!item.hasDiscount) {
      eligible += item.unitPrice * item.quantity;
    }
  });
  let discount = 0;
  if (voucher) {
    if (subtotal < Number(voucher.minimum)) {
      throw new Error('Minimum belanja voucher belum terpenuhi.');
    }
    discount = voucher.type === 'PERCENT'
      ? eligible * Number(voucher.value) / 100
      : Number(voucher.value);
    discount = rounded_(discount, config.discountRounding);
    discount = Math.min(discount, eligible);
    if (Number(voucher.maximum) > 0) {
      discount = Math.min(discount, Number(voucher.maximum));
    }
  }
  return { subtotal: subtotal, voucherDiscount: discount, total: subtotal - discount };
}

// Pilihan pembulatan diatur Admin; jangan menetapkan aturan uang diam-diam.
function rounded_(value, mode) {
  if (mode === 'NEAREST') {
    return Math.round(value);
  }
  if (mode === 'UP') {
    return Math.ceil(value);
  }
  if (mode === 'DOWN') {
    return Math.floor(value);
  }
  throw new Error('Aturan pembulatan belum diatur Admin.');
}

// Snapshot Orders adalah sumber reservasi; ledger merupakan jejak mutasi.
function usedCapacity_(poolId, orders) {
  return orders.reduce(function (sum, order) {
    if (['PREPARING', 'COMMITTED'].indexOf(order.transactionState) < 0) {
      return sum;
    }
    if (order.fulfillment === 'CANCELLED' && !order.preparedAt) {
      return sum;
    }
    const snapshot = JSON.parse(order.snapshotJson);
    return sum + snapshot.items.reduce(function (count, item) {
      return count + (item.poolId === poolId ? item.quantity : 0);
    }, 0);
  }, 0);
}

function pool_(productId, type, date) {
  const name = type === 'DIRECT' ? 'ReadyStock' : 'PreorderCapacity';
  const row = rows_(name).find(function (record) {
    return record.productId === productId &&
      (type === 'DIRECT' || record.date === date);
  });
  if (!row) {
    throw new Error('Stok atau kuota belum tersedia untuk produk.');
  }
  return row;
}
