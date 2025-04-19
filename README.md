# YouTube Scraper API using yt-dlp

API sederhana untuk scraping data YouTube (Video, Komentar, Playlist, Info Channel) menggunakan yt-dlp tanpa memerlukan YouTube Data API Key.

**Perhatian:** Scraping dapat melanggar TOS YouTube dan menyebabkan pemblokiran IP. Gunakan secara bertanggung jawab. Data komentar dan balasan mungkin tidak lengkap/akurat.

## Fitur

-   `/video/:videoId`: Mendapatkan detail video (judul, deskripsi, like, tanggal upload, channel) dan komentar tingkat atas (jika tersedia).
-   `/comments/:videoId`: Mencoba mendapatkan lebih banyak komentar untuk video (tetap terbatas).
-   `/playlist/:playlistId`: Mendapatkan daftar video dalam sebuah playlist (ID, judul).
-   `/channel/:channelId/playlists`: Mendapatkan daftar playlist yang dibuat oleh channel (berdasarkan ID channel UC... atau nama kustom).
-   `/channel/:channelId/info`: Mendapatkan informasi dasar channel (nama, ID, dll).

## Setup & Deployment

### A. Vercel (Recommended for Public URL)

1.  **Prasyarat:** Akun Vercel (gratis), Git, Node.js & npm terinstall di lokal.
2.  **Clone Repository:**
    ```bash
    git clone <url-repo-anda>
    cd <nama-folder-repo>
    ```
3.  **Letakkan file:** Pastikan file `server.js`, `package.json`, dan `vercel.json` ada di root project Anda.
4.  **Install Vercel CLI (opsional tapi membantu):**
    ```bash
    npm install -g vercel
    ```
5.  **Deploy:**
    -   **Via CLI:** Jalankan `vercel` di terminal dalam folder project dan ikuti petunjuk.
    -   **Via GitHub/GitLab/Bitbucket:** Push kode ke repository Git Anda, lalu import project tersebut di dashboard Vercel.

6.  **Proses Build:** Vercel akan menjalankan `npm run build` (yang mendownload `yt-dlp`) dan `npm start`.
7.  **Akses API:** Vercel akan memberikan URL publik (contoh: `https://nama-proyek-anda.vercel.app`). Anda dapat mengakses endpoint seperti `https://nama-proyek-anda.vercel.app/video/VIDEO_ID`.

### B. Termux (for Local/Mobile Use)

1.  **Install Dependensi:**
    ```bash
    pkg update && pkg upgrade
    pkg install nodejs-lts git python ffmpeg # ffmpeg terkadang dibutuhkan oleh yt-dlp
    pip install yt-dlp # Install yt-dlp via pip
    ```
2.  **Clone Repository:**
    ```bash
    git clone https://github.com/ZetaGo-Aurum/yt-dl-API.git
    cd yt-dl-API
    ```
3.  **Install Node Modules:**
    ```bash
    npm install
    ```
4.  **Jalankan Server:**
    ```bash
    node server.js
    ```
5.  **Akses API:** Server akan berjalan di `http://localhost:3000`. Anda bisa mengaksesnya dari browser di perangkat yang sama atau menggunakan `curl` di Termux:
    ```bash
    curl http://localhost:3000/video/VIDEO_ID
    ```
    Jika Anda perlu mengaksesnya dari perangkat lain di jaringan yang sama, gunakan IP lokal perangkat Termux Anda (misal `http://192.168.1.X:3000`). Untuk akses publik dari Termux, Anda memerlukan tool seperti `ngrok`.

## Struktur Respons API

Semua respons yang berhasil akan memiliki format:

```json
{
  "success": true,
  "data": { ... data yang di-scrape ... }
}
