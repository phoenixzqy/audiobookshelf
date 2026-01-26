# GitHub Copilot Instructions for Audiobookshelf

## Project Context

This is a full-stack audiobook streaming PWA:
- **Frontend**: React + Vite + TypeScript + PWA (GitHub Pages)
- **Backend**: Express + TypeScript + PostgreSQL (Cloudflare Tunnel)
- **Storage**: Azure Blob Storage (prod) / local filesystem (dev)

## Key Architecture Pattern

The frontend is statically hosted on GitHub Pages but connects to a dynamic backend via Cloudflare Tunnel. The connection is configured through `config.js`:

```javascript
// github-pages/audiobookshelf/config.js
window.AUDIOBOOKSHELF_CONFIG = {
  tunnelUrl: 'https://xxx.trycloudflare.com'
};
```

**Always use `getApiBaseUrl()` from `frontend/src/config/appConfig.ts` for API URLs.**

## Code Completion Hints

### API Calls
```typescript
// CORRECT - use getApiBaseUrl()
import { getApiBaseUrl } from '../config/appConfig';
const url = `${getApiBaseUrl()}/books/${bookId}`;

// WRONG - never hardcode
const url = `http://localhost:8081/api/books/${bookId}`;
```

### Audio URL Handling
```typescript
// For local storage URLs (containing /storage/), use stream endpoint
if (url.includes('/storage/')) {
  const streamUrl = `${getApiBaseUrl()}/books/${bookId}/episodes/${index}/stream`;
  return `${streamUrl}?token=${accessToken}`;
}
// For Azure SAS URLs, use directly
return url;
```

### State Management (Zustand)
```typescript
// Import pattern
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';

// Usage in components
const { book, currentEpisode, setEpisode } = usePlayerStore();
const { accessToken, isAuthenticated } = useAuthStore();
```

### IndexedDB Service
```typescript
import { indexedDBService } from '../services/indexedDB';

// Episode URL caching
await indexedDBService.saveEpisodeUrlBatch(batch);
const batch = await indexedDBService.getEpisodeUrlBatch(bookId, batchNumber);
```

### Episode URL Cache
```typescript
import { episodeUrlCache } from '../services/episodeUrlCache';

// Get cached URL (memory first, then IndexedDB)
const url = await episodeUrlCache.getUrl(bookId, episodeIndex);

// Prefetch batch of 100 URLs
await episodeUrlCache.prefetchBatch(bookId, episodeIndex);
```

## File Size Conventions

- Components: Max 200 lines
- Services: Max 300 lines
- Stores: Max 250 lines
- Utilities: Max 100 lines

Split larger files into focused modules.

## Naming Conventions

- Components: `PascalCase.tsx` (e.g., `PlayerControls.tsx`)
- Services: `camelCase.ts` (e.g., `episodeUrlCache.ts`)
- Stores: `camelCaseStore.ts` (e.g., `playerStore.ts`)
- Types: `PascalCase` in `types/` directory

## Import Order

1. React/external libraries
2. Internal stores
3. Internal services
4. Internal components
5. Types
6. Styles

## Key Files

| Purpose | Path |
|---------|------|
| API base URL | `frontend/src/config/appConfig.ts` |
| HTTP client | `frontend/src/api/client.ts` |
| Player state | `frontend/src/stores/playerStore.ts` |
| Auth state | `frontend/src/stores/authStore.ts` |
| Audio player | `frontend/src/contexts/AudioPlayerContext.tsx` |
| Episode cache | `frontend/src/services/episodeUrlCache.ts` |
| IndexedDB | `frontend/src/services/indexedDB.ts` |

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

## Common Patterns

### Background Playback with Refs
```typescript
// Use refs to avoid stale closures in event handlers
const bookRef = useRef(book);
const currentEpisodeRef = useRef(currentEpisode);

useEffect(() => {
  bookRef.current = book;
  currentEpisodeRef.current = currentEpisode;
}, [book, currentEpisode]);

// In event handler, use refs not closure values
const handleEnded = () => {
  const currentBook = bookRef.current;  // Fresh value
  const currentEp = currentEpisodeRef.current;
};
```

### Error Handling with Retry
```typescript
import { RetryManager } from '../utils/retryManager';

const retryManager = new RetryManager({
  maxRetries: 5,
  retryInterval: 2000,
});

const result = await retryManager.execute(async () => {
  await setEpisode(nextEpisode);
  await audioRef.current?.play();
});
```

## Do NOT Suggest

- Hardcoded `localhost:8081` URLs
- Direct modifications to `github-pages/` directory
- Files over 300 lines without splitting
- Storing converted URLs in cache (convert at retrieval time)
- Removing `config.js` handling in build scripts
