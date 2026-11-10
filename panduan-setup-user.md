# Panduan Login, Akun Konsumen, dan Setup User Healthy Vibes

Perubahan sudah tersedia di kode lokal. Website belum berubah sampai backend
diperbarui dan frontend di-push. Database dan URL API yang sekarang tetap digunakan.

## 1. Perbarui Backend Google Apps Script

Di editor Apps Script yang sekarang, ganti isi file berikut dengan isi file lokal
di folder `apps-script`:

- `Admin.gs`
- `Api.gs`
- `Auth.gs`
- `Accounts.gs`
- `Files.gs`
- `Orders.gs`
- `Recovery.gs`
- `Schema.gs`

Jika file **Accounts** belum ada, buat file script dengan nama tersebut.
Jika sudah ada, cukup ganti isinya dengan seluruh isi `Accounts.gs` lokal.
Jangan menempelkan isinya ke file lain agar fungsi tidak terduplikasi.

Buka **Project Settings / Setelan Project**, aktifkan tampilan file manifest
`appsscript.json` di editor. Perbarui isinya dari file lokal dengan nama yang sama.
Manifest menambahkan izin pengiriman email dan request ke penyedia WhatsApp.

Simpan semua perubahan.

## 2. Lengkapi Database yang Sudah Ada

Pilih fungsi **installHealthyVibes** pada editor, lalu klik **Run / Jalankan**.
Jika Google meminta izin, setujui menggunakan akun pemilik.

Installer melengkapi kolom di kanan tab `Users` dan `Orders`, serta tab
`PasswordResets`. `Orders.customerId` menyimpan pemilik pesanan baru.
Kolom pemilik pada pesanan lama tetap kosong.
Akun, password, pesanan, dan ID database lama tidak diganti.
Jangan menjalankan `createFirstAdmin` lagi.

Sebelum mengaktifkan versi baru, buka tab `Users` di Google Sheets dan isi
**email** milik akun Admin Anda. Ini pengecualian untuk melengkapi kontak
pemulihan akun lama. Setelah aplikasi aktif, perubahan akun dilakukan melalui
Setup User.

Untuk WhatsApp, isi kolom **phone** dengan format `628...` tanpa tanda `+`.
Gunakan format sel **Teks biasa / Plain text** untuk nomor telepon.
Sedikitnya satu kontak harus terisi. Gunakan kontak milik pengguna tersebut;
aplikasi belum memverifikasi kepemilikan kontak secara otomatis.

Kolom `permissionsJson` akun lama boleh dibiarkan kosong: hak sebelumnya tetap
berlaku sampai Admin mengedit centang melalui Setup User. Jangan mengubah kolom
hash password secara manual.

## 3. Atur Pengiriman WhatsApp

Integrasi mengikuti contoh proyek Berat Idealku, yaitu **Fonnte**.
Jika API WhatsApp Anda bukan Fonnte, integrasi harus disesuaikan sebelum dipakai.
Pemulihan melalui email tidak memerlukan Fonnte.

Di **Project Settings > Script Properties**, tambahkan:

| Property | Isi |
| --- | --- |
| `FONNTE_TOKEN` | Token dari akun Fonnte Anda. |
| `PUBLIC_APP_URL` | Opsional: `https://amihaji.github.io/healthyvibes/` |

Nomor pengirim Fonnte harus sudah tersambung dan layanan tersedia.
Jangan memasukkan token ke file frontend, Google Sheets, GitHub, atau percakapan.
Tidak perlu mengganti `SECURITY_KEY`, `DATABASE_ID`, atau `ROOT_FOLDER_ID`.

## 4. Aktifkan Versi Baru

1. Di Apps Script, pilih **Deploy > Manage deployments**.
2. Edit deployment API yang sekarang, pilih **New version**, lalu **Deploy**.
3. Di GitHub Desktop, lakukan **Commit** perubahan Healthy Vibes lalu **Push**.
4. Setelah GitHub Pages selesai diperbarui, muat ulang website.

