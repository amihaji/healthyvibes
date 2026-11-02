# Healthy Vibes: Hasil Pengujian Build

## Perbaikan Setup Editor

- Fungsi yang dipilih di editor: `installHealthyVibes`, `verifyAuthRuntime`,
  `createFirstAdmin`, dan `runRuleTests`, tanpa `_` di akhir.
- Implementasi internal tetap memakai `_`; helper setup menolak identitas
  kosong atau berbeda dengan akun eksekusi sebelum menjalankan operasi.
- Manifest menambahkan scope email untuk pemeriksaan identitas akun.
- PASS: 19 tes lokal, termasuk penerusan setup, penolakan anonim, dan pelaporan
  aturan gagal. Tidak menjalankan installer atau mengubah database Google nyata.
- Dropdown/Run editor dan otorisasi ulang Google belum diuji pada akun pengguna.

## Pemisahan Frontend: 2 November 2026

Frontend sekarang statis (`index.html`, `css`, `js`); backend API berada di
`apps-script`. Hasil di bawah berlaku untuk perubahan terbaru:

- PASS: 16 pengujian Node 22.23.4 dalam `tests/frontend-api.test.cjs`.
- PASS: seluruh 12 pemeriksaan aturan WITA, voucher, refund, reservasi, dan
  input lama dijalankan kembali melalui suite tersebut.
- PASS: syntax semua `.gs`/`.js`, tidak ada template frontend Google tersisa.
- PASS: API POST memeriksa origin dan kanal; login menerima password dari
  badan POST, bukan parameter URL.
- PASS: data respons yang mengandung tag script dinetralkan; operasi staf
  tetap melewati otorisasi dan aksi internal tidak bisa dipanggil sebagai action.
- PASS: transport menolak pesan dengan origin, iframe, kanal, atau bentuk
  respons salah; timeout tidak dianggap sukses; iframe dan payload dibersihkan.
- PASS: YAML workflow Pages, izin deployment, dan artifact hanya berisi frontend.
- PASS: browser Chrome pada 320x740, 390x844, 820x1180, 1280x900, dan 844x390.
  Katalog -> keranjang -> tiga langkah checkout -> penolakan server ->
  retry ID sama -> status pesanan berjalan tanpa error JavaScript atau
  horizontal overflow pada tahap yang diperiksa.
- PASS: browser memakai POST form dan respons iframe bersarang lintas origin
  Google yang diintersep/disimulasikan, bukan sekadar mengganti fungsi rpc.
- PASS: halaman tanpa URL API menampilkan petunjuk konfigurasi, bukan data contoh.

Data browser seluruhnya sintetis, tanpa transaksi atau request Google nyata.
NOT TESTED: deployment Google dan Pages, header/redirect HTML Service Google
asli, izin akun, login runtime bcrypt, upload/download aktual, dan seluruh
alur pengelola. Uji sandbox pada layanan nyata tetap wajib sebelum produksi.

Perintah regresi: `node --test tests/frontend-api.test.cjs`.
Hasil historis build sebelumnya berikut tidak menggantikan batas tersebut.

## Riwayat Build Sebelumnya

Tanggal: 1 November 2026. Status: build source untuk pemasangan dan pengujian integrasi.
Belum siap produksi dan belum terpasang pada akun Google pengguna.

## PASS Lokal

Pengujian Node 22.16.0 dengan Apps Script services yang disimulasikan:

- Sintaks seluruh modul `.gs` dan JavaScript frontend.
- Preorder sebelum 17.00 WITA tersedia; tepat 17.00 ditolak.
- Hari/tanggal WITA, hari tutup dan minimal persiapan.
- Minimum voucher dari seluruh subtotal; potongan hanya item non-diskon.
- Potongan voucher tidak melebihi basis yang berhak.
- Refund pelanggan 90% dan toko 100%.
- Reservasi pesanan COMMITTED dan PREPARING sama-sama menahan kapasitas.
- Batal sebelum persiapan melepas kapasitas; sudah disiapkan tidak kembali otomatis.
- Input angka pecahan ditolak dan formula injection dinetralkan.
- Retry pembuatan pesanan menghasilkan satu induk/item/reservasi.
- Pesanan kedua yang melebihi stok ditolak.
- Payload berbeda dengan ID request sama ditolak.
- Status pesanan dengan token salah ditolak.
- Retry verifikasi pembayaran tidak mencatat dua pembayaran atau mengurangi stok lagi.
- Retry konfirmasi pembatalan melepas stok sekali dan menghitung refund tepat.
- Retry penyelesaian refund tidak menggandakan pencatatan.
- Operator tidak dapat mengubah voucher/promo.
- Admin aktif terakhir tidak dapat diturunkan.
- Simulasi crash setelah induk tersimpan: kapasitas tetap tertahan dan rekonsiliasi menyelesaikan anak.
- Bcrypt salt, hash dan pemeriksaan password benar/salah pada Node VM.
- Otorisasi role server, sesi dicabut dan perubahan versi akun mencabut sesi.

