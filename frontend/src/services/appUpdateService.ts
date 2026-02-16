/**
 * App Update Service
 *
 * Checks GitHub Releases for new versions and handles APK download + install.
 * Uses CapacitorHttp for the version check (bypasses CORS) and
 * Filesystem.downloadFile for the APK download (native, with progress).
 * Only functional on Android native; no-op methods on web/iOS.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { CapacitorHttp } from '@capacitor/core';
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
 * Uses CapacitorHttp on native (bypasses CORS), falls back to fetch on web.
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
    let release: any;

    if (platformService.isNative) {
      // Use CapacitorHttp to bypass CORS on native
      const response = await CapacitorHttp.get({
        url: RELEASES_API,
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (response.status !== 200) return result;
      release = response.data;
    } else {
      // Web fallback
      const response = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (!response.ok) return result;
      release = await response.json();
    }

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
 * Download APK using native Filesystem.downloadFile and trigger system installer.
 * Uses native HTTP (no CORS issues) with built-in progress tracking.
 */
export async function downloadAndInstall(
  downloadUrl: string,
  onProgress?: ProgressCallback
): Promise<void> {
  if (!platformService.isAndroid) return;

  onProgress?.(0);

  const fileName = 'update.apk';

  // Listen for download progress events
  let progressListener: any = null;
  if (onProgress) {
    progressListener = await Filesystem.addListener('progress', (event) => {
      const percent = Math.round((event.bytes / event.contentLength) * 100);
      onProgress(Math.min(percent, 99));
    });
  }

  try {
    // Download APK natively — bypasses CORS, follows redirects, writes to disk
    await Filesystem.downloadFile({
      url: downloadUrl,
      path: fileName,
      directory: Directory.Cache,
      progress: true,
    });

    onProgress?.(100);
  } finally {
    // Clean up progress listener
    if (progressListener) {
      await progressListener.remove();
    }
  }

  // Trigger native installer
  const uriResult = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Cache,
  });

  const nativePath = uriResult.uri.replace('file://', '');
  await appUpdatePlugin.installApk({ path: nativePath });
}
