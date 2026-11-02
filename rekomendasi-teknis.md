# Healthy Vibes: Rekomendasi Teknis untuk Review

Catatan 2 November 2026: rekomendasi hosting di bawah adalah riwayat.
Pengguna kini memilih frontend GitHub Pages dan backend API Apps Script,
setelah batas penggunaan Pages dijelaskan. Acuan pemasangan aktif ada di
`panduan-pemasangan.md` dan `panduan-update-otomatis.md`.

Status: DRAF / BELUM DIPUTUSKAN untuk rekomendasi baru. Bukan izin coding, deployment atau pembelian layanan.
Keputusan bisnis yang sudah disetujui tetap mengikuti acuan-desain.md. Dokumen ini melengkapi, bukan menggantikannya.

## Kesimpulan

- Yang sudah tepat: Bootstrap, tampilan mobile, source code GitHub, backend Apps Script, Sheets/Drive, pembayaran manual, pemisahan stok dan preorder.
- Yang perlu diperbaiki: hosting bukan GitHub Pages; akses database tidak boleh publik; login akun Admin tidak boleh hanya diperiksa browser.
- Yang ditunda (rekomendasi): AI, WhatsApp API, payment gateway dan transaksi offline. Tidak menambah integrasi tanpa persetujuan.
- Pilihan akses terbaru SETUJU: https://www.beratidealku.com -> tombol pemesanan -> URL web app Apps Script. Frontend HTML Service, backend Apps Script, source GitHub, data Sheets/Drive. Cloudflare/penghubung tidak dipilih. URL nyata belum tersedia; bukan izin build, perubahan website atau deployment. Uji koneksi dan autentikasi sebelum implementasi penuh.

## Arsitektur yang Dipilih dan Batas Verifikasi

| Bagian | Rekomendasi | Batas verifikasi |
| --- | --- | --- |
| Source code | HTML/CSS/JavaScript + Bootstrap dan script backend di GitHub; rahasia tidak masuk repository. | Belum membuat commit/push/repository. |
| Hosting / frontend | Apps Script HTML Service menyajikan HTML/CSS/JavaScript/Bootstrap. Tombol website beratidealku.com menuju URL web app Apps Script. | Alur disetujui; URL deployment nyata belum dibuat. GitHub Pages bukan tujuan toko; Cloudflare tidak dipilih. |
| Backend | Google Apps Script memvalidasi role, jadwal WITA, wilayah, harga, promo dan perubahan status. | Belum ada deployment atau endpoint nyata. |
| Database | Google Sheets privat; Drive memisahkan foto katalog, bukti transaksi dan backup. | Foto publik hanya aset katalog yang diizinkan, bukan folder database/bukti. |
| Komunikasi | Rancang dan uji panggilan frontend HTML Service ke backend Apps Script, termasuk error, otorisasi dan retry. | Belum diuji runtime; bukti Content Service bukan bukti otomatis untuk komunikasi HTML Service. |
| Penghubung tambahan | Cloudflare Pages/Pages Functions dan gateway tambahan tidak dipilih untuk saat ini. | Bila kelayakan Apps Script tidak terbukti, jelaskan kendala dan minta persetujuan sebelum perubahan arsitektur. |

GitHub Pages secara resmi tidak diperbolehkan menjadi hosting bisnis online/e-commerce. Menyimpan source code di GitHub tetap sesuai kebutuhan pengguna.
Apps Script bukan database transaksi penuh: Sheet tidak memiliki transaksi ACID. LockService saja tidak menjamin semua penulisan berhasil bersama.

## Login dan Privasi

