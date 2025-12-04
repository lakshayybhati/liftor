import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking, Platform, Image, BackHandler } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import Purchases, { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import Constants from 'expo-constants';
import { theme } from '@/constants/colors';
import { Card } from '@/components/ui/Card';
import { hasActiveSubscription, isSubscriptionBypassEnabled, enableSubscriptionBypass, clearSessionStatusCache } from '@/utils/subscription-helpers';
import { restorePurchases } from '@/utils/subscription-helpers';
import { Sparkles, Gauge, Camera, HeartPulse, X, Clock } from 'lucide-react-native';
import { useProfile } from '@/hooks/useProfile';
import type { Profile } from '@/hooks/useProfile';
import { useSessionStatus } from '@/hooks/useSessionStatus';
import {
  formatCurrency,
  formatMonthlyFromAnnual,
  getCurrencyForRegion,
  fetchStorefrontInfo,
  getDeviceLocale,
} from '@/utils/currency';

type Params = { next?: string; offering?: string; blocking?: string; trialEnded?: string };

export default function PaywallScreen() {
  const { next, offering: offeringParam, blocking, trialEnded } = useLocalSearchParams<Params>();
  const isBlockingMode = blocking === 'true';
  const isTrialEndedMode = trialEnded === 'true';
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);
  const [isStartingTrial, setIsStartingTrial] = useState<boolean>(false);
  const [bypassEnabled, setBypassEnabled] = useState<boolean>(false);
  const [isCheckingSubscription, setIsCheckingSubscription] = useState<boolean>(true);
  const [subscriptionCheckComplete, setSubscriptionCheckComplete] = useState<boolean>(false);

  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'elite';

  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const {
    data: sessionStatus,
    startTrial,
    refetch: refetchSessionStatus,
    hasHadLocalTrial,
    discountEligibleImmediate,
    isTrial,
    isLoading: isSessionLoading,
  } = useSessionStatus();

  const goalPhrase = useMemo(() => prettyGoal(profile?.goal ?? null), [profile?.goal]);

  // Determine if we should show the trial CTA
  // Only show if user hasn't had a local trial and doesn't have an active trial
  const showTrialCTA = !hasHadLocalTrial && !isTrial && !isTrialEndedMode;

  // Show discount messaging only for eligible users
  const showDiscountMessaging = discountEligibleImmediate && !isTrialEndedMode;

  // Pre-fetch storefront info for accurate currency detection
  useEffect(() => {
    fetchStorefrontInfo().catch((e) => {
      console.log('[Paywall] Could not pre-fetch storefront info:', e);
    });
  }, []);

  const loadOfferings = useCallback(async () => {
    setIsLoading(true);
    try {
      const offerings = await Purchases.getOfferings();
      const allKeys = Object.keys(offerings.all || {});
      console.log('[Paywall] offerings keys:', allKeys);
      console.log('[Paywall] current offering id:', offerings.current?.identifier);
      const desiredId = typeof offeringParam === 'string' && offeringParam.length > 0 ? offeringParam : undefined;
      const requested = desiredId ? (offerings.all as any)?.[desiredId] : null;
      if (desiredId) {
        console.log('[Paywall] requested offering id:', desiredId, 'found:', !!requested);
      }
      const current = requested || offerings.current || (allKeys.length > 0 ? (offerings.all as any)[allKeys[0]] : null);
      setOffering(current ?? null);

      if (current && (current.availablePackages?.length ?? 0) > 0) {
        const [annual, monthly] = pickAnnualAndMonthly(current.availablePackages);
        setSelected(annual || monthly || current.availablePackages[0]);
      } else {
        console.log('[Paywall] No packages in current offering');
      }
    } catch (e) {
      console.warn('[Paywall] Failed to fetch offerings:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const navigateNext = useCallback(() => {
    // Defer navigation to avoid update during render
    setTimeout(() => {
      if (typeof next === 'string' && next.length > 0) {
        router.replace({ pathname: next as any });
      } else {
        // Default to plan-building screen for background generation
        router.replace('/plan-building');
      }
    }, 0);
  }, [next]);

  useEffect(() => {
    loadOfferings();
  }, [loadOfferings]);

  // Load bypass state (dev-only)
  useEffect(() => {
    (async () => {
      try {
        const on = await isSubscriptionBypassEnabled();
        setBypassEnabled(on);
      } catch { }
    })();
  }, []);

  // Prevent back navigation in blocking mode
  useEffect(() => {
    if (!isBlockingMode) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        'Subscription Required',
        'Please subscribe to continue using premium features.',
        [{ text: 'OK' }]
      );
      return true; // Prevent back navigation
    });

    return () => backHandler.remove();
  }, [isBlockingMode]);

  // Check entitlements on mount - if already subscribed, navigate away
  // IMPORTANT: Wait for profile to load before checking to prevent flash
  useEffect(() => {
    let isMounted = true;

    // Don't check until profile and session data are loaded
    // This prevents the paywall from flashing before we know subscription status
    if (isProfileLoading || isSessionLoading) {
      console.log('[Paywall] Waiting for profile/session to load...');
      return;
    }

    (async () => {
      try {
        console.log('[Paywall] Checking subscription status...', {
          profileSubscription: profile?.subscription_active,
          profileTrial: profile?.trial_active,
        });

        // First check: profile.subscription_active (most reliable, updated by RevenueCat webhook)
        if (profile?.subscription_active && isMounted) {
          console.log('[Paywall] User has subscription via profile, navigating to next');
          navigateNext();
          return;
        }

        // Second check: profile.trial_active (active trial grants access)
        if (profile?.trial_active && isMounted) {
          console.log('[Paywall] User has active trial via profile, navigating to next');
          navigateNext();
          return;
        }

        // Third check: RevenueCat SDK (for edge cases where profile not synced yet)
        try {
          const entitled = await hasActiveSubscription();
          if (entitled && isMounted) {
            console.log('[Paywall] User already has elite entitlement via SDK, navigating to next');
            navigateNext();
            return;
          }
        } catch (sdkErr) {
          console.warn('[Paywall] SDK check failed (might be in Expo Go):', sdkErr);
          // Continue to show paywall if SDK check fails
        }

        // User doesn't have subscription - show the paywall
        console.log('[Paywall] No subscription found, showing paywall');
        if (isMounted) {
          setSubscriptionCheckComplete(true);
          setIsCheckingSubscription(false);
        }
      } catch (err) {
        console.warn('[Paywall] Could not check initial entitlement:', err);
        // On error, show paywall anyway
        if (isMounted) {
          setSubscriptionCheckComplete(true);
          setIsCheckingSubscription(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [navigateNext, profile?.subscription_active, profile?.trial_active, isProfileLoading, isSessionLoading]);

  // Removed USD hint fetch; rely solely on localized store pricing

  const { annualPkg, monthlyPkg, discountPct, monthlyFromAnnualText } = useMemo(() => {
    const pkgs = offering?.availablePackages ?? [];
    const [annual, monthly] = pickAnnualAndMonthly(pkgs);
    const discount = computeAnnualDiscountPercent(monthly, annual);
    return {
      annualPkg: annual,
      monthlyPkg: monthly,
      discountPct: discount,
      monthlyFromAnnualText: annual ? perMonthPriceText(annual) : null,
    };
  }, [offering]);

  // USD hints removed

  const onPurchase = async () => {
    if (!selected) return;
    try {
      setIsPurchasing(true);
      const { customerInfo } = await Purchases.purchasePackage(selected);
      const entitled = !!customerInfo.entitlements.active[requiredEntitlement];

      // Clear session status cache so next check gets fresh data
      clearSessionStatusCache();

      if (entitled) {
        // Refresh session status to update backend
        await refetchSessionStatus();
        navigateNext();
      } else {
        // Double-check from cache/network
        const ok = await hasActiveSubscription();
        if (ok) {
          await refetchSessionStatus();
          navigateNext();
        } else {
          Alert.alert('Subscription', 'Purchase did not activate yet. Please try Restore Purchases or try again.');
        }
      }
    } catch (e: any) {
      if (e?.userCancelled) return; // silent
      console.error('[Paywall] Purchase error:', e);
      Alert.alert('Purchase Error', e?.message || 'Unable to complete purchase.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const onStartLocalTrial = async () => {
    try {
      setIsStartingTrial(true);
      console.log('[Paywall] Starting local trial...');

      await startTrial();

      console.log('[Paywall] Local trial started successfully');
      navigateNext();
    } catch (e: any) {
      console.error('[Paywall] Trial start error:', e);
      Alert.alert(
        'Unable to Start Trial',
        e?.message || 'Could not start your free trial. Please try again or subscribe.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsStartingTrial(false);
    }
  };

  const onRestore = async () => {
    const ok = await restorePurchases();
    if (ok) navigateNext();
  };

  const selectedIsAnnual = selected && annualPkg ? selected.identifier === annualPkg.identifier : false;
  const selectedIsMonthly = selected && monthlyPkg ? selected.identifier === monthlyPkg.identifier : false;

  // While checking subscription status, render nothing (invisible)
  // This keeps the previous screen visible while the check happens in background
  // Only show paywall AFTER we confirm user doesn't have subscription
  const shouldHidePaywall = isProfileLoading || isSessionLoading || isCheckingSubscription;

  if (shouldHidePaywall) {
    // Return null to keep this screen invisible - previous screen remains visible
    // The check will either navigate away (subscribed) or reveal paywall (not subscribed)
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardDismissMode="on-drag">
        {/* Close button - only show if not in blocking mode */}
        {!isBlockingMode && (
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <X color={theme.color.muted} size={22} />
          </TouchableOpacity>
        )}

        {/* Header */}
        <View style={styles.headerIconWrap}>
          <Image source={require('../assets/images/liftorlogo.png')} style={styles.headerImage} resizeMode="contain" />
        </View>
        <Text style={styles.title}>
          {isTrialEndedMode ? 'Your Trial Has Ended' : 'We will transform'}
        </Text>
        <Text style={styles.subtitle}>
          {isTrialEndedMode ? 'Subscribe to continue' : 'With You'} <Text style={styles.emoji}>🫵</Text>
        </Text>

        {/* Dynamic subtext based on discount eligibility */}
        <Text style={styles.personalizedIntro}>
          {isTrialEndedMode
            ? 'Subscribe now to keep your personalized plans and AI coaching.'
            : showDiscountMessaging
              ? 'Start now and get 30% off your first subscription period.'
              : profile
                ? `We reviewed your goal to ${goalPhrase}. Subscribe to keep your plan evolving every day.`
                : 'Subscribe to keep your plan evolving every day.'
          }
        </Text>

        {/* Feature list */}
        <Card style={styles.featuresCard}>
          <FeatureRow icon={<Sparkles color={theme.color.accent.primary} size={18} />} title="Adapts daily to you" subtitle="your workouts and meals change a little every day, based on your check-ins" />
          <FeatureRow icon={<Gauge color={theme.color.accent.primary} size={18} />} title="Automatic Progress Overload" subtitle="watch strength, weight, and habits improve week by week." />
          <FeatureRow icon={<Camera color={theme.color.accent.primary} size={18} />} title="Track Food In 1 Snap" subtitle="click a photo of any meal to see calories and macros instantly." />
          <FeatureRow icon={<HeartPulse color={theme.color.accent.primary} size={18} />} title="Built-in recovery" subtitle="smart rest days, lighter sessions, and mobility when you’re sore or sleep-deprived" />
        </Card>

        {/* Plans */}
        <View style={styles.plansRow}>
          {annualPkg && (
            <PlanOption
              label="Yearly"
              selected={!!selectedIsAnnual || (!selected && !!annualPkg)}
              onPress={() => setSelected(annualPkg)}
              highlight={typeof discountPct === 'number' && discountPct > 0 ? `${discountPct}% OFF` : undefined}
              priceTop={monthlyFromAnnualText || getPackageDisplayPrice(annualPkg)}
              priceBottom={`Billed at ${getPackageDisplayPrice(annualPkg)}/yr`}
            />
          )}
          {monthlyPkg && (
            <PlanOption
              label="Monthly"
              selected={!!selectedIsMonthly || (!selected && !annualPkg)}
              onPress={() => setSelected(monthlyPkg)}
              priceTop={`${getPackageDisplayPrice(monthlyPkg)}/mo`}
              priceBottom={`Billed at ${getPackageDisplayPrice(monthlyPkg)}/mo`}
            />
          )}
          {!annualPkg && !monthlyPkg && (
            <View style={[styles.fallbackPackage, { borderColor: theme.color.line, backgroundColor: theme.color.card }]}>
              {isLoading ? (
                <ActivityIndicator color={theme.color.accent.primary} />
              ) : (
                <>
                  <Text style={styles.fallbackText}>No plans available. Check your RevenueCat Offering is marked Current, or try again.</Text>
                  <TouchableOpacity onPress={loadOfferings} style={[styles.retryBtn, { borderColor: theme.color.line }]}>
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        <FunFactBadge />

        {/* Free trial text removed */}

        {/* Primary button - Subscribe with optional discount */}
        <TouchableOpacity
          style={[styles.primaryButton, (!selected || isPurchasing || isStartingTrial) && styles.disabledButton]}
          onPress={onPurchase}
          disabled={!selected || isPurchasing || isStartingTrial}
          accessibilityRole="button"
          accessibilityLabel={
            isPurchasing
              ? 'Processing purchase'
              : showDiscountMessaging
                ? 'Start subscription with 30% off'
                : 'Start subscription'
          }
        >
          <Text style={styles.primaryButtonText}>
            {isPurchasing
              ? 'Processing…'
              : showDiscountMessaging
                ? 'Start Transformation • 30% OFF'
                : 'Start Transformation'}
          </Text>
        </TouchableOpacity>

        {/* Secondary Trial CTA - only show if eligible */}
        {showTrialCTA && (
          <TouchableOpacity
            style={[styles.trialCTA, isStartingTrial && styles.disabledButton]}
            onPress={onStartLocalTrial}
            disabled={isStartingTrial || isPurchasing}
            accessibilityRole="button"
            accessibilityLabel="Try the app for 3 days without payment"
          >
            <Clock size={18} color={theme.color.accent.blue} />
            <Text style={styles.trialCTAText}>
              {isStartingTrial ? 'Starting trial...' : 'Not ready? Try for 3 days'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Secondary actions */}
        <View style={styles.secondaryRow}>
          <TouchableOpacity onPress={() => Linking.openURL('https://liftor.app/terms')}>
            <Text style={styles.link}>Terms</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.liftor.app/privacy-policy')}>
            <Text style={styles.link}>Privacy</Text>
          </TouchableOpacity>
        </View>

        {/* Utility actions */}
        <View style={styles.utilityRow}>
          <TouchableOpacity onPress={onRestore}>
            <Text style={styles.utilityLink}>Restore Purchases</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Purchases.showManageSubscriptions().catch(() => { })}>
            <Text style={styles.utilityLink}>Manage Subscription</Text>
          </TouchableOpacity>
        </View>

        {/* Dev-only unlock for Expo */}
        {Constants.appOwnership === 'expo' && (
          <View style={styles.utilityRow}>
            <TouchableOpacity
              onPress={async () => {
                try {
                  await enableSubscriptionBypass();
                  setBypassEnabled(true);
                  navigateNext();
                } catch { }
              }}
              accessibilityRole="button"
              accessibilityLabel="Unlock in Expo"
              style={[styles.debugBtn]}
            >
              <Text style={styles.debugBtnText}>{bypassEnabled ? 'Unlocked (Expo)' : 'Unlock (Expo)'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function pickAnnualAndMonthly(pkgs: PurchasesPackage[]): [PurchasesPackage | null, PurchasesPackage | null] {
  // 1) Prefer RevenueCat default package identifiers
  let annual = pkgs.find(p => p.identifier === '$rc_annual') || null;
  let monthly = pkgs.find(p => p.identifier === '$rc_monthly') || null;

  // 2) Fallback to packageType when identifiers aren't present
  if (!annual) annual = pkgs.find((p: any) => String((p as any).packageType || '').toUpperCase() === 'ANNUAL') || null;
  if (!monthly) monthly = pkgs.find((p: any) => String((p as any).packageType || '').toUpperCase() === 'MONTHLY') || null;

  // 3) Final fallback by identifier heuristics
  if (!annual) annual = pkgs.find(p => /(annual|year|yearly)/i.test(p.identifier || '')) || null;
  if (!monthly) monthly = pkgs.find(p => /(month|monthly)/i.test(p.identifier || '')) || null;

  return [annual, monthly];
}

function computeAnnualDiscountPercent(monthly: PurchasesPackage | null, annual: PurchasesPackage | null): number | null {
  if (!monthly || !annual) return null;
  const m = Number(monthly.product.price || 0);
  const a = Number(annual.product.price || 0);
  if (!m || !a) return null;
  const fullYear = m * 12;
  if (fullYear <= 0) return null;
  const pct = Math.round(((fullYear - a) / fullYear) * 100);
  return pct > 0 ? pct : 0;
}

/**
 * Calculate and format monthly equivalent price from annual package
 * Uses the product's currency code for accurate locale-aware formatting
 */
function perMonthPriceText(annual: PurchasesPackage): string | null {
  const total = Number(annual.product.price || 0);
  if (!total) return null;

  const currencyCode = annual.product.currencyCode || getCurrencyForRegion();
  const locale = getDeviceLocale();

  return formatMonthlyFromAnnual(total, currencyCode, locale);
}

/**
 * Formats a numeric amount using the device's locale and storefront currency
 * Falls back to region-based currency if not provided
 */
function formatLocalPrice(amount: number, currencyCode?: string): string {
  if (!amount || isNaN(amount)) return '';

  const effectiveCurrency = currencyCode || getCurrencyForRegion();
  const locale = getDeviceLocale();

  return formatCurrency(amount, effectiveCurrency, locale);
}

/**
 * Get the display price from a package, preferring the localized priceString
 * Falls back to formatted numeric price if priceString is unavailable
 */
function getPackageDisplayPrice(pkg: PurchasesPackage): string {
  // Prefer the store-provided localized price string (most accurate)
  if (pkg.product.priceString) {
    return pkg.product.priceString;
  }

  // Fallback to formatted numeric price
  const amount = Number(pkg.product.price || 0);
  const currencyCode = pkg.product.currencyCode || getCurrencyForRegion();

  return formatLocalPrice(amount, currencyCode);
}

function FeatureRow({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>{icon}</View>
      <View style={styles.featureTextWrap}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function PlanOption({ label, priceTop, priceBottom, selected, onPress, highlight }: {
  label: string;
  priceTop: string | null;
  priceBottom: string;
  selected: boolean;
  onPress: () => void;
  highlight?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.planCard, selected ? styles.planSelected : undefined]} accessibilityRole="button" accessibilityLabel={label}>
      {!!highlight && (
        <View style={styles.ribbon}>
          <Text style={styles.ribbonText}>{highlight}</Text>
        </View>
      )}
      <Text style={styles.planTitle}>{label}</Text>
      <View style={styles.priceTopWrap}>
        <Text style={styles.priceTop}>{priceTop || ''}</Text>
      </View>
      <Text style={styles.priceBottom}>{priceBottom}</Text>
      <View style={[styles.radio, selected ? styles.radioSelected : undefined]} />
    </TouchableOpacity>
  );
}

function FunFactBadge() {
  return (
    <View style={styles.funFactContainer}>
      <View style={styles.funFactPill}><Text style={styles.funFactPillText}>FUN FACT</Text></View>
      <View style={styles.funFactBubble}>
        <Text style={styles.funFactText}>Liftor users are 60% more likely to reach their aesthetic goals</Text>
      </View>
    </View>
  );
}

function prettyGoal(goal: Profile['goal'] | null): string {
  switch (goal) {
    case 'WEIGHT_LOSS':
      return 'lose fat';
    case 'MUSCLE_GAIN':
      return 'build muscle';
    case 'ENDURANCE':
      return 'boost endurance';
    case 'FLEXIBILITY_MOBILITY':
      return 'move better';
    case 'GENERAL_FITNESS':
      return 'get fitter';
    default:
      return 'reach your goals';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: theme.space.lg,
    paddingBottom: theme.space.xxl,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  headerIconWrap: {
    alignItems: 'center',
    marginTop: theme.space.sm,
    marginBottom: theme.space.lg,
  },
  headerIcon: {
    fontSize: 54,
  },
  headerImage: {
    width: 90,
    height: 90,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    textAlign: 'center',
    color: theme.color.ink,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 20,
    textAlign: 'center',
    color: theme.color.accent.primary,
    fontWeight: '800',
    marginBottom: theme.space.md,
  },
  emoji: {
    color: theme.color.accent.primary,
  },
  featuresCard: {
    marginTop: theme.space.sm,
    padding: theme.space.lg,
  },
  featureRow: {
    flexDirection: 'row',
    gap: theme.space.md,
    marginBottom: theme.space.md,
  },
  featureIcon: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
  },
  featureSubtitle: {
    fontSize: 14,
    color: theme.color.muted,
    marginTop: 2,
  },
  plansRow: {
    flexDirection: 'row',
    gap: theme.space.md,
    marginTop: theme.space.lg,
  },
  planCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    position: 'relative',
  },
  planSelected: {
    borderColor: theme.color.accent.primary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: 6,
  },
  priceTopWrap: {
    minHeight: 26,
    justifyContent: 'center',
  },
  priceTop: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.color.ink,
  },
  priceBottom: {
    fontSize: 12,
    color: theme.color.muted,
    marginTop: 4,
  },
  radio: {
    position: 'absolute',
    right: theme.space.md,
    top: theme.space.md,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
  },
  radioSelected: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary + '30',
  },
  ribbon: {
    position: 'absolute',
    left: theme.space.md,
    top: -12,
    backgroundColor: theme.color.accent.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ribbonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  fallbackPackage: {
    flex: 1,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  fallbackText: {
    color: theme.color.muted,
  },
  retryBtn: {
    marginTop: theme.space.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: theme.radius.md,
  },
  retryText: {
    color: theme.color.ink,
    fontWeight: '700',
  },
  freeTrial: {
    textAlign: 'center',
    color: theme.color.muted,
    marginTop: theme.space.sm,
  },
  personalizedIntro: {
    marginTop: 6,
    textAlign: 'center',
    color: theme.color.muted,
  },
  primaryButton: {
    marginTop: theme.space.md,
    backgroundColor: theme.color.accent.primary,
    padding: theme.space.lg,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: theme.color.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: theme.color.bg,
    fontWeight: '800',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.space.lg,
  },
  link: {
    color: theme.color.muted,
    textDecorationLine: 'underline',
  },
  utilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.space.md,
  },
  utilityLink: {
    color: theme.color.muted,
  },
  debugPanel: {
    marginTop: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    backgroundColor: theme.color.card,
    gap: 6,
  },
  debugTitle: {
    color: theme.color.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  debugText: {
    color: theme.color.muted,
    fontSize: 12,
  },
  debugBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: theme.color.accent.primary + '20',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  debugBtnText: {
    color: theme.color.accent.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  funFactContainer: {
    marginTop: theme.space.md,
  },
  funFactPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#2F80ED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 2,
  },
  funFactPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  funFactBubble: {
    marginTop: 6,
    backgroundColor: '#0F3D2E',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  funFactText: {
    color: '#E9F6EC',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  trialCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space.lg,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    backgroundColor: 'transparent',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: theme.color.line,
    gap: 8,
  },
  trialCTAText: {
    color: theme.color.ink,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});


