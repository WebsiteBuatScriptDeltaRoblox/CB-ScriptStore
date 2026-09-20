# CB ScriptStore — update Raw, Save/Edit, dan Profil

Ganti `index.html`, `style.css`, dan `app.js` di repo dengan file dari paket ini. Tambahkan `raw.html`.

## Yang berubah
- Raw sekarang tanpa header/UI CB ScriptStore; halaman hanya menampilkan isi script.
- Simpan Script setelah Buat maupun Edit langsung kembali ke daftar Script (`#workspace`).
- Pilihan profil `profil1.png` sampai `profil5.png` langsung mengganti avatar setelah diklik dan disimpan ke Supabase.
- Pesan error pada alur simpan menyesuaikan bahasa situs (untuk bahasa Indonesia/Inggris).

## Penting
- Jangan mengganti `config.js` milik repo yang sudah berisi Supabase publishable/anon key.
- Tetap simpan `profil1.png` sampai `profil5.png` di root repo.
- Pastikan policy Supabase mengizinkan pembacaan script `public` untuk anon agar Raw dapat dibuka tanpa login.

## Catatan Raw
Karena GitHub Pages adalah hosting statis, `raw.html` mengambil script dari Supabase lalu menampilkannya sebagai teks polos. Ini membuat tampilan Raw tidak memiliki UI ScriptStore. Untuk URL yang benar-benar mengirim HTTP `Content-Type: text/plain` dan otomatis terunduh sebagai nama file asli, diperlukan endpoint server/Supabase Edge Function; GitHub Pages sendiri tidak bisa membuat response dinamis seperti itu.
