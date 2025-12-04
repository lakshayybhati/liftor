/**
 * Currency Utility Module
 * 
 * Handles locale-aware currency formatting for the payment flow.
 * Uses expo-localization for device locale detection and RevenueCat's
 * storefront data for accurate currency display.
 */

import * as Localization from 'expo-localization';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';

// Cache for storefront info to avoid repeated API calls
let cachedStorefrontCurrency: string | null = null;
let cachedStorefrontCountry: string | null = null;
let storefrontFetchAttempted = false;

/**
 * Currency information derived from device, locale, and store region
 */
export interface CurrencyInfo {
  // Device locale (e.g., 'en-US', 'de-DE', 'ja-JP')
  locale: string;
  // Currency code from the store or derived from locale (e.g., 'USD', 'EUR', 'JPY')
  currencyCode: string;
  // ISO country code (e.g., 'US', 'DE', 'JP')
  region: string;
  // Source of the currency info
  source: 'storefront' | 'locale' | 'fallback';
}

/**
 * Maps locale/region to default currency codes
 * Used as fallback when storefront data is unavailable
 */
const REGION_TO_CURRENCY: Record<string, string> = {
  // Americas
  US: 'USD',
  CA: 'CAD',
  MX: 'MXN',
  BR: 'BRL',
  AR: 'ARS',
  CL: 'CLP',
  CO: 'COP',
  PE: 'PEN',
  
  // Europe
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  RU: 'RUB',
  UA: 'UAH',
  TR: 'TRY',
  
  // Asia
  JP: 'JPY',
  CN: 'CNY',
  KR: 'KRW',
  IN: 'INR',
  ID: 'IDR',
  TH: 'THB',
  MY: 'MYR',
  SG: 'SGD',
  PH: 'PHP',
  VN: 'VND',
  TW: 'TWD',
  HK: 'HKD',
  PK: 'PKR',
  BD: 'BDT',
  AE: 'AED',
  SA: 'SAR',
  IL: 'ILS',
  
  // Oceania
  AU: 'AUD',
  NZ: 'NZD',
  
  // Africa
  ZA: 'ZAR',
  NG: 'NGN',
  EG: 'EGP',
  KE: 'KES',
};

/**
 * Get device locale string (e.g., 'en-US', 'de-DE')
 */
export function getDeviceLocale(): string {
  try {
    // Try to get locale from expo-localization
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const primary = locales[0];
      // Construct locale string from language and region
      if (primary.languageTag) {
        return primary.languageTag;
      }
      if (primary.languageCode && primary.regionCode) {
        return `${primary.languageCode}-${primary.regionCode}`;
      }
      if (primary.languageCode) {
        return primary.languageCode;
      }
    }
  } catch (e) {
    console.warn('[Currency] Error getting device locale:', e);
  }
  // Fallback to 'en-US'
  return 'en-US';
}

/**
 * Get device region/country code (e.g., 'US', 'DE', 'JP')
 */
export function getDeviceRegion(): string {
  try {
    // Try region from expo-localization
    const region = Localization.getLocales()?.[0]?.regionCode;
    if (region) {
      return region.toUpperCase();
    }
    
    // Extract region from locale string as fallback
    const locale = getDeviceLocale();
    const parts = locale.split(/[-_]/);
    if (parts.length >= 2) {
      return parts[1].toUpperCase();
    }
  } catch (e) {
    console.warn('[Currency] Error getting device region:', e);
  }
  return 'US';
}

/**
 * Fetch storefront currency from RevenueCat (if available)
 * This gives us the most accurate currency for the user's App Store region
 */
export async function fetchStorefrontInfo(): Promise<{ currency: string | null; country: string | null }> {
  // Return cached values if we already fetched
  if (storefrontFetchAttempted) {
    return { currency: cachedStorefrontCurrency, country: cachedStorefrontCountry };
  }
  
  storefrontFetchAttempted = true;
  
  // Skip in Expo Go
  if (Constants.appOwnership === 'expo') {
    console.log('[Currency] Skipping storefront fetch in Expo Go');
    return { currency: null, country: null };
  }
  
  try {
    // RevenueCat SDK provides customer info which includes storefront details
    const customerInfo = await Purchases.getCustomerInfo();
    
    // Check for storefront country code in management URL or other metadata
    // The SDK exposes storefront info through offerings
    const offerings = await Purchases.getOfferings();
    
    if (offerings.current && offerings.current.availablePackages.length > 0) {
      const pkg = offerings.current.availablePackages[0];
      const currencyCode = pkg.product.currencyCode;
      
      if (currencyCode) {
        cachedStorefrontCurrency = currencyCode;
        console.log('[Currency] Storefront currency from offerings:', currencyCode);
      }
    }
    
    return { currency: cachedStorefrontCurrency, country: cachedStorefrontCountry };
  } catch (e) {
    console.warn('[Currency] Error fetching storefront info:', e);
    return { currency: null, country: null };
  }
}

/**
 * Get currency code based on region with fallback chain:
 * 1. Storefront currency (from RevenueCat/App Store)
 * 2. Derived from device region
 * 3. Fallback to USD
 */
export function getCurrencyForRegion(region?: string): string {
  // If we have cached storefront currency, use it (most accurate)
  if (cachedStorefrontCurrency) {
    return cachedStorefrontCurrency;
  }
  
  // Use provided region or get from device
  const regionCode = region || getDeviceRegion();
  
  // Look up currency from region map
  const currency = REGION_TO_CURRENCY[regionCode.toUpperCase()];
  if (currency) {
    return currency;
  }
  
  // Final fallback - but log so we know it happened
  console.log('[Currency] Using USD fallback for region:', regionCode);
  return 'USD';
}

