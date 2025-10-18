#!/bin/bash

# Setup EAS Secrets for Liftor App
# This script helps you add environment variables to EAS Build

set -e

echo "🔧 EAS Secrets Setup for Liftor"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -f "app.json" ]; then
    echo "❌ Error: app.json not found. Run this script from the project root."
    exit 1
fi

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI not found. Installing..."
    npm install -g eas-cli
fi

# Check if logged in
echo "Checking EAS authentication..."
if ! eas whoami &> /dev/null; then
    echo "❌ Not logged in to EAS. Please run: eas login"
    exit 1
fi

echo "✅ Logged in as: $(eas whoami)"
echo ""

# Function to add or update a secret
add_secret() {
    local name=$1
    local value=$2
    
    echo "Setting $name..."
    
    # Check if secret already exists
    if eas secret:list 2>&1 | grep -q "$name"; then
        echo "  Secret already exists. Deleting old value..."
        eas secret:delete --name "$name" 2>/dev/null || true
    fi
    
    # Create new secret
    eas secret:create --scope project --name "$name" --value "$value" --type string
    echo "  ✅ $name set"
}

echo "📝 Please provide your credentials:"
echo ""

# Get Supabase URL
read -p "Supabase Project URL (e.g., https://abcdefgh.supabase.co): " SUPABASE_URL
if [[ -z "$SUPABASE_URL" || "$SUPABASE_URL" == *"your-supabase"* ]]; then
    echo "❌ Invalid Supabase URL. Please provide a real URL."
    exit 1
fi

# Get Supabase Anon Key
read -p "Supabase Anon Key (starts with eyJ...): " SUPABASE_ANON_KEY
if [[ -z "$SUPABASE_ANON_KEY" || "$SUPABASE_ANON_KEY" == *"your-anon"* ]]; then
    echo "❌ Invalid Supabase Anon Key. Please provide a real key."
    exit 1
fi

# Get Gemini API Key
read -p "Gemini API Key (starts with AIza...): " GEMINI_API_KEY
if [[ -z "$GEMINI_API_KEY" || "$GEMINI_API_KEY" == *"your-gemini"* ]]; then
    echo "❌ Invalid Gemini API Key. Please provide a real key."
    exit 1
fi

echo ""
echo "🔐 Adding secrets to EAS..."
echo ""

# Add secrets
add_secret "EXPO_PUBLIC_SUPABASE_URL" "$SUPABASE_URL"
add_secret "EXPO_PUBLIC_SUPABASE_ANON_KEY" "$SUPABASE_ANON_KEY"
add_secret "EXPO_PUBLIC_GEMINI_API_KEY" "$GEMINI_API_KEY"

echo ""
echo "✅ All secrets configured!"
echo ""
echo "📋 Verifying secrets:"
eas secret:list

echo ""
echo "🎉 Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Clean prebuild: npx expo prebuild --clean"
echo "2. Rebuild app: eas build --platform ios --profile production --non-interactive"
echo "3. Submit: eas submit --platform ios --latest"
echo ""

