# Healthy Vibes: Blueprint Ringkas

Status: DRAF REVIEW. Belum merupakan izin pembangunan aplikasi.
SETUJU berarti keputusan pengguna; rekomendasi yang belum diterima tetap BELUM DIPUTUSKAN.

| Checklist | Status | Keputusan / Rekomendasi |
| --- | --- | --- |
| Nama dan tujuan | SETUJU | Healthy Vibes, penjualan makanan dan minuman sehat. |
| Target pengguna | SETUJU | Pelanggan tanpa akun wajib: nama, nomor HP, alamat bila diantar; status pesanan tetap privat. Pengelola memakai akun buatan Admin sesuai level. |
| Alur pesanan | SETUJU | Langsung atau preorder H-1, antar atau ambil. Makassar dan sekitarnya, WITA. |
| Pembayaran | SETUJU | Preorder masuk sebelum 17.00, pembayaran produk maksimal 18.00 WITA. Pengantaran: produk lunas sebelum dikirim. Bayar saat ambil hanya untuk pesanan langsung. |
| Pengiriman | SETUJU | GoSend dipesan manual oleh pengelola; ongkir pelanggan, terpisah dan disetujui saat pengiriman. Bukan integrasi API otomatis. |
| Pembatalan | SETUJU | Permintaan pelanggan diputuskan pengelola; pengembalian manual dicatat. Preorder belum terverifikasi diperiksa setelah 18.00 sebelum dibatalkan dan kuota dilepas. |
| Dashboard | BELUM DIPUTUSKAN | Rekomendasi: pesanan hari ini, preorder besok, belum lunas, penjualan lunas dari data nyata. |
| Setup Produk | SETUJU | Upload foto produk, kategori, nama produk dan harga produk. Foto di Drive; data produk serta referensi file di Sheets. Validasi upload dan optimasi gambar diperlukan; preview form belum disetujui. |
| Diskon / voucher | SETUJU | Fitur diminta pengguna; voucher tidak boleh digabung dengan diskon produk. Detail field, keranjang campuran, kuota dan izin pengelola belum final. Preview promo masih menunggu persetujuan visual. |
| CRUD dan filter | BELUM DIPUTUSKAN | Produk, stok/kuota, pesanan, pengguna; pencarian, filter, sorting, validasi dan riwayat. Transaksi tidak dihapus permanen. |
| PDF / Excel | BELUM DIPUTUSKAN | Laporan mengikuti periode, filter dan izin; ekspor PDF dan .xlsx. |
| Login dan level | SETUJU | Setup User oleh Admin; Admin seluruh fitur, Operator operasional sesuai izin, Viewer hanya dashboard/laporan. Susunan Login dan Setup User disetujui. |
| Keamanan | BELUM DIPUTUSKAN | Rekomendasi: verifikasi backend, password hash dengan algoritme khusus password, sesi kedaluwarsa, batas percobaan, reset aman, larangan menonaktifkan admin terakhir. Kelayakan implementasi pada Apps Script perlu diverifikasi. |
| Platform | SETUJU | HTML, CSS, JavaScript, Bootstrap; source code GitHub; backend Apps Script; database Sheets di Drive. |
| Mode operasional | BELUM DIPUTUSKAN | Rekomendasi: web online. Tidak menerima pesanan cloud saat koneksi terputus. |
| Offline / auto-sync | BELUM DIPUTUSKAN | Rekomendasi SKIP versi pertama. |
| Integrasi tambahan | BELUM DIPUTUSKAN | Rekomendasi SKIP AI, WhatsApp API dan payment gateway versi pertama. GoSend tetap manual. |
| Konsep A / B | SETUJU | Gabungan katalog praktis A dan visual editorial B. |
| Palet final | SETUJU | Tosca #065B55, orange #F58B32, cream #FFFCF6, abu muda #F2F3F4, hitam #171717, putih #FFFFFF. |
| Desktop / tablet / mobile | BELUM DIPUTUSKAN | Preview tersedia; persetujuan keseluruhan layout, portrait dan landscape belum final. |
| Logo / foto | BELUM DIPUTUSKAN | Logo akan ditambahkan; aset belum tersedia. Foto belum ditinjau. Jangan menganggap tampilan tanpa foto sebagai desain final berfoto. |
| Database / backup | BELUM DIPUTUSKAN | Rekomendasi: Drive privat; audit, pencegahan duplikat, penguncian perubahan stok, backup dan prosedur pemulihan. |
| Hosting / domain | BELUM DIPUTUSKAN | GitHub adalah repository, bukan database. Hosting toko perlu sesuai ketentuan penggunaan; jangan mengasumsikan GitHub Pages cocok untuk transaksi komersial. Domain khusus opsional. |
| Batas versi pertama | BELUM DIPUTUSKAN | Rekomendasi: toko, checkout/status privat, dashboard, operasional, Setup User, laporan, pengaturan dan backup. |
| Pengujian / penerimaan | BELUM DIPUTUSKAN | Login/izin, CRUD, filter, laporan, hitungan, batas WITA, stok bersamaan, pembatalan, responsivitas dan regresi. Belum ada tes aplikasi final yang dijalankan. |

## Yang Masih Harus Diselesaikan

- Sesuaikan preview lama: ongkir GoSend belum pasti saat checkout, bukan tarif wilayah atau total final; tampilkan batas 17.00/18.00 WITA dan aturan pembayaran terbaru.
- Preview Setup Produk dengan upload foto, kategori, nama, harga, diskon dan voucher sudah tersedia; tunggu persetujuan visual. Finalkan perlakuan keranjang campuran tanpa penggabungan promo. Pastikan harga, potongan dan kuota valid di backend; perubahan promo/harga tidak mengubah transaksi yang sudah tersimpan. Verifikasi penyajian foto Drive tanpa membuka data privat.
- Finalkan alamat/jam toko, cakupan sekitar Makassar, penahanan stok, penagihan/perubahan ongkir dan ketentuan pengembalian. Data operasional dapat diisi di pengaturan sebelum go live, tetapi aturan inti harus jelas sebelum build.
- Verifikasi arsitektur autentikasi, hosting dan koneksi frontend ke Apps Script sebelum meminta izin build.

Setelah desain dan keputusan kritis lengkap, ajukan persetujuan:
**SETUJU - GENERATE FINAL BUILD**
Tidak ada pembelian layanan, pengiriman pesan nyata atau transaksi yang otomatis diizinkan.
