'use strict';

// Isi URL deployment web app Apps Script yang berakhiran /exec.
// Ini bukan Script ID, ID Google Sheets, password, atau token Google.
window.HV_CONFIG = Object.freeze({
  apiUrl: 'https://script.google.com/macros/s/AKfycbym1_739m8tDwnpNXr4rWDhCc0OVUh0Ek1H74l_3kzFpk_M1KMlY_Pqlkd238E7a3e4EQ/exec',

  // Request biasa dibatasi tiga menit; backup dapat memakai runtime lebih lama.
  requestTimeoutMs: 180000,
  longRequestTimeoutMs: 420000
});
