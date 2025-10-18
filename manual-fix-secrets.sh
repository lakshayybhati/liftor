#!/bin/bash

# Manual Fix for EAS Secrets when they already exist
# This script manually deletes and recreates all secrets

echo "🔧 Manual EAS Secrets Fix"
echo "========================="
echo ""
echo "This script will DELETE and RECREATE all AI-related secrets"
echo ""

# Check if eas-cli is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI is not installed. Please install it first:"
    echo "   npm install -g eas-cli"
    exit 1
fi

# Prompt for confirmation
read -p "⚠️  This will delete existing secrets. Continue? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

echo ""
echo "📝 Step 1: Deleting existing secrets..."
echo "----------------------------------------"

# List of secrets to delete
SECRETS=(
    "EXPO_PUBLIC_GEMINI_API_KEY"
    "EXPO_PUBLIC_AI_API_KEY"
    "EXPO_PUBLIC_AI_PROVIDER"
    "EXPO_PUBLIC_AI_MODEL"
    "EXPO_PUBLIC_ENABLE_FALLBACK"
)

for SECRET in "${SECRETS[@]}"; do
    echo "Deleting $SECRET..."
    eas secret:delete --id "$SECRET" --non-interactive 2>/dev/null || echo "  (not found or already deleted)"
done

echo ""
echo "✅ Old secrets deleted"
echo ""

# Prompt for API key
echo "📝 Step 2: Enter your Gemini API key"
echo "-------------------------------------"
echo "Get one at: https://makersuite.google.com/app/apikey"
echo ""
read -p "Gemini API key: " GEMINI_API_KEY

if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ API key cannot be empty"
    exit 1
fi

echo ""
echo "📝 Step 3: Creating new secrets..."
echo "-----------------------------------"

# Create all secrets
echo "Creating EXPO_PUBLIC_GEMINI_API_KEY..."
eas secret:create --scope project --name EXPO_PUBLIC_GEMINI_API_KEY --value "$GEMINI_API_KEY" --non-interactive

echo "Creating EXPO_PUBLIC_AI_API_KEY..."
eas secret:create --scope project --name EXPO_PUBLIC_AI_API_KEY --value "$GEMINI_API_KEY" --non-interactive

echo "Creating EXPO_PUBLIC_AI_PROVIDER..."
eas secret:create --scope project --name EXPO_PUBLIC_AI_PROVIDER --value "gemini" --non-interactive

echo "Creating EXPO_PUBLIC_AI_MODEL..."
eas secret:create --scope project --name EXPO_PUBLIC_AI_MODEL --value "gemini-1.5-flash-latest" --non-interactive

echo "Creating EXPO_PUBLIC_ENABLE_FALLBACK..."
eas secret:create --scope project --name EXPO_PUBLIC_ENABLE_FALLBACK --value "true" --non-interactive

echo ""
echo "📋 Step 4: Verifying secrets..."
echo "--------------------------------"
echo ""
eas secret:list | grep -E "(GEMINI|AI_|FALLBACK)" || echo "No AI secrets found"

echo ""
echo "✅ Done! Now build your app:"
echo "-----------------------------"
echo "eas build --platform ios --profile production --clear-cache"
echo ""
