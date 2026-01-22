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

### One-Click Install (Recommended)

1. Open the `scripts` folder
2. Right-click `install-and-start.bat` → **"Run as administrator"**

This will **automatically**:
- Install Node.js (if not installed)
- Install PostgreSQL (if not installed)
- Start PostgreSQL service
- Create the database
- Install all dependencies
- Set up the database schema
- Create admin account
- Start the server

**Requirements**: Windows 10 (1709+) or Windows 11 with winget

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

Upload audiobooks from a local directory:

```bash
cd backend
npm run bulk-upload -- /path/to/audiobooks --email admin@test.com --password admin
```

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
```

## License

MIT
