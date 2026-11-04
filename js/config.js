'use strict';
// Isi URL deployment web app Apps Script yang berakhiran /exec.
window.HV_CONFIG = Object.freeze({
  // Alamat backend Google Apps Script yang menerima permintaan dari website.
  apiUrl: 'https://script.google.com/macros/s/AKfycbzYkf60hcQv1z6MfkB5Apfz2Vk5eU1ElYy1XqN5Web_eGpwj4BgToRi77jVPwBYqfCukQ/exec',
  // Batas tunggu permintaan biasa: 180.000 milidetik = 3 menit.
  requestTimeoutMs: 180000,
  // Batas tunggu backup/pemulihan: 420.000 milidetik = 7 menit.
  longRequestTimeoutMs: 420000
});
