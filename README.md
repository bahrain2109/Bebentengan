# Benteng Kampung 3D
Bebentengan 3 lawan 3 untuk browser. Main sendiri melawan komputer, atau ajak 2–6 pemain dalam satu ruang. Kursi kosong diisi komputer. Seluruh aset grafis disertakan dalam proyek.

## Mulai dari komputer
1. Ekstrak ZIP. Buka terminal pada folder yang memuat `server.js`.
2. Dengan Node.js 22 atau lebih baru, jalankan `node server.js`. Tidak ada dependensi yang perlu diunduh.
3. Buka `http://localhost:3000`. Pilih **Play**, lalu **Lawan komputer** atau **Bareng teman**. Untuk langsung mencoba mode solo tanpa Node.js, buka `public/index.html` dari folder hasil ekstraksi.

## Ajak teman
1. Buka alamat server yang dapat diakses teman. Untuk Wi-Fi yang sama, gunakan IP lokal komputer host, misalnya `http://192.168.1.15:3000`. Ganti IP contoh dengan IP komputer kamu. Buka alamat tersebut juga di browser host agar tautan undangannya tepat. Alamat `localhost` hanya membuka perangkat yang sedang digunakan.
2. Tuan rumah memilih **Play → Bareng teman**, mengisi nama, memilih mode dan arena, lalu **Buat ruang**.
3. Bagikan **Salin tautan** atau kode enam karakter. Dari tautan, teman mengisi nama lalu mengetuk **Gabung**. Dari kode, teman membuka alamat server yang sama dan memilih **Bareng teman → Kode ruang → Gabung**.
4. Setelah dua pemain terhubung, tuan rumah dapat memulai pertandingan. Pemain pertama dan kedua masuk ke RT yang berlawanan. Kursi berikutnya diisi bergantian.
5. Jika koneksi putus, komputer mengambil alih sementara. Browser yang sama dapat kembali ke kursinya dalam 30 detik selama ruang masih tersedia. Tuan rumah yang keluar digantikan anggota lain. Jeda dan peta menghentikan waktu ketika bermain solo. Di ruang teman, pertandingan tetap berlangsung.

## Tiga cara bermain

| Mode | Aturan dan hasil |
| --- | --- |
| Klasik | Sentuh tiang sendiri untuk memperbarui panas. Saat dua lawan bersentuhan, pemain dengan sentuhan tiang lebih baru menawan lawannya. Jika sama, keduanya tetap bebas. Sentuh kawan yang tertawan agar ia bisa pulang ke tiang sendiri. Sentuh benteng lawan atau tawan seluruh tim lawan untuk mendapat angka. Tim pertama dengan 3 angka menang. Setelah 5 menit permainan aktif, skor tertinggi menang dan skor seimbang berarti seri. |
| Pertarungan Antar RT | Menangkan 2 set. Satu set berakhir ketika sebuah tim mendapat 2 angka atau 110 detik permainan aktif berlalu. Jika waktunya habis dengan skor seimbang, angka berikutnya memenangkan set. Gunakan bonus arena serta poin peningkatan stamina atau ketangkasan. Kemenangan memberi 25 RP, kekalahan mengurangi 12 RP, dengan batas bawah 0. Peringkat Perunggu dimulai dari 0 RP, Perak 90 RP dan Emas 180 RP. |
| Pulang Sebelum Magrib | Ikuti cincin emas pada peta, lewati 3 pos sesuai urutan, lalu pulang ke tiang sendiri. Batas 120 detik. Seluruh peserta dapat berlari bersamaan tanpa tangkap-menangkap. Hasil menampilkan waktu pribadi dan peserta tercepat yang sudah finis. Rekor pribadi disimpan per arena di browser. |

Pada mode komputer, tingkat **Santai**, **Seru**, dan **Jagoan** mengubah waktu reaksi lawan serta petunjuk panas. Dalam time trial, kesulitan memengaruhi penggunaan sprint komputer. Jalur dan batas waktunya tetap sama.

## Pilih rute
- **Kampung Sore.** Dekati kentongan di dua pos ronda untuk memulihkan hingga 22 energi. Dalam mode beregu, lawan dalam radius 18 meter dari kentongan terlihat selama 3,5 detik. Setiap kentongan perlu 15 detik sebelum bisa dipakai lagi.
- **Tepi Sawah.** Lumpur di jalur tengah dan petak sawah menyisakan 58% kecepatan. Saluran air dapat diseberangi melalui tiga jembatan. Saat dikejar, pertimbangkan jarak ekstra ke jembatan samping.
- **Gerobak Baso.** Pedagang dan pembeli berkumpul di deretan gerobak baso. Dua gerobak melintasi gang tengah. Tunggu celah atau putar lewat jalur di antara lapak.

**Kontrol:** WASD/panah untuk bergerak, Shift untuk sprint, M untuk denah, Esc untuk jeda. Spasi untuk dash di Pertarungan Antar RT dan Magrib. E untuk elak dan 1/2 untuk peningkatan saat Pertarungan Antar RT. Ponsel menggunakan joystick dan tombol layar. Di menu **Pengaturan**, pilih jarak kamera dan intensitas gerak.

## Deploy
Untuk Vercel, impor repositori dengan Root Directory `public`, Build Command `node build-vercel.cjs`, dan Output Directory `dist`. Isi `MULTIPLAYER_ORIGIN` dengan alamat HTTPS server permainan lalu bangun ulang untuk menghubungkan ruang teman. Panduan lengkap ada pada berkas 03_Panduan_Deploy_Vercel di paket pendaftaran.

Jalankan satu proses Node.js yang terus aktif dengan perintah `npm start` atau `node server.js`. Sajikan antarmuka dan API dari domain yang sama. Server membaca `PORT` (bawaan **3000**), `HOST` (bawaan **0.0.0.0**) dan `DATA_DIR` (bawaan folder **data**). Titik pemeriksaan kesehatan adalah `GET /health`.

Untuk container, jalankan dari folder proyek:

```sh
docker build -t benteng-kampung .
docker run -d --name benteng-kampung -p 3000:3000 -v benteng-rank:/app/data benteng-kampung
```

Untuk akses internet, arahkan domain HTTPS ke server. Jika memakai reverse proxy, teruskan header Host, gunakan X-Forwarded-Proto sesuai protokol asal, dan nonaktifkan buffering untuk `/api/events` agar pembaruan posisi langsung sampai ke pemain. Hosting khusus berkas statis hanya menjalankan mode komputer. Multiplayer membutuhkan proses Node di atas.

**Penyimpanan.** Ruang dan pertandingan aktif berada di memori dan berakhir jika server dimulai ulang. RP ruang teman disimpan di `DATA_DIR/rank.json` ketika Pertarungan Antar RT selesai. Gunakan volume persisten untuk folder tersebut. Profil ruang teman dikenali melalui cookie browser. RP solo dan rekor waktu memakai penyimpanan lokal browser. Menghapus data situs atau memakai profil browser berbeda akan memulai profil baru. Dua pemain pada satu komputer perlu profil browser yang terpisah.
