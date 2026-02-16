import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { indexedDBService } from '../../services/indexedDB';

interface DiskCoverProps {
  coverUrl?: string | null;
  isPlaying: boolean;
  title: string;
  onTogglePlay?: () => void;
}

/**
 * Fetches an image via fetch() API with IndexedDB caching for offline support.
 */
function useBlobImage(url: string | null | undefined) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const revokeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!url) return;

    let cancelled = false;

    // Extract bookId from URL pattern: /books/{bookId}/cover
    const bookIdMatch = url.match(/\/books\/([^/]+)\/cover/);
    const bookId = bookIdMatch?.[1];

    (async () => {
      try {
        // Try IndexedDB cache first
        if (bookId) {
          const cached = await indexedDBService.getCachedCover(bookId);
          if (cached && !cancelled) {
            const objectUrl = URL.createObjectURL(cached.blob);
            revokeRef.current = objectUrl;
            setBlobUrl(objectUrl);
            return;
          }
        }

        const { accessToken } = useAuthStore.getState();
        const headers: Record<string, string> = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        if (cancelled) return;

        // Cache for offline
        if (bookId) {
          try { await indexedDBService.setCachedCover({ bookId, blob, cachedAt: Date.now() }); } catch {}
        }

        const objectUrl = URL.createObjectURL(blob);
        revokeRef.current = objectUrl;
        setBlobUrl(objectUrl);
      } catch (err) {
        if (!cancelled) console.warn('[DiskCover] Failed to load cover:', err, url);
      }
    })();

    return () => {
      cancelled = true;
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current);
        revokeRef.current = null;
      }
    };
  }, [url]);

  return blobUrl;
}

export function DiskCover({ coverUrl, isPlaying, title, onTogglePlay }: DiskCoverProps) {
  const blobUrl = useBlobImage(coverUrl);

  return (
    <div
      className="relative flex items-center justify-center cursor-pointer"
      onClick={onTogglePlay}
      role="button"
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {/* Outer disk ring */}
      <div className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl" />

      {/* Vinyl grooves effect */}
      <div className="absolute w-60 h-60 rounded-full border-4 border-gray-700/50" />
      <div className="absolute w-52 h-52 rounded-full border-2 border-gray-700/30" />
      <div className="absolute w-44 h-44 rounded-full border border-gray-700/20" />

      {/* Cover image with rotation animation */}
      <div
        className={`relative w-40 h-40 rounded-full overflow-hidden shadow-lg border-4 border-gray-600 ${
          isPlaying ? 'animate-spin-slow' : ''
        }`}
        style={{ animationDuration: '8s' }}
      >
        {blobUrl ? (
          <img
            src={blobUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : coverUrl ? (
          <div className="w-full h-full bg-gray-700 animate-pulse" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
            <span className="text-4xl">🎧</span>
          </div>
        )}

        {/* Center hole */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-900 border-2 border-gray-700" />
      </div>
    </div>
  );
}
