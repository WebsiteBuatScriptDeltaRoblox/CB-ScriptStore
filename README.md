# CB ScriptStore

CB ScriptStore adalah website belajar Luau/Roblox dengan tutorial, akun, My Scripts, Raw script, Global Chat, dan daftar pengguna online.

## Arsitektur

- **Frontend:** GitHub Pages/static hosting
- **Backend:** Node.js + Express
- **Database:** SQLite pada persistent disk/volume

GitHub Pages tidak dapat menjalankan backend Node.js. Karena itu frontend membaca URL backend dari `config.js`.

```js
window.CB_API_BASE = 'https://YOUR-BACKEND.example.com';
```

Lihat `HOSTING.md` untuk langkah deployment.

## Fitur

- Register/Login
- Username unik tanpa membedakan huruf besar-kecil
- Session login 7 hari
- My Scripts maksimal 50 script per akun
- Private/Public + Raw URL
- Global Chat untuk pengguna yang sudah login
- Online Now dengan heartbeat
- 20 pilihan bahasa + deteksi bahasa otomatis
- Tutorial level 1–5

## Local

```bash
npm install
npm start
```

Lalu buka `http://localhost:3000`.


## GitHub Pages + Supabase (tanpa Render)
1. Jalankan `supabase.sql` di Supabase SQL Editor.
2. Di Supabase Authentication -> Providers -> Email, matikan **Confirm email** untuk mode username-only ini.
3. Di Project Settings -> API, salin Project URL dan **anon/publishable key** ke `config.js`. Jangan pernah memakai service_role/secret key di frontend.
4. Upload file proyek ini ke GitHub dan aktifkan GitHub Pages.
5. Website akan menyimpan akun, script, chat, dan status online di Supabase.
6. Link Raw memakai `raw.html?id=...` dan hanya menampilkan script yang visibility-nya `public`.


## Supabase relationship fix
If chat shows a `Could not find a relationship between chat_messages and profiles` error, run the latest `supabase.sql` in the Supabase SQL Editor. The final migration creates the `profiles` foreign-key relationships used by the frontend.
