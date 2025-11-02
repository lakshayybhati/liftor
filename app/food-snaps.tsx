import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Image } from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2, ChevronLeft } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { getSignedUrls } from '@/utils/signed-url-cache';

export default function FoodSnapsScreen() {
  const insets = useSafeAreaInsets();
  const { getTodayFoodLog, removeExtraFood } = useUserStore();
  const { supabase } = useAuth();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [signedMap, setSignedMap] = useState<Record<string,string>>({});

  const allExtras = useMemo(() => {
    const todayLog = getTodayFoodLog();
    const items = todayLog?.extras || [];
    // Snap view → filter by explicit source when available, fallback to presence of imagePath
    return items.filter((e: any) => (e.source ? e.source === 'snap' : !!e.imagePath));
  }, [getTodayFoodLog]);

  useEffect(() => {
    const imagePaths = (allExtras || []).map((e: any) => e.imagePath).filter(Boolean);
    if (imagePaths.length === 0) return;
    (async () => {
      try {
        const m = await getSignedUrls(supabase, 'food_snaps', imagePaths, 60);
        setSignedMap(m);
      } catch {}
    })();
  }, [allExtras, supabase]);

  const confirmDelete = useCallback((id: string) => {
    Alert.alert(
      'Remove snap',
      "This will exclude this food from today's totals.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          setIsDeleting(id);
          const ok = await removeExtraFood(id);
          setIsDeleting(null);
          if (!ok) Alert.alert('Error', 'Could not remove this item.');
        }},
      ]
    );
  }, [removeExtraFood]);

  const renderItem = ({ item }: any) => (
    <Card style={styles.itemCard}>
      <View style={styles.itemRow}>
        {!!item.imagePath && (
          <Image source={{ uri: signedMap[item.imagePath] || '' }} style={styles.thumb} />
        )}
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemMeta}>
            {Math.round(item.calories)} kcal · P {Math.round(item.protein)}g · C {Math.round(item.carbs)}g · F {Math.round(item.fat)}g
          </Text>
          {!!item.notes && (
            <Text style={styles.itemPortion}>Notes: {item.notes}</Text>
          )}
        </View>
        <TouchableOpacity 
          onPress={() => confirmDelete(item.id)}
          style={styles.deleteBtn}
          disabled={isDeleting === item.id}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name}`}
        >
          <Trash2 color={isDeleting === item.id ? theme.color.muted : theme.color.accent.primary} size={20} />
        </TouchableOpacity>
      </View>
    </Card>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <Stack.Screen 
        options={{ 
          title: 'Food Snaps',
          headerShown: true,
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 8 }}>
              <ChevronLeft color={theme.color.ink} size={22} />
            </TouchableOpacity>
          )
        }} 
      />

      {allExtras.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No snaps yet</Text>
          <Text style={styles.emptySubtitle}>Use Snap Food to add additional items beyond your plan.</Text>
        </View>
      ) : (
        <FlatList
          data={allExtras}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
          updateCellsBatchingPeriod={50}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  listContent: { padding: theme.space.lg },
  itemCard: { marginBottom: theme.space.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: theme.color.card },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: theme.color.ink },
  itemMeta: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  itemPortion: { fontSize: 12, color: theme.color.muted, marginTop: 2, fontStyle: 'italic' },
  deleteBtn: { padding: 8 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space.lg },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.color.ink, marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: theme.color.muted, textAlign: 'center' },
});





