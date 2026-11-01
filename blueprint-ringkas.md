# Healthy Vibes: Blueprint Ringkas

Status terbaru: IZIN BUILD DITERIMA pada 1 November 2026 melalui "SETUJU - GENERATE FINAL BUILD".
Source implementasi tersedia pada `apps-script`; pemasangan Google dan pengujian integrasi belum selesai.
Catatan "belum izin build" di bagian historis di bawah telah digantikan oleh persetujuan terbaru ini.
Lihat `panduan-pemasangan.md`, `struktur-database.md` dan `hasil-pengujian-build.md`.
Tambahan disetujui: foto produk di PRODUK, invoice di INVOICE, bukti transfer di STRUK, foto tanda terima di TANDATERIMA.
Persetujuan pembangunan bukan bukti tes lulus, izin layanan berbayar, transaksi nyata atau perubahan website.
SETUJU berarti keputusan pengguna; rekomendasi yang belum diterima tetap BELUM DIPUTUSKAN.

Pengguna menyetujui penyusunan rekomendasi teknis dan preview terbaru sekaligus untuk review, bukan izin build. Lihat `checklist-review.md` (ringkasan) dan `rekomendasi-teknis.md` (rincian usulan). Rekomendasi baru tetap BELUM DIPUTUSKAN.

Arah paket SETUJU untuk finalisasi desain dan verifikasi teknis. Pilihan A terakhir menyetujui tombol pemesanan di https://www.beratidealku.com menuju langsung URL web app Apps Script. Frontend disajikan melalui HTML Service, backend Apps Script, database Sheets/Drive, source tetap GitHub. Cloudflare/penghubung tidak dipilih; GitHub Pages bukan tujuan toko. Lihat `hasil-verifikasi-teknis.md` untuk batas pengujian. Persetujuan ini bukan izin build, perubahan website atau deployment.

