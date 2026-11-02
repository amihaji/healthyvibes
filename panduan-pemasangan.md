# Healthy Vibes: Pemasangan

Status: source build tersedia. Google Sheets, folder Drive dan deployment belum dibuat pada akun Anda.
Persetujuan pembangunan diterima pada 1 November 2026. Tidak ada transaksi nyata atau perubahan website utama.

## Berkas Aplikasi

Frontend berada di `index.html`, `css`, dan `js`; hanya backend berikut
yang dipasang ke project Google dalam folder `apps-script`:

- `Schema.gs`: struktur database dan pemasang folder Drive.
- `Store.gs`: akses Sheets, validasi input, penguncian dan audit.
- `Auth.gs`: login bcrypt, sesi, reset dan pembatasan akses.
- `VendorBcrypt.gs`: bcryptjs 2.4.3 pihak ketiga; lisensi dipertahankan.
- `Rules.gs`: WITA, jadwal, promo, stok dan refund.
- `Orders.gs`: pesanan, reservasi, pembayaran, pembatalan dan pemenuhan.
- `Admin.gs`: master, pengaturan, laporan dan pengiriman.
- `Files.gs`: foto, invoice PDF, bukti transfer, tanda terima dan backup.
- `Recovery.gs`: pemulihan ke staging dan backup harian opsional.
- `Api.gs`: API POST, respons lintas situs, dan pemeriksaan izin.
- `Tests.gs`: pengujian aturan tanpa transaksi produksi.
- `appsscript.json`: manifest izin Drive/Sheets dan zona waktu Makassar.

`Index`, `Styles`, dan `Client` tidak perlu dibuat di editor Google lagi.
Jika salinan lama sudah dimasukkan ke Google, hapus tiga file HTML lama itu
setelah memastikan source frontend tersedia di komputer.
Tampilan kini diperbarui melalui GitHub Desktop, bukan template Google.

Komentar kode aplikasi ditulis dalam Bahasa Indonesia dan kode dipisahkan per baris.
Library bcrypt bawaan vendor mempertahankan komentar/lisensi aslinya.

## 1. Buat Project

1. Masuk ke https://script.google.com dengan akun Google pemilik usaha.
2. Buka project **Healthy Vibes** yang sudah dibuat; Script ID tercantum pada `.clasp.json`.
3. Tambahkan seluruh berkas `.gs` sesuai nama source di atas, tanpa membuat
   file HTML frontend.
4. Di **Setelan project**, aktifkan tampilan manifest `appsscript.json`,
   lalu gunakan isi manifest dari source.

Jangan membagikan password, token atau kunci keamanan melalui chat/GitHub.
Source boleh disimpan di GitHub, tetapi Script Properties dan file credential tidak boleh.

## 2. Pasang Database dan Folder

1. Dari editor, pilih fungsi `installHealthyVibes_`, lalu **Run / Jalankan**.
2. Berikan izin Sheets/Drive hanya setelah memastikan project adalah milik Anda dan source sesuai.
3. Hasil fungsi berisi URL database dan folder utama. Lihat nilai hasil melalui debugger atau tambahkan breakpoint setelah pemanggilan; ID juga tersedia pada Script Properties.

Pemasang membuat:

```text
HEALTHY VIBES/
  Healthy Vibes - Database
  PRODUK/
  INVOICE/
  STRUK/
  TANDATERIMA/
  BACKUP/
```

`STRUK` khusus foto bukti transfer, bukan struk pembayaran yang dianggap terverifikasi.
`TANDATERIMA` khusus foto penyerahan pesanan.
Invoice dibuat di `INVOICE` saat pertama kali diunduh. Invoice bukan bukti lunas.
Folder/Sheet tidak dibuat publik. Jangan mengaktifkan "Anyone with the link".
Pemasang memakai ID tersimpan, dapat diulang tanpa menghapus data; kolom yang berbeda dihentikan untuk pemeriksaan.

## 3. Siapkan Keamanan dan Admin

1. Jalankan `buat-kunci-keamanan.ps1` di Windows. Script menaruh kunci acak di clipboard tanpa mencetaknya.
2. Di **Project Settings > Script Properties**, tambahkan `SECURITY_KEY`, lalu tempel nilai dari clipboard.
3. Jalankan `verifyAuthRuntime_`. Jika gagal/terlalu lambat, login tetap ditutup; jangan mengubah penanda lulus secara manual.
4. Tambahkan Script Properties `INITIAL_ADMIN_USERNAME` dan `INITIAL_ADMIN_PASSWORD` (minimal 12 karakter, maksimal 72 byte).
5. Jalankan `createFirstAdmin_`. Password sementara otomatis dihapus dari Script Properties setelah akun dibuat.
6. Jalankan `runRuleTests_`; seluruh hasil harus `PASS`.

Jangan mengganti kunci keamanan ketika sistem sedang digunakan tanpa prosedur migrasi.
Kunci diperlukan untuk generator token/salt berkunci; simpan cadangan terpisah di pengelola password pemilik.
Uji bcrypt lokal bukan bukti performa runtime Google. Fungsi verifikasi Google wajib dijalankan.

## 4. Deployment API dan Frontend

1. **Deploy > New deployment > Web app**.
2. **Execute as / Jalankan sebagai:** pemilik project.
3. **Who has access / Siapa yang dapat mengakses:** **Anyone**, bila diizinkan akun Anda, agar guest checkout bekerja.
4. Masukkan URL berakhiran `/exec` ke `apiUrl` pada `js/config.js`.
5. Buka URL Google langsung: hasilnya identitas API, bukan katalog pelanggan.
6. Di GitHub **Settings > Pages**, pilih **Source: GitHub Actions**.
7. Commit dan Push frontend ke `main`; tunggu workflow Pages berhasil.
8. Buka https://amihaji.github.io/healthyvibes/ untuk katalog dan pengelola.

