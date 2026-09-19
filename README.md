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
