/**
 * Subscription Helper Utilities
 * 
 * Helper functions for managing subscriptions in your app.
 * Use these in settings screens or wherever you need subscription info.
 * 
 * IMPORTANT: For access control, prefer using the useSessionStatus hook
 * which fetches from the backend /session/status endpoint.
 * This file provides RevenueCat-specific utilities and backward compatibility.
 */

import Purchases from 'react-native-purchases';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceLocale, clearStorefrontCache } from './currency';

// Dev bypass storage key
const BYPASS_KEY = 'Liftor_paywall_bypass';

// Cache for session status to avoid redundant network calls
let cachedSessionStatus: AppAccessResult | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 30 * 1000; // 30 seconds

export interface AppAccessResult {
  canUseApp: boolean;
  isTrial: boolean;
  isSubscribed: boolean;
  trialEndsAt: string | null;
  hasHadLocalTrial: boolean;
  discountEligibleImmediate: boolean;
}

/**
 * Check app access using the backend /session/status endpoint
 * This is the preferred method for access control as it uses server time
 */
export async function checkAppAccess(): Promise<AppAccessResult> {
  try {
    // Check cache first
    const now = Date.now();
    if (cachedSessionStatus && (now - cacheTimestamp) < CACHE_DURATION_MS) {
      return cachedSessionStatus;
    }

    // Respect dev bypass in Expo/Dev
    if (await isSubscriptionBypassEnabled()) {
      const bypassResult: AppAccessResult = {
        canUseApp: true,
        isTrial: false,
        isSubscribed: true,
        trialEndsAt: null,
        hasHadLocalTrial: false,
        discountEligibleImmediate: false,
      };
      cachedSessionStatus = bypassResult;
      cacheTimestamp = now;
      return bypassResult;
    }

    // Get Supabase URL and session
    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
    const supabaseUrl = extra.EXPO_PUBLIC_SUPABASE_URL || '';
    
    if (!supabaseUrl) {
      console.warn('[checkAppAccess] Missing Supabase URL');
      return getDefaultAccessResult();
    }

    // Get access token from AsyncStorage (stored by auth provider)
    const sessionStr = await AsyncStorage.getItem('supabase.auth.token');
    if (!sessionStr) {
      console.log('[checkAppAccess] No session token found');
      return getDefaultAccessResult();
    }

    let accessToken: string;
    try {
      const sessionData = JSON.parse(sessionStr);
      accessToken = sessionData?.currentSession?.access_token || sessionData?.access_token;
    } catch {
      console.warn('[checkAppAccess] Failed to parse session');
      return getDefaultAccessResult();
    }

    if (!accessToken) {
      console.log('[checkAppAccess] No access token in session');
      return getDefaultAccessResult();
    }

    const url = `${supabaseUrl}/functions/v1/session-status`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('[checkAppAccess] Session status fetch failed:', response.status);
      // Fall back to RevenueCat check
      return await fallbackToRevenueCat();
    }

    const data = await response.json();
    
    const result: AppAccessResult = {
      canUseApp: data.access?.canUseApp ?? false,
      isTrial: data.access?.trial ?? false,
      isSubscribed: data.access?.full ?? false,
      trialEndsAt: data.trial?.endsAt ?? null,
      hasHadLocalTrial: data.hasHadLocalTrial ?? false,
      discountEligibleImmediate: data.discountEligibleImmediate ?? true,
    };

    // Cache the result
    cachedSessionStatus = result;
    cacheTimestamp = now;

    return result;
  } catch (error) {
    console.error('[checkAppAccess] Error:', error);
    // Fall back to RevenueCat check
    return await fallbackToRevenueCat();
  }
}

function getDefaultAccessResult(): AppAccessResult {
  return {
    canUseApp: false,
    isTrial: false,
    isSubscribed: false,
    trialEndsAt: null,
    hasHadLocalTrial: false,
    discountEligibleImmediate: true,
  };
}

