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
  // Semua tombol memakai pembuat ikon dan teks yang sama.
  const buttonLabel = window.HV_UI.label;
  const adminViewport = window.matchMedia('(max-width: 1050px)');

  // Menu pengelola terbuka di desktop dan ringkas saat berpindah ke layar kecil.
  adminViewport.addEventListener('change', function (event) {
    const navigation = document.getElementById('admin-navigation');
    if (navigation) { navigation.open = !event.matches; }
  });

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

  // Menampilkan nominal uang dalam format Rupiah tanpa angka desimal.
  function rupiah(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  // Mengubah tanggal yyyy-MM-dd menjadi DD/MM/YYYY untuk dibaca pengguna.
  function dateText(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] : String(value || '');
  }

  // Menampilkan tanggal dan jam 24 jam berdasarkan zona waktu WITA.
  function dateTimeText(value) {
    if (!value) { return ''; }
    const date = new Date(value);
    if (isNaN(date.getTime())) { return String(value); }
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Makassar', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    const get = function (name) { return parts.find(function (part) { return part.type === name; }).value; };
    return get('day') + '/' + get('month') + '/' + get('year') +
      ' ' + get('hour') + ':' + get('minute');
  }

  // Mengubah nilai tabel menjadi label hari, Ya/Tidak, atau tanggal yang mudah dibaca.
  function masterText(key, value) {
    if (key === 'weekday' && value !== '') {
      return ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][Number(value)] ?? value;
    }
    if (key === 'active') { return value === true || value === 'true' ? 'Ya' : 'Tidak'; }
    if (key === 'date') { return dateText(value); }
    return /(?:At|Deadline)$/.test(key) ? dateTimeText(value) : value;
  }

  // Loading dihitung agar request foto bersamaan tidak mematikan indikator lebih awal.
  let pending = 0;
  // Mengirim tindakan ke backend dan memeriksa hasil sambil menampilkan Memproses.
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

  // Menampilkan pesan sukses atau kesalahan di area notifikasi halaman.
  function notify(message, error) {
    const element = document.getElementById('notification');
    element.innerHTML = '<div class="alert ' +
      (error ? 'alert-danger' : 'alert-success') + '">' + safe(message) + '</div>';
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Membuat input beserta label, nilai awal, dan aturan pengisian.
  function field(label, name, value, type, required) {
    const minimum = ['username', 'password', 'newPassword'].includes(name)
      ? ' minlength="6"' : '';
    // Input teks menjaga tampilan 24 jam, terlepas dari bahasa browser.
    const clock = type === 'time';
    const clockAttributes = clock
      ? ' placeholder="HH:mm" maxlength="5" pattern="([01][0-9]|2[0-3]):[0-5][0-9]"' +
        ' title="Format 24 jam, misalnya 08:00 atau 17:00"'
      : '';
    const dateClock = type === 'datetime-local';
    const dateClockAttributes = dateClock
      ? ' placeholder="DD/MM/YYYY HH:mm" maxlength="16"' +
        ' pattern="[0-9]{2}/[0-9]{2}/[0-9]{4} ([01][0-9]|2[0-3]):[0-5][0-9]"' +
        ' title="Tanggal dan jam WITA, misalnya 02/11/2026 17:00"'
      : '';
    return '<div class="mb-3"><label class="form-label" for="f-' + name + '">' +
      safe(label) + '</label><input class="form-control" id="f-' + name +
      '" name="' + name + '" type="' + (clock || dateClock ? 'text' : type || 'text') + '" value="' +
      safe(value || '') + '"' + minimum + clockAttributes + dateClockAttributes +
      (required === false ? '' : ' required') + '></div>';
  }

  // Membuat daftar pilihan dan memilih nilai awal yang sesuai.
  function selectField(label, name, options, value) {
    return '<div class="mb-3"><label class="form-label" for="f-' + name + '">' +
      safe(label) + '</label><select class="form-select" id="f-' + name +
      '" name="' + name + '">' + options.map(function (option) {
        return '<option value="' + safe(option[0]) + '"' +
          (String(option[0]) === String(value) ? ' selected' : '') + '>' +
          safe(option[1]) + '</option>';
      }).join('') + '</select></div>';
  }

  // Mengambil isian formulir menjadi data yang siap diproses.
  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  // Membuka dialog berisi judul dan formulir atau detail yang diperlukan.
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

  // Berpindah halaman internal, menutup menu HP, dan menandai navigasi aktif.
  async function navigate(page) {
    state.page = page;
    document.querySelector('.site-header').classList.remove('menu-open');
    document.getElementById('nav-toggle').setAttribute('aria-expanded', 'false');
    document.querySelectorAll('.site-header [data-nav]').forEach(function (button) {
      if (button.dataset.nav === page) { button.setAttribute('aria-current', 'page'); }
      else { button.removeAttribute('aria-current'); }
    });
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

  // Mengambil katalog terbaru untuk pesanan langsung atau preorder dari backend.
  async function loadCatalog() {
    state.catalog = await rpc('catalog', { type: state.type });
    renderShop();
  }

  // Menggabungkan jumlah di keranjang dengan data produk yang tersedia di katalog.
  function cartLines() {
    return Object.entries(state.cart).map(function (entry) {
      const product = state.catalog.products.find(function (row) {
        return row.id === entry[0];
      });
      return product ? { product: product, quantity: entry[1] } : null;
    }).filter(Boolean);
  }

  // Menghitung perkiraan total produk di keranjang sebelum validasi server.
  function cartSummary() {
    const lines = cartLines();
    const total = lines.reduce(function (sum, item) {
      return sum + item.product.unitPrice * item.quantity;
    }, 0);
    return { lines: lines, total: total };
  }

  // Menyusun tampilan isi keranjang, pengubah jumlah, total, dan tombol checkout.
  function renderCart() {
    const summary = cartSummary();
    return '<h2 class="editorial h4">Keranjang Anda</h2>' +
      (summary.lines.length ? summary.lines.map(function (item) {
        return '<div class="border-bottom py-2">' +
          '<div>' + safe(item.product.name) + '</div>' +
          '<div class="d-flex justify-content-between align-items-center gap-2">' +
          '<span>' + rupiah(item.product.unitPrice) + '</span>' +
          '<div><button class="btn btn-sm btn-outline-dark" data-minus="' +
          safe(item.product.id) + '" type="button">' + buttonLabel('minus', 'Kurangi') + '</button> ' + item.quantity +
          ' <button class="btn btn-sm btn-outline-dark" data-add="' +
          safe(item.product.id) + '" type="button">' + buttonLabel('plus', 'Tambah') + '</button></div></div></div>';
      }).join('') : '<p class="text-secondary">Belum ada produk.</p>') +
      '<p class="mt-3"><strong>Total produk: ' + rupiah(summary.total) + '</strong></p>' +
      '<p class="small text-secondary">Ongkir dikonfirmasi terpisah. ' +
      'Keranjang belum menahan stok.</p>' +
      '<button class="btn btn-primary w-100" id="checkout-button" type="button"' +
      (!summary.lines.length ? ' disabled' : '') + '>' + buttonLabel('cart', 'Lanjut Checkout') + '</button>';
  }

  // Menampilkan banner, pilihan jenis pesanan, pencarian produk, dan keranjang.
  function renderShop() {
    const catalog = state.catalog;
    // Foto dan logo memakai aset yang diberikan pemilik, bukan gambar contoh.
    app.innerHTML = '<section class="hero shop-hero" aria-labelledby="shop-title">' +
      '<img class="hero-image" src="image/Header_HealthyVibes.jpg" alt="Wafel dengan stroberi dan secangkir teh" fetchpriority="high" decoding="async">' +
      '<div class="hero-copy"><span class="hero-eyebrow">HEALTHY VIBES / PILIHAN SEHAT</span>' +
      '<h1 id="shop-title">Pilihan sehat,<br>untuk hari yang <span>lebih baik.</span></h1>' +
      '<p>Pesan langsung atau rencanakan menu sehat Anda untuk besok.</p>' +
      '<a class="btn btn-primary hero-action" href="#menu-section">' + buttonLabel('menu', 'Lihat Katalog') + '</a>' +
      '<div class="shop-layout"><section>' +
      '<div id="menu-section" class="menu-heading"><span class="section-eyebrow">MENU HEALTHY VIBES</span>' +
      '<h2>Temukan pilihan favorit Anda</h2><p>Pilih menu dan waktu penerimaan sesuai kebutuhan Anda.</p></div>' +
      '<div class="order-type d-flex gap-2 mb-3 flex-wrap">' +
      '<button class="btn ' + (state.type === 'DIRECT' ? 'btn-green' : 'btn-outline-dark') +
      '" data-type="DIRECT" type="button">' + buttonLabel('cart', 'Pesanan Langsung') + '</button>' +
      '<button class="btn ' + (state.type === 'PREORDER' ? 'btn-green' : 'btn-outline-dark') +
      '" data-type="PREORDER" type="button">' + buttonLabel('calendar', 'Preorder Besok') + '</button></div>' +
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
      buttonLabel('cart', 'Keranjang & Checkout') + '</button></div>';
    renderProducts();
  }

  // Menampilkan produk sesuai pencarian/kategori dan memuat foto unggahan aktual.
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
          (product.available < 1 ? ' disabled' : '') + '>' + buttonLabel('plus', 'Tambah') + '</button></div></article>';
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

  // Memulai checkout dan menyiapkan ID permintaan serta kunci akses privat pesanan.
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

  // Menggabungkan data penerima, jadwal, produk, dan kunci akses untuk dikirim ke server.
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

  // Menampilkan langkah penerima, pembayaran, atau tinjauan beserta ringkasan belanja.
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
        '<p>Tanggal: <strong>' + safe(dateText(schedule.date)) + '</strong> WITA</p>' +
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
        ' | ' + safe(dateText(schedule.date) + ' ' + recipient.time) + ' WITA</p>' +
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
      'type="button">' + buttonLabel('back', 'Kembali') + '</button><button class="btn btn-primary" type="submit"' +
      (step === 1 && !schedule.times.length ? ' disabled' : '') + '>' +
      buttonLabel(step === 3 ? 'check' : 'next', step === 3 ? 'Buat Pesanan' : 'Lanjut') + '</button></div></form></section>' +
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

  // Menyimpan isian tiap langkah, memeriksa harga di server, lalu membuat pesanan.
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

  // Menampilkan formulir pengecekan pesanan dengan nomor dan kunci akses privat.
  function renderStatusForm() {
    app.innerHTML = '<section class="panel mx-auto" style="max-width:650px">' +
      '<h1 class="h2">Status Pesanan</h1><p>Nomor pesanan saja tidak cukup. ' +
      'Masukkan kunci akses privat yang Anda terima setelah memesan.</p>' +
      '<form id="status-form">' + field('Nomor pesanan', 'orderId', state.order?.id) +
      field('Kunci akses privat', 'accessToken', state.accessToken) +
      '<button class="btn btn-primary" type="submit">' + buttonLabel('eye', 'Lihat Pesanan') + '</button></form></section>';
  }

  // Menampilkan detail pesanan, status, unduhan invoice, dan formulir bukti/pembatalan.
  function renderOrder() {
    const order = state.order;
    app.innerHTML = '<section class="panel mx-auto" style="max-width:850px">' +
      '<h1 class="h2">Pesanan Anda</h1><p class="text-break"><strong>' + safe(order.id) +
      '</strong></p><div class="alert alert-warning">Simpan kunci akses berikut secara privat. ' +
      'Kunci ini memberikan akses pesanan.<br><code class="text-break">' +
      safe(state.accessToken) + '</code></div><p>Pembayaran: <span class="status-tag">' +
      safe(order.paymentStatus) + '</span> | Pemenuhan: <span class="status-tag">' +
      safe(order.fulfillment) + '</span></p>' +
      '<p>' + safe(dateText(order.date) + ' ' + order.time) + ' WITA</p>' +
      order.items.map(function (item) {
        return '<p>' + safe(item.name) + ' x ' + item.quantity + ' — ' +
          rupiah(item.unitPrice) + '</p>';
      }).join('') + '<h2 class="h4">Total produk ' + rupiah(order.total) + '</h2>' +
      '<p>Batas pembayaran: ' + (order.paymentDeadline
        ? safe(dateTimeText(order.paymentDeadline)) +
        ' WITA' : 'Sebelum dikirim; langsung ambil dapat bayar saat diambil.') +
      '</p><p>Refund: ' + safe(order.refundStatus) + ' ' + rupiah(order.refundAmount) +
      '</p><div class="d-flex gap-2 flex-wrap"><button class="btn btn-outline-dark" ' +
      'id="refresh-order" type="button">' + buttonLabel('refresh', 'Perbarui Status') + '</button>' +
      '<button class="btn btn-green" id="download-invoice" type="button">' + buttonLabel('download', 'Unduh Invoice PDF') + '</button>' +
      '<button class="btn btn-outline-dark" id="save-access" type="button">' + buttonLabel('key', 'Unduh Kunci Akses') + '</button>' +
      '</div>' + (order.fulfillment !== 'CANCELLED' ? '<form id="proof-form" class="mt-4">' +
      '<label class="form-label">Struk bukti transfer (JPG/PNG/WebP)</label>' +
      '<input class="form-control mb-2" type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>' +
      '<button class="btn btn-primary" type="submit">' + buttonLabel('upload', 'Unggah Bukti Transfer') + '</button></form>' : '') +
      (!order.preparedAt && !['CANCELLED', 'COMPLETED'].includes(order.fulfillment)
        ? '<form id="cancel-form" class="mt-4">' + field('Alasan pembatalan', 'reason', '') +
        '<button class="btn btn-outline-danger" type="submit">' + buttonLabel('close', 'Ajukan Pembatalan') + '</button></form>'
        : '') + '</section>';
  }

  // Menampilkan formulir login pengelola menggunakan username dan password.
  function renderLogin() {
    app.innerHTML = '<div class="row g-4 align-items-center mx-auto" style="max-width:960px">' +
      '<div class="col-md-6"><section class="hero"><h1>Kelola toko,<br>dengan lebih teratur.</h1>' +
      '<p>Akses sesuai level Admin, Operator, atau Viewer.</p></section></div>' +
      '<div class="col-md-6"><section class="panel"><h2>Login Pengelola</h2>' +
      '<form id="login-form">' + field('Username (minimal 6 karakter)', 'username', '') +
      field('Password', 'password', '', 'password') +
      '<button class="btn btn-primary" type="submit">' + buttonLabel('login', 'Masuk') + '</button></form>' +
      '<p class="small mt-3">Lupa password? Hubungi Admin untuk reset password sementara.</p>' +
      '</section></div></div>';
  }

  // Membuka formulir penggantian password pengelola.
  function passwordDialog() {
    showEditor('Ganti Password', '<form id="password-form">' +
      field('Password saat ini', 'currentPassword', '', 'password') +
      field('Password baru (minimal 6 karakter)', 'newPassword', '', 'password') +
      '<p>Semua sesi akan dicabut; masuk kembali setelah perubahan.</p>' +
      '<button class="btn btn-primary" type="submit">' + buttonLabel('save', 'Simpan Password') + '</button></form>');
  }

  // Mengambil data pengelola terbaru sesuai hak akses akun yang sedang login.
  async function loadAdmin() {
    state.admin = await rpc('adminData');
    state.user = state.admin.user;
    renderAdmin();
  }

  // Menentukan menu yang ditampilkan untuk Admin, Operator, atau Viewer.
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

  // Nama tabel backend diterjemahkan menjadi judul menu berbahasa Indonesia.
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

  // Ikon khusus membantu membedakan menu pengelola tanpa mengubah hak akses.
  const adminIcons = {
    Dashboard: 'dashboard', Pesanan: 'orders', Categories: 'categories',
    Products: 'product', ReadyStock: 'stock', PreorderCapacity: 'calendar',
    Discounts: 'tag', Vouchers: 'voucher', Users: 'users', ServiceHours: 'clock',
    ServiceAreas: 'location', Pengaturan: 'settings', Backup: 'backup', Laporan: 'report'
  };

  // Menampilkan panel pengelola dan isi menu yang sedang dipilih.
  function renderAdmin() {
    const page = state.adminPage;
    app.innerHTML = '<div class="admin-toolbar mb-3">' +
      '<div><h1 class="h2 mb-1">Panel Pengelola</h1><p class="admin-account mb-0">' + safe(state.user.name) +
      ' (' + safe(state.user.role) + ')</p></div><div class="admin-actions">' +
      '<button class="btn btn-outline-dark" id="change-password" type="button">' + buttonLabel('key', 'Password') + '</button>' +
      '<button class="btn btn-outline-dark" id="logout" type="button">' + buttonLabel('logout', 'Keluar') + '</button></div></div>' +
      '<div class="admin-layout"><details class="admin-navigation" id="admin-navigation"' +
      (adminViewport.matches ? '' : ' open') + '><summary class="admin-menu-toggle">' +
      '<span class="admin-menu-title">' + buttonLabel('menu', 'Menu Pengelola') +
      '<span class="admin-menu-current">' + safe(tableLabels[page] || page) + '</span></span>' +
      window.HV_UI.icon('chevron') + '</summary><nav class="admin-nav" aria-label="Menu pengelola">' +
      adminMenu().map(function (name) {
        return '<button class="btn ' + (page === name ? 'selected' : '') +
          '" data-admin-page="' + safe(name) + '" type="button"' +
          (page === name ? ' aria-current="page"' : '') + '>' +
          buttonLabel(adminIcons[name], tableLabels[name] || name) + '</button>';
      }).join('') + '</nav></details><section id="admin-body"></section></div>';
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
        '<button class="btn btn-green" id="refresh-admin" type="button">' + buttonLabel('refresh', 'Perbarui Data') + '</button></section>';
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
        '<button class="btn btn-primary" id="backup" type="button">' + buttonLabel('backup', 'Buat Backup') + '</button>' +
        '<hr><h3 class="h5">Pulihkan ke Staging</h3><form id="restore-form">' +
        field('ID folder backup selesai', 'folderId', '') +
        field('Ketik RESTORE KE STAGING', 'confirmation', '') +
        '<button class="btn btn-outline-dark" type="submit">' + buttonLabel('restore', 'Buat Salinan Pemulihan') + '</button>' +
        '</form></section>';
    } else {
      renderMaster(page);
    }
  }

  // Menyiapkan pencarian, filter status, dan tempat daftar pesanan pengelola.
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

  // Menyaring pesanan, mengurutkan yang terbaru, dan menampilkan 20 pesanan per halaman.
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
          '</td><td>' + safe(dateText(order.date) + ' ' + order.time) + '</td><td>' + rupiah(order.total) +
          '</td><td>' + safe(order.paymentStatus + ' / ' + order.fulfillment) +
          '</td><td><button class="btn btn-outline-dark" data-order="' + safe(order.id) +
          '" type="button">' + buttonLabel('eye', 'Detail') + '</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="order-mobile">' +
      orders.map(function (order) {
        return '<article class="panel"><strong>' + safe(order.name) + '</strong><p class="text-break">' +
          safe(order.id) + '</p><p>' + safe(dateText(order.date) + ' ' + order.time) +
          ' WITA</p><p>' + rupiah(order.total) + '</p><p>' +
          safe(order.paymentStatus + ' / ' + order.fulfillment) + '</p>' +
          '<button class="btn btn-outline-dark" data-order="' + safe(order.id) +
          '" type="button">' + buttonLabel('eye', 'Detail Pesanan') + '</button></article>';
      }).join('') + '</div>' +
      '<div class="d-flex align-items-center gap-2 mt-3">' +
      '<button class="btn btn-outline-dark" id="previous-orders" type="button"' +
      (state.listPage === 0 ? ' disabled' : '') + '>' + buttonLabel('back', 'Sebelumnya') + '</button>' +
      '<span>' + (state.listPage + 1) + ' / ' + pageCount + '</span>' +
      '<button class="btn btn-outline-dark" id="next-orders" type="button"' +
      (state.listPage + 1 >= pageCount ? ' disabled' : '') + '>' + buttonLabel('next', 'Berikutnya') + '</button></div>';
  }

  // Membuka detail pesanan dan formulir tindakan pembayaran, pemenuhan, refund, atau kurir.
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
          '" type="button">' + buttonLabel('eye', 'Lihat ' + file.kind) + '</button>';
      }).join('') + '<button class="btn btn-green" data-invoice="' + safe(id) +
      '" type="button">' + buttonLabel('download', 'Invoice PDF') + '</button></div><hr>' +
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
      '<button class="btn btn-primary" type="submit">' + buttonLabel('check', 'Jalankan Tindakan') + '</button></form><hr>' +
      '<form id="handover-form" data-id="' + safe(id) + '">' +
      '<label class="form-label">Foto tanda terima</label>' +
      '<input type="file" name="photo" class="form-control mb-2" accept="image/jpeg,image/png,image/webp" required>' +
      '<button class="btn btn-outline-dark" type="submit">' + buttonLabel('upload', 'Unggah ke TANDATERIMA') + '</button></form>');
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
      html += field('Jam buka WITA (24 jam)', 'opens', row.opens, 'time');
      html += field('Jam tutup WITA (24 jam)', 'closes', row.closes, 'time');
      html += '<p class="form-text">Gunakan format HH:mm, misalnya 08:00 untuk pagi ' +
        'atau 17:00 untuk sore. Semua jam menggunakan WITA.</p>';
    }
    if (table === 'Users') {
      html += field('Username (minimal 6 karakter)', 'username', row.username);
      html += selectField('Level', 'role', [
        ['Admin', 'Admin'], ['Operator', 'Operator'], ['Viewer', 'Viewer']
      ], row.role);
      html += field('Password sementara (minimal 6 karakter; isi untuk reset)', 'password', '', 'password', !row.id);
    }
    if (!['ReadyStock', 'PreorderCapacity'].includes(table)) {
      html += selectField('Aktif', 'active', [['true', 'Ya'], ['false', 'Tidak']],
        row.active === false || row.active === 'false' ? 'false' : 'true');
    }
    return html;
  }

  // Menyiapkan tanggal dan jam WITA sebagai nilai awal input formulir.
  function toWitaInput(value) {
    return dateTimeText(value);
  }

  // Memvalidasi isian DD/MM/YYYY HH:mm WITA lalu mengubahnya ke waktu ISO untuk server.
  function fromWitaInput(value) {
    const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
    if (!match) { throw new Error('Gunakan tanggal dan jam DD/MM/YYYY HH:mm.'); }
    const date = new Date(match[3] + '-' + match[2] + '-' + match[1] +
      'T' + match[4] + ':' + match[5] + ':00+08:00');
    if (isNaN(date.getTime()) || dateTimeText(date) !== value) {
      throw new Error('Tanggal atau jam tidak valid.');
    }
    return date.toISOString();
  }

  // Menampilkan tabel data master dengan pencarian serta tombol tambah/edit.
  function renderMaster(table) {
    const rows = state.admin.tables[table] || [];
    const keys = rows.length ? Object.keys(rows[0]).filter(function (key) {
      return !['id', 'photoFileId', 'updatedAt', 'mustChangePassword'].includes(key);
    }) : [];
    document.getElementById('admin-body').innerHTML = '<section class="panel">' +
      '<div class="d-flex justify-content-between gap-2 mb-3"><h2 class="h4">' +
      safe(tableLabels[table]) + '</h2><button class="btn btn-primary" data-new="' +
      safe(table) + '" type="button">' + buttonLabel('plus', 'Tambah') + '</button></div>' +
      '<input class="form-control mb-3" id="master-search" placeholder="Cari data..." aria-label="Cari data">' +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      keys.map(function (key) {
        const label = { weekday: 'Hari', opens: 'Jam buka WITA', closes: 'Jam tutup WITA',
          active: 'Aktif', date: 'Tanggal', startsAt: 'Mulai WITA', endsAt: 'Berakhir WITA' };
        return '<th>' + safe(label[key] || key) + '</th>';
      }).join('') +
      '<th>Aksi</th></tr></thead><tbody id="master-rows">' +
      rows.map(function (row) {
        return '<tr>' + keys.map(function (key) {
          const product = (state.admin.tables.Products || []).find(function (item) {
            return item.id === row[key];
          });
          return '<td>' + safe(masterText(key, product ? product.name : row[key])) + '</td>';
        }).join('') + '<td><button class="btn btn-outline-dark" data-edit="' +
          safe(row.id) + '" data-table="' + safe(table) + '" type="button">' + buttonLabel('edit', 'Edit') + '</button>' +
          (table === 'Products' ? ' <button class="btn btn-outline-dark" data-product-upload="' +
          safe(row.id) + '" type="button">' + buttonLabel('photo', 'Foto') + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (!rows.length ? '<p>Belum ada data. Tambahkan data aktual toko.</p>' : '') + '</section>';
  }

  // Membuka formulir tambah atau edit sesuai jenis tabel dan data yang dipilih.
  function editMaster(table, id) {
    const row = (state.admin.tables[table] || []).find(function (item) { return item.id === id; }) || {};
    showEditor((id ? 'Edit ' : 'Tambah ') + tableLabels[table],
      '<form id="master-form" data-table="' + safe(table) + '" data-id="' + safe(id || '') + '">' +
      masterFields(table, row) +
      '<button class="btn btn-primary" type="submit">' + buttonLabel('save', 'Simpan') + '</button></form>');
  }

  // Menampilkan formulir pengaturan toko, jam operasional terkait, logo, dan QRIS.
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
      '<button class="btn btn-primary" type="submit">' + buttonLabel('save', 'Simpan Pengaturan') + '</button></form>' +
      '<hr><h3 class="h5">Logo dan QRIS</h3><form id="store-asset-form">' +
      selectField('Jenis aset', 'asset', [
        ['logoFileId', 'Logo toko'], ['qrisFileId', 'QRIS pembayaran']
      ], '') + '<input class="form-control mb-3" type="file" name="photo" ' +
      'accept="image/jpeg,image/png,image/webp" required>' +
      '<button class="btn btn-outline-dark" type="submit">' + buttonLabel('upload', 'Unggah Aset Toko') + '</button></form></section>';
  }

  // Menampilkan filter laporan berdasarkan tanggal, jenis, kategori, dan status pesanan.
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
      ], '') + '<button class="btn btn-green" type="submit">' + buttonLabel('report', 'Tampilkan') + '</button></form>' +
      '<div id="report-result" class="mt-4"></div></section>';
  }

  // Menampilkan ringkasan pembayaran/refund dan tabel laporan beserta tombol ekspor.
  function renderReport() {
    const report = state.report;
    const keys = report.rows.length ? Object.keys(report.rows[0]) : [];
    document.getElementById('report-result').innerHTML =
      '<p>Pembayaran: ' + rupiah(report.summary.payments) +
      ' | Refund: ' + rupiah(report.summary.refunds) + '</p>' +
      '<p class="small">Periode berdasarkan tanggal pesanan WITA. Pembayaran/refund ' +
      'adalah yang tercatat sampai saat laporan dibuka. Sisa kas bukan laba.</p>' +
      '<div class="d-flex gap-2 mb-3"><button class="btn btn-primary" id="export-xlsx" ' +
      'type="button">' + buttonLabel('report', 'Excel .xlsx') + '</button><button class="btn btn-outline-dark" id="export-pdf" ' +
      'type="button">' + buttonLabel('download', 'PDF') + '</button></div><div class="table-wrap"><table class="table"><thead><tr>' +
      keys.map(function (key) { return '<th>' + safe(key) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + report.rows.map(function (row) {
        return '<tr>' + keys.map(function (key) { return '<td>' + safe(row[key]) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  // Pustaka ekspor dimuat saat dibutuhkan, bukan saat katalog dibuka.
  const loadedScripts = {};
  // Memuat pustaka tambahan satu kali dan memungkinkan percobaan ulang jika gagal.
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

  // Mengunduh laporan Excel berisi lembar Pesanan dan Ringkasan.
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

  // Mengunduh tabel laporan sebagai PDF mendatar dengan nomor halaman.
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

  // Mengubah data berkas dari server menjadi berkas unduhan dengan nama aslinya.
  function saveDownload(file) {
    const bytes = Uint8Array.from(atob(file.base64), function (value) {
      return value.charCodeAt(0);
    });
    saveBlob(new Blob([bytes], { type: file.mimeType }), file.name);
  }

  // Memicu unduhan berkas di browser dan melepaskan alamat sementara setelah digunakan.
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

  // Menjalankan tindakan tombol: navigasi, keranjang, pengelola, unduhan, atau ekspor.
  async function clickAction(button) {
    if (button.id === 'nav-toggle') {
      const open = document.querySelector('.site-header').classList.toggle('menu-open');
      button.setAttribute('aria-expanded', String(open));
      return;
    }
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
        '<button class="btn btn-primary" type="submit">' + buttonLabel('upload', 'Simpan di PRODUK') + '</button></form>');
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

  // Memperbarui hasil pencarian dan filter segera saat pengguna mengubah isian.
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

  // Mengirim formulir yang sesuai ke backend, lalu memperbarui tampilan dan pesan hasil.
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
          data[key] = fromWitaInput(data[key]);
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
      buttonLabel('refresh', 'Coba Hubungkan Lagi') + '</button></section>';
    notify(error.message, true);
  });