Ini bukan PASS untuk layanan Google asli, eksekusi bersamaan nyata atau benchmark bcrypt Google.
Fungsi `runRuleTests_` disertakan di source untuk pengujian aturan tanpa data produksi.

## PASS Browser Terbatas

Browser membuka sandbox UI dengan data sintetis, tanpa backend Google, pada viewport aktual 701 x 544:

- Katalog dan navigasi tampil.
- Tambah produk mengubah keranjang.
- Dialog keranjang terbuka dan tombol checkout bekerja.
- Checkout berpindah dari Penerima ke Pembayaran lalu Tinjau Pesanan.
- Kebijakan refund dan checkbox persetujuan tampil pada langkah terakhir.
- Tidak ada horizontal overflow pada viewport dan langkah yang diperiksa.
- Indikator loading tersembunyi setelah request selesai.

Bug loading yang menghalangi tombol ditemukan, diperbaiki dan diuji ulang.
Tidak mengirim pesanan nyata. Foto aktual/logo tidak disertakan dalam sandbox.

## NOT TESTED

- Installer Google, izin dan folder/Sheet nyata.
- Bcrypt runtime Google; login sengaja ditutup sampai `verifyAuthRuntime_` lulus.
- Deployment anonim Apps Script, quota, serangan beban dan CSRF/XSS dalam lingkungan HTML Service nyata.
- Upload foto produk/struk/tanda terima/logo/QRIS ke Drive nyata.
- Invoice PDF dari HTML Service/Utilities dan download pada deployment.
- Isi/format file PDF dan `.xlsx` yang diunduh, serta CDN ekspor pada deployment Google.
- Backup/restore berkas nyata dan trigger backup harian.
- Responsivitas pada 320, 390, 820, 1280 serta seluruh portrait/landscape.
- Perbandingan visual lengkap pengelola terhadap preview dan seluruh dialog.
- Eksekusi Sheet bersamaan, kegagalan quota/timeouts serta pemulihan di layanan Google asli.
- Dukungan GoSend untuk ongkir dibayar penerima langsung ke kurir di Makassar.

## Batas yang Perlu Ditangani Sebelum Produksi

- Login custom dan token merupakan implementasi untuk diuji, bukan sertifikasi keamanan.
- Query database saat ini membaca tabel, dan data pengelola memuat tabel sesuai izin; pagination pesanan masih di frontend. Untuk volume besar perlu pagination/query backend dan optimasi foto.
- Backup penuh berjalan dalam satu eksekusi; beban besar dapat mencapai batas runtime. STARTED harus diperiksa, tidak dianggap selesai.
- Retensi backup diatur sebagai target; tidak ada penghapusan otomatis.
- Foto katalog berasal dari Drive privat melalui data base64. Jangan membuka folder pelanggan untuk mempercepat foto.
- Kapasitas stok siap jual bersifat kumpulan total; belum ada reset otomatis harian.
- Pemulihan akses pelanggan yang kehilangan token masih melalui pemeriksaan manual pemilik, bukan lewat nomor HP saja.
- Nilai toko, pembulatan, jadwal dan satu voucher per pesanan perlu dikonfirmasi pada konfigurasi/UAT.

## UAT Singkat Sesudah Integrasi Lulus

1. Visual: tinjau toko/checkout dan panel pada desktop, tablet dan HP.
2. Fungsi: satu pesanan sandbox, verifikasi, persiapan, tanda terima, dan pembatalan sebelum persiapan dengan refund.
3. Output: periksa invoice, laporan PDF/Excel serta folder Drive yang sesuai.

Tidak ada push GitHub, deployment produksi, perubahan website atau transaksi/pembayaran nyata dalam pekerjaan ini.
