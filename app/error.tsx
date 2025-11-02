import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Stack, useRouter, useGlobalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, Home, RefreshCw } from 'lucide-react-native';
import { theme } from '@/constants/colors';
import { Button } from '@/components/ui/Button';

interface ErrorProps {
  error?: Error;
  retry?: () => void;
}

export default function ErrorBoundary({ error, retry }: ErrorProps) {
  const router = useRouter();
  const params = useGlobalSearchParams();

  // Extract error information
  const errorMessage = error?.message ?? params.message ?? 'An unexpected error occurred';
  const errorStack = error?.stack ?? '';
  const showStack = __DEV__ && errorStack;

  const handleGoHome = () => {
    router.replace('/(tabs)/home');
  };

  const handleRetry = () => {
    if (retry) {
      retry();
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Error', headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag">
        <View style={styles.iconContainer}>
          <AlertCircle color={theme.color.accent.primary} size={64} />
        </View>

        <Text style={styles.title}>Oops! Something went wrong</Text>
        <Text style={styles.message}>{errorMessage}</Text>

        <Text style={styles.helpText}>
          We're sorry for the inconvenience. This error has been logged and we'll look into it.
        </Text>

        {showStack && (
          <View style={styles.stackContainer}>
            <Text style={styles.stackTitle}>Error Details (Development):</Text>
            <ScrollView style={styles.stackScroll} horizontal keyboardDismissMode="on-drag">
              <Text style={styles.stackText}>{errorStack}</Text>
            </ScrollView>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title="Try Again"
            onPress={handleRetry}
            icon={<RefreshCw color={theme.color.bg} size={20} />}
            style={styles.retryButton}
          />
          <TouchableOpacity style={styles.homeButton} onPress={handleGoHome}>
            <Home color={theme.color.accent.primary} size={20} />
            <Text style={styles.homeButtonText}>Go to Home</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            If this problem persists, please contact support at support@liftor.app
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  content: {
    flexGrow: 1,
    padding: theme.space.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: theme.space.xl,
  },
  title: {
    fontSize: theme.size.h1,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginBottom: theme.space.md,
  },
  message: {
    fontSize: theme.size.body,
    color: theme.color.muted,
    textAlign: 'center',
    marginBottom: theme.space.lg,
    paddingHorizontal: theme.space.md,
  },
  helpText: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    marginBottom: theme.space.xl,
    paddingHorizontal: theme.space.md,
    lineHeight: 20,
  },
  stackContainer: {
    width: '100%',
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  stackTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.color.accent.primary,
    marginBottom: theme.space.xs,
  },
  stackScroll: {
    maxHeight: 150,
  },
  stackText: {
    fontSize: 11,
    color: theme.color.muted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actions: {
    width: '100%',
    gap: theme.space.md,
    marginBottom: theme.space.xl,
  },
  retryButton: {
    width: '100%',
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.md,
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    gap: theme.space.sm,
  },
  homeButtonText: {
    fontSize: theme.size.body,
    fontWeight: '600',
    color: theme.color.accent.primary,
  },
  footer: {
    paddingTop: theme.space.lg,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  footerText: {
    fontSize: 12,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
});


