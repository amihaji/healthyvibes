# Healthy Vibes: Update Otomatis dari GitHub Desktop

Keputusan terbaru: frontend terpisah, mengikuti pola Berat Idealku.
Source sudah disesuaikan. Belum ada Push atau deployment nyata.

## Alur yang Digunakan

```text
Edit index.html, css, atau js di komputer
  -> Commit dan Push ke branch main lewat GitHub Desktop
  -> GitHub Actions menerbitkan frontend ke GitHub Pages
  -> Halaman memanggil API Apps Script
  -> Apps Script membaca/menulis Google Sheets dan Google Drive
```

URL frontend yang dituju: https://amihaji.github.io/healthyvibes/
Tombol di `www.beratidealku.com` nantinya mengarah ke URL tersebut.
Website Berat Idealku belum diubah dalam pekerjaan ini.

GitHub Pages memang hosting, walaupun tidak perlu membeli domain tambahan.
Ketentuannya membatasi penggunaan untuk toko online yang terutama
memfasilitasi transaksi komersial. Konfigurasi teknis ini bukan persetujuan
GitHub terhadap penggunaan komersial. Pertimbangkan ketentuan tersebut sebelum
membuka transaksi nyata:
https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## Struktur Source

- `index.html`: halaman utama frontend.
- `css/styles.css`: warna, layout dan tampilan responsif.
- `js/client.js`: katalog, checkout dan panel pengelola.
- `js/config.js`: URL API Google yang boleh diketahui browser.
- `js/transport.js`: POST dan pembacaan respons lintas situs.
- `apps-script`: backend `.gs` dan manifest, dipasang ke Google.
- `.github/workflows/jekyll-docker.yml`: publikasi frontend, tanpa Jekyll.

Tidak ada salinan HTML frontend di Apps Script.
Workflow hanya mengunggah `index.html`, `css`, dan `js` ke website.
Backend, dokumentasi, test, serta ZIP tidak ikut artifact Pages.

## Pemasangan Awal

1. Pasang seluruh backend dari `apps-script` sesuai `panduan-pemasangan.md`.
2. Buat deployment web app Google, jalankan sebagai pemilik, akses **Anyone**
   jika diizinkan akun, lalu ambil URL `/exec`.
3. Isi `apiUrl` pada `js/config.js` dengan URL tersebut.
4. Pada repository GitHub, buka **Settings > Pages**.
5. Pilih **Source: GitHub Actions**, bukan **Deploy from a branch**.
6. Commit perubahan dan Push melalui GitHub Desktop ke `main`.
7. Buka **Actions > Publikasikan Frontend Healthy Vibes** dan tunggu hijau.
8. Buka URL frontend dan lakukan uji sandbox sebelum membuka toko.

Jika perubahan sudah di-Push sebelum Pages diatur, jalankan kembali dari
**Actions > Publikasikan Frontend Healthy Vibes > Run workflow**, branch `main`.
Tidak perlu membeli domain. Jangan memasang `CNAME` untuk `www.beratidealku.com`
di repo Healthy Vibes karena domain itu sudah dipakai repo Berat Idealku.

Workflow ini tidak membutuhkan `CLASP_TOKEN` atau `APPS_SCRIPT_DEPLOYMENT_ID`.
Konfigurasi otomatis Google sebelumnya sudah diganti. Jika Secret lama sudah
ditambahkan, hapus dari GitHub apabila tidak dipakai lagi.
Apps Script API/clasp tidak diperlukan untuk publikasi frontend.

## Penggunaan Sehari-hari

1. Edit `index.html`, `css/styles.css`, atau file `js` di komputer.
2. Periksa dan uji perubahan.
3. Commit, lalu Push lewat GitHub Desktop ke `main`.
4. Tunggu workflow Pages hijau, lalu muat ulang website.

Revisi tampilan tidak perlu membuka editor Google.
Push dokumentasi atau file `.gs` saja tidak menerbitkan frontend.
Push ke branch lain atau pull request tidak memperbarui aplikasi produksi.

## Jika Backend Direvisi

1. Edit source `.gs` di komputer dan simpan riwayatnya melalui GitHub Desktop.
2. Masukkan revisi `.gs` ke project Google yang sama.
3. Di Google, pilih **Deploy > Manage deployments > Edit > New version**.
4. Perbarui deployment lama agar URL `/exec` tetap sama.

File `.clasp.json` tetap tersedia sebagai pilihan sinkronisasi backend lokal.
Jika memakai clasp, login dilakukan di komputer pemilik; token tidak masuk
repository. Jangan menjalankan push clasp sebelum memastikan seluruh source
backend lokal lengkap, karena isi project Google diganti dengan source lokal.
Perubahan skema database perlu migrasi yang diperiksa, bukan otomatis dari Push.

## Komunikasi dan Privasi

Transport memakai POST form ke iframe sementara, lalu menerima `postMessage`
dari respons HTML Service. Ini komponen komunikasi aktif, bukan tampilan
pengguna yang disembunyikan. Iframe dan payload dibuang setelah selesai.

Frontend memeriksa origin Google, hubungan iframe, kanal acak dan bentuk
respons. Password/token tidak masuk URL. Tidak memakai JSONP untuk login atau
`fetch` no-cors yang tidak bisa membaca hasil server.

`FRONTEND_ORIGINS` di Script Properties dapat mengatur origin tujuan balasan,
misalnya `https://amihaji.github.io`. Ini bukan autentikasi:
hak akses tetap diperiksa backend melalui sesi dan token pelanggan.

Database serta folder Drive tetap privat. Jangan taruh `SECURITY_KEY`, password
Admin, token Google, atau data pelanggan dalam file frontend.
Jika respons terlambat, UI tidak menyatakan berhasil; gunakan ID permintaan
pesanan yang sama atau periksa status sebelum mencoba lagi.

## Status Verifikasi

Deployment Google dan GitHub Pages belum dijalankan. Uji lintas origin Google,
login semua role, upload/download, dan satu alur sandbox wajib berhasil sebelum
aplikasi dinyatakan siap produksi. Lihat `hasil-pengujian-build.md`.
