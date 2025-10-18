#!/bin/bash

# Add RevenueCat Secrets to EAS
# This fixes the RevenueCat warning in verification

echo "🔑 Adding RevenueCat Secrets"
echo "============================"
echo ""

# The keys from your app.json
IOS_KEY="appl_CfuHeBCwQmEZeYiYLvtHInhIQVs"
ANDROID_KEY="goog_txuAMppyVuWBJpJAtpWcwrhMxYl"
ENTITLEMENT="elite"

echo "📝 Adding EXPO_PUBLIC_REVENUECAT_IOS_API_KEY..."
eas secret:create --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value "$IOS_KEY" --type string 2>/dev/null || \
eas env:create --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value "$IOS_KEY" --environment production --force 2>/dev/null || \
echo "   ⚠️  Secret may already exist or command failed"

echo "📝 Adding EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY..."
eas secret:create --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY --value "$ANDROID_KEY" --type string 2>/dev/null || \
eas env:create --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY --value "$ANDROID_KEY" --environment production --force 2>/dev/null || \
echo "   ⚠️  Secret may already exist or command failed"

echo "📝 Adding EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT..."
eas secret:create --name EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT --value "$ENTITLEMENT" --type string 2>/dev/null || \
eas env:create --name EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT --value "$ENTITLEMENT" --environment production --force 2>/dev/null || \
echo "   ⚠️  Secret may already exist or command failed"

echo "📝 Adding EXPO_PUBLIC_REVENUECAT_KEY (backup)..."
eas secret:create --name EXPO_PUBLIC_REVENUECAT_KEY --value "$IOS_KEY" --type string 2>/dev/null || \
eas env:create --name EXPO_PUBLIC_REVENUECAT_KEY --value "$IOS_KEY" --environment production --force 2>/dev/null || \
echo "   ⚠️  Secret may already exist or command failed"

echo ""
echo "✅ Done! Verifying secrets..."
echo ""

eas secret:list 2>/dev/null | grep REVENUECAT || echo "Run 'eas secret:list' to verify"

echo ""
echo "🎉 RevenueCat secrets configured!"
echo ""
echo "Run './verify-production-ready.sh' again to confirm."
echo ""

