# CB ScriptStore — Statistik & Raw Update

Versi ini menghapus tampilan Global Chat dan menambahkan:
- statistik total kunjungan, total akun terdaftar, dan online sekarang;
- grafik kunjungan 7 hari;
- Raw publik tanpa login untuk script dengan visibility `public`;
- edit script lalu kembali ke daftar script setelah disimpan;
- pilihan foto profil `profil1.png` sampai `profil5.png`.

## Penting saat upload ke GitHub
Pertahankan `config.js` milik project kamu yang sudah berisi Supabase publishable/anon key.
Pertahankan juga `profil1.png` sampai `profil5.png` yang sudah ada di repository.

Jalankan isi `supabase.sql` di Supabase SQL Editor sekali untuk membuat tabel/policy statistik dan profil.
