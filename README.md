# Audiobook Platform

A full-stack audiobook management and playing platform with PWA support.

## Features

- 📚 Audiobook management with episode support
- 🎵 Book-based playback with instant resume
- 🔄 Cross-device sync
- 👶 Kid/Adult content filtering
- 🔐 JWT authentication with 6-month session
- 📱 PWA with background playback (Media Session API)
- 👨‍💼 Admin dashboard for content management
- 🖥️ Windows 11 deployment ready

## Tech Stack

### Backend
- Node.js 18 + Express + TypeScript
- PostgreSQL
- Local file storage
- JWT auth with refresh tokens

### Frontend
- React 18 + TypeScript + Vite
- Zustand for state management
- Tailwind CSS
- IndexedDB for offline storage
- Media Session API

## Quick Start (Windows 11)

### Prerequisites

Install these first (the install script assumes they are already installed):
- [Node.js 18+](https://nodejs.org/) (LTS version)
- [PostgreSQL 14+](https://www.postgresql.org/download/windows/) (remember your password!)

### One-Click Install

1. Install Node.js and PostgreSQL first
2. Open the `scripts` folder
3. Double-click `install-and-start.bat`

This will:
- Install all dependencies
- Set up the database schema
- Create admin account
- Start the server

### Default Credentials
- **URL**: http://localhost:8081
- **Admin Email**: admin@test.com
- **Admin Password**: admin

## Server Management

| Script | Description |
|--------|-------------|
| `scripts/install-and-start.bat` | Full installation + start |
| `scripts/start-server.bat` | Start server |
| `scripts/stop-server.bat` | Stop server |
| `scripts/restart-server.bat` | Restart server |
| `scripts/setup-autostart.bat` | Auto-start on Windows boot |

## Manual Setup

### Backend

```bash
cd backend
npm install
npm run reset-db
npm run create-admin -- --email admin@test.com --password admin
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/audiobookshelf
JWT_SECRET=your-secret-key
PORT=8081
USE_LOCAL_STORAGE=true
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:8081/api
```

## Project Structure

```
audiobookshelf/
├── backend/           # Express API
├── frontend/          # React PWA
├── scripts/           # Windows batch files
├── docs/              # Documentation
└── logs/              # Server logs
```

## Deployment

See [Windows Deployment Guide](./docs/WINDOWS-DEPLOYMENT.md) for:
- Detailed installation steps
- Auto-start configuration
- Exposing to public internet (Cloudflare Tunnel, Tailscale, etc.)
- Troubleshooting

## Bulk Upload

Ingest audiobooks from a local directory. Files are moved directly into storage — no HTTP upload needed.

```bash
cd backend

# Basic ingest (moves files into storage + inserts DB records):
npm run bulk-upload -- --path=/path/to/audiobooks

# Windows PowerShell example:
npm run bulk-upload -- --path="H:\audiobooks\kids" --type=kids

# Dry run (preview without making changes):
npm run bulk-upload -- --path=./audiobooks --dry-run

# Keep source files (copy instead of move):
npm run bulk-upload -- --path=./audiobooks --keep

# Upload to a specific storage location:
npm run bulk-upload -- --path=./audiobooks --storage=<uuid>
```

Options:
| Option | Description | Default |
|--------|-------------|---------|
| `--path=<dir>` | Root directory containing audiobook folders | (required) |
| `--type=<adult\|kids>` | Book type | `adult` |
| `--storage=<id>` | Storage config ID (see below) | default storage |
| `--dry-run` | Preview without making changes | `false` |
| `--keep` | Copy files instead of moving | `false` |

Directory structure:
```
audiobooks/
├── Book Title 1/
│   ├── 01-episode-one.mp3
│   ├── 02-episode-two.mp3
│   └── cover.jpg
└── Book Title 2/
    └── ...
```

Audio files are sorted by embedded numbers (e.g. `图书 001 xx播讲.mp3`, `图书 002 xx播讲.mp3`).

### Getting a Storage Config ID

To upload to a specific storage location, you need its config ID. You can find it via:

**Option 1 — API** (requires admin login):
```bash
curl -H "Authorization: Bearer <token>" http://localhost:8081/api/admin/storage/locations
```

**Option 2 — Database**:
```sql
SELECT id, name, container_name FROM storage_configs WHERE is_active = true;
```

If `--storage` is omitted, files are stored in the default storage location (`backend/storage/`).

Requires `DATABASE_URL` in `backend/.env` (no API server needed).

## Dead Data Cleanup

When uploads fail mid-way (e.g. network errors), audiobook files may be left on disk without a matching database record. Use the cleanup script to find and remove them:

```bash
cd backend

# Scan and delete dead data from all storage locations:
npm run cleanup-dead-data

# Preview only (no deletion):
npm run cleanup-dead-data -- --dry-run

# JSON output:
npm run cleanup-dead-data -- --json
```

## API Endpoints

### Authentication
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

### Books
```
GET  /api/books
GET  /api/books/:id
GET  /api/books/:id/episodes/:index/url
```

### History
```
GET  /api/history
POST /api/history/sync
```

### Admin
```
POST   /api/admin/books
DELETE /api/admin/books/:id
GET    /api/admin/users
GET    /api/admin/storage/locations
```

## License

MIT
