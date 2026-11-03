# Healthy Vibes: Acuan Desain dan Keputusan

## Persetujuan Build Terbaru

- Pengguna memberikan "SETUJU - GENERATE FINAL BUILD" pada 1 November 2026 setelah menerima preview terbaru. Implementasi mengikuti palet dan komposisi preview; bukan redesign.
- Struktur database Google Sheets dan folder Drive disetujui: PRODUK (foto produk), INVOICE (invoice), STRUK (foto bukti transfer), TANDATERIMA (foto penyerahan).
- Source frontend: index.html, css, js. Source backend: apps-script.
  Keputusan 2 November 2026 mengikuti pola Berat Idealku: frontend di GitHub
  Pages, backend API Apps Script, database Sheets/Drive. Revisi frontend cukup
  Commit dan Push; revisi backend memperbarui deployment Google terpisah.
  Pemasangan Google belum dilakukan; status tes ada pada hasil-pengujian-build.md.
- Keterangan menunggu izin build di bagian historis berikut telah digantikan; tes teknis, dukungan GoSend dan kesiapan produksi tetap harus dibuktikan.
- Kode aplikasi ditulis per baris dengan komentar singkat Bahasa Indonesia. Vendor mempertahankan lisensi aslinya.

## Disetujui

- Palet: tosca tua `#065B55`, orange `#F58B32`, cream muda `#FFFCF6`, abu-abu muda `#F2F3F4`, hitam `#171717`, putih `#FFFFFF`.
- Hijau tua tetap dipertahankan; persetujuan terakhir untuk cream muda sekaligus menyelesaikan review palet.
- Arah konsep: gabungan katalog praktis Konsep A dan gaya visual Konsep B.
- Cakupan versi pertama disetujui: dashboard, produk/stok, pesanan, Setup User, laporan PDF/Excel, pengaturan dan backup, seluruhnya online, melengkapi toko/checkout dan promo yang sudah disepakati. Ini persetujuan cakupan saja, bukan persetujuan seluruh rincian teknis, layout, coding utama atau deployment. Mode transaksi offline tidak termasuk; integrasi tambahan yang belum disetujui tetap belum diputuskan.
- Susunan checkout tiga langkah: penerima, pembayaran, tinjau pesanan. Persetujuan ini untuk susunan checkout, bukan persetujuan build atau seluruh layout perangkat.
- Pelanggan dapat memilih diantar atau mengambil sendiri.
- Pelanggan dapat memesan tanpa wajib membuat akun, dengan nama, nomor HP dan alamat untuk pengantaran. Status pesanan tetap privat; nomor pesanan saja bukan bukti hak akses. Mekanisme akses privat perlu ditetapkan dan diverifikasi dalam rancangan keamanan.
- Pengantaran menggunakan GoSend dari Gojek; "goraid" adalah salah ketik, bukan GoRide. Pengelola toko memesan kurir melalui aplikasi penyedia dan mengonfirmasi ongkir kepada pelanggan. Tarif per wilayah bukan pilihan yang disetujui. Tidak ada integrasi API otomatis yang disetujui.
- Zona waktu usaha: WITA (UTC+8), pengaturan teknis `Asia/Makassar`. Batas pemesanan 17.00 dan pembayaran 18.00 menggunakan WITA, bukan zona waktu perangkat pelanggan.
- Admin mengatur hari dan rentang jam layanan penerimaan/pengambilan; pelanggan memilih waktu di dalam jadwal tersebut, sesuai pilihan A pengguna. Jadwal menggunakan WITA dan terpisah dari batas preorder 17.00 serta pembayaran 18.00. Nilai jadwal diisi sebelum go live; backend memvalidasi waktu yang dipilih. Waktu antar merupakan permintaan pelanggan, bukan jaminan waktu tiba GoSend.
- Pilihan waktu menggunakan interval yang diatur Admin, sesuai pilihan A pengguna. Pelanggan memilih dari daftar waktu valid, bukan mengetik jam bebas. Nilai interval menit diisi di pengaturan sebelum go live; 30 menit hanya contoh, bukan nilai yang disetujui. Backend memvalidasi interval, jam layanan dan minimal persiapan untuk pesanan langsung.
- Admin menentukan minimal waktu persiapan pesanan langsung, sesuai pilihan A pengguna. Pelanggan hanya dapat memilih waktu yang memenuhi jeda persiapan dan berada dalam jam layanan. Backend memeriksa kembali terhadap waktu server saat pesanan dibuat; waktu yang sudah tidak valid harus dipilih ulang, bukan digeser diam-diam. Jika tidak ada waktu valid hari ini, pesanan langsung tidak tersedia; jangan otomatis mengubahnya menjadi preorder. Nominal menit diisi dalam pengaturan sebelum go live, belum ditentukan pengguna.
- Cakupan layanan hanya Kota Makassar, Sulawesi Selatan, dan sekitarnya. Admin mengatur daftar wilayah yang dilayani, lalu pelanggan memilih wilayah aktif saat checkout, sesuai pilihan A pengguna. Daftar aktual diisi sebelum go live; jangan mengasumsikan seluruh Sulawesi Selatan tercakup. Backend memvalidasi wilayah aktif saat pesanan dibuat. Pelanggan tetap mengisi alamat lengkap; pilihan wilayah bukan verifikasi otomatis lokasi alamat atau jaminan tersedianya GoSend. Daftar wilayah bukan tarif ongkir; ongkir tetap mengikuti GoSend dan persetujuan pelanggan.
- Pesanan langsung dan preorder H-1; batas preorder pukul 17.00 mengikuti zona waktu usaha.
- Stok siap jual untuk pesanan langsung dipisahkan dari kuota preorder per produk dan tanggal penerimaan, sesuai pilihan A pengguna. Pesanan langsung tidak mengurangi kuota preorder; preorder tidak mengurangi stok siap jual. Jumlah ketersediaan masing-masing dikelola terpisah.
- Stok/kuota ditahan saat pesanan berhasil dibuat di backend, meskipun pembayaran belum diverifikasi, sesuai pilihan A pengguna. Menambahkan produk ke keranjang tidak menahan stok. Backend memeriksa dan menahan ketersediaan bersama pencatatan pesanan; cegah kelebihan pesanan bersamaan dan duplikasi saat retry. Stok/kuota dilepas setelah pengelola mengonfirmasi pembatalan, satu kali saja, bukan saat permintaan pembatalan masuk. Pembayaran terverifikasi tidak mengurangi ketersediaan untuk kedua kalinya. Tidak ada pembatalan otomatis yang disetujui.
- Pembayaran preorder harus masuk paling lambat pukul 18.00 pada hari pemesanan, mengikuti zona waktu usaha.
- Transfer bank / QRIS manual; produk untuk pengantaran wajib lunas sebelum dikirim. Bayar saat diambil hanya tersedia untuk pesanan langsung yang diambil sendiri; preorder wajib dibayar di muka.
- Ongkir GoSend ditanggung pelanggan setelah tarif disetujui dan dicatat terpisah dari pembayaran produk. Pengguna mengonfirmasi pelanggan membayar ongkir langsung kepada kurir saat tiba di alamat pelanggan, bukan transfer ke toko. Produk tetap lunas sebelum dikirim; jangan menambahkan penagihan harga produk oleh kurir. Dukungan pembayaran ongkir oleh penerima di layanan/akun GoSend Makassar belum diverifikasi. Panduan resmi https://www.gojek.com/blog/gosend/cod (23 Juni 2025) menjelaskan COD barang dan ongkir dengan cakupan saat publikasi Bandung/pengguna terpilih; bukan bukti alur ongkir saja tersedia di Makassar. Verifikasi melalui aplikasi/dukungan GoSend sebelum menerapkan; jangan otomatis mengganti metode pilihan pengguna. Untuk preorder, pembayaran produk tetap maksimal 18.00 WITA pada hari pemesanan. Penanganan perubahan tarif belum final. Pesanan tiba bukan bukti ongkir lunas; pembayaran ke kurir bukan penerimaan kas toko.
- Pembayaran manual diverifikasi pengelola berdasarkan transaksi masuk, bukan hanya foto bukti transfer.
- Setelah pukul 18.00, pengelola memeriksa transaksi masuk untuk preorder belum terverifikasi, lalu mengonfirmasi pembayaran atau membatalkan pesanan. Tidak ada pembatalan otomatis hanya karena pembayaran belum diverifikasi. Kuota dilepas setelah pembatalan; riwayat pesanan dan keputusan tetap tersimpan.
- Pelanggan mengajukan permintaan pembatalan; pengelola menyetujui atau menolak sesuai tahap persiapan. Permintaan tidak otomatis membatalkan pesanan. Pengembalian dana, bila ada, dilakukan manual dan dicatat terpisah; status batal bukan bukti dana sudah dikembalikan. Keputusan dan alasan pengelola disimpan dalam riwayat.
- Untuk pembatalan atas permintaan pelanggan yang disetujui sebelum pesanan mulai disiapkan, kembalikan 90% dari pembayaran produk yang diterima, sesuai ketentuan pengguna. Dasar hitung adalah pembayaran produk setelah diskon/voucher, tidak termasuk ongkir; 10% tidak dikembalikan. Contoh pembayaran Rp100.000 menghasilkan pengembalian Rp90.000. Proses manual dicatat dengan nominal, status dan bukti; status batal bukan bukti pengembalian selesai. Ketentuan ini harus ditampilkan sebelum pelanggan memesan. Tenggat maksimal 1 x 24 jam sejak pembatalan dikonfirmasi; pembulatan rupiah belum ditetapkan. Jangan menerapkan potongan 10% pada semua jenis pembatalan secara otomatis.
- Setelah persiapan dimulai, pembatalan atas permintaan pelanggan tidak diperbolehkan, sesuai ketentuan terbaru pengguna, menggantikan pilihan sebelumnya yang sempat membolehkan pembatalan pada tahap ini. Backend memeriksa tahap pesanan saat permintaan dan keputusan pembatalan; riwayat waktu mulai persiapan disimpan. Permintaan pembatalan tidak boleh otomatis melepas stok atau menghasilkan refund. Kebijakan ditampilkan sebelum pemesanan. Larangan ini tidak menetapkan kebijakan pembatalan oleh toko atau penanganan produk bermasalah.
- Jika toko membatalkan karena pesanan tidak dapat dipenuhi, pembayaran produk yang diterima dikembalikan 100% tanpa potongan, sesuai pilihan A pengguna. Dasar hitung adalah pembayaran produk setelah diskon/voucher; contoh Rp100.000 dikembalikan Rp100.000. Proses pengembalian tetap manual; alasan/pihak pembatal, nominal, status dan bukti dicatat. Larangan pembatalan pelanggan setelah persiapan tidak menghilangkan kewajiban pengembalian ini. Ongkir ke kurir bukan pembayaran produk atau kas toko dan penanganannya tetap terpisah. Tenggat maksimal 1 x 24 jam sejak pembatalan dikonfirmasi.
- Tenggat pengembalian 90% maupun 100% disetujui maksimal 1 x 24 jam sejak pembatalan dikonfirmasi, bukan sejak permintaan pelanggan atau dalam hari kerja. Simpan waktu konfirmasi, jatuh tempo dan penyelesaian aktual. Tenggat tidak berarti transfer otomatis atau status lunas otomatis; proses tetap manual dan keterlambatan harus terlihat oleh pengelola.
- Platform terbaru: HTML, CSS, JavaScript, Bootstrap; frontend statis GitHub
  Pages; backend API Google Apps Script; database Google Sheets dan Drive.
