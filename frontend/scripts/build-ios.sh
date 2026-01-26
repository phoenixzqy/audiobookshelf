#!/bin/bash
#
# Build iOS App
#
# Usage:
#   ./build-ios.sh [version]
#
# Note: iOS builds require macOS with Xcode installed.
#       Final IPA must be archived and exported from Xcode.
#

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"

# Parse arguments
VERSION="${1:-1.0.0}"

echo "=========================================="
echo "Building iOS App v${VERSION}"
echo "=========================================="

# Check for macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "ERROR: iOS builds require macOS"
    exit 1
fi

# Check for Xcode
if ! command -v xcodebuild &> /dev/null; then
    echo "ERROR: Xcode is not installed"
    exit 1
fi

# Change to frontend directory
cd "$FRONTEND_DIR"

# Check if ios platform exists
if [ ! -d "ios" ]; then
    echo "iOS platform not found. Adding it now..."
    npx cap add ios
fi

# Step 1: Build web assets for mobile
echo ""
echo "Step 1: Building web assets..."
VITE_BUILD_TARGET=mobile npm run build

# Step 2: Sync Capacitor
echo ""
echo "Step 2: Syncing Capacitor..."
npx cap sync ios

# Step 3: Install CocoaPods
echo ""
echo "Step 3: Installing CocoaPods dependencies..."
cd ios/App
pod install
cd "$FRONTEND_DIR"

echo ""
echo "=========================================="
echo "iOS project prepared!"
echo ""
echo "Next steps:"
echo "  1. Open Xcode: npx cap open ios"
echo "  2. Select your development team in Signing & Capabilities"
echo "  3. Product > Archive to create an IPA"
echo "  4. Distribute App to export the IPA"
echo ""
echo "For CI/CD builds, use xcodebuild:"
echo "  cd ios/App"
echo "  xcodebuild archive -workspace App.xcworkspace -scheme App -archivePath build/App.xcarchive"
echo "=========================================="
