# Healthy Vibes: Pemasangan

Panduan instalasi awal untuk frontend GitHub Pages dan backend Google Apps Script.
URL API sudah tercantum di `js/config.js`. Database, akun Admin, dan deployment
belum diverifikasi melalui akun Google dalam penyusunan panduan ini.
Jangan mengulang pembuatan project atau database jika sudah dipasang sebelumnya.

## Urutan Instalasi

1. Masukkan 11 file script dan manifest ke project Google yang sama.
2. Jalankan installer untuk membuat database dan folder secara otomatis.
3. Siapkan kunci keamanan, uji login, dan buat Admin pertama.
4. Pasang atau perbarui deployment API Google.
5. Periksa URL API frontend, lalu publikasikan lewat GitHub Desktop.
6. Login pengelola, isi konfigurasi toko, dan uji sebelum menerima pesanan nyata.

## 1. Buat File Backend di Google

Gunakan akun Google pemilik usaha dan buka project **Healthy Vibes** yang sudah
dibuat di https://script.google.com. Ini project mandiri; tidak perlu membuat
Google Sheets terlebih dahulu atau membuka Apps Script dari sebuah sheet.

Untuk setiap baris tabel berikut:

1. Di editor Google, klik **+** di sebelah **Files / Berkas**.
2. Pilih **Script**, bukan HTML.
3. Masukkan nama pada kolom **Nama saat dibuat**, tanpa mengetik `.gs`.
4. Buka source lokal yang sesuai di folder `apps-script`.
5. Ganti isi file Google dengan seluruh isi source lokal, lalu simpan.

| Nama saat dibuat | Source lokal | Fungsi |
| --- | --- | --- |
| Schema | `apps-script/Schema.gs` | Struktur sheet, kolom, nilai awal, installer database/folder. |
| Store | `apps-script/Store.gs` | Akses Sheets, validasi, penguncian transaksi dan audit. |
| Auth | `apps-script/Auth.gs` | Login, sesi, level akses dan Admin pertama. |
| VendorBcrypt | `apps-script/VendorBcrypt.gs` | Library hash password; salin lengkap beserta lisensi. |
| Rules | `apps-script/Rules.gs` | Jadwal WITA, promo, stok, preorder dan refund. |
| Orders | `apps-script/Orders.gs` | Pembuatan pesanan, pembayaran, pembatalan dan pemenuhan. |
| Admin | `apps-script/Admin.gs` | Produk/master, pengaturan, laporan dan pengiriman. |
| Files | `apps-script/Files.gs` | Upload foto, bukti transfer, invoice dan backup. |
| Recovery | `apps-script/Recovery.gs` | Pemulihan staging dan backup harian opsional. |
| Api | `apps-script/Api.gs` | Endpoint GET/POST dan dispatcher operasi browser. |
| Tests | `apps-script/Tests.gs` | Pengujian aturan tanpa membuat transaksi produksi. |

Semua file di atas dibuat dalam **satu project**, bukan 11 project terpisah.
Urutan file di panel editor tidak perlu disamakan dengan tabel.
Jangan menjalankan `doPost` langsung dari tombol Run karena fungsi itu memerlukan
request browser.

Untuk manifest:

1. Buka **Setelan project** melalui ikon roda gigi.
2. Aktifkan **Tampilkan file manifes appsscript.json di editor**.
3. Kembali ke editor dan buka `appsscript.json`.
4. Ganti isinya dengan source `apps-script/appsscript.json`, lalu simpan.

Manifest bukan file Script baru. Manifest memakai runtime V8, zona waktu
`Asia/Makassar`, izin Sheets/Drive, dan pembacaan email akun untuk membatasi
fungsi setup. Setelah manifest diperbarui, Google dapat meminta izin ulang.

`Code.gs` bawaan boleh dihapus jika hanya berisi `myFunction` kosong.
Jika sudah berisi kode Anda, periksa dahulu; jangan menghapus kode lain.
`Index`, `Styles`, dan `Client` **tidak dibuat di Google lagi**.
Jika tiga HTML lama sudah terpasang, hapus hanya salinan frontend lama itu
setelah memastikan file frontend lokal lengkap.

Jangan membagikan password, token atau kunci keamanan melalui chat/GitHub.
Source boleh disimpan di GitHub, tetapi Script Properties dan file credential tidak boleh.

## 2. Pasang Database dan Folder

**Tidak perlu membuat file Google Sheets, tab, atau header secara manual.**

1. Pastikan semua backend dan manifest pada tahap 1 sudah tersimpan.
2. Buka `Schema.gs`, pilih fungsi **`installHealthyVibes`** pada daftar fungsi
   di toolbar. Gunakan nama tanpa `_` di akhir.
