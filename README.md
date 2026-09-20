# CB ScriptStore — GitHub Pages + Supabase

Versi ini tidak membutuhkan Render atau server Node.js. GitHub Pages menampilkan frontend, sedangkan Supabase menangani Auth dan database.

## Fitur
- Register/Login dengan username + password
- Username unik tanpa membedakan huruf besar/kecil
- Setelah register: kembali ke Home, bukan otomatis ke Tutorial
- Profil di header setelah login
- Pilihan gambar `profile1.png` sampai `profile5.png` (fallback ke logo.png bila file belum tersedia)
- My Scripts tanpa folder
- Buat Script dengan satu editor untuk Code atau Text
- Upload file teks ke editor
- Maksimal 50 item per akun
- Edit / Visit / Raw / Copy Raw Link / Delete lewat menu titik tiga (⋯)
- Visit membuka halaman script; Raw membuka isi mentah
- Global Chat maksimal 500 karakter dengan profil + username + pesan
- Online Now dengan heartbeat
- Deteksi bahasa otomatis + 20 bahasa di seluruh UI utama
- RLS Supabase untuk data akun, script, chat, dan presence

## Instalasi
1. Jalankan `supabase.sql` penuh di Supabase SQL Editor.
2. Authentication → Providers → Email: matikan **Confirm email**.
3. `config.js` harus berisi Project URL dan **Publishable/anon key**. Jangan pernah memakai secret/service_role key.
4. Upload semua file ini ke repository GitHub Pages.
5. Tambahkan `profile1.png` sampai `profile5.png` ke repository saat gambarnya sudah kamu buat.

## Catatan
`raw.html?id=...` hanya menampilkan script yang visibility-nya `public`. `view.html?id=...` bisa menampilkan script publik atau script private milik akun yang sedang login.
