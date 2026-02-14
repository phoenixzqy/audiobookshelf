# Audiobookshelf - AI Assistant Instructions

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

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Pages (Frontend)                       │
│         https://phoenixzqy.github.io/audiobookshelf/            │
│                                                                  │
│   index.html ←── config.js ←── Defines window.AUDIOBOOKSHELF_CONFIG
│                      ↓                with tunnelUrl
│   appConfig.ts ──────┘
│        ↓
│   getApiBaseUrl() → tunnelUrl + '/api'
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ API calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Cloudflare Tunnel (Backend)                      │
│         https://xxx.trycloudflare.com                           │
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
├── scripts/                       # Root deployment scripts
│   ├── restart-server.bat        # Restart backend server
│   ├── start-server.bat          # Start backend server
│   ├── stop-server.bat           # Stop backend server
│   └── start-cloudflare-tunneling.bat  # Tunnel startup + config update
├── MOBILE_BUILD.md               # Mobile build guide
└── DEVELOPMENT.md                 # Development guide
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
| CORS config | `backend/src/app.ts` |
| Book routes | `backend/src/routes/books.ts` |
| Web deployment | `.github/workflows/deploy-pages.yml` |
| Mobile builds | `.github/workflows/mobile-release.yml` |

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

## Do NOT

- Hardcode `localhost:8081` in frontend code
- Remove `config.js` during builds (it's preserved intentionally)
- Modify `github-pages/` directly (it's generated)
- Skip TypeScript types
- Create files > 300 lines without splitting
- Store converted URLs in cache (store raw URLs, convert at retrieval)
