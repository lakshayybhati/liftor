import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking, Platform, Image } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import Purchases, { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import Constants from 'expo-constants';
import { theme } from '@/constants/colors';
import { Card } from '@/components/ui/Card';
import { hasActiveSubscription } from '@/utils/subscription-helpers';
import { restorePurchases } from '@/utils/subscription-helpers';
import { Sparkles, Gauge, Camera, HeartPulse, X, Bug } from 'lucide-react-native';
import { runRevenueCatDiagnostics } from '@/utils/test-revenuecat';

type Params = { next?: string; offering?: string };

export default function PaywallScreen() {
  const { next, offering: offeringParam } = useLocalSearchParams<Params>();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);

  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const isProduction = extra.EXPO_PUBLIC_ENVIRONMENT === 'production';
  const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'pro';

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

  useEffect(() => {
    loadOfferings();
  }, [loadOfferings]);

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

  const navigateNext = () => {
    if (typeof next === 'string' && next.length > 0) {
      router.replace({ pathname: next as any });
    } else {
      router.replace('/generating-base-plan');
    }
  };

  const onTestUnlock = () => {
    if (isProduction) {
      Alert.alert('Not available', 'Test Unlock is disabled in production.');
      return;
    }
    // Add bypass flag so the next screen skips entitlement check in development
    if (typeof next === 'string' && next.length > 0) {
      router.replace({ pathname: next as any, params: { bypass: '1' } as any });
    } else {
      router.replace({ pathname: '/generating-base-plan', params: { bypass: '1' } });
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

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Close button */}
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
          <X color={theme.color.muted} size={22} />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.headerIconWrap}>
          <Image source={require('../assets/images/liftorlogo.png')} style={styles.headerImage} resizeMode="contain" />
        </View>
        <Text style={styles.title}>We Will Transform{"\n"}Every Day</Text>
        <Text style={styles.subtitle}>With You <Text style={styles.emoji}>🫵</Text></Text>

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
              priceTop={monthlyFromAnnualText || annualPkg.product.priceString}
              priceBottom={`Billed at ${annualPkg.product.priceString}/yr`}
            />
          )}
          {monthlyPkg && (
            <PlanOption
              label="Monthly"
              selected={!!selectedIsMonthly || (!selected && !annualPkg)}
              onPress={() => setSelected(monthlyPkg)}
              priceTop={monthlyPkg.product.priceString + '/mo'}
              priceBottom={`Billed at ${monthlyPkg.product.priceString}/mo`}
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

        <Text style={styles.freeTrial}>Free for 5 days. Cancel anytime.</Text>

        {/* Primary button */}
        <TouchableOpacity
          style={[styles.primaryButton, (!selected || isPurchasing) && styles.disabledButton]}
          onPress={onPurchase}
          disabled={!selected || isPurchasing}
          accessibilityRole="button"
          accessibilityLabel="Start 5-Day Free Trial"
        >
          <Text style={styles.primaryButtonText}>{isPurchasing ? 'Processing…' : 'Start 5-Day Free Trial'}</Text>
        </TouchableOpacity>

        {/* Secondary actions */}
        <View style={styles.secondaryRow}>
          <TouchableOpacity onPress={() => Linking.openURL('https://liftor.app/terms')}>
            <Text style={styles.link}>Terms</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('https://liftor.app/privacy')}>
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
          {!isProduction && (
            <TouchableOpacity onPress={onTestUnlock}>
              <Text style={[styles.utilityLink, { color: theme.color.accent.primary }]}>Test Unlock</Text>
            </TouchableOpacity>
          )}
        </View>

        {!isProduction && (
          <View style={styles.debugPanel}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Bug color={theme.color.muted} size={16} />
              <Text style={styles.debugTitle}>Debug</Text>
            </View>
            <Text style={styles.debugText}>current: {offering?.identifier || '—'}</Text>
            <Text style={styles.debugText}>packages: {(offering?.availablePackages || []).map(p => p.identifier).join(', ') || '—'}</Text>
            <TouchableOpacity onPress={() => runRevenueCatDiagnostics().catch(() => {})} style={styles.debugBtn}>
              <Text style={styles.debugBtnText}>Run RevenueCat Diagnostics (console)</Text>
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
  const symbol = extractCurrencySymbol(annual.product.priceString);
  return `${symbol}${per.toFixed(2)}/mo`;
}

function extractCurrencySymbol(priceString: string): string {
  // Take all non-digit chars from start, e.g., "$", "₹", "€"
  const match = priceString?.match(/^[^\d]+/);
  return match ? match[0].trim() : '$';
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
});