async function fallbackToRevenueCat(): Promise<AppAccessResult> {
  try {
    const hasSubscription = await hasActiveSubscription();
    return {
      canUseApp: hasSubscription,
      isTrial: false,
      isSubscribed: hasSubscription,
      trialEndsAt: null,
      hasHadLocalTrial: false,
      discountEligibleImmediate: !hasSubscription,
    };
  } catch {
    return getDefaultAccessResult();
  }
}

/**
 * Clear the cached session status (call after purchase or trial start)
 */
export function clearSessionStatusCache(): void {
  cachedSessionStatus = null;
  cacheTimestamp = 0;
}

/**
 * Enable subscription bypass in Expo (dev utility)
 */
export async function enableSubscriptionBypass(): Promise<void> {
  try {
    // Only allow in Expo Go or development
    if (Constants.appOwnership === 'expo' || __DEV__) {
      await AsyncStorage.setItem(BYPASS_KEY, 'true');
    }
  } catch { }
}

/**
 * Disable subscription bypass
 */
export async function disableSubscriptionBypass(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BYPASS_KEY);
  } catch { }
}

/**
 * Check if bypass is enabled (only honored in Expo Go/dev)
 */
export async function isSubscriptionBypassEnabled(): Promise<boolean> {
  try {
    if (!(Constants.appOwnership === 'expo' || __DEV__)) return false;
    const v = await AsyncStorage.getItem(BYPASS_KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if user has active subscription
 */
export async function hasActiveSubscription(): Promise<boolean> {
  try {
    // Respect dev bypass in Expo/Dev
    if (await isSubscriptionBypassEnabled()) return true;

    // Guard: SDK must be configured and not running in Expo Go
    if (Constants.appOwnership === 'expo') return false;

    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
    const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'pro';

    const customerInfo = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[requiredEntitlement];
  } catch (error) {
    // Quietly return false rather than crashing UI overlays
    return false;
  }
}

/**
 * Get detailed subscription info
 */
export async function getSubscriptionDetails(): Promise<{
  isActive: boolean;
  entitlementId: string | null;
  expirationDate: string | null;
  willRenew: boolean;
  productId: string | null;
  platform: 'ios' | 'android' | 'stripe' | 'unknown';
  periodType: 'TRIAL' | 'INTRO' | 'NORMAL' | 'UNKNOWN';
  isTrial: boolean;
}> {
  try {
    // Guard: avoid calling Purchases in Expo Go or before configuration
    if (Constants.appOwnership === 'expo') {
      return {
        isActive: false,
        entitlementId: null,
        expirationDate: null,
        willRenew: false,
        productId: null,
        platform: 'unknown',
        periodType: 'UNKNOWN',
        isTrial: false,
      };
    }

    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
    const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'pro';

    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[requiredEntitlement];

    if (entitlement) {
      const periodTypeRaw = (entitlement as any)?.periodType;
      const periodType = typeof periodTypeRaw === 'string' ? (periodTypeRaw.toUpperCase() as 'TRIAL' | 'INTRO' | 'NORMAL') : 'UNKNOWN';
      const isTrial = periodType === 'TRIAL';

      return {
        isActive: true,
        entitlementId: requiredEntitlement,
        expirationDate: entitlement.expirationDate || null,
        willRenew: entitlement.willRenew,
        productId: entitlement.productIdentifier,
        platform: (entitlement.store || 'unknown') as any,
        periodType,
        isTrial,
      };
    }

    return {
      isActive: false,
      entitlementId: null,
      expirationDate: null,
      willRenew: false,
      productId: null,
      platform: 'unknown',
      periodType: 'UNKNOWN',
      isTrial: false,
    };
  } catch (error) {
    // Quiet fallback so we don't show red error overlays if SDK isn't ready
    return {
      isActive: false,
      entitlementId: null,
      expirationDate: null,
      willRenew: false,
      productId: null,
      platform: 'unknown',
      periodType: 'UNKNOWN',
      isTrial: false,
    };
  }
}

/**
 * Restore purchases (show alert with result)
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    console.log('[Subscription] Restoring purchases...');
    if (Constants.appOwnership === 'expo') {
      Alert.alert('Unavailable in Expo Go', 'Please run in a dev client or app build to restore purchases.');
      return false;
    }
    const customerInfo = await Purchases.restorePurchases();

    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
    const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'pro';
    const hasEntitlement = !!customerInfo.entitlements.active[requiredEntitlement];

    if (hasEntitlement) {
      Alert.alert(
        'Success',
        'Your subscription has been restored!',
        [{ text: 'OK' }]
      );
      console.log('[Subscription] ✅ Purchases restored successfully');
      return true;
    } else {
      Alert.alert(
        'No Subscription Found',
        'No active subscription was found to restore. If you recently purchased, please wait a moment and try again.',
        [{ text: 'OK' }]
      );
      console.log('[Subscription] No active subscription found');
      return false;
    }
  } catch (error: any) {
    Alert.alert(
      'Restore Failed',
      'Could not restore purchases. Please check your internet connection and try again.',
      [{ text: 'OK' }]
    );
    return false;
  }
}

/**
 * Get formatted subscription expiration date using device locale
 */
export function formatExpirationDate(isoDate: string | null): string {
  if (!isoDate) return 'Never';

  try {
    const date = new Date(isoDate);
    const locale = getDeviceLocale();
    
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return 'Unknown';
  }
}

/**
 * Get subscription status text for UI display
 */
export async function getSubscriptionStatusText(): Promise<string> {
  const details = await getSubscriptionDetails();

  if (!details.isActive) {
    return 'No active subscription';
  }

  if (details.expirationDate) {
    const expiration = formatExpirationDate(details.expirationDate);
    if (details.willRenew) {
      return `Active – renews on ${expiration}`;
    } else {
      return `Active – expires on ${expiration}`;
    }
  }

  return 'Active';
}

/**
 * Open manage subscription page (App Store or Play Store)
 */
export async function openManageSubscription(): Promise<void> {
  try {
    console.log('[Subscription] Opening manage subscription...');
    if (Constants.appOwnership === 'expo') {
      // Give instructions in Expo Go where native sheet isn't available
      if (Platform.OS === 'ios') {
        Alert.alert('Manage Subscription', 'Open Settings → Your Name → Subscriptions → Liftor');
      } else {
        Alert.alert('Manage Subscription', 'Open Google Play → Profile → Payments & Subscriptions → Subscriptions → Liftor');
      }
      return;
    }
    await Purchases.showManageSubscriptions();
  } catch (error: any) {

    // Fallback: provide manual instructions
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Manage Subscription',
        'To manage your subscription:\n\n1. Open Settings\n2. Tap your name\n3. Tap Subscriptions\n4. Select Liftor',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        'Manage Subscription',
        'To manage your subscription:\n\n1. Open Google Play Store\n2. Tap your profile icon\n3. Tap Payments & Subscriptions\n4. Tap Subscriptions\n5. Select Liftor',
        [{ text: 'OK' }]
      );
    }
  }
}

/**
 * Check if running in sandbox/test mode
 */
export function isSandboxEnvironment(): boolean {
  // In production builds, EXPO_PUBLIC_ENVIRONMENT should be 'production'
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  return extra.EXPO_PUBLIC_ENVIRONMENT !== 'production';
}

/**
 * Get customer ID for support purposes
 */
export async function getCustomerId(): Promise<string | null> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.originalAppUserId;
  } catch (error) {
    console.error('[Subscription] Error getting customer ID:', error);
    return null;
  }
}

/**
 * Derive a simple subscription tier for UI purposes
 */
export async function getSubscriptionTier(): Promise<{
  tier: 'trial' | 'elite' | 'none';
  label: string;
  isActive: boolean;
  expirationDate: string | null;
  willRenew: boolean;
}> {
  const details = await getSubscriptionDetails();
  if (!details.isActive) {
    return { tier: 'none', label: 'Free', isActive: false, expirationDate: null, willRenew: false };
  }
  if (details.isTrial) {
    return { tier: 'trial', label: 'Trial', isActive: true, expirationDate: details.expirationDate, willRenew: details.willRenew };
  }
  return { tier: 'elite', label: 'Elite', isActive: true, expirationDate: details.expirationDate, willRenew: details.willRenew };
}





