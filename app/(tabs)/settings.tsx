import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Switch, Platform, SafeAreaView, ActivityIndicator } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
// Dynamic import of print/sharing to avoid build errors when modules are unavailable
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, Target, Dumbbell, Utensils, Trash2, Download, Settings as SettingsIcon, ChevronRight, LogOut, Pencil, UserCog, Phone, X, HelpCircle, ChevronDown, ChevronUp, Bell, Pill } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { useUserStore } from '@/hooks/useUserStore';
import { GOALS } from '@/constants/fitness';
import { router } from 'expo-router';
import { theme } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { getSubscriptionTier } from '@/utils/subscription-helpers';
import { NotificationService } from '@/services/NotificationService';
import { getBasePlanJobState } from '@/services/backgroundPlanGeneration';

export default function SettingsScreen() {
  const { user, checkins, plans, clearAllData, getRecentCheckins, getWeightData, getWeightProgress, syncLocalToBackend } = useUserStore();
  const auth = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const insets = useSafeAreaInsets();
  const [isClearing, setIsClearing] = useState(false);
  const [showWeeklyCallsModal, setShowWeeklyCallsModal] = useState(false);
  const [notifyWhenAvailable, setNotifyWhenAvailable] = useState(false);
  const [showFaqs, setShowFaqs] = useState(false);
  const [allNotificationsEnabled, setAllNotificationsEnabled] = useState(true);

  // Handle case where auth context isn't ready yet
  if (!auth) {
    return (
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.color.accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const { signOut, session } = auth;

  // FAQ Data
  const faqData = [
    {
      question: "How do I generate a personalized workout plan?",
      answer: "Complete your daily check-in on the Home screen to get a personalized workout plan tailored to your energy levels, stress, and goals. Your plan adapts based on your daily condition."
    },
    {
      question: "Can I change my fitness goals and preferences?",
      answer: "Yes! Tap 'Edit Profile' to update your fitness goals, training days, equipment, and dietary preferences. Your future plans will automatically adapt to your new settings."
    },
    {
      question: "What does the check-in data track?",
      answer: "Your daily check-ins capture your energy levels, stress, mood, sleep quality, and current weight. This data helps us create plans that match your daily condition."
    },
    {
      question: "How do I track my progress over time?",
      answer: "Visit the History tab to see all your past check-ins, workout plans, and weight progress. You can also export your data as a PDF from Settings."
    },
    {
      question: "What if I miss a day of training?",
      answer: "No worries! Your next check-in will help us adjust your plan accordingly. Consistency matters more than perfection, and the app adapts to your lifestyle."
    },
    {
      question: "How do I export my fitness data?",
      answer: "Tap 'Export My Data' in the Data Management section below. This creates a PDF with your profile, check-ins, plans, and progress for the last 30 days."
    },
    {
      question: "What happens if I clear all data?",
      answer: "Clearing data permanently deletes your profile, check-ins, plans, and progress history. This action cannot be undone, so make sure to export your data first if you want to keep it."
    }
  ];

  // Load notification preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const prefs = await NotificationService.getPreferences();
        const allOn = !!(prefs.workoutRemindersEnabled && prefs.checkInRemindersEnabled && prefs.milestonesEnabled);
        setAllNotificationsEnabled(allOn);
      } catch {}
    })();
  }, []);

  // Real subscription status via RevenueCat
  const [subscriptionInfo, setSubscriptionInfo] = useState<{ status: 'trial' | 'elite' | 'none'; label: string }>({ status: 'trial', label: 'Trial' });
  useEffect(() => {
    (async () => {
      try {
        const tier = await getSubscriptionTier();
        setSubscriptionInfo({ status: tier.tier, label: tier.label });
      } catch (e) {
        // Fallback to trial label if query fails
        setSubscriptionInfo({ status: 'trial', label: 'Trial' });
      }
    })();
  }, []);

  const handleExportData = async () => {
    try {
      const exportDate = new Date();
      const recent = getRecentCheckins(30);
      const weightSeries = getWeightData();
      const weightProg = getWeightProgress();

      // Stats similar to History
      const hasCheckins = recent.length > 0;
      const avgEnergy = hasCheckins
        ? (() => {
            const energies = recent.filter(c => typeof c.energy === 'number').map(c => c.energy as number);
            if (energies.length === 0) return 0;
            return Math.round((energies.reduce((a, b) => a + b, 0) / energies.length) * 10) / 10;
          })()
        : 0;

      const plansWithAdh = plans.slice(-30).filter(p => typeof p.adherence === 'number');
      let completion = 0;
      if (plansWithAdh.length > 0) {
        const done = plansWithAdh.filter(p => (p.adherence || 0) > 0.5).length;
        completion = Math.round((done / plansWithAdh.length) * 100);
      } else if (hasCheckins) {
        const days = 30;
        const today = new Date();
        const set = new Set(recent.map(c => c.date));
        let covered = 0;
        for (let i = 0; i < days; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          if (set.has(d.toISOString().split('T')[0])) covered++;
        }
        completion = Math.round((covered / days) * 100);
      }

      const html = generateExportHtml({
        user,
        recent,
        plans: plans.slice(-30),
        weightSeries,
        weightProg,
        stats: { avgEnergy, completion },
        exportDate,
      });
      
      // Import print/sharing modules only when exporting
      const Print = await import('expo-print');
      const Sharing = await import('expo-sharing');
      const FileSystem = await import('expo-file-system');

      const filename = `Liftor_Export_${exportDate.toISOString().slice(0,10)}.pdf`;

      // Web fallback: download HTML file (no native PDF/Sharing support)
      if (Platform.OS === 'web') {
        try {
          const htmlFilename = filename.replace('.pdf', '.html');
          const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = htmlFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          Alert.alert('Export ready', `Downloaded: ${htmlFilename}`);
        } catch (e) {
          console.error('Web export failed', e);
          Alert.alert('Export Error', 'Failed to export on web. Please try again.', [{ text: 'OK' }]);
        }
        return;
      }

      const { uri } = await (Print as any).printToFileAsync({ html });
      const dest = (FileSystem as any).documentDirectory ? (FileSystem as any).documentDirectory + filename : uri;
      if ((FileSystem as any).documentDirectory) {
        await (FileSystem as any).moveAsync({ from: uri, to: dest }).catch(() => {});
      }

      if (await (Sharing as any).isAvailableAsync()) {
        await (Sharing as any).shareAsync(dest, { dialogTitle: 'Export my Liftor data' });
      } else {
        Alert.alert('Export ready', `Saved PDF: ${dest}`);
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      Alert.alert('Export Error', 'Failed to export data. Please try again.', [{ text: 'OK' }]);
    }
  };

  const generateExportHtml = (params: any) => {
    const { user, recent, plans, weightSeries, weightProg, stats, exportDate } = params;
    const safe = (v: any) => (v === undefined || v === null ? '—' : String(v));
    const fmtDate = (d: string) => {
      const dt = new Date(d);
      return `${dt.getDate()}/${dt.getMonth()+1}/${dt.getFullYear()}`;
    };
    const css = `
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial; background: #0C0C0D; color: #F7F7F8; padding: 24px; }
      h1 { font-size: 28px; margin: 0 0 12px; }
      h2 { font-size: 20px; margin: 24px 0 8px; }
      .card { border: 1px solid #26262B; background: #131316; border-radius: 16px; padding: 16px; margin-bottom: 12px; }
      .grid { display: flex; gap: 12px; }
      .grid .card { flex: 1; }
      .muted { color: #A6A6AD; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; border-bottom: 1px solid #26262B; padding: 8px; font-size: 12px; }
    `;
    const userSection = `
      <div class="card">
        <h1>My Liftor Journey</h1>
        <div class="muted">Exported on ${exportDate.toLocaleString()}</div>
        <h2>Profile</h2>
        <div>Name: ${safe(user?.name)}</div>
        <div>Goal: ${safe(user?.goal)}</div>
        <div>Training Days: ${safe(user?.trainingDays)}</div>
        <div>Equipment: ${safe((user?.equipment||[]).join(', '))}</div>
        <div>Diet: ${safe((user?.dietaryPrefs||[]).join(', '))}</div>
      </div>
    `;
    const statsSection = `
      <div class="grid">
        <div class="card"><h2>Check-ins (30d)</h2><div>${recent.length}</div></div>
        <div class="card"><h2>Avg Energy</h2><div>${stats.avgEnergy || 0}</div></div>
        <div class="card"><h2>Completion</h2><div>${stats.completion || 0}%</div></div>
      </div>
    `;
    const weightSection = `
      <div class="card">
        <h2>Weight Progress</h2>
        ${weightProg ? `<div class="muted">${weightProg.remaining.toFixed(1)} kg ${weightProg.isGaining ? 'to gain' : 'to lose'} (goal ${weightProg.goal}kg)</div>` : '<div class="muted">No goal set</div>'}
        <table>
          <thead><tr><th>Date</th><th>Weight (kg)</th></tr></thead>
          <tbody>
            ${weightSeries.slice(-30).map((w:any) => `<tr><td>${fmtDate(w.date)}</td><td>${w.weight}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No weight data</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    const checkinsSection = `
      <div class="card">
        <h2>Recent Check-ins</h2>
        <table>
          <thead><tr><th>Date</th><th>Mode</th><th>Energy</th><th>Stress</th><th>Mood</th></tr></thead>
          <tbody>
            ${recent.map((c:any) => `<tr><td>${fmtDate(c.date)}</td><td>${safe(c.mode)}</td><td>${safe(c.energy)}</td><td>${safe(c.stress)}</td><td>${safe(c.mood)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No check-ins</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    const plansSection = `
      <div class="card">
        <h2>Plans</h2>
        <table>
          <thead><tr><th>Date</th><th>Workout Focus</th><th>Calories</th><th>Protein (g)</th></tr></thead>
          <tbody>
            ${plans.map((p:any) => `<tr><td>${fmtDate(p.date)}</td><td>${safe((p.workout?.focus||[]).join(', '))}</td><td>${safe(p.nutrition?.total_kcal)}</td><td>${safe(p.nutrition?.protein_g)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No plans</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>${userSection}${statsSection}${weightSection}${checkinsSection}${plansSection}</body></html>`;
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all your data including:\n\n• Profile information\n• All check-ins\n• Generated plans\n• Progress history\n\nThis action cannot be undone. Are you sure you want to continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear All Data',
          style: 'destructive',
          onPress: confirmClearData,
        },
      ],
      { cancelable: true }
    );
  };

  const confirmClearData = async () => {
    try {
      setIsClearing(true);
      
      // Clear data and navigate immediately
      await clearAllData();
      
      // Small delay to ensure state is updated
      setTimeout(() => {
        router.replace('/onboarding');
      }, 100);
      
    } catch (error) {
      console.error('Failed to clear data:', error);
      Alert.alert(
        'Error',
        'Failed to clear data. Please try again.',
        [{ text: 'OK' }]
      );
      setIsClearing(false);
    }
  };

  if (!user && isProfileLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.subtitle}>Manage your Liftor experience</Text>
          </View>

          <Card style={styles.profileCard}>
            <View style={styles.profileHeader}>
              {session?.user?.user_metadata?.avatar_url ? (
                <ExpoImage
                  source={{ uri: session.user.user_metadata.avatar_url as string }}
                  style={styles.avatarSmall}
                  contentFit="cover"
                />
              ) : (
                <User color={theme.color.accent.primary} size={24} />
              )}
              <Text style={styles.profileTitle}>Profile</Text>
            </View>
            <View style={styles.profileInfo}>
              <View style={styles.profileNameRow}>
                <Text style={styles.profileName} testID="settings-profile-name">
                  {profile?.name ?? session?.user?.user_metadata?.name ?? user?.name ?? session?.user?.email ?? '—'}
                </Text>
                <View style={[
                  styles.subscriptionBadge,
                  subscriptionInfo.status === 'elite' ? styles.eliteBadge : styles.trialBadge
                ]}>
                  <Text style={[
                    styles.subscriptionText,
                    subscriptionInfo.status === 'elite' ? styles.eliteText : styles.trialText
                  ]}>
                    {subscriptionInfo.label}
                  </Text>
                </View>
              </View>
              {!!session?.user?.email && (
                <Text style={styles.profileDetail}>{session.user.email}</Text>
              )}
              <Text style={styles.profileDetail}>
                Goal: {GOALS.find(g => g.id === user?.goal)?.label ?? '—'}
              </Text>
              <Text style={styles.profileDetail}>
                Training Days: {user?.trainingDays ?? 0} per week
              </Text>
            </View>
          </Card>

          <Card style={styles.quickManageCard}>
            <View style={styles.quickManageInner}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => router.push('/profile')}
                testID="edit-profile"
              >
                <View style={styles.actionButtonLeft}>
                  <Pencil color={theme.color.accent.blue} size={20} />
                  <Text style={styles.actionButtonText}>Edit Profile</Text>
                </View>
                <ChevronRight color={theme.color.muted} size={16} />
              </TouchableOpacity>
            </View>
          </Card>

          <Card style={styles.weeklyCallsCard}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.disabledActionButton]}
              onPress={() => setShowWeeklyCallsModal(true)}
              testID="weekly-calls"
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Weekly Calls (Coming soon). Opens info sheet."
              accessibilityHint="Opens info about the upcoming weekly call feature"
            >
              <View style={styles.actionButtonLeft}>
                <Phone color={theme.color.muted} size={20} />
                <View style={styles.weeklyCallsTextContainer}>
                  <Text style={[styles.actionButtonText, styles.disabledActionButtonText]}>Weekly Calls</Text>
                  <Text style={styles.comingSoonText}>Coming Soon</Text>
                </View>
              </View>
              <ChevronRight color={theme.color.muted} size={16} />
            </TouchableOpacity>
          </Card>

          <Card style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Target color={theme.color.accent.green} size={24} />
              <Text style={styles.settingTitle}>Fitness Goal</Text>
            </View>
            <Text style={styles.settingValue}>
              {GOALS.find(g => g.id === user?.goal)?.description ?? 'No goal selected'}
            </Text>
          </Card>

          <Card style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Dumbbell color={theme.color.accent.blue} size={24} />
              <Text style={styles.settingTitle}>Equipment</Text>
            </View>
            <Text style={styles.settingValue}>
              {user?.equipment && user.equipment.length > 0 ? user.equipment.join(', ') : 'None specified'}
            </Text>
          </Card>

          <Card style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Utensils color={theme.color.accent.green} size={24} />
              <Text style={styles.settingTitle}>Dietary Preferences</Text>
            </View>
            <Text style={styles.settingValue}>
              {(user?.dietaryPrefs ?? []).join(', ')}
            </Text>
          </Card>

          <Card style={styles.statsCard}>
            <Text style={styles.statsTitle}>Your Progress</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{checkins.length}</Text>
                <Text style={styles.statLabel}>Total Check-ins</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{plans.length}</Text>
                <Text style={styles.statLabel}>Plans Generated</Text>
              </View>
            </View>
          </Card>

          <Card style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Bell color={theme.color.accent.blue} size={24} />
              <Text style={styles.settingTitle}>Notifications</Text>
            </View>

            <View style={[styles.notificationToggleContainer, styles.notificationRow]}>
              <View style={styles.notificationToggleLeft}>
                <Text style={styles.notificationToggleLabel}>Enable Notifications</Text>
                <Text style={styles.notificationSubtext}>
                  {`Includes workout reminders${user?.preferredTrainingTime ? ` (10 min before ${user.preferredTrainingTime})` : ''} and daily check-in alerts ${user?.checkInReminderTime ? `(${user.checkInReminderTime})` : '(set your time in Edit Profile)'}.`}
                </Text>
              </View>
              <Switch
                value={allNotificationsEnabled}
                onValueChange={async (value) => {
                  setAllNotificationsEnabled(value);
                  
                  // Use centralized NotificationService for all notification management
                  // This ensures preferences are user-scoped and properly persisted
                  await NotificationService.setAllNotificationsEnabled(value);
                  
                  if (value && user) {
                    // Check if user has a verified base plan for workout reminders
                    const jobState = await getBasePlanJobState(session?.user?.id ?? null);
                    const hasVerifiedPlan = jobState.verified;
                    
                    // Schedule reminders using user's configured times
                    // These are IDEMPOTENT - won't reschedule if already scheduled for same time
                    if (user.preferredTrainingTime) {
                      await NotificationService.scheduleWorkoutReminder(
                        user.preferredTrainingTime,
                        hasVerifiedPlan,
                        true // Force reschedule since we just enabled
                      );
                    }
                    if (user.checkInReminderTime) {
                      await NotificationService.scheduleCheckInReminder(
                        user.checkInReminderTime,
                        true // Force reschedule since we just enabled
                      );
                    }
                  }
                  // If disabling, NotificationService.setAllNotificationsEnabled already cancels reminders
                }}
                trackColor={{ 
                  false: theme.color.line, 
                  true: theme.color.accent.primary + '40' 
                }}
                thumbColor={allNotificationsEnabled ? theme.color.accent.primary : theme.color.muted}
              />
            </View>
          </Card>

          <Card style={styles.faqCard}>
            <TouchableOpacity
              style={styles.faqToggleButton}
              onPress={() => setShowFaqs(prev => !prev)}
              activeOpacity={0.8}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Toggle Frequently Asked Questions"
            >
              <View style={styles.faqHeader}>
                <HelpCircle color={theme.color.accent.primary} size={24} />
                <Text style={styles.faqTitle}>Frequently Asked Questions</Text>
              </View>
              {showFaqs ? (
                <ChevronUp color={theme.color.accent.primary} size={20} />
              ) : (
                <ChevronDown color={theme.color.muted} size={20} />
              )}
            </TouchableOpacity>
            {showFaqs && (
              <View style={styles.faqList}>
                {faqData.map((faq, index) => (
                  <View key={index} style={styles.faqItem}>
                    <Text style={styles.faqQuestion}>{faq.question}</Text>
                    <View style={styles.faqAnswerContainer}>
                      <Text style={styles.faqAnswer}>{faq.answer}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>Health & Nutrition</Text>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push('/supplements')}
            >
              <View style={styles.actionButtonLeft}>
                <Pill color={theme.color.ink} size={20} />
                <Text style={styles.actionButtonText}>View Supplements</Text>
              </View>
              <ChevronRight color={theme.color.muted} size={20} />
            </TouchableOpacity>
          </Card>

          <Card style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>Account</Text>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
                Alert.alert(
                  'Confirm Logout',
                  'Are you sure you want to log out?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'OK',
                      onPress: async () => {
                        try {
                          // Persist local data to backend before signing out
                          try { await syncLocalToBackend(); } catch {}
                          await signOut();
                          // Clear any user-scoped local data so nothing leaks across accounts
                          try { await clearAllData(); } catch {}
                        } finally {
                          router.replace('/auth/login');
                        }
                      },
                    },
                  ],
                  { cancelable: true }
                );
              }}
              testID="sign-out"
            >
              <View style={styles.actionButtonLeft}>
                <LogOut color={theme.color.accent.primary} size={20} />
                <Text style={styles.actionButtonText}>Sign out</Text>
              </View>
            </TouchableOpacity>
          </Card>

          <Card style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>Data Management</Text>
            
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleExportData}
            >
              <View style={styles.actionButtonLeft}>
                <Download color={theme.color.accent.green} size={20} />
                <Text style={styles.actionButtonText}>Export My Data</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.dangerButton, isClearing && styles.disabledButton]}
              onPress={handleClearData}
              disabled={isClearing}
            >
              <View style={styles.actionButtonLeft}>
                <Trash2 color={isClearing ? theme.color.muted : theme.color.accent.primary} size={20} />
                <Text style={[styles.actionButtonText, styles.dangerText, isClearing && styles.disabledText]}>
                  {isClearing ? 'Clearing Data...' : 'Clear All Data'}
                </Text>
              </View>
            </TouchableOpacity>
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Liftor v3.4</Text>
            <Text style={styles.footerSubtext}>
              Your fitness companion
            </Text>
          </View>
        </ScrollView>
      </View>

      {/* Weekly Calls Info Modal */}
      <Modal
        visible={showWeeklyCallsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowWeeklyCallsModal(false)}
        accessible={true}
        accessibilityLabel="Weekly Calls Information Modal"
      >
        <View style={styles.modalOverlay} pointerEvents="box-none">
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Phone color={theme.color.accent.primary} size={24} />
                <Text style={styles.modalTitle}>Weekly Calls</Text>
              </View>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowWeeklyCallsModal(false)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Close modal"
              >
                <X color={theme.color.muted} size={24} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalDescription}>
              Weekly 1:1 calls to review your check-ins and adjust your plan. Feature is coming soon.
            </Text>
            
            <View style={styles.notificationToggleContainer}>
              <Text style={styles.notificationToggleLabel}>Notify me when available</Text>
              <Switch
                value={notifyWhenAvailable}
                onValueChange={setNotifyWhenAvailable}
                trackColor={{ 
                  false: theme.color.line, 
                  true: theme.color.accent.primary + '40' 
                }}
                thumbColor={notifyWhenAvailable ? theme.color.accent.primary : theme.color.muted}
                accessible={true}
                accessibilityRole="switch"
                accessibilityLabel="Notify when Weekly Calls feature is available"
                accessibilityState={{ checked: notifyWhenAvailable }}
              />
            </View>
            
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => setShowWeeklyCallsModal(false)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Got it, close modal"
            >
              <Text style={styles.modalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.space.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.space.xxl,
    marginTop: theme.space.lg,
  },
  title: {
    fontSize: theme.size.h1,
    fontWeight: '700',
    color: theme.color.ink,
  },
  subtitle: {
    fontSize: theme.size.body,
    color: theme.color.muted,
    marginTop: 4,
  },
  profileCard: {
    marginBottom: theme.space.lg,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space.md,
    gap: theme.space.sm,
  },
  profileTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
  },
  profileInfo: {
    gap: theme.space.xs,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
    flex: 1,
  },
  subscriptionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  eliteBadge: {
    backgroundColor: '#FFD700',
  },
  trialBadge: {
    backgroundColor: theme.color.accent.blue + '20',
    borderWidth: 1,
    borderColor: theme.color.accent.blue,
  },
  subscriptionText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  eliteText: {
    color: '#000',
  },
  trialText: {
    color: theme.color.accent.blue,
  },
  profileDetail: {
    fontSize: 14,
    color: theme.color.muted,
  },
  settingCard: {
    marginBottom: theme.space.md,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space.xs,
    gap: theme.space.sm,
  },
  settingTitle: {
    fontSize: theme.size.body,
    fontWeight: '600',
    color: theme.color.ink,
  },
  settingValue: {
    fontSize: 14,
    color: theme.color.muted,
    lineHeight: 20,
  },
  statsCard: {
    marginBottom: theme.space.lg,
    marginTop: theme.space.sm,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.md,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.accent.primary,
  },
  statLabel: {
    fontSize: theme.size.label,
    color: theme.color.muted,
    marginTop: 4,
  },
  actionsCard: {
    marginBottom: theme.space.lg,
  },
  quickManageCard: {
    marginBottom: theme.space.lg,
  },
  quickManageInner: {
    gap: theme.space.sm,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.space.md,
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    marginBottom: theme.space.sm,
  },
  actionButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  dangerButton: {
    backgroundColor: theme.color.accent.primary + '10',
    borderColor: theme.color.accent.primary + '30',
  },
  actionButtonText: {
    fontSize: theme.size.body,
    fontWeight: '500',
    color: theme.color.ink,
  },
  dangerText: {
    color: theme.color.accent.primary,
  },
  disabledButton: {
    opacity: 0.6,
  },
  disabledText: {
    color: theme.color.muted,
  },
  footer: {
    alignItems: 'center',
    marginTop: theme.space.lg,
    paddingTop: theme.space.lg,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.muted,
  },
  footerSubtext: {
    fontSize: theme.size.label,
    color: theme.color.muted,
    opacity: 0.7,
    marginTop: 4,
  },
  avatarSmall: { width: 28, height: 28, borderRadius: 14 },
  // Weekly Calls styles
  weeklyCallsCard: {
    marginBottom: theme.space.lg,
    opacity: 0.8,
  },
  disabledActionButton: {
    backgroundColor: theme.color.card + '80',
    borderColor: theme.color.line + '80',
  },
  disabledActionButtonText: {
    color: theme.color.muted,
  },
  weeklyCallsTextContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  comingSoonText: {
    fontSize: 12,
    color: theme.color.accent.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.color.bg,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.space.lg,
    paddingBottom: theme.space.xl,
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space.lg,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
  },
  modalCloseButton: {
    padding: theme.space.xs,
  },
  modalDescription: {
    fontSize: 16,
    color: theme.color.ink,
    lineHeight: 24,
    marginBottom: theme.space.md,
  },
  modalSubtext: {
    fontSize: 14,
    color: theme.color.muted,
    marginBottom: theme.space.xl,
    fontStyle: 'italic',
  },
  notificationToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.sm,
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    marginBottom: theme.space.lg,
  },
  notificationToggleLabel: {
    fontSize: 16,
    color: theme.color.ink,
    fontWeight: '500',
  },
  notificationSubtext: {
    fontSize: 12,
    color: theme.color.muted,
    marginTop: 4,
  },
  notificationRow: {
    alignItems: 'center',
  },
  notificationToggleLeft: {
    flex: 1,
    paddingRight: theme.space.sm,
  },
  modalButton: {
    backgroundColor: theme.color.accent.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center',
    marginTop: theme.space.sm,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.bg,
  },
  // FAQ styles
  faqCard: {
    marginBottom: theme.space.lg,
    marginTop: theme.space.sm,
  },
  faqToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space.xs,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    gap: theme.space.sm,
  },
  faqTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
  },
  faqList: {
    marginTop: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    paddingTop: theme.space.md,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
    paddingBottom: theme.space.md,
    marginBottom: theme.space.md,
  },
  faqQuestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  faqQuestion: {
    fontSize: theme.size.body,
    fontWeight: '600',
    color: theme.color.ink,
    flex: 1,
    lineHeight: 22,
  },
  faqAnswerContainer: {
    marginTop: theme.space.sm,
    paddingLeft: theme.space.xs,
  },
  faqAnswer: {
    fontSize: 14,
    color: theme.color.muted,
    lineHeight: 20,
  },
});