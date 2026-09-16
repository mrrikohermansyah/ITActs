# ActLog — Activity Logger for IT Support

Aplikasi web pencatat aktivitas kerja IT Support/IT Engineer yang dibangun dengan HTML, CSS, JavaScript vanilla, Firebase Authentication, dan Firestore.

## Fitur utama

- Register dan login dengan email & password
- Reset password melalui email
- Mulai aktivitas real-time dengan timestamp otomatis
- Form detail aktivitas: Inventaris, Nama User, Lokasi, Kode Pengerjaan, Keterangan
- Status ongoing/completed
- Aplikasi feed riwayat dengan filter dan pencarian
- Data hanya terlihat milik user yang login
- Responsive untuk mobile dan desktop
- PWA installable dengan cache asset statis

## Struktur proyek

```text
Act/
├── index.html
├── style.css
├── app.js
├── auth.js
├── firestore.js
├── config.js
├── firestore.rules
├── manifest.json
├── service-worker.js
├── icon-192.svg
├── icon-512.svg
├── README.md
├── CNAME
└── .gitignore
```

## Asumsi yang diambil

- Versi awal ini hanya satu role user per akun, sesuai kebutuhan single-user / single-role.
- Durasi aktivitas ditampilkan dalam menit saja, sesuai permintaan.
- Penyimpanan lokasi dibuat dari array JavaScript di `config.js`, dengan opsi `OTHER LOCATION` untuk menambahkan manual jika diperlukan.
- `apiKey` Firebase untuk web bersifat publik; keamanan aplikasi ditangani oleh Firebase Auth dan Firestore Security Rules.
- Use-case ini fokus pada kebutuhan pencatatan aktivitas harian IT Support; belum ada fitur multi-tenant atau admin dashboard.

## Persiapan Firebase

1. Masuk ke console Firebase: https://console.firebase.google.com/
2. Klik Add project.
3. Beri nama project, lalu lanjutkan.
4. Matikan Google Analytics bila tidak dibutuhkan, lalu buat project.
5. Di sidebar, buka Build > Authentication.
6. Pilih tab Sign-in method.
7. Aktifkan Email/Password.
8. Buka Build > Firestore Database.
9. Klik Create database.
10. Pilih mode test atau production sesuai kebutuhan. Untuk tahap awal, `test mode` dapat dipakai sambil menyiapkan rules. Setelah aplikasi siap, ubah ke rules yang aman.

## Konfigurasi Firebase di project

1. Buka Project settings.
2. Pilih Web app > Register app.
3. Copy konfigurasi Firebase seperti `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
4. Tempatkan ke file `config.js`.
5. Ubah `firebaseConfig` sesuai nilai project Anda.

Contoh:

```js
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef123456'
};
```

## Firestore Security Rules

File `firestore.rules` membatasi akses ke dokumen milik user yang sedang login,
mengunci `userId` dan `startedAt`, membatasi field/type/ukuran data, serta hanya
mengizinkan transisi status dari `ongoing` ke `completed` atau `cancelled`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function validActivity(data) {
      return data.keys().hasOnly([
          'userId', 'inventoryCode', 'userName', 'location', 'workCode',
          'remarks', 'startedAt', 'endedAt', 'durationMinutes', 'status'
        ])
        && data.userId is string
        && data.userId == request.auth.uid
        && data.inventoryCode is string && data.inventoryCode.size() <= 50
        && data.userName is string && data.userName.size() <= 80
        && data.location is string && data.location.size() <= 80
        && data.workCode is string && data.workCode.size() <= 32
        && data.remarks is string && data.remarks.size() <= 2000
        && data.startedAt is timestamp
        && (data.endedAt == null || data.endedAt is timestamp)
        && (data.durationMinutes == null
          || (data.durationMinutes is int && data.durationMinutes >= 0))
        && data.status in ['ongoing', 'completed', 'cancelled'];
    }

    match /activities/{activityId} {
      allow create: if signedIn()
        && validActivity(request.resource.data)
        && request.resource.data.status == 'ongoing'
        && request.resource.data.endedAt == null
        && request.resource.data.durationMinutes == null;

      allow get, list: if signedIn()
        && resource.data.userId == request.auth.uid;

      allow update: if signedIn()
        && resource.data.userId == request.auth.uid
        && validActivity(request.resource.data)
        && request.resource.data.userId == resource.data.userId
        && request.resource.data.startedAt == resource.data.startedAt
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'inventoryCode', 'userName', 'location', 'workCode', 'remarks',
          'endedAt', 'durationMinutes', 'status'
        ])
        && ((resource.data.status == 'ongoing'
          && (request.resource.data.status == resource.data.status
            || request.resource.data.status in ['completed', 'cancelled']))
          || (resource.data.status in ['completed', 'cancelled']
            && request.resource.data.diff(resource.data).affectedKeys().size() == 0))
        && (request.resource.data.status == 'ongoing'
          || (request.resource.data.endedAt is timestamp
            && request.resource.data.durationMinutes is int));

      allow delete: if signedIn()
        && resource.data.userId == request.auth.uid;
    }
  }
}
```

