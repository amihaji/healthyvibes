# UAT Healthy Vibes v1.0

Isi setiap baris: PASS / FAIL / N/A, browser, perangkat, catatan dan screenshot jika FAIL.

| ID | Area | Langkah uji | Hasil yang diharapkan | Status |
|---|---|---|---|---|
| 01 | Responsif | Buka katalog di 320, 390, 820, 1280 px | Tidak ada konten terpotong/scroll horizontal halaman | |
| 02 | Header | Buka/tutup menu HP, klik Home, Katalog | Menu berfungsi; Home tetap ke beratidealku.com | |
| 03 | Katalog | Lihat banner, foto, harga, promo, voucher | Foto, label dan harga terbaca, data sama seperti sebelum revisi | |
| 04 | Katalog | Cari, ubah kategori, filter stok, pindah halaman | Hasil benar dan kontrol tidak saling bertumpuk | |
| 05 | Keranjang | Tambah produk, ubah jumlah, hapus produk | Jumlah dan total tetap benar | |
| 06 | Keranjang HP | Scroll, buka keyboard dan gunakan keranjang bawah | Tombol tetap dapat diakses tanpa menutup form | |
| 07 | Checkout | Jalankan checkout di lingkungan uji | Alur dan total sesuai versi lama; tidak membuat pesanan ganda | |
| 08 | Pembayaran | Uji tampilan metode bayar, upload bukti bila tersedia | Validasi dan respons tetap berjalan | |
| 09 | Login | Login benar, salah, logout | Pesan kesalahan jelas; akses sesuai akun | |
| 10 | Pesanan Saya | Lihat daftar, detail dan status pesanan | Data sesuai backend; aksi tetap berfungsi | |
| 11 | Admin | Login per role, buka setiap menu yang diizinkan | Hak akses tidak berubah | |
| 12 | Admin data | Cari, paginasi, tambah/edit/hapus data uji | Dialog, tombol, dan tabel berfungsi; tidak ada kehilangan data | |
| 13 | Admin pesanan | Lihat detail dan ubah status pesanan uji | Status tersimpan dan tampil benar | |
| 14 | Admin lain | Buka pengaturan, laporan, stok, promo, voucher | Tampilan terbaca dan semua kontrol bekerja | |
| 15 | Dialog | Buka/tutup modal pada HP dan desktop | Konten dapat digulir, tombol tidak terpotong | |
| 16 | Aksesibilitas | Tab keyboard, fokus, zoom 200%, reduced motion | Fokus terlihat; tombol dapat digunakan | |
| 17 | Integrasi | Periksa console browser dan Network | Tidak ada error JS baru; API tetap menuju endpoint semula | |
| 18 | Performa | Bandingkan waktu muat sebelum/sesudah di perangkat sama | Tidak ada penurunan yang mengganggu | |

Catatan: gunakan data uji, jangan melakukan transaksi riil tanpa persetujuan pengelola.