URL API tetap sama. Jangan membuat deployment baru atau mengganti `js/config.js`
hanya untuk pembaruan ini.

## 5. Menggunakan Setup User

- Sebelum masuk, header bertuliskan **Login** (ikon di HP). Setelah masuk, desktop
  menampilkan username aktif di samping **Logout**.
- Di HP, klik tombol menu navigasi untuk melihat **Home**, **Katalog**, **Pesanan Saya**,
  username aktif, lalu **Logout**. Akun tidak memakai baris header tersendiri.
- Klik username aktif untuk membuka akun/panel. Klik **Logout** untuk keluar;
  header kembali menjadi **Login** dan username disembunyikan.
- Menu **Setup User** menyediakan **Buat**, **Edit**, **Hapus**, **View**, dan **Reset**.
- Geser tabel ke kanan untuk melihat seluruh 15 kolom hak menu.
- **Buat**: isi nama, username, level, email/WhatsApp, password sementara, dan centang menu.
- **Edit**: ubah data akun dan centang akses. Password lama tidak ditampilkan.
- **View**: melihat data dan hak menu tanpa mengubahnya.
- **Hapus**: memakai konfirmasi singkat. Akun sendiri dan Admin aktif terakhir dilindungi.
- **Reset**: mengirim tautan ke email/WhatsApp yang sudah tercatat pada akun.

Username dan password minimal **6 karakter**. Akun yang dibuat Admin wajib
mengganti password sementara saat login pertama. Akun checkout memakai password
yang dipilih konsumen sendiri, sehingga tidak perlu menggantinya saat pertama Login.

| Level | Penggunaan |
| --- | --- |
| Admin | Membaca/mengubah menu yang dicentang, termasuk Setup User bila diizinkan. |
| Operator | Membaca/mengubah menu operasional yang dicentang; tidak mengubah Setup User. |
| Viewer | Hanya membaca menu yang dicentang, tanpa simpan/hapus/tindakan pesanan. |
| Konsumen | Katalog dan Pesanan Saya; tidak membuka Panel Pengelola. |

Contoh awal Operator mencentang semua menu kecuali **Setup User** dan
**Pengaturan**. Admin dapat menyesuaikannya.

Centang diperiksa di backend juga. Viewer tidak mendapat dokumen privat atau
identitas pelanggan pada detail pesanan. Akses Backup untuk Operator mengizinkan
pembuatan salinan database privat, jadi berikan hanya kepada staf terpercaya.
Pemulihan backup ke staging tetap khusus Admin.

## 6. Blokir dan Reset Password

Akun diblokir setelah **3 kali salah password berturut-turut** saat Login.
Login berhasil sebelum kesalahan ketiga mengembalikan hitungan ke nol.
Sesi yang sudah terbuka juga dicabut ketika akun diblokir.

Pengguna yang lupa password atau diblokir:

1. Klik **Login > Lupa Password**.
2. Isi username dan pilih **Email** atau **WhatsApp**.
3. Buka tautan dari kontak terdaftar.
4. Isi password baru dua kali, simpan, lalu login kembali.

Tautan berlaku **15 menit** dan **sekali pakai**. Reset berhasil membuka blokir
dan mencabut seluruh sesi lama. Akun nonaktif tidak dapat diaktifkan melalui reset.
Pesan permintaan reset dibuat sama untuk akun ada/tidak ada demi menjaga privasi.
Pesan tersebut bukan jaminan pengiriman berhasil.

Jika pesan tidak masuk, periksa kontak terdaftar, folder spam email, dan
konfigurasi Fonnte. Tab `AuditLog` mencatat `PASSWORD_RESET_SENT` atau
`PASSWORD_RESET_DELIVERY_FAILED`, tanpa menyimpan token atau password.

## 7. Jika Admin Terakhir Terblokir

Pemilik project masih dapat membuka blokir melalui editor:

