# Healthy Vibes: Struktur Database Google Sheets

Database dibuat oleh `installHealthyVibes_` di akun Google pemilik.
Source skema lengkap: `apps-script/Schema.gs`. Nama kolom teknis tetap konsisten dengan API.

| Sheet | Kegunaan | Relasi / aturan penting |
| --- | --- | --- |
| Settings | Identitas dan aturan toko | `key` unik; rahasia tidak disimpan di sini. |
| Categories | Kategori produk | `id` dirujuk Products. Nonaktif, bukan hapus transaksi. |
| Products | Nama, kategori, harga, deskripsi, foto | `photoFileId` menunjuk PRODUK. |
| Discounts | Diskon per produk dan periode | Hanya Admin; periode aktif tidak bertumpuk. |
| Vouchers | Kode, nilai, minimum, maksimum, masa berlaku | Kode unik; tidak ada kuota penggunaan. |
| ReadyStock | Kapasitas total stok siap jual | Satu baris per produk; tidak dicampur preorder. |
| PreorderCapacity | Kuota produksi per tanggal | Unik produk + tanggal penerimaan. |
| ServiceHours | Hari dan rentang layanan WITA | Satu rentang per hari; `weekday` 0 Minggu sampai 6 Sabtu. |
| ServiceAreas | Wilayah Makassar dan sekitarnya | Pelanggan hanya memilih yang aktif. |
| Users | Akun internal dan level | Hash bcrypt; tidak pernah dikirim ke browser. |
| Sessions | Hash token sesi dan kedaluwarsa | Versi harus cocok akun; revokasi pada perubahan akun. |
| Orders | Pesanan dan snapshot kebijakan/harga | `requestId` unik; `accessHash` untuk status privat. |
| OrderItems | Item dan harga saat pemesanan | Anak Orders; ID deterministik untuk rekonsiliasi. |
| StockLedger | Jejak reservasi dan pelepasan | Kuota dihitung dari snapshot Orders agar crash anak tidak melonggarkan stok. |
| Payments | Pembayaran produk terverifikasi | Referensi transaksi unik; bukan ongkir dan bukan foto. |
| Refunds | Refund yang sudah benar-benar ditransfer | Nominal dari aturan pesanan; status batal terpisah. |
| Shipping | GoSend, tarif disepakati dan pembayaran ke kurir | Tidak dimasukkan omzet/penerimaan produk. |
| Files | Metadata berkas upload | `driveFileId`; folder berdasarkan `kind`. |
| AuditLog | Jejak tindakan pengelola | Tidak berisi password/token. |
| BackupLog | Status backup dan ID salinan | STARTED bukan bukti backup selesai. |

## Folder Drive

| Folder | Isi | Akses |
| --- | --- | --- |
| PRODUK | Foto produk aktual | Drive privat; backend melepas foto produk aktif untuk katalog. |
| INVOICE | PDF tagihan berbasis snapshot | Pemilik pesanan dengan kunci akses, atau Admin/Operator. |
| STRUK | Foto bukti transfer pelanggan | Pelanggan mengunggah untuk pesanannya; Admin/Operator memeriksa. |
| TANDATERIMA | Foto penyerahan pesanan | Diunggah Admin/Operator untuk pesanan siap/dikirim. |
| BACKUP | Salinan Sheet, berkas, manifest | Admin; pemulihan selalu ke staging. |

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
Jangan mengubah data transaksi langsung dari Sheets: tindakan tersebut dapat melewati validasi/audit aplikasi.
Batasi editor database pada pemilik yang bertanggung jawab.
