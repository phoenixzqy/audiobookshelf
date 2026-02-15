import { useState, useEffect, useRef } from 'react';
import { getApiBaseUrl } from '../../config/appConfig';
import { useAuthStore } from '../../stores/authStore';

interface CoverImageProps {
  bookId: string;
  hasCover: boolean;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Cover image component that fetches images via fetch() API.
 *
 * This bypasses WebView restrictions where <img src="http://..."> may be
 * blocked from an https:// origin (Capacitor Android), while fetch() works
 * because it goes through the XHR path that respects allowMixedContent.
 */
export function CoverImage({ bookId, hasCover, alt, className, fallback }: CoverImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const revokeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasCover) return;

    let cancelled = false;
    const url = `${getApiBaseUrl()}/books/${bookId}/cover`;

    (async () => {
      try {
        const { accessToken } = useAuthStore.getState();
        const headers: Record<string, string> = {};
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        if (cancelled) return;

        const objectUrl = URL.createObjectURL(blob);
        revokeRef.current = objectUrl;
        setBlobUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          console.warn(`[CoverImage] Failed to load cover for ${bookId}:`, err, url);
          setError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current);
        revokeRef.current = null;
      }
    };
  }, [bookId, hasCover]);

  if (!hasCover || error) {
    return <>{fallback || <span className="text-4xl">📚</span>}</>;
  }

  if (!blobUrl) {
    // Loading placeholder
    return <div className={`${className} bg-gray-700 animate-pulse`} />;
  }

  return <img src={blobUrl} alt={alt} className={className} />;
}
