#!/bin/bash

# Comprehensive EAS Secrets Setup for Production
# This script configures ALL necessary secrets for the app to work in TestFlight/Production

echo "🚀 Complete EAS Secrets Setup for Production"
echo "==========================================="
echo ""
echo "This script will configure ALL required secrets for:"
echo "✅ Supabase (Authentication & Database)"
echo "✅ AI Plan Generation (Gemini)"
echo "✅ RevenueCat (In-App Purchases)"
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

# Function to safely create or update secrets
set_secret() {
    local name=$1
    local value=$2
    local description=$3
    
    echo "📝 Setting $name..."
    echo "   Description: $description"
    
    # Try to delete existing secret (ignore errors)
    eas secret:delete --id "$name" --non-interactive 2>/dev/null || true
    sleep 1
    
    # Create the secret
    if eas secret:create --scope project --name "$name" --value "$value" --non-interactive 2>/dev/null; then
        echo "   ✅ $name configured"
    else
        echo "   ⚠️  Failed to set $name (may already exist)"
    fi
    echo ""
}

echo "======================================="
echo "📋 Step 1: Supabase Configuration"
echo "======================================="
echo ""
echo "Get these from your Supabase Dashboard:"
echo "1. Go to: https://supabase.com/dashboard"
echo "2. Select your project"
echo "3. Go to Settings → API"
echo ""
read -p "Enter Supabase URL (e.g., https://xxxx.supabase.co): " SUPABASE_URL
read -p "Enter Supabase Anon Key: " SUPABASE_ANON_KEY

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Supabase credentials cannot be empty"
    exit 1
fi

echo ""
echo "======================================="
echo "📋 Step 2: AI (Gemini) Configuration"
echo "======================================="
echo ""
echo "Get a Gemini API key:"
echo "1. Go to: https://makersuite.google.com/app/apikey"
echo "2. Create API key"
echo "3. Enable Generative Language API"
echo ""
read -p "Enter Gemini API key: " GEMINI_API_KEY

if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ Gemini API key cannot be empty"
    exit 1
fi

echo ""
echo "======================================="
echo "📋 Step 3: RevenueCat Configuration"
echo "======================================="
echo ""
echo "Get these from RevenueCat Dashboard:"
echo "1. Go to: https://app.revenuecat.com"
echo "2. Select your project"
echo "3. Go to API Keys"
echo ""
read -p "Enter RevenueCat iOS API Key (starts with 'appl_'): " REVENUECAT_IOS_KEY
read -p "Enter RevenueCat Android API Key (starts with 'goog_'): " REVENUECAT_ANDROID_KEY
read -p "Enter Required Entitlement (default: 'pro'): " REVENUECAT_ENTITLEMENT

# Use default if empty
REVENUECAT_ENTITLEMENT=${REVENUECAT_ENTITLEMENT:-"pro"}

if [ -z "$REVENUECAT_IOS_KEY" ] || [ -z "$REVENUECAT_ANDROID_KEY" ]; then
    echo "⚠️  Warning: RevenueCat keys are missing. In-app purchases won't work."
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "======================================="
echo "🔧 Setting EAS Secrets..."
echo "======================================="
echo ""

# Supabase Secrets
set_secret "EXPO_PUBLIC_SUPABASE_URL" "$SUPABASE_URL" "Supabase project URL"
set_secret "EXPO_PUBLIC_SUPABASE_ANON_KEY" "$SUPABASE_ANON_KEY" "Supabase anonymous key"

# AI/Gemini Secrets
set_secret "EXPO_PUBLIC_GEMINI_API_KEY" "$GEMINI_API_KEY" "Gemini API key for plan generation"
set_secret "EXPO_PUBLIC_AI_API_KEY" "$GEMINI_API_KEY" "Generic AI API key (same as Gemini)"
set_secret "EXPO_PUBLIC_AI_PROVIDER" "gemini" "AI provider to use"
set_secret "EXPO_PUBLIC_AI_MODEL" "gemini-1.5-flash-latest" "AI model to use"
set_secret "EXPO_PUBLIC_ENABLE_FALLBACK" "true" "Enable fallback to Rork API"

# RevenueCat Secrets
if [ ! -z "$REVENUECAT_IOS_KEY" ]; then
    set_secret "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY" "$REVENUECAT_IOS_KEY" "RevenueCat iOS API key"
    set_secret "EXPO_PUBLIC_REVENUECAT_KEY" "$REVENUECAT_IOS_KEY" "RevenueCat generic key (iOS)"
fi

if [ ! -z "$REVENUECAT_ANDROID_KEY" ]; then
    set_secret "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY" "$REVENUECAT_ANDROID_KEY" "RevenueCat Android API key"
fi

set_secret "EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT" "$REVENUECAT_ENTITLEMENT" "Required entitlement for premium features"

# Environment
set_secret "EXPO_PUBLIC_ENVIRONMENT" "production" "App environment"

echo ""
echo "======================================="
echo "📋 Verifying Secrets..."
echo "======================================="
echo ""

echo "Configured secrets:"
eas secret:list 2>/dev/null | grep -E "(SUPABASE|GEMINI|AI_|REVENUECAT|ENVIRONMENT)" || echo "Failed to list secrets"

echo ""
echo "======================================="
echo "✅ Setup Complete!"
echo "======================================="
echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Build for TestFlight:"
echo "   eas build --platform ios --profile production --clear-cache"
echo ""
echo "2. Submit to TestFlight:"
echo "   eas submit --platform ios --profile production"
echo ""
echo "3. Build for Android:"
echo "   eas build --platform android --profile production --clear-cache"
echo ""
echo "4. Test thoroughly in TestFlight/Internal Testing"
echo ""
echo "📊 Configured Services:"
echo "✅ Supabase: Authentication & Database"
echo "✅ Gemini AI: Plan Generation"
echo "✅ RevenueCat: In-App Purchases"
echo "✅ Fallback: Rork API (if Gemini fails)"
echo ""
echo "🔍 To verify configuration in TestFlight:"
echo "1. Connect iPhone to Mac"
echo "2. Open Xcode → Devices → Console"
echo "3. Look for '=== PRODUCTION CONFIGURATION ===' in logs"
echo ""
echo "📖 Documentation:"
echo "- TESTFLIGHT_PLAN_GENERATION_FIX.md - Plan generation issues"
echo "- DEPLOYMENT.md - Full deployment guide"
echo "- PRODUCTION_READINESS.md - Production checklist"
echo ""
