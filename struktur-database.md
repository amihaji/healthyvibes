# Healthy Vibes: Struktur Database Google Sheets

Database dibuat dengan menjalankan `installHealthyVibes` dari editor Google
memakai akun pemilik. Fungsi tersebut memanggil implementasi internal
`installHealthyVibes_`.
Source skema lengkap: `apps-script/Schema.gs`. Nama kolom teknis tetap konsisten dengan API.

| Sheet | Kegunaan | Relasi / aturan penting |
| --- | --- | --- |
| Settings | Identitas dan aturan toko | `key` unik; rahasia tidak disimpan di sini. |
| Categories | Kategori produk | `id` dirujuk Products. Nonaktif, bukan hapus transaksi. |
| Products | Nama, kategori, harga, deskripsi, foto, satuan, ukuran | `photoFileId` menunjuk PRODUK; `unit`: Biji/Slice/Paket; `sizeUnit`: ml/gr; `sizeValue`: nilai ukuran. |
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

Setup Produk memiliki pilihan Satuan (Biji, Slice, Paket) dan Ukuran (ml, gr).
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
