/**
 * App Update Service
 *
 * Checks GitHub Releases for new versions and handles APK download + install.
 * Uses CapacitorHttp for the version check and redirect resolution (bypasses CORS).
 * Uses Filesystem.downloadFile for the actual APK download (native, with progress).
 * Falls back to CapacitorHttp download + writeFile if downloadFile fails.
 * Only functional on Android native; no-op methods on web/iOS.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { platformService } from './platformService';
import { appUpdatePlugin } from '../capacitor/appUpdatePlugin';

const GITHUB_REPO = 'phoenixzqy/audiobookshelf';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const APK_FILENAME = 'update.apk';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
}

type ProgressCallback = (progress: number) => void;

/** Structured log entry for update debugging */
interface UpdateLog {
  step: string;
  status: 'ok' | 'error' | 'info';
  message: string;
  timestamp: number;
}

// Keep last update logs for debugging
let _lastUpdateLogs: UpdateLog[] = [];

function log(step: string, status: UpdateLog['status'], message: string) {
  const entry: UpdateLog = { step, status, message, timestamp: Date.now() };
  _lastUpdateLogs.push(entry);
  const prefix = status === 'error' ? '❌' : status === 'ok' ? '✅' : 'ℹ️';
  console.log(`[AppUpdate] ${prefix} [${step}] ${message}`);
}

/** Get diagnostic logs from last update attempt (for debugging) */
export function getUpdateLogs(): UpdateLog[] {
  return [..._lastUpdateLogs];
}

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
  _lastUpdateLogs = [];
  let currentVersion = __APP_VERSION__;

  if (platformService.isNative) {
    try {
      const info = await App.getInfo();
      currentVersion = info.version;
      log('version', 'ok', `Native version: ${currentVersion}`);
    } catch (e: any) {
      log('version', 'info', `App.getInfo() failed, using build version ${currentVersion}: ${e.message}`);
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
      log('check', 'info', `Fetching ${RELEASES_API} via CapacitorHttp`);
      const response = await CapacitorHttp.get({
        url: RELEASES_API,
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'audiobookshelf-android',
        },
      });
      log('check', response.status === 200 ? 'ok' : 'error', `API status: ${response.status}`);
      if (response.status !== 200) return result;
      release = response.data;
    } else {
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

    log('check', 'ok', `Current: ${currentVersion}, Latest: ${latestVersion}`);

    if (!isNewerVersion(currentVersion, latestVersion)) {
      log('check', 'info', 'Already up to date');
      return result;
    }

    const apkAsset = release.assets?.find(
      (a: { name: string }) => a.name.endsWith('.apk')
    );
    if (!apkAsset) {
      log('check', 'error', 'No APK asset found in release');
      return result;
    }

    result.hasUpdate = true;
    result.downloadUrl = apkAsset.browser_download_url;
    log('check', 'ok', `Update available: ${result.downloadUrl} (${apkAsset.size} bytes)`);
  } catch (err: any) {
    log('check', 'error', `Failed: ${err.message}`);
  }

  return result;
}

/**
 * Resolve GitHub's 302 redirect to get the direct download URL.
 * GitHub release download URLs redirect to a signed Azure Blob URL.
 */
async function resolveRedirectUrl(url: string): Promise<string> {
  try {
    log('resolve', 'info', `Resolving redirect for: ${url}`);
    // CapacitorHttp follows redirects automatically and returns final response.
    // We use a small range request to avoid downloading the whole file.
    const response = await CapacitorHttp.get({
      url,
      headers: {
        'User-Agent': 'audiobookshelf-android',
        Range: 'bytes=0-0',
      },
    });
    // If we get the response URL back from the redirect chain, use it.
    // CapacitorHttp resolves the final URL in response.url
    if (response.url && response.url !== url) {
      log('resolve', 'ok', `Resolved to: ${response.url.substring(0, 80)}...`);
      return response.url;
    }
    // If status is 200 or 206, the URL itself is direct
    if (response.status === 200 || response.status === 206) {
      log('resolve', 'info', 'URL appears to be direct (no redirect)');
      return url;
    }
    log('resolve', 'info', `Redirect resolution got status ${response.status}, using original URL`);
  } catch (e: any) {
    log('resolve', 'info', `Redirect resolution failed: ${e.message}, using original URL`);
  }
  return url;
}

