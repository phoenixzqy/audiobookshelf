# Detailed Review Patterns

## Table of Contents
- [API and Network Patterns](#api-and-network-patterns)
- [State Management Patterns](#state-management-patterns)
- [Audio/Media Handling](#audiomedia-handling)
- [Error Handling](#error-handling)
- [Performance Patterns](#performance-patterns)
- [Testing Considerations](#testing-considerations)

## API and Network Patterns

### HTTP Client Usage

Use the centralized HTTP client from `frontend/src/api/client.ts`:

```typescript
// ✅ CORRECT - use api client
import { api } from '../api/client';
const books = await api.get('/books');

// ❌ WRONG - raw fetch without base URL
const response = await fetch('/api/books');
```

### Error Response Handling

```typescript
// ✅ CORRECT - handle API errors properly
try {
  const data = await api.get(`/books/${id}`);
  return data;
} catch (error) {
  if (error.response?.status === 404) {
    // Handle not found
  }
  throw error; // Re-throw for error boundary
}
```

### Request Authentication

Verify auth token is included:
```typescript
// Token should be handled by api client interceptor
// If manual, use:
const { accessToken } = useAuthStore();
headers: { Authorization: `Bearer ${accessToken}` }
```

## State Management Patterns

### Zustand Store Structure

```typescript
// ✅ CORRECT store structure
interface PlayerState {
  // State
  book: Book | null;
  currentEpisode: Episode | null;
  isPlaying: boolean;
  
  // Actions
  setBook: (book: Book) => void;
  setEpisode: (episode: Episode) => Promise<void>;
  play: () => void;
  pause: () => void;
}
```

### Selector Optimization

```typescript
// ✅ CORRECT - selective subscription
const isPlaying = usePlayerStore(state => state.isPlaying);

// ⚠️ AVOID - subscribing to entire store
const store = usePlayerStore();
```

### Store Persistence

For persisted stores, verify:
- Sensitive data (tokens) are NOT persisted to localStorage
- Persist middleware is configured correctly
- Version migrations handle schema changes

## Audio/Media Handling

### Episode URL Resolution

```typescript
// Complete pattern for episode URL handling
const getPlayableUrl = async (
  bookId: string,
  episodeIndex: number,
  originalUrl: string,
  accessToken: string
): Promise<string> => {
  // Check cache first
  const cached = await episodeUrlCache.getUrl(bookId, episodeIndex);
  if (cached) return convertUrl(cached, bookId, episodeIndex, accessToken);
  
  // Fetch from API
  const url = await fetchEpisodeUrl(bookId, episodeIndex);
  return convertUrl(url, bookId, episodeIndex, accessToken);
};

const convertUrl = (
  url: string,
  bookId: string,
  index: number,
  token: string
): string => {
  // Local storage → stream endpoint
  if (url.includes('/storage/')) {
    return `${getApiBaseUrl()}/books/${bookId}/episodes/${index}/stream?token=${token}`;
  }
  // Azure SAS URL → use directly
  return url;
};
```

### Media Session API

For background playback, verify MediaSession metadata is set:
```typescript
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: episode.title,
    artist: book.author,
    album: book.title,
    artwork: [{ src: book.coverUrl }]
  });
}
```

## Error Handling

### Backend Error Handler

```typescript
// Use centralized error handler
import { errorHandler } from '../middleware/errorHandler';

// In route
router.get('/books/:id', async (req, res, next) => {
  try {
    const book = await getBook(req.params.id);
    res.json(book);
  } catch (error) {
    next(error); // Pass to error handler
  }
});
```

### Frontend Error Boundaries

Critical paths should have error boundaries:
- Audio player
- Book list/detail pages
- Authentication flows

### Retry Logic

Use RetryManager for flaky operations:
```typescript
import { RetryManager } from '../utils/retryManager';

const retry = new RetryManager({
  maxRetries: 5,
  retryInterval: 2000,
  backoffMultiplier: 1.5
});

await retry.execute(async () => {
  await audio.play();
});
```

## Performance Patterns

### Lazy Loading

Components should use React.lazy for code splitting:
```typescript
const BookDetail = lazy(() => import('./pages/BookDetail'));
```

### Memoization

Use memo/useMemo/useCallback appropriately:
```typescript
// ✅ CORRECT - expensive computation
const sortedBooks = useMemo(() => 
  books.sort((a, b) => a.title.localeCompare(b.title)),
  [books]
);

// ❌ WRONG - unnecessary memo
const simpleValue = useMemo(() => count + 1, [count]);
```

### Virtual Lists

For long lists (>50 items), use virtualization:
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
```

### Batch Operations

Use batch APIs when available:
```typescript
// ✅ CORRECT - batch fetch
GET /api/books/:id/episodes/urls?start=0&count=100

// ❌ WRONG - individual fetches in loop
for (const i of indexes) {
  await fetch(`/api/books/${id}/episodes/${i}/url`);
}
```

## Testing Considerations

### What to Check in Test Files

- Test files follow naming: `*.test.ts` or `*.spec.ts`
- Mocks are properly cleaned up
- No hardcoded timeouts (use waitFor)
- API mocks use msw or similar
- No actual network calls in unit tests

### Coverage Requirements

- New functions should have corresponding tests
- Error paths should be tested
- Edge cases documented
