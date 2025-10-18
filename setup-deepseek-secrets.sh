#!/bin/bash

# DeepSeek API Setup Script
# This script configures EAS secrets for DeepSeek → Gemini → Rork fallback chain

set -e

echo "🚀 Setting up DeepSeek API configuration..."
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI not found. Please install it first:"
    echo "   npm install -g eas-cli"
    exit 1
fi

# Check if logged in
if ! eas whoami &> /dev/null; then
    echo "❌ Not logged in to EAS. Please run: eas login"
    exit 1
fi

echo "✅ EAS CLI ready"
echo ""

# Function to create or update secret
create_or_update_secret() {
    local name=$1
    local value=$2
    local description=$3
    
    echo "📝 Setting $name..."
    if eas secret:list 2>/dev/null | grep -q "$name"; then
        eas secret:delete --name "$name" --non-interactive 2>/dev/null || true
    fi
    eas secret:create --scope project --name "$name" --value "$value" --non-interactive
    echo "✅ $name set successfully"
}

# Prompt for DeepSeek API key
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DeepSeek Primary Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Get your DeepSeek API key from:"
echo "👉 https://platform.deepseek.com/api_keys"
echo ""
read -p "Enter your DeepSeek API key: " DEEPSEEK_KEY

if [ -z "$DEEPSEEK_KEY" ]; then
    echo "❌ DeepSeek API key is required"
    exit 1
fi

# Configure DeepSeek as primary
create_or_update_secret "EXPO_PUBLIC_AI_PROVIDER" "deepseek" "Primary AI provider"
create_or_update_secret "EXPO_PUBLIC_AI_API_KEY" "$DEEPSEEK_KEY" "DeepSeek API key"
create_or_update_secret "EXPO_PUBLIC_AI_MODEL" "deepseek-chat" "DeepSeek model"
create_or_update_secret "EXPO_PUBLIC_ENABLE_FALLBACK" "true" "Enable fallback chain"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Gemini Fallback Configuration (Optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Add Gemini as fallback? (Recommended for higher reliability)"
echo "Get key from: https://aistudio.google.com/apikey"
echo ""
read -p "Enter Gemini API key (or press Enter to skip): " GEMINI_KEY

if [ ! -z "$GEMINI_KEY" ]; then
    create_or_update_secret "EXPO_PUBLIC_GEMINI_API_KEY" "$GEMINI_KEY" "Gemini fallback API key"
    echo "✅ Gemini configured as fallback"
else
    echo "⏭️  Skipping Gemini (Rork will be used as fallback)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Configuration Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Provider Chain:"
echo "  1️⃣  DeepSeek (Primary) ✅"
if [ ! -z "$GEMINI_KEY" ]; then
    echo "  2️⃣  Gemini (Fallback 1) ✅"
else
    echo "  2️⃣  Gemini (Fallback 1) ⏭️  Skipped"
fi
echo "  3️⃣  Rork (Fallback 2) ✅ Always available"
echo ""
echo "Next Steps:"
echo "  1. Rebuild your app:"
echo "     eas build --platform ios --profile production"
echo "     eas build --platform android --profile production"
echo ""
echo "  2. Monitor usage:"
echo "     DeepSeek: https://platform.deepseek.com/usage"
if [ ! -z "$GEMINI_KEY" ]; then
    echo "     Gemini: https://aistudio.google.com/apikey"
fi
echo ""
echo "  3. Recommended top-up: $100-150 for 5k users/month"
echo ""
echo "✅ Setup complete! Check DEEPSEEK_SETUP_GUIDE.md for details."
echo ""