- Alur terbaru: tombol di www.beratidealku.com menuju
  https://amihaji.github.io/healthyvibes/, lalu frontend menghubungi API Google.
  Ketentuan GitHub Pages yang membatasi toko online sudah dijelaskan kepada
  pengguna; konfigurasi teknis bukan persetujuan penyedia hosting.
  Cloudflare tidak dipilih. Website utama dan deployment belum diubah.
- Akun pengelola dibuat dan dikelola admin melalui menu Setup User, sesuai level pengguna. Login Google bukan pilihan yang disetujui. Level Admin, Operator dan Viewer disetujui.
- Admin: seluruh fitur, Setup User, pengaturan toko dan laporan. Operator: produk, stok, pesanan, verifikasi pembayaran serta pembatalan sesuai izin. Viewer: melihat dashboard dan laporan, tanpa mengubah data. Semua izin divalidasi backend; Operator dan Viewer tidak boleh mengelola akun atau meningkatkan level sendiri.
- Pengaturan diskon dan voucher hanya untuk Admin, sesuai pilihan A pengguna. Operator tidak boleh membuat, mengubah, mengaktifkan atau menonaktifkan promo, termasuk melalui payload perubahan produk. Hak ini wajib diperiksa backend.
- Voucher tanpa kuota penggunaan, hanya dibatasi masa berlaku serta syarat promo, sesuai pilihan B pengguna. Tidak ada batas jumlah penggunaan total atau per pelanggan yang disepakati. Keputusan ini tidak menghapus batas stok/kuota produksi produk.
- Susunan tampilan Login dan Setup User disetujui. Persetujuan visual bukan bukti autentikasi atau pengelolaan akun sudah berfungsi.
- Setup Produk wajib mencakup upload foto produk, kategori, nama produk dan harga produk. Tambahan ini adalah kebutuhan yang disetujui, bukan izin build atau persetujuan paket fitur lain yang masih ditawarkan.
- Susunan tampilan Setup Produk & Promo disetujui: upload foto, kategori, nama, harga, bagian diskon produk dan Setup Voucher. Persetujuan ini hanya visual, bukan izin coding aplikasi utama atau penetapan seluruh aturan promo.
- Tambahan diskon/voucher diminta pengguna. Voucher tidak boleh digabung dengan diskon pada produk yang sama. Untuk keranjang campuran, voucher hanya memotong produk non-diskon; produk diskon tetap memakai harga promo tanpa potongan voucher tambahan. Minimum belanja voucher dihitung dari seluruh subtotal produk, termasuk produk diskon, tanpa ongkir, sesuai pilihan B pengguna. Subtotal ini menggunakan harga promo produk yang berlaku sebelum potongan voucher, bukan harga asli yang sudah dicoret. Preview diusulkan berupa diskon produk (persen/nominal, periode) dan voucher pesanan (kode, nilai, minimum belanja, maksimum potongan, periode, jenis pesanan), tanpa field kuota. Pengaturan promo hanya untuk Admin. Rekomendasi voucher tidak memotong ongkir GoSend. Validasi syarat, masa berlaku dan hitungan promo harus di backend; transaksi menyimpan nilai potongan saat dipesan.
- Rancangan upload: pengelola memilih foto dari HP/komputer melalui aplikasi; backend memvalidasi izin, jenis dan ukuran file. Foto disimpan di Google Drive, metadata produk dan referensi file di Google Sheets. Optimalkan ukuran foto untuk katalog; jangan membuka folder database, data pelanggan atau file privat lainnya demi menampilkan foto produk. Cara penyajian foto katalog perlu diverifikasi sebelum deployment.

