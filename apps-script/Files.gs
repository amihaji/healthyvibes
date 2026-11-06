// Izin Drive tetap privat. Berkas hanya dilepas setelah pemeriksaan akses backend.
function folder_(kind) {
  const id = PropertiesService.getScriptProperties().getProperty('FOLDER_' + kind);
  if (!id) {
    throw new Error('Folder ' + kind + ' belum dipasang.');
  }
  return DriveApp.getFolderById(id);
}

// Memeriksa signature gambar nyata; tidak percaya ekstensi atau MIME browser.
function imageBlob_(data) {
  const mime = data.mimeType;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    throw new Error('Gunakan JPG, PNG, atau WebP.');
  }
  const base64 = text_(data.base64, 'Berkas', 7500000);
  const bytes = Utilities.base64Decode(base64);
  const unsigned = bytes.map(function (byte) { return byte & 255; });
  const signature = unsigned.slice(0, 12);
  const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  const png = signature.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  const webp = String.fromCharCode.apply(null, signature.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode.apply(null, signature.slice(8, 12)) === 'WEBP';
  if (
    bytes.length > Number(settings_().uploadMaxBytes) || bytes.length < 16 ||
    (mime === 'image/jpeg' && !jpeg) || (mime === 'image/png' && !png) ||
    (mime === 'image/webp' && !webp)
  ) {
    throw new Error('Isi atau ukuran gambar tidak valid.');
  }
  const suffix = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
  return Utilities.newBlob(bytes, mime, id_() + suffix);
}

function upload_(user, data, customer) {
  const kind = data.kind;
  let order = null;
  let product = null;
  if (kind === 'PRODUK') {
    if (customer) { throw new Error('Konsumen tidak boleh mengunggah foto produk.'); }
    if (!user || !['Admin', 'Operator'].includes(user.role)) {
      throw new Error('Upload produk hanya untuk pengelola.');
    }
    product = rows_('Products').find(function (row) { return row.id === data.productId; });
    if (!product) {
      throw new Error('Simpan produk sebelum mengunggah foto.');
    }
  } else if (kind === 'STRUK') {
    order = customer ? accountOrderAccess_(customer, data) : user
      ? rows_('Orders').find(function (row) { return row.id === data.orderId; })
      : customerAccess_(data);
    if (!order || order.fulfillment === 'CANCELLED') {
      throw new Error('Bukti transfer tidak dapat diunggah.');
    }
  } else if (kind === 'TANDATERIMA') {
    if (user) {
      throw new Error('Tanda terima harus diunggah konsumen melalui Status Pesanan.');
    }
    order = customer ? accountOrderAccess_(customer, data) : customerAccess_(data);
    const eligible = order.receipt === 'DELIVERY'
      ? order.fulfillment === 'DISPATCHED'
      : order.receipt === 'PICKUP' && order.fulfillment === 'READY';
    if (!eligible) {
      throw new Error('Tanda terima hanya setelah pesanan dikirim atau siap diambil, dan produk sudah diterima.');
    }
    if (data.received !== true) {
      throw new Error('Konfirmasi bahwa produk sudah diterima sebelum mengunggah tanda terima.');
    }
  } else {
    throw new Error('Jenis unggahan tidak diizinkan.');
  }
  const requestId = text_(data.requestId, 'ID unggahan', 100);
  const old = rows_('Files').find(function (row) { return row.requestId === requestId; });
  if (old) {
    if (old.kind !== kind || old.orderId !== (order ? order.id : '') ||
      old.productId !== (product ? product.id : '')) {
      throw new Error('ID unggahan telah digunakan.');
    }
    return { fileId: old.driveFileId };
  }
  const count = rows_('Files').filter(function (row) {
    return row.kind === kind && row.orderId === (order ? order.id : '') &&
      row.productId === (product ? product.id : '');
  }).length;
  if (count >= 20) {
    throw new Error('Batas 20 berkas per pesanan/produk tercapai.');
  }
  const blob = imageBlob_(data);
  // Nama request deterministik mencegah file ganda bila penulisan metadata gagal.
  const fileName = digest_(requestId) + '-' + blob.getName();
  const folder = folder_(kind);
  const existing = folder.getFiles();
  let file = null;
  const prefix = digest_(requestId) + '-';
  while (existing.hasNext()) {
    const candidate = existing.next();
    if (candidate.getName().indexOf(prefix) === 0) {
      file = candidate;
      break;
    }
  }
  file = file || folder.createFile(blob.setName(fileName));
  append_('Files', {
    id: id_(),
    requestId: requestId,
    orderId: order ? order.id : '',
    productId: product ? product.id : '',
    kind: kind,
    driveFileId: file.getId(),
    mimeType: data.mimeType,
    size: blob.getBytes().length,
    createdAt: now_(),
    uploadedBy: user ? user.id : 'CUSTOMER'
  });
  if (product) {
    patch_('Products', product, { photoFileId: file.getId(), updatedAt: now_() });
  }
  audit_(user, 'UPLOAD_' + kind, order ? order.id : product.id, 'Berkas privat tersimpan.');
  return { fileId: file.getId() };
}

