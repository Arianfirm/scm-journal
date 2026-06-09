# SCM Journal — Work Journal & Progress Tracker

Aplikasi pencatatan kerja harian dengan fitur task management, progress proyek, blocker tracker, timeline kegiatan, dan statistik mingguan. Desain premium dengan sidebar dark navy dan aksen rose pink.

## Tech Stack

- React 19 + TypeScript
- lucide-react — icons
- date-fns — manipulasi tanggal (Bahasa Indonesia)
- Chart.js — donut chart & line chart
- CSS murni — tanpa Tailwind
- localStorage — penyimpanan data lokal

## Fitur Halaman

| Halaman | Fungsi |
|---|---|
| Dashboard | Overview lengkap: metric cards, chart, blocker, daily plan, timeline, weekly summary |
| Daily Plan | Tambah & kelola tugas harian, filter by status |
| Progress Update | Update status task & slider progress proyek |
| Timeline | Catat & lihat aktivitas harian dengan kategori |
| Projects | Manajemen proyek dengan progress slider |
| Weekly Summary | Statistik mingguan + line chart trend |
| Reports | Distribusi mood & status blocker keseluruhan |
| Calendar | Kalender bulanan dengan dot marker entri |
| Blockers | Laporkan & resolve hambatan proyek |
| Settings | Edit nama, jabatan, dan target harian |

## Cara Jalankan Lokal

```bash
npm install
npm start
```

Buka [http://localhost:3000](http://localhost:3000)

## Deploy ke Vercel

### Opsi 1 — Via Vercel CLI (Rekomendasi)

```bash
# Install Vercel CLI
npm install -g vercel

# Login ke akun Vercel
vercel login

# Deploy dari folder project
vercel

# Deploy production
vercel --prod
```

### Opsi 2 — Via GitHub + Vercel Dashboard

1. Push repo ke GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: SCM Journal"
   git remote add origin https://github.com/USERNAME/scm-journal.git
   git push -u origin main
   ```

2. Buka [vercel.com/new](https://vercel.com/new)
3. Import repository dari GitHub
4. Setting build (sudah auto-detect CRA):
   - **Framework Preset:** Create React App
   - **Build Command:** `npm run build`
   - **Output Directory:** `build`
5. Klik **Deploy**

### Opsi 3 — Deploy Langsung dari Folder Build

```bash
# Build dulu
npm run build

# Deploy folder build ke Vercel
npx vercel build/
```

## Konfigurasi Vercel

File `vercel.json` sudah dikonfigurasi untuk SPA routing:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## Data

Semua data tersimpan di `localStorage` browser — tidak ada backend/database. Data akan hilang jika browser cache dibersihkan.

### Keys localStorage

| Key | Isi |
|---|---|
| `scm_entries` | Array entri jurnal harian |
| `scm_projects` | Array data proyek |
| `scm_blockers` | Array blocker/hambatan |
| `scm_settings` | Nama, jabatan, target harian |
