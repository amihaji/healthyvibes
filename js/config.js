'use strict';
// Isi URL deployment web app Apps Script yang berakhiran /exec.
window.HV_CONFIG = Object.freeze({
  // Alamat backend Google Apps Script yang menerima permintaan dari website.
  apiUrl: 'https://script.google.com/macros/s/AKfycbymNJl8epLvSj8sb-aTJD2DL3rZ27ZiII3fhqL72SJ2Id5dHxBlwZ3YbvDKC_g04r5Kyg/exec',
  // Batas tunggu permintaan biasa: 180.000 milidetik = 3 menit.
  requestTimeoutMs: 180000,
  // Batas tunggu backup/pemulihan: 420.000 milidetik = 7 menit.
  longRequestTimeoutMs: 420000
});
