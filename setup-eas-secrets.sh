#!/bin/bash

# EAS Secrets Setup Script for TestFlight Plan Generation
# This script configures all necessary secrets for plan generation to work in TestFlight

echo "🚀 EAS Secrets Setup for Plan Generation"
echo "========================================"
echo ""

# Check if eas-cli is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI is not installed. Please install it first:"
    echo "   npm install -g eas-cli"
    exit 1
fi

# Check if user is logged in to EAS
if ! eas whoami &> /dev/null; then
    echo "❌ You are not logged in to EAS. Please login first:"
    echo "   eas login"
    exit 1
fi

echo "✅ EAS CLI is installed and you are logged in"
echo ""

# Function to create or update a secret
create_or_update_secret() {
    local name=$1
    local value=$2
    local description=$3
    
    echo "📝 Setting $name..."
    echo "   Description: $description"
    
    # Check if secret exists
    if eas secret:list 2>/dev/null | grep -q "$name"; then
        echo "   ⚠️  Secret already exists. Deleting old value..."
        # Force delete without confirmation
        eas secret:delete --id "$name" --non-interactive 2>/dev/null || true
        sleep 1  # Give EAS a moment to process the deletion
    fi
    
    # Create the secret
    echo "   Creating secret..."
    if eas secret:create --scope project --name "$name" --value "$value" --non-interactive 2>/dev/null; then
        echo "   ✅ $name configured successfully"
    else
        # If create fails, try update instead (for cases where delete didn't work)
        echo "   Trying alternative method..."
        if eas secret:push --scope project --secret-name "$name" --secret-value "$value" --force 2>/dev/null; then
            echo "   ✅ $name configured successfully (updated)"
        else
            echo "   ❌ Failed to set $name"
            echo "   Try manually: eas secret:delete --id $name"
            echo "   Then: eas secret:create --scope project --name $name --value YOUR_VALUE"
            return 1
        fi
    fi
    echo ""
}

# Prompt for Gemini API key
echo "🔑 Gemini API Key Setup"
echo "------------------------"
echo "You need a Gemini API key from Google AI Studio."
echo "Get one here: https://makersuite.google.com/app/apikey"
echo ""
read -p "Enter your Gemini API key: " GEMINI_API_KEY

if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ API key cannot be empty"
    exit 1
fi

echo ""
echo "🔧 Configuring EAS Secrets..."
echo "==============================="
echo ""

# Set up all required secrets
SUCCESS=true

# Gemini API key (primary)
create_or_update_secret "EXPO_PUBLIC_GEMINI_API_KEY" "$GEMINI_API_KEY" "Gemini API key for AI plan generation" || SUCCESS=false

# Generic AI API key (backup reference)
create_or_update_secret "EXPO_PUBLIC_AI_API_KEY" "$GEMINI_API_KEY" "Generic AI API key (same as Gemini)" || SUCCESS=false

# AI Provider
create_or_update_secret "EXPO_PUBLIC_AI_PROVIDER" "gemini" "AI provider to use (gemini)" || SUCCESS=false

# AI Model
create_or_update_secret "EXPO_PUBLIC_AI_MODEL" "gemini-1.5-flash-latest" "Gemini model to use" || SUCCESS=false

# Enable Fallback
create_or_update_secret "EXPO_PUBLIC_ENABLE_FALLBACK" "true" "Enable fallback to Rork API if Gemini fails" || SUCCESS=false

echo ""
echo "========================================"
echo ""

if [ "$SUCCESS" = true ]; then
    echo "✅ All secrets configured successfully!"
    echo ""
    echo "📋 Configured secrets:"
    eas secret:list | grep -E "(GEMINI|AI_|FALLBACK)"
    echo ""
    echo "🎯 Next Steps:"
    echo "1. Build for TestFlight:"
    echo "   eas build --platform ios --profile production --clear-cache"
    echo ""
    echo "2. Submit to TestFlight:"
    echo "   eas submit --platform ios --profile production"
    echo ""
    echo "3. Test plan generation in TestFlight"
    echo ""
    echo "📖 For troubleshooting, see TESTFLIGHT_PLAN_GENERATION_FIX.md"
else
    echo "⚠️  Some secrets failed to configure. Please check the errors above."
    echo ""
    echo "You can manually set them with:"
    echo "eas secret:create --scope project --name SECRET_NAME --value SECRET_VALUE"
    exit 1
fi

echo ""
echo "🔍 Quick Test Commands:"
echo "------------------------"
echo "# List all secrets:"
echo "eas secret:list"
echo ""
echo "# Delete a secret:"
echo "eas secret:delete --name SECRET_NAME"
echo ""
echo "# Build with fresh cache:"
echo "eas build --platform ios --profile production --clear-cache"
echo ""