- Akun tetap dibuat Admin melalui Setup User, bukan login Google. Admin mengelola akses; Operator operasional tanpa pengaturan promo; Viewer dashboard/laporan saja.
- Rekomendasi sesi: kedaluwarsa setelah 30 menit tidak aktif, maksimum 8 jam; logout/reset password/penonaktifan/perubahan role mencabut sesi. Nilai ini usulan.
- Password memakai algoritme khusus password, salt unik dan faktor kerja terukur. Dilarang password polos, enkripsi yang bisa dibalik atau SHA-256 sekali saja.
- Kelayakan pustaka password hashing, sumber acak kriptografis dan biaya runtime pada Apps Script harus dibuktikan. Jangan menurunkan keamanan demi platform; ajukan layanan autentikasi/gateway jika diperlukan tanpa mengubah kepemilikan akun oleh Admin.
- Rekomendasi: batas percobaan login per akun dan mekanisme pencegahan spam; hindari penguncian permanen yang bisa disalahgunakan.
- Pada HTML Service yang dipilih, rancangan sesi, penyimpanan token, XSS dan perlindungan request harus diselesaikan dan diuji; jangan menaruh token dalam query URL atau log. Rancangan cookie gateway sebelumnya bukan rancangan aktif dan tidak otomatis tersedia di Apps Script.
- Admin pertama dibuat melalui proses instalasi oleh pemilik; tidak ada password default publik. Password awal/reset bersifat sementara dan wajib diganti. Jangan menampilkan password lama.
- Status pelanggan: usulan akses privat dengan token acak berentropi tinggi per pesanan, backend menyimpan hash token; nomor pesanan/HP saja tidak cukup. Token tidak muncul di URL query/log/referer. Usulan kedaluwarsa 30 hari setelah selesai; pemulihan melalui verifikasi pengelola.
- Dataset dan laporan dipilih backend sesuai izin. Jangan mengirim semua data ke browser lalu menyembunyikannya dengan filter.

## Data dan Transaksi

Tabel yang diusulkan: Users, Sessions, Categories, Products, ProductDiscounts, Vouchers, ReadyStock, PreorderCapacity, Orders, OrderItems, Payments, Refunds, Shipping, ServiceHours, ServiceAreas, Settings dan AuditLog.

- ReadyStock per produk; PreorderCapacity per produk/tanggal penerimaan. Tidak saling mengurangi.
- Pembuatan pesanan menggunakan request ID unik, pemeriksaan di bawah lock, jurnal status penulisan dan prosedur rekonsiliasi. Jika respons hilang, cek request ID sebelum retry; jangan membuat pesanan/penahanan kedua.
- Bila penulisan terputus, tandai untuk pemulihan dan hentikan penerimaan bila konsistensi stok tidak dapat dipastikan. Uji gagal di tengah penulisan, bukan hanya skenario berhasil.
- Harga, nama produk, diskon/voucher, kuantitas, ketentuan refund dan jadwal disalin ke transaksi agar perubahan setup tidak mengubah pesanan lama.
- Pisahkan status pembayaran, pemenuhan, pembatalan, pengembalian dana dan pengiriman. Lunas bukan berarti selesai; batal bukan berarti refund selesai.
- Waktu mulai persiapan dicatat; sebelum menyetujui pembatalan, periksa kembali tahap di backend. Produk sudah terpakai tidak otomatis kembali menjadi stok siap jual saat toko membatalkan; catat penyesuaian/waste secara terpisah.
- Rekomendasi alur pemenuhan: baru, dikonfirmasi, disiapkan, siap diambil/dikirim, dikirim, selesai, batal. Preorder dan pengantaran hanya mulai disiapkan setelah pembayaran produk terverifikasi; pesanan langsung ambil boleh bayar saat ambil.
- Soft delete untuk master; transaksi/audit tidak dihapus permanen melalui aplikasi. Perubahan langsung pada Sheet dibatasi karena dapat melewati aturan aplikasi.

## Aturan Hitungan yang Diusulkan

- Mata uang rupiah integer; diskon persen dibulatkan ke rupiah terdekat, refund 90% dibulatkan ke atas bila pecahan rupiah. Ini rekomendasi baru, perlu persetujuan.
- Satu kode voucher per pesanan (rekomendasi); tanpa kuota. Minimum belanja: subtotal semua produk sesudah diskon produk, sebelum voucher, tanpa ongkir.
- Basis potongan voucher hanya subtotal produk non-diskon. Potongan tidak melebihi basis yang berhak atau batas maksimum promo; ongkir tidak dipotong (rekomendasi konsisten dengan basis produk).
- Contoh: produk promo Rp30.000 + normal Rp20.000; minimum Rp50.000 terpenuhi. Voucher 10% memotong Rp2.000, pembayaran produk Rp48.000. Refund pelanggan 90% = Rp43.200; refund toko 100% = Rp48.000.
- Rekomendasi preorder hanya besok, ditolak mulai 17.00. Jika besok toko tutup atau kuota belum diatur, jangan mengganti tanggal secara otomatis. Masa berlaku promo dicek saat pesanan dibuat, menggunakan WITA.

