CB ScriptStore — FINAL UPDATE

1. Raw benar-benar mengembalikan isi script sebagai text/plain.
   Contoh jika code = fly dan filename = fly.lua, Raw akan berisi tepat:
   fly
   dan nama file yang digunakan adalah fly.lua.

2. Raw lama raw.html?id=... otomatis diarahkan ke Edge Function.
   Raw baru:
   https://zpomypkasmmiozandzlv.supabase.co/functions/v1/raw-script?id=ID_SCRIPT

3. Deploy Edge Function:
   Nama function: raw-script
   File: supabase/functions/raw-script/index.ts
   Endpoint harus bisa diakses publik. Jangan masukkan service-role key ke GitHub.

4. Menu garis 3 sekarang memiliki Statistik Website.
   Menampilkan Total Kunjungan, Total Terdaftar, Online Sekarang, dan Grafik Kunjungan 7 hari.

5. Profil:
   Pilih profil1.png sampai profil5.png. Pilihan disimpan ke Supabase profiles.avatar_url,
   jadi tetap setelah logout/login dan di perangkat lain.

6. Pastikan file profil1.png, profil2.png, profil3.png, profil4.png, profil5.png ada di GitHub Pages.
   Jangan hapus gambar profil yang sudah kamu punya.

7. Setelah update, jalankan SQL di supabase.sql bila tabel site_visits/presence/profiles belum dibuat.