1. Di Script Properties, isi `INITIAL_ADMIN_USERNAME` dengan username Admin Anda.
2. Pilih fungsi **unlockHealthyVibesAdmin** dari `Accounts.gs`.
3. Klik **Run / Jalankan** menggunakan akun pemilik.

Fungsi hanya membuka blokir, tidak mengganti password. Jika password lupa,
lengkapi email pada baris akun Admin di tab `Users`, kemudian gunakan
**Lupa Password**. Property sementara tersebut dihapus otomatis setelah berhasil.

## 8. Belanja Pertama dan Pesanan Saya

1. Konsumen bebas melihat Katalog dan memasukkan produk ke keranjang tanpa Login.
2. Pada langkah pertama Checkout, isi penerima, WhatsApp, jadwal, dan alamat bila diantar.
3. Isi username, password dua kali, serta email pemulihan bila tersedia.
4. Klik **Lanjut**: akun langsung aktif dan otomatis Login, tanpa kode/tautan verifikasi.
5. Pilih metode pembayaran, tinjau total, lalu klik **Buat Pesanan**.
6. Bayar sesuai tagihan dan unggah bukti pembayaran pada detail pesanan.
7. Buka **Pesanan Saya**, lalu klik ikon **Detail** untuk melihat perkembangan.

Pemilik akun tidak perlu memasukkan nomor pesanan atau kunci akses privat.
Riwayat menampilkan maksimal 10 pesanan per halaman, dengan Sebelumnya/Berikutnya.
Invoice, bukti pembayaran, dan tanda terima tersedia pada detail pesanan akun.
Akun aktif tidak berarti pembayaran lunas; pembayaran tetap diperiksa Admin.

Pada pembelian berikutnya, Login menggunakan username/password yang sama.
Saat Checkout, penerima dan alamat terakhir terisi otomatis dan tetap dapat diubah.
Nomor penerima yang diubah tidak mengganti kontak pemulihan akun.
Jika sudah punya akun saat Checkout, klik **Sudah punya akun? Login**.
Keranjang dan langkah checkout tetap dipertahankan ketika Login.

Kontak tidak diverifikasi, sesuai alur yang dipilih. Pastikan email/WhatsApp benar:
kontak yang salah dapat menyebabkan tautan pemulihan terkirim kepada orang lain.
Username atau kontak yang sudah terdaftar tidak dapat digunakan membuat akun kedua;
gunakan Login atau Lupa Password.

Pesanan hanya ditautkan dari akun yang sedang Login, bukan kecocokan nomor WhatsApp.
Akses **Buka Pesanan Lama**, unduh kunci, dan pemulihan kunci Admin sudah dihapus.
Data percobaan tanpa akun dibersihkan melalui `removeLegacyOrders` dari editor
Apps Script dengan akun pemilik. Lihat langkah lengkap di `struktur-database.md`.
Pesanan akun memakai Login atau Reset Password, bukan kunci privat.
Akun yang dirujuk pesanan tidak bisa dihapus; gunakan Edit untuk menonaktifkan bila perlu.

## Pemeriksaan

139 pengujian otomatis lulus menggunakan layanan tiruan, tanpa transaksi Google
atau pengiriman email/WhatsApp nyata, termasuk penghapusan akses lama dan
pembersihan pesanan tanpa akun. Pemeriksaan browser terbaru memastikan halaman
Pesanan Saya tidak lagi menampilkan formulir nomor pesanan/kunci privat.
Pemeriksaan browser sebelumnya untuk pendaftaran, checkout, riwayat, pagination,
invoice, unggahan, Login ulang, dan alamat tersimpan dilakukan pada layar
320, 390, 768, dan 1280 px.
Pengiriman produksi tetap perlu dicoba
setelah konfigurasi dan deployment siap, sebaiknya menggunakan akun uji.
Jangan sengaja memblokir Admin utama untuk mencoba fitur.
