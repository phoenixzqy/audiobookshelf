# Mobile Build Guide

This guide explains how to build the Audiobookshelf app for Android, iOS, and HarmonyOS.

## Overview

The app uses [Capacitor](https://capacitorjs.com/) to wrap the React web app in native containers for Android and iOS. The existing PWA continues to work unchanged.

## Prerequisites

### All Platforms
- Node.js 18+
- npm

### Android
- Java JDK 17+
- Android Studio
- Android SDK (API 33+)

### iOS
- macOS
- Xcode 15+
- CocoaPods
- Apple Developer account (for device testing/distribution)

### HarmonyOS
- Huawei DevEco Studio
- HarmonyOS SDK

## Project Structure

```
frontend/
├── src/                    # React source (shared)
├── android/                # Android native project (generated)
├── ios/                    # iOS native project (generated)
├── harmonyos/              # HarmonyOS WebView project
├── scripts/
│   ├── build-android.sh    # Android build script
│   └── build-ios.sh        # iOS build script
└── capacitor.config.ts     # Capacitor configuration
```

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Add Native Platforms

```bash
# Android
npx cap add android

# iOS (macOS only)
npx cap add ios
```

### 3. Build and Sync

```bash
# Build web assets for mobile
VITE_BUILD_TARGET=mobile npm run build

# Sync to native projects
npx cap sync
```

### 4. Open in IDE

```bash
# Android Studio
npx cap open android

# Xcode
npx cap open ios
```

## Build Scripts

### Android

```bash
# Debug APK
./scripts/build-android.sh debug

# Release APK
./scripts/build-android.sh release 1.0.0
```

Output: `releases/android/audiobookshelf-v1.0.0-release.apk`

### iOS

```bash
./scripts/build-ios.sh 1.0.0
```

Then open Xcode, select your team, and Archive > Distribute.

## GitHub Actions

### Automatic Releases

Push a tag to trigger builds:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers:
1. Android APK build
2. iOS archive build
3. GitHub Release with both artifacts

### Manual Builds

Use the workflow dispatch in GitHub Actions UI to build specific versions.

### Required Secrets

For signed release builds, add these secrets to your repository:

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded Android keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

Generate keystore:
```bash
keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias audiobookshelf
```

Encode for GitHub secret:
```bash
base64 -i release-key.jks
```

## Configuration

### Server URL

The mobile app fetches the server URL from GitHub:

```
https://raw.githubusercontent.com/phoenixzqy/phoenixzqy.github.io/refs/heads/master/audiobookshelf/config.js
```

This allows updating the server URL without rebuilding the app.

### App Configuration

Edit `capacitor.config.ts`:

```typescript
const config: CapacitorConfig = {
  appId: 'com.audiobooks.player',
  appName: 'Audiobook Player',
  // ...
};
```

## Background Audio

### Android

Permissions in `AndroidManifest.xml`:
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- `WAKE_LOCK`

### iOS

Capabilities in `Info.plist`:
- `UIBackgroundModes`: `audio`, `fetch`

## HarmonyOS

HarmonyOS uses a WebView wrapper that loads the PWA:

1. Create new HarmonyOS project in DevEco Studio
2. Add WebView component pointing to `https://phoenixzqy.github.io/audiobookshelf/`
3. Enable background audio capability
4. Bundle web assets as fallback for offline use

See `harmonyos/` directory for reference implementation.

## Troubleshooting

### Android: "SDK location not found"

Create `frontend/android/local.properties`:
```
sdk.dir=/path/to/Android/sdk
```

### iOS: "No signing certificate"

1. Open Xcode
2. Select the App target
3. Go to Signing & Capabilities
4. Select your development team

### Build fails after updating dependencies

```bash
# Clean and rebuild
cd frontend
rm -rf android ios
npx cap add android
npx cap add ios
npx cap sync
```

## Testing

### Local Development

The mobile app uses the same React code as the web app. Test in the browser first:

```bash
npm run dev
```

### Device Testing

1. Build and sync: `npm run cap:build:android` or `npm run cap:build:ios`
2. Open in IDE: `npx cap open android` or `npx cap open ios`
3. Run on connected device or emulator

### Background Audio Testing

1. Start playing audio
2. Lock the device or switch apps
3. Verify playback continues
4. Verify lock screen controls work
5. Verify episode transitions work in background

## Version Management

Update version in:
1. `frontend/package.json` - `version` field
2. Android: `frontend/android/app/build.gradle` - `versionName` and `versionCode`
3. iOS: `frontend/ios/App/App/Info.plist` - `CFBundleShortVersionString` and `CFBundleVersion`
