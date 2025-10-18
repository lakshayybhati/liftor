#!/bin/bash

# DeepSeek Integration Setup Verification Script
# This script checks if DeepSeek is properly configured for production

echo "=========================================="
echo "🚀 DeepSeek Integration Setup Verification"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if EAS CLI is installed
echo ""
echo "📋 Checking prerequisites..."
if command -v eas &> /dev/null; then
    echo -e "${GREEN}✅ EAS CLI is installed${NC}"
    EAS_VERSION=$(eas --version)
    echo "   Version: $EAS_VERSION"
else
    echo -e "${RED}❌ EAS CLI is not installed${NC}"
    echo -e "${YELLOW}   Run: npm install -g eas-cli${NC}"
    exit 1
fi

# Check if logged in to EAS
echo ""
echo "🔐 Checking EAS authentication..."
if eas whoami &> /dev/null; then
    EAS_USER=$(eas whoami)
    echo -e "${GREEN}✅ Logged in as: $EAS_USER${NC}"
else
    echo -e "${RED}❌ Not logged in to EAS${NC}"
    echo -e "${YELLOW}   Run: eas login${NC}"
    exit 1
fi

# Check EAS secrets
echo ""
echo "🔑 Checking EAS Secrets..."
echo "   Fetching secrets list..."

# Check for critical secrets
SECRETS_OUTPUT=$(eas secret:list 2>&1)

check_secret() {
    SECRET_NAME=$1
    if echo "$SECRETS_OUTPUT" | grep -q "$SECRET_NAME"; then
        echo -e "${GREEN}✅ $SECRET_NAME is configured${NC}"
        return 0
    else
        echo -e "${RED}❌ $SECRET_NAME is NOT configured${NC}"
        return 1
    fi
}

echo ""
echo "📌 Primary AI Configuration:"
DEEPSEEK_OK=0
check_secret "EXPO_PUBLIC_AI_PROVIDER" || DEEPSEEK_OK=1
check_secret "EXPO_PUBLIC_AI_API_KEY" || DEEPSEEK_OK=1
check_secret "EXPO_PUBLIC_AI_MODEL"

echo ""
echo "📌 Fallback Configuration:"
check_secret "EXPO_PUBLIC_GEMINI_API_KEY"
check_secret "EXPO_PUBLIC_ENABLE_FALLBACK"

echo ""
echo "📌 Other Required Secrets:"
REQUIRED_OK=0
check_secret "EXPO_PUBLIC_SUPABASE_URL" || REQUIRED_OK=1
check_secret "EXPO_PUBLIC_SUPABASE_ANON_KEY" || REQUIRED_OK=1
check_secret "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY"
check_secret "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY"

# Check local environment for development
echo ""
echo "🖥️  Checking Local Environment (.env)..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✅ .env file exists${NC}"
    
    # Check for DeepSeek configuration in .env
    if grep -q "EXPO_PUBLIC_AI_API_KEY" .env; then
        echo -e "${GREEN}   ✅ EXPO_PUBLIC_AI_API_KEY found in .env${NC}"
    else
        echo -e "${YELLOW}   ⚠️  EXPO_PUBLIC_AI_API_KEY not in .env (OK if using EAS secrets)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No .env file (OK for production, using EAS secrets)${NC}"
fi

# Check iOS configuration
echo ""
echo "📱 Checking iOS Configuration..."
if [ -f "ios/liftor/Info.plist" ]; then
    if grep -q "api.deepseek.com" ios/liftor/Info.plist; then
        echo -e "${GREEN}✅ DeepSeek API domain configured in iOS${NC}"
    else
        echo -e "${RED}❌ DeepSeek API domain NOT in iOS config${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  iOS not built yet (run: expo prebuild)${NC}"
fi

# Check package.json for dependencies
echo ""
echo "📦 Checking Dependencies..."
if [ -f "package.json" ]; then
    MISSING_DEPS=0
    
    check_dependency() {
        if grep -q "\"$1\"" package.json; then
            echo -e "${GREEN}✅ $1${NC}"
        else
            echo -e "${RED}❌ $1 missing${NC}"
            MISSING_DEPS=1
        fi
    }
    
    check_dependency "expo-constants"
    check_dependency "@react-native-async-storage/async-storage"
fi

# Summary and recommendations
echo ""
echo "=========================================="
echo "📊 VERIFICATION SUMMARY"
echo "=========================================="

if [ $DEEPSEEK_OK -eq 0 ] && [ $REQUIRED_OK -eq 0 ]; then
    echo -e "${GREEN}✅ DeepSeek integration is properly configured!${NC}"
    echo ""
    echo "🎯 Next Steps:"
    echo "1. Build for iOS: eas build --platform ios --profile production"
    echo "2. Submit to TestFlight"
    echo "3. Test plan generation in TestFlight"
else
    echo -e "${YELLOW}⚠️  Some configuration is missing${NC}"
    echo ""
    echo "🔧 To fix missing secrets, run:"
    
    if echo "$SECRETS_OUTPUT" | grep -q "EXPO_PUBLIC_AI_API_KEY"; then
        echo "# DeepSeek API key already set"
    else
        echo "# Set DeepSeek API key (REQUIRED):"
        echo "eas secret:create --scope project --name EXPO_PUBLIC_AI_API_KEY --value <YOUR_DEEPSEEK_KEY>"
    fi
    
    if echo "$SECRETS_OUTPUT" | grep -q "EXPO_PUBLIC_AI_PROVIDER"; then
        echo "# Provider already set"
    else
        echo ""
        echo "# Set provider to DeepSeek:"
        echo "eas secret:create --scope project --name EXPO_PUBLIC_AI_PROVIDER --value deepseek"
    fi
    
    if echo "$SECRETS_OUTPUT" | grep -q "EXPO_PUBLIC_AI_MODEL"; then
        echo "# Model already set"
    else
        echo ""
        echo "# Set DeepSeek model:"
        echo "eas secret:create --scope project --name EXPO_PUBLIC_AI_MODEL --value deepseek-chat"
    fi
    
    if echo "$SECRETS_OUTPUT" | grep -q "EXPO_PUBLIC_ENABLE_FALLBACK"; then
        echo "# Fallback already configured"
    else
        echo ""
        echo "# Enable fallback chain:"
        echo "eas secret:create --scope project --name EXPO_PUBLIC_ENABLE_FALLBACK --value true"
    fi
    
    if echo "$SECRETS_OUTPUT" | grep -q "EXPO_PUBLIC_GEMINI_API_KEY"; then
        echo "# Gemini fallback already configured"
    else
        echo ""
        echo "# (Optional) Add Gemini as fallback:"
        echo "eas secret:create --scope project --name EXPO_PUBLIC_GEMINI_API_KEY --value <YOUR_GEMINI_KEY>"
    fi
fi

echo ""
echo "=========================================="
echo "📚 Documentation References:"
echo "- Setup Guide: DEEPSEEK_SETUP_GUIDE.md"
echo "- Implementation: DEEPSEEK_IMPLEMENTATION_SUMMARY.md"
echo "- Test Script: utils/test-deepseek-integration.ts"
echo "=========================================="