| Checklist | Status | Keputusan / Rekomendasi |
| --- | --- | --- |
| Nama dan tujuan | SETUJU | Healthy Vibes, penjualan makanan dan minuman sehat. |
| Target pengguna | SETUJU | Pelanggan tanpa akun wajib: nama, nomor HP, alamat bila diantar; status pesanan tetap privat. Pengelola memakai akun buatan Admin sesuai level. |
| Alur pesanan | SETUJU | Langsung atau preorder H-1, antar atau ambil. Makassar dan sekitarnya, WITA. |
| Jadwal layanan | SETUJU | Admin mengatur hari/rentang layanan WITA, interval pilihan waktu dan minimal persiapan pesanan langsung. Pelanggan memilih dari daftar waktu valid; backend memeriksa ulang saat pesanan dibuat. Terpisah dari batas preorder 17.00/pembayaran 18.00. Nilai jadwal, interval dan menit persiapan diisi sebelum go live; 30 menit hanya contoh. Waktu antar bukan jaminan waktu tiba kurir. |
| Stok / kuota preorder | SETUJU | Stok siap jual terpisah dari kuota preorder per produk/tanggal penerimaan. Ketersediaan ditahan saat pesanan berhasil dibuat di backend, sebelum verifikasi pembayaran, bukan saat masuk keranjang. Dilepas satu kali setelah pengelola mengonfirmasi pembatalan; tidak dikurangi lagi saat pembayaran diverifikasi. |
| Pembayaran | SETUJU | Preorder masuk sebelum 17.00, pembayaran produk maksimal 18.00 WITA. Pengantaran: produk lunas sebelum dikirim. Bayar saat ambil hanya untuk pesanan langsung. |
| Pengiriman | SETUJU (ALUR; DUKUNGAN PENYEDIA PERLU VERIFIKASI) | GoSend dipesan manual pengelola; ongkir pelanggan, terpisah dan tarif disetujui. Pelanggan membayar ongkir langsung ke kurir saat tiba di alamat pelanggan. Dukungan ongkir saja dibayar penerima pada layanan/akun Makassar belum terverifikasi; panduan COD resmi tahun 2025 bukan bukti dukungan tersebut. Produk tetap lunas sebelum dikirim, tidak ditagih lagi oleh kurir. Tiba bukan bukti ongkir lunas; pembayaran ke kurir bukan kas toko. Bukan integrasi API otomatis. |
| Wilayah layanan | SETUJU | Admin mengatur daftar wilayah Makassar dan sekitarnya; pelanggan memilih wilayah aktif saat checkout dan mengisi alamat lengkap. Backend memvalidasi wilayah aktif. Daftar aktual diisi sebelum go live; bukan tarif ongkir, verifikasi otomatis alamat atau jaminan tersedia kurir. |
| Pembatalan | SETUJU | Permintaan pelanggan diputuskan pengelola sebelum persiapan; setelah persiapan dimulai, pembatalan pelanggan tidak diperbolehkan. Tahap diperiksa backend dan waktu mulai persiapan dicatat. Preorder belum terverifikasi diperiksa setelah 18.00 sebelum dibatalkan dan kuota dilepas. Pembatalan oleh toko karena tidak dapat memenuhi pesanan mendapat refund produk 100%. |
| Pengembalian sebelum persiapan | SETUJU | Pembatalan atas permintaan pelanggan yang disetujui sebelum mulai disiapkan: pengembalian manual 90% dari pembayaran produk yang diterima setelah diskon/voucher, tanpa ongkir; 10% tidak dikembalikan. Maksimal 1 x 24 jam sejak pembatalan dikonfirmasi. Kebijakan ditampilkan sebelum pemesanan; nominal/status/bukti dicatat. Pembulatan belum final. |
| Pengembalian pembatalan toko | SETUJU | Jika toko membatalkan karena pesanan tidak dapat dipenuhi: kembalikan 100% pembayaran produk yang diterima setelah diskon/voucher, tanpa potongan, maksimal 1 x 24 jam sejak pembatalan dikonfirmasi. Proses manual; alasan/pihak pembatal, nominal/status/bukti dicatat. Ongkir terpisah. |
| Tenggat pengembalian | SETUJU | Maksimal 1 x 24 jam sejak konfirmasi pembatalan untuk pengembalian 90% maupun 100%, bukan hari kerja. Catat waktu konfirmasi, jatuh tempo dan penyelesaian aktual; tampilkan keterlambatan. Tidak melakukan transfer atau menandai selesai otomatis. |
| Dashboard | SETUJU (CAKUPAN) | Dashboard masuk versi pertama. Rekomendasi indikator: pesanan hari ini, preorder besok, belum lunas, penjualan lunas dari data nyata; detail indikator belum final. |
| Setup Produk | SETUJU | Upload foto produk, kategori, nama produk dan harga produk; susunan preview disetujui. Foto di Drive; data produk serta referensi file di Sheets. Validasi upload dan optimasi gambar diperlukan; belum fungsi aktif. |
| Diskon / voucher | SETUJU | Fitur dan susunan preview disetujui; hanya Admin mengatur promo, termasuk lewat perubahan produk. Voucher tanpa kuota penggunaan, mengikuti masa berlaku dan syarat promo. Voucher hanya memotong produk non-diskon. Minimum belanja dihitung dari seluruh subtotal produk (harga promo yang berlaku, sebelum voucher), termasuk produk diskon, tanpa ongkir. Bukan izin build. |
| CRUD dan filter | SETUJU (CAKUPAN MODUL) | Pengelolaan produk/stok, pesanan dan Setup User masuk versi pertama. Detail pencarian, filter, sorting, validasi dan riwayat masih rancangan. Transaksi tidak dihapus permanen. |
| PDF / Excel | SETUJU (CAKUPAN) | Laporan PDF/Excel masuk versi pertama; detail kolom, periode, filter dan format .xlsx perlu dirancang sesuai izin pengguna. |
| Login dan level | SETUJU | Setup User oleh Admin; Admin seluruh fitur, Operator operasional sesuai izin, Viewer hanya dashboard/laporan. Susunan Login dan Setup User disetujui. |
| Keamanan | BELUM DIPUTUSKAN | Rekomendasi: verifikasi backend, password hash dengan algoritme khusus password, sesi kedaluwarsa, batas percobaan, reset aman, larangan menonaktifkan admin terakhir. Kelayakan implementasi pada Apps Script perlu diverifikasi. |
| Platform | SETUJU | HTML, CSS, JavaScript, Bootstrap; source code GitHub; frontend melalui Apps Script HTML Service; backend Apps Script; database Sheets di Drive. |
| Mode operasional | SETUJU | Seluruh aplikasi versi pertama bekerja online. Tidak mengonfirmasi pesanan cloud saat koneksi terputus. |
| Offline / auto-sync | DI LUAR CAKUPAN | Mode transaksi offline dan sinkronisasi pesanan offline tidak termasuk paket online yang disetujui. |
| Integrasi tambahan | BELUM DIPUTUSKAN | Rekomendasi SKIP AI, WhatsApp API dan payment gateway versi pertama. GoSend tetap manual. |
| Konsep A / B | SETUJU | Gabungan katalog praktis A dan visual editorial B. |
| Palet final | SETUJU | Tosca #065B55, orange #F58B32, cream #FFFCF6, abu muda #F2F3F4, hitam #171717, putih #FFFFFF. |
| Desktop / tablet / mobile | BELUM DIPUTUSKAN | Preview tersedia; persetujuan keseluruhan layout, portrait dan landscape belum final. |
| Logo / foto | BELUM DIPUTUSKAN | Logo akan ditambahkan; aset belum tersedia. Foto belum ditinjau. Jangan menganggap tampilan tanpa foto sebagai desain final berfoto. |
| Database / backup | SETUJU (CAKUPAN BACKUP) | Database Sheets/Drive dan fitur backup masuk versi pertama. Rancangan privasi, audit, pencegahan duplikat, penguncian stok, jadwal/retensi backup dan pemulihan belum final. |
| Hosting / alur akses | SETUJU | https://www.beratidealku.com -> tombol pemesanan -> URL web app Apps Script. Tidak menggunakan GitHub Pages sebagai tujuan toko atau Cloudflare/penghubung tambahan. URL deployment nyata belum dibuat; perubahan tombol website dan deployment belum diizinkan. |
| Batas versi pertama | SETUJU | Toko/checkout sesuai keputusan sebelumnya; dashboard, produk/stok termasuk promo yang disepakati, pesanan, Setup User, laporan PDF/Excel, pengaturan dan backup. Seluruhnya online. Ini persetujuan cakupan, bukan izin coding utama, deployment atau pembelian layanan. |
| Pengujian / penerimaan | BELUM DIPUTUSKAN | Login/izin, CRUD, filter, laporan, hitungan, batas WITA, stok bersamaan, pembatalan, responsivitas dan regresi. Belum ada tes aplikasi final yang dijalankan. |

