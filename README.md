# Audiobook Platform

A full-stack audiobook management and playing platform with PWA support.

## Features

- 📚 Multi-storage audiobook management (Azure Blob Storage)
- 🎵 Book-based playback with instant resume
- 🔄 Cross-device sync
- 👶 Kid/Adult content filtering
- 🔐 JWT authentication
- 📱 PWA with background playback (Media Session API)
- 👨‍💼 Admin dashboard for content management
- ☁️ One-click Azure deployment

## Tech Stack

### Backend
- Node.js 18 + Express + TypeScript
- PostgreSQL (Azure Flexible Server)
- Azure Blob Storage
- JWT auth with refresh tokens

### Frontend
- React 18 + TypeScript + Vite
- Zustand for state management
- Tailwind CSS
- IndexedDB for offline storage
- Media Session API

### Infrastructure
- Azure App Service
- Azure Bicep templates
- GitHub Actions CI/CD

## Quick Start

### Prerequisites
- Node.js 18+
- Azure CLI
- PostgreSQL (local or Azure)

### Installation

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Development

```bash
# Start backend (terminal 1)
cd backend
npm run dev

# Start frontend (terminal 2)
cd frontend
npm run dev
```

### Environment Variables

#### Backend (.env)
```
NODE_ENV=development
PORT=8080
DATABASE_URL=postgresql://user:pass@localhost:5432/audiobook
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
ENCRYPTION_KEY=your-encryption-key
```

#### Frontend (.env)
```
VITE_API_URL=http://localhost:8080
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

Quick deploy to Azure:
```bash
./deploy.sh prod
```

## Project Structure

```
audiobook-platform/
├── backend/           # Express API
├── frontend/          # React PWA
├── infrastructure/    # Bicep templates
└── .github/          # CI/CD workflows
```

## License

MIT
