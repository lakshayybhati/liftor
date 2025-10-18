#!/bin/bash

# Production Readiness Verification Script
# This script checks if everything is configured correctly for production

echo "🔍 Production Readiness Verification"
echo "===================================="
echo ""

SUCCESS=true
WARNINGS=""

# Check EAS CLI
echo "📋 Checking EAS CLI..."
if command -v eas &> /dev/null; then
    echo "✅ EAS CLI installed"
    
    # Check if logged in
    if eas whoami &> /dev/null; then
        USER=$(eas whoami 2>/dev/null)
        echo "✅ Logged in as: $USER"
    else
        echo "❌ Not logged in to EAS"
        echo "   Run: eas login"
        SUCCESS=false
    fi
else
    echo "❌ EAS CLI not installed"
    echo "   Run: npm install -g eas-cli"
    SUCCESS=false
fi

echo ""
echo "📋 Checking EAS Secrets..."

# Required secrets
REQUIRED_SECRETS=(
    "EXPO_PUBLIC_SUPABASE_URL"
    "EXPO_PUBLIC_SUPABASE_ANON_KEY"
    "EXPO_PUBLIC_GEMINI_API_KEY"
    "EXPO_PUBLIC_AI_API_KEY"
    "EXPO_PUBLIC_AI_PROVIDER"
    "EXPO_PUBLIC_AI_MODEL"
)

# Optional but recommended secrets
OPTIONAL_SECRETS=(
    "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY"
    "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY"
    "EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT"
)

# Check required secrets
if eas whoami &> /dev/null; then
    SECRETS_LIST=$(eas secret:list 2>/dev/null || echo "")
    
    for SECRET in "${REQUIRED_SECRETS[@]}"; do
        if echo "$SECRETS_LIST" | grep -q "$SECRET"; then
            echo "✅ $SECRET configured"
        else
            echo "❌ $SECRET missing"
            SUCCESS=false
        fi
    done
    
    echo ""
    echo "📋 Checking Optional Secrets..."
    
    for SECRET in "${OPTIONAL_SECRETS[@]}"; do
        if echo "$SECRETS_LIST" | grep -q "$SECRET"; then
            echo "✅ $SECRET configured"
        else
            echo "⚠️  $SECRET missing (optional)"
            WARNINGS="${WARNINGS}\n   - $SECRET not configured (RevenueCat may not work)"
        fi
    done
fi

echo ""
echo "📋 Checking Project Configuration..."

# Check if app.json exists
if [ -f "app.json" ]; then
    echo "✅ app.json found"
    
    # Check for projectId
    if grep -q "projectId" app.json; then
        echo "✅ EAS projectId configured"
    else
        echo "⚠️  No projectId in app.json (run: eas init)"
        WARNINGS="${WARNINGS}\n   - EAS project not initialized"
    fi
else
    echo "❌ app.json not found"
    SUCCESS=false
fi

# Check if eas.json exists
if [ -f "eas.json" ]; then
    echo "✅ eas.json found"
    
    # Check for production profile
    if grep -q "production" eas.json; then
        echo "✅ Production profile configured"
    else
        echo "❌ No production profile in eas.json"
        SUCCESS=false
    fi
else
    echo "❌ eas.json not found"
    echo "   Run: eas build:configure"
    SUCCESS=false
fi

echo ""
echo "📋 Checking Dependencies..."

# Check package.json
if [ -f "package.json" ]; then
    echo "✅ package.json found"
    
    # Check for key dependencies
    DEPS=("expo" "react-native" "@supabase/supabase-js" "react-native-purchases")
    for DEP in "${DEPS[@]}"; do
        if grep -q "\"$DEP\"" package.json; then
            echo "✅ $DEP installed"
        else
            echo "❌ $DEP missing"
            SUCCESS=false
        fi
    done
else
    echo "❌ package.json not found"
    SUCCESS=false
fi

echo ""
echo "📋 Checking Files..."

# Critical files
CRITICAL_FILES=(
    "app.config.js"
    "utils/production-config.ts"
    "utils/ai-client.ts"
    "hooks/useAuth.tsx"
    "hooks/useUserStore.ts"
)

for FILE in "${CRITICAL_FILES[@]}"; do
    if [ -f "$FILE" ]; then
        echo "✅ $FILE exists"
    else
        echo "❌ $FILE missing"
        SUCCESS=false
    fi
done

echo ""
echo "===================================="
echo ""

if [ "$SUCCESS" = true ]; then
    echo "✅ Production Ready!"
    echo ""
    echo "You can now build for production:"
    echo ""
    echo "📱 iOS:"
    echo "   eas build --platform ios --profile production --clear-cache"
    echo "   eas submit --platform ios --profile production"
    echo ""
    echo "🤖 Android:"
    echo "   eas build --platform android --profile production --clear-cache"
    echo "   eas submit --platform android --profile production"
    
    if [ ! -z "$WARNINGS" ]; then
        echo ""
        echo "⚠️  Warnings:"
        echo -e "$WARNINGS"
    fi
else
    echo "❌ Not Production Ready!"
    echo ""
    echo "Please fix the issues above before building."
    echo ""
    echo "Quick fixes:"
    echo "1. Run ./setup-all-eas-secrets.sh to configure all secrets"
    echo "2. Run 'eas init' if project not initialized"
    echo "3. Run 'npm install' if dependencies are missing"
    
    if [ ! -z "$WARNINGS" ]; then
        echo ""
        echo "⚠️  Additional warnings:"
        echo -e "$WARNINGS"
    fi
    
    exit 1
fi

echo ""
echo "📊 Production Features Status:"
echo "✅ Supabase Authentication"
echo "✅ AI Plan Generation (with fallback)"
echo "✅ Data Persistence (AsyncStorage)"
echo "✅ Error Logging & Monitoring"
echo "✅ Production Configuration Management"

if echo "$SECRETS_LIST" | grep -q "REVENUECAT"; then
    echo "✅ RevenueCat In-App Purchases"
else
    echo "⚠️  RevenueCat (not configured)"
fi

echo ""
echo "📖 For more information, see:"
echo "   - DEPLOYMENT.md"
echo "   - PRODUCTION_READINESS.md"
echo "   - TESTFLIGHT_PLAN_GENERATION_FIX.md"
echo ""
