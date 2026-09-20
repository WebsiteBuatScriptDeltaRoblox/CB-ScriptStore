CB-SCRIPTSTORE RAW FIX 2

PENTING: Bug sebelumnya ada 2 bagian.
1. app.js memanggil Edge Function bernama "raw", padahal function yang dibuat adalah "raw-script".
2. Edge Function "raw-script" HARUS benar-benar di-deploy di Supabase.

FILE YANG DIGANTI:
- app.js
- raw.html

FILE UNTUK SUPABASE:
- raw-script-index.ts

SETELAH DIPASANG:
Raw publik:
https://zpomypkasmmiozandzlv.supabase.co/functions/v1/raw-script?id=ID_SCRIPT

Jika filename = fly.lua dan code = fly, responsnya adalah plain text "fly".

LANGKAH SUPABASE:
1. Supabase Dashboard -> project CB ScriptStore -> Edge Functions.
2. Deploy a new function -> Via Editor.
3. Nama function: raw-script (HARUS SAMA PERSIS).
4. Hapus kode contoh dan paste isi raw-script-index.ts.
5. Deploy function.
6. Untuk endpoint publik tanpa login, nonaktifkan JWT verification untuk function ini.

JANGAN taruh Secret/Service Role Key di GitHub, app.js, raw.html, config.js, atau chat.