function escapeHtml_(value) {
  return String(value || '').replace(/[&<>"']/g, function (character) {
    return {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character];
  });
}

// Invoice menggunakan snapshot harga. Invoice bukan bukti pembayaran lunas.
function invoice_(order) {
  if (order.invoiceFileId) {
    return DriveApp.getFileById(order.invoiceFileId);
  }
  const name = order.id + '.pdf';
  const matches = folder_('INVOICE').getFilesByName(name);
  let file;
  if (matches.hasNext()) {
    file = matches.next();
  } else {
    const config = settings_();
    const amounts = orderAmounts_(order);
    const lines = JSON.parse(order.snapshotJson).items.map(function (item) {
      return '<tr><td>' + escapeHtml_(item.name) + '</td><td>' +
        item.quantity + '</td><td>' + item.unitPrice + '</td><td>' +
        item.unitPrice * item.quantity + '</td></tr>';
    }).join('');
    const html = '<html><head><meta charset="utf-8"><style>' +
      'body{font:12px Arial;color:#171717;padding:24px}' +
      'h1{color:#065b55}table{width:100%;border-collapse:collapse}' +
      'td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}' +
      '</style></head><body><h1>' + escapeHtml_(config.storeName) +
      '</h1><h2>INVOICE</h2><p>' + escapeHtml_(order.id) +
      '</p><p>' + escapeHtml_(order.name) + ' | ' + escapeHtml_(order.phone) +
      '</p><p>Penerimaan: ' + escapeHtml_(order.date + ' ' + order.time) +
      ' WITA</p><table><thead><tr><th>Produk</th><th>Jumlah</th>' +
      '<th>Harga Rp</th><th>Subtotal Rp</th></tr></thead><tbody>' +
      lines + '</tbody></table><p>Voucher: Rp ' + order.voucherDiscount +
      '</p><p>Total produk: Rp ' + amounts.productTotal + '</p>' +
      (amounts.shippingIncluded ? '<p>Pengiriman ' + escapeHtml_(amounts.shippingProvider) +
        ': Rp ' + amounts.shippingFee + '</p>'
        : order.receipt === 'DELIVERY' ? '<p>Pesanan lama: tagihan tersimpan belum termasuk biaya pengiriman.</p>' : '') +
      '<h3>Total pembayaran: Rp ' + order.total + '</h3>' +
      '<p>Invoice bukan bukti pembayaran. Verifikasi manual dari transaksi masuk.</p>' +
      '</body></html>';
    const pdf = Utilities.newBlob(html, 'text/html', 'invoice.html').getAs('application/pdf');
    file = folder_('INVOICE').createFile(pdf.setName(name));
  }
  patch_('Orders', order, { invoiceFileId: file.getId() });
  return file;
}

