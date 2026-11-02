'use strict';

// Isi URL deployment web app Apps Script yang berakhiran /exec.
// Ini bukan Script ID, ID Google Sheets, password, atau token Google.
window.HV_CONFIG = Object.freeze({
  apiUrl: 'https://script.google.com/macros/s/AKfycbxrxHp8rYGjfqThHqkp4H-uwjeC-UL32_ZuHgyyEzSuDeCMiSBcheCAoQ4FMQnXYLBZ/exec',

  // Request biasa dibatasi tiga menit; backup dapat memakai runtime lebih lama.
  requestTimeoutMs: 180000,
  longRequestTimeoutMs: 420000
});
