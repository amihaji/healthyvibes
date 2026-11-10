# Healthy Vibes Redesign v1.1, Tahap 2

## Lingkup
Penyempurnaan UI/UX katalog, keranjang, checkout, status pesanan, dan tabel admin secara CSS-only. Warna tetap dark teal #065B55 dan orange #F58B32. File ini dibuat berdasarkan CSS v1.0 yang telah dinyatakan lolos UAT oleh pemilik aplikasi.

## Cara pasang
1. Backup file `css/styles.css` versi 1.0 yang sedang berjalan.
2. Ekstrak ZIP v1.1.
3. Ganti **hanya** `css/styles.css` dengan file dalam ZIP.
4. Jangan menimpa `index.html`, file `js/`, Google Apps Script, maupun database.
5. Bersihkan cache browser (Ctrl+F5) dan uji di staging sebelum production.
6. Bila ada regresi, rollback dengan mengembalikan CSS v1.0 yang dibackup.

## Perubahan v1.1
- Fokus keyboard lebih terlihat pada tombol dan tautan.
- Kartu produk lebih stabil saat judul/deskripsi panjang dan gambar dimuat.
- Filter katalog memiliki tinggi input konsisten.
- Detail pesanan dan layout lebih tahan terhadap teks panjang.
- Tabel admin lebih mudah dibaca, dengan efek hover ringan.
- Ukuran tombol aksi dan navigasi pagination ditingkatkan pada layar HP.
- Penyesuaian viewport 320 px dan dukungan reduced motion.

## Batasan
Tidak ada perubahan JavaScript, HTML, endpoint, autentikasi, checkout, harga, stok, pembayaran, atau hak akses. Perubahan CSS tetap perlu diuji di browser nyata. Versi ini tidak menyertakan pengujian transaksi langsung.
