FIX RAW CB-SCRIPTSTORE

Masalah sebelumnya:
Raw menampilkan {"code":"NOT_FOUND","message":"Requested function was not found"}
karena Edge Function bernama raw-script belum ter-deploy di Supabase.

FILE:
- raw.html
- raw-script-index.ts

LANGKAH DI SUPABASE:
1. Buka project Supabase.
2. Pilih Edge Functions.
3. Pilih Deploy a new function -> Via Editor.
4. Nama function HARUS: raw-script
5. Hapus kode contoh, lalu paste isi raw-script-index.ts.
6. Deploy function.
7. Pada pengaturan function, matikan/disable JWT verification agar Raw publik
   dapat dibuka tanpa login.

URL Raw yang dipakai website:
https://zpomypkasmmiozandzlv.supabase.co/functions/v1/raw-script?id=ID_SCRIPT

Setelah function aktif, jika script filename = fly.lua dan code = fly,
URL tersebut akan mengembalikan plain text:

fly

Bukan HTML dan bukan JSON.

CATATAN KEAMANAN:
Jangan memasukkan SUPABASE_SERVICE_ROLE_KEY ke index.html, app.js,
config.js, GitHub Pages, atau chat. Kode Edge Function memakai key tersebut
hanya dari environment server Supabase.