3. Klik **Run / Jalankan**.
4. Pada permintaan otorisasi, periksa project serta izin Sheets/Drive,
   lalu setujui hanya jika sesuai source milik Anda.
5. Tunggu eksekusi selesai tanpa error.
6. Buka Google Drive dan cari folder **HEALTHY VIBES**.
7. Buka spreadsheet **Healthy Vibes - Database** di dalam folder tersebut.

Jika nama fungsi belum muncul atau tombol Run masih abu-abu:

1. Pastikan `Schema.gs`, `Store.gs`, dan manifest di Google berisi source terbaru.
2. Simpan semua file, lalu muat ulang editor Google.
3. Pilih `installHealthyVibes` dari dropdown fungsi sebelum menekan Run.
4. Periksa error sintaks pada seluruh file project; satu file yang tidak lengkap
   dapat menghalangi editor mengenali fungsi.

`installHealthyVibes_` tetap ada sebagai implementasi internal.
Fungsi tanpa `_` memeriksa identitas akun sebelum menjalankan installer.
Gunakan akun pemilik project di editor, bukan membuka fungsi setup dari website.
Execution log menampilkan URL database dan folder setelah instalasi berhasil.

Installer otomatis membuat satu spreadsheet dengan **20 tab aplikasi**
beserta header masing-masing. Ringkasan relasi ada di `struktur-database.md`;
daftar kolom lengkap ada di `apps-script/Schema.gs`.

| Tab sheet | Kegunaan | Pengisian awal |
| --- | --- | --- |
| Settings | Identitas toko, jadwal dasar, pembulatan dan batas upload/sesi. | Nilai awal otomatis; lengkapi melalui Pengaturan aplikasi. |
| Categories | Kategori makanan/minuman. | Isi melalui menu Kategori. |
| Products | Nama produk, kategori, harga, deskripsi dan referensi foto. | Isi melalui Setup Produk. |
| Discounts | Diskon produk dan masa berlaku. | Opsional, diatur Admin. |
| Vouchers | Kode voucher dan syarat pemakaian. | Opsional, diatur Admin. |
| ReadyStock | Kapasitas total stok siap jual per produk. | Isi melalui menu stok. |
| PreorderCapacity | Kuota preorder per produk dan tanggal. | Isi melalui menu kuota preorder. |
| ServiceHours | Hari serta jam buka/tutup layanan WITA. | Isi melalui Jam Layanan. |
| ServiceAreas | Daftar wilayah pengantaran aktif. | Isi melalui Wilayah. |
| Users | Akun pengelola dan hash password. | Admin pertama dibuat lewat fungsi khusus tahap 3. |
| Sessions | Hash sesi login dan kedaluwarsa. | Otomatis saat login. |
| Orders | Pesanan pelanggan. | Otomatis saat pesanan berhasil dibuat. |
| OrderItems | Rincian produk dan snapshot harga pesanan. | Otomatis bersama pesanan. |
| StockLedger | Jejak reservasi/pemakaian kapasitas. | Otomatis dari transaksi. |
| Payments | Pembayaran produk yang diverifikasi pengelola. | Otomatis dari tindakan verifikasi. |
| Refunds | Pengembalian yang benar-benar telah diselesaikan. | Otomatis dari tindakan penyelesaian refund. |
| Shipping | Tarif/kurir dan catatan pembayaran ongkir. | Dicatat melalui aplikasi. |
| Files | Metadata file di Drive, bukan gambar dalam sel. | Otomatis dari upload/operasi berkas. |
| AuditLog | Riwayat tindakan aplikasi. | Otomatis. |
| BackupLog | Status dan lokasi backup. | Otomatis saat backup. |

Google mungkin menyisakan tab bawaan kosong seperti `Sheet1`.
Tab itu bukan bagian dari 20 tab aplikasi; jangan gunakan untuk transaksi.
Jangan menghapus tab yang sudah berisi data.

Struktur folder otomatis:

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

**Pemeriksaan tahap ini:** pada **Setelan project > Script Properties**,
installer sudah mengisi `DATABASE_ID`, `ROOT_FOLDER_ID`, `FOLDER_PRODUK`,
`FOLDER_INVOICE`, `FOLDER_STRUK`, `FOLDER_TANDATERIMA`, dan `FOLDER_BACKUP`.
Tidak perlu menyalin ID spreadsheet ke frontend atau membuat properti itu manual.
Jangan menukar ID database dengan URL API.

## 3. Siapkan Keamanan dan Admin

