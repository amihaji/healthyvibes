# Healthy Vibes: Acuan Desain dan Keputusan

## Disetujui

- Palet: tosca tua `#065B55`, orange `#F58B32`, cream muda `#FFFCF6`, abu-abu muda `#F2F3F4`, hitam `#171717`, putih `#FFFFFF`.
- Hijau tua tetap dipertahankan; persetujuan terakhir untuk cream muda sekaligus menyelesaikan review palet.
- Arah konsep: gabungan katalog praktis Konsep A dan gaya visual Konsep B.
- Susunan checkout tiga langkah: penerima, pembayaran, tinjau pesanan. Persetujuan ini untuk susunan checkout, bukan persetujuan build atau seluruh layout perangkat.
- Pelanggan dapat memilih diantar atau mengambil sendiri.
- Pelanggan dapat memesan tanpa wajib membuat akun, dengan nama, nomor HP dan alamat untuk pengantaran. Status pesanan tetap privat; nomor pesanan saja bukan bukti hak akses. Mekanisme akses privat perlu ditetapkan dan diverifikasi dalam rancangan keamanan.
- Pengantaran menggunakan GoSend dari Gojek; "goraid" adalah salah ketik, bukan GoRide. Pengelola toko memesan kurir melalui aplikasi penyedia dan mengonfirmasi ongkir kepada pelanggan. Tarif per wilayah bukan pilihan yang disetujui. Tidak ada integrasi API otomatis yang disetujui.
- Zona waktu usaha: WITA (UTC+8), pengaturan teknis `Asia/Makassar`. Batas pemesanan 17.00 dan pembayaran 18.00 menggunakan WITA, bukan zona waktu perangkat pelanggan.
- Cakupan layanan hanya Kota Makassar, Sulawesi Selatan, dan sekitarnya. Batas wilayah sekitar yang dilayani serta tarifnya belum ditentukan; jangan mengasumsikan seluruh Sulawesi Selatan tercakup.
- Pesanan langsung dan preorder H-1; batas preorder pukul 17.00 mengikuti zona waktu usaha.
- Pembayaran preorder harus masuk paling lambat pukul 18.00 pada hari pemesanan, mengikuti zona waktu usaha.
- Transfer bank / QRIS manual; produk untuk pengantaran wajib lunas sebelum dikirim. Bayar saat diambil hanya tersedia untuk pesanan langsung yang diambil sendiri; preorder wajib dibayar di muka.
- Ongkir GoSend ditanggung pelanggan setelah tarif disetujui dan dicatat terpisah dari pembayaran produk. Untuk preorder, pembayaran produk maksimal 18.00 WITA pada hari pemesanan; ongkir dikonfirmasi saat pengiriman. Cara penagihan ongkir dan penanganan perubahan tarif belum final.
- Pembayaran manual diverifikasi pengelola berdasarkan transaksi masuk, bukan hanya foto bukti transfer.
- Setelah pukul 18.00, pengelola memeriksa transaksi masuk untuk preorder belum terverifikasi, lalu mengonfirmasi pembayaran atau membatalkan pesanan. Tidak ada pembatalan otomatis hanya karena pembayaran belum diverifikasi. Kuota dilepas setelah pembatalan; riwayat pesanan dan keputusan tetap tersimpan.
- Pelanggan mengajukan permintaan pembatalan; pengelola menyetujui atau menolak sesuai tahap persiapan. Permintaan tidak otomatis membatalkan pesanan. Pengembalian dana, bila ada, dilakukan manual dan dicatat terpisah; status batal bukan bukti dana sudah dikembalikan. Keputusan dan alasan pengelola disimpan dalam riwayat.
- Platform: HTML, CSS, JavaScript, Bootstrap, GitHub dan Google Apps Script; database Google Sheets di Google Drive.
- Akun pengelola dibuat dan dikelola admin melalui menu Setup User, sesuai level pengguna. Login Google bukan pilihan yang disetujui. Level Admin, Operator dan Viewer disetujui.
- Admin: seluruh fitur, Setup User, pengaturan toko dan laporan. Operator: produk, stok, pesanan, verifikasi pembayaran serta pembatalan sesuai izin. Viewer: melihat dashboard dan laporan, tanpa mengubah data. Semua izin divalidasi backend; Operator dan Viewer tidak boleh mengelola akun atau meningkatkan level sendiri.
- Susunan tampilan Login dan Setup User disetujui. Persetujuan visual bukan bukti autentikasi atau pengelolaan akun sudah berfungsi.
- Setup Produk wajib mencakup upload foto produk, kategori, nama produk dan harga produk. Tambahan ini adalah kebutuhan yang disetujui, bukan izin build atau persetujuan paket fitur lain yang masih ditawarkan.
- Tambahan diskon/voucher diminta pengguna. Voucher tidak boleh digabung dengan diskon produk, sesuai pilihan A pengguna. Preview diusulkan berupa diskon produk (persen/nominal, periode) dan voucher pesanan (kode, nilai, minimum belanja, maksimum potongan, periode, kuota, jenis pesanan). Rincian field, penanganan keranjang campuran produk diskon/non-diskon dan izin pengelola masih perlu disepakati. Rekomendasi voucher tidak memotong ongkir GoSend. Validasi promo dan kuota harus di backend; transaksi menyimpan nilai potongan saat dipesan.
- Rancangan upload: pengelola memilih foto dari HP/komputer melalui aplikasi; backend memvalidasi izin, jenis dan ukuran file. Foto disimpan di Google Drive, metadata produk dan referensi file di Google Sheets. Optimalkan ukuran foto untuk katalog; jangan membuka folder database, data pelanggan atau file privat lainnya demi menampilkan foto produk. Cara penyajian foto katalog perlu diverifikasi sebelum deployment.