Cara publish rules:

1. Buka Firebase Console > Firestore Database > Rules.
2. Salin isi `firestore.rules`.
3. Klik Publish.

## Deployment ke GitHub Pages

Karena aplikasi ini murni static, tidak ada build step. Langkahnya:

1. Buat repository GitHub baru (public atau private).
2. Upload semua file ke branch `main` atau `gh-pages`.
3. Pastikan file utama seperti `index.html`, `style.css`, `app.js`, dll ada di root repo.
4. Buka repository GitHub > Settings > Pages.
5. Pilih Source: Deploy from a branch.
6. Branch: `main` atau `gh-pages`.
7. Folder: `/root`.
8. Simpan dan tunggu proses deployment selesai.
9. GitHub Pages akan memberi URL seperti:
   - `https://username.github.io/nama-repo/`

### PWA

`manifest.json` dan `service-worker.js` berada di root dan memakai `./` sebagai
`start_url` serta `scope`, sehingga kompatibel dengan custom domain maupun
GitHub Pages subpath. Service worker hanya menangani request GET same-origin
untuk asset aplikasi. Request Firebase Authentication, Firestore, dan Firebase
CDN tidak dicache secara manual.

Cache asset menggunakan versi seperti `actlog-static-v1`. Saat merilis perubahan,
naikkan `CACHE_VERSION` di `service-worker.js` ke versi berikutnya. Cache versi
lama dibersihkan ketika worker baru aktif. Deployment PWA membutuhkan HTTPS;
`localhost` dapat digunakan untuk testing lokal.

## Custom domain dari Hostinger

### 1. Siapkan domain di GitHub Pages

Di repo, buat file `CNAME` dengan isi:

```text
act.mydomain.com
```

Pastikan nama domain yang Anda pakai sesuai custom domain Anda.

### 2. DNS di Hostinger

Di panel DNS Hostinger, tambahkan salah satu dari berikut sesuai kebutuhan:

- Jika pakai A record: arahkan ke IP GitHub Pages:
  - 185.199.108.153
  - 185.199.109.153
  - 185.199.110.153
  - 185.199.111.153

- Jika pakai CNAME: arahkan `www` ke `username.github.io`

Contoh:

```text
A @ -> 185.199.108.153
A @ -> 185.199.109.153
A @ -> 185.199.110.153
A @ -> 185.199.111.153
CNAME www -> username.github.io
```

Anda juga dapat memakai satu A record untuk apex domain dan satu CNAME untuk subdomain `www` sesuai kebutuhan.

### 3. Set custom domain di GitHub Pages

Pada Settings > Pages, masukkan custom domain Anda, misalnya:

```text
act.mydomain.com
```

Setelah validasi DNS selesai, GitHub Pages akan mengaktifkan custom domain.

## Authorized Domains di Firebase Authentication

Agar login tetap berfungsi setelah custom domain aktif, tambahkan domain tersebut ke Firebase Authentication.

Cara:

1. Buka Firebase Console > Authentication > Settings > Authorized domains.
2. Tambahkan domain custom Anda, misalnya `act.mydomain.com`.
3. Jika ada `www.act.mydomain.com`, tambahkan juga bila dibutuhkan.
4. Simpan.

## Catatan penting tentang keamanan

- `apiKey` Firebase untuk web memang publik, karena ini diperlukan browser untuk berkomunikasi dengan Firebase.
- Keamanan aplikasi tidak bergantung pada API key, melainkan pada Firebase Authentication dan Firestore Security Rules.
- Untuk produksi, selalu gunakan rules yang membatasi user hanya bisa mengakses data mereka sendiri.

## Penyesuaian lanjut

Anda bisa menambahkan fitur berikut nanti:

- Tombol edit aktivitas
- Export CSV
- Dashboard statistik per bulan
- Kalender kerja
- Multi-user dengan role admin / technician
- Fitur upload foto / dokumentasi

## Saran eksekusi live

1. Siapkan project Firebase dan set konfigurasi.
2. Publish rules Firestore.
3. Upload file ke GitHub repo.
4. Aktifkan GitHub Pages.
5. Set custom domain Hostinger.
6. Tambahkan domain ke authorized domains Firebase.
7. Uji login dan mulai aktivitas di domain live.

## Legal / Troubleshooting umum

- Jika login gagal saat custom domain aktif, cek Authorized Domains di Firebase.
- Jika data tidak muncul, cek Firestore rules dan pastikan user sudah login.
- Jika halaman blank, cek console browser dan pastikan konfigurasi Firebase sudah benar.
- Jika import module error, pastikan semua file JS menggunakan path relatif yang benar dan server web mengizinkan module ES.

## Catatan deployment free tier

Semua komponen di bawah ini tetap dalam batas free tier:

- Firebase Spark / Free plan
- GitHub Pages gratis
- Hostinger hanya dipakai untuk DNS domain

Untuk aplikasi static seperti ini, ini adalah pendekatan paling sederhana dan hemat biaya.
