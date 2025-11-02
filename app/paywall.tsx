import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking, Platform, Image, BackHandler } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import Purchases, { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import Constants from 'expo-constants';
import { theme } from '@/constants/colors';
import { Card } from '@/components/ui/Card';
import { hasActiveSubscription, isSubscriptionBypassEnabled, enableSubscriptionBypass } from '@/utils/subscription-helpers';
import { restorePurchases } from '@/utils/subscription-helpers';
import { Sparkles, Gauge, Camera, HeartPulse, X } from 'lucide-react-native';
import { useProfile } from '@/hooks/useProfile';
import type { Profile } from '@/hooks/useProfile';

type Params = { next?: string; offering?: string; blocking?: string };

export default function PaywallScreen() {
  const { next, offering: offeringParam, blocking } = useLocalSearchParams<Params>();
  const isBlockingMode = blocking === 'true';
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);
  const [bypassEnabled, setBypassEnabled] = useState<boolean>(false);
  // USD hints and debug panel removed for production-ready paywall

  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'elite';

  const { data: profile } = useProfile();
  const goalPhrase = useMemo(() => prettyGoal(profile?.goal ?? null), [profile?.goal]);

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
        router.replace('/generating-base-plan');
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
      } catch {}
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
  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      try {
        const entitled = await hasActiveSubscription();
        if (entitled && isMounted) {
          console.log('[Paywall] User already has elite entitlement, navigating to next');
          // Navigate directly
          if (isMounted) {
            navigateNext();
          }
        }
      } catch (err) {
        console.warn('[Paywall] Could not check initial entitlement:', err);
      }
    })();
    
    return () => {
      isMounted = false;
    };
  }, [navigateNext]);

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
      if (entitled) {
        navigateNext();
      } else {
        // Double-check from cache/network
        const ok = await hasActiveSubscription();
        if (ok) navigateNext();
        else Alert.alert('Subscription', 'Purchase did not activate yet. Please try Restore Purchases or try again.');
      }
    } catch (e: any) {
      if (e?.userCancelled) return; // silent
      console.error('[Paywall] Purchase error:', e);
      Alert.alert('Purchase Error', e?.message || 'Unable to complete purchase.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const onRestore = async () => {
    const ok = await restorePurchases();
    if (ok) navigateNext();
  };

  const selectedIsAnnual = selected && annualPkg ? selected.identifier === annualPkg.identifier : false;
  const selectedIsMonthly = selected && monthlyPkg ? selected.identifier === monthlyPkg.identifier : false;

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
        <Text style={styles.title}>We Will Transform{"\n"}Every Day</Text>
        <Text style={styles.subtitle}>With You <Text style={styles.emoji}>🫵</Text></Text>

        {profile && (
          <Text style={styles.personalizedIntro}>{`We reviewed your goal to ${goalPhrase}. Join free to unlock your plan.`}</Text>
        )}

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
              priceTop={monthlyFromAnnualText || (annualPkg.product.priceString || formatLocalPrice(Number(annualPkg.product.price || 0), annualPkg.product.currencyCode as string | undefined))}
              priceBottom={`Billed at ${(annualPkg.product.priceString || formatLocalPrice(Number(annualPkg.product.price || 0), annualPkg.product.currencyCode as string | undefined))}/yr`}
            />
          )}
          {monthlyPkg && (
            <PlanOption
              label="Monthly"
              selected={!!selectedIsMonthly || (!selected && !annualPkg)}
              onPress={() => setSelected(monthlyPkg)}
              priceTop={(monthlyPkg.product.priceString || formatLocalPrice(Number(monthlyPkg.product.price || 0), monthlyPkg.product.currencyCode as string | undefined)) + '/mo'}
              priceBottom={`Billed at ${(monthlyPkg.product.priceString || formatLocalPrice(Number(monthlyPkg.product.price || 0), monthlyPkg.product.currencyCode as string | undefined))}/mo`}
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

        <Text style={styles.freeTrial}>
          {selectedIsAnnual ? 'Free for 7 days. Cancel anytime.' : selectedIsMonthly ? 'Free for 3 days. Cancel anytime.' : 'Free trial. Cancel anytime.'}
        </Text>

        {/* Primary button */}
        <TouchableOpacity
          style={[styles.primaryButton, (!selected || isPurchasing) && styles.disabledButton]}
          onPress={onPurchase}
          disabled={!selected || isPurchasing}
          accessibilityRole="button"
          accessibilityLabel={
            isPurchasing
              ? 'Processing purchase'
              : selectedIsAnnual
                ? 'Start your 7-day free trial'
                : selectedIsMonthly
                  ? 'Start your 3-day free trial'
                  : 'Start free trial'
          }
        >
          <Text style={styles.primaryButtonText}>
            {isPurchasing
              ? 'Processing…'
              : selectedIsAnnual
                ? 'Start your 7-day free trial'
                : selectedIsMonthly
                  ? 'Start your 3-day free trial'
                  : 'Start Free Trial'}
          </Text>
        </TouchableOpacity>

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
          <TouchableOpacity onPress={() => Purchases.showManageSubscriptions().catch(() => {})}>
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
                } catch {}
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

function perMonthPriceText(annual: PurchasesPackage): string | null {
  const total = Number(annual.product.price || 0);
  if (!total) return null;
  const per = total / 12;
  const code = (annual.product.currencyCode as string | undefined) || undefined;
  try {
    // Locale-aware currency formatting for the device's locale
    const formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code || 'USD',
      maximumFractionDigits: 2,
    }).format(per);
    return `${formatted}/mo`;
  } catch {
    const symbol = extractCurrencySymbol(annual.product.priceString);
    return `${symbol}${per.toFixed(2)}/mo`;
  }
}

function extractCurrencySymbol(priceString: string): string {
  // Try both prefix and suffix, to handle locales like 9,99 €
  const prefix = priceString?.match(/^[^\d]+/);
  const suffix = priceString?.match(/[^\d]+$/);
  return (prefix?.[0] || suffix?.[0] || '$').trim();
}

// Formats a numeric amount using the user's locale and the storefront's currency code
function formatLocalPrice(amount: number, currencyCode?: string): string {
  if (!amount || isNaN(amount)) return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currencyCode as string | undefined) || 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if Intl formatter doesn't support provided currency
    return `$${amount.toFixed(2)}`;
  }
}

// Returns an approximate USD string (e.g., "$2.99") for a local amount using USD base FX rates
function approxUSD(amountLocal: number, currencyCode?: string, rates?: Record<string, number> | null): string | null {
  if (!amountLocal || !currencyCode || !rates) return null;
  if (currencyCode.toUpperCase() === 'USD') return null;
  const r = rates[currencyCode.toUpperCase()];
  if (!r || r <= 0) return null; // r = units of currency per 1 USD
  const usd = amountLocal / r;   // convert local → USD
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(usd);
  } catch {
    return `$${usd.toFixed(2)}`;
  }
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
    borderRadius: theme.radius.md,
    alignItems: 'center',
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
});