## Yang Masih Harus Diselesaikan

- GoSend: pengguna memilih "belum, perlu dicek" untuk pengalaman pembayaran ongkir langsung ke kurir di Makassar. Verifikasi dukungan pada akun/layanan sebelum pengantaran dibuka; pilihan alur tetap, bukan klaim kemampuan penyedia. Jika tidak didukung, minta persetujuan alternatif. Tidak perlu menghentikan penyelesaian blueprint bagian lain.
- Preview telah disesuaikan: ongkir GoSend terpisah/belum dikonfirmasi, wilayah aktif, empat skenario checkout, batas 17.00/18.00 WITA dan aturan refund. Tampilan stok, pengaturan, laporan serta status privat ditambahkan sebagai mockup. Pemeriksaan visual/interaksi semua viewport belum berhasil; perubahan perlu review.
- Susunan preview Setup Produk dengan upload foto, kategori, nama, harga, diskon dan voucher disetujui. Pengaturan promo hanya Admin. Voucher tanpa kuota penggunaan, hanya memotong produk non-diskon; minimum belanja dari seluruh subtotal produk sebelum voucher, termasuk harga promo produk diskon, tanpa ongkir. Pastikan izin, syarat, masa berlaku, harga dan potongan valid di backend; perubahan promo/harga tidak mengubah transaksi yang sudah tersimpan. Batas stok/kuota produksi tetap terpisah. Verifikasi penyajian foto Drive tanpa membuka data privat.
- Finalkan alamat/nilai jadwal toko, nominal interval menit, nominal menit persiapan langsung, daftar aktual wilayah Makassar dan sekitarnya, penagihan/perubahan ongkir dan ketentuan pengembalian. Pengaturan daftar wilayah oleh Admin serta pilihan wilayah pelanggan disetujui, terpisah dari tarif GoSend. Admin mengatur hari/rentang layanan, interval serta minimal persiapan sudah disetujui. Uji waktu pilihan yang menjadi kedaluwarsa selama checkout dan ketiadaan waktu valid hari ini; jangan menggeser waktu atau jenis pesanan tanpa persetujuan pelanggan. Data operasional dapat diisi di pengaturan sebelum go live, tetapi aturan inti harus jelas sebelum build.
- Pemisahan stok langsung dan kuota preorder per produk/tanggal serta penahanan saat pesanan berhasil dibuat disetujui. Rancang dan uji konsistensi pencatatan pesanan/penahanan pada Apps Script, pencegahan kelebihan pesanan bersamaan, duplikasi saat retry dan pelepasan berulang saat pembatalan. Tidak ada pembatalan otomatis yang disetujui.
- Verifikasi autentikasi akun buatan Admin, sesi dan komunikasi frontend HTML Service dengan backend Apps Script sebelum meminta izin build. Persetujuan platform bukan bukti keamanan atau kelayakan runtime.
- Alur akses sudah disetujui: website beratidealku.com menuju web app Apps Script; source tetap GitHub. GitHub Pages tidak digunakan untuk toko. URL nyata baru dapat dicatat setelah deployment yang diizinkan.

Setelah desain dan keputusan kritis lengkap, ajukan persetujuan:
**SETUJU - GENERATE FINAL BUILD**
Tidak ada pembelian layanan, pengiriman pesan nyata atau transaksi yang otomatis diizinkan.
