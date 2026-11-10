# Healthy Vibes Redesign v1.0 (Tahap 1)

## Cakupan
Penyegaran tampilan menyeluruh menggunakan palet dark teal #065B55, orange #F58B32, cream #FFFCF6. Berbasis CSS override di akhir `css/styles.css`. Semua file JavaScript dan `index.html` disalin identik dari sumber. Tidak ada perubahan backend, endpoint, login, harga, checkout, atau hak akses.

## Pemasangan
1. Backup repository/website aktif dan simpan commit atau ZIP versi sebelumnya.
2. **Pilihan paling aman:** ganti hanya `css/styles.css` pada repository dengan file dalam paket ini. `index.html` dan seluruh JS di paket disertakan untuk referensi, bukan wajib ditimpa.
3. Pertahankan folder `image/` yang sudah ada di website. Gambar tidak termasuk dalam paket ini.
4. Publikasikan ke branch/staging pengujian terlebih dahulu. Bersihkan cache browser (Ctrl+F5).
5. Jalankan UAT dalam `UAT_CHECKLIST.md`. Baru gabungkan ke production setelah lulus.

## Rollback
Kembalikan `css/styles.css` dari backup/commit sebelumnya, lalu refresh cache.

## Batas verifikasi
Pemeriksaan ini tidak mengakses backend produksi dan tidak melakukan transaksi nyata. Fitur perlu diuji secara manual pada staging.