Langkah ini untuk instalasi pertama, ketika tab `Users` belum memiliki akun.
Jika Admin sudah ada, jangan membuat ulang Admin pertama.

1. Buat kunci acak memakai `buat-kunci-keamanan.ps1` di Windows, sesuai
   kebijakan PowerShell komputer. Kunci masuk clipboard, tidak dicetak.
2. Di **Setelan project > Script Properties**, tambahkan `SECURITY_KEY`,
   tempel dari clipboard dan simpan.
3. Dari `Auth.gs`, pilih `verifyAuthRuntime`, lalu jalankan. Jika berhasil,
   Script Properties memiliki `AUTH_RUNTIME_VERIFIED` bernilai `true`.
   Jangan membuat atau mengubah penanda lulus secara manual.
4. Tambahkan dua properti sementara pada tabel berikut dan simpan.
5. Pilih `createFirstAdmin` dari `Auth.gs`, lalu jalankan.
6. Periksa tab `Users`: akun Anda memiliki role `Admin`, password berupa hash,
   dan kewajiban mengganti password saat login pertama.
   Jangan mengedit hash password dari Sheets.
7. Dari `Tests.gs`, pilih `runRuleTests`, lalu jalankan.
   Periksa Execution log: setiap aturan harus berstatus `PASS`.
   Jika ada yang gagal, fungsi berhenti dengan error; jangan lanjut ke produksi.

| Properti | Nilai | Penanganan |
| --- | --- | --- |
| SECURITY_KEY | Kunci hex 64 karakter dari 32 byte acak. | Rahasia permanen; jangan masuk frontend/GitHub. |
| INITIAL_ADMIN_USERNAME | Username Admin pilihan Anda. | Sementara, dihapus fungsi setelah akun dibuat. |
| INITIAL_ADMIN_PASSWORD | Password kuat minimal 12 karakter, maksimal 72 byte. | Sementara, dihapus fungsi setelah akun dibuat. |
| FRONTEND_ORIGINS | `https://amihaji.github.io` | Opsional untuk membatasi tujuan respons; bukan password. |

Jika file PowerShell tidak dapat dijalankan karena kebijakan komputer,
perintah berikut dapat dimasukkan langsung di PowerShell untuk membuat kunci
yang sama, tanpa mengubah kebijakan eksekusi. **Tidak perlu menjalankan keduanya.**

```powershell
# Buat 32 byte acak dan salin hex ke clipboard, tanpa menampilkan rahasia.
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $bytes = New-Object byte[] 32
    $rng.GetBytes($bytes)
    Set-Clipboard -Value ([BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant())
}
finally {
    $rng.Dispose()
}
```

Setelah `SECURITY_KEY` tersimpan, bersihkan clipboard dengan
`Set-Clipboard -Value ""`. Simpan cadangan kunci di pengelola password pemilik,
bukan file repository.

Jangan mengganti kunci keamanan ketika sistem sedang digunakan tanpa prosedur migrasi.
Kunci diperlukan untuk generator token/salt berkunci; simpan cadangan terpisah di pengelola password pemilik.
Uji bcrypt lokal bukan bukti performa runtime Google. Fungsi verifikasi Google wajib dijalankan.

## 4. Pasang atau Perbarui API Google

Jika belum ada deployment:

1. Pilih **Deploy > New deployment**.
2. Pilih jenis **Web app**.
3. **Execute as / Jalankan sebagai:** pemilik project.
4. **Who has access / Siapa yang dapat mengakses:** **Anyone**, bila diizinkan akun.
5. Selesaikan otorisasi dan simpan URL web app yang berakhiran `/exec`.

Jika deployment sudah ada, pakai **Deploy > Manage deployments > Edit >
New version**, lalu deploy. Gunakan deployment yang sama agar URL tidak berubah.
Jangan membuat URL baru untuk setiap revisi backend.

URL di `js/config.js` sudah terisi. Pastikan URL tersebut milik deployment
project Healthy Vibes yang berisi backend terbaru; keberadaan URL di file
belum membuktikan backend atau database sudah benar.

Buka URL API langsung. Backend terbaru memberikan identitas JSON:

```json
{
  "service": "Healthy Vibes API",
  "protocol": "healthyvibes-api-v1"
}
```

Hasil ini hanya memeriksa identitas API, bukan bukti installer, login, atau
seluruh transaksi berhasil. Halaman katalog tidak ditampilkan di URL Google.

Jika URL masih menampilkan frontend lama, perbarui versi deployment.
Jika meminta login Google pelanggan, periksa akses web app dan kebijakan akun.

## 5. Pasang Frontend di GitHub

