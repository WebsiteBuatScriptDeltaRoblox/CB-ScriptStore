# CB ScriptStore

Website CB ScriptStore bergaya futuristic neon-blue, dibuat mengikuti mockup yang diminta.

## Jalankan
1. Install Node.js.
2. Buka terminal di folder ini.
3. Jalankan `npm install`.
4. Jalankan `npm start`.
5. Buka `http://localhost:3000`.

Database SQLite `challocode.db` dibuat otomatis saat server pertama kali dijalankan.

## Catatan keamanan
- Password disimpan sebagai bcrypt hash, bukan plaintext.
- Script/account disimpan di SQLite server-side.
- Session token disimpan dalam bentuk hash di database.
- Untuk production, gunakan HTTPS dan pindahkan token dari localStorage ke HttpOnly + Secure cookie, serta tambahkan rate limiting/CSRF protection.
