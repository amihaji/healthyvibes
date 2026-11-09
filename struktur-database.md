# Healthy Vibes: Struktur Database Google Sheets

Database dibuat dengan menjalankan `installHealthyVibes` dari editor Google
memakai akun pemilik. Fungsi tersebut memanggil implementasi internal
`installHealthyVibes_`.
Source skema lengkap: `apps-script/Schema.gs`. Nama kolom teknis tetap konsisten dengan API.

| Sheet | Kegunaan | Relasi / aturan penting |
| --- | --- | --- |
| Settings | Identitas dan aturan toko | `key` unik; rahasia tidak disimpan di sini. |
| Categories | Kategori produk dan ID Kategori | `id` internal tetap; `code`: HV01/HV02; `productPrefix`: awalan ID Produk seperti SN/SM/DR. |
| Products | Nama, kategori, harga, deskripsi, foto, satuan, ukuran, ID Produk | `id` internal tetap; `code`: SN001/SM001/DR001; `photoFileId` menunjuk PRODUK; `unit`: Biji/Slice/Paket/Loyang/Cup/Botol; `sizeUnit`: ml/gr; `sizeValue`: nilai ukuran. |
| Discounts | Diskon per produk dan periode | Admin/Operator dengan hak menu; periode aktif tidak bertumpuk. |
| Vouchers | Kode, nilai, minimum, maksimum, masa berlaku | Kode unik; tidak ada kuota penggunaan. |
| ReadyStock | Kapasitas total stok siap jual | Satu baris per produk; tidak dicampur preorder. |
| PreorderCapacity | Kuota produksi per tanggal | Unik produk + tanggal penerimaan. |
| ServiceHours | Hari dan rentang layanan WITA | Satu rentang per hari; `weekday` 0 Minggu sampai 6 Sabtu. |
| ServiceAreas | Wilayah Makassar dan sekitarnya | Pelanggan hanya memilih yang aktif. |
| ShippingRates | Daftar layanan dan biaya pengiriman | Admin mengatur nama, nominal dan status aktif; konsumen memilih saat Checkout. |
| Users | Akun, kontak pemulihan, level dan hak menu | `permissionsJson`, hitungan salah, blokir dan login terakhir; `deliveryJson` untuk penerima terakhir, `registrationId` untuk retry pendaftaran; hash bcrypt tidak dikirim ke browser. |
| PasswordResets | Tautan reset email/WhatsApp | Hanya hash token; berlaku 15 menit, sekali pakai, terikat versi akun. |
| Sessions | Hash token sesi dan kedaluwarsa | Versi harus cocok akun; revokasi pada perubahan akun. |
| Orders | Pesanan dan snapshot kebijakan/harga | `requestId` unik; `customerId` berasal dari sesi Konsumen. Akses kunci privat sudah dihapus. |
| OrderItems | Item dan harga saat pemesanan | Anak Orders; ID deterministik untuk rekonsiliasi. |
| StockLedger | Jejak reservasi dan pelepasan | Kuota dihitung dari snapshot Orders agar crash anak tidak melonggarkan stok. |
| Payments | Pembayaran tagihan terverifikasi | Total pesanan baru mencakup produk dan ongkir; referensi transaksi unik, bukan foto. |
| Refunds | Refund yang sudah benar-benar ditransfer | Nominal dari aturan pesanan; status batal terpisah. |
| Shipping | Layanan, tarif tersimpan, kurir dan pelacakan | Tanpa persetujuan ongkir terpisah; tarif transaksi tidak mengikuti perubahan ShippingRates. |
| Files | Metadata berkas upload | `driveFileId`; folder berdasarkan `kind`. |
| AuditLog | Jejak tindakan pengelola | Tidak berisi password/token. |
| BackupLog | Status backup dan ID salinan | STARTED bukan bukti backup selesai. |

## Folder Drive

| Folder | Isi | Akses |
| --- | --- | --- |
| PRODUK | Foto produk aktual | Drive privat; backend melepas foto produk aktif untuk katalog. |
| INVOICE | PDF tagihan berbasis snapshot | Pemilik akun yang Login atau Admin/Operator berizin. |
| STRUK | Foto bukti transfer pelanggan | Pelanggan mengunggah untuk pesanannya; Admin/Operator memeriksa. |
| TANDATERIMA | Foto penerimaan pesanan | Diunggah konsumen melalui Status Pesanan saat siap diambil/sudah dikirim. |
| BACKUP | Salinan Sheet, berkas, manifest | Admin/Operator dengan hak Backup; pemulihan khusus Admin, selalu ke staging. |

## Tipe Data

