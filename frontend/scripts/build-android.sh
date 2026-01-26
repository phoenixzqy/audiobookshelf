#!/bin/bash
#
# Build Android APK
#
# Usage:
#   ./build-android.sh [debug|release] [version]
#
# Examples:
#   ./build-android.sh                    # Debug build with default version
#   ./build-android.sh debug              # Debug APK
#   ./build-android.sh release 1.0.0      # Release APK with version 1.0.0
#

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"

# Parse arguments
BUILD_TYPE="${1:-debug}"
VERSION="${2:-1.0.0}"

echo "=========================================="
echo "Building Android ${BUILD_TYPE} APK v${VERSION}"
echo "=========================================="

# Change to frontend directory
cd "$FRONTEND_DIR"

# Check if android platform exists
if [ ! -d "android" ]; then
    echo "Android platform not found. Adding it now..."
    npx cap add android
fi

# Step 1: Build web assets for mobile
echo ""
echo "Step 1: Building web assets..."
VITE_BUILD_TARGET=mobile npm run build

# Step 2: Sync Capacitor
echo ""
echo "Step 2: Syncing Capacitor..."
npx cap sync android

# Step 3: Build APK
echo ""
echo "Step 3: Building ${BUILD_TYPE} APK..."
cd android

if [ "$BUILD_TYPE" = "release" ]; then
    # Release build - requires signing configuration
    if [ ! -f "release-key.jks" ]; then
        echo ""
        echo "WARNING: release-key.jks not found!"
        echo "To create a release key:"
        echo "  keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias audiobookshelf"
        echo ""
        echo "Building unsigned release APK instead..."
        ./gradlew assembleRelease
    else
        ./gradlew assembleRelease
    fi
    APK_PATH="app/build/outputs/apk/release/app-release.apk"
else
    # Debug build
    ./gradlew assembleDebug
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
fi

cd "$FRONTEND_DIR"

# Step 4: Copy APK to releases directory
echo ""
echo "Step 4: Copying APK to releases..."
mkdir -p releases/android

if [ -f "android/$APK_PATH" ]; then
    OUTPUT_FILE="releases/android/audiobookshelf-v${VERSION}-${BUILD_TYPE}.apk"
    cp "android/$APK_PATH" "$OUTPUT_FILE"

    echo ""
    echo "=========================================="
    echo "Build successful!"
    echo "APK: $OUTPUT_FILE"
    echo "Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
    echo "=========================================="
else
    echo ""
    echo "ERROR: APK not found at android/$APK_PATH"
    exit 1
fi
