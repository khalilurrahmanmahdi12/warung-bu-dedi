# Warung Bu Dedi — Supabase

Website kasir sederhana dengan database online Supabase.

## Berkas penting

- `index.html` — tampilan website
- `style.css` — desain hijau-putih
- `script.js` — logika aplikasi dan koneksi database
- `config.js` — tempat memasukkan URL dan publishable/anon key Supabase
- `supabase-setup.sql` — pembuatan tabel, keamanan, dan fungsi transaksi

## Urutan pemasangan

1. Buat project Supabase.
2. Jalankan seluruh isi `supabase-setup.sql` melalui SQL Editor.
3. Buat satu akun kasir melalui Authentication → Users.
4. Salin Project URL dan Publishable key/anon key ke `config.js`.
5. Upload seluruh berkas ke repository GitHub.
6. Aktifkan GitHub Pages dari branch `main` dan folder `/root`.

## Keamanan

Website menggunakan login Supabase. Tabel memakai Row Level Security dan hanya bisa diakses pengguna yang sudah login.

Jangan pernah memasukkan `service_role` atau secret key ke `config.js`. Gunakan publishable key atau anon key.
