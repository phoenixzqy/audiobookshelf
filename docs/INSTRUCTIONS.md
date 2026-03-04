# Audiobookshelf - AI Assistant Instructions

> This is the single source of truth for AI coding assistant instructions.
> Referenced by `CLAUDE.md` and `.github/copilot-instructions.md`.

## Project Overview

Full-stack audiobook streaming app with:
- **Frontend**: React + Vite + TypeScript + PWA (served from GitHub Pages)
- **Backend**: Express + TypeScript + PostgreSQL (served via Cloudflare Tunnel)
- **Storage**: Azure Blob Storage (production) or local filesystem (dev)
- **Mobile**: Capacitor-wrapped hybrid apps for Android and iOS

## Supported Platforms

| Platform | Technology | Status |
|----------|------------|--------|
| Web | PWA (GitHub Pages) | Production |
| Android | Capacitor | Ready |
| iOS | Capacitor | Ready |
| HarmonyOS | WebView wrapper | Planned |

## Architecture

### Server Deployment

The backend runs on a **Windows personal PC** (always-on) exposed to the internet via Cloudflare Tunnel:

- **Host**: Windows PC running Node.js backend + PostgreSQL
- **Exposure**: `cloudflared` creates a tunnel, generating a public URL (`https://xxx.trycloudflare.com`)
- **LAN access**: Devices on the same network can connect directly via LAN IP (e.g., `http://192.168.1.100:8081`), bypassing the tunnel for lower latency
- **Scripts**: `scripts/restart-server.bat` manages the backend process; `scripts/start-cloudflare-tunneling.bat` starts the tunnel and updates `config.js`
- **Logs**: Backend logs are written to `./logs/` directory
- **Audio storage**: Audio files stored locally on the PC's filesystem (or Azure Blob Storage)

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Pages (Frontend)                       │
│         https://phoenixzqy.github.io/audiobookshelf/            │
│                                                                  │
│   index.html ←── config.js ←── Defines window.AUDIOBOOKSHELF_CONFIG
│                      ↓                with tunnelUrl + localUrl
│   appConfig.ts ──────┘
│        ↓
│   getApiBaseUrl() → tries localUrl first, falls back to tunnelUrl
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ API calls (LAN-first strategy)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│            Windows Personal PC (Backend Server)                  │
│                                                                  │
│   Node.js (Express) ← PostgreSQL                                │
│   Port 8081                                                      │
│                                                                  │
│   LAN:    http://192.168.x.x:8081  (direct, low latency)       │
│   Tunnel: https://xxx.trycloudflare.com  (external access)     │
│                                                                  │
│   /api/*     → Express REST endpoints                           │
│   /storage/* → Audio files, cover images                        │
└─────────────────────────────────────────────────────────────────┘
```

## Critical: config.js System

The `config.js` file bridges the static frontend to the dynamic backend:

**Location**: `github-pages/audiobookshelf/config.js` (production) or `frontend/public/audiobookshelf/config.js` (dev)

```javascript
window.AUDIOBOOKSHELF_CONFIG = {
  tunnelUrl: 'https://xxx.trycloudflare.com',  // Backend URL
  localUrl: 'http://192.168.1.100:8081',       // LAN backend URL (optional)
  lastUpdated: '2026-01-25 10:00:00'
};
```

**How it works**:
1. Frontend loads `config.js` via script tag in index.html
2. `frontend/src/config/appConfig.ts` reads `window.AUDIOBOOKSHELF_CONFIG`
3. `getApiBaseUrl()` returns `tunnelUrl + '/api'` for production, or `/api` for local dev
4. All API calls use this base URL via axios client

**IMPORTANT**: When generating URLs for API calls or audio streaming:
- Always use `getApiBaseUrl()` from `frontend/src/config/appConfig.ts`
- Never hardcode `localhost:8081` - it won't work in production
- For local storage URLs containing `/storage/`, use the stream endpoint pattern

## Deployment Flow

1. Push to `main` branch
2. GitHub Actions (`deploy-pages.yml`) triggers:
   - Backs up `config.js` (preserves tunnel URL)
   - Builds frontend with Vite
   - Restores `config.js`
   - Deploys to `phoenixzqy.github.io` repo
3. Frontend live at `https://phoenixzqy.github.io/audiobookshelf/`

**Tunnel URL updates**:
- Run `scripts/start-cloudflare-tunneling.bat` (Windows) or `scripts/start-tunnel.sh` (macOS/Linux)
- Script auto-generates new `config.js` with tunnel URL
- Commits and pushes to trigger rebuild

## Project Structure

```
audiobookshelf/
├── frontend/                      # React app (shared code)
│   ├── src/
│   │   ├── config/appConfig.ts   # Runtime config loader
│   │   ├── api/client.ts         # Axios client with auth
│   │   ├── stores/               # Zustand state management
│   │   ├── services/             # Business logic
│   │   │   └── platformService.ts # Platform detection
│   │   ├── capacitor/init.ts     # Capacitor initialization
│   │   ├── components/           # React components
│   │   └── pages/                # Route pages
│   ├── android/                   # Android native project
│   ├── ios/                       # iOS native project
│   ├── scripts/                   # Build scripts
│   ├── capacitor.config.ts       # Capacitor configuration
│   └── vite.config.ts            # Build config
├── backend/                       # Express API
│   ├── src/
│   │   ├── app.ts                # Express app with CORS
│   │   ├── controllers/          # Request handlers
│   │   ├── services/             # Business logic
│   │   └── routes/               # API routes
│   └── storage/                   # Local audio files (dev)
├── github-pages/audiobookshelf/   # Production web build output
│   └── config.js                  # Auto-generated tunnel config
├── docs/                          # Documentation
│   ├── INSTRUCTIONS.md            # AI assistant instructions (this file)
│   ├── DEVELOPMENT.md             # Development guide
│   ├── MOBILE_BUILD.md            # Mobile build guide
│   └── RELEASE.md                 # Release process
├── scripts/                       # Root deployment scripts
│   ├── restart-server.bat        # Restart backend server
│   ├── start-server.bat          # Start backend server
│   ├── stop-server.bat           # Stop backend server
│   └── start-cloudflare-tunneling.bat  # Tunnel startup + config update
├── CLAUDE.md                      # → Points to docs/INSTRUCTIONS.md
└── .github/copilot-instructions.md # → Points to docs/INSTRUCTIONS.md
```

## Coding Standards

### File Size Limits (Atomic Architecture)

- **Components**: Max 200 lines. Extract sub-components if larger.
- **Services**: Max 300 lines. Split into focused modules.
- **Stores**: Max 250 lines. Use slices for complex state.
- **Utilities**: Max 100 lines per utility file.

### When to Split Files

- File exceeds line limits above
- Component has multiple logical sections
- Service handles unrelated concerns
- More than 3 levels of nesting

### Naming Conventions

- Components: PascalCase (`PlayerControls.tsx`)
- Services: camelCase (`episodeUrlCache.ts`)
- Stores: camelCase with Store suffix (`playerStore.ts`)
- Types: PascalCase, grouped in `types/` or co-located

### Import Order

1. React/external libraries
2. Internal stores
3. Internal services
4. Internal components
5. Types
6. Styles

## Key Files Reference

| Purpose | File |
|---------|------|
| API base URL | `frontend/src/config/appConfig.ts` |
| HTTP client | `frontend/src/api/client.ts` |
| Player state | `frontend/src/stores/playerStore.ts` |
| Audio context | `frontend/src/contexts/AudioPlayerContext.tsx` |
| Episode caching | `frontend/src/services/episodeUrlCache.ts` |
| Platform detection | `frontend/src/services/platformService.ts` |
| Capacitor init | `frontend/src/capacitor/init.ts` |
| Capacitor config | `frontend/capacitor.config.ts` |
| IndexedDB | `frontend/src/services/indexedDB.ts` |
| Network detection | `frontend/src/services/networkService.ts` |
| Network state | `frontend/src/stores/networkStore.ts` |
| API response cache | `frontend/src/services/apiCacheService.ts` |
| Cover image cache | `frontend/src/services/coverCacheService.ts` |
| Download service | `frontend/src/services/downloadService.ts` |
| Download state | `frontend/src/stores/downloadStore.ts` |
| History sync | `frontend/src/services/historySyncService.ts` |
| Download prefetch | `frontend/src/services/downloadPrefetchService.ts` |
| Download types | `frontend/src/types/download.ts` |
| CORS config | `backend/src/app.ts` |
| Book routes | `backend/src/routes/books.ts` |
| Web deployment | `.github/workflows/deploy-pages.yml` |
| Mobile builds | `.github/workflows/mobile-release.yml` |
| Storage rebuild logic | `backend/src/services/storageRebuildService.ts` |
| List storage script | `backend/src/scripts/list-storage.ts` |
| Rebuild from storage | `backend/src/scripts/rebuild-from-storage.ts` |

## Common Commands

```bash
# Development
npm run dev:frontend     # Start Vite dev server (port 5173)
npm run dev:backend      # Start Express server (port 8081)

# Web Building
npm run build:frontend   # Build to github-pages/audiobookshelf/

# Mobile Building
cd frontend
VITE_BUILD_TARGET=mobile npm run build  # Build for Capacitor
npx cap sync                             # Sync to native projects
npx cap open android                     # Open Android Studio
npx cap open ios                         # Open Xcode
./scripts/build-android.sh release       # Build release APK

# Database
npm run create-admin     # Create admin user
npm run migrate          # Run DB migrations

# Storage Inspection & Recovery
cd backend
npx tsx src/scripts/list-storage.ts --path="E:\audiobookshelf"              # List books on disk (no DB needed)
npx tsx src/scripts/list-storage.ts --path="E:\audiobookshelf" --verbose    # Show individual files
npx tsx src/scripts/list-storage.ts --path="E:\audiobookshelf" --json       # JSON output
npx tsx src/scripts/rebuild-from-storage.ts --path="E:\audiobookshelf" --dry-run  # Preview rebuild
npx tsx src/scripts/rebuild-from-storage.ts --path="E:\audiobookshelf"            # Rebuild DB records
npx tsx src/scripts/rebuild-from-storage.ts --path="E:\audiobookshelf" --type=kids # Set book type

# Deployment
./scripts/start-tunnel.sh  # Start Cloudflare tunnel (updates config.js)
git tag v1.0.0 && git push origin v1.0.0  # Trigger mobile release
```

## URL Patterns

| Environment | Frontend | API Base |
|-------------|----------|----------|
| Local Dev | `localhost:5173/audiobookshelf/` | `/api` (Vite proxy) |
| Production (LAN) | `phoenixzqy.github.io/audiobookshelf/` | `{localUrl}/api` |
| Production (External) | `phoenixzqy.github.io/audiobookshelf/` | `{tunnelUrl}/api` |

## Audio URL Handling

For local storage (URLs containing `/storage/`), convert to stream endpoint:

```typescript
const streamUrl = `${getApiBaseUrl()}/books/${bookId}/episodes/${index}/stream`;
const finalUrl = `${streamUrl}?token=${accessToken}`;
```

For Azure SAS URLs, use directly as returned from API.

## Episode URL Caching System

The app uses a two-tier caching system for episode URLs to enable background playback:

- **Memory cache**: Fast access during playback (survives component renders)
- **IndexedDB**: Persistent storage (survives page reloads)

Batches of 100 episode URLs are prefetched when:
- A book is loaded
- Approaching batch boundary (episode 90+ in current batch)

URLs are converted at retrieval time (not storage time) to ensure fresh auth tokens.

## Offline Support & Download Manager

### Architecture

The app supports offline usage with a multi-layer approach:

1. **Network Detection** (`networkService.ts` + `networkStore.ts`):
   - Tracks online/offline via `navigator.onLine` + events
   - Detects WiFi vs cellular via Network Information API
   - Periodic health pings to backend

2. **API Cache** (`apiCacheService.ts` + axios interceptors in `client.ts`):
   - IndexedDB-backed response cache with TTL per endpoint
   - Online: network-first (cache updates on success)
   - Offline: cache-only (returns cached data or rejects)
   - Skips: auth endpoints, POST/PUT/DELETE, streaming

3. **Cover Cache** (`coverCacheService.ts`):
   - Caches book cover images as blobs in IndexedDB
   - Transparent caching via `CachedImage` component

4. **Offline History Queue** (IndexedDB `history-queue` store):
   - Queues playback progress updates when offline
   - `historySyncService.ts` merges queue on reconnect
   - Conflict resolution: latest timestamp wins

5. **Download Manager** (Android native only):
   - `downloadService.ts`: queue-based with 2 concurrent downloads
   - `@capacitor/filesystem` for native file I/O
   - Files stored at `audiobooks/{bookId}/{episodeIndex}.{ext}` in Directory.Data
   - `downloadPrefetchService.ts`: auto-downloads next episodes on WiFi
   - `downloadStore.ts`: reactive state for UI

6. **Local-First Playback**:
   - `playerStore.fetchEpisodeUrl()` checks local downloads before cache/API
   - `audioSource: 'local' | 'stream'` state field indicates source
   - UI indicators: 📱 local, 🌐 streaming

### IndexedDB Stores (v3)

| Store | Purpose |
|-------|---------|
| `history` | Playback history |
| `books` | Book data |
| `auth` | Authentication tokens |
| `episode-urls` | Cached episode URLs |
| `api-cache` | Cached API responses |
| `cached-covers` | Cached cover image blobs |
| `downloads` | Downloaded episode metadata |
| `download-tasks` | Download queue/progress |
| `history-queue` | Offline history entries |

## Code Patterns

### API Calls
```typescript
// CORRECT - use getApiBaseUrl()
import { getApiBaseUrl } from '../config/appConfig';
const url = `${getApiBaseUrl()}/books/${bookId}`;

// WRONG - never hardcode
const url = `http://localhost:8081/api/books/${bookId}`;
```

### State Management (Zustand)
```typescript
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useNetworkStore } from '../stores/networkStore';
import { useDownloadStore } from '../stores/downloadStore';
```

### Background Playback with Refs
```typescript
// Use refs to avoid stale closures in event handlers
const bookRef = useRef(book);
useEffect(() => { bookRef.current = book; }, [book]);

// In event handler, use refs not closure values
const handleEnded = () => {
  const currentBook = bookRef.current;  // Fresh value
};
```

### Synchronous Play (Mobile WebView)
```typescript
// audio.play() MUST be called synchronously within user gesture
// Any await before play() loses gesture context on mobile WebViews
const play = () => {
  audioRef.current?.play();           // Immediate — keeps gesture context
  refreshHistory().catch(() => {});   // Fire-and-forget background
};
```

### Error Handling with Retry
```typescript
import { RetryManager } from '../utils/retryManager';
const retryManager = new RetryManager({ maxRetries: 5, retryInterval: 2000 });
const result = await retryManager.execute(async () => {
  await setEpisode(nextEpisode);
  await audioRef.current?.play();
});
```

## Backend Routes

```typescript
// Books
GET    /api/books                           // List books
GET    /api/books/:id                       // Get book details
GET    /api/books/:id/episodes/urls         // Bulk episode URLs (batch of 100)
GET    /api/books/:id/episodes/:index/url   // Single episode URL
GET    /api/books/:id/episodes/:index/stream // Stream audio file

// History
GET    /api/history/book/:id                // Get playback history
POST   /api/history/sync                    // Sync playback progress
GET    /api/history/most-recent             // Most recent for mini player
```

## Database Recovery (Rebuild from Storage)

When the PostgreSQL database is lost but audio files remain on disk (in `book-{uuid}/` folders), use these scripts to inspect and rebuild.

### How Storage Works

Audio files are stored in directories named `book-{uuid}` (e.g., `book-9821743a-6377-4c28-a3c2-3890b6573bac`). These UUID-based folder names are not human-readable — the book title is only stored in the database.

Storage locations:
- **Development**: `backend/storage/audiobooks/`
- **Production (Windows)**: Custom path like `E:\audiobookshelf\audiobooks\`

### Step 1: Inspect Storage (No DB Needed)

Use `list-storage` to see what's on disk without any database connection:

```bash
cd backend

# Basic listing — shows detected title, episode count, duration, cover
npx tsx src/scripts/list-storage.ts --path="E:\audiobookshelf"

# Verbose — also shows individual audio files per book
npx tsx src/scripts/list-storage.ts --path="E:\audiobookshelf" --verbose

# JSON output — for programmatic use
npx tsx src/scripts/list-storage.ts --path="E:\audiobookshelf" --json
```

The script reads ID3/audio metadata (album, artist, duration) from audio files to detect the book title. If no metadata is found, it derives a title from file names.

### Step 2: Prepare the Database

```bash
# Create the database (macOS)
npm run db:create

# Apply schema
npm run migrate

# Create an admin user
npm run create-admin -- --email you@email.com --password yourpassword
```

### Step 3: Rebuild Library

```bash
cd backend

# Preview first (dry-run — no changes made)
npx tsx src/scripts/rebuild-from-storage.ts --path="E:\audiobookshelf" --dry-run

# Rebuild all books as 'adult' type (default)
npx tsx src/scripts/rebuild-from-storage.ts --path="E:\audiobookshelf"

# Rebuild as 'kids' type
npx tsx src/scripts/rebuild-from-storage.ts --path="E:\audiobookshelf" --type=kids
```

The rebuild script:
- Preserves the UUID from folder names as the database `id` (file paths stay valid)
- Extracts book title from audio metadata (ID3 tags)
- Reads actual audio duration from file metadata
- Detects cover images (cover.jpg, cover.png, etc.)
- Auto-creates a `storage_configs` record for custom storage paths
- Skips books that already exist in the database (safe to re-run)

### What Can't Be Recovered

- **Playback history** — progress per user is stored only in the database
- **User accounts** — must be re-created with `npm run create-admin`
- **Book metadata edits** — any manual title/author/description changes are lost

## Do NOT

- Hardcode `localhost:8081` in frontend code
- Remove `config.js` during builds (it's preserved intentionally)
- Modify `github-pages/` directly (it's generated)
- Skip TypeScript types
- Create files > 300 lines without splitting
- Store converted URLs in cache (store raw URLs, convert at retrieval)
- `await` before `audio.play()` in click handlers (breaks mobile gesture context)
