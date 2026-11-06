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
    type: 'DIRECT',
    cart: {},
    page: 'shop',
    adminPage: 'Dashboard',
    admin: null,
    adminLoading: false,
    adminError: '',
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
    if (!background) {
      pending += 1;
      document.getElementById('busy').classList.remove('d-none');
    }
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
      if (!background) {
        pending -= 1;
        document.getElementById('busy').classList.toggle('d-none', pending === 0);
      }
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

  // Hapus isi dialog setelah ditutup agar kunci pemulihan tidak tertinggal.
  dialog.addEventListener('close', function () {
    document.getElementById('editor-content').innerHTML = '';
  });

  // Kunci pelanggan 10 karakter memakai Web Crypto; 64 karakter memberi pilihan acak merata.
  function randomToken() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, function (byte) { return alphabet[byte & 63]; }).join('');
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
          '<span>' + rupiah(item.product.unitPrice) + '</span>' +
          '<div><button class="btn btn-sm btn-outline-dark" data-minus="' +
          safe(item.product.id) + '" type="button">' + buttonLabel('minus', 'Kurangi') + '</button> ' + item.quantity +
          ' <button class="btn btn-sm btn-outline-dark" data-add="' +
          safe(item.product.id) + '" type="button">' + buttonLabel('plus', 'Tambah') + '</button></div></div></div>';
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
      '<select class="form-select" id="category-filter" aria-label="Kategori"' +
      (state.catalogLoading || state.catalogError ? ' disabled' : '') + '>' +
      '<option value="">Semua kategori</option>' + catalog.categories.map(function (row) {
        return '<option value="' + safe(row.id) + '"' +
          (row.id === state.productCategory ? ' selected' : '') + '>' + safe(row.name) + '</option>';
      }).join('') + '</select><div class="availability-option">' +
      '<input class="form-check-input" type="checkbox" id="availability-filter"' +
      (state.availableOnly !== false ? ' checked' : '') +
      (state.catalogLoading || state.catalogError ? ' disabled' : '') + '>' +
      '<label class="form-check-label d-inline-flex align-items-center gap-2" for="availability-filter">' +
      buttonLabel('stock', 'Tersedia saja') + '</label></div></div>' +
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
    const category = document.getElementById('category-filter').value;
    const products = filterCatalogProducts(state.catalog.products, search, category);
    const pagination = productPageData(products);
    document.getElementById('products').innerHTML = products.length
      ? pagination.items.map(function (product) {
        return '<article class="product-card">' +
          (product.photoFileId ? '<div data-photo="' + safe(product.id) +
            '" data-photo-file="' + safe(product.photoFileId) + '"></div>' : '') +
          '<h2>' + safe(product.name) + '</h2><p class="description">' +
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

  // Memulai checkout dan menyiapkan ID permintaan serta kunci akses privat pesanan.
  async function startCheckout() {
    if (state.catalogLoading || state.catalogError) {
      throw new Error('Tunggu harga dan stok terbaru sebelum checkout.');
    }
    if (!cartLines().length) {
      throw new Error('Tambahkan produk terlebih dahulu.');
    }
    if (!state.requestId) {
      state.requestId = crypto.randomUUID();
      state.accessToken = randomToken();
    }
    state.checkoutStep = 1;
    state.quote = null;
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
      '<p>Biaya pengiriman: ' + rupiah(priced.shippingFee) + '</p>' +
      '<strong>Total pembayaran: ' + rupiah(priced.total) + '</strong>' +
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
      'Kunci akses dibuat otomatis dan ditampilkan pada halaman "Pesanan Anda" setelah pesanan berhasil. ' +
      'Simpan melalui tombol "Unduh Kunci Akses", lalu masukkan kunci tersebut di sini. ' +
      'Huruf besar dan kecil harus sesuai.</p>' +
      '<form id="status-form">' + field('Nomor pesanan', 'orderId', state.order?.id) +
      field('Kunci akses privat', 'accessToken', state.accessToken) +
      '<button class="btn btn-primary" type="submit">' + buttonLabel('eye', 'Lihat Pesanan') + '</button></form></section>';
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
      '<section class="order-section"><h2 class="h5">Dokumen dan Kunci Akses</h2>' +
      '<div class="alert alert-warning">Simpan kunci akses berikut secara privat. ' +
      'Kunci ini memberikan akses pesanan.<br><code class="text-break">' +
      safe(state.accessToken) + '</code></div>' +
      '<div class="d-flex gap-2 flex-wrap justify-content-center">' +
      '<button class="btn btn-green btn-sm" id="download-invoice" type="button">' + buttonLabel('download', 'Unduh Invoice PDF') + '</button>' +
      '<button class="btn btn-outline-dark btn-sm" id="save-access" type="button">' + buttonLabel('key', 'Unduh Kunci Akses') + '</button>' +
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
        ['Pembayaran diterima', rupiah(kpi.payments)]
      ].map(function (item) {
        return '<div class="kpi"><small>' + safe(item[0]) + '</small><strong>' +
          safe(item[1]) + '</strong></div>';
      }).join('') + '</div><section class="panel"><h2 class="h4">Ringkasan Operasional</h2>' +
        '<p>Data berasal dari transaksi tersimpan, bukan contoh.</p>' +
        '<p>Pembayaran pesanan baru sudah termasuk ongkir. Total penerimaan bukan laba.</p>' +
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
    showEditor('Detail Pesanan', '<p class="text-break">' + safe(id) + '</p><p>' +
      safe(order.name + ' | ' + order.phone) + '</p><p>' + safe(order.address) + '</p>' +
      orderCharges(order) + orderStatusPanel(order) +
      '<div class="d-flex gap-2 flex-wrap mb-3">' +
      files.map(function (file) {
        return '<button class="btn btn-outline-dark" data-file="' + safe(file.driveFileId) +
          '" type="button">' + buttonLabel('eye', file.kind === 'STRUK'
            ? 'Lihat Struk' : file.kind === 'TANDATERIMA' ? 'Lihat Tanda Terima' : 'Lihat ' + file.kind) + '</button>';
      }).join('') + '<button class="btn btn-green" data-invoice="' + safe(id) +
      '" type="button">' + buttonLabel('download', 'Invoice PDF') + '</button></div><hr>' +
      '<form id="order-action-form" data-id="' + safe(id) + '">' +
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
      buttonLabel('check', 'Jalankan Tindakan') + '</button></div></form><hr>' +
      (state.user.role === 'Admin' ? orderAccessForm(order) : ''));
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

  // Nomor HP harus diketik dari informasi pelanggan, bukan diisi otomatis.
  function orderAccessForm(order) {
    if (order.transactionState !== 'COMMITTED') { return ''; }
    return '<section aria-labelledby="reset-access-title"><h2 class="h5" id="reset-access-title">' +
      buttonLabel('key', 'Pemulihan Kunci Akses') + '</h2>' +
      '<p class="small">Pastikan identitas pelanggan sesuai dengan pesanan. ' +
      'Kunci lama akan tidak berlaku. Kunci baru hanya tampil sampai detail ini ditutup.</p>' +
      '<form id="reset-access-form" data-id="' + safe(order.id) + '">' +
      field('Nomor HP pelanggan (sesuai pesanan)', 'phone', '', 'tel') +
      '<label class="d-flex align-items-center gap-2 mb-3">' +
      '<input class="form-check-input m-0" type="checkbox" name="confirmed" required>' +
      '<span>Saya sudah memverifikasi pelanggan dan setuju mengganti kunci lama.</span></label>' +
      '<div id="reset-access-result" role="status" aria-live="polite"></div>' +
      '<div class="d-flex justify-content-center"><button class="btn btn-primary btn-sm" type="submit">' +
      buttonLabel('key', 'Buat Kunci Baru') + '</button></div></form></section><hr>';
  }

  // Form master dikonfigurasi per tabel agar tidak menampilkan password hash.
  function masterFields(table, row) {
    const products = (state.admin.tables.Products || []).map(function (item) {
      return [item.id, item.name];
    });
    let html = '';
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
          active: 'Aktif', name: 'Nama', price: table === 'ShippingRates' ? 'Biaya Pengiriman (Rp)' : 'Harga',
          date: 'Tanggal', startsAt: 'Mulai WITA', endsAt: 'Berakhir WITA' };
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

  // Laporan memisahkan harga produk dan ongkir di dalam total tagihan.
  function renderReport() {
    const report = state.report;
    const keys = report.rows.length ? Object.keys(report.rows[0]) : [];
    document.getElementById('report-result').innerHTML =
      '<p>Pembayaran diterima: ' + rupiah(report.summary.payments) + '</p>' +
      '<p class="small">Periode berdasarkan tanggal pesanan WITA. Pembayaran termasuk ongkir ' +
      'pada pesanan baru. Sisa kas bukan laba; data pengembalian historis tetap tercatat di laporan.</p>' +
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
    if (['product-search', 'category-filter', 'availability-filter'].includes(event.target.id)) {
      state.productPage = 0;
      state.productSearch = document.getElementById('product-search').value;
      state.productCategory = document.getElementById('category-filter').value;
      if (event.target.id === 'availability-filter') { state.availableOnly = event.target.checked; }
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

  // Perubahan pilihan tindakan langsung mengatur input yang berkaitan saja.
  document.addEventListener('change', function (event) {
    if (event.target.form?.id === 'checkout-form' && state.checkoutStep === 1 &&
      ['receipt', 'shippingRateId'].includes(event.target.name)) {
      Object.assign(state.recipient, formData(event.target.form));
      state.quote = null;
      renderCheckout();
    }
    if (event.target.name === 'action' && event.target.form?.id === 'order-action-form') {
      updateOrderAction(event.target.form);
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
      if (['reset-access-form', 'order-action-form', 'handover-form'].includes(form.id)) {
        const selector = form.id === 'reset-access-form' ? '#reset-access-result'
          : form.id === 'handover-form' ? '#handover-result' : '#order-action-result';
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
    } else if (form.id === 'status-form') {
      state.order = await rpc('orderStatus', data);
      state.accessToken = data.accessToken;
      renderOrder();
    } else if (form.id === 'login-form') {
      const result = await rpc('login', data);
      state.token = result.token;
      state.user = result.user;
      state.admin = null;
      state.report = null;
      state.adminPage = 'Dashboard';
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
    } else if (['proof-form', 'handover-form', 'product-photo-form'].includes(form.id)) {
      if (form.id === 'handover-form' && data.received !== 'on') {
        throw new Error('Konfirmasi bahwa produk sudah diterima terlebih dahulu.');
      }
      const photo = await photoData(form.elements.photo.files[0], form.id === 'product-photo-form');
      const customer = form.id !== 'product-photo-form';
      await rpc(customer ? 'customerUpload' : 'upload', Object.assign({}, photo, {
        requestId: crypto.randomUUID(),
        kind: form.id === 'handover-form' ? 'TANDATERIMA' : customer ? 'STRUK' : 'PRODUK',
        orderId: customer ? state.order.id : '',
        productId: form.id === 'product-photo-form' ? form.dataset.id : '',
        received: form.id === 'handover-form' && data.received === 'on',
        accessToken: customer ? state.accessToken : ''
      }));
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
    } else if (form.id === 'reset-access-form') {
      const result = await rpc('resetOrderAccess', {
        orderId: form.dataset.id, phone: data.phone, confirmed: data.confirmed === 'on'
      });
      // Hasil hanya di dialog, tidak disimpan di state, URL, atau penyimpanan browser.
      form.innerHTML = '<div class="alert alert-success" role="status">' +
        '<p>Kunci baru berhasil dibuat. Kunci lama tidak berlaku lagi.</p>' +
        '<p>Nomor pesanan: <strong>' + safe(result.orderId) + '</strong></p>' +
        '<label class="form-label" for="recovered-access">Kunci akses baru (10 karakter)</label>' +
        '<input id="recovered-access" class="form-control" type="text" readonly value="' +
        safe(result.accessToken) + '">' +
        '<p class="small mt-2 mb-0">Salin dan sampaikan secara pribadi kepada pelanggan. ' +
        'Huruf besar dan kecil harus sesuai. Kunci ini tidak dapat dilihat kembali setelah dialog ditutup.</p></div>';
    } else if (form.id === 'order-action-form') {
      if (!orderActionRules(data.action)) {
        throw new Error('Pilih tindakan terlebih dahulu.');
      }
      if (!confirm('Jalankan tindakan ini pada pesanan?')) {
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
  navigate('shop').catch(function (error) {
    app.innerHTML = '<section class="panel"><h1>Healthy Vibes</h1>' +
      '<p>Aplikasi belum terhubung ke database yang terpasang.</p>' +
      '<p>Isi URL API pada js/config.js dan pasang backend sesuai panduan.</p>' +
      '<button class="btn btn-primary" data-nav="shop" type="button">' +
      buttonLabel('refresh', 'Coba Hubungkan Lagi') + '</button></section>';
    notify(error.message, true);
  });