/**
 * Get complete currency information combining all sources
 */
export async function getCurrencyInfo(): Promise<CurrencyInfo> {
  const locale = getDeviceLocale();
  const region = getDeviceRegion();
  
  // Try to get storefront currency (cached after first call)
  const storefront = await fetchStorefrontInfo();
  
  if (storefront.currency) {
    return {
      locale,
      currencyCode: storefront.currency,
      region: storefront.country || region,
      source: 'storefront',
    };
  }
  
  // Derive from region
  const derivedCurrency = REGION_TO_CURRENCY[region];
  if (derivedCurrency) {
    return {
      locale,
      currencyCode: derivedCurrency,
      region,
      source: 'locale',
    };
  }
  
  // Fallback
  return {
    locale,
    currencyCode: 'USD',
    region,
    source: 'fallback',
  };
}

/**
 * Format a numeric amount as currency using the device's locale and specified currency code
 * 
 * @param amount - The numeric amount to format
 * @param currencyCode - The ISO currency code (e.g., 'USD', 'EUR', 'INR')
 * @param locale - Optional locale override (defaults to device locale)
 */
export function formatCurrency(
  amount: number,
  currencyCode?: string,
  locale?: string
): string {
  if (!amount || isNaN(amount)) {
    return '';
  }
  
  const effectiveLocale = locale || getDeviceLocale();
  const effectiveCurrency = currencyCode || getCurrencyForRegion();
  
  try {
    const formatter = new Intl.NumberFormat(effectiveLocale, {
      style: 'currency',
      currency: effectiveCurrency,
      maximumFractionDigits: 2,
      minimumFractionDigits: effectiveCurrency === 'JPY' || effectiveCurrency === 'KRW' ? 0 : 2,
    });
    return formatter.format(amount);
  } catch (e) {
    // Fallback: try with just currency, no locale
    try {
      const fallbackFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: effectiveCurrency,
        maximumFractionDigits: 2,
      });
      return fallbackFormatter.format(amount);
    } catch {
      // Last resort: simple formatting with symbol lookup
      const symbol = getCurrencySymbol(effectiveCurrency);
      return `${symbol}${amount.toFixed(2)}`;
    }
  }
}

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
    INR: '₹',
    KRW: '₩',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'CHF',
    SEK: 'kr',
    NOK: 'kr',
    DKK: 'kr',
    PLN: 'zł',
    BRL: 'R$',
    MXN: '$',
    THB: '฿',
    SGD: 'S$',
    HKD: 'HK$',
    TWD: 'NT$',
    NZD: 'NZ$',
    ZAR: 'R',
    RUB: '₽',
    TRY: '₺',
    ILS: '₪',
    AED: 'د.إ',
    SAR: 'ر.س',
  };
  
  return symbols[currencyCode.toUpperCase()] || currencyCode;
}

/**
 * Extract currency symbol from a price string (handles both prefix and suffix)
 * Enhanced to handle various international formats:
 * - $9.99 (prefix)
 * - 9,99 € (suffix with comma decimal)
 * - ₹799 (prefix, no decimal)
 * - CHF 9.99 (code prefix)
 */
export function extractCurrencySymbolFromPriceString(priceString: string): string {
  if (!priceString) {
    return getCurrencySymbol(getCurrencyForRegion());
  }
  
  // Try to match prefix symbol (most common)
  const prefixMatch = priceString.match(/^([^\d\s,\.]+)/);
  if (prefixMatch && prefixMatch[1].trim()) {
    return prefixMatch[1].trim();
  }
  
  // Try to match suffix symbol (e.g., "9,99 €")
  const suffixMatch = priceString.match(/([^\d\s,\.]+)$/);
  if (suffixMatch && suffixMatch[1].trim()) {
    return suffixMatch[1].trim();
  }
  
  // Fallback: use region-based currency symbol
  return getCurrencySymbol(getCurrencyForRegion());
}

/**
 * Format price per period (e.g., "$8.33/mo")
 */
export function formatPricePerPeriod(
  amount: number,
  period: 'mo' | 'yr' | 'wk' | 'day',
  currencyCode?: string,
  locale?: string
): string {
  const formatted = formatCurrency(amount, currencyCode, locale);
  return `${formatted}/${period}`;
}

/**
 * Calculate and format monthly price from annual
 */
export function formatMonthlyFromAnnual(
  annualAmount: number,
  currencyCode?: string,
  locale?: string
): string {
  const monthlyAmount = annualAmount / 12;
  return formatPricePerPeriod(monthlyAmount, 'mo', currencyCode, locale);
}

/**
 * Check if two currency codes represent the same currency
 * Handles cases like USD vs US$
 */
export function isSameCurrency(code1: string, code2: string): boolean {
  if (!code1 || !code2) return false;
  return code1.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) === 
         code2.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

/**
 * Format a billing description (e.g., "Billed at $99.99/yr")
 */
export function formatBillingDescription(
  amount: number,
  period: 'mo' | 'yr' | 'wk',
  currencyCode?: string
): string {
  const formatted = formatCurrency(amount, currencyCode);
  return `Billed at ${formatted}/${period}`;
}

/**
 * Clear cached storefront info (useful for testing or when user changes accounts)
 */
export function clearStorefrontCache(): void {
  cachedStorefrontCurrency = null;
  cachedStorefrontCountry = null;
  storefrontFetchAttempted = false;
}



