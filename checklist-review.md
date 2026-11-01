# Healthy Vibes: Checklist Review Terpadu

Status terbaru: IZIN BUILD DITERIMA melalui "SETUJU - GENERATE FINAL BUILD" pada 1 November 2026.
Source dibuat di `apps-script` dengan installer database/folder PRODUK, INVOICE, STRUK dan TANDATERIMA.
Lihat `hasil-pengujian-build.md` untuk tes lokal/browser dan batas NOT TESTED.
Pemasangan Google belum dilakukan. Catatan review/belum izin build di bawah adalah riwayat sebelum persetujuan terbaru, bukan permintaan persetujuan ulang.

| Bagian | Status | Ringkasan |
| --- | --- | --- |
| Tujuan / pengguna | SETUJU | Makanan/minuman sehat; pelanggan tanpa akun wajib, pengelola akun buatan Admin. |
| Pesanan / pembayaran | SETUJU | Langsung dan preorder besok; 17.00/18.00 WITA. Produk antar/preorder lunas di muka; langsung ambil boleh bayar saat ambil. |
| Stok / jadwal | SETUJU | Stok langsung terpisah dari kuota per tanggal; ditahan saat berhasil membuat pesanan. Hari/jam, interval dan minimal persiapan diatur Admin. |
| Wilayah / GoSend | SETUJU / BELUM DIPUTUSKAN | Wilayah aktif diatur Admin. GoSend dipesan pengelola, ongkir ke kurir saat tiba adalah pilihan pengguna; dukungan Makassar belum terverifikasi. |
| Pembatalan / refund | SETUJU | Pelanggan sebelum persiapan: 90%; sesudah persiapan tidak boleh batal. Toko tidak dapat memenuhi: 100%. Manual <=24 jam setelah konfirmasi. |
| Produk / promo | SETUJU | Upload, kategori, nama, harga. Promo khusus Admin; voucher tanpa kuota hanya memotong non-diskon, minimum dari seluruh subtotal produk tanpa ongkir. |
| Dashboard / CRUD / filter | SETUJU / BELUM DIPUTUSKAN | Modul disetujui; indikator, soft delete, pencarian/filter/sorting/pagination diusulkan pada rekomendasi teknis. |
| PDF / Excel | SETUJU / BELUM DIPUTUSKAN | Ekspor PDF/.xlsx disepakati; rancangan kolom dan laporan terlampir untuk review. |
| Login / level | SETUJU / BELUM DIPUTUSKAN | Admin, Operator, Viewer disetujui; hashing password, sesi, reset, revokasi dan akses privat perlu pembuktian teknis. |
| Platform / database | SETUJU | HTML/CSS/JavaScript, Bootstrap, GitHub, Apps Script, Sheets/Drive. |
| Operasional | SETUJU | Web online. |
| Offline | SKIP | Tidak masuk cakupan online versi pertama. |
| AI / WA API / gateway pembayaran | BELUM DIPUTUSKAN | Rekomendasi SKIP; tidak diaktifkan tanpa persetujuan. |
| Konsep / palet | SETUJU | Gabungan A+B; tosca tua, orange, cream muda, abu muda, hitam, putih. |
| Checkout / akun / produk | SETUJU / REVISI | Susunan disetujui; preview diperbarui untuk keputusan terbaru, perlu review perubahannya. |
| Desktop / tablet / HP / landscape | BELUM DIPUTUSKAN | Tombol perangkat tersedia; pemeriksaan visual otomatis belum berhasil, bukan UI Design Lock final. |
| Logo / foto aktual | BELUM DIPUTUSKAN | Belum tersedia; tidak menggunakan foto sementara. |
| Hosting / alur akses | SETUJU | Tombol pemesanan di https://www.beratidealku.com menuju langsung URL web app Apps Script. Frontend HTML/CSS/JavaScript/Bootstrap melalui HTML Service; backend Apps Script; database Sheets/Drive; source tetap GitHub. Cloudflare/penghubung tidak dipilih dan GitHub Pages bukan tujuan toko. URL deployment nyata belum tersedia; bukan izin mengubah website atau deployment. |
| Backup / keamanan data | SETUJU / BELUM DIPUTUSKAN | Backup masuk cakupan; jadwal harian/retensi 30 hari dan pemulihan staging masih usulan. |
| Perhitungan / penerimaan | BELUM DIPUTUSKAN | Usulan pembulatan, satu voucher, KPI, audit, uji request ganda/stok bersamaan, laporan, keamanan dan restore. |

## Lihat Paket

- preview-gabungan-responsive.html: Toko, Panel, Checkout (empat skenario), Login, Setup User, Produk/Promo, Stok/Preorder, Pengaturan, Laporan, Status Pesanan. Pilih desktop/tablet/HP/HP kecil dan landscape.
- rekomendasi-teknis.md: rincian rekomendasi, batas platform, keamanan dan pengujian. Semua rekomendasi baru tetap belum disetujui.
- hasil-verifikasi-teknis.md: pilihan Apps Script dicatat; keamanan dan uji runtime belum dilakukan. Bukti Cloudflare adalah referensi opsi sebelumnya yang tidak dipilih, bukan bukti keamanan Apps Script.
- blueprint-ringkas.md dan acuan-desain.md: keputusan bisnis yang sudah dicatat.

## Hasil Pemeriksaan Saat Ini

- PASS: server lokal mengirim preview terbaru (HTTP 200, memuat fungsi tampilan baru).
- NOT TESTED: rendering seluruh tampilan, interaksi tombol dan overflow tiap viewport; browser gagal mengambil snapshot. HTTP 200 bukan bukti UI lulus.
- NOT TESTED: login, upload, transaksi, stok, PDF/.xlsx, backup dan deployment; belum ada aplikasi utama.
- NEED REVIEW: kesesuaian desain/rekomendasi, logo/foto, kelayakan autentikasi/koneksi Apps Script dan dukungan GoSend. Alur akses sudah disetujui.
- Dokumentasi diperiksa: Pages Functions mendukung autentikasi/middleware; Workers memiliki kriptografi server. Ini bukan PASS runtime login/koneksi aplikasi.

Review paket sekaligus: setuju arah rekomendasi atau sebutkan bagian revisi. Keputusan kritis dan kelayakan teknis masih harus ditutup sebelum meminta **SETUJU - GENERATE FINAL BUILD**. Tidak ada build, push GitHub, transaksi, pesan atau deployment nyata pada tahap ini.
