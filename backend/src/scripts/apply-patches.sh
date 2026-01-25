#!/bin/bash
# ===========================================
# Audiobook Platform - Apply Database Patches
# For Mac/Linux
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PATCHES_DIR="$SCRIPT_DIR/patches"
ENV_FILE="$BACKEND_ROOT/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Audiobook Platform - Apply DB Patches${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}[ERROR] .env file not found at: $ENV_FILE${NC}"
    echo "Please create a .env file with DATABASE_URL configured."
    exit 1
fi

# Load DATABASE_URL from .env
export $(grep -v '^#' "$ENV_FILE" | grep DATABASE_URL | xargs)

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}[ERROR] DATABASE_URL not found in .env file${NC}"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Found DATABASE_URL in .env"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}[ERROR] psql command not found.${NC}"
    echo "Please install PostgreSQL client tools:"
    echo "  Mac: brew install postgresql"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql-client"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} PostgreSQL client found"
echo ""

# Check if patches directory exists
if [ ! -d "$PATCHES_DIR" ]; then
    echo -e "${YELLOW}[WARN] No patches directory found at: $PATCHES_DIR${NC}"
    echo "Nothing to apply."
    exit 0
fi

# Get list of patch files sorted by name
PATCH_FILES=$(find "$PATCHES_DIR" -name "*.sql" -type f | sort)

if [ -z "$PATCH_FILES" ]; then
    echo -e "${YELLOW}[INFO] No patch files found in: $PATCHES_DIR${NC}"
    exit 0
fi

# Count patches
TOTAL_PATCHES=$(echo "$PATCH_FILES" | wc -l | tr -d ' ')
echo -e "${BLUE}[INFO]${NC} Found $TOTAL_PATCHES patch file(s) to apply"
echo ""

# Apply specific patch or all patches
if [ -n "$1" ]; then
    # Apply specific patch
    PATCH_FILE="$PATCHES_DIR/$1"
    if [ ! -f "$PATCH_FILE" ]; then
        echo -e "${RED}[ERROR] Patch file not found: $PATCH_FILE${NC}"
        exit 1
    fi
    PATCH_FILES="$PATCH_FILE"
    echo -e "${BLUE}[INFO]${NC} Applying specific patch: $1"
    echo ""
fi

# Apply each patch
APPLIED=0
FAILED=0

for PATCH_FILE in $PATCH_FILES; do
    PATCH_NAME=$(basename "$PATCH_FILE")
    echo -e "${BLUE}[APPLYING]${NC} $PATCH_NAME..."

    if psql "$DATABASE_URL" -f "$PATCH_FILE" 2>&1; then
        echo -e "${GREEN}[OK]${NC} Applied: $PATCH_NAME"
        ((APPLIED++))
    else
        echo -e "${RED}[FAILED]${NC} Failed to apply: $PATCH_NAME"
        ((FAILED++))
    fi
    echo ""
done

# Summary
echo "============================================"
echo -e "${BLUE}Summary:${NC}"
echo -e "  Applied: ${GREEN}$APPLIED${NC}"
echo -e "  Failed:  ${RED}$FAILED${NC}"
echo "============================================"

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}[WARN] Some patches failed. Review the errors above.${NC}"
    exit 1
fi

echo -e "${GREEN}[SUCCESS]${NC} All patches applied successfully!"