/**
 * Download APK using native Filesystem.downloadFile and trigger system installer.
 * Falls back to CapacitorHttp download + writeFile if downloadFile fails.
 */
export async function downloadAndInstall(
  downloadUrl: string,
  onProgress?: ProgressCallback
): Promise<void> {
  if (!platformService.isAndroid) return;

  _lastUpdateLogs = _lastUpdateLogs.filter(l => l.step === 'check' || l.step === 'version');
  onProgress?.(0);

  // Step 1: Resolve the GitHub redirect URL to a direct download URL
  const directUrl = await resolveRedirectUrl(downloadUrl);

  // Step 2: Try Filesystem.downloadFile first (native, with progress)
  let downloadSuccess = false;
  try {
    log('download', 'info', 'Attempting Filesystem.downloadFile()');

    let progressListener: any = null;
    if (onProgress) {
      try {
        progressListener = await Filesystem.addListener('progress', (event) => {
          const percent = event.contentLength > 0
            ? Math.round((event.bytes / event.contentLength) * 100)
            : 0;
          onProgress(Math.min(percent, 99));
        });
      } catch (e: any) {
        log('download', 'info', `Progress listener setup failed: ${e.message}`);
      }
    }

    try {
      const result = await Filesystem.downloadFile({
        url: directUrl,
        path: APK_FILENAME,
        directory: Directory.Cache,
        progress: true,
        headers: { 'User-Agent': 'audiobookshelf-android' },
      });
      log('download', 'ok', `downloadFile succeeded: path=${result.path}, blob size=${result.blob?.size || 'N/A'}`);
      downloadSuccess = true;
      onProgress?.(100);
    } finally {
      if (progressListener) {
        try { await progressListener.remove(); } catch {}
      }
    }
  } catch (err: any) {
    log('download', 'error', `downloadFile failed: ${err.message || err}`);
  }

  // Step 3: Fallback — download via CapacitorHttp + writeFile
  if (!downloadSuccess) {
    try {
      log('fallback', 'info', 'Attempting CapacitorHttp fallback download');
      onProgress?.(10);

      const response = await CapacitorHttp.get({
        url: directUrl,
        headers: { 'User-Agent': 'audiobookshelf-android' },
        responseType: 'blob' as any,
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status} from direct URL`);
      }

      log('fallback', 'info', `Received response, data type: ${typeof response.data}, status: ${response.status}`);
      onProgress?.(60);

      // CapacitorHttp with responseType 'blob' returns base64 data on Android
      const base64Data = typeof response.data === 'string'
        ? response.data
        : btoa(String.fromCharCode(...new Uint8Array(response.data)));

      await Filesystem.writeFile({
        path: APK_FILENAME,
        data: base64Data,
        directory: Directory.Cache,
      });

      log('fallback', 'ok', 'Fallback download + writeFile succeeded');
      downloadSuccess = true;
      onProgress?.(100);
    } catch (err: any) {
      log('fallback', 'error', `Fallback failed: ${err.message || err}`);
      // Build detailed error message for the user
      const diagnostics = _lastUpdateLogs
        .filter(l => l.status === 'error')
        .map(l => `[${l.step}] ${l.message}`)
        .join('; ');
      throw new Error(`Download failed: ${diagnostics || err.message}`);
    }
  }

  // Step 4: Trigger native installer
  try {
    log('install', 'info', 'Getting file URI');
    const uriResult = await Filesystem.getUri({
      path: APK_FILENAME,
      directory: Directory.Cache,
    });
    log('install', 'ok', `URI: ${uriResult.uri}`);

    const nativePath = uriResult.uri.replace('file://', '');
    log('install', 'info', `Installing from: ${nativePath}`);
    await appUpdatePlugin.installApk({ path: nativePath });
    log('install', 'ok', 'Install triggered');
  } catch (err: any) {
    log('install', 'error', `Install failed: ${err.message || err}`);
    throw new Error(`Install failed: ${err.message}`);
  }
}