// Unduhan tidak menggunakan tautan Drive publik.
function download_(user, data, customer) {
  let file;
  if (data.kind === 'INVOICE') {
    const order = customer ? accountOrderAccess_(customer, data) : user
      ? rows_('Orders').find(function (row) { return row.id === data.orderId; })
      : customerAccess_(data);
    if (!order || order.transactionState !== 'COMMITTED') {
      throw new Error('Invoice tidak tersedia.');
    }
    file = invoice_(order);
  } else {
    if (!user || !['Admin', 'Operator'].includes(user.role)) {
      throw new Error('Berkas privat hanya untuk pengelola.');
    }
    const record = rows_('Files').find(function (row) { return row.driveFileId === data.fileId; });
    if (!record) {
      throw new Error('Berkas tidak ditemukan.');
    }
    file = DriveApp.getFileById(record.driveFileId);
  }
  const blob = file.getBlob();
  return {
    name: file.getName(),
    mimeType: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

// Foto katalog boleh dilihat umum melalui backend, bukan folder Drive publik.
function productPhoto_(data) {
  const product = rows_('Products').find(function (row) {
    return row.id === data.productId && active_(row.active);
  });
  if (!product || !product.photoFileId) {
    return null;
  }
  const blob = DriveApp.getFileById(product.photoFileId).getBlob();
  return {
    mimeType: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

// Logo dan QRIS dipasang staf yang memiliki hak mengubah Pengaturan.
function uploadStoreAsset_(user, data) {
  requireMenu_(user, 'Pengaturan', true);
  if (!['Admin', 'Operator'].includes(user.role) || !['logoFileId', 'qrisFileId'].includes(data.asset)) {
    throw new Error('Aset toko atau hak pengelola tidak valid.');
  }
  const blob = imageBlob_(data);
  const file = folder_('PRODUK').createFile(blob);
  append_('Files', {
    id: id_(),
    requestId: id_(),
    productId: 'STORE',
    kind: 'PRODUK',
    driveFileId: file.getId(),
    mimeType: data.mimeType,
    size: blob.getBytes().length,
    createdAt: now_(),
    uploadedBy: user.id
  });
  setSetting_(data.asset, file.getId());
  audit_(user, 'STORE_ASSET', 'STORE', data.asset);
  return true;
}

// Hanya ID aset yang telah disahkan pengelola boleh dibaca publik.
function storeAsset_(data) {
  if (!['logoFileId', 'qrisFileId'].includes(data.asset)) {
    throw new Error('Aset tidak dikenal.');
  }
  const id = settings_()[data.asset];
  if (!id) {
    return null;
  }
  const blob = DriveApp.getFileById(id).getBlob();
  return {
    mimeType: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

// Backup membuat salinan privat lengkap, tidak menghapus/menimpa produksi.
function backup_(user) {
  const destination = folder_('BACKUP').createFolder(
    'BACKUP-' + now_().replace(/[:.]/g, '-')
  );
  const log = append_('BackupLog', {
    id: id_(),
    createdAt: now_(),
    folderId: destination.getId(),
    status: 'STARTED'
  });
  const copy = DriveApp.getFileById(database_().getId())
    .makeCopy('DATABASE', destination);
  const manifest = {
    version: 1,
    createdAt: now_(),
    databaseId: copy.getId(),
    files: [],
    folders: {}
  };
  ['PRODUK', 'INVOICE', 'STRUK', 'TANDATERIMA'].forEach(function (kind) {
    const target = destination.createFolder(kind);
    manifest.folders[kind] = target.getId();
    const files = folder_(kind).getFiles();
    while (files.hasNext()) {
      const original = files.next();
      const copied = original.makeCopy(original.getName(), target);
      manifest.files.push({
        originalId: original.getId(),
        backupId: copied.getId(),
        kind: kind,
        name: original.getName()
      });
    }
  });
  destination.createFile('manifest.json', JSON.stringify(manifest), 'application/json');
  patch_('BackupLog', log, { databaseFileId: copy.getId(), status: 'COMPLETED' });
  audit_(user, 'BACKUP', log.id, 'Salinan privat; bukan restore otomatis.');
  return { folderUrl: 'https://drive.google.com/drive/folders/' + destination.getId() };
}