## Menunggu Review

- Pengguna menyatakan belum pernah memakai alur ongkir dibayar penerima langsung ke kurir di Makassar; perlu dicek. Pilihan alur tetap dicatat, tetapi belum menjadi kemampuan layanan yang terverifikasi. Sebelum pengantaran dibuka, pastikan dukungan pada akun/jenis layanan yang dipakai melalui aplikasi atau dukungan GoSend. Jika tidak didukung, ajukan alternatif untuk persetujuan pengguna; jangan otomatis menggantinya. Penyelesaian blueprint bagian lain dapat dilanjutkan.
- Layout desktop, tablet, HP dan landscape: preview tersedia, belum mendapat persetujuan final.
- Checkout: susunan disetujui; preview masih memakai data contoh dan kontrol transaksi tidak aktif. Alur permintaan pembatalan serta pengembalian dana manual disetujui; rincian kelayakan dan nominal pengembalian perlu ditampilkan dalam kebijakan toko sebelum digunakan pelanggan.
- Tipografi: usulan Georgia untuk judul editorial, Arial untuk teks operasional.
- Komponen: kartu membulat, kontrol utama minimal 44 px; keranjang bawah pada HP dan tablet; ringkasan kanan pada desktop.
- Panel pengelola: tabel desktop/tablet dan kartu pesanan HP.
- Preview Login dan Setup User: susunan disetujui; tetap mockup, bukan autentikasi atau pengelolaan akun aktif.
- Setup Produk & Promo: susunan visual disetujui; aturan promo yang belum ditetapkan tetap perlu diselesaikan. Semua angka promo adalah contoh, bukan data nyata; upload dan penyimpanan belum aktif.
- Logo: akan ditambahkan; file belum tersedia. Pertahankan rasio asli dengan object-fit contain, bukan crop.
- Foto produk: belum disetujui; preview saat ini tanpa foto. Jangan memakai gambar sementara sebagai foto final.

