  'use strict';

  // Sesi pengelola hanya di memori; tidak ditaruh di URL atau penyimpanan browser.
  const state = {
    token: '',
    user: null,
    catalog: null,
    type: 'DIRECT',
    cart: {},
    page: 'shop',
    adminPage: 'Dashboard',
    admin: null,
    checkoutStep: 1,
    recipient: {},
    quote: null,
    requestId: '',
    accessToken: '',
    order: null,
    report: null,
    listPage: 0
  };
  const app = document.getElementById('app');
  const dialog = document.getElementById('editor');

  // Escape sebelum memasukkan data produk/pelanggan ke markup.
  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function rupiah(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  // Loading dihitung agar request foto bersamaan tidak mematikan indikator lebih awal.
  let pending = 0;
  function rpc(action, data) {
    pending += 1;
    document.getElementById('busy').classList.remove('d-none');
    return Promise.resolve().then(function () {
      return HealthyVibesApi.request({
        action: action,
        data: data || {},
        token: state.token
      });
    }).then(function (response) {
      if (!response || typeof response.ok !== 'boolean') {
        throw new Error('Respons server tidak valid. Keberhasilan belum dapat dipastikan.');
      }
      if (!response.ok) {
        throw new Error(response.message || 'Operasi ditolak server.');
      }
      return response.data;
    }).finally(function () {
      pending -= 1;
      document.getElementById('busy').classList.toggle('d-none', pending === 0);
    });
  }

  function notify(message, error) {
    const element = document.getElementById('notification');
    element.innerHTML = '<div class="alert ' +
      (error ? 'alert-danger' : 'alert-success') + '">' + safe(message) + '</div>';
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function field(label, name, value, type, required) {
    return '<div class="mb-3"><label class="form-label" for="f-' + name + '">' +
      safe(label) + '</label><input class="form-control" id="f-' + name +
      '" name="' + name + '" type="' + (type || 'text') + '" value="' +
      safe(value || '') + '"' + (required === false ? '' : ' required') + '></div>';
  }

  function selectField(label, name, options, value) {
    return '<div class="mb-3"><label class="form-label" for="f-' + name + '">' +
      safe(label) + '</label><select class="form-select" id="f-' + name +
      '" name="' + name + '">' + options.map(function (option) {
        return '<option value="' + safe(option[0]) + '"' +
          (String(option[0]) === String(value) ? ' selected' : '') + '>' +
          safe(option[1]) + '</option>';
      }).join('') + '</select></div>';
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function showEditor(title, content) {
    document.getElementById('editor-title').textContent = title;
    document.getElementById('editor-content').innerHTML = content;
    if (!dialog.open) {
      dialog.showModal();
    }
  }

  // Token pelanggan menggunakan Web Crypto, bukan Math.random.
  function randomToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async function navigate(page) {
    state.page = page;
    dialog.close();
    if (page === 'shop') {
      await loadCatalog();
    } else if (page === 'admin') {
      if (state.token) {
        await loadAdmin();
      } else {
        renderLogin();
      }
    } else {
      renderStatusForm();
    }
  }

  async function loadCatalog() {
    state.catalog = await rpc('catalog', { type: state.type });
    renderShop();
    if (state.catalog.settings.logoFileId) {
      rpc('storeAsset', { asset: 'logoFileId' }).then(function (photo) {
        if (photo) {
          const brand = document.querySelector('.brand');
          const image = document.createElement('img');
          image.alt = 'Healthy Vibes';
          image.style.cssText = 'max-width:150px;max-height:48px;object-fit:contain';
          image.src = 'data:' + photo.mimeType + ';base64,' + photo.base64;
          brand.replaceChildren(image);
        }
      }).catch(function () {});
    }
  }

  function cartLines() {
    return Object.entries(state.cart).map(function (entry) {
      const product = state.catalog.products.find(function (row) {
        return row.id === entry[0];
      });
      return product ? { product: product, quantity: entry[1] } : null;
    }).filter(Boolean);
  }

  function cartSummary() {
    const lines = cartLines();
    const total = lines.reduce(function (sum, item) {
      return sum + item.product.unitPrice * item.quantity;
    }, 0);
    return { lines: lines, total: total };
  }

  function renderCart() {
    const summary = cartSummary();
    return '<h2 class="editorial h4">Keranjang Anda</h2>' +
      (summary.lines.length ? summary.lines.map(function (item) {
        return '<div class="border-bottom py-2">' +
          '<div>' + safe(item.product.name) + '</div>' +
          '<div class="d-flex justify-content-between align-items-center gap-2">' +
          '<span>' + rupiah(item.product.unitPrice) + '</span>' +
          '<div><button class="btn btn-sm btn-outline-dark" data-minus="' +
          safe(item.product.id) + '" type="button">−</button> ' + item.quantity +
          ' <button class="btn btn-sm btn-outline-dark" data-add="' +
          safe(item.product.id) + '" type="button">+</button></div></div></div>';
      }).join('') : '<p class="text-secondary">Belum ada produk.</p>') +
      '<p class="mt-3"><strong>Total produk: ' + rupiah(summary.total) + '</strong></p>' +
      '<p class="small text-secondary">Ongkir dikonfirmasi terpisah. ' +
      'Keranjang belum menahan stok.</p>' +
      '<button class="btn btn-primary w-100" id="checkout-button" type="button"' +
      (!summary.lines.length ? ' disabled' : '') + '>Lanjut Checkout</button>';
  }

  function renderShop() {
    const catalog = state.catalog;
    app.innerHTML = '<section class="hero"><small>SEHAT SETIAP HARI</small>' +
      '<h1>Pilihan sehat,<br>untuk hari yang lebih baik.</h1>' +
      '<p>Pesan langsung atau rencanakan menu sehat Anda untuk besok.</p></section>' +
      '<div class="shop-layout"><section>' +
      '<div class="d-flex gap-2 mb-3 flex-wrap">' +
      '<button class="btn ' + (state.type === 'DIRECT' ? 'btn-green' : 'btn-outline-dark') +
      '" data-type="DIRECT" type="button">Pesanan Langsung</button>' +
      '<button class="btn ' + (state.type === 'PREORDER' ? 'btn-green' : 'btn-outline-dark') +
      '" data-type="PREORDER" type="button">Preorder Besok</button></div>' +
      '<div class="alert alert-warning small">Preorder sampai 17.00 WITA; ' +
      'pembayaran maksimal 18.00 WITA. ' +
      (catalog.settings.ordersEnabled === 'true' ? '' : 'Toko belum membuka pemesanan.') +
      '</div><div class="row g-2 mb-3"><div class="col-7">' +
      '<input class="form-control" id="product-search" aria-label="Cari produk" placeholder="Cari menu sehat...">' +
      '</div><div class="col-5"><select class="form-select" id="category-filter" aria-label="Kategori">' +
      '<option value="">Semua kategori</option>' + catalog.categories.map(function (row) {
        return '<option value="' + safe(row.id) + '">' + safe(row.name) + '</option>';
      }).join('') + '</select></div></div>' +
      '<h2 class="h4 mb-3">Menu Pilihan</h2><div class="products" id="products"></div>' +
      '</section><aside class="panel cart-panel">' + renderCart() + '</aside></div>' +
      '<div class="mobile-cart"><strong>' + rupiah(cartSummary().total) +
      '</strong><button class="btn btn-primary" id="mobile-cart-button" type="button">' +
      'Keranjang & Checkout</button></div>';
    renderProducts();
  }

  // Foto berasal dari upload produk aktual; tidak ada foto placeholder.
  function renderProducts() {
    const search = document.getElementById('product-search').value.toLowerCase();
    const category = document.getElementById('category-filter').value;
    const products = state.catalog.products.filter(function (row) {
      return row.name.toLowerCase().includes(search) &&
        (!category || row.categoryId === category);
    });
    document.getElementById('products').innerHTML = products.length
      ? products.map(function (product) {
        return '<article class="product-card">' +
          (product.photoFileId ? '<div data-photo="' + safe(product.id) + '"></div>' : '') +
          '<h2>' + safe(product.name) + '</h2><p class="description">' +
          safe(product.description) + '</p><small>Tersedia: ' + product.available +
          '</small><div class="price d-flex flex-wrap gap-2 justify-content-between align-items-center mt-2">' +
          '<strong>' + rupiah(product.unitPrice) + '</strong>' +
          '<button class="btn btn-primary" data-add="' + safe(product.id) +
          '" type="button" aria-label="Tambah ' + safe(product.name) + '"' +
          (product.available < 1 ? ' disabled' : '') + '>+</button></div></article>';
      }).join('')
      : '<p class="text-secondary">Belum ada produk sesuai pencarian.</p>';
    document.querySelectorAll('[data-photo]').forEach(function (element) {
      rpc('productPhoto', { productId: element.dataset.photo }).then(function (photo) {
        if (photo && element.isConnected) {
          const image = document.createElement('img');
          image.loading = 'lazy';
          image.alt = 'Foto produk';
          image.src = 'data:' + photo.mimeType + ';base64,' + photo.base64;
          element.appendChild(image);
        }
      }).catch(function () {
        element.textContent = 'Foto belum dapat dimuat.';
      });
    });
  }

  async function startCheckout() {
    if (!cartLines().length) {
      throw new Error('Tambahkan produk terlebih dahulu.');
    }
    if (!state.requestId) {
      state.requestId = crypto.randomUUID();
      state.accessToken = randomToken();
    }
    state.checkoutStep = 1;
    dialog.close();
    renderCheckout();
  }

  function checkoutPayload() {
    return Object.assign({}, state.recipient, {
      type: state.type,
      date: state.catalog.schedule.date,
      items: cartLines().map(function (item) {
        return { productId: item.product.id, quantity: item.quantity };
      }),
      requestId: state.requestId,
      accessToken: state.accessToken
    });
  }

  function renderCheckout() {
    const step = state.checkoutStep;
    const recipient = state.recipient;
    const schedule = state.catalog.schedule;
    let content = '';
    if (step === 1) {
      content = field('Nama penerima', 'name', recipient.name) +
        field('Nomor HP (diawali 0)', 'phone', recipient.phone, 'tel') +
        selectField('Cara penerimaan', 'receipt', [
          ['PICKUP', 'Ambil sendiri di toko'],
          ...(state.catalog.settings.deliveryVerified === 'true'
            ? [['DELIVERY', 'Diantar GoSend']] : [])
        ], recipient.receipt || 'PICKUP') +
        selectField('Wilayah (wajib bila diantar)', 'areaId', [
          ['', 'Pilih wilayah'],
          ...state.catalog.areas.map(function (row) { return [row.id, row.name]; })
        ], recipient.areaId) +
        '<label class="form-label" for="address">Alamat lengkap (untuk antar)</label>' +
        '<textarea class="form-control mb-3" id="address" name="address">' +
        safe(recipient.address || '') + '</textarea>' +
        '<p>Tanggal: <strong>' + safe(schedule.date) + '</strong> WITA</p>' +
        selectField('Waktu penerimaan/pengambilan', 'time', schedule.times.map(function (time) {
          return [time, time + ' WITA'];
        }), recipient.time);
      if (!schedule.times.length) {
        content += '<p class="alert alert-warning">Tidak ada waktu valid. ' +
          'Kembali ke menu untuk memilih jenis pesanan lain.</p>';
      }
    } else if (step === 2) {
      const cash = state.type === 'DIRECT' && recipient.receipt === 'PICKUP';
      content = selectField('Metode pembayaran produk', 'paymentMethod', [
        ['TRANSFER', 'Transfer bank'],
        ['QRIS', 'QRIS manual'],
        ...(cash ? [['PICKUP_CASH', 'Bayar saat diambil']] : [])
      ], recipient.paymentMethod || 'TRANSFER') +
        field('Kode voucher (opsional)', 'voucherCode', recipient.voucherCode, 'text', false) +
        '<p class="text-secondary">' + safe(state.catalog.settings.bankInstructions) + '</p>' +
        '<div id="qris-image"></div>' +
        '<p>Upload bukti transfer dilakukan setelah nomor pesanan terbit. ' +
        'Bukti foto tidak otomatis melunasi pesanan.</p>';
    } else {
      content = '<h2 class="h5">Tinjau Pesanan</h2><p>' + safe(recipient.name) +
        ' | ' + safe(recipient.phone) + '</p><p>' + safe(recipient.receipt) +
        ' | ' + safe(schedule.date + ' ' + recipient.time) + ' WITA</p>' +
        '<p>' + safe(recipient.address || state.catalog.settings.address) + '</p>' +
        '<p>Pembayaran: ' + safe(recipient.paymentMethod) + '</p>' +
        '<div class="alert alert-warning small">Pembatalan pelanggan sebelum persiapan ' +
        'yang disetujui: refund 90% pembayaran produk. Setelah persiapan dimulai, ' +
        'pembatalan tidak diperbolehkan. Pembatalan toko: refund 100%. ' +
        'Refund manual maksimal 1 x 24 jam sejak konfirmasi pembatalan. ' +
        'Ongkir tidak termasuk pembayaran produk.</div>' +
        '<label class="d-flex gap-2"><input name="acceptPolicy" type="checkbox" required>' +
        '<span>Saya menyetujui data pesanan dan kebijakan di atas.</span></label>';
    }
    const priced = state.quote || cartSummary();
    app.innerHTML = '<h1>Checkout</h1><div class="steps">' +
      ['Penerima', 'Pembayaran', 'Tinjau Pesanan'].map(function (label, index) {
        return '<span class="' + (index + 1 === step ? 'current' : '') + '">' +
          (index + 1) + '. ' + label + '</span>';
      }).join('') + '</div><div class="checkout-layout"><section class="panel">' +
      '<form id="checkout-form">' + content +
      '<div class="d-flex gap-2 mt-4"><button class="btn btn-outline-dark" id="checkout-back" ' +
      'type="button">Kembali</button><button class="btn btn-primary flex-grow-1" type="submit"' +
      (step === 1 && !schedule.times.length ? ' disabled' : '') + '>' +
      (step === 3 ? 'Buat Pesanan' : 'Lanjut') + '</button></div></form></section>' +
      '<aside class="panel"><h2 class="h5">Ringkasan Produk</h2>' +
      cartLines().map(function (item) {
        return '<p>' + safe(item.product.name) + ' x ' + item.quantity + '</p>';
      }).join('') + '<p>Voucher: ' + rupiah(priced.voucherDiscount || 0) + '</p>' +
      '<strong>Total produk: ' + rupiah(priced.total) + '</strong>' +
      '<p class="small mt-3">Ongkir terpisah dan belum dikonfirmasi.</p></aside></div>';
    if (step === 2 && state.catalog.settings.qrisFileId) {
      rpc('storeAsset', { asset: 'qrisFileId' }).then(function (photo) {
        const holder = document.getElementById('qris-image');
        if (photo && holder) {
          const image = document.createElement('img');
          image.alt = 'QRIS toko';
          image.style.cssText = 'max-width:260px;width:100%;height:auto';
          image.src = 'data:' + photo.mimeType + ';base64,' + photo.base64;
          holder.appendChild(image);
        }
      }).catch(function (error) { notify(error.message, true); });
    }
  }

  async function submitCheckout(form) {
    const data = formData(form);
    if (state.checkoutStep < 3) {
      Object.assign(state.recipient, data);
      if (state.checkoutStep === 2) {
        state.quote = await rpc('quote', checkoutPayload());
      }
      state.checkoutStep += 1;
      renderCheckout();
      return;
    }
    const payload = Object.assign(checkoutPayload(), { acceptPolicy: data.acceptPolicy === 'on' });
    const order = await rpc('createOrder', payload);
    state.order = order;
    state.cart = {};
    state.requestId = '';
    renderOrder();
    notify('Pesanan berhasil dibuat. Simpan nomor pesanan dan kunci akses privat Anda.');
  }

  function renderStatusForm() {
    app.innerHTML = '<section class="panel mx-auto" style="max-width:650px">' +
      '<h1 class="h2">Status Pesanan</h1><p>Nomor pesanan saja tidak cukup. ' +
      'Masukkan kunci akses privat yang Anda terima setelah memesan.</p>' +
      '<form id="status-form">' + field('Nomor pesanan', 'orderId', state.order?.id) +
      field('Kunci akses privat', 'accessToken', state.accessToken) +
      '<button class="btn btn-primary" type="submit">Lihat Pesanan</button></form></section>';
  }

  function renderOrder() {
    const order = state.order;
    app.innerHTML = '<section class="panel mx-auto" style="max-width:850px">' +
      '<h1 class="h2">Pesanan Anda</h1><p class="text-break"><strong>' + safe(order.id) +
      '</strong></p><div class="alert alert-warning">Simpan kunci akses berikut secara privat. ' +
      'Kunci ini memberikan akses pesanan.<br><code class="text-break">' +
      safe(state.accessToken) + '</code></div><p>Pembayaran: <span class="status-tag">' +
      safe(order.paymentStatus) + '</span> | Pemenuhan: <span class="status-tag">' +
      safe(order.fulfillment) + '</span></p>' +
      '<p>' + safe(order.date + ' ' + order.time) + ' WITA</p>' +
      order.items.map(function (item) {
        return '<p>' + safe(item.name) + ' x ' + item.quantity + ' — ' +
          rupiah(item.unitPrice) + '</p>';
      }).join('') + '<h2 class="h4">Total produk ' + rupiah(order.total) + '</h2>' +
      '<p>Batas pembayaran: ' + (order.paymentDeadline
        ? safe(new Date(order.paymentDeadline).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })) +
        ' WITA' : 'Sebelum dikirim; langsung ambil dapat bayar saat diambil.') +
      '</p><p>Refund: ' + safe(order.refundStatus) + ' ' + rupiah(order.refundAmount) +
      '</p><div class="d-flex gap-2 flex-wrap"><button class="btn btn-outline-dark" ' +
      'id="refresh-order" type="button">Perbarui Status</button>' +
      '<button class="btn btn-green" id="download-invoice" type="button">Unduh Invoice PDF</button>' +
      '<button class="btn btn-outline-dark" id="save-access" type="button">Unduh Kunci Akses</button>' +
      '</div>' + (order.fulfillment !== 'CANCELLED' ? '<form id="proof-form" class="mt-4">' +
      '<label class="form-label">Struk bukti transfer (JPG/PNG/WebP)</label>' +
      '<input class="form-control mb-2" type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>' +
      '<button class="btn btn-primary" type="submit">Unggah Bukti Transfer</button></form>' : '') +
      (!order.preparedAt && !['CANCELLED', 'COMPLETED'].includes(order.fulfillment)
        ? '<form id="cancel-form" class="mt-4">' + field('Alasan pembatalan', 'reason', '') +
        '<button class="btn btn-outline-danger" type="submit">Ajukan Pembatalan</button></form>'
        : '') + '</section>';
  }

  function renderLogin() {
    app.innerHTML = '<div class="row g-4 align-items-center mx-auto" style="max-width:960px">' +
      '<div class="col-md-6"><section class="hero"><h1>Kelola toko,<br>dengan lebih teratur.</h1>' +
      '<p>Akses sesuai level Admin, Operator, atau Viewer.</p></section></div>' +
      '<div class="col-md-6"><section class="panel"><h2>Login Pengelola</h2>' +
      '<form id="login-form">' + field('Username', 'username', '') +
      field('Password', 'password', '', 'password') +
      '<button class="btn btn-primary w-100" type="submit">Masuk</button></form>' +
      '<p class="small mt-3">Lupa password? Hubungi Admin untuk reset password sementara.</p>' +
      '</section></div></div>';
  }

  function passwordDialog() {
    showEditor('Ganti Password', '<form id="password-form">' +
      field('Password saat ini', 'currentPassword', '', 'password') +
      field('Password baru (minimal 12 karakter)', 'newPassword', '', 'password') +
      '<p>Semua sesi akan dicabut; masuk kembali setelah perubahan.</p>' +
      '<button class="btn btn-primary" type="submit">Simpan Password</button></form>');
  }

  async function loadAdmin() {
    state.admin = await rpc('adminData');
    state.user = state.admin.user;
    renderAdmin();
  }

  function adminMenu() {
    const role = state.user.role;
    const list = role === 'Viewer' ? ['Dashboard', 'Laporan'] : [
      'Dashboard', 'Pesanan', 'Categories', 'Products', 'ReadyStock', 'PreorderCapacity'
    ];
    if (role === 'Admin') {
      list.push('Discounts', 'Vouchers', 'Users', 'ServiceHours', 'ServiceAreas', 'Pengaturan', 'Backup');
    }
    if (role !== 'Viewer') {
      list.push('Laporan');
    }
    return list;
  }

  const tableLabels = {
    Categories: 'Kategori',
    Products: 'Setup Produk',
    ReadyStock: 'Stok Siap Jual',
    PreorderCapacity: 'Kuota Preorder',
    Discounts: 'Diskon Produk',
    Vouchers: 'Voucher',
    Users: 'Setup User',
    ServiceHours: 'Jam Layanan',
    ServiceAreas: 'Wilayah Layanan'
  };

  function renderAdmin() {
    const page = state.adminPage;
    app.innerHTML = '<div class="d-flex justify-content-between gap-2 flex-wrap mb-3">' +
      '<h1 class="h2">Panel Pengelola</h1><div><span>' + safe(state.user.name) +
      ' (' + safe(state.user.role) + ')</span> ' +
      '<button class="btn btn-outline-dark" id="change-password" type="button">Password</button> ' +
      '<button class="btn btn-outline-dark" id="logout" type="button">Keluar</button></div></div>' +
      '<div class="admin-layout"><nav class="admin-nav" aria-label="Menu pengelola">' +
      adminMenu().map(function (name) {
        return '<button class="btn ' + (page === name ? 'selected' : '') +
          '" data-admin-page="' + safe(name) + '" type="button">' +
          safe(tableLabels[name] || name) + '</button>';
      }).join('') + '</nav><section id="admin-body"></section></div>';
    const body = document.getElementById('admin-body');
    if (page === 'Dashboard') {
      const kpi = state.admin.kpi;
      body.innerHTML = '<div class="kpis">' + [
        ['Pesanan', kpi.orders],
        ['Belum lunas', kpi.pending],
        ['Pembayaran produk', rupiah(kpi.payments)],
        ['Refund tertunda', kpi.refundPending]
      ].map(function (item) {
        return '<div class="kpi"><small>' + safe(item[0]) + '</small><strong>' +
          safe(item[1]) + '</strong></div>';
      }).join('') + '</div><section class="panel"><h2 class="h4">Ringkasan Operasional</h2>' +
        '<p>Data berasal dari transaksi tersimpan, bukan contoh.</p>' +
        '<p>Refund dibayar: ' + rupiah(kpi.refunds) + '</p>' +
        '<p>Ongkir ke kurir bukan kas toko. Sisa kas bukan laba.</p>' +
        '<button class="btn btn-green" id="refresh-admin" type="button">Perbarui Data</button></section>';
    } else if (page === 'Pesanan') {
      renderOrders();
    } else if (page === 'Pengaturan') {
      renderSettings();
    } else if (page === 'Laporan') {
      renderReportForm();
    } else if (page === 'Backup') {
      body.innerHTML = '<section class="panel"><h2>Backup Privat</h2>' +
        '<p>Menyalin database dan berkas ke BACKUP. Tidak menimpa atau menghapus produksi.</p>' +
        '<p>Untuk data besar, runtime Google dapat habis; periksa BackupLog sebelum menyatakan berhasil.</p>' +
        '<button class="btn btn-primary" id="backup" type="button">Buat Backup</button>' +
        '<hr><h3 class="h5">Pulihkan ke Staging</h3><form id="restore-form">' +
        field('ID folder backup selesai', 'folderId', '') +
        field('Ketik RESTORE KE STAGING', 'confirmation', '') +
        '<button class="btn btn-outline-dark" type="submit">Buat Salinan Pemulihan</button>' +
        '</form></section>';
    } else {
      renderMaster(page);
    }
  }

  function renderOrders() {
    const body = document.getElementById('admin-body');
    body.innerHTML = '<section class="panel"><h2>Pesanan</h2><div class="row g-2 mb-3">' +
      '<div class="col-sm-6"><input id="order-search" class="form-control" placeholder="Cari nomor/nama/HP" aria-label="Cari pesanan"></div>' +
      '<div class="col-sm-6"><select id="order-filter" class="form-select" aria-label="Status">' +
      '<option value="">Semua status</option>' +
      ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'COMPLETED', 'CANCELLED']
        .map(function (status) {
          return '<option>' + status + '</option>';
        }).join('') + '</select></div></div><div id="order-list"></div></section>';
    filterOrders();
  }

  function filterOrders() {
    const query = document.getElementById('order-search').value.toLowerCase();
    const status = document.getElementById('order-filter').value;
    const matching = (state.admin.tables.Orders || []).filter(function (order) {
      return [order.id, order.name, order.phone].join(' ').toLowerCase().includes(query) &&
        (!status || order.fulfillment === status);
    }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    const pageCount = Math.max(1, Math.ceil(matching.length / 20));
    state.listPage = Math.min(state.listPage, pageCount - 1);
    const orders = matching.slice(state.listPage * 20, (state.listPage + 1) * 20);
    document.getElementById('order-list').innerHTML =
      '<div class="table-wrap order-desktop"><table class="table"><thead><tr>' +
      '<th>Nomor</th><th>Pelanggan</th><th>Jadwal</th><th>Total</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>' + orders.map(function (order) {
        return '<tr><td>' + safe(order.id) + '</td><td>' + safe(order.name) +
          '</td><td>' + safe(order.date + ' ' + order.time) + '</td><td>' + rupiah(order.total) +
          '</td><td>' + safe(order.paymentStatus + ' / ' + order.fulfillment) +
          '</td><td><button class="btn btn-outline-dark" data-order="' + safe(order.id) +
          '" type="button">Detail</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="order-mobile">' +
      orders.map(function (order) {
        return '<article class="panel"><strong>' + safe(order.name) + '</strong><p class="text-break">' +
          safe(order.id) + '</p><p>' + safe(order.date + ' ' + order.time) +
          ' WITA</p><p>' + rupiah(order.total) + '</p><p>' +
          safe(order.paymentStatus + ' / ' + order.fulfillment) + '</p>' +
          '<button class="btn btn-outline-dark" data-order="' + safe(order.id) +
          '" type="button">Detail Pesanan</button></article>';
      }).join('') + '</div>' +
      '<div class="d-flex align-items-center gap-2 mt-3">' +
      '<button class="btn btn-outline-dark" id="previous-orders" type="button"' +
      (state.listPage === 0 ? ' disabled' : '') + '>Sebelumnya</button>' +
      '<span>' + (state.listPage + 1) + ' / ' + pageCount + '</span>' +
      '<button class="btn btn-outline-dark" id="next-orders" type="button"' +
      (state.listPage + 1 >= pageCount ? ' disabled' : '') + '>Berikutnya</button></div>';
  }

  function orderEditor(id) {
    const order = state.admin.tables.Orders.find(function (row) { return row.id === id; });
    const files = (state.admin.tables.Files || []).filter(function (row) { return row.orderId === id; });
    showEditor('Detail Pesanan', '<p class="text-break">' + safe(id) + '</p><p>' +
      safe(order.name + ' | ' + order.phone) + '</p><p>' + safe(order.address) + '</p>' +
      '<p>Total produk: ' + rupiah(order.total) + '</p><p>' +
      safe(order.paymentStatus + ' / ' + order.fulfillment) + '</p>' +
      '<p>Permintaan pembatalan: ' + safe(order.cancelReason || 'Tidak ada') + '</p>' +
      '<p>Refund: ' + rupiah(order.refundAmount) + ' — ' + safe(order.refundStatus) +
      '</p><p>Tenggat refund: ' + safe(order.refundDueAt || '-') + '</p>' +
      '<div class="d-flex gap-2 flex-wrap mb-3">' +
      files.map(function (file) {
        return '<button class="btn btn-outline-dark" data-file="' + safe(file.driveFileId) +
          '" type="button">Lihat ' + safe(file.kind) + '</button>';
      }).join('') + '<button class="btn btn-green" data-invoice="' + safe(id) +
      '" type="button">Invoice PDF</button></div><hr>' +
      '<form id="order-action-form" data-id="' + safe(id) + '">' +
      selectField('Tindakan', 'action', [
        ['verifyPayment', 'Verifikasi pembayaran dari transaksi masuk'],
        ['fulfillment', 'Ubah tahap pesanan'],
        ['cancelOrder', 'Konfirmasi pembatalan'],
        ['rejectCancellation', 'Tolak permintaan pembatalan'],
        ['refund', 'Catat refund yang sudah ditransfer'],
        ['shipping', 'Catat GoSend dan ongkir']
      ], '') +
      selectField('Tahap (untuk ubah tahap)', 'status', [
        ['CONFIRMED', 'Dikonfirmasi'], ['PREPARING', 'Mulai disiapkan'],
        ['READY', 'Siap'], ['DISPATCHED', 'Dikirim'], ['COMPLETED', 'Selesai']
      ], '') +
      selectField('Pihak pembatal (untuk pembatalan)', 'party', [
        ['CUSTOMER', 'Pelanggan'], ['STORE', 'Toko']
      ], '') +
      field('Nominal pembayaran / ongkir', 'amount', order.total, 'number', false) +
      field('Referensi transaksi / refund', 'reference', '', 'text', false) +
      field('Alasan (pembatalan / penolakan)', 'reason', '', 'text', false) +
      field('Nama kurir', 'courier', '', 'text', false) +
      field('Nomor/link pelacakan', 'tracking', '', 'text', false) +
      '<label class="d-block"><input type="checkbox" name="customerAgreed"> Ongkir telah disetujui pelanggan</label>' +
      '<label class="d-block mb-3"><input type="checkbox" name="feePaidToCourier"> Pelanggan mengonfirmasi ongkir sudah dibayar ke kurir</label>' +
      '<button class="btn btn-primary" type="submit">Jalankan Tindakan</button></form><hr>' +
      '<form id="handover-form" data-id="' + safe(id) + '">' +
      '<label class="form-label">Foto tanda terima</label>' +
      '<input type="file" name="photo" class="form-control mb-2" accept="image/jpeg,image/png,image/webp" required>' +
      '<button class="btn btn-outline-dark" type="submit">Unggah ke TANDATERIMA</button></form>');
  }

  // Form master dikonfigurasi per tabel agar tidak menampilkan password hash.
  function masterFields(table, row) {
    const products = (state.admin.tables.Products || []).map(function (item) {
      return [item.id, item.name];
    });
    let html = '';
    if (['Categories', 'Products', 'ServiceAreas', 'Users'].includes(table)) {
      html += field('Nama', 'name', row.name);
    }
    if (table === 'Products') {
      html += selectField('Kategori', 'categoryId',
        (state.admin.tables.Categories || []).map(function (item) {
          return [item.id, item.name];
        }), row.categoryId);
      html += field('Harga rupiah', 'price', row.price, 'number');
      html += field('Deskripsi', 'description', row.description, 'text', false);
    }
    if (['ReadyStock', 'PreorderCapacity', 'Discounts'].includes(table)) {
      html += selectField('Produk', 'productId', products, row.productId);
    }
    if (['ReadyStock', 'PreorderCapacity'].includes(table)) {
      html += field('Kapasitas total (termasuk yang ditahan/terpakai)', 'capacity', row.capacity, 'number');
    }
    if (table === 'PreorderCapacity') {
      html += field('Tanggal penerimaan', 'date', row.date, 'date');
    }
    if (['Discounts', 'Vouchers'].includes(table)) {
      html += selectField('Jenis potongan', 'type', [
        ['PERCENT', 'Persentase'], ['AMOUNT', 'Nominal rupiah']
      ], row.type);
      html += field('Nilai potongan', 'value', row.value, 'number');
      html += field('Mulai WITA', 'startsAt', toWitaInput(row.startsAt), 'datetime-local');
      html += field('Berakhir WITA', 'endsAt', toWitaInput(row.endsAt), 'datetime-local');
    }
    if (table === 'Vouchers') {
      html += field('Kode voucher', 'code', row.code);
      html += field('Minimum belanja', 'minimum', row.minimum || '0', 'number');
      html += field('Maksimum potongan (0 = tanpa batas tambahan)', 'maximum', row.maximum || '0', 'number');
      html += selectField('Jenis pesanan', 'orderType', [
        ['ALL', 'Semua'], ['DIRECT', 'Langsung'], ['PREORDER', 'Preorder']
      ], row.orderType);
    }
    if (table === 'ServiceHours') {
      html += selectField('Hari', 'weekday', [
        [0, 'Minggu'], [1, 'Senin'], [2, 'Selasa'], [3, 'Rabu'],
        [4, 'Kamis'], [5, 'Jumat'], [6, 'Sabtu']
      ], row.weekday);
      html += field('Jam buka WITA', 'opens', row.opens, 'time');
      html += field('Jam tutup WITA', 'closes', row.closes, 'time');
    }
    if (table === 'Users') {
      html += field('Username', 'username', row.username);
      html += selectField('Level', 'role', [
        ['Admin', 'Admin'], ['Operator', 'Operator'], ['Viewer', 'Viewer']
      ], row.role);
      html += field('Password sementara (isi untuk reset)', 'password', '', 'password', !row.id);
    }
    if (!['ReadyStock', 'PreorderCapacity'].includes(table)) {
      html += selectField('Aktif', 'active', [['true', 'Ya'], ['false', 'Tidak']],
        row.active === false || row.active === 'false' ? 'false' : 'true');
    }
    return html;
  }

  function toWitaInput(value) {
    if (!value) {
      return '';
    }
    return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16);
  }

  function renderMaster(table) {
    const rows = state.admin.tables[table] || [];
    const keys = rows.length ? Object.keys(rows[0]).filter(function (key) {
      return !['id', 'photoFileId', 'updatedAt', 'mustChangePassword'].includes(key);
    }) : [];
    document.getElementById('admin-body').innerHTML = '<section class="panel">' +
      '<div class="d-flex justify-content-between gap-2 mb-3"><h2 class="h4">' +
      safe(tableLabels[table]) + '</h2><button class="btn btn-primary" data-new="' +
      safe(table) + '" type="button">Tambah</button></div>' +
      '<input class="form-control mb-3" id="master-search" placeholder="Cari data..." aria-label="Cari data">' +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      keys.map(function (key) { return '<th>' + safe(key) + '</th>'; }).join('') +
      '<th>Aksi</th></tr></thead><tbody id="master-rows">' +
      rows.map(function (row) {
        return '<tr>' + keys.map(function (key) {
          const product = (state.admin.tables.Products || []).find(function (item) {
            return item.id === row[key];
          });
          return '<td>' + safe(product ? product.name : row[key]) + '</td>';
        }).join('') + '<td><button class="btn btn-outline-dark" data-edit="' +
          safe(row.id) + '" data-table="' + safe(table) + '" type="button">Edit</button>' +
          (table === 'Products' ? ' <button class="btn btn-outline-dark" data-product-upload="' +
          safe(row.id) + '" type="button">Foto</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (!rows.length ? '<p>Belum ada data. Tambahkan data aktual toko.</p>' : '') + '</section>';
  }

  function editMaster(table, id) {
    const row = (state.admin.tables[table] || []).find(function (item) { return item.id === id; }) || {};
    showEditor((id ? 'Edit ' : 'Tambah ') + tableLabels[table],
      '<form id="master-form" data-table="' + safe(table) + '" data-id="' + safe(id || '') + '">' +
      masterFields(table, row) +
      '<button class="btn btn-primary" type="submit">Simpan</button></form>');
  }

  function renderSettings() {
    const config = state.admin.settings;
    const labels = {
      storeName: 'Nama toko', address: 'Alamat toko', contact: 'Kontak',
      bankInstructions: 'Instruksi rekening / QRIS',
      intervalMinutes: 'Interval waktu (menit)', preparationMinutes: 'Minimal persiapan (menit)',
      sessionIdleMinutes: 'Sesi tidak aktif (menit)', sessionMaxHours: 'Maksimum sesi (jam)',
      uploadMaxBytes: 'Maksimum upload (byte; maksimal 5242880)',
      backupRetentionDays: 'Target retensi backup (hari; penghapusan manual)',
      maxVouchersPerOrder: 'Voucher per pesanan (1)'
    };
    let html = Object.keys(labels).map(function (key) {
      return field(labels[key], key, config[key], 'text', false);
    }).join('');
    ['discountRounding', 'refundRounding'].forEach(function (key) {
      html += selectField(key === 'discountRounding' ? 'Pembulatan diskon' : 'Pembulatan refund',
        key, [['', 'Pilih aturan'], ['NEAREST', 'Rupiah terdekat'], ['UP', 'Ke atas'], ['DOWN', 'Ke bawah']],
        config[key]);
    });
    html += selectField('Dukungan ongkir langsung ke kurir GoSend sudah diverifikasi',
      'deliveryVerified', [['false', 'Belum'], ['true', 'Sudah']], config.deliveryVerified);
    html += selectField('Buka pemesanan', 'ordersEnabled', [
      ['false', 'Tutup'], ['true', 'Buka']
    ], config.ordersEnabled);
    document.getElementById('admin-body').innerHTML = '<section class="panel">' +
      '<h2>Pengaturan</h2><form id="settings-form">' + html +
      '<button class="btn btn-primary" type="submit">Simpan Pengaturan</button></form>' +
      '<hr><h3 class="h5">Logo dan QRIS</h3><form id="store-asset-form">' +
      selectField('Jenis aset', 'asset', [
        ['logoFileId', 'Logo toko'], ['qrisFileId', 'QRIS pembayaran']
      ], '') + '<input class="form-control mb-3" type="file" name="photo" ' +
      'accept="image/jpeg,image/png,image/webp" required>' +
      '<button class="btn btn-outline-dark" type="submit">Unggah Aset Toko</button></form></section>';
  }

  function renderReportForm() {
    document.getElementById('admin-body').innerHTML = '<section class="panel"><h2>Laporan</h2>' +
      '<form id="report-form"><div class="row"><div class="col-sm-6">' +
      field('Dari tanggal WITA', 'from', '', 'date', false) +
      '</div><div class="col-sm-6">' + field('Sampai tanggal WITA', 'to', '', 'date', false) +
      '</div></div>' + selectField('Jenis pesanan', 'type', [
        ['', 'Semua'], ['DIRECT', 'Langsung'], ['PREORDER', 'Preorder']
      ], '') + selectField('Kategori (seluruh pesanan yang memuat kategori)', 'categoryId', [
        ['', 'Semua'],
        ...(state.admin.tables.Categories || []).map(function (row) { return [row.id, row.name]; })
      ], '') + selectField('Status pesanan', 'status', [
        ['', 'Semua'],
        ...['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'COMPLETED', 'CANCELLED']
          .map(function (status) { return [status, status]; })
      ], '') + '<button class="btn btn-green" type="submit">Tampilkan</button></form>' +
      '<div id="report-result" class="mt-4"></div></section>';
  }

  function renderReport() {
    const report = state.report;
    const keys = report.rows.length ? Object.keys(report.rows[0]) : [];
    document.getElementById('report-result').innerHTML =
      '<p>Pembayaran: ' + rupiah(report.summary.payments) +
      ' | Refund: ' + rupiah(report.summary.refunds) + '</p>' +
      '<p class="small">Periode berdasarkan tanggal pesanan WITA. Pembayaran/refund ' +
      'adalah yang tercatat sampai saat laporan dibuka. Sisa kas bukan laba.</p>' +
      '<div class="d-flex gap-2 mb-3"><button class="btn btn-primary" id="export-xlsx" ' +
      'type="button">Excel .xlsx</button><button class="btn btn-outline-dark" id="export-pdf" ' +
      'type="button">PDF</button></div><div class="table-wrap"><table class="table"><thead><tr>' +
      keys.map(function (key) { return '<th>' + safe(key) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + report.rows.map(function (row) {
        return '<tr>' + keys.map(function (key) { return '<td>' + safe(row[key]) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  // Pustaka ekspor dimuat saat dibutuhkan, bukan saat katalog dibuka.
  const loadedScripts = {};
  function loadScript(url) {
    if (!loadedScripts[url]) {
      loadedScripts[url] = new Promise(function (resolve, reject) {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = function () {
          delete loadedScripts[url];
          reject(new Error('Pustaka ekspor gagal dimuat.'));
        };
        document.head.appendChild(script);
      });
    }
    return loadedScripts[url];
  }

  async function exportXlsx() {
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    const rows = state.report.rows.map(function (row) {
      const result = {};
      Object.keys(row).forEach(function (key) {
        const value = row[key];
        result[key] = typeof value === 'string' && /^[=+\-@]/.test(value)
          ? "'" + value : value;
      });
      return result;
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Pesanan');
    XLSX.utils.book_append_sheet(
      workbook, XLSX.utils.json_to_sheet([state.report.summary]), 'Ringkasan'
    );
    XLSX.writeFile(workbook, 'Healthy-Vibes-Laporan.xlsx');
  }

  async function exportPdf() {
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js');
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape' });
    pdf.text('Healthy Vibes - Laporan Pesanan', 14, 16);
    const keys = state.report.rows.length ? Object.keys(state.report.rows[0]) : ['Tidak ada data'];
    pdf.autoTable({
      startY: 24,
      head: [keys],
      body: state.report.rows.map(function (row) { return keys.map(function (key) { return row[key]; }); }),
      styles: { fontSize: 7, overflow: 'linebreak' },
      headStyles: { fillColor: [6, 91, 85] },
      didDrawPage: function (data) {
        pdf.text('Halaman ' + data.pageNumber, 14, 200);
      }
    });
    pdf.save('Healthy-Vibes-Laporan.pdf');
  }

  // Gambar dikecilkan sebelum upload; server tetap memeriksa isi dan ukuran.
  async function photoData(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Pilih gambar JPG, PNG, atau WebP.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Gambar maksimal 5 MB sebelum optimasi.');
    }
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const encoded = canvas.toDataURL('image/jpeg', 0.85);
    return { mimeType: 'image/jpeg', base64: encoded.split(',')[1] };
  }

  function saveDownload(file) {
    const bytes = Uint8Array.from(atob(file.base64), function (value) {
      return value.charCodeAt(0);
    });
    saveBlob(new Blob([bytes], { type: file.mimeType }), file.name);
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  // Event delegation menjaga tombol tetap aktif setelah render ulang.
  document.addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) {
      return;
    }
    clickAction(button).catch(function (error) { notify(error.message, true); });
  });

  async function clickAction(button) {
    if (button.dataset.nav) {
      return navigate(button.dataset.nav);
    }
    if (button.dataset.type) {
      state.type = button.dataset.type;
      state.cart = {};
      state.quote = null;
      state.requestId = '';
      return loadCatalog();
    }
    if (button.dataset.add || button.dataset.minus) {
      const id = button.dataset.add || button.dataset.minus;
      const product = state.catalog.products.find(function (row) { return row.id === id; });
      const quantity = (state.cart[id] || 0) + (button.dataset.add ? 1 : -1);
      if (quantity > product.available) {
        throw new Error('Ketersediaan produk tidak mencukupi.');
      }
      if (quantity <= 0) {
        delete state.cart[id];
      } else {
        state.cart[id] = quantity;
      }
      state.requestId = '';
      renderShop();
      return;
    }
    if (button.dataset.adminPage) {
      state.adminPage = button.dataset.adminPage;
      state.listPage = 0;
      renderAdmin();
      return;
    }
    if (button.dataset.new || button.dataset.edit) {
      editMaster(button.dataset.new || button.dataset.table, button.dataset.edit);
      return;
    }
    if (button.dataset.order) {
      orderEditor(button.dataset.order);
      return;
    }
    if (button.dataset.file || button.dataset.invoice) {
      saveDownload(await rpc('download', {
        fileId: button.dataset.file,
        orderId: button.dataset.invoice,
        kind: button.dataset.invoice ? 'INVOICE' : 'FILE'
      }));
      return;
    }
    if (button.dataset.productUpload) {
      showEditor('Foto Produk', '<form id="product-photo-form" data-id="' +
        safe(button.dataset.productUpload) + '"><input type="file" name="photo" ' +
        'class="form-control mb-3" accept="image/jpeg,image/png,image/webp" required>' +
        '<button class="btn btn-primary" type="submit">Simpan di PRODUK</button></form>');
      return;
    }
    const id = button.id;
    if (id === 'close-editor') {
      dialog.close();
    } else if (id === 'checkout-button') {
      await startCheckout();
    } else if (id === 'mobile-cart-button') {
      showEditor('Keranjang', renderCart());
    } else if (id === 'checkout-back') {
      if (state.checkoutStep > 1) {
        state.checkoutStep -= 1;
        renderCheckout();
      } else {
        renderShop();
      }
    } else if (id === 'refresh-order') {
      state.order = await rpc('orderStatus', {
        orderId: state.order.id, accessToken: state.accessToken
      });
      renderOrder();
    } else if (id === 'download-invoice') {
      saveDownload(await rpc('customerInvoice', {
        orderId: state.order.id, accessToken: state.accessToken
      }));
    } else if (id === 'save-access') {
      saveBlob(new Blob([
        'Healthy Vibes\nNomor pesanan: ' + state.order.id +
        '\nKunci akses privat: ' + state.accessToken +
        '\nJangan bagikan kunci ini kepada orang lain.'
      ], { type: 'text/plain' }), 'Akses-Pesanan-Healthy-Vibes.txt');
    } else if (id === 'change-password') {
      passwordDialog();
    } else if (id === 'logout') {
      await rpc('logout');
      state.token = '';
      state.user = null;
      state.admin = null;
      renderLogin();
    } else if (id === 'refresh-admin') {
      await loadAdmin();
    } else if (id === 'previous-orders' || id === 'next-orders') {
      state.listPage += id === 'next-orders' ? 1 : -1;
      filterOrders();
    } else if (id === 'backup') {
      if (confirm('Buat salinan privat database dan seluruh berkas?')) {
        const result = await rpc('backup');
        notify('Backup selesai: ' + result.folderUrl);
      }
    } else if (id === 'export-xlsx') {
      await exportXlsx();
    } else if (id === 'export-pdf') {
      await exportPdf();
    }
  }

  document.addEventListener('input', function (event) {
    if (['product-search', 'category-filter'].includes(event.target.id)) {
      renderProducts();
    } else if (['order-search', 'order-filter'].includes(event.target.id)) {
      state.listPage = 0;
      filterOrders();
    } else if (event.target.id === 'master-search') {
      const query = event.target.value.toLowerCase();
      document.querySelectorAll('#master-rows tr').forEach(function (row) {
        row.hidden = !row.textContent.toLowerCase().includes(query);
      });
    }
  });

  // Tombol submit dikunci selama request agar klik ganda tidak membuat dua operasi.
  document.addEventListener('submit', async function (event) {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) {
      return;
    }
    submit.disabled = true;
    try {
      await submitAction(form);
    } catch (error) {
      notify(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  async function submitAction(form) {
    const data = formData(form);
    if (form.id === 'checkout-form') {
      await submitCheckout(form);
    } else if (form.id === 'status-form') {
      state.order = await rpc('orderStatus', data);
      state.accessToken = data.accessToken;
      renderOrder();
    } else if (form.id === 'login-form') {
      const result = await rpc('login', data);
      state.token = result.token;
      state.user = result.user;
      form.reset();
      if (result.user.mustChangePassword) {
        passwordDialog();
      } else {
        await loadAdmin();
      }
    } else if (form.id === 'password-form') {
      await rpc('changePassword', data);
      state.token = '';
      state.user = null;
      dialog.close();
      renderLogin();
      notify('Password diganti. Silakan login kembali.');
    } else if (form.id === 'cancel-form') {
      if (confirm('Ajukan pembatalan untuk diperiksa pengelola?')) {
        await rpc('cancelRequest', {
          orderId: state.order.id, accessToken: state.accessToken, reason: data.reason
        });
        notify('Permintaan dikirim. Pesanan belum dibatalkan.');
      }
    } else if (['proof-form', 'handover-form', 'product-photo-form'].includes(form.id)) {
      const photo = await photoData(form.elements.photo.files[0]);
      const customer = form.id === 'proof-form';
      await rpc(customer ? 'customerUpload' : 'upload', Object.assign({}, photo, {
        requestId: crypto.randomUUID(),
        kind: customer ? 'STRUK' : form.id === 'handover-form' ? 'TANDATERIMA' : 'PRODUK',
        orderId: customer ? state.order.id : form.id === 'handover-form' ? form.dataset.id : '',
        productId: form.id === 'product-photo-form' ? form.dataset.id : '',
        accessToken: customer ? state.accessToken : ''
      }));
      notify('Berkas tersimpan privat. Bukti transfer tidak otomatis melunasi pesanan.');
      if (!customer) {
        dialog.close();
        await loadAdmin();
      }
    } else if (form.id === 'master-form') {
      data.id = form.dataset.id;
      data.active = data.active !== 'false';
      ['startsAt', 'endsAt'].forEach(function (key) {
        if (data[key]) {
          data[key] = new Date(data[key] + ':00+08:00').toISOString();
        }
      });
      await rpc('saveMaster', { table: form.dataset.table, record: data });
      dialog.close();
      await loadAdmin();
      notify('Data disimpan.');
    } else if (form.id === 'settings-form') {
      await rpc('saveSettings', { values: data });
      await loadAdmin();
      notify('Pengaturan disimpan.');
    } else if (form.id === 'store-asset-form') {
      const photo = await photoData(form.elements.photo.files[0]);
      await rpc('uploadStoreAsset', Object.assign({}, photo, { asset: data.asset }));
      await loadAdmin();
      notify('Aset toko tersimpan di PRODUK.');
    } else if (form.id === 'order-action-form') {
      if (!confirm('Jalankan tindakan ini pada pesanan?')) {
        return;
      }
      data.orderId = form.dataset.id;
      data.fee = data.amount;
      data.customerAgreed = data.customerAgreed === 'on';
      data.feePaidToCourier = data.feePaidToCourier === 'on';
      await rpc(data.action, data);
      dialog.close();
      await loadAdmin();
      notify('Tindakan berhasil dicatat.');
    } else if (form.id === 'report-form') {
      state.report = await rpc('report', data);
      renderReport();
    } else if (form.id === 'restore-form') {
      const result = await rpc('restoreStaging', data);
      notify('Salinan staging dibuat; produksi tidak diubah. ' + result.databaseUrl);
    }
  }

  // Menangani halaman sebelum instalasi dengan pesan nyata, bukan data contoh.
  navigate('shop').catch(function (error) {
    app.innerHTML = '<section class="panel"><h1>Healthy Vibes</h1>' +
      '<p>Aplikasi belum terhubung ke database yang terpasang.</p>' +
      '<p>Isi URL API pada js/config.js dan pasang backend sesuai panduan.</p>' +
      '<button class="btn btn-primary" data-nav="shop" type="button">' +
      'Coba Hubungkan Lagi</button></section>';
    notify(error.message, true);
  });