## Menunggu Review

- Layout desktop, tablet, HP dan landscape: preview tersedia, belum mendapat persetujuan final.
- Checkout: susunan disetujui; preview masih memakai data contoh dan kontrol transaksi tidak aktif. Alur permintaan pembatalan serta pengembalian dana manual disetujui; rincian kelayakan dan nominal pengembalian perlu ditampilkan dalam kebijakan toko sebelum digunakan pelanggan.
- Tipografi: usulan Georgia untuk judul editorial, Arial untuk teks operasional.
- Komponen: kartu membulat, kontrol utama minimal 44 px; keranjang bawah pada HP dan tablet; ringkasan kanan pada desktop.
- Panel pengelola: tabel desktop/tablet dan kartu pesanan HP.
- Preview Login dan Setup User: susunan disetujui; tetap mockup, bukan autentikasi atau pengelolaan akun aktif.
- Setup Produk: preview upload, kategori, nama, harga tersedia dan direvisi dengan diskon produk serta Setup Voucher; masih menunggu persetujuan visual dan aturan promo. Semua angka promo adalah contoh, bukan data nyata.
- Logo: akan ditambahkan; file belum tersedia. Pertahankan rasio asli dengan object-fit contain, bukan crop.
- Foto produk: belum disetujui; preview saat ini tanpa foto. Jangan memakai gambar sementara sebagai foto final.

## Keputusan Kritis Sebelum Build

- Alamat usaha, jam layanan, slot penerimaan, daftar wilayah pengantaran Makassar dan sekitarnya. GoSend dipesan pengelola dan ongkir ditanggung pelanggan; penanganan perubahan tarif serta cara penagihan ongkir perlu disepakati. Jangan menganggap layanan kurir menyediakan penagihan harga produk/COD atau API publik tanpa verifikasi. Zona waktu WITA sudah disetujui.
- Detail penahanan stok/kuota, kelayakan dan nominal pengembalian dana. Alur pembatalan oleh pelanggan melalui persetujuan pengelola dan pengembalian manual sudah disetujui. Batas pembayaran preorder 18.00 dan pemeriksaan pengelola sebelum pembatalan sudah disetujui. Jangan menganggap status belum diverifikasi sebagai bukti tidak ada pembayaran.
- Setup User dan tiga level sudah disetujui; finalkan autentikasi backend, pengamanan credential, sesi, reset akses dan penyiapan admin pertama. Jangan menyimpan password polos atau mengandalkan validasi browser. Penonaktifan akun/perubahan izin harus berlaku di backend; cegah hilangnya seluruh akses admin aktif. Akses status pesanan pelanggan harus privat.
- Hosting frontend: GitHub Pages baru rekomendasi, perlu pemeriksaan ketentuan penggunaan untuk transaksi komersial. GitHub tetap penyimpanan source code; hosting alternatif dapat diperlukan.
- Verifikasi komunikasi lintas domain frontend dengan Apps Script; penyimpanan rahasia hanya di backend.
- Backup, audit transaksi, laporan PDF/Excel dan pengujian harus dimasukkan blueprint.

Palet disetujui tidak berarti persetujuan seluruh layout atau pembangunan aplikasi.
Coding aplikasi utama menunggu blueprint dan perintah persetujuan final pengguna.