## Keputusan Kritis Sebelum Build

- Alamat usaha, nilai jadwal layanan, nominal interval menit, nominal menit persiapan pesanan langsung dan daftar wilayah pengantaran Makassar dan sekitarnya. Pengaturan hari/rentang layanan, interval pilihan waktu serta minimal persiapan oleh Admin sudah disetujui. GoSend dipesan pengelola dan ongkir ditanggung pelanggan; penanganan perubahan tarif serta cara penagihan ongkir perlu disepakati. Jangan menganggap layanan kurir menyediakan penagihan harga produk/COD atau API publik tanpa verifikasi. Zona waktu WITA sudah disetujui.
- Detail penahanan stok/kuota, kelayakan dan nominal pengembalian dana. Alur pembatalan oleh pelanggan melalui persetujuan pengelola dan pengembalian manual sudah disetujui. Batas pembayaran preorder 18.00 dan pemeriksaan pengelola sebelum pembatalan sudah disetujui. Jangan menganggap status belum diverifikasi sebagai bukti tidak ada pembayaran.
- Setup User dan tiga level sudah disetujui; finalkan autentikasi backend, pengamanan credential, sesi, reset akses dan penyiapan admin pertama. Jangan menyimpan password polos atau mengandalkan validasi browser. Penonaktifan akun/perubahan izin harus berlaku di backend; cegah hilangnya seluruh akses admin aktif. Akses status pesanan pelanggan harus privat.
- Hosting frontend pilihan terbaru: GitHub Pages. Pastikan batas penggunaan
  hosting dipertimbangkan sebelum transaksi nyata dan uji API lintas origin.
