/**
 * App Update Service
 *
 * Checks GitHub Releases for new versions and handles APK download + install.
 * Only functional on Android native; no-op methods on web/iOS.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { platformService } from './platformService';
import { appUpdatePlugin } from '../capacitor/appUpdatePlugin';

const GITHUB_REPO = 'phoenixzqy/audiobookshelf';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
}

type ProgressCallback = (progress: number) => void;

/**
 * Compare two semver strings. Returns true if remote > local.
 */
function isNewerVersion(local: string, remote: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [lMajor = 0, lMinor = 0, lPatch = 0] = parse(local);
  const [rMajor = 0, rMinor = 0, rPatch = 0] = parse(remote);

  if (rMajor !== lMajor) return rMajor > lMajor;
  if (rMinor !== lMinor) return rMinor > lMinor;
  return rPatch > lPatch;
}

/**
 * Check GitHub Releases for a newer version.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  let currentVersion = __APP_VERSION__;

  // On native, use the actual APK version
  if (platformService.isNative) {
    try {
      const info = await App.getInfo();
      currentVersion = info.version;
    } catch {
      // Fall back to build-time version
    }
  }

  const result: UpdateInfo = {
    hasUpdate: false,
    currentVersion,
    latestVersion: currentVersion,
    downloadUrl: '',
    releaseNotes: '',
  };

  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!response.ok) return result;

    const release = await response.json();
    const tagName: string = release.tag_name || '';
    const latestVersion = tagName.replace(/^v/, '');

    result.latestVersion = latestVersion;
    result.releaseNotes = release.body || '';

    if (!isNewerVersion(currentVersion, latestVersion)) return result;

    // Find APK asset
    const apkAsset = release.assets?.find(
      (a: { name: string }) => a.name.endsWith('.apk')
    );
    if (!apkAsset) return result;

    result.hasUpdate = true;
    result.downloadUrl = apkAsset.browser_download_url;
  } catch (err) {
    console.warn('[AppUpdate] Failed to check for updates:', err);
  }

  return result;
}

/**
 * Download APK and trigger system installer.
 */
export async function downloadAndInstall(
  downloadUrl: string,
  onProgress?: ProgressCallback
): Promise<void> {
  if (!platformService.isAndroid) return;

  onProgress?.(0);

  // Download APK using fetch with progress tracking
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const contentLength = Number(response.headers.get('content-length') || 0);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('ReadableStream not supported');

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      onProgress?.(Math.round((received / contentLength) * 100));
    }
  }

  // Combine chunks into single array
  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Convert to base64 for Filesystem.writeFile
  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  const base64 = btoa(binary);

  // Write to cache directory
  const fileName = 'update.apk';
  await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
  });

  onProgress?.(100);

  // Trigger native installer
  // Filesystem.getUri gives us the native file path
  const uriResult = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Cache,
  });

  // Convert content:// or file:// URI to a native path the plugin can use
  const nativePath = uriResult.uri.replace('file://', '');
  await appUpdatePlugin.installApk({ path: nativePath });
}
