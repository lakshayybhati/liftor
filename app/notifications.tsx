/**
 * Notification Center Screen
 * 
 * Displays in-app notifications with pull-to-refresh, mark as read,
 * and clear history functionality.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { Bell, ChevronLeft, CheckCheck, Trash2, BellOff, Dumbbell, Target, AlertTriangle, Gift } from 'lucide-react-native';
import { theme } from '@/constants/colors';
import { NotificationService, InAppNotification } from '@/services/NotificationService';
import { logProductionMetric, getProductionConfig } from '@/utils/production-config';

// ============================================================================
// NOTIFICATION ITEM COMPONENT
// ============================================================================

interface NotificationItemProps {
  notification: InAppNotification;
  onPress: (notification: InAppNotification) => void;
}

function NotificationItem({ notification, onPress }: NotificationItemProps) {
  const getIcon = () => {
    const iconSize = 20;
    const iconColor = notification.read ? theme.color.muted : theme.color.accent.primary;
    
    switch (notification.type) {
      case 'base_plan_ready':
        return <Dumbbell size={iconSize} color={theme.color.accent.green} />;
      case 'base_plan_error':
        return <AlertTriangle size={iconSize} color={theme.color.accent.yellow} />;
      case 'milestone':
        return <Target size={iconSize} color={theme.color.accent.primary} />;
      case 'custom':
        return <Gift size={iconSize} color={theme.color.luxe.orchid} />;
      default:
        return <Bell size={iconSize} color={iconColor} />;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !notification.read && styles.notificationItemUnread,
      ]}
      onPress={() => onPress(notification)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationIcon}>
        {getIcon()}
      </View>
      <View style={styles.notificationContent}>
        <Text style={[styles.notificationTitle, !notification.read && styles.notificationTitleUnread]}>
          {notification.title}
        </Text>
        <Text style={styles.notificationBody} numberOfLines={2}>
          {notification.body}
        </Text>
        <Text style={styles.notificationTime}>
          {formatTime(notification.createdAt)}
        </Text>
      </View>
      {!notification.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <BellOff size={48} color={theme.color.muted} />
      </View>
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptyBody}>
        Complete a check-in to start receiving personalized reminders and milestone celebrations.
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => router.push('/checkin')}
        activeOpacity={0.8}
      >
        <Text style={styles.emptyButtonText}>Start Check-in</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// MAIN SCREEN
// ============================================================================

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const items = await NotificationService.getInAppNotifications();
      setNotifications(items);
    } catch (error) {
      console.error('[NotificationsScreen] Error loading notifications:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load on focus
  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      loadNotifications();

      // Log telemetry
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('data', 'notification_center_opened', {
          timestamp: new Date().toISOString(),
        });
      }
    }, [loadNotifications])
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  const handleNotificationPress = useCallback(async (notification: InAppNotification) => {
    // Mark as read
    if (!notification.read) {
      await NotificationService.markInAppNotificationRead(notification.id);
      setNotifications(prev =>
        prev.map(n => (n.id === notification.id ? { ...n, read: true } : n))
      );

      // Log telemetry
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('data', 'notification_read', {
          type: notification.type,
          notificationId: notification.id,
        });
      }
    }

    // Navigate if link provided
    if (notification.link) {
      router.push(notification.link as any);
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      // Mark all as read
      for (const n of notifications.filter(n => !n.read)) {
        await NotificationService.markInAppNotificationRead(n.id);
      }
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));

      // Log telemetry
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('data', 'notification_mark_all_read', {
          count: notifications.filter(n => !n.read).length,
        });
      }
    } catch (error) {
      console.error('[NotificationsScreen] Error marking all as read:', error);
    }
  }, [notifications]);

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      'Clear Notification History',
      'This will permanently delete all notifications. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await NotificationService.clearAllInAppNotifications();
              setNotifications([]);

              // Log telemetry
              const config = getProductionConfig();
              if (config.isProduction) {
                logProductionMetric('data', 'notification_history_cleared', {
                  count: notifications.length,
                });
              }
            } catch (error) {
              console.error('[NotificationsScreen] Error clearing notifications:', error);
            }
          },
        },
      ]
    );
  }, [notifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ChevronLeft size={24} color={theme.color.ink} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerActions}>
          {notifications.length > 0 && unreadCount > 0 && (
            <TouchableOpacity
              style={styles.headerAction}
              onPress={handleMarkAllRead}
              activeOpacity={0.7}
            >
              <CheckCheck size={20} color={theme.color.accent.primary} />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              style={styles.headerAction}
              onPress={handleClearHistory}
              activeOpacity={0.7}
            >
              <Trash2 size={20} color={theme.color.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.color.accent.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationItem
              notification={item}
              onPress={handleNotificationPress}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.color.accent.primary}
              colors={[theme.color.accent.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
  },
  headerBadge: {
    backgroundColor: theme.color.accent.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    minWidth: 24,
    alignItems: 'center',
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerAction: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // List
  listContent: {
    padding: theme.space.md,
  },
  separator: {
    height: theme.space.sm,
  },

  // Notification Item
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: theme.space.md,
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  notificationItemUnread: {
    borderColor: theme.color.accent.primary + '40',
    backgroundColor: theme.color.card,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.color.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.space.sm,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.color.ink,
    marginBottom: 4,
  },
  notificationTitleUnread: {
    fontWeight: '600',
  },
  notificationBody: {
    fontSize: 14,
    color: theme.color.muted,
    lineHeight: 20,
    marginBottom: 6,
  },
  notificationTime: {
    fontSize: 12,
    color: theme.color.muted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.accent.primary,
    marginLeft: theme.space.xs,
    marginTop: 6,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.space.xl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.color.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 15,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.space.lg,
  },
  emptyButton: {
    backgroundColor: theme.color.accent.primary,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.pill,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});






