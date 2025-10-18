/**
 * Subscription Helper Utilities
 * 
 * Helper functions for managing subscriptions in your app.
 * Use these in settings screens or wherever you need subscription info.
 */

import Purchases from 'react-native-purchases';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Check if user has active subscription
 */
export async function hasActiveSubscription(): Promise<boolean> {
  try {
    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
    const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'pro';
    
    const customerInfo = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[requiredEntitlement];
  } catch (error) {
    console.error('[Subscription] Error checking active subscription:', error);
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
    console.error('[Subscription] Error getting subscription details:', error);
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
    console.error('[Subscription] ❌ Error restoring purchases:', error);
    Alert.alert(
      'Restore Failed',
      'Could not restore purchases. Please check your internet connection and try again.',
      [{ text: 'OK' }]
    );
    return false;
  }
}

/**
 * Get formatted subscription expiration date
 */
export function formatExpirationDate(isoDate: string | null): string {
  if (!isoDate) return 'Never';
  
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
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
      return `Active • Renews ${expiration}`;
    } else {
      return `Active • Expires ${expiration}`;
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
    await Purchases.showManageSubscriptions();
  } catch (error: any) {
    console.error('[Subscription] Error opening manage subscription:', error);
    
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





