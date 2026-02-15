# Release Guide

How to create a new release for Audiobookshelf.

## Quick Release

```bash
# 1. Update version in frontend/package.json
cd frontend
npm version 1.2.0 --no-git-tag-version

# 2. Commit and tag
cd ..
git add .
git commit -m "release: v1.2.0"
git tag v1.2.0
git push origin main --tags
```

This triggers the CI workflow which automatically:
- Builds a signed Android APK with the correct version
- Creates a GitHub Release with the APK attached
- Deploys the web frontend to GitHub Pages

## Version Numbering

We use [semver](https://semver.org/): `MAJOR.MINOR.PATCH`

| Part | When to bump | Example |
|------|-------------|---------|
| MAJOR | Breaking changes | 1.0.0 → 2.0.0 |
| MINOR | New features | 1.0.0 → 1.1.0 |
| PATCH | Bug fixes | 1.0.0 → 1.0.1 |

The Android `versionCode` is computed automatically: `major × 10000 + minor × 100 + patch` (e.g., 1.2.3 → 10203).

## What Gets Built

| Trigger | APK Version | GitHub Release? |
|---------|-------------|-----------------|
| Push tag `v1.2.3` | `1.2.3` | ✅ Yes |
| Manual dispatch (version: `1.2.3`) | `1.2.3` | ✅ Yes |
| Push to `main` | `0.0.0-<sha>` | ❌ No (artifact only) |

## Prerequisites

### GitHub Secrets

The following secrets must be configured in the repository settings (`Settings → Secrets → Actions`):

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.jks` keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | Key password |

Without these secrets, the APK is built with a debug signing key (still installable but shows "untrusted" warning).

### Creating a Keystore (first time only)

```bash
keytool -genkey -v -keystore release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias audiobookshelf

# Encode for GitHub secret
base64 -i release-key.jks | pbcopy  # macOS
base64 -w 0 release-key.jks        # Linux
```

## Manual Workflow Dispatch

You can also trigger a release from the GitHub Actions UI:

1. Go to **Actions → Mobile Release**
2. Click **Run workflow**
3. Enter the version number (e.g., `1.2.0`)
4. Click **Run workflow**

This creates a release without needing a git tag.

## In-App Auto-Update

The Android app checks for updates on startup and from the Profile page:

1. Fetches the latest release from GitHub API
2. Compares with the installed APK version
3. If newer, shows an update dialog with download progress
4. Downloads the APK and triggers the system installer

This works automatically once a GitHub Release exists with an `.apk` asset.

## Verifying a Release

After the workflow completes:

1. Check the [Releases page](../../releases) for the new release
2. Download the APK and verify:
   ```bash
   # Check APK version info
   aapt dump badging audiobookshelf-v1.2.0.apk | grep version
   ```
3. Install on a device and verify the version shows correctly in **Profile → About**
