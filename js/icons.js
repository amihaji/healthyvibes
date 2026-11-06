'use strict';

// Ikon garis lokal digunakan bersama oleh semua tombol, tanpa unduhan pustaka.
window.HV_UI = (function () {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    settings: '<path d="m9 3-.7 2.3-2 .9-2.2-.6-2 3.4 1.5 1.7v2.6L2.1 15l2 3.4 2.2-.6 2 .9L9 21h6l.7-2.3 2-.9 2.2.6 2-3.4-1.5-1.7v-2.6L21.9 9l-2-3.4-2.2.6-2-.9L15 3Z"/><circle cx="12" cy="12" r="3"/>',
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    orders: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 3h6v4H9ZM9 12h6M9 16h6"/>',
    categories: '<path d="M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z"/>',
    product: '<path d="m12 3 9 5-9 5-9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
    stock: '<path d="M3 4h18v5H3ZM5 9v12h14V9M9 13h6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3"/>',
    tag: '<path d="m3 3 9 0 9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1"/>',
    voucher: '<path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4ZM15 6v3M15 11v2M15 15v3"/>',
    users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    shipping: '<path d="M3 5h12v12H3ZM15 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    backup: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    report: '<path d="M4 3h12l4 4v14H4ZM16 3v5h4M8 17v-4M12 17v-7M16 17v-2"/>',
    cart: '<path d="M3 3h2l3 13h10l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    next: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9M16 16l3-3M18 18l3-3"/>',
    login: '<path d="M14 3h7v18h-7M3 12h13m-5-5 5 5-5 5"/>',
    logout: '<path d="M10 3H3v18h7M8 12h13m-5-5 5 5-5 5"/>',
    save: '<path d="M3 3h15l3 3v15H3ZM7 3v6h10V3M7 21v-8h10v8"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6ZM13 6l5 5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    photo: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    restore: '<path d="M3 10V4m0 6h6"/><path d="M3 10a9 9 0 1 1 1 8M12 7v5l3 2"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>'
  };

  // Membuat ikon dekoratif; nama tombol tetap dibaca dari teks di sampingnya.
  function icon(name) {
    return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      (paths[name] || paths.check) + '</svg>';
  }

  // Menggabungkan ikon dan label aman untuk tombol maupun tautan.
  function label(name, text) {
    const escaped = String(text).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
    return icon(name) + '<span class="button-text">' + escaped + '</span>';
  }

  return Object.freeze({ icon: icon, label: label });
})();