## Foto, Performa dan Laporan

- Usulan upload JPG/PNG/WebP maksimal 5 MB, diperiksa format asli/dimensi, bukan ekstensi saja; tolak SVG/HTML. Resize di browser dan validasi ulang backend; jangan percaya output browser.
- Usulan gambar katalog sisi terpanjang 1.200 px, thumbnail terpisah, lazy loading, rasio konsisten. Foto katalog Drive dipisahkan; uji tautan dan izin akses sebelum memilih metode penyajian.
- Bootstrap CSS/JS versi dipatok; aset vendor dapat disimpan bersama frontend. Muat pustaka ekspor hanya saat diperlukan; pagination server, query batch dan cache katalog singkat. Stok/harga tetap diperiksa ulang saat checkout.
- KPI usulan: pesanan hari ini, preorder besok, pembayaran belum diverifikasi, penerimaan produk terverifikasi dan refund tertunda/terlambat. Bedakan penerimaan kas dari penjualan dan refund; ongkir ke kurir bukan omzet toko.
- Laporan usulan: penjualan produk, pembayaran, refund, preorder/produksi dan mutasi stok; filter tanggal WITA, jenis pesanan, kategori, status.
- PDF/print dan Excel .xlsx harus memakai snapshot/filter/izin yang sama. Kolom: nomor pesanan, waktu, jenis, produk/jumlah, harga, diskon, voucher, pembayaran, refund, neto dan status. Detail pelanggan hanya bila sesuai izin.
- Excel bukan CSV yang diganti ekstensi; cegah formula injection pada teks pengguna. PDF tabel panjang berulang header, total dan nomor halaman.

## Backup dan Pengujian

- Rekomendasi backup harian otomatis dan manual Admin, retensi 30 hari, termasuk Sheets, foto/bukti yang diperlukan dan versi konfigurasi. Rahasia terpisah; akses backup privat.
- Restore hanya Admin dengan konfirmasi, ke salinan staging dahulu; jangan menimpa produksi otomatis. Uji satu pemulihan lengkap sebelum go live.
- Pengujian wajib: login/role negatif, reset/revokasi, CRUD/filter, PDF/.xlsx, hitungan promo/refund, batas 17.00/18.00 WITA, jadwal/interval/persiapan, stok bersamaan/retry, gagal penulisan, audit dan backup/restore.
- UI: 320/390/820/1280 px serta landscape, tabel/kartu, keyboard/fokus, modal, drawer dan tidak ada overflow halaman. Pembandingan visual terhadap desain disetujui.
- GoSend: pembayaran ongkir langsung ke kurir belum diverifikasi di Makassar. Tidak membuka alur ini untuk transaksi nyata sebelum dukungan dikonfirmasi; alternatif harus mendapat persetujuan.
- Target awal performa (usulan): tampilan utama terbaca <=3 detik pada koneksi uji yang dicatat, tidak memuat semua foto/data di awal. Ini target, bukan hasil ukur.
- UAT pengguna cukup visual, fungsi inti dan hasil laporan setelah pengujian otomatis. Belum ada tes aplikasi utama atau deployment yang berhasil.

## Sumber dan Gerbang Persetujuan

1. GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
2. Apps Script Content Service: https://developers.google.com/apps-script/guides/content
3. GoSend COD: https://www.gojek.com/blog/gosend/cod

Dokumen 1 dan 2 dibaca pada sesi ini; dokumen 3 dibaca pada pembahasan pengiriman sebelumnya. Panduan COD bukan bukti layanan ongkir saja tersedia di Makassar.
Sebelum izin build final: persetujuan layout lengkap, rincian rekomendasi dan kelayakan autentikasi/koneksi Apps Script. Alur akses/hosting sudah dipilih. Logo/foto aktual masih menunggu; jangan menganggap preview tanpa foto sebagai visual final berfoto.
Persetujuan paket rekomendasi tidak otomatis menyetujui layanan berbayar, gateway tambahan atau membuka pengantaran yang belum diverifikasi.