- `id`, ID relasi, telepon dan kode: teks.
- Harga, kuantitas, nilai uang: bilangan bulat rupiah.
- Aktif/revoked: boolean.
- Waktu transaksi: ISO UTC; tampilan dan jadwal memakai Asia/Makassar.
- Tanggal penerimaan: `YYYY-MM-DD`; waktu jadwal: `HH:mm` WITA.
- Snapshot item/kebijakan: JSON yang tidak diedit setelah pesanan dibuat.
- Password: hash bcrypt dengan salt; token: hash SHA-256 dari token berentropi tinggi.

## Integritas

Sheets bukan database ACID. Operasi memakai ScriptLock, ID request dan jurnal PREPARING/COMMITTED.
Reservasi PREPARING tetap menahan kapasitas, lalu rekonsiliasi menyelesaikan anak yang hilang.
Pembayaran dan refund mempunyai referensi/idempotensi terpisah.
Pesanan akun hanya diakses pemilik `customerId` melalui sesi yang valid. Nomor
WhatsApp/email tidak dipakai untuk mengklaim pesanan lama. Migrasi menambahkan
kolom `customerId` tanpa mengisi kepemilikan pada baris lama.
Jangan mengubah data transaksi langsung dari Sheets: tindakan tersebut dapat melewati validasi/audit aplikasi.
Batasi editor database pada pemilik yang bertanggung jawab.

## Pembersihan Pesanan Percobaan Tanpa Akun

Akses pesanan dengan nomor dan kunci privat sudah dihapus. Pesanan Saya melalui
Login, checkout, dan data pesanan akun tetap dipertahankan.

1. Perbarui `Api.gs`, `Orders.gs`, `Files.gs`, `Admin.gs`, `Schema.gs`,
   dan `Recovery.gs` di editor Google Apps Script dari source lokal.
2. Dengan akun pemilik project, jalankan `removeLegacyOrders` dari `Schema.gs`.
3. Jalankan `installHealthyVibes` untuk menyelaraskan struktur database.
4. Perbarui deployment melalui Manage Deployments, Edit, New Version, Deploy.
5. Publikasikan frontend terbaru dan periksa Pesanan Saya melalui Login.

Pembersihan menghapus baris Orders yang memiliki ID tetapi `customerId` kosong,
termasuk pesanan PREPARING, beserta OrderItems, StockLedger, Payments, Refunds,
Shipping, Files, dan AuditLog yang merujuk ID tersebut. Berkas invoice/unggahan
yang tercatat dipindahkan ke sampah Drive, kecuali masih dirujuk data lain.
Kolom `accessHash` dihapus. Akun, sesi, katalog, stok master, tarif, dan counter
nomor pesanan tetap disimpan. Fungsi dapat dijalankan ulang; penghapusan induk
dilakukan terakhir untuk mendukung pengulangan setelah proses terputus.

Backup lama tidak dihapus dan mungkin masih berisi data percobaan. Berkas Drive
tanpa metadata/ID tersimpan tidak ikut dibersihkan. Pembersihan bukan API publik
dan tidak dijalankan otomatis saat install. Jangan menjalankannya bila pesanan
tanpa akun masih perlu disimpan. Perubahan source lokal saja tidak menghapus
data pada Google Sheets; fungsi harus dijalankan di editor cloud.

## Pembersihan Konfirmasi Ongkir Lama

Jalankan `removeShippingConfirmation` dari `Schema.gs` di editor Google Apps Script.
Fungsi ini menghapus dua kolom konfirmasi lama pada `Shipping` dan pengaturan
verifikasi pengiriman lama pada `Settings`. `ShippingRates`, tarif, data kurir,
pelacakan dan transaksi tetap disimpan. Fungsi boleh dijalankan ulang.

## Pembaruan Akun

Jalankan `installHealthyVibes` setelah menambahkan `Accounts.gs` dan memperbarui
backend. Kolom akun baru ditambahkan di kanan tanpa menimpa data lama.
Lengkapi email/WhatsApp Admin sebelum mengaktifkan pemblokiran tiga kesalahan.
Panduan lengkap tersedia di `panduan-setup-user.md`.

## Pembaruan Setup Produk

Setup Produk memiliki pilihan Satuan (Biji, Slice, Paket, Loyang, Cup, Botol) dan Ukuran (ml, gr).
Slice berarti irisan/potongan. Installer juga mengoreksi satuan lama `Slace`
menjadi `Slice` tanpa mengubah kolom lain; koreksi yang sama diterapkan pada
salinan restore backup dan saat produk lama disimpan kembali.
Nilai ukuran dapat diisi bersama unitnya, misalnya 100 gr atau 250 ml.
Angka harus positif (boleh desimal), maksimal 1000000000; nilai yang terisi
wajib disertai pilihan ml/gr. Kolom teknis `unit`, `sizeUnit`, dan `sizeValue`
ditambahkan di kanan tabel Products. Data produk lama tetap utuh; nilai kosong
tidak diisi otomatis. Tabel Setup Produk menampilkan angka dan unit bersama.