Tombol di `beratidealku.com` nantinya mengarah ke URL frontend, bukan URL API.
Ikuti `panduan-update-otomatis.md`; ketentuan GitHub Pages untuk toko online
tetap perlu dipertimbangkan sebelum memakai layanan untuk transaksi nyata.

Origin default yang diizinkan: `https://amihaji.github.io` dan
`https://www.beratidealku.com`. Bila perlu, isi Script Property
`FRONTEND_ORIGINS` berupa daftar origin dipisahkan koma, tanpa path atau slash
di akhir. Contoh: `https://amihaji.github.io`.
Untuk uji lokal saja, tambahkan `http://localhost:8080` secara eksplisit,
kemudian hapus setelah pengujian. Jangan memakai wildcard `*`.

Sesi/token tetap diperiksa backend; origin bukan bukti hak akses.
Respons HTML API sengaja bisa dimuat dalam iframe, tetapi balasan hanya
ditujukan ke origin yang diizinkan dengan kanal request yang sesuai.

Perubahan frontend: cukup Commit dan Push, tidak perlu memperbarui Google.
Perubahan backend: masukkan `.gs` terbaru ke Google, lalu perbarui versi
deployment lama melalui **Deploy > Manage deployments**.
Menyimpan editor Google saja tidak memperbarui versi API `/exec`.

Pilihan akses publik hanya untuk aplikasi. Sheets/Drive tetap privat dan server memeriksa semua operasi staf.
Jika akun organisasi melarang akses anonim, jangan mengubah kebijakan organisasi; evaluasi deployment dengan pemilik akun.
Website `beratidealku.com` belum diubah dalam build ini.

## 5. Lengkapi Toko

Login Admin, ganti password sementara, lalu:

1. Isi Kategori, Setup Produk dan upload foto aktual ke `PRODUK`.
2. Isi stok siap jual dan kuota preorder per tanggal.
3. Atur Jam Layanan, Wilayah, interval menit serta minimal persiapan.
4. Isi alamat, kontak dan instruksi bank/QRIS di Pengaturan.
5. Pilih aturan pembulatan rupiah diskon/refund secara eksplisit.
6. Buka pemesanan setelah uji sandbox berhasil.

Default toko tertutup dan pengantaran tidak aktif. Tidak ada harga, produk, jadwal usaha atau KPI contoh di database.
Satu voucher per pesanan diterapkan pada build ini; batas ini dapat dievaluasi sebelum go live.
Pengantaran baru dibuka setelah dukungan ongkir langsung ke kurir di Makassar benar-benar diverifikasi.
Metode alternatif ongkir tidak dipilih otomatis.

## Operasional

- Keranjang tidak menahan stok; backend menahan saat pesanan tersimpan.
- Kapasitas adalah total stok/kuota kumpulan, termasuk jumlah yang ditahan atau sudah terpakai. Untuk menambah ketersediaan, naikkan kapasitas total; jangan menggantinya dengan angka sisa.
- Permintaan batal tidak melepas stok. Konfirmasi batal sebelum persiapan melepas sekali.
- Batal toko sesudah persiapan tidak otomatis mengembalikan produk ke stok.
- Bayar saat ambil hanya langsung/ambil; preorder dan produk antar harus lunas di muka.
- Verifikasi pembayaran membutuhkan jumlah tepat dan referensi transaksi masuk unik.
- Preorder belum terverifikasi setelah 18.00 diperiksa manual. Tidak ada pembatalan otomatis.
- Foto struk tidak mengubah status pembayaran.
- Unggah tanda terima sebelum menyelesaikan pesanan. Ongkir sudah dibayar dicatat terpisah.
- Pelanggan wajib menyimpan kunci akses privat; nomor pesanan/nomor HP saja tidak membuka data.
- Laporan berdasarkan tanggal pesanan WITA; pembayaran/refund terkait sampai waktu laporan ditarik. Sisa kas bukan laba.
- Ekspor `.xlsx` asli dan PDF memakai data laporan yang sama. Pustaka ekspor dimuat dari CDN saat diperlukan.

## Backup dan Pemulihan

Admin membuat backup melalui menu Backup; periksa `BackupLog` harus `COMPLETED`.
Folder backup memiliki `manifest.json` untuk relasi ID berkas.
Untuk memulihkan, isi ID folder backup dan ketik `RESTORE KE STAGING`.
Pemulihan membuat salinan baru, memperbarui ID berkas, mencabut sesi staging dan menutup pemesanan staging.
Tidak menimpa produksi. Pengalihan produksi memerlukan pemeriksaan serta persetujuan terpisah.

Backup harian opsional: setelah uji berhasil, pemilik menjalankan `enableDailyBackup_` dari editor.
Pengaturan retensi adalah target operasional; penghapusan backup dilakukan manual, bukan otomatis destruktif.
Backup penuh memakai kuota/runtime Google; data besar memerlukan penjadwalan bertahap sebelum go live.
Rahasia keamanan tidak disalin ke backup.

## Sebelum Go Live

Lihat `hasil-pengujian-build.md`. Uji Google, ekspor, upload aktual, semua role, pemulihan dan seluruh viewport wajib selesai.
Logo aktual dan foto produk belum diberikan. Admin dapat mengunggah logo/QRIS melalui Pengaturan; aset toko disimpan di PRODUK. Sebelum logo diunggah, identitas memakai nama merek.
Build tidak dinyatakan siap produksi sampai pengujian integrasi dan UAT selesai.
