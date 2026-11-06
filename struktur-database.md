# Healthy Vibes: Struktur Database Google Sheets

Database dibuat dengan menjalankan `installHealthyVibes` dari editor Google
memakai akun pemilik. Fungsi tersebut memanggil implementasi internal
`installHealthyVibes_`.
Source skema lengkap: `apps-script/Schema.gs`. Nama kolom teknis tetap konsisten dengan API.

| Sheet | Kegunaan | Relasi / aturan penting |
| --- | --- | --- |
| Settings | Identitas dan aturan toko | `key` unik; rahasia tidak disimpan di sini. |
| Categories | Kategori produk | `id` dirujuk Products. Nonaktif, bukan hapus transaksi. |
| Products | Nama, kategori, harga, deskripsi, foto | `photoFileId` menunjuk PRODUK. |
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
| Orders | Pesanan dan snapshot kebijakan/harga | `requestId` unik; `customerId` berasal dari sesi Konsumen. `accessHash` hanya untuk akses pesanan lama tanpa akun. |
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
| INVOICE | PDF tagihan berbasis snapshot | Pemilik akun yang Login, pemilik pesanan lama dengan kunci akses, atau Admin/Operator berizin. |
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
