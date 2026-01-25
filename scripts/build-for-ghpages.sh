#!/bin/bash
set -e

echo "🔨 Building frontend for GitHub Pages..."

# Define paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/github-pages/audiobookshelf"
CONFIG_FILE="$OUTPUT_DIR/config.js"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Save config.js if it exists (contains tunnelUrl that we need to preserve)
CONFIG_BACKUP=""
if [ -f "$CONFIG_FILE" ]; then
  echo "📦 Backing up config.js..."
  CONFIG_BACKUP=$(cat "$CONFIG_FILE")
fi

# Clean the output directory (except .git if it exists)
echo "🧹 Cleaning output directory..."
if [ -d "$OUTPUT_DIR" ]; then
  # Remove all files and folders except we'll restore config.js after
  find "$OUTPUT_DIR" -mindepth 1 -delete 2>/dev/null || true
fi

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Build frontend
echo "🏗️  Running npm build..."
cd "$FRONTEND_DIR"
npm run build

# Restore config.js
if [ -n "$CONFIG_BACKUP" ]; then
  echo "📥 Restoring config.js..."
  echo "$CONFIG_BACKUP" > "$CONFIG_FILE"
  echo "✅ config.js restored"
else
  echo "⚠️  No config.js backup found - you may need to run start-tunnel.sh to generate it"
fi

echo ""
echo "✅ Build complete!"
echo "📁 Output: $OUTPUT_DIR"
echo ""
echo "To test locally:"
echo "  cd $PROJECT_ROOT/github-pages && npx serve ."
echo ""
echo "To deploy:"
echo "  cd $PROJECT_ROOT && git add github-pages && git commit -m 'Update frontend build' && git push"