Untuk database yang sudah terpasang, perbarui `Schema.gs`, `Admin.gs`, dan
`Recovery.gs` di editor Apps Script. Pastikan `Accounts.gs` tersedia karena
installer memakai fungsi `extendSchemaColumns_` dari berkas tersebut.
Jalankan `installHealthyVibes` dengan akun pemilik, lalu perbarui deployment
melalui Manage Deployments, Edit, New Version, Deploy. Publikasikan frontend
terbaru agar dropdown dan kolom Satuan/Ukuran muncul pada Setup Produk.
Migrasi dapat dijalankan ulang tanpa mengubah ID, harga, foto, atau pesanan.

## ID Kategori, ID Produk, dan Nama File

ID yang terlihat di aplikasi adalah kode baru, bukan pengganti ID internal.
Relasi kategori, produk, stok, pesanan, dan file lama tetap menggunakan ID internal.
Kolom `code` dan `productPrefix` ditambahkan di kanan Categories; kolom `code`
ditambahkan di kanan Products.

- ID Kategori otomatis: HV01, HV02, HV03, dan seterusnya, berdasarkan urutan penambahan.
- Awalan ID Produk diambil dari dua huruf awal nama kategori: Snack = SN, Smoothies = SM, Drik/Drink = DR.
- Kategori baru boleh mengisi awalan dua huruf A-Z sendiri. Jika kosong dan awalan berbenturan, sistem memilih kombinasi lain yang belum digunakan.
- ID Produk otomatis per awalan: SN001, SN002; SM001, SM002; DR001, DR002.
- Kode tidak dapat diketik/diganti. Nama kategori, nama produk, atau kategori produk boleh berubah tanpa mengganti kode yang sudah diterbitkan.
- Awalan kategori tetap setelah disimpan. Counter tersimpan per database dan awalan; penghapusan baris tidak mengulang nomor.
- Installer mengisi kode pada data lama menurut urutan baris. Kode yang sudah ada dipertahankan; kode duplikat atau relasi kategori tidak valid menghentikan migrasi.

Nama file untuk upload baru:

| Jenis | Nama contoh |
| --- | --- |
| Tanda terima | `TT-HV-091126-0001.jpg` |
| Bukti transfer | `BT-HV-091126-0001.jpg` |
| Foto produk | `SN001-WafelRasaKeju.jpg` |
| Invoice pesanan | `NO-HV-091126-0001.pdf` |

Frontend mengonversi gambar JPG/PNG/WebP menjadi JPG sebelum upload. Jika gambar
PNG/WebP dikirim langsung melalui API, backend tetap memakai ekstensi MIME
aslinya agar isi file tidak salah dilabeli JPG. File tetap privat. Identitas retry
disimpan sebagai penanda privat Drive, bukan bagian dari nama final; nama file
yang sama boleh dimiliki beberapa upload berbeda tanpa menimpa file lama.
File lama tidak diganti namanya secara massal.

Sebelum pembaruan database, buat backup melalui menu Backup. Perbarui
`Schema.gs`, `Admin.gs`, `Files.gs`, dan `Recovery.gs` di project Apps Script yang
sama, kemudian jalankan `installHealthyVibes` memakai akun pemilik.
Pastikan `Accounts.gs` tetap tersedia. Buat deployment New Version dan
publikasikan `js/client.js` terbaru. Restore staging juga mengisi kolom kode pada
salinan, tanpa mengganti ID atau mengubah database produksi.

## Jika Migrasi Products Berhenti

Pesan `Kolom Products berbeda` berarti header aktual tidak sesuai dengan urutan
kolom di `HV_SCHEMA.Products`, bukan berarti isi produk harus dihapus.
Penyebab spesifik perlu diperiksa dari header database yang bersangkutan.

1. Perbarui `Accounts.gs` dan `Schema.gs` ke versi lokal terbaru di editor Apps Script.
2. Simpan, lalu pilih dan jalankan `inspectHealthyVibesSchema` memakai akun pemilik.
3. Periksa baris log `Products:`. `actual` adalah header Google Sheets, `expected`
   adalah skema script yang sedang dijalankan, dan `mismatches` menunjukkan posisi berbeda.
4. Jika `canAppend` bernilai `true`, kolom lama masih sesuai dan kolom yang kurang
   dapat ditambahkan oleh `installHealthyVibes`. Pastikan semua berkas backend
   berasal dari versi yang sama sebelum menjalankan installer kembali.
5. Jika `canAppend` bernilai `false`, kirim log `Products:` untuk menentukan
   migrasi yang cocok dengan susunan data aktual. Jangan menghapus tab Products,
   menimpa header, atau memindahkan nama header tanpa memindahkan datanya.

Pemeriksaan ini hanya membaca baris header, tidak menampilkan isi produk,
mengubah database, membuat file, atau menjalankan migrasi.
Header Products versi terbaru:

```text
id, categoryId, name, description, price, photoFileId, active, updatedAt, unit, sizeUnit, sizeValue, code
```
