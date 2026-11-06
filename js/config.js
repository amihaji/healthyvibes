'use strict';
// Isi URL deployment web app Apps Script yang berakhiran /exec.
window.HV_CONFIG = Object.freeze({
  // Alamat backend Google Apps Script yang menerima permintaan dari website.
  apiUrl: 'https://script.google.com/macros/s/AKfycbwjyHJQb_L6wD7VTi5lv6sSTYp3WHjnNEK2D-givg0zSaDk9W6COdXKSbNtq-5k2uMTFw/exec',
  // Batas tunggu permintaan biasa: 180.000 milidetik = 3 menit.
  requestTimeoutMs: 180000,
  // Batas tunggu backup/pemulihan: 420.000 milidetik = 7 menit.
  longRequestTimeoutMs: 420000
});
