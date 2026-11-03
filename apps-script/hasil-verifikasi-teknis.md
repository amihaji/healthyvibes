# Healthy Vibes: Hasil Verifikasi Teknis

Catatan 2 November 2026: dokumen berikut merekam verifikasi sebelum build.
Arsitektur aktif kini frontend statis GitHub Pages dengan API Apps Script,
sesuai pilihan terbaru pengguna. Lihat `hasil-pengujian-build.md` untuk
pengujian terbaru dan `panduan-pemasangan.md` untuk pemasangan.
Hasil/keputusan historis HTML Service di bawah bukan petunjuk deployment aktif.

Tanggal: 1 November 2026. Status: dokumentasi diperiksa, belum uji deployment.
Pengguna menyetujui arah paket untuk finalisasi desain dan verifikasi teknis, bukan izin build, persetujuan seluruh detail atau pembelian layanan.

## Revisi Pilihan Pengguna

Pengguna menolak hosting Cloudflare dan Pages Functions untuk saat ini, serta meminta akses https://amihaji.github.io/healthyvibes dengan backend Apps Script dan database Sheets/Drive tetap. URL github.io adalah hosting GitHub Pages, bukan akses file repository tanpa hosting. Ketentuan GitHub Pages melarang hosting bisnis online/e-commerce; memindahkan database ke Google tidak menghapus batas penggunaan frontend tersebut.

Keputusan terbaru melalui pilihan A: tombol pemesanan di https://www.beratidealku.com menuju langsung URL web app Apps Script, menggantikan tujuan GitHub Pages yang diminta sebelumnya. Frontend HTML/CSS/JavaScript/Bootstrap disajikan melalui Apps Script HTML Service; source tetap GitHub, backend Apps Script, database Sheets/Drive. Cloudflare/penghubung tidak dipilih. URL deployment nyata belum tersedia; persetujuan alur akses bukan izin coding utama, perubahan website atau deployment.

Akun tetap dibuat Admin; kelayakan autentikasi aman, hashing password, sumber acak, sesi dan komunikasi HTML Service pada Apps Script tetap NOT TESTED. Bukti kriptografi Workers di bawah tidak berlaku sebagai bukti kemampuan Apps Script. Jangan mengganti login dengan Google atau password polos demi menghilangkan penghubung.

Sumber batas GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## Usulan Sebelumnya (Tidak Dipilih)

GitHub (source code) -> Cloudflare Pages (frontend HTTPS) -> Pages Functions (penghubung login/API) -> Apps Script (aturan bisnis dan akses data) -> Sheets/Drive privat.

Penghubung ini tidak dipilih. Bukti dokumentasi berikut dipertahankan sebagai riwayat opsi sebelumnya, bukan arsitektur aktif atau bukti runtime Apps Script.

| Bagian | Bukti dokumentasi | Status runtime |
| --- | --- | --- |
| Hosting dinamis | Pages Functions berjalan pada Workers dan mendukung autentikasi, middleware serta form. | NOT TESTED; akun/deployment belum tersedia. |
| Kriptografi | Workers mendukung crypto.getRandomValues, PBKDF2 dan timingSafeEqual; node:crypto tersedia, tetapi Argon2 native tidak didukung. | NOT TESTED; algoritme/faktor kerja dan biaya CPU harus diuji, bukan menjanjikan semua library berjalan. |
| Kuota Cloudflare | Dokumentasi menyebut kuota Free 100.000 request per hari bersama Workers; Functions memakai kuota Workers, aset statis berbeda. | Bukan jaminan cocok/gratis untuk beban nyata; CPU, paket dan ketentuan akun juga perlu diperiksa. |
| Apps Script | Content Service memakai redirect. TextOutput tidak menyediakan API setHeader umum untuk cookie/header CORS seperti backend biasa. | Koneksi langsung belum diuji; dokumentasi tidak membuktikan fetch selalu gagal maupun selalu berhasil. |
| Kuota Google | Runtime 6 menit per eksekusi dan batas 30 eksekusi bersamaan per pengguna pada dokumentasi saat diperiksa. Kuota dapat berubah dan kegagalan menghentikan eksekusi. | NOT TESTED; identitas deployment, beban dan penanganan kegagalan harus diuji. |

## Rancangan Penghubung Sebelumnya (Tidak Dipilih)

- Browser hanya berbicara dengan API satu origin. Sesi lewat cookie Secure/HttpOnly/SameSite yang tepat; validasi Origin/CSRF untuk operasi perubahan data.
- Penghubung membuat token/salt acak kriptografis dan menangani pemeriksaan password. Algoritme khusus password dengan parameter standar keamanan harus dibenchmark dalam kuota; tidak memakai SHA-256 sekali saja atau parameter lemah agar lolos paket gratis.
- Data akun/hash password, sesi dan role tetap privat di Sheets; hash password tidak dikirim ke browser. Apps Script memeriksa akun aktif, sesi dan izin terbaru setiap operasi terlindungi.
- Request penghubung ke Apps Script ditandatangani (HMAC, timestamp, nonce/request ID, isi request); rahasia hanya di konfigurasi server kedua sisi. Apps Script menolak request tak bertanda tangan, kedaluwarsa atau replay. URL endpoint saja bukan pengamanan.
- Replay dan retry transaksi dibedakan: request ID sama harus mengembalikan hasil transaksi yang sama; jangan membuat penahanan stok kedua. Simpan status sesi/idempotensi secara konsisten, bukan cache lokal saja.
- Redirect Google mengikuti tujuan yang diizinkan; jangan meneruskan rahasia atau header autentikasi secara buta ke domain lain. Jangan mencatat password, token atau isi privat pada log.
- Penghubung menambah permukaan serangan dan konfigurasi; bukan jaminan otomatis aman. Uji bypass endpoint, CSRF, revokasi, retry dan kegagalan penulisan sebelum penerimaan.

## Sebelum Menutup Blueprint

1. Alur akses Apps Script sudah disetujui; tidak perlu meminta pilihan Cloudflare lagi. URL deployment, perubahan tombol website dan coding utama belum diizinkan.
2. Rancang dan verifikasi autentikasi/sesi serta komunikasi HTML Service dengan backend Apps Script. Uji runtime terisolasi hanya pada sandbox yang diizinkan, dengan data sintetis: hashing, sumber acak, role, revokasi, timeout, retry dan kegagalan penulisan. Jangan menganggap rancangan cookie/signature penghubung otomatis berlaku pada HTML Service.
3. Review layout desktop/tablet/HP/landscape tetap belum final; pemeriksaan visual sesi sebelumnya belum berhasil. Logo dan foto aktual masih menunggu.
4. GoSend ongkir ke kurir di Makassar masih belum terverifikasi. Jangan membuka pengantaran nyata atau mengganti alur tanpa persetujuan.
5. Setelah keputusan kritis, bukti kelayakan dan desain lengkap, baru minta perintah SETUJU - GENERATE FINAL BUILD.

## Sumber Resmi

- https://developers.cloudflare.com/pages/functions/
- https://developers.cloudflare.com/pages/functions/pricing/
- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
- https://developers.google.com/apps-script/reference/content/text-output
- https://developers.google.com/apps-script/guides/services/quotas

Kesimpulan: Apps Script HTML Service dipilih untuk frontend dan Apps Script untuk backend; source GitHub, data Sheets/Drive. Keamanan, performa dan koneksi arsitektur ini belum dinyatakan PASS. Dokumentasi Cloudflare hanya bukti opsi yang tidak dipilih. Tidak ada kode aplikasi utama, deployment, perubahan website, akun nyata atau transaksi yang dibuat dalam verifikasi ini.
