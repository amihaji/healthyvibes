  'use strict';

  // Sesi pengelola hanya di memori; tidak ditaruh di URL atau penyimpanan browser.
  const state = {
    token: '',
    user: null,
    catalog: null,
    catalogLoading: false,
    catalogSlow: false,
    catalogError: '',
    productPage: 0,
    productSearch: '',
    productCategory: '',
    availableOnly: true,
    catalogView: 'grid',
    type: 'DIRECT',
    cart: {},
    page: 'shop',
    adminPage: 'Dashboard',
    admin: null,
    adminLoading: false,
    adminError: '',
    masterTable: '',
    masterPage: 0,
    masterSearch: '',
    checkoutStep: 1,
    recipient: {},
    checkoutResume: false,
    customerOrders: null,
    customerPage: 0,
    quote: null,
    requestId: '',
    order: null,
    report: null,
    listPage: 0
  };
  const app = document.getElementById('app');
  const dialog = document.getElementById('editor');
  const confirmation = document.getElementById('confirmation-dialog');
  // Semua tombol memakai pembuat ikon dan teks yang sama.
  const buttonLabel = window.HV_UI.label;
  const adminViewport = window.matchMedia('(max-width: 1050px)');
  const headerViewport = window.matchMedia('(max-width: 767px)');
  headerViewport.addEventListener('change', renderAccountHeader);

  // Username dipakai sebagai identitas login; token sesi tidak ditampilkan.
  function renderAccountHeader() {
    const button = document.getElementById('header-auth');
    const user = document.getElementById('header-user');
    if (!button || !user) { return; }
    const active = Boolean(state.token && state.user);
    const username = active ? String(state.user.username || state.user.id || '') : '';
    const customerOrders = document.getElementById('header-customer-orders');
    if (customerOrders) { customerOrders.hidden = !(active && state.user.role === 'Konsumen'); }
    document.querySelector('.site-header').classList.toggle('is-authenticated', active);
    button.innerHTML = buttonLabel(active ? 'logout' : 'login', active ? 'Logout' : 'Login')
      .replace('class="button-text"', 'class="header-action-text"');
    button.setAttribute('aria-label', active ? 'Logout' : 'Login');
    button.title = active ? 'Logout' : 'Login';
    if (active) {
      button.removeAttribute('data-nav');
      button.dataset.action = 'logout';
      button.removeAttribute('aria-current');
    } else {
      button.dataset.nav = 'admin';
      delete button.dataset.action;
    }
    user.hidden = !active;
    user.textContent = username;
    user.title = active ? 'Buka akun: ' + username : '';
    user.setAttribute('aria-label', active ? 'Buka akun: ' + username : 'Buka akun');
    const account = document.getElementById('header-account');
    if (account) {
      const target = active && headerViewport.matches
        ? document.getElementById('site-nav') : document.querySelector('.header-inner');
      if (target && account.parentElement !== target) { target.appendChild(account); }
    }
  }

  // Tombol ringkas tetap memiliki nama aksesibel dan tooltip fungsi.
  function iconButton(icon, label, attributes, tooltip) {
    return '<button class="btn action-icon" type="button" aria-label="' +
      safe(label) + '" title="' + safe(tooltip || label) + '" ' + (attributes || '') + '>' +
      window.HV_UI.icon(icon) + '</button>';
  }

  // Hak edit/hapus mengikuti pembatasan tabel master di backend.
  function canManageMaster(table) {
    const user = state.user;
    if (!user || !['Admin', 'Operator'].includes(user.role) || table === 'Users' && user.role !== 'Admin') { return false; }
    return Array.isArray(user.permissions) ? user.permissions.includes(table) :
      user.role === 'Admin' || ['Categories', 'Products', 'ReadyStock', 'PreorderCapacity'].includes(table);
  }

  // Menu pengelola terbuka di desktop dan ringkas saat berpindah ke layar kecil.
  adminViewport.addEventListener('change', function (event) {
    const navigation = document.getElementById('admin-navigation');
    if (navigation) { navigation.open = !event.matches; }
    // Jumlah produk mengikuti jumlah kolom agar tetap maksimal dua baris.
    if (state.page === 'shop' && state.catalog && document.getElementById('products')) {
      renderProducts();
    }
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

  // Hanya tindakan pengguna memakai indikator global; katalog dan foto dimuat terpisah.
  let pending = 0;
  // Mengirim tindakan ke backend dan memeriksa hasil sambil menampilkan Memproses.
  function rpc(action, data, background) {
    const requestToken = state.token;
    if (!background) {
      pending += 1;
      document.getElementById('busy').classList.remove('d-none');
    }
    return Promise.resolve().then(function () {
      return HealthyVibesApi.request({
        action: action,
        data: data || {},
        token: requestToken
      });
    }).then(function (response) {
      if (!response || typeof response.ok !== 'boolean') {
        throw new Error('Respons server tidak valid. Keberhasilan belum dapat dipastikan.');
      }
      if (!response.ok) {
        if (requestToken === state.token && state.user?.role === 'Konsumen' &&
          /^Sesi berakhir/.test(response.message || '')) {
          state.checkoutResume = state.page === 'checkout';
          state.token = '';
          state.user = null;
          state.customerOrders = null;
          state.order = null;
          state.page = 'admin';
          renderLogin();
        }
        throw new Error(response.message || 'Operasi ditolak server.');
      }
      return response.data;
    }).finally(function () {
      if (!background) {
        pending -= 1;
        document.getElementById('busy').classList.toggle('d-none', pending === 0);
      }
    });
  }

  let notificationTimer = null;

  // Notifikasi atas hilang setelah 4 detik; pesan baru menggantikan timer pesan lama.
  function notify(message, error) {
    const element = document.getElementById('notification');
    clearTimeout(notificationTimer);
    element.innerHTML = '<div class="alert ' +
      (error ? 'alert-danger' : 'alert-success') + '">' + safe(message) + '</div>';
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    notificationTimer = setTimeout(function () {
      element.innerHTML = '';
      notificationTimer = null;
    }, 4000);
  }

  // Membuat input beserta label, nilai awal, dan aturan pengisian.
  function field(label, name, value, type, required, disabled) {
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
      (required === false ? '' : ' required') + (disabled ? ' disabled' : '') + '></div>';
  }

  // Membuat daftar pilihan dan memilih nilai awal yang sesuai.
  function selectField(label, name, options, value, disabled) {
    return '<div class="mb-3"><label class="form-label" for="f-' + name + '">' +
      safe(label) + '</label><select class="form-select" id="f-' + name +
      '" name="' + name + '"' + (disabled ? ' disabled' : '') + '>' + options.map(function (option) {
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

  // Hapus isi dialog setelah ditutup agar data privat tidak tertinggal.
  dialog.addEventListener('close', function () {
    document.getElementById('editor-content').innerHTML = '';
  });

  let resolveConfirmation = null;

  // Menunggu keputusan modal HTML; satu konfirmasi aktif mencegah klik ganda.
  function confirmAction(message, title) {
    if (resolveConfirmation) { return Promise.resolve(false); }
    document.getElementById('confirmation-title').textContent = title || 'Konfirmasi';
    document.getElementById('confirmation-message').textContent = message;
    confirmation.returnValue = 'cancelled';
    return new Promise(function (resolve, reject) {
      resolveConfirmation = resolve;
      try {
        confirmation.showModal();
      } catch (error) {
        resolveConfirmation = null;
        reject(error);
      }
    });
  }

  document.getElementById('confirmation-accept').addEventListener('click', function () {
    confirmation.close('accepted');
  });
  ['confirmation-cancel', 'confirmation-close'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () {
      confirmation.close('cancelled');
    });
  });
  // Tombol Batal, X, dan Escape tidak menjalankan tindakan maupun menghapus isian editor.
  confirmation.addEventListener('close', function () {
    const resolve = resolveConfirmation;
    resolveConfirmation = null;
    document.getElementById('confirmation-message').textContent = '';
    if (resolve) { resolve(confirmation.returnValue === 'accepted'); }
  });

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
      if (state.token && state.user?.role === 'Konsumen') {
        state.page = 'shop';
        await loadCatalog();
        showEditor('Akun Konsumen', '<p>' + safe(state.user.name) + '</p>' +
          '<div class="d-flex gap-2 flex-wrap"><button class="btn btn-primary btn-sm" data-nav="status" type="button">' +
          buttonLabel('orders', 'Pesanan Saya') + '</button><button class="btn btn-outline-dark btn-sm" id="change-password" type="button">' +
          buttonLabel('key', 'Password') + '</button><button class="btn btn-outline-dark btn-sm" id="logout" type="button">' +
          buttonLabel('logout', 'Keluar') + '</button></div>');
      } else if (state.token) {
        await loadAdmin();
      } else {
        renderLogin();
      }
    } else {
      if (state.user?.role === 'Konsumen' && state.token) { await loadMyOrders(); }
      else { renderStatusForm(); }
    }
  }

  let customerRequest = 0;

  // Respons riwayat akun lama tidak dipakai setelah logout atau pergantian halaman.
  async function loadMyOrders() {
    state.page = 'status';
    const request = ++customerRequest;
    const token = state.token;
    app.innerHTML = '<section class="panel" role="status">Mengambil Pesanan Saya...</section>';
    try {
      const result = await rpc('myOrders', { page: state.customerPage }, true);
      if (request !== customerRequest || token !== state.token || state.page !== 'status') { return; }
      state.customerOrders = result;
      state.customerPage = result.page;
      renderMyOrders();
    } catch (error) {
      if (request !== customerRequest || token !== state.token || state.page !== 'status') { return; }
      app.innerHTML = '<section class="panel"><h1 class="h3">Pesanan Saya</h1><p>' + safe(error.message) +
        '</p><button class="btn btn-outline-dark btn-sm" data-nav="status" type="button">' +
        buttonLabel('refresh', 'Coba Lagi') + '</button><button class="btn btn-link btn-sm" id="logout" type="button">' +
        buttonLabel('logout', 'Keluar') + '</button></section>';
    }
  }

  function renderMyOrders() {
    const result = state.customerOrders;
    app.innerHTML = '<section class="panel"><div class="d-flex justify-content-between gap-2 flex-wrap mb-3">' +
      '<div><h1 class="h3">Pesanan Saya</h1><p class="mb-0">' + safe(state.user.name) +
      ' · ' + result.total + ' pesanan</p></div><div class="d-flex gap-2 flex-wrap">' +
      '<button class="btn btn-outline-dark btn-sm" data-nav="status" type="button">' +
      buttonLabel('refresh', 'Perbarui') + '</button><button class="btn btn-primary btn-sm" data-nav="shop" type="button">' +
      buttonLabel('menu', 'Belanja') + '</button></div></div>' +
      result.orders.map(function (order) {
        return '<article class="order-section"><div class="d-flex justify-content-between align-items-center gap-2">' +
          '<div><strong class="text-break">' + safe(order.id) + '</strong><p class="small mb-1">' +
          safe(dateTimeText(order.createdAt)) + ' WITA</p><p class="mb-0">' + rupiah(order.total) +
          ' · ' + (order.paymentStatus === 'PAID' ? 'Lunas' : 'Belum lunas') + '</p><p class="small mb-0">' +
          safe(fulfillmentLabel(order.fulfillment)) + '</p></div>' +
          iconButton('eye', 'Detail pesanan ' + order.id, 'data-my-order="' + safe(order.id) + '"', 'Detail') +
          '</div></article>';
      }).join('') + (!result.orders.length ? '<p>Belum ada pesanan. Mulai belanja dari Katalog.</p>' : '') +
      '<div class="d-flex justify-content-center align-items-center gap-2 flex-wrap mt-3">' +
      '<button class="btn btn-outline-dark btn-sm" id="previous-my-orders" type="button"' +
      (result.page === 0 ? ' disabled' : '') + '>' + buttonLabel('back', 'Sebelumnya') + '</button>' +
      '<span>' + (result.page + 1) + ' / ' + result.pageCount + '</span>' +
      '<button class="btn btn-outline-dark btn-sm" id="next-my-orders" type="button"' +
      (result.page + 1 >= result.pageCount ? ' disabled' : '') + '>' + buttonLabel('next', 'Berikutnya') +
      '</button></div></section>';
  }

  let catalogRequest = 0;
  // Menampilkan halaman segera; data tetap diambil baru dan respons lama tidak menimpa halaman.
  async function loadCatalog() {
    const request = ++catalogRequest;
    const type = state.type;
    state.productPage = 0;
    state.catalogLoading = true;
    state.catalogSlow = false;
    state.catalogError = '';
    state.catalog = { products: [], categories: [], areas: [], settings: {}, schedule: { date: '', times: [] } };
    renderShop();
    // Setelah 5 detik, ganti indikator dengan penjelasan tanpa mengklaim data sudah siap.
    const timer = setTimeout(function () {
      if (request === catalogRequest && state.catalogLoading) {
        state.catalogSlow = true;
        if (state.page === 'shop') { renderShop(); }
      }
    }, 5000);
    try {
      const catalog = await rpc('catalog', { type: type }, true);
      if (request === catalogRequest) { state.catalog = catalog; }
    } catch (error) {
      if (request === catalogRequest) { state.catalogError = error.message; }
    } finally {
      clearTimeout(timer);
      if (request === catalogRequest) {
        state.catalogLoading = false;
        if (state.page === 'shop') { renderShop(); }
      }
    }
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
          '<span class="cart-item-price">' + rupiah(item.product.unitPrice) + '</span>' +
          '<div class="cart-quantity">' +
          iconButton('minus', 'Kurangi jumlah ' + item.product.name,
            'data-minus="' + safe(item.product.id) + '"', 'Kurangi') +
          '<span class="cart-count">' + safe(item.quantity) + '</span>' +
          iconButton('plus', 'Tambah jumlah ' + item.product.name,
            'data-add="' + safe(item.product.id) + '"', 'Tambah') + '</div></div></div>';
      }).join('') : '<p class="text-secondary">Belum ada produk.</p>') +
      '<p class="mt-3"><strong>Total produk: ' + rupiah(summary.total) + '</strong></p>' +
      '<p class="small text-secondary">Pilih layanan pengiriman saat Checkout; ongkir masuk total pembayaran. ' +
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
      // PDF dibuka di tab baru agar halaman pemesanan tetap tersedia.
      '<a class="btn btn-primary hero-action" href="pdf/Katalog_Menu_Healthy_Vibes.pdf" target="_blank" rel="noopener" type="application/pdf">' +
      buttonLabel('menu', 'Lihat Katalog') + '</a>' +
      // Tutup teks dan banner sebelum katalog agar tata letaknya tidak ikut masuk ke banner.
      '</div></section>' +
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
      (state.catalogLoading || state.catalogError || catalog.settings.ordersEnabled === 'true'
        ? '' : 'Toko belum membuka pemesanan.') +
      '</div><div class="catalog-filters">' +
      '<input class="form-control" id="product-search" aria-label="Cari produk" placeholder="Cari menu sehat..." value="' +
      safe(state.productSearch || '') + '"' +
      (state.catalogLoading || state.catalogError ? ' disabled' : '') + '>' +
      '<div class="availability-option">' +
      '<input class="form-check-input" type="checkbox" id="availability-filter"' +
      (state.availableOnly !== false ? ' checked' : '') +
      (state.catalogLoading || state.catalogError ? ' disabled' : '') + '>' +
      '<label class="form-check-label d-inline-flex align-items-center gap-2" for="availability-filter">' +
      buttonLabel('stock', 'Tersedia saja') + '</label></div>' +
      '<div class="hv-view-switch" role="group" aria-label="Tampilan katalog">' +
      '<button type="button" class="hv-view-button" data-catalog-view="grid" aria-label="Tampilan grid" title="Grid" aria-pressed="' + (state.catalogView === 'grid') + '">' + window.HV_UI.icon('dashboard') + '</button>' +
      '<button type="button" class="hv-view-button" data-catalog-view="list" aria-label="Tampilan list" title="List" aria-pressed="' + (state.catalogView === 'list') + '">' + window.HV_UI.icon('menu') + '</button></div></div>' +
      '<div class="hv-category-pills" role="group" aria-label="Pilih kategori produk">' +
      '<button type="button" class="hv-category-pill" data-category-pill="" aria-pressed="' + (!state.productCategory) + '">Semua</button>' +
      catalog.categories.map(function (row) {
        return '<button type="button" class="hv-category-pill" data-category-pill="' + safe(row.id) +
          '" aria-pressed="' + (row.id === state.productCategory) + '">' + safe(row.name) + '</button>';
      }).join('') + '</div>' +
      renderVouchers(catalog.vouchers || []) +
      '<h2 class="h4 mb-3">Menu Pilihan</h2><div class="products" id="products"></div>' +
      '<div id="product-pagination"></div>' +
      '</section><aside class="panel cart-panel">' + renderCart() + '</aside></div>' +
      '<div class="mobile-cart"><strong>' + rupiah(cartSummary().total) +
      '</strong><button class="btn btn-primary" id="mobile-cart-button" type="button"' +
      (state.catalogLoading || state.catalogError ? ' disabled' : '') + '>' +
      buttonLabel('cart', 'Keranjang & Checkout') + '</button></div>';
    renderProducts();
  }

  // Voucher aktif ditampilkan sebagai informasi; kode tetap dimasukkan dan diperiksa saat Checkout.
  function renderVouchers(vouchers) {
    if (!vouchers.length || state.catalogLoading || state.catalogError) { return ''; }
    return '<section class="panel voucher-offers" aria-labelledby="voucher-title">' +
      '<h2 id="voucher-title" class="h5">' + buttonLabel('voucher', 'Voucher Berlaku') + '</h2>' +
      '<p class="small text-secondary">Masukkan kode saat Checkout. Potongan voucher hanya untuk produk tanpa diskon.</p>' +
      '<div class="voucher-grid">' + vouchers.map(function (voucher) {
        const cut = voucher.type === 'PERCENT' ? safe(voucher.value) + '%' : rupiah(voucher.value);
        return '<article class="voucher-card"><strong class="voucher-code">' + safe(voucher.code) + '</strong>' +
          '<span>Potongan ' + cut + '</span><span>Minimum belanja ' + rupiah(voucher.minimum) + '</span>' +
          (Number(voucher.maximum) > 0 ? '<span>Maksimal potongan ' + rupiah(voucher.maximum) + '</span>' : '') +
          '<span>' + (voucher.orderType === 'ALL' ? 'Langsung dan Preorder' :
            voucher.orderType === 'PREORDER' ? 'Preorder' : 'Pesanan Langsung') + '</span>' +
          '<div class="promo-period"><span>Mulai: ' + safe(dateTimeText(voucher.startsAt)) + ' WITA</span>' +
          '<span>Sampai: ' + safe(dateTimeText(voucher.endsAt)) + ' WITA</span></div></article>';
      }).join('') + '</div></section>';
  }

  // Foto publik digunakan ulang selama halaman terbuka; perubahan ID foto memuat versi baru.
  const productPhotos = new Map();
  let photoObserver = null;

  // Memuat satu foto tanpa menahan indikator halaman; kegagalan boleh dicoba lagi.
  function loadProductPhoto(element) {
    const key = element.dataset.photo + ':' + element.dataset.photoFile;
    if (!productPhotos.has(key)) {
      const request = rpc('productPhoto', { productId: element.dataset.photo }, true)
        .catch(function (error) { productPhotos.delete(key); throw error; });
      productPhotos.set(key, request);
    }
    productPhotos.get(key).then(function (photo) {
      if (photo && element.isConnected) {
        const image = document.createElement('img');
        image.loading = 'lazy';
        image.alt = 'Foto produk';
        image.src = 'data:' + photo.mimeType + ';base64,' + photo.base64;
        element.replaceChildren(image);
      }
    }).catch(function () {
      if (element.isConnected) { element.textContent = 'Foto belum dapat dimuat.'; }
    });
  }

  // Membagi hasil pencarian menjadi dua baris: 6 produk desktop atau 4 produk HP/tablet.
  function productPageData(products) {
    const size = adminViewport.matches ? 4 : 6;
    const count = Math.max(1, Math.ceil(products.length / size));
    state.productPage = Math.max(0, Math.min(state.productPage || 0, count - 1));
    const start = state.productPage * size;
    return {
      items: products.slice(start, start + size), count: count,
      first: products.length ? start + 1 : 0, last: Math.min(start + size, products.length)
    };
  }

  // Saring seluruh katalog sebelum pembagian halaman, memakai stok/kuota dari jenis pesanan aktif.
  function filterCatalogProducts(products, search, category) {
    return products.filter(function (row) {
      return row.name.toLowerCase().includes(search) &&
        (!category || row.categoryId === category) &&
        (state.availableOnly === false || Number(row.available) > 0);
    });
  }

  // Label diskon dan tanggal mengikuti harga server, bukan menghitung ulang harga di browser.
  function renderProductDiscount(product) {
    if (!product.discount || Number(product.unitPrice) >= Number(product.price)) { return ''; }
    const discount = product.discount;
    const cut = discount.type === 'PERCENT' ? safe(discount.value) + '%' : rupiah(product.price - product.unitPrice);
    return '<div class="product-promo"><span class="promo-badge">' +
      buttonLabel('tag', 'Diskon ' + cut) + '</span><div class="promo-period">' +
      '<span>Mulai: ' + safe(dateTimeText(discount.startsAt)) + ' WITA</span>' +
      '<span>Sampai: ' + safe(dateTimeText(discount.endsAt)) + ' WITA</span></div></div>';
  }

  // Menampilkan halaman produk aktif saja; foto halaman lain belum diminta ke server.
  function renderProducts() {
    if (photoObserver) { photoObserver.disconnect(); }
    const holder = document.getElementById('products');
    const pager = document.getElementById('product-pagination');
    pager.innerHTML = '';
    if (state.catalogLoading || state.catalogError) {
      holder.innerHTML = '<div class="panel catalog-status" role="status">' +
        (state.catalogError
          ? '<p>Data katalog belum dapat dimuat: ' + safe(state.catalogError) + '</p>' +
            '<button class="btn btn-outline-dark" data-nav="shop" type="button">' +
            buttonLabel('refresh', 'Coba Lagi') + '</button>'
          : state.catalogSlow
            ? 'Halaman sudah siap. Server Google masih menyiapkan harga dan stok terbaru; produk akan muncul otomatis.'
            : 'Mengambil harga dan stok terbaru...') + '</div>';
      return;
    }
    const search = document.getElementById('product-search').value.toLowerCase();
    const category = state.productCategory;
    const products = filterCatalogProducts(state.catalog.products, search, category);
    holder.classList.toggle('hv-products-list', state.catalogView === 'list');
    const pagination = productPageData(products);
    document.getElementById('products').innerHTML = products.length
      ? pagination.items.map(function (product) {
        return '<article class="product-card">' +
          (product.photoFileId ? '<div data-photo="' + safe(product.id) +
            '" data-photo-file="' + safe(product.photoFileId) + '"></div>' : '') +
          '<h2>' + safe(product.name) + '</h2>' + renderProductSpecs(product) + '<p class="description">' +
          safe(product.description) + '</p>' + renderProductDiscount(product) + '<small>Tersedia: ' + product.available +
          '</small><div class="price d-flex flex-wrap gap-2 justify-content-between align-items-center mt-2">' +
          '<div class="product-prices">' +
          (product.discount && Number(product.unitPrice) < Number(product.price)
            ? '<del aria-label="Harga sebelum diskon">' + rupiah(product.price) + '</del>' : '') +
          '<strong>' + rupiah(product.unitPrice) + '</strong></div>' +
          '<button class="btn btn-primary" data-add="' + safe(product.id) +
          '" type="button" aria-label="Tambah ' + safe(product.name) + '"' +
          (product.available < 1 ? ' disabled' : '') + '>' + buttonLabel('plus', 'Tambah') + '</button></div></article>';
      }).join('')
      : '<p class="catalog-status" role="status">' +
        (state.availableOnly !== false
          ? 'Belum ada produk tersedia sesuai filter. Nonaktifkan "Tersedia saja" untuk melihat semua produk.'
          : 'Belum ada produk sesuai pencarian.') + '</p>';
    if (pagination.count > 1) {
      pager.innerHTML = '<nav class="product-pagination" aria-label="Halaman produk">' +
        '<button class="btn btn-outline-dark" data-product-page="previous" type="button"' +
        (state.productPage === 0 ? ' disabled' : '') + '>' + buttonLabel('back', 'Sebelumnya') + '</button>' +
        '<p class="product-page-info mb-0" role="status" aria-live="polite">Halaman ' +
        (state.productPage + 1) + ' dari ' + pagination.count +
        '<span>' + pagination.first + ' - ' + pagination.last + ' dari ' + products.length + ' produk</span></p>' +
        '<button class="btn btn-outline-dark" data-product-page="next" type="button"' +
        (state.productPage + 1 >= pagination.count ? ' disabled' : '') + '>' +
        buttonLabel('next', 'Berikutnya') + '</button></nav>';
    }
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.target.isConnected) {
            observer.unobserve(entry.target);
            loadProductPhoto(entry.target);
          }
        });
      }, { rootMargin: '150px' });
      photoObserver = observer;
    } else {
      photoObserver = null;
    }
    holder.querySelectorAll('[data-photo]').forEach(function (element) {
      if (photoObserver) {
        photoObserver.observe(element);
      } else {
        loadProductPhoto(element);
      }
    });
  }

  // Data lama tanpa satuan atau nilai ukuran tidak menghasilkan label kosong.
  function renderProductSpecs(product) {
    const unit = product.unit === 'Slace' ? 'Slice' : product.unit;
    const size = Number(product.sizeValue) > 0 && product.sizeUnit
      ? [product.sizeValue, product.sizeUnit].join(' ') : '';
    if (!unit && !size) { return ''; }
    return '<div class="product-specs" aria-label="Satuan dan ukuran produk">' +
      (unit ? '<span>Satuan: <strong>' + safe(unit) + '</strong></span>' : '') +
      (size ? '<span>Ukuran: <strong>' + safe(size) + '</strong></span>' : '') + '</div>';
  }

  // Memulai checkout dengan ID permintaan untuk mencegah pesanan ganda saat retry.
  async function startCheckout() {
    if (state.catalogLoading || state.catalogError) {
      throw new Error('Tunggu harga dan stok terbaru sebelum checkout.');
    }
    if (!cartLines().length) {
      throw new Error('Tambahkan produk terlebih dahulu.');
    }
    if (state.user && state.user.role !== 'Konsumen') {
      throw new Error('Belanja menggunakan akun Konsumen. Keluar dari akun staf terlebih dahulu.');
    }
    if (!state.requestId) {
      state.requestId = crypto.randomUUID();
    }
    state.checkoutStep = 1;
    state.quote = null;
    state.checkoutResume = false;
    if (state.user?.role === 'Konsumen') {
      state.recipient = Object.assign({}, state.user.delivery || {}, state.recipient);
    }
    dialog.close();
    renderCheckout();
  }

  // Data pesanan tidak memuat password atau kunci privat; sesi dikirim terpisah.
  function checkoutPayload() {
    return Object.assign({}, state.recipient, {
      type: state.type,
      date: state.catalog.schedule.date,
      items: cartLines().map(function (item) {
        return { productId: item.product.id, quantity: item.quantity };
      }),
      requestId: state.requestId
    });
  }

  // Menampilkan langkah penerima, pembayaran, atau tinjauan beserta ringkasan belanja.
  function renderCheckout() {
    state.page = 'checkout';
    const step = state.checkoutStep;
    const recipient = state.recipient;
    const schedule = state.catalog.schedule;
    let content = '';
    if (step === 1) {
      content = field('Nama penerima', 'name', recipient.name) +
        field('Nomor HP (diawali 0)', 'phone', recipient.phone, 'tel') +
        selectField('Cara penerimaan', 'receipt', [
          ['PICKUP', 'Ambil sendiri di toko'],
          ...((state.catalog.shippingRates || []).length ? [['DELIVERY', 'Diantar ke alamat']] : [])
        ], recipient.receipt || 'PICKUP') +
        selectField('Layanan dan biaya pengiriman', 'shippingRateId', [
          ['', 'Pilih layanan pengiriman'],
          ...(state.catalog.shippingRates || []).map(function (rate) {
            return [rate.id, rate.name + ' - ' + rupiah(rate.price)];
          })
        ], recipient.shippingRateId, true) +
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
      if (!state.token) {
        content += '<hr><h2 class="h5">Akun untuk Pesanan Saya</h2>' +
          '<p class="small">Akun langsung aktif. Riwayat dan status pesanan dibuka melalui Login, tanpa kunci privat.</p>' +
          '<button class="btn btn-outline-dark btn-sm mb-3" id="checkout-login" type="button">' +
          buttonLabel('login', 'Sudah punya akun? Login') + '</button>' +
          field('Username (minimal 6 karakter)', 'username', '') +
          field('Email pemulihan (opsional)', 'email', '', 'email', false) +
          field('Buat password (minimal 6 karakter)', 'password', '', 'password') +
          field('Ulangi password', 'repeatPassword', '', 'password') +
          '<p class="small">Nomor WhatsApp di atas digunakan untuk pemulihan password. Pastikan kontak benar.</p>';
      } else {
        content += '<p class="small">Login sebagai <strong>' + safe(state.user.username) + '</strong>.</p>';
      }
      if (!schedule.times.length) {
        content += '<p class="alert alert-warning">Tidak ada waktu valid. ' +
          'Kembali ke menu untuk memilih jenis pesanan lain.</p>';
      }
    } else if (step === 2) {
      const cash = state.type === 'DIRECT' && recipient.receipt === 'PICKUP';
      content = selectField('Metode pembayaran pesanan', 'paymentMethod', [
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
        '<div class="alert alert-info small">Total pembayaran sudah mencakup biaya pengiriman yang dipilih, ' +
        'jika pesanan diantar. Periksa penerima, alamat, jadwal, dan nominal sebelum membuat pesanan.</div>' +
        '<label class="d-flex gap-2"><input name="acceptPolicy" type="checkbox" required>' +
        '<span>Data pesanan dan total pembayaran sudah benar.</span></label>';
    }
    const estimate = cartSummary();
    const rate = recipient.receipt === 'DELIVERY'
      ? (state.catalog.shippingRates || []).find(function (row) { return row.id === recipient.shippingRateId; }) : null;
    const priced = state.quote || {
      productTotal: estimate.total, voucherDiscount: estimate.voucherDiscount,
      shippingFee: rate ? Number(rate.price) : 0, total: estimate.total + (rate ? Number(rate.price) : 0)
    };
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
      '<aside class="panel"><h2 class="h5">Ringkasan Pembayaran</h2>' +
      cartLines().map(function (item) {
        return '<p>' + safe(item.product.name) + ' x ' + item.quantity + '</p>';
      }).join('') + '<p>Voucher: ' + rupiah(priced.voucherDiscount || 0) + '</p>' +
      '<p>Total produk: ' + rupiah(priced.productTotal) + '</p>' +
      '<p>Biaya pengiriman: <span id="checkout-shipping-fee">' + rupiah(priced.shippingFee) + '</span></p>' +
      '<strong>Total pembayaran: <span id="checkout-total">' + rupiah(priced.total) + '</span></strong>' +
      '<p class="small mt-3">' + (state.quote ? 'Harga sudah diperiksa oleh toko.' : 'Perkiraan, harga akan diperiksa sebelum pesanan dibuat.') +
      '</p></aside></div>';
    if (step === 1) { updateCheckoutDelivery(document.getElementById('checkout-form')); }
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

  // Isian pengantaran hanya wajib dan aktif ketika konsumen memilih diantar.
  function updateCheckoutDelivery(form) {
    const delivery = form.elements.receipt.value === 'DELIVERY';
    ['shippingRateId', 'areaId', 'address'].forEach(function (name) {
      form.elements[name].disabled = !delivery;
      form.elements[name].required = delivery;
      if (!delivery) {
        form.elements[name].value = '';
        state.recipient[name] = '';
      }
    });
  }

  // Menyimpan isian tiap langkah, memeriksa harga di server, lalu membuat pesanan.
  async function submitCheckout(form) {
    const data = formData(form);
    if (state.checkoutStep < 3) {
      if (state.checkoutStep === 1) {
        if (!/^0[0-9]{8,14}$/.test(data.phone)) { throw new Error('Nomor HP diawali 0 dan terdiri dari 9-15 angka.'); }
        if (!state.token) {
          if (data.password !== data.repeatPassword) { throw new Error('Password ulang tidak sama.'); }
          const result = await rpc('registerCustomer', {
            requestId: state.requestId, name: data.name, phone: data.phone,
            email: data.email, username: data.username, password: data.password
          });
          state.token = result.token;
          state.user = result.user;
          renderAccountHeader();
        }
        ['name', 'phone', 'receipt', 'shippingRateId', 'areaId', 'address', 'time'].forEach(function (key) {
          state.recipient[key] = data[key] || '';
        });
      } else {
        state.recipient.paymentMethod = data.paymentMethod;
        state.recipient.voucherCode = data.voucherCode || '';
      }
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
    state.page = 'status';
    state.user.delivery = {
      name: order.name, phone: order.phone, address: order.address || '', areaId: state.recipient.areaId || '',
      receipt: order.receipt, shippingRateId: state.recipient.shippingRateId || ''
    };
    state.recipient = {};
    renderOrder();
    notify('Pesanan berhasil dibuat. Lihat perkembangannya di Pesanan Saya.');
  }

  // Menampilkan formulir pengecekan pesanan melalui Login akun Konsumen.
  function renderStatusForm() {
    app.innerHTML = '<section class="panel mx-auto" style="max-width:650px">' +
      '<h1 class="h2">Pesanan Saya</h1><p>Login untuk melihat riwayat dan status seluruh pesanan akun Anda.</p>' +
      '<div class="d-flex gap-2 flex-wrap mb-3"><button class="btn btn-primary btn-sm" data-nav="admin" type="button">' +
      buttonLabel('login', 'Login') + '</button><button class="btn btn-outline-dark btn-sm" data-nav="shop" type="button">' +
      buttonLabel('menu', 'Mulai Belanja') + '</button></div></section>';
  }

  // Mengubah kode internal menjadi status yang mudah dipahami pelanggan.
  function fulfillmentLabel(status) {
    return {
      NEW: 'Pesanan baru', CONFIRMED: 'Dikonfirmasi', PREPARING: 'Sedang disiapkan',
      READY: 'Siap diterima', DISPATCHED: 'Sedang dikirim', COMPLETED: 'Selesai',
      CANCELLED: 'Dibatalkan'
    }[status] || 'Status belum diketahui';
  }

  // Pisahkan pembayaran dari pengerjaan; permintaan batal belum berarti dibatalkan.
  function orderStatusPanel(order) {
    const descriptions = {
      NEW: 'Pesanan sudah tercatat dan menunggu konfirmasi toko.',
      CONFIRMED: 'Toko sudah mengonfirmasi pesanan Anda.',
      PREPARING: 'Produk Anda sedang disiapkan oleh toko.',
      READY: order.receipt === 'DELIVERY' ? 'Produk siap diserahkan kepada kurir.' : 'Produk siap diambil di toko.',
      DISPATCHED: 'Produk sedang dalam perjalanan ke alamat penerima.',
      COMPLETED: 'Pesanan sudah diterima dan proses pesanan selesai.',
      CANCELLED: 'Riwayat pesanan lama yang telah dibatalkan.'
    };
    const stages = ['NEW', 'CONFIRMED', 'PREPARING', 'READY']
      .concat(order.receipt === 'DELIVERY' ? ['DISPATCHED'] : []).concat(['COMPLETED']);
    const current = stages.indexOf(order.fulfillment);
    const cancelled = order.fulfillment === 'CANCELLED';
    return '<section class="order-status-panel" aria-label="Status terkini pesanan">' +
      '<div class="order-info-grid"><div><span class="order-caption">Tahap pesanan</span>' +
      '<strong class="order-status-title">' + safe(fulfillmentLabel(order.fulfillment)) +
      '</strong><p class="small mb-0">' + safe(descriptions[order.fulfillment] || 'Silakan hubungi Admin untuk informasi status.') +
      '</p></div><div><span class="order-caption">Pembayaran produk</span>' +
      '<strong class="order-status-title">' + (order.paymentStatus === 'PAID' ? 'Lunas' : 'Belum lunas') +
      '</strong><p class="small mb-0">' + (order.paymentStatus === 'PAID'
        ? 'Pembayaran sudah diverifikasi oleh toko.'
        : 'Pembayaran belum diverifikasi toko. Unggah bukti transfer tidak otomatis membuat pesanan lunas.') +
      '</p></div></div>' +
      (!cancelled && current >= 0 ? '<ol class="order-progress" aria-label="Urutan tahap pesanan">' +
        stages.map(function (stage, index) {
          return '<li class="' + (index < current ? 'is-done' : index === current ? 'is-current' : '') +
            '"' + (index === current ? ' aria-current="step"' : '') + '><span>' +
            safe(fulfillmentLabel(stage)) + '</span><small>' +
            (index < current ? 'Sudah dilewati' : index === current ? 'Tahap saat ini' : 'Tahap berikutnya') +
            '</small></li>';
        }).join('') + '</ol>' : '') +
      '</section>';
  }

  // Rincian tagihan memakai harga tersimpan, bukan daftar ongkir yang sedang berlaku.
  function orderCharges(order) {
    return '<p>Total produk: ' + rupiah(order.productTotal == null ? order.total : order.productTotal) + '</p>' +
      (order.shippingIncluded ? '<p>Pengiriman ' + safe(order.shippingProvider) + ': ' + rupiah(order.shippingFee) + '</p>'
        : order.receipt === 'DELIVERY' ? '<p class="small">Pesanan lama: tagihan tersimpan belum termasuk biaya pengiriman.</p>' : '') +
      '<h3 class="h5">Total pembayaran: ' + rupiah(order.total) + '</h3>';
  }

  // Status tanda terima selalu terlihat; input baru aktif pada tahap penerimaan.
  function handoverForm(order) {
    if (order.handoverUploaded) {
      return '<section class="order-section"><h2 class="h5">Tanda Terima</h2>' +
        '<p class="alert alert-success">Sudah diunggah. Foto tanda terima sudah tersimpan sebagai bukti penerimaan produk.</p></section>';
    }
    const eligible = order.receipt === 'DELIVERY' ? order.fulfillment === 'DISPATCHED'
      : order.receipt === 'PICKUP' && order.fulfillment === 'READY';
    const disabled = eligible ? '' : ' disabled';
    return '<form id="handover-form" class="order-section"><h2 class="h5">Tanda Terima</h2>' +
      '<p><strong>Status: Belum diunggah.</strong></p><p>' + (eligible
        ? 'Setelah produk benar-benar diterima, unggah foto tanda terima agar Admin dapat menyelesaikan pesanan.'
        : 'Unggahan akan aktif saat status pesanan ' + (order.receipt === 'DELIVERY' ? 'Sedang dikirim' : 'Siap diterima') + '.') +
      '</p><label class="form-label" for="handover-photo">Foto tanda terima (JPG/PNG/WebP)</label>' +
      '<input id="handover-photo" type="file" name="photo" class="form-control mb-3" accept="image/jpeg,image/png,image/webp" required' + disabled + '>' +
      '<label class="order-check mb-3"><input type="checkbox" name="received" required' + disabled +
      '> Saya sudah menerima produk pesanan ini.</label><div id="handover-result" role="status" aria-live="polite"></div>' +
      '<div class="d-flex justify-content-center"><button class="btn btn-primary btn-sm" type="submit"' + disabled + '>' +
      buttonLabel('upload', 'Unggah Tanda Terima') + '</button></div></form>';
  }

  // Menampilkan status, jadwal, rincian produk, dan tindakan pelanggan secara terpisah.
  function renderOrder() {
    const order = state.order;
    app.innerHTML = '<section class="panel mx-auto" style="max-width:850px">' +
      '<h1 class="h2">Pesanan Anda</h1><p class="text-break"><strong>' + safe(order.id) +
      '</strong></p>' + orderStatusPanel(order) +
      '<p class="small text-secondary mt-3">Status sesuai pembaruan terakhir yang dimuat. ' +
      'Klik Perbarui Status untuk mengambil informasi terbaru dari toko.</p>' +
      '<div class="d-flex justify-content-center mb-4"><button class="btn btn-outline-dark btn-sm" ' +
      'id="refresh-order" type="button">' + buttonLabel('refresh', 'Perbarui Status') + '</button></div>' +
      '<section class="order-section"><h2 class="h5">Jadwal dan Penerima</h2><div class="order-info-grid">' +
      '<div><span class="order-caption">' + (order.receipt === 'DELIVERY' ? 'Pengantaran' : 'Pengambilan di toko') +
      '</span><strong>' + safe(dateText(order.date) + ' ' + order.time) + ' WITA</strong><p class="small mb-0">' +
      (order.type === 'PREORDER' ? 'Preorder' : 'Pesanan langsung') + '</p></div>' +
      '<div><span class="order-caption">Penerima</span><strong>' + safe(order.name) +
      '</strong><p class="small mb-0">' + safe(order.phone) + '</p>' +
      (order.receipt === 'DELIVERY' ? '<p class="small mb-0 text-break">' + safe(order.address) + '</p>' : '') +
      '</div></div></section>' +
      '<section class="order-section"><h2 class="h5">Rincian Produk</h2><div class="table-wrap">' +
      '<table class="table"><thead><tr><th>Produk</th><th>Jumlah</th><th>Harga Satuan</th></tr></thead><tbody>' +
      order.items.map(function (item) {
        return '<tr><td>' + safe(item.name) + '</td><td>' + safe(item.quantity) +
          '</td><td>' + rupiah(item.unitPrice) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p>Potongan voucher: ' + rupiah(order.voucherDiscount || 0) + '</p>' +
      orderCharges(order) +
      '<p class="small">Batas pembayaran: ' + (order.paymentDeadline
        ? safe(dateTimeText(order.paymentDeadline)) + ' WITA'
        : 'Sebelum dikirim; pesanan langsung ambil dapat dibayar saat diambil.') +
      '</p></section>' +
      '<section class="order-section"><h2 class="h5">Dokumen Pesanan</h2>' +
      '<p class="small">Pesanan ini tersimpan di akun Anda.</p>' +
      '<div class="d-flex gap-2 flex-wrap justify-content-center">' +
      '<button class="btn btn-green btn-sm" id="download-invoice" type="button">' + buttonLabel('download', 'Unduh Invoice PDF') + '</button>' +
      '<button class="btn btn-outline-dark btn-sm" data-nav="status" type="button">' +
      buttonLabel('orders', 'Pesanan Saya') + '</button>' +
      '</div></section>' +
      (order.paymentStatus !== 'PAID' && !['CANCELLED', 'COMPLETED'].includes(order.fulfillment)
        ? '<form id="proof-form" class="order-section">' +
      '<h2 class="h5">Bukti Pembayaran</h2>' +
      '<p class="small">Setelah transfer, unggah bukti agar toko dapat memeriksa pembayaran Anda.</p>' +
      '<label class="form-label">Struk bukti transfer (JPG/PNG/WebP)</label>' +
      '<input class="form-control mb-2" type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>' +
      '<button class="btn btn-primary" type="submit">' + buttonLabel('upload', 'Unggah Bukti Transfer') + '</button></form>' : '') +
      handoverForm(order) + '</section>';
  }

  // Form ringkas yang mendukung autofill tanpa menyimpan credential di browser.
  function renderLogin() {
    renderAccountHeader();
    app.innerHTML = '<div class="login-shell"><section class="panel login-card" aria-labelledby="login-title">' +
      '<h1 id="login-title">Login</h1><form id="login-form" class="login-form">' +
      '<div><label class="form-label" for="login-user">User</label>' +
      '<input class="form-control" id="login-user" name="username" type="text" ' +
      'autocomplete="username" autocapitalize="none" spellcheck="false" minlength="6" ' +
      'placeholder="Username Anda" required></div>' +
      '<div><label class="form-label" for="login-pass">Pass</label><div class="login-password">' +
      '<input class="form-control" id="login-pass" name="password" type="password" ' +
      'autocomplete="current-password" minlength="6" placeholder="Password Anda" required>' +
      '<button class="login-password-toggle" id="toggle-login-password" type="button" ' +
      'aria-label="Tampilkan password" title="Tampilkan password" aria-controls="login-pass" aria-pressed="false">' +
      window.HV_UI.icon('eye') + '</button></div></div>' +
      '<div id="login-error" role="alert" aria-live="polite"></div>' +
      '<button class="btn btn-primary login-submit" type="submit">' + buttonLabel('login', 'Masuk') +
      '</button></form><div class="login-help"><button class="btn btn-link" type="button" id="forgot-password">' +
      'Lupa Password?</button></div></section></div>';
  }

  function toggleLoginPassword(button) {
    const input = document.getElementById('login-pass');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
    const label = visible ? 'Sembunyikan password' : 'Tampilkan password';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }

  // Membuka formulir penggantian password pengelola.
  function passwordDialog() {
    showEditor('Ganti Password', '<form id="password-form">' +
      field('Password saat ini', 'currentPassword', '', 'password') +
      field('Password baru (minimal 6 karakter)', 'newPassword', '', 'password') +
      '<p>Semua sesi akan dicabut; masuk kembali setelah perubahan.</p>' +
      '<button class="btn btn-primary" type="submit">' + buttonLabel('save', 'Simpan Password') + '</button></form>');
  }

  let adminRequest = 0;

  // Panel tampil dahulu; respons menu lama atau sesi yang sudah berubah tidak digunakan.
  async function loadAdmin() {
    const request = ++adminRequest;
    const token = state.token;
    state.adminLoading = true;
    state.adminError = '';
    renderAdmin();
    try {
      const result = await rpc('adminData', { page: state.adminPage });
      if (request !== adminRequest || token !== state.token || state.page !== 'admin') { return; }
      state.admin = result;
      state.user = result.user;
    } catch (error) {
      if (request !== adminRequest || token !== state.token || state.page !== 'admin') { return; }
      state.adminError = error.message;
      throw error;
    } finally {
      if (request === adminRequest && token === state.token && state.page === 'admin') {
        state.adminLoading = false;
        renderAdmin();
      }
    }
  }

  // Menentukan menu yang ditampilkan untuk Admin, Operator, atau Viewer.
  function adminMenu() {
    const role = state.user.role;
    if (role === 'Konsumen') { return []; }
    if (Array.isArray(state.user.permissions)) {
      return Object.keys(adminIcons).filter(function (page) { return state.user.permissions.includes(page); });
    }
    const list = role === 'Viewer' ? ['Dashboard', 'Laporan'] : [
      'Dashboard', 'Pesanan', 'Categories', 'Products', 'ReadyStock', 'PreorderCapacity'
    ];
    if (role === 'Admin') {
      list.push('Discounts', 'Vouchers', 'Users', 'ServiceHours', 'ServiceAreas', 'ShippingRates', 'Pengaturan', 'Backup');
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
    ServiceAreas: 'Wilayah Layanan', ShippingRates: 'Biaya Pengiriman'
  };

  // Ikon khusus membantu membedakan menu pengelola tanpa mengubah hak akses.
  const adminIcons = {
    Dashboard: 'dashboard', Pesanan: 'orders', Categories: 'categories',
    Products: 'product', ReadyStock: 'stock', PreorderCapacity: 'calendar',
    Discounts: 'tag', Vouchers: 'voucher', Users: 'users', ServiceHours: 'clock',
    ServiceAreas: 'location', ShippingRates: 'shipping', Pengaturan: 'settings', Backup: 'backup', Laporan: 'report'
  };

  // Contoh awal Operator mengikuti menu operasional; Admin dapat mengubah centangnya.
  function defaultUserPermissions(role) {
    const menus = Object.keys(adminIcons);
    return role === 'Admin' ? menus : role === 'Operator'
      ? menus.filter(function (page) { return !['Users', 'Pengaturan'].includes(page); })
      : role === 'Viewer' ? ['Dashboard', 'Laporan'] : [];
  }

  // Hak menu dalam form; Konsumen memakai katalog/status, bukan Panel Pengelola.
  function userPermissionFields(user, readonly) {
    const role = user.role || 'Admin';
    const selected = user.permissions || defaultUserPermissions(role);
    return '<fieldset class="user-permissions mb-3"><legend class="h6">Hak Akses Menu</legend>' +
      '<p class="small">Centang menu yang boleh dibuka. Viewer hanya melihat; Konsumen memakai Katalog dan Status Pesanan.</p>' +
      Object.keys(adminIcons).map(function (page, index) {
        return '<label class="user-permission-row"><span>' + (index + 1) + '. ' +
          safe(tableLabels[page] || page) + '</span><input class="form-check-input" type="checkbox" name="permission" value="' +
          safe(page) + '"' + (selected.includes(page) ? ' checked' : '') +
          (readonly || role === 'Konsumen' ? ' disabled' : '') + '></label>';
      }).join('') + '</fieldset>';
  }

  // Daftar akun menyerupai contoh Berat Idealku; password/hash tidak pernah ditampilkan.
  function renderUsers() {
    const users = state.admin.tables.Users || [];
    const editable = canManageMaster('Users');
    document.getElementById('admin-body').innerHTML = '<section class="panel">' +
      '<div class="d-flex justify-content-between align-items-center gap-2 mb-3"><h2 class="h4 mb-0">Setup User</h2>' +
      (editable ? '<button class="btn btn-primary btn-sm" type="button" data-new="Users">' +
        buttonLabel('plus', 'Buat') + '</button>' : '') + '</div>' +
      '<input class="form-control mb-3" id="master-search" placeholder="Cari user..." aria-label="Cari user">' +
      '<p class="small text-muted">Geser tabel ke kanan untuk melihat seluruh hak akses menu.</p>' +
      '<div class="table-wrap users-table-wrap"><table class="table table-hover table-striped table-bordered align-middle text-center users-table">' +
      '<thead><tr><th>Username</th><th>Nama</th><th>Email</th><th>WhatsApp</th><th>Level</th><th>Salah</th><th>Status</th><th>Login Terakhir WITA</th>' +
      Object.keys(adminIcons).map(function (page) { return '<th>' + safe(tableLabels[page] || page) + '</th>'; }).join('') +
      '<th class="record-action-cell">Aksi</th></tr></thead><tbody id="master-rows">' +
      users.map(function (user) {
        return '<tr><td>' + safe(user.username) + '</td><td>' + safe(user.name) + '</td><td>' +
          safe(user.email) + '</td><td>' + safe(user.phone) + '</td><td>' + safe(user.role) +
          '</td><td>' + safe(user.failedAttempts || 0) + '</td><td>' +
          (user.blocked ? 'Diblokir' : user.active ? 'Aktif' : 'Nonaktif') + '</td><td>' +
          safe(dateTimeText(user.lastLoginAt)) + '</td>' +
          Object.keys(adminIcons).map(function (page) {
            const allowed = (user.permissions || []).includes(page);
            return '<td><span aria-label="' + (allowed ? 'Diizinkan' : 'Tidak diizinkan') + '">' +
              window.HV_UI.icon(allowed ? 'check' : 'close') + '</span></td>';
          }).join('') + '<td class="record-action-cell"><div class="record-actions">' +
          (editable ? iconButton('edit', 'Edit user ' + user.username, 'data-edit="' + safe(user.id) + '" data-table="Users"', 'Edit') +
            iconButton('trash', 'Hapus user ' + user.username, 'data-delete="' + safe(user.id) + '" data-table="Users"', 'Hapus') : '') +
          iconButton('eye', 'Lihat user ' + user.username, 'data-user-view="' + safe(user.id) + '"', 'View') +
          (editable ? iconButton('key', 'Reset password ' + user.username, 'data-user-reset="' + safe(user.id) + '"', 'Reset') : '') +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (!users.length ? '<p>Belum ada user.</p>' : '') + '</section>';
  }

  // Detail akun hanya-baca; nilai password tidak diambil dari server.
  function viewUser(id) {
    const user = state.admin.tables.Users.find(function (row) { return row.id === id; });
    if (!user) { throw new Error('User tidak ditemukan.'); }
    showEditor('View User', field('Username', 'username', user.username, 'text', false, true) +
      field('Nama', 'name', user.name, 'text', false, true) +
      field('Email', 'email', user.email, 'text', false, true) +
      field('WhatsApp', 'phone', user.phone, 'text', false, true) +
      field('Level', 'role', user.role, 'text', false, true) + userPermissionFields(user, true));
  }

  // Admin mengirim tautan, bukan melihat atau menyimpan password pengguna.
  function resetUserDialog(id) {
    if (!canManageMaster('Users')) { throw new Error('Reset hanya untuk Admin dengan akses Setup User.'); }
    showEditor('Reset Password', '<form id="admin-reset-form" data-id="' + safe(id) + '">' +
      '<p>Kirim tautan ke kontak terdaftar?</p>' +
      selectField('Kirim melalui', 'channel', [['email', 'Email'], ['whatsapp', 'WhatsApp']], 'email') +
      '<div role="status"></div><button class="btn btn-primary btn-sm" type="submit">' +
      buttonLabel('key', 'Kirim Tautan') + '</button></form>');
  }

  // Token dari fragmen segera dihapus dari alamat dan hanya dikirim dalam badan POST.
  function renderResetPassword(token) {
    app.innerHTML = '<section class="panel mx-auto" style="max-width:440px"><h1 class="h4">Reset Password</h1>' +
      '<form id="complete-reset-form" data-token="' + safe(token) + '">' +
      field('Password baru', 'newPassword', '', 'password') +
      field('Ulangi password', 'repeatPassword', '', 'password') +
      '<div role="status" aria-live="polite"></div>' +
      '<button class="btn btn-primary btn-sm" type="submit">' + buttonLabel('save', 'Simpan') +
      '</button></form></section>';
  }

  // Label administrasi hanya mengubah presentasi, bukan nilai API/Google Sheets.
  function paymentLabel(status) {
    return status === 'PAID' ? 'Lunas' : status === 'PENDING' || status === 'UNPAID'
      ? 'Belum Lunas' : String(status || 'Belum Lunas');
  }

  function orderTypeLabel(type) {
    return ({ ALL: 'Semua', DIRECT: 'Langsung', PREORDER: 'Preorder' })[type] || String(type || '');
  }

  function promoTypeLabel(type) {
    return ({ PERCENT: 'Persen', AMOUNT: 'Nominal' })[type] || String(type || '');
  }

  function promoValueText(row) {
    return row.type === 'PERCENT' ? String(row.value ?? '') + '%' :
      row.type === 'AMOUNT' ? rupiah(row.value) : row.value;
  }

  // Kolom laporan dipakai bersama oleh layar, Excel, dan PDF.
  const reportColumns = [
    ['nomor', 'Nomor Pesanan'], ['waktuWita', 'Waktu Wita'],
    ['jenis', 'Jenis Pesanan'], ['penerimaan', 'Cara Penerimaan'],
    ['produk', 'Nama Produk'], ['subtotal', 'Subtotal'], ['voucher', 'Voucer'],
    ['produkSetelahDiskon', 'Harga Setelah Diskon'], ['pengiriman', 'Jenis Pengiriman'],
    ['ongkirDalamTagihan', 'Biaya Ongkir'], ['tagihan', 'Total Harga'],
    ['pembayaran', 'Transfer Pembayaran'], ['status', 'Status Pesanan']
  ];
  function reportDisplayValue(row, key) {
    const value = row[key] ?? '';
    if (key === 'jenis') { return orderTypeLabel(value); }
    if (key === 'penerimaan') {
      return ({ PICKUP: 'Ambil Sendiri', DELIVERY: 'Diantar ke alamat' })[value] || value;
    }
    if (key === 'status') { return fulfillmentLabel(value); }
    if (['subtotal', 'voucher', 'produkSetelahDiskon', 'ongkirDalamTagihan', 'tagihan', 'pembayaran'].includes(key)) {
      return rupiah(value);
    }
    return value;
  }
  function reportDisplayRows() {
    return (state.report?.rows || []).map(function (row) {
      const result = {};
      reportColumns.forEach(function (column) { result[column[1]] = reportDisplayValue(row, column[0]); });
      return result;
    });
  }

  function adminBars(title, items, formatter) {
    const maximum = Math.max(1, ...items.map(function (item) { return Number(item.value) || 0; }));
    return '<section class="panel hv-chart-panel"><h2 class="h5">' + safe(title) + '</h2>' +
      (items.length ? items.map(function (item) {
        const width = Math.max(0, Math.min(100, Number(item.value) / maximum * 100));
        return '<div class="hv-chart-row"><div class="hv-chart-label"><span>' + safe(item.name) +
          '</span><strong>' + safe(formatter(item.value)) + '</strong></div>' +
          '<div class="hv-chart-track"><div class="hv-chart-fill" style="width:' + width + '%"></div></div></div>';
      }).join('') : '<p class="text-secondary">Belum ada data transaksi yang dapat ditampilkan.</p>') + '</section>';
  }

  // Menampilkan panel pengelola dan isi menu yang sedang dipilih.
  function renderAdmin() {
    renderAccountHeader();
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
    // Tidak menampilkan angka nol atau data menu lama selama menunggu data sebenarnya.
    if (state.adminLoading || state.adminError || !state.admin) {
      body.innerHTML = '<section class="panel" role="status" aria-live="polite">' +
        (state.adminError
          ? '<p>Data belum dapat dimuat: ' + safe(state.adminError) + '</p>' +
            '<button class="btn btn-outline-dark" id="refresh-admin" type="button">' +
            buttonLabel('refresh', 'Coba Lagi') + '</button>'
          : '<p class="mb-0">Mengambil data ' + safe(tableLabels[page] || page) + '...</p>') + '</section>';
      return;
    }
    if (page === 'Dashboard') {
      const kpi = state.admin.kpi;
      body.innerHTML = '<div class="kpis">' + [
        ['Pesanan', kpi.orders],
        ['Belum lunas', kpi.pending],
        ['Pembayaran diterima', rupiah(kpi.payments)],
        ['Preorder hari ini', kpi.preorderToday ?? 0]
      ].map(function (item) {
        return '<div class="kpi"><small>' + safe(item[0]) + '</small><strong>' +
          safe(item[1]) + '</strong></div>';
      }).join('') + '</div><section class="panel"><h2 class="h4">Ringkasan Operasional</h2>' +
        '<p>Data berasal dari transaksi tersimpan, bukan contoh.</p>' +
        '<p>Pembayaran pesanan baru sudah termasuk ongkir. Total penerimaan bukan laba.</p>' +
        '<button class="btn btn-green" id="refresh-admin" type="button">' + buttonLabel('refresh', 'Perbarui Data') + '</button></section>' +
        '<div class="hv-dashboard-charts">' +
        adminBars('Nilai transaksi per kategori', kpi.byCategory || [], rupiah) +
        adminBars('5 produk terlaris (jumlah unit)', kpi.topProducts || [], String) +
        '</div><section class="panel"><h2 class="h5">Preorder untuk hari ini (WITA)</h2>' +
        ((kpi.preorderProducts || []).length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Produk</th><th>Jumlah</th></tr></thead><tbody>' +
          kpi.preorderProducts.map(function (item) { return '<tr><td>' + safe(item.name) + '</td><td>' + safe(item.quantity) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '<p>Belum ada produk preorder untuk hari ini.</p>') +
        '</section><section class="panel"><h2 class="h5">Perlu ditindaklanjuti</h2><p>Pesanan belum lunas: <strong>' +
        safe(kpi.pending) + '</strong>. Pesanan baru belum dikonfirmasi: <strong>' +
        safe(kpi.newOrders ?? 0) + '</strong>.</p></section>';
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
        (canManageMaster('Backup') ? '<button class="btn btn-primary" id="backup" type="button">' + buttonLabel('backup', 'Buat Backup') + '</button>' : '') +
        (state.user.role === 'Admin' && canManageMaster('Backup') ? '<hr><h3 class="h5">Pulihkan ke Staging</h3><form id="restore-form">' +
        field('ID folder backup selesai', 'folderId', '') +
        field('Ketik RESTORE KE STAGING', 'confirmation', '') +
        '<button class="btn btn-outline-dark" type="submit">' + buttonLabel('restore', 'Buat Salinan Pemulihan') + '</button>' +
        '</form>' : '') + '</section>';
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
          return '<option value="' + status + '">' + safe(fulfillmentLabel(status)) + '</option>';
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
      '<div class="table-wrap"><table class="table orders-table"><thead><tr>' +
      '<th>No. Pesanan</th><th>Nama Konsumen</th><th>No HP Konsumen</th><th>Jadwal (WITA)</th><th>Total</th><th>Status</th><th class="record-action-cell">Aksi</th>' +
      '</tr></thead><tbody>' + orders.map(function (order) {
        const phone = String(order.phone || '');
        const contact = state.user.role === 'Viewer' ? '-' : safe(phone);
        return '<tr><td>' + safe(order.id) + '</td><td>' + safe(order.name || '-') +
          '</td><td>' + contact + '</td><td>' + safe(dateText(order.date) + ' ' + order.time) + '</td><td>' + rupiah(order.total) +
          '</td><td>' + safe(paymentLabel(order.paymentStatus) + ' / ' + fulfillmentLabel(order.fulfillment)) +
          '</td><td class="record-action-cell">' + iconButton('eye', 'Lihat detail pesanan ' + order.id,
            'data-order="' + safe(order.id) + '"', 'Detail') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="d-flex align-items-center gap-2 mt-3">' +
      '<button class="btn btn-outline-dark" id="previous-orders" type="button"' +
      (state.listPage === 0 ? ' disabled' : '') + '>' + buttonLabel('back', 'Sebelumnya') + '</button>' +
      '<span>' + (state.listPage + 1) + ' / ' + pageCount + '</span>' +
      '<button class="btn btn-outline-dark" id="next-orders" type="button"' +
      (state.listPage + 1 >= pageCount ? ' disabled' : '') + '>' + buttonLabel('next', 'Berikutnya') + '</button></div>';
  }

  // Detail pesanan memisahkan tagihan tersimpan dari tindakan pembayaran dan kurir.
  function orderEditor(id) {
    const order = state.admin.tables.Orders.find(function (row) { return row.id === id; });
    // Tampilkan struk terbaru saja; berkas lama tetap tersimpan untuk riwayat.
    const seen = new Set();
    const files = (state.admin.tables.Files || []).filter(function (row) { return row.orderId === id; })
      .slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); })
      .filter(function (file) {
        const key = file.kind === 'STRUK' ? 'STRUK' : file.driveFileId;
        if (seen.has(key)) { return false; }
        seen.add(key);
        return true;
      });
    showEditor('Detail Pesanan', '<p class="text-break">' + safe(id) + '</p>' +
      (state.user.role !== 'Viewer' ? '<p>' + safe(order.name + ' | ' + order.phone) +
        '</p><p>' + safe(order.address) + '</p>' : '') +
      orderCharges(order) + orderStatusPanel(order) +
      (state.user.role !== 'Viewer' ? '<div class="d-flex gap-2 flex-wrap mb-3 order-detail-buttons">' +
      files.map(function (file) {
        return '<button class="btn btn-outline-dark" data-file="' + safe(file.driveFileId) +
          '" type="button">' + buttonLabel('eye', file.kind === 'STRUK'
            ? 'Lihat Struk' : file.kind === 'TANDATERIMA' ? 'Lihat Tanda Terima' : 'Lihat ' + file.kind) + '</button>';
      }).join('') + '<button class="btn btn-green" data-invoice="' + safe(id) +
      '" type="button">' + buttonLabel('download', 'Invoice PDF') + '</button></div><hr>' : '') +
      (canManageMaster('Pesanan') ? '<form id="order-action-form" data-id="' + safe(id) + '">' +
      '<h2 class="h5">Tindakan Admin</h2>' +
      selectField('Tindakan', 'action', [
        ['', 'Pilih tindakan terlebih dahulu'],
        ['verifyPayment', 'Verifikasi pembayaran dari transaksi masuk'],
        ['fulfillment', 'Ubah tahap pesanan'],
        ['shipping', 'Catat kurir dan pelacakan']
      ], '') +
      '<p id="order-action-help" class="order-notice small" role="status" aria-live="polite">' +
      'Pilih tindakan untuk melihat kegunaannya dan mengaktifkan isian yang diperlukan.</p>' +
      '<div class="order-action-grid">' +
      selectField('Tahap (untuk ubah tahap)', 'status', [
        ['', 'Pilih tahap'],
        ['CONFIRMED', 'Dikonfirmasi'], ['PREPARING', 'Mulai disiapkan'],
        ['READY', 'Siap'], ['DISPATCHED', 'Dikirim'], ['COMPLETED', 'Selesai']
      ], '', true) +
      field('Nominal pembayaran pesanan', 'amount', '', 'number', false, true) +
      field('Referensi transaksi pembayaran', 'reference', '', 'text', false, true) +
      field('Nama kurir', 'courier', '', 'text', false, true) +
      field('Nomor/link pelacakan', 'tracking', '', 'text', false, true) + '</div>' +
      '<div id="order-action-result" role="status" aria-live="polite"></div>' +
      '<div class="d-flex justify-content-center"><button class="btn btn-primary btn-sm" type="submit" disabled>' +
      buttonLabel('check', 'Jalankan Tindakan') + '</button></div></form><hr>' : ''));
  }

  // Setiap tindakan menentukan isian aktif, kewajiban isian, dan petunjuk penggunaan.
  function orderActionRules(action) {
    return {
      verifyPayment: {
        fields: ['amount', 'reference'], required: ['amount', 'reference'],
        help: 'Gunakan setelah uang benar-benar masuk ke rekening toko. Isi nominal sesuai total pembayaran pesanan (termasuk ongkir pada pesanan baru) dan referensi transaksi bank. Bukti transfer saja belum cukup.'
      },
      fulfillment: {
        fields: ['status'], required: ['status'],
        help: 'Gunakan ketika pesanan maju ke tahap berikutnya. Pengiriman memerlukan pembayaran lunas termasuk ongkir pilihan pelanggan. Untuk Selesai, konsumen harus mengunggah tanda terima melalui Status Pesanan terlebih dahulu.'
      },
      shipping: {
        fields: ['courier', 'tracking'], required: [],
        help: 'Gunakan untuk mencatat nama kurir dan nomor atau tautan pelacakan. Biaya pengiriman sudah ditentukan saat Checkout dan tidak diubah di sini. Setelah pengiriman dimulai, pilih Ubah tahap pesanan untuk menetapkan Sedang dikirim.'
      }
    }[action] || null;
  }

  // Aktifkan hanya isian tindakan terpilih dan hapus nilai dari tindakan sebelumnya.
  function updateOrderAction(form) {
    form.querySelector('#order-action-result').innerHTML = '';
    const action = form.elements.action.value;
    const rule = orderActionRules(action);
    const order = state.admin.tables.Orders.find(function (row) { return row.id === form.dataset.id; });
    const shipping = (state.admin.tables.Shipping || []).find(function (row) { return row.orderId === order.id; });
    const fields = ['status', 'amount', 'reference', 'courier', 'tracking'];
    fields.forEach(function (name) {
      const input = form.elements[name];
      input.disabled = !rule || !rule.fields.includes(name);
      input.required = !!rule && rule.required.includes(name);
      if (input.type === 'checkbox') { input.checked = false; } else { input.value = ''; }
    });
    form.querySelector('label[for="f-amount"]').textContent = 'Nominal pembayaran pesanan (Rp)';
    const amount = form.elements.amount;
    amount.min = action === 'verifyPayment' ? '1' : '0';
    amount.step = '1';
    if (action === 'verifyPayment') { amount.value = order.total; }
    if (action === 'shipping' && shipping) {
      form.elements.courier.value = shipping.courier || '';
      form.elements.tracking.value = shipping.tracking || '';
    }
    // Batasi pilihan tahap berikutnya sesuai urutan yang juga dijaga backend.
    const next = { NEW: ['CONFIRMED'], CONFIRMED: ['PREPARING'], PREPARING: ['READY'],
      READY: order.receipt === 'DELIVERY' ? ['DISPATCHED'] : ['COMPLETED'], DISPATCHED: ['COMPLETED'] };
    const stages = next[order.fulfillment] || [];
    form.elements.status.innerHTML = '<option value="">Pilih tahap berikutnya</option>' +
      stages.map(function (status) {
        return '<option value="' + status + '">' + safe(fulfillmentLabel(status)) + '</option>';
      }).join('');
    let unavailable = '';
    if (action === 'fulfillment' && !stages.length) { unavailable = 'Tidak ada tahap lanjutan untuk pesanan ini.'; }
    if (action === 'shipping' && order.receipt !== 'DELIVERY') { unavailable = 'Pesanan ini diambil di toko; data kurir tidak diperlukan.'; }
    if (action === 'verifyPayment' && (order.paymentStatus === 'PAID' || order.fulfillment === 'CANCELLED')) {
      unavailable = 'Pesanan ini sudah lunas atau dibatalkan; pembayaran tidak perlu dicatat lagi.';
    }
    if (unavailable) {
      fields.forEach(function (name) { form.elements[name].disabled = true; form.elements[name].required = false; });
    }
    form.querySelector('[type="submit"]').disabled = !rule || !!unavailable;
    form.querySelector('#order-action-help').textContent = unavailable || (rule ? rule.help
      : 'Pilih tindakan untuk melihat kegunaannya dan mengaktifkan isian yang diperlukan.');
  }

  // Form master dikonfigurasi per tabel agar tidak menampilkan password hash.
  function masterFields(table, row) {
    const products = (state.admin.tables.Products || []).map(function (item) {
      return [item.id, (item.code ? item.code + ' - ' : '') + item.name];
    });
    let html = '';
    if (['Categories', 'Products'].includes(table)) {
      html += '<div class="mb-3"><label class="form-label" for="master-code">' +
        (table === 'Categories' ? 'ID Kategori' : 'ID Produk') + '</label>' +
        '<input class="form-control" id="master-code" type="text" readonly ' +
        'placeholder="Dibuat otomatis saat disimpan" value="' + safe(row.code || '') + '"></div>';
    }
    if (table === 'Categories') {
      html += field('Awalan ID Produk (2 huruf)', 'productPrefix', row.productPrefix, 'text', false)
        .replace('<input ', '<input maxlength="2" ' + (row.productPrefix ? 'readonly ' : ''));
      html += '<p class="small">Kosongkan agar otomatis mengikuti nama kategori, misalnya Snack: SN. Awalan tetap setelah disimpan.</p>';
    }
    if (['Categories', 'Products', 'ServiceAreas', 'ShippingRates', 'Users'].includes(table)) {
      html += field('Nama', 'name', row.name);
    }
    if (table === 'ShippingRates') {
      html += field('Biaya pengiriman (Rp)', 'price', row.price, 'number');
      html += '<p class="small">Tarif tetap untuk layanan ini. Perubahan hanya berlaku pada pesanan baru.</p>';
    }
    if (table === 'Products') {
      html += selectField('Kategori', 'categoryId',
        (state.admin.tables.Categories || []).map(function (item) {
          return [item.id, (item.code ? item.code + ' - ' : '') + item.name];
        }), row.categoryId);
      html += field('Harga rupiah', 'price', row.price, 'number');
      html += '<div class="row"><div class="col-sm-4">' +
        selectField('Satuan', 'unit', [
          ['', 'Pilih satuan'], ['Biji', 'Biji'], ['Slice', 'Slice'], ['Paket', 'Paket'],
          ['Loyang', 'Loyang'], ['Cup', 'Cup'], ['Botol', 'Botol']
        ], row.unit === 'Slace' ? 'Slice' : row.unit || '') + '</div><div class="col-sm-4">' +
        '<div class="mb-3"><label class="form-label" for="f-sizeValue">Nilai ukuran</label>' +
        '<input class="form-control" id="f-sizeValue" name="sizeValue" type="number" ' +
        'inputmode="decimal" min="0" max="1000000000" step="any" placeholder="Contoh: 100" ' +
        'value="' + safe(row.sizeValue ?? '') + '"></div></div><div class="col-sm-4">' +
        selectField('Unit ukuran', 'sizeUnit', [
          ['', 'Pilih ukuran'], ['ml', 'ml'], ['gr', 'gr']
        ], row.sizeUnit || '') + '</div></div>';
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
        ['Admin', 'Admin'], ['Operator', 'Operator'], ['Viewer', 'Viewer'], ['Konsumen', 'Konsumen']
      ], row.role);
      html += field('Email', 'email', row.email, 'email', false);
      html += field('Nomor WhatsApp', 'phone', row.phone, 'tel', false);
      html += userPermissionFields(row, false);
      if (!row.id) {
        html += field('Password sementara (minimal 6 karakter)', 'password', '', 'password');
      }
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

  // Menampilkan tabel master dengan kelompok ikon aksi yang ringkas.
  function renderMaster(table) {
    if (state.masterTable !== table) {
      state.masterTable = table;
      state.masterPage = 0;
      state.masterSearch = '';
    }
    if (table === 'Users') { renderUsers(); return; }
    const rows = state.admin.tables[table] || [];
    const editable = canManageMaster(table);
    // Kolom tambahan merupakan tampilan saja, tidak mengubah schema penyimpanan.
    const keys = rows.length ? Object.keys(rows[0]).filter(function (key) {
      return !['id', 'photoFileId', 'updatedAt', 'mustChangePassword'].includes(key) &&
        !(table === 'Products' && ['sizeValue', 'categoryId'].includes(key));
    }) : [];
    // Ketika tabel kosong, judul kolom tetap mengikuti schema menu (tanpa migrasi).
    if (!keys.length && !rows.length) {
      const emptyColumns = {
        Categories: ['code', 'name', 'active'],
        Products: ['code', 'name', 'description', 'price', 'unit', 'sizeUnit', 'active'],
        ReadyStock: ['productId', 'capacity'],
        PreorderCapacity: ['productId', 'date', 'capacity'],
        Discounts: ['productId', 'type', 'value', 'startsAt', 'endsAt', 'active'],
        Vouchers: ['code', 'type', 'value', 'minimum', 'maximum', 'startsAt', 'endsAt', 'orderType', 'active'],
        ShippingRates: ['name', 'price', 'active']
      };
      if (emptyColumns[table]) { keys.push(...emptyColumns[table]); }
    }
    if (keys.includes('code')) { keys.unshift(keys.splice(keys.indexOf('code'), 1)[0]); }
    if (['ReadyStock', 'PreorderCapacity', 'Discounts'].includes(table)) {
      const position = keys.indexOf('productId');
      if (position >= 0) { keys.splice(position + 1, 0, 'productName'); }
      if (table === 'PreorderCapacity' && !keys.includes('remaining')) { keys.push('remaining'); }
    }
    // Hubungkan master melalui Products.id (field database asli), bukan judul HTML.
    // Normalisasi spasi untuk kompatibilitas data impor; kode produk hanya fallback
    // bila unik, agar produk dengan kode ganda tidak salah dipasangkan.
    const productLookup = new Map();
    const codeCounts = new Map();
    (state.admin.tables.Products || []).forEach(function (item) {
      const code = String(item.code || '').trim();
      if (code) { codeCounts.set(code, (codeCounts.get(code) || 0) + 1); }
    });
    (state.admin.tables.Products || []).forEach(function (item) {
      const id = String(item.id || '').trim();
      const code = String(item.code || '').trim();
      if (id) { productLookup.set(id, item); }
      if (code && codeCounts.get(code) === 1 && !productLookup.has(code)) {
        productLookup.set(code, item);
      }
    });
    const findProduct = function (row) {
      return productLookup.get(String(row.productId || '').trim());
    };
    const cellValue = function (row, key) {
      if (key === 'productName') {
        const product = findProduct(row);
        return product ? product.name : 'Produk Tidak Ditemukan';
      }
      if (key === 'productId') {
        const product = findProduct(row);
        return product ? product.code || product.id : row.productId;
      }
      if (key === 'remaining') { return row.remaining === undefined ? '-' : row.remaining; }
      if (['Discounts', 'Vouchers'].includes(table)) {
        if (key === 'type') { return promoTypeLabel(row.type); }
        if (key === 'value') { return promoValueText(row); }
        if (key === 'orderType') { return orderTypeLabel(row.orderType); }
      }
      const value = table === 'Products' && key === 'sizeUnit'
        ? [row.sizeValue, row.sizeUnit].filter(function (part) {
          return part !== '' && part !== undefined && part !== null;
        }).join(' ') : table === 'Products' && key === 'unit' && row.unit === 'Slace'
          ? 'Slice' : row[key];
      return masterText(key, value);
    };
    const query = table === 'Products' ? String(state.masterSearch || '').trim().toLowerCase() : '';
    const matched = query ? rows.filter(function (row) {
      return keys.map(function (key) { return String(cellValue(row, key)); }).join(' ').toLowerCase().includes(query);
    }) : rows;
    const pages = Math.max(1, Math.ceil(matched.length / 10));
    state.masterPage = Math.max(0, Math.min(pages - 1, Math.floor(Number(state.masterPage) || 0)));
    const visible = table === 'Products' ? matched.slice(state.masterPage * 10, state.masterPage * 10 + 10) : rows;
    document.getElementById('admin-body').innerHTML = '<section class="panel">' +
      '<div class="d-flex justify-content-between gap-2 mb-3"><h2 class="h4">' +
      safe(tableLabels[table]) + '</h2>' + (editable ? '<button class="btn btn-primary btn-sm" data-new="' +
      safe(table) + '" type="button">' + buttonLabel('plus', 'Tambah') + '</button>' : '') + '</div>' +
      '<input class="form-control mb-3" id="master-search" placeholder="Cari data..." aria-label="Cari data" ' +
      'value="' + safe(table === 'Products' ? state.masterSearch || '' : '') + '">' +
      '<div class="table-wrap"><table class="table' + (table === 'Products' ? ' products-table' : '') +
      (table === 'Vouchers' ? ' vouchers-table' : '') +
      '"><thead><tr>' +
      keys.map(function (key) {
        const label = { weekday: 'Hari', opens: 'Jam buka WITA', closes: 'Jam tutup WITA',
          description: 'Keterangan', type: 'Tipe', value: 'Nilai', maximum: 'Maksimum', orderType: 'Jenis Pesanan',
          active: 'Aktif', name: table === 'Categories' ? 'Nama Kategori' : table === 'Products' ? 'Nama Produk' : table === 'ShippingRates' ? 'Jenis Pengiriman' : 'Nama', price: table === 'ShippingRates' ? 'Biaya Pengiriman (Rp)' : 'Harga',
          date: 'Tanggal', startsAt: 'Mulai WITA', endsAt: 'Berakhir WITA',
          unit: 'Satuan', sizeUnit: 'Ukuran', productPrefix: 'Awalan ID Produk',
          code: table === 'Categories' ? 'ID Kategori' : table === 'Vouchers' ? 'ID Voucher' : 'ID Produk',
          productId: 'ID Produk', productName: 'Nama Produk',
          capacity: ['ReadyStock', 'PreorderCapacity'].includes(table) ? 'Stok' : 'Kapasitas', remaining: 'Sisa Stok' };
        return '<th' + (table === 'Products' && ['description', 'name'].includes(key)
          ? ' class="product-' + key + '-column"' : '') +
          '>' + safe(label[key] || key) + '</th>';
      }).join('') +
      '<th class="record-action-cell">Aksi</th></tr></thead><tbody id="master-rows">' +
      visible.map(function (row) {
        return '<tr>' + keys.map(function (key) {
          return '<td' + (table === 'Products' && ['description', 'name'].includes(key)
            ? ' class="product-' + key + '-column"' : '') +
            '>' + safe(cellValue(row, key)) + '</td>';
        }).join('') + '<td class="record-action-cell">' + (editable ? '<div class="record-actions">' +
          iconButton('edit', 'Edit ' + tableLabels[table], 'data-edit="' + safe(row.id) +
            '" data-table="' + safe(table) + '"', 'Edit') +
          iconButton('trash', 'Hapus ' + tableLabels[table], 'data-delete="' + safe(row.id) +
            '" data-table="' + safe(table) + '"', 'Hapus') +
          (table === 'Products' ? iconButton('photo', 'Unggah foto produk',
            'data-product-upload="' + safe(row.id) + '"', 'Foto') : '') + '</div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (!rows.length ? '<p>Belum ada data. Tambahkan data aktual toko.</p>'
        : !matched.length ? '<p role="status">Tidak ada record yang sesuai pencarian.</p>' : '') +
      (table === 'Products' && rows.length >= 10
        ? '<nav class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3" ' +
          'aria-label="Halaman Setup Produk"><span class="small" role="status">Halaman ' +
          (state.masterPage + 1) + ' dari ' + pages + ' | ' + matched.length + ' record</span>' +
          '<div class="d-flex gap-2"><button class="btn btn-outline-dark btn-sm" id="previous-master" type="button"' +
          (state.masterPage === 0 ? ' disabled' : '') + '>Sebelum</button>' +
          '<button class="btn btn-outline-dark btn-sm" id="next-master" type="button"' +
          (state.masterPage >= pages - 1 ? ' disabled' : '') + '>Sesudahnya</button></div></nav>' : '') + '</section>';
  }

  // Membuka formulir tambah atau edit sesuai jenis tabel dan data yang dipilih.
  function editMaster(table, id) {
    const row = (state.admin.tables[table] || []).find(function (item) { return item.id === id; }) || {};
    showEditor((id ? 'Edit ' : 'Tambah ') + tableLabels[table],
      '<form id="master-form" data-table="' + safe(table) + '" data-id="' + safe(id || '') + '">' +
      masterFields(table, row) +
      '<button class="btn btn-primary" type="submit">' + buttonLabel('save', 'Simpan') + '</button></form>');
  }

  // Konfirmasi kustom sebelum penghapusan; backend menolak data yang masih dipakai.
  function deleteMasterDialog(table, id) {
    const row = (state.admin.tables[table] || []).find(function (item) { return item.id === id; });
    if (!canManageMaster(table) || !row) {
      throw new Error('Data tidak ditemukan atau Anda tidak berwenang menghapusnya.');
    }
    showEditor('Hapus ' + tableLabels[table],
      '<form id="delete-master-form" data-table="' + safe(table) + '" data-id="' + safe(id) + '">' +
      '<p>Apa yakin record ini akan dihapus?</p>' +
      '<div id="delete-master-result" role="status" aria-live="polite"></div>' +
      '<div class="d-flex justify-content-center"><button class="btn btn-danger btn-sm" type="submit">' +
      buttonLabel('trash', 'Hapus') + '</button></div></form>');
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
    html += selectField('Pembulatan diskon', 'discountRounding',
      [['', 'Pilih aturan'], ['NEAREST', 'Rupiah terdekat'], ['UP', 'Ke atas'], ['DOWN', 'Ke bawah']], config.discountRounding);
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
    if (!canManageMaster('Pengaturan')) {
      document.getElementById('admin-body').querySelectorAll('input, select, button').forEach(function (element) {
        element.disabled = true;
      });
    }
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
          .map(function (status) { return [status, fulfillmentLabel(status)]; })
      ], '') + '<button class="btn btn-green" type="submit">' + buttonLabel('report', 'Tampilkan') + '</button></form>' +
      '<div id="report-result" class="mt-4"></div></section>';
  }

  // Data historis refund tidak dihapus dari server; hanya disembunyikan dari laporan.
  function renderReport() {
    const report = state.report;
    const rows = reportDisplayRows();
    document.getElementById('report-result').innerHTML =
      '<p>Pembayaran diterima: ' + rupiah(report.summary.payments) + '</p>' +
      '<p class="small">Periode berdasarkan tanggal pesanan WITA. Pembayaran termasuk ongkir pada pesanan baru. Total penerimaan bukan laba.</p>' +
      '<div class="d-flex gap-2 mb-3"><button class="btn btn-primary" id="export-xlsx" type="button">' +
      buttonLabel('report', 'Excel .xlsx') + '</button><button class="btn btn-outline-dark" id="export-pdf" type="button">' +
      buttonLabel('download', 'PDF') + '</button></div><div class="table-wrap"><table class="table hv-report-table"><thead><tr>' +
      reportColumns.map(function (column) { return '<th>' + safe(column[1]) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (row) {
        return '<tr>' + reportColumns.map(function (column) { return '<td>' + safe(row[column[1]]) + '</td>'; }).join('') + '</tr>';
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
    const rows = reportDisplayRows().map(function (row) {
      const result = {};
      Object.keys(row).forEach(function (key) {
        const value = row[key];
        result[key] = typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
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
    const keys = reportColumns.map(function (column) { return column[1]; });
    const rows = reportDisplayRows();
    pdf.autoTable({
      startY: 24,
      head: [keys],
      body: rows.map(function (row) { return keys.map(function (key) { return String(row[key] ?? ''); }); }),
      styles: { fontSize: 7, overflow: 'linebreak' },
      headStyles: { fillColor: [6, 91, 85] },
      didDrawPage: function (data) {
        pdf.text('Halaman ' + data.pageNumber, 14, 200);
      }
    });
    pdf.save('Healthy-Vibes-Laporan.pdf');
  }

  // Foto produk cukup 800px; dokumen dan QRIS tetap memakai ukuran sebelumnya.
  async function photoData(file, productPhoto) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Pilih gambar JPG, PNG, atau WebP.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Gambar maksimal 5 MB sebelum optimasi.');
    }
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, (productPhoto ? 800 : 1200) / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const encoded = canvas.toDataURL('image/jpeg', productPhoto ? 0.8 : 0.85);
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
    if (button.dataset.catalogView === 'grid' || button.dataset.catalogView === 'list') {
      state.catalogView = button.dataset.catalogView;
      document.querySelectorAll('[data-catalog-view]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item.dataset.catalogView === state.catalogView));
      });
      renderProducts();
      return;
    }
    if (Object.prototype.hasOwnProperty.call(button.dataset, 'categoryPill')) {
      state.productCategory = button.dataset.categoryPill;
      state.productPage = 0;
      document.querySelectorAll('[data-category-pill]').forEach(function (pill) {
        pill.setAttribute('aria-pressed', String(pill.dataset.categoryPill === state.productCategory));
      });
      renderProducts();
      return;
    }
    if (button.dataset.type) {
      state.type = button.dataset.type;
      state.cart = {};
      state.quote = null;
      state.requestId = '';
      return loadCatalog();
    }
    if (button.dataset.productPage) {
      state.productPage += button.dataset.productPage === 'next' ? 1 : -1;
      renderProducts();
      document.getElementById('products').scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Fokus tetap pada navigasi halaman setelah tombol dibuat ulang.
      const next = document.querySelector('[data-product-page="' + button.dataset.productPage + '"]:not(:disabled)') ||
        document.querySelector('[data-product-page]:not(:disabled)');
      if (next) { next.focus({ preventScroll: true }); }
      return;
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
      // Keranjang HP berada dalam dialog, jadi jumlah dan totalnya juga diperbarui.
      if (dialog.open && document.getElementById('editor-content').querySelector('.cart-quantity')) {
        showEditor('Keranjang', renderCart());
      }
      return;
    }
    if (button.dataset.adminPage) {
      state.adminPage = button.dataset.adminPage;
      state.listPage = 0;
      return loadAdmin();
    }
    if (button.dataset.new || button.dataset.edit) {
      editMaster(button.dataset.new || button.dataset.table, button.dataset.edit);
      return;
    }
    if (button.dataset.delete) {
      deleteMasterDialog(button.dataset.table, button.dataset.delete);
      return;
    }
    if (button.dataset.userView) { viewUser(button.dataset.userView); return; }
    if (button.dataset.userReset) { resetUserDialog(button.dataset.userReset); return; }
    if (button.dataset.myOrder) {
      const token = state.token;
      const order = await rpc('myOrderStatus', { orderId: button.dataset.myOrder });
      if (token !== state.token || state.page !== 'status') { return; }
      state.order = order;
      renderOrder();
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
    } else if (id === 'checkout-login') {
      const form = document.getElementById('checkout-form');
      const data = formData(form);
      ['name', 'phone', 'receipt', 'shippingRateId', 'areaId', 'address', 'time'].forEach(function (key) {
        state.recipient[key] = data[key] || '';
      });
      state.checkoutResume = true;
      await navigate('admin');
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
      const token = state.token;
      const order = await rpc('myOrderStatus', {
        orderId: state.order.id
      });
      if (token !== state.token || state.page !== 'status') { return; }
      state.order = order;
      renderOrder();
    } else if (id === 'download-invoice') {
      const token = state.token;
      const file = await rpc('myInvoice', {
        orderId: state.order.id
      });
      if (token === state.token && state.page === 'status') { saveDownload(file); }
    } else if (id === 'change-password') {
      passwordDialog();
    } else if (id === 'toggle-login-password') {
      toggleLoginPassword(button);
    } else if (id === 'forgot-password') {
      showEditor('Lupa Password', '<form id="request-reset-form">' +
        field('Username', 'username', document.querySelector('#login-form [name="username"]')?.value) +
        selectField('Kirim tautan melalui', 'channel', [['email', 'Email'], ['whatsapp', 'WhatsApp']], 'email') +
        '<div id="request-reset-result" role="status"></div><button class="btn btn-primary btn-sm" type="submit">' +
        buttonLabel('key', 'Kirim Tautan') + '</button></form>');
    } else if (id === 'logout' || button.dataset.action === 'logout') {
      await rpc('logout');
      state.token = '';
      state.user = null;
      state.admin = null;
      state.masterTable = '';
      state.masterPage = 0;
      state.masterSearch = '';
      state.customerOrders = null;
      state.customerPage = 0;
      state.order = null;
      state.recipient = {};
      state.checkoutResume = false;
      await navigate('admin');
    } else if (id === 'previous-my-orders' || id === 'next-my-orders') {
      state.customerPage += id === 'next-my-orders' ? 1 : -1;
      await loadMyOrders();
    } else if (id === 'refresh-admin') {
      await loadAdmin();
    } else if (id === 'previous-orders' || id === 'next-orders') {
      state.listPage += id === 'next-orders' ? 1 : -1;
      filterOrders();
    } else if (id === 'previous-master' || id === 'next-master') {
      if (state.masterTable !== 'Products') { return; }
      state.masterPage += id === 'next-master' ? 1 : -1;
      renderMaster('Products');
      document.getElementById('admin-body').scrollIntoView({ behavior: 'smooth', block: 'start' });
      const current = document.getElementById(id);
      const focus = current && current.disabled ? document.getElementById(id === 'next-master' ? 'previous-master' : 'next-master') : current;
      if (focus && !focus.disabled) { focus.focus({ preventScroll: true }); }
    } else if (id === 'backup') {
      button.disabled = true;
      try {
        if (await confirmAction('Apa yakin membuat backup?', 'Konfirmasi')) {
          const result = await rpc('backup');
          notify('Backup selesai: ' + result.folderUrl);
        }
      } finally {
        button.disabled = false;
      }
    } else if (id === 'export-xlsx') {
      await exportXlsx();
    } else if (id === 'export-pdf') {
      await exportPdf();
    }
  }

  // Memperbarui hasil pencarian dan filter segera saat pengguna mengubah isian.
  document.addEventListener('input', function (event) {
    if (['product-search', 'availability-filter'].includes(event.target.id)) {
      state.productPage = 0;
      state.productSearch = document.getElementById('product-search').value;
      document.querySelectorAll('[data-category-pill]').forEach(function (pill) {
        pill.setAttribute('aria-pressed', String(pill.dataset.categoryPill === state.productCategory));
      });
      if (event.target.id === 'availability-filter') { state.availableOnly = event.target.checked; }
      renderProducts();
    } else if (['order-search', 'order-filter'].includes(event.target.id)) {
      state.listPage = 0;
      filterOrders();
    } else if (event.target.id === 'master-search') {
      if (state.masterTable === 'Products') {
        state.masterSearch = event.target.value;
        state.masterPage = 0;
        const start = event.target.selectionStart;
        const end = event.target.selectionEnd;
        renderMaster('Products');
        const input = document.getElementById('master-search');
        input.focus();
        input.setSelectionRange(start, end);
        return;
      }
      const query = event.target.value.toLowerCase();
      document.querySelectorAll('#master-rows tr').forEach(function (row) {
        row.hidden = !row.textContent.toLowerCase().includes(query);
      });
    }
  });

  // Perubahan pilihan tindakan langsung mengatur input yang berkaitan saja.
  document.addEventListener('change', function (event) {
    if (event.target.form?.id === 'checkout-form' && state.checkoutStep === 1 &&
      ['receipt', 'shippingRateId'].includes(event.target.name)) {
      const form = event.target.form;
      updateCheckoutDelivery(form);
      state.quote = null;
      const rate = form.elements.receipt.value === 'DELIVERY'
        ? state.catalog.shippingRates.find(function (row) { return row.id === form.elements.shippingRateId.value; }) : null;
      const fee = rate ? Number(rate.price) : 0;
      document.getElementById('checkout-shipping-fee').textContent = rupiah(fee);
      document.getElementById('checkout-total').textContent = rupiah(cartSummary().total + fee);
    }
    if (event.target.name === 'action' && event.target.form?.id === 'order-action-form') {
      updateOrderAction(event.target.form);
    }
    if (event.target.name === 'role' && event.target.form?.dataset.table === 'Users') {
      const role = event.target.value;
      const defaults = defaultUserPermissions(role);
      event.target.form.querySelectorAll('[name="permission"]').forEach(function (checkbox) {
        checkbox.checked = defaults.includes(checkbox.value);
        checkbox.disabled = role === 'Konsumen';
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
      if (['login-form', 'order-action-form', 'handover-form', 'delete-master-form',
        'request-reset-form', 'admin-reset-form', 'complete-reset-form'].includes(form.id)) {
        const selector = form.id === 'login-form' ? '#login-error'
          : form.id === 'handover-form' ? '#handover-result'
            : form.id === 'delete-master-form' ? '#delete-master-result'
              : ['request-reset-form', 'admin-reset-form', 'complete-reset-form'].includes(form.id)
                ? '[role="status"]' : '#order-action-result';
        const result = form.querySelector(selector);
        if (result) {
          result.innerHTML = '<p class="alert alert-danger">' + safe(error.message) + '</p>';
          result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else {
        notify(error.message, true);
      }
    } finally {
      submit.disabled = false;
    }
  });

  // Mengirim formulir yang sesuai ke backend, lalu memperbarui tampilan dan pesan hasil.
  async function submitAction(form) {
    const data = formData(form);
    if (form.id === 'checkout-form') {
      await submitCheckout(form);
    } else if (form.id === 'login-form') {
      form.querySelector('#login-error').textContent = '';
      const result = await rpc('login', data);
      state.token = result.token;
      state.user = result.user;
      renderAccountHeader();
      state.admin = null;
      state.report = null;
      state.adminPage = result.user.permissions?.[0] || 'Dashboard';
      form.reset();
      if (result.user.mustChangePassword) {
        passwordDialog();
      } else if (result.user.role === 'Konsumen') {
        state.customerOrders = null;
        state.customerPage = 0;
        if (state.checkoutResume && cartLines().length) {
          state.checkoutResume = false;
          const entered = {};
          const hasRecipient = ['name', 'phone', 'address', 'areaId', 'shippingRateId'].some(function (key) {
            return Boolean(state.recipient[key]);
          });
          Object.keys(state.recipient).forEach(function (key) {
            if (state.recipient[key] && (hasRecipient || !['receipt', 'time'].includes(key))) {
              entered[key] = state.recipient[key];
            }
          });
          state.recipient = Object.assign({}, result.user.delivery || {}, entered);
          renderCheckout();
        } else {
          await navigate('status');
        }
      } else {
        state.checkoutResume = false;
        await loadAdmin();
      }
    } else if (form.id === 'password-form') {
      await rpc('changePassword', data);
      state.token = '';
      state.user = null;
      dialog.close();
      await navigate('admin');
      notify('Password diganti. Silakan login kembali.');
    } else if (['proof-form', 'handover-form', 'product-photo-form'].includes(form.id)) {
      if (form.id === 'handover-form' && data.received !== 'on') {
        throw new Error('Konfirmasi bahwa produk sudah diterima terlebih dahulu.');
      }
      const customer = form.id !== 'product-photo-form';
      const token = state.token;
      const order = customer ? state.order : null;
      const photo = await photoData(form.elements.photo.files[0], form.id === 'product-photo-form');
      if (customer && (token !== state.token || order !== state.order || state.page !== 'status')) { return; }
      await rpc(customer ? 'myOrderUpload' : 'upload', Object.assign({}, photo, {
        requestId: crypto.randomUUID(),
        kind: form.id === 'handover-form' ? 'TANDATERIMA' : customer ? 'STRUK' : 'PRODUK',
        orderId: customer ? state.order.id : '',
        productId: form.id === 'product-photo-form' ? form.dataset.id : '',
        received: form.id === 'handover-form' && data.received === 'on'
      }));
      if (customer && (token !== state.token || state.page !== 'status')) { return; }
      if (form.id === 'handover-form') {
        state.order.handoverUploaded = true;
        renderOrder();
        notify('Tanda terima tersimpan. Admin dapat memeriksa dan menyelesaikan pesanan.');
      } else {
        notify('Berkas tersimpan privat. Bukti transfer tidak otomatis melunasi pesanan.');
      }
      if (!customer) {
        dialog.close();
        await loadAdmin();
      }
    } else if (form.id === 'delete-master-form') {
      await rpc('deleteMaster', { table: form.dataset.table, id: form.dataset.id, confirmed: true });
      dialog.close();
      await loadAdmin();
      state.catalog = null;
      notify('Record berhasil dihapus.');
    } else if (form.id === 'master-form') {
      data.id = form.dataset.id;
      if (form.dataset.table === 'Users') {
        data.permissions = Array.from(form.querySelectorAll('[name="permission"]:checked:not(:disabled)'))
          .map(function (checkbox) { return checkbox.value; });
      }
      data.active = data.active !== 'false';
      ['startsAt', 'endsAt'].forEach(function (key) {
        if (data[key]) {
          data[key] = fromWitaInput(data[key]);
        }
      });
      await rpc('saveMaster', { table: form.dataset.table, record: data });
      dialog.close();
      if (form.dataset.table === 'Users' && data.id === state.user.id) {
        state.token = '';
        state.user = null;
        await navigate('admin');
        notify('Akun diperbarui. Silakan login.');
      } else {
        await loadAdmin();
        notify('Berhasil tersimpan.');
      }
    } else if (form.id === 'request-reset-form' || form.id === 'admin-reset-form') {
      if (form.id === 'admin-reset-form') {
        await rpc('sendPasswordReset', { userId: form.dataset.id, channel: data.channel });
      } else {
        await rpc('requestPasswordReset', data);
      }
      form.querySelector('[role="status"]').innerHTML =
        '<p class="alert alert-success">Jika akun dan kontak terdaftar, tautan reset akan dikirim.</p>';
      const message = form.querySelector('[role="status"] .alert-success');
      setTimeout(function () { message.remove(); }, 4000);
    } else if (form.id === 'complete-reset-form') {
      if (data.newPassword !== data.repeatPassword) { throw new Error('Password ulang tidak sama.'); }
      await rpc('completePasswordReset', { resetToken: form.dataset.token, newPassword: data.newPassword });
      state.token = '';
      state.user = null;
      state.page = 'admin';
      renderLogin();
      notify('Password diperbarui. Silakan login.');
    } else if (form.id === 'settings-form') {
      await rpc('saveSettings', { values: data });
      await loadAdmin();
      notify('Berhasil tersimpan.');
    } else if (form.id === 'store-asset-form') {
      const photo = await photoData(form.elements.photo.files[0]);
      await rpc('uploadStoreAsset', Object.assign({}, photo, { asset: data.asset }));
      await loadAdmin();
      notify('Berhasil tersimpan.');
    } else if (form.id === 'order-action-form') {
      if (!orderActionRules(data.action)) {
        throw new Error('Pilih tindakan terlebih dahulu.');
      }
      if (!await confirmAction('Apa yakin menjalankan tindakan ini?', 'Konfirmasi')) {
        return;
      }
      data.orderId = form.dataset.id;
      await rpc(data.action, data);
      if (data.action !== 'fulfillment') { dialog.close(); }
      await loadAdmin();
      // Setelah perubahan tahap, tampilkan detail terbaru agar hasil langsung terlihat.
      if (data.action === 'fulfillment') {
        if (state.page === 'admin' && state.adminPage === 'Pesanan' && !state.adminError &&
          state.admin?.tables.Orders?.some(function (row) { return row.id === data.orderId; })) {
          orderEditor(data.orderId);
          document.getElementById('order-action-result').innerHTML =
            '<p class="alert alert-success">Tahap diperbarui menjadi ' + safe(fulfillmentLabel(data.status)) + '.</p>';
        } else {
          dialog.close();
        }
      }
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
  const resetFromLink = new URLSearchParams(window.location.hash.slice(1)).get('reset');
  if (resetFromLink) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    renderResetPassword(resetFromLink);
  }
  (resetFromLink ? Promise.resolve() : navigate('shop')).catch(function (error) {
    app.innerHTML = '<section class="panel"><h1>Healthy Vibes</h1>' +
      '<p>Aplikasi belum terhubung ke database yang terpasang.</p>' +
      '<p>Isi URL API pada js/config.js dan pasang backend sesuai panduan.</p>' +
      '<button class="btn btn-primary" data-nav="shop" type="button">' +
      buttonLabel('refresh', 'Coba Hubungkan Lagi') + '</button></section>';
    notify(error.message, true);
  });