Frontend sudah tersedia di komputer; tidak perlu membuat file HTML di Google.
Pertahankan nama dan huruf kecil agar path bekerja di GitHub Pages:

```text
healthyvibes/
  index.html
  css/
    styles.css
  js/
    config.js
    transport.js
    client.js
  .github/
    workflows/
      jekyll-docker.yml
  apps-script/
    ... source backend
  tests/
    frontend-api.test.cjs
```

| File frontend | Kegunaan |
| --- | --- |
| `index.html` | Struktur halaman dan pemuatan CSS/JS. |
| `css/styles.css` | Warna, komponen dan layout responsif. |
| `js/config.js` | URL API `/exec` dan timeout request. |
| `js/transport.js` | Mengirim POST dan memeriksa respons server lintas situs. |
| `js/client.js` | Katalog, keranjang, checkout, status dan panel pengelola. |

1. Buka repository **Healthy Vibes** di GitHub Desktop.
2. Pastikan `apiUrl` di `js/config.js` sesuai hasil tahap 4.
3. Buka repository di GitHub, pilih **Settings > Pages**.
4. Pilih **Source: GitHub Actions**, bukan **Deploy from a branch**.
5. Di GitHub Desktop, tinjau perubahan. Pastikan frontend, workflow,
   backend source, dan `tests` ikut tersimpan; jangan sertakan rahasia.
6. Commit ke `main`, lalu klik **Push origin**.
7. Buka tab **Actions**, pilih **Publikasikan Frontend Healthy Vibes**,
   lalu tunggu berhasil/hijau.
8. Buka https://amihaji.github.io/healthyvibes/.

Nama workflow masih `jekyll-docker.yml`, tetapi prosesnya bukan Jekyll.
Workflow menguji source, lalu hanya menerbitkan `index.html`, `css` dan `js`.
Backend serta test tetap di repository untuk source/pengujian, bukan di website.
Tidak memerlukan `CLASP_TOKEN` atau `APPS_SCRIPT_DEPLOYMENT_ID`.

Jika workflow belum berjalan sesudah Pages diatur, pilih **Actions >
Publikasikan Frontend Healthy Vibes > Run workflow**, branch `main`.
Jangan memasang CNAME `www.beratidealku.com` di repo ini karena domain tersebut
sudah digunakan website Berat Idealku.

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

## 6. Login dan Lengkapi Toko

Buka frontend, pilih **Pengelola**, login menggunakan akun tahap 3,
lalu ganti password sementara ketika diminta. Sesudah pergantian password,
login kembali dengan password baru.

Isi data melalui aplikasi, bukan mengubah tabel transaksi langsung:

1. Isi Kategori, Setup Produk dan upload foto aktual ke `PRODUK`.
2. Isi stok siap jual dan kuota preorder per tanggal.
3. Atur Jam Layanan, Wilayah, interval menit serta minimal persiapan.
4. Isi alamat, kontak dan instruksi bank/QRIS di Pengaturan.
5. Pilih aturan pembulatan rupiah diskon/refund secara eksplisit.
6. Tetap biarkan pemesanan tertutup selama konfigurasi belum lengkap.
   Untuk uji pesanan, aktifkan hanya pada lingkungan sandbox dengan data uji;
   buka toko untuk pelanggan setelah seluruh pemeriksaan lulus.

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

Periksa berurutan:

1. API GET menampilkan identitas service yang benar.
2. Katalog frontend memuat produk yang Anda isi, tanpa error koneksi.
3. Admin bisa login dan mengganti password; role lain tidak dapat mengambil
   hak Admin.
4. Satu pesanan sandbox tersimpan pada Orders, OrderItems, dan StockLedger.
5. Bukti transfer masuk STRUK tetapi belum dianggap pembayaran terverifikasi.
6. Verifikasi berdasarkan transaksi masuk nyata pada pengujian yang diizinkan;
   jangan mencatat pembayaran sintetis sebagai penerimaan toko.
7. Invoice, tanda terima, laporan dan backup sesuai data serta izin akses.
8. Tampilan HP/desktop dan retry setelah koneksi terputus bekerja sesuai aturan.

Lihat `hasil-pengujian-build.md`. Uji Google, ekspor, upload aktual, semua role, pemulihan dan seluruh viewport wajib selesai.
Logo aktual dan foto produk belum diberikan. Admin dapat mengunggah logo/QRIS melalui Pengaturan; aset toko disimpan di PRODUK. Sebelum logo diunggah, identitas memakai nama merek.
Build tidak dinyatakan siap produksi sampai pengujian integrasi dan UAT selesai.