- Verifikasi transport POST/postMessage dengan Apps Script dan autentikasi/sesi;
  password tidak di URL, respons tidak dianggap sukses tanpa konfirmasi server.
  Rahasia tetap di backend, tanpa penghubung Cloudflare.
- Backup, audit transaksi, laporan PDF/Excel dan pengujian harus dimasukkan blueprint.

Palet disetujui tidak berarti persetujuan seluruh layout atau pembangunan aplikasi.
Coding aplikasi utama menunggu blueprint dan perintah persetujuan final pengguna.

## Paket Review Terpadu

- Keputusan akses terbaru: www.beratidealku.com -> frontend GitHub Pages ->
  API Apps Script -> Sheets/Drive. Akun tetap dibuat Admin, bukan login Google.
  Keamanan dan runtime lintas origin tetap wajib diverifikasi.
- Arah paket disetujui untuk finalisasi desain dan verifikasi teknis, bukan izin coding atau seluruh detail rekomendasi. Hasil dokumentasi dicatat dalam hasil-verifikasi-teknis.md; bukti Cloudflare hanya referensi opsi yang tidak dipilih. URL web app nyata, perubahan website dan deployment belum dibuat atau diizinkan.
- Pengguna menyetujui penyusunan rekomendasi teknis dan preview terbaru sekaligus. Ini bukan persetujuan isi rekomendasi, seluruh layout atau izin coding utama.
- Checklist-review.md merangkum keputusan; rekomendasi-teknis.md memuat usulan keamanan, hosting, laporan, backup dan penerimaan. Rekomendasi baru tetap belum diputuskan.
- Preview diperbarui untuk ongkir terpisah, jadwal WITA dan refund; stok, pengaturan, laporan serta status pesanan tersedia sebagai mockup. Perubahan masih perlu review visual.
- Server lokal mengirim preview terbaru dengan HTTP 200. Browser belum berhasil mengambil snapshot; rendering, interaksi dan responsivitas belum dinyatakan PASS. Aplikasi utama, login, upload, ekspor dan deployment belum diuji karena belum dibangun.
