import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, TextInput, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { KeyboardDismissView } from '@/components/ui/KeyboardDismissView';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Camera, X, Check, Zap } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/hooks/useUserStore';
const reportError = (e: any) => { /* no-op if Sentry is not installed */ };
import { theme } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';

interface FoodAnalysisResponse {
  items: {
    name: string;
    quantity: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }[];
  totals: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  confidence: number;
  notes?: string;
}

interface ManualFoodEntry {
  name: string;
  portionSize: string;
}

export default function SnapFoodScreen() {
  const params = useLocalSearchParams<{ manual?: string }>();
  const { addExtraFood, removeExtraFood } = useUserStore();
  const { supabase, session } = useAuth();
  const insets = useSafeAreaInsets();
  const isManualOnly = params?.manual === '1';
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<FoodAnalysisResponse | null>(null);
  const [extraNotes, setExtraNotes] = useState('');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const [circuitOpenUntil, setCircuitOpenUntil] = useState<number | null>(null);
  const [manualEntry, setManualEntry] = useState<ManualFoodEntry>({
    name: '',
    portionSize: '',
  });
  const [isAnalyzingManual, setIsAnalyzingManual] = useState(false);
  const [manualAnalysisResult, setManualAnalysisResult] = useState<FoodAnalysisResponse | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [manualAnalysisProgress, setManualAnalysisProgress] = useState<number>(0);
  const cameraRef = useRef<CameraView>(null);

  // On-device rate limiting/backoff helpers
  const [onDeviceCallCount, setOnDeviceCallCount] = useState<{ count: number; resetAt: number }>({ count: 0, resetAt: Date.now() + 3600000 });
  const MAX_ON_DEVICE_CALLS_PER_HOUR = 50;

  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    if (now > onDeviceCallCount.resetAt) {
      setOnDeviceCallCount({ count: 0, resetAt: now + 3600000 });
      return true;
    }
    return onDeviceCallCount.count < MAX_ON_DEVICE_CALLS_PER_HOUR;
  }, [onDeviceCallCount]);

  const incrementRateLimit = useCallback(() => {
    setOnDeviceCallCount(prev => ({ ...prev, count: prev.count + 1 }));
  }, []);

  const retryWithBackoff = useCallback(async <T,>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        const status = (error && typeof error === 'object' && 'status' in error) ? (error as any).status : undefined;
        const isRetryable = status === 429 || (typeof status === 'number' && status >= 500);
        if (i === maxRetries - 1 || !isRetryable) throw error;
        const baseDelay = 1000 * Math.pow(2, i);
        const jitter = Math.random() * 500;
        await new Promise(r => setTimeout(r, baseDelay + jitter));
      }
    }
    throw new Error('Max retries exceeded');
  }, []);

  useEffect(() => {
    if (isManualOnly) return;
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission, isManualOnly]);

  useEffect(() => {
    if (params?.manual === '1') {
      setShowManualEntry(true);
    }
  }, [params]);

  // Animated progress while analyzing snap
  useEffect(() => {
    let timer: any;
    if (isAnalyzing) {
      setAnalysisProgress(0);
      timer = setInterval(() => {
        setAnalysisProgress(prev => {
          const inc = 2 + Math.random() * 4; // 2–6%
          const next = prev + inc;
          return Math.min(next, 92);
        });
      }, 250);
    } else {
      setAnalysisProgress(0);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isAnalyzing]);

  // Animated progress while analyzing manual
  useEffect(() => {
    let timer: any;
    if (isAnalyzingManual) {
      setManualAnalysisProgress(0);
      timer = setInterval(() => {
        setManualAnalysisProgress(prev => {
          const inc = 2 + Math.random() * 4; // 2–6%
          const next = prev + inc;
          return Math.min(next, 92);
        });
      }, 250);
    } else {
      setManualAnalysisProgress(0);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isAnalyzingManual]);

  const compressImage = useCallback(async (uri: string): Promise<string> => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      return result.uri;
    } catch (error) {
      console.error('Error compressing image:', error);
      return uri;
    }
  }, []);

  // On-device AI helpers
  const analyzeManualOnDevice = useCallback(async (name: string, portion: string, notes?: string): Promise<FoodAnalysisResponse> => {
    const apiKey = process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY || process.env.EXPO_PUBLIC_AI_API_KEY;
    if (!apiKey) throw { status: 500, message: 'DeepSeek API key not configured' };

    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a nutrition expert. Return ONLY JSON with fields: items[{name,quantity,calories,protein_g,carbs_g,fat_g}], totals{kcal,protein_g,carbs_g,fat_g}, confidence (0..1), notes.' },
          { role: 'user', content: `Food: ${name}\nPortion: ${portion}\nNotes: ${notes ?? ''}\nReturn valid JSON only.` }
        ],
        temperature: 0.2
      })
    });
    if (!r.ok) throw { status: r.status, message: `DeepSeek failed: ${await r.text().catch(() => '')}` };
    const j = await r.json().catch(() => ({}));
    const text = j?.choices?.[0]?.message?.content ?? '{}';
    return JSON.parse(text);
  }, []);

  const analyzeImageOnDevice = useCallback(async (imageUri: string, notes?: string): Promise<FoodAnalysisResponse> => {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) throw { status: 500, message: 'Gemini API key not configured' };
    const model = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';

    const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            { text: `Analyze this food image and estimate nutrition. ${notes ?? ''}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: 'application/json',
        response_schema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  quantity: { type: 'string' },
                  calories: { type: 'number' },
                  protein_g: { type: 'number' },
                  carbs_g: { type: 'number' },
                  fat_g: { type: 'number' },
                },
                required: ['name', 'quantity', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
              },
            },
            totals: {
              type: 'object',
              properties: {
                kcal: { type: 'number' },
                protein_g: { type: 'number' },
                carbs_g: { type: 'number' },
                fat_g: { type: 'number' },
              },
              required: ['kcal', 'protein_g', 'carbs_g', 'fat_g'],
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            notes: { type: 'string' },
          },
          required: ['items', 'totals', 'confidence'],
        },
      },
    } as const;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw { status: res.status, message: `Gemini failed: ${await res.text().catch(() => '')}` };
    const json = await res.json().catch(() => ({}));
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    return JSON.parse(text);
  }, []);

  // Helpers for Storage path + idempotency
  const makeId = useCallback(() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, []);
  const friendlyErrorMessage = useCallback((error: any): string => {
    // Check for structured error codes first
    const errorCode = (error as any)?.code;
    if (errorCode) {
      switch (errorCode) {
        case 'MODEL_TIMEOUT':
          return 'Analysis took too long—try again or use Manual.';
        case 'PARSE_FAILED':
          return "Couldn't read nutrition—edit values manually.";
        case 'RATE_LIMITED':
          return 'Daily analysis limit reached—try tomorrow.';
        case 'STORAGE_ERROR':
          return 'Failed to access the image. Please try taking another photo.';
        case 'UNAUTHORIZED':
          return 'Session expired. Please sign in again.';
        case 'INTERNAL':
          if (error.message?.includes('API key')) {
            return 'Service configuration issue. Please contact support.';
          }
          return 'Service temporarily unavailable. Please try manual entry.';
        default:
          break;
      }
    }
    
    // Fallback to message parsing
    const raw = typeof error === 'string' ? error : (error?.message || JSON.stringify(error || {}));
    const msg = String(raw);
    if (/MODEL_TIMEOUT|timeout/i.test(msg)) return 'Analysis took too long—try again or use Manual.';
    if (/PARSE_FAILED|parse/i.test(msg)) return "Couldn't read nutrition—edit values manually.";
    if (/RATE_LIMITED|429|Too Many/i.test(msg)) return 'Daily analysis limit reached—try tomorrow.';
    if (/API key|not configured/i.test(msg)) return 'Service configuration issue. Please use manual entry.';
    return 'Could not analyze the food. Would you like to enter the details manually?';
  }, []);
  const buildStoragePath = useCallback(() => {
    const uid = session?.user?.id;
    if (!uid) return null;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const id = makeId();
    return `${uid}/${yyyy}/${mm}/${dd}/${id}.jpg`;
  }, [session?.user?.id, makeId]);

  const uploadImageToStorage = useCallback(async (uri: string): Promise<string> => {
    if (!session?.user?.id) throw new Error('Not signed in');
    const path = buildStoragePath();
    if (!path) throw new Error('Could not determine storage path');
    const res = await fetch(uri);
    const blob = await res.blob();
    const { error } = await supabase.storage.from('food_snaps').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return path;
  }, [buildStoragePath, session?.user?.id, supabase.storage]);

  // Helper: resilient upsert that retries without image_path if schema lacks it
  const upsertFoodExtras = useCallback(async (payload: any) => {
    const attemptUpsert = async (p: any) =>
      await supabase
        .from('food_extras')
        .upsert(p, { onConflict: 'user_id,idempotency_key' })
        .select('id,name,calories,protein,carbs,fat,confidence,notes,source,image_path')
        .single();

    const attemptInsert = async (p: any) =>
      await supabase
        .from('food_extras')
        .insert(p)
        .select('id,name,calories,protein,carbs,fat,confidence,notes,source,image_path')
        .single();

    // Make a working copy we can mutate as we strip unknown columns
    const working: Record<string, any> = { ...payload };

    // Try up to 5 times, removing unknown columns when PostgREST reports them
    for (let i = 0; i < 5; i++) {
      const { data, error } = await attemptUpsert(working);
      if (!error) return data;

      const msg = (error as any)?.message || '';
      const code = (error as any)?.code || '';

      // Handle missing column errors: remove the named column and retry
      if (code === 'PGRST204' || /schema cache|Could not find/i.test(msg)) {
        // Try to extract the missing column between quotes
        const m = msg.match(/the '([^']+)' column/i);
        const missingCol = m?.[1];
        const candidates = missingCol ? [missingCol] : ['image_path','portion_weight_g','day_key_local','occurred_at_utc','confidence','notes','source','idempotency_key'];
        let removed = false;
        for (const key of candidates) {
          if (key in working) {
            delete (working as any)[key];
            removed = true;
          }
        }
        if (removed) continue;
      }

      // If conflict target/idempotency not supported on this schema, try plain insert
      if (/idempotency_key|on conflict|does not exist|schema cache/i.test(msg)) {
        const legacy: Record<string, any> = { ...working };
        delete legacy.idempotency_key;
        delete legacy.image_path;
        const { data: d2, error: e2 } = await attemptInsert(legacy);
        if (!e2) return d2;
        throw e2;
      }

      // Legacy schemas that still require a 'date' column
      if (/null value in column\s+"date"|column\s+"date"\s+of relation/i.test(msg)) {
        const legacyWithDate: Record<string, any> = { ...working };
        // Use local day; PostgREST accepts ISO date or YYYY-MM-DD
        legacyWithDate.date = new Date().toISOString();
        const { data: d3, error: e3 } = await attemptInsert(legacyWithDate);
        if (!e3) return d3;
        throw e3;
      }

      throw error;
    }

    throw new Error('Could not save extra after removing unknown columns');
  }, [supabase]);

  // Helper: timeout + retry wrapper with enhanced error capture
  const invokeWithRetry = useCallback(async (body: any, headers?: Record<string, string>) => {
    const attempt = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const { data, error } = await supabase.functions.invoke('macros', { body, headers });
        if (error) {
          // Enhanced error logging
          console.error('[snap-food] Function error:', {
            status: error.status,
            message: error.message,
            context: error.context,
            details: (error as any).details || (error as any).response || error
          });
          
          // Try to extract structured error from context
          const errorPayload = (error as any).context?.response || (error as any).details;
          if (errorPayload?.code) {
            const enhancedError = new Error(errorPayload.message || error.message);
            (enhancedError as any).code = errorPayload.code;
            (enhancedError as any).status = error.status;
            throw enhancedError;
          }
          throw error;
        }
        return data;
      } finally {
        clearTimeout(timeout);
      }
    };
    let lastErr: any = null;
    for (let i = 0; i < 3; i++) {
      try {
        return await attempt();
      } catch (e: any) {
        console.error(`[snap-food] Attempt ${i + 1} failed:`, e);
        lastErr = e;
        // Don't retry on certain error codes
        if (e.code && ['UNAUTHORIZED', 'BAD_INPUT', 'INTERNAL'].includes(e.code)) {
          throw e;
        }
        if (i < 2) {
          await new Promise(r => setTimeout(r, 300 * (i + 1)));
        }
      }
    }
    throw lastErr;
  }, [supabase.functions]);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo?.uri) {
        const compressedUri = await compressImage(photo.uri);
        setCapturedImageUri(compressedUri);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture. Please try again.');
    }
  }, [compressImage]);

  const handleAnalyze = useCallback(async () => {
    if (circuitOpenUntil && Date.now() < circuitOpenUntil) {
      Alert.alert('Service busy', 'Image analysis is busy—use Manual Entry for now.');
      return;
    }
    if (!capturedImageUri) {
      Alert.alert('Missing Information', 'Please capture a photo first.');
      return;
    }

    setIsAnalyzing(true);
    let analysisData: FoodAnalysisResponse | null = null;
    try {
      if (checkRateLimit()) {
        try {
          analysisData = await retryWithBackoff(() => analyzeImageOnDevice(capturedImageUri, extraNotes.trim() || undefined));
          incrementRateLimit();
        } catch (onDeviceErr) {
          // Fallback to Edge Function
        }
      }

      if (!analysisData) {
        const path = await uploadImageToStorage(capturedImageUri);
        setUploadedImagePath(path);
        const data = await invokeWithRetry({
          kind: 'image',
          image_path: path,
          notes: extraNotes.trim() || undefined,
          previewOnly: true,
          occurred_at_local: new Date().toISOString(),
        });
        analysisData = data as FoodAnalysisResponse;
      }

      setAnalysisResult(analysisData);
      setFailCount(0);
      setAnalysisProgress(100);
    } catch (error: any) {
      console.error('[snap-food] Analysis failed:', {
        error,
        code: error?.code,
        status: error?.status,
        message: error?.message
      });
      reportError(error);

      const isConfigError = error?.code === 'INTERNAL' && error?.message?.includes('API key');
      if (!isConfigError) {
        const nextFails = failCount + 1;
        setFailCount(nextFails);
        if (nextFails >= 3) setCircuitOpenUntil(Date.now() + 120000);
      }

      Alert.alert(
        'Analysis Failed',
        friendlyErrorMessage(error),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Manual Entry', onPress: () => setShowManualEntry(true) },
        ]
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [capturedImageUri, extraNotes, uploadImageToStorage, invokeWithRetry, failCount, circuitOpenUntil, analyzeImageOnDevice, checkRateLimit, retryWithBackoff, incrementRateLimit]);

  const handleAddToExtras = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }

    try {
      const idem = makeId();
      if (analysisResult) {
        let imagePath = uploadedImagePath;
        if (capturedImageUri && !imagePath) {
          imagePath = await uploadImageToStorage(capturedImageUri);
          setUploadedImagePath(imagePath);
        }

        const now = new Date();
        const dayKeyLocal = now.toLocaleDateString('en-CA');
        const portionQty = analysisResult.items?.[0]?.quantity ?? null;

        const insertSnap: any = {
          user_id: session!.user!.id,
          occurred_at_utc: now.toISOString(),
          day_key_local: dayKeyLocal,
          name: analysisResult.items.map(i => i.name).join(', '),
          calories: Math.round(analysisResult.totals.kcal),
          protein: analysisResult.totals.protein_g,
          carbs: analysisResult.totals.carbs_g,
          fat: analysisResult.totals.fat_g,
          portion: portionQty,
          portion_weight_g: null,
          confidence: analysisResult.confidence ?? null,
          notes: extraNotes.trim() || analysisResult.notes || null,
          source: capturedImageUri ? 'snap' : 'manual',
          idempotency_key: idem,
        };
        if (imagePath) insertSnap.image_path = imagePath;

        const row: any = await upsertFoodExtras(insertSnap);

        await addExtraFood({
          name: row.name,
          calories: row.calories,
          protein: row.protein,
          fat: row.fat,
          carbs: row.carbs,
          confidence: row.confidence ?? undefined,
          notes: row.notes ?? undefined,
          imageUri: capturedImageUri || undefined,
          imagePath: row.image_path || undefined,
          source: 'snap',
          serverId: row.id,
        });

        Alert.alert('Added Successfully!', `${row.name} added.`, [
          { text: 'Undo', style: 'destructive', onPress: async () => { try { await removeExtraFood(row.id); } catch {}; router.back(); } },
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else if (manualAnalysisResult) {
        const now = new Date();
        const dayKeyLocal = now.toLocaleDateString('en-CA');
        const portionQty = manualAnalysisResult.items?.[0]?.quantity ?? manualEntry.portionSize;

        const insertManual: any = {
          user_id: session!.user!.id,
          occurred_at_utc: now.toISOString(),
          day_key_local: dayKeyLocal,
          name: manualAnalysisResult.items.map(i => i.name).join(', '),
          calories: Math.round(manualAnalysisResult.totals.kcal),
          protein: manualAnalysisResult.totals.protein_g,
          carbs: manualAnalysisResult.totals.carbs_g,
          fat: manualAnalysisResult.totals.fat_g,
          portion: portionQty,
          portion_weight_g: null,
          confidence: manualAnalysisResult.confidence ?? null,
          notes: extraNotes.trim() || manualAnalysisResult.notes || null,
          source: 'manual',
          idempotency_key: idem,
        };

        const row: any = await upsertFoodExtras(insertManual);

        await addExtraFood({
          name: row.name,
          calories: row.calories,
          protein: row.protein,
          fat: row.fat,
          carbs: row.carbs,
          confidence: row.confidence ?? undefined,
          notes: row.notes ?? undefined,
          imageUri: undefined,
          imagePath: row.image_path || undefined,
          source: 'manual',
          serverId: row.id,
        });

        Alert.alert('Added Successfully!', `${row.name} added.`, [
          { text: 'Undo', style: 'destructive', onPress: async () => { try { await removeExtraFood(row.id); } catch {}; router.back(); } },
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        return;
      }
    } catch (error: any) {
      console.error('[snap-food] Error adding extra food:', {
        error,
        code: error?.code,
        status: error?.status,
        message: error?.message
      });
      reportError(error);
      Alert.alert('Error', friendlyErrorMessage(error) || 'Failed to add food to extras. Please try again.');
    }
  }, [analysisResult, manualAnalysisResult, manualEntry, extraNotes, capturedImageUri, uploadedImagePath, makeId, supabase, session, addExtraFood, removeExtraFood, uploadImageToStorage]);

  const handleAnalyzeManualEntry = useCallback(async () => {
    if (!manualEntry.name.trim() || !manualEntry.portionSize.trim()) {
      Alert.alert('Missing Information', 'Please provide both food name and portion size.');
      return;
    }

    setIsAnalyzingManual(true);
    let analysisData: FoodAnalysisResponse | null = null;
    try {
      if (checkRateLimit()) {
        try {
          analysisData = await retryWithBackoff(() => analyzeManualOnDevice(
            manualEntry.name.trim(),
            manualEntry.portionSize.trim(),
            extraNotes.trim() || undefined
          ));
          incrementRateLimit();
        } catch (onDeviceErr) {
          // Fallback to Edge Function
        }
      }

      if (!analysisData) {
        const data = await invokeWithRetry({
          kind: 'text',
          name: manualEntry.name.trim(),
          portion: manualEntry.portionSize.trim(),
          notes: extraNotes.trim() || undefined,
          previewOnly: true,
          occurred_at_local: new Date().toISOString(),
        });
        analysisData = data as FoodAnalysisResponse;
      }

      setManualAnalysisResult(analysisData);
    } catch (error: any) {
      console.error('[snap-food] Manual analysis failed:', {
        error,
        code: error?.code,
        status: error?.status,
        message: error?.message
      });
      reportError(error);
      Alert.alert('Analysis Failed', friendlyErrorMessage(error));
    } finally {
      setIsAnalyzingManual(false);
    }
  }, [manualEntry, extraNotes, analyzeManualOnDevice, invokeWithRetry, checkRateLimit, retryWithBackoff, incrementRateLimit, friendlyErrorMessage]);

  const resetCapture = useCallback(() => {
    setCapturedImageUri(null);
    setShowPreview(false);
    setAnalysisResult(null);
    setExtraNotes('');
    setShowManualEntry(false);
    setManualEntry({ name: '', portionSize: '' });
    setIsAnalyzingManual(false);
    setManualAnalysisResult(null);
  }, []);

  if (isManualOnly) {
    return (
      <KeyboardDismissView style={styles.container}>
        <Stack.Screen options={{ title: 'Manual Entry', headerShown: false }} />
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => router.back()}>
              <X size={24} color={theme.color.ink} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Manual Entry</Text>
            <TouchableOpacity 
              onPress={manualAnalysisResult ? handleAddToExtras : handleAnalyzeManualEntry}
              disabled={isAnalyzingManual}
            >
              <Check size={24} color={theme.color.accent.green} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Card style={styles.manualEntryCard}>
              <Text style={styles.inputLabel}>Food Name</Text>
              <TextInput
                style={styles.textInput}
                value={manualEntry.name}
                onChangeText={(text) => setManualEntry(prev => ({ ...prev, name: text }))}
                placeholder="e.g., Grilled chicken breast"
                placeholderTextColor={theme.color.muted}
              />

              <Text style={styles.inputLabel}>Portion Size</Text>
              <TextInput
                style={styles.textInput}
                value={manualEntry.portionSize}
                onChangeText={(text) => setManualEntry(prev => ({ ...prev, portionSize: text }))}
                placeholder="e.g., 1 piece, 200g, 1 cup"
                placeholderTextColor={theme.color.muted}
              />

              <Text style={styles.portionHint}>
                We&apos;ll use AI to calculate the nutritional information based on the food name and portion size.
              </Text>

              {!manualAnalysisResult && !isAnalyzingManual && (
                <Button
                  title="Calculate Nutrition"
                  onPress={handleAnalyzeManualEntry}
                  disabled={!manualEntry.name.trim() || !manualEntry.portionSize.trim()}
                  style={styles.calculateButton}
                />
              )}

              {isAnalyzingManual && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={theme.color.accent.primary} />
                  <Text style={styles.loadingText}>Calculating nutrition...</Text>
                </View>
              )}

              {manualAnalysisResult && (
                <View style={styles.analysisResultContainer}>
                  <View style={styles.analysisHeader}>
                    <Text style={styles.analysisTitle}>Nutritional Information</Text>
                    <View style={styles.confidenceBadge}>
                      <Zap size={16} color={theme.color.accent.yellow} />
                      <Text style={styles.confidenceText}>
                        {Math.round(manualAnalysisResult.confidence * 100)}% confident
                      </Text>
                    </View>
                  </View>

                  <View style={styles.macroGrid}>
                    <View style={styles.macroItem}>
                      <Text style={styles.macroValue}>{manualAnalysisResult.totals.kcal}</Text>
                      <Text style={styles.macroLabel}>Calories</Text>
                    </View>
                    <View style={styles.macroItem}>
                      <Text style={styles.macroValue}>{Math.round(manualAnalysisResult.totals.protein_g)}g</Text>
                      <Text style={styles.macroLabel}>Protein</Text>
                    </View>
                    <View style={styles.macroItem}>
                      <Text style={styles.macroValue}>{Math.round(manualAnalysisResult.totals.fat_g)}g</Text>
                      <Text style={styles.macroLabel}>Fat</Text>
                    </View>
                    <View style={styles.macroItem}>
                      <Text style={styles.macroValue}>{Math.round(manualAnalysisResult.totals.carbs_g)}g</Text>
                      <Text style={styles.macroLabel}>Carbs</Text>
                    </View>
                  </View>

                  {manualAnalysisResult.notes && (
                    <Text style={styles.analysisNotes}>{manualAnalysisResult.notes}</Text>
                  )}

                  <Button
                    title="Recalculate"
                    onPress={() => setManualAnalysisResult(null)}
                    variant="outline"
                    style={styles.recalculateButton}
                  />
                </View>
              )}
            </Card>
          </ScrollView>
        </View>
      </KeyboardDismissView>
    );
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Camera Permission' }} />
        <View style={styles.permissionContainer}>
          <Camera size={64} color={theme.color.muted} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to snap photos of your food for nutritional analysis.
          </Text>
          <Button
            title="Grant Permission"
            onPress={requestPermission}
            style={styles.permissionButton}
          />
        </View>
      </View>
    );
  }

  if (showPreview && capturedImageUri) {
    return (
      <KeyboardDismissView style={styles.container}>
        <Stack.Screen options={{ title: 'Food Analysis' }} />
        <ScrollView style={styles.previewContainer}>
          <View style={styles.imagePreview}>
            {/* We can't show the actual image in this implementation, but we show the analysis */}
            <View style={styles.imagePlaceholder}>
              <Camera size={48} color={theme.color.muted} />
              <Text style={styles.imagePlaceholderText}>Food Photo Captured</Text>
            </View>
          </View>

          <Card style={styles.portionCard}>
            <Text style={styles.portionLabel}>Anything the picture might miss or you want us to know?</Text>
            <TextInput
              style={styles.portionInput}
              value={extraNotes}
              onChangeText={setExtraNotes}
              placeholder="e.g., extra sauce, toppings, sides, customizations"
              placeholderTextColor={theme.color.muted}
            />
            <Text style={styles.portionHint}>
              Add details not obvious from the photo to improve accuracy
            </Text>
          </Card>

          {analysisResult && (
            <Card style={styles.analysisCard}>
              <View style={styles.analysisHeader}>
                <Text style={styles.analysisTitle}>Analysis Results</Text>
                <View style={styles.confidenceBadge}>
                  <Zap size={16} color={theme.color.accent.yellow} />
                  <Text style={styles.confidenceText}>
                    {Math.round(analysisResult.confidence * 100)}% confident
                  </Text>
                </View>
              </View>

              <View style={styles.macroGrid}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{analysisResult.totals.kcal}</Text>
                  <Text style={styles.macroLabel}>Calories</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{Math.round(analysisResult.totals.protein_g)}g</Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{Math.round(analysisResult.totals.fat_g)}g</Text>
                  <Text style={styles.macroLabel}>Fat</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{Math.round(analysisResult.totals.carbs_g)}g</Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                </View>
              </View>

              {analysisResult.items.length > 0 && (
                <View style={styles.itemsList}>
                  <Text style={styles.itemsTitle}>Detected Items:</Text>
                  {analysisResult.items.map((item, index) => (
                    <Text key={index} style={styles.itemText}>
                      • {item.name} ({item.quantity})
                    </Text>
                  ))}
                </View>
              )}

              {analysisResult.notes && (
                <Text style={styles.analysisNotes}>{analysisResult.notes}</Text>
              )}
            </Card>
          )}

          <View style={styles.actionButtons}>
            {!analysisResult && !isAnalyzing && (
              <Button
                title="Analyze Food"
                onPress={handleAnalyze}
                disabled={false}
                style={styles.analyzeButton}
              />
            )}

            {isAnalyzing && (
              <View style={styles.loadingContainer}>
                <Text style={styles.progressLabel}>Analyzing your food…</Text>
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { width: `${Math.round(analysisProgress)}%` }]} />
                </View>
              </View>
            )}

            {analysisResult && (
              <Button
                title="Add to Extras"
                onPress={handleAddToExtras}
                style={styles.addButton}
              />
            )}

            <Button
              title="Manual Entry"
              onPress={() => setShowManualEntry(true)}
              variant="outline"
              style={styles.manualButton}
            />

            <Button
              title="Retake Photo"
              onPress={resetCapture}
              variant="outline"
              style={styles.retakeButton}
            />
          </View>
        </ScrollView>

        {/* Manual Entry Modal */}
        <Modal
          visible={showManualEntry}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <KeyboardDismissView style={[styles.modalContainer, { paddingTop: insets.top }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowManualEntry(false)}>
                <X size={24} color={theme.color.ink} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Manual Entry</Text>
              <TouchableOpacity 
                onPress={manualAnalysisResult ? handleAddToExtras : handleAnalyzeManualEntry}
                disabled={isAnalyzingManual}
              >
                <Check size={24} color={theme.color.accent.green} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <Card style={styles.manualEntryCard}>
                <Text style={styles.inputLabel}>Food Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={manualEntry.name}
                  onChangeText={(text) => setManualEntry(prev => ({ ...prev, name: text }))}
                  placeholder="e.g., Grilled chicken breast"
                  placeholderTextColor={theme.color.muted}
                />

                <Text style={styles.inputLabel}>Portion Size</Text>
                <TextInput
                  style={styles.textInput}
                  value={manualEntry.portionSize}
                  onChangeText={(text) => setManualEntry(prev => ({ ...prev, portionSize: text }))}
                  placeholder="e.g., 1 piece, 200g, 1 cup"
                  placeholderTextColor={theme.color.muted}
                />

                <Text style={styles.portionHint}>
                  We&apos;ll use AI to calculate the nutritional information based on the food name and portion size.
                </Text>

                {!manualAnalysisResult && !isAnalyzingManual && (
                  <Button
                    title="Calculate Nutrition"
                    onPress={handleAnalyzeManualEntry}
                    disabled={!manualEntry.name.trim() || !manualEntry.portionSize.trim()}
                    style={styles.calculateButton}
                  />
                )}

              {isAnalyzingManual && (
                <View style={styles.loadingContainer}>
                  <Text style={styles.progressLabel}>Analyzing your food…</Text>
                  <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: `${Math.round(manualAnalysisProgress)}%` }]} />
                  </View>
                </View>
              )}

                {manualAnalysisResult && (
                  <View style={styles.analysisResultContainer}>
                    <View style={styles.analysisHeader}>
                      <Text style={styles.analysisTitle}>Nutritional Information</Text>
                      <View style={styles.confidenceBadge}>
                        <Zap size={16} color={theme.color.accent.yellow} />
                        <Text style={styles.confidenceText}>
                          {Math.round(manualAnalysisResult.confidence * 100)}% confident
                        </Text>
                      </View>
                    </View>

                    <View style={styles.macroGrid}>
                      <View style={styles.macroItem}>
                        <Text style={styles.macroValue}>{manualAnalysisResult.totals.kcal}</Text>
                        <Text style={styles.macroLabel}>Calories</Text>
                      </View>
                      <View style={styles.macroItem}>
                        <Text style={styles.macroValue}>{Math.round(manualAnalysisResult.totals.protein_g)}g</Text>
                        <Text style={styles.macroLabel}>Protein</Text>
                      </View>
                      <View style={styles.macroItem}>
                        <Text style={styles.macroValue}>{Math.round(manualAnalysisResult.totals.fat_g)}g</Text>
                        <Text style={styles.macroLabel}>Fat</Text>
                      </View>
                      <View style={styles.macroItem}>
                        <Text style={styles.macroValue}>{Math.round(manualAnalysisResult.totals.carbs_g)}g</Text>
                        <Text style={styles.macroLabel}>Carbs</Text>
                      </View>
                    </View>

                    {manualAnalysisResult.notes && (
                      <Text style={styles.analysisNotes}>{manualAnalysisResult.notes}</Text>
                    )}

                    <Button
                      title="Recalculate"
                      onPress={() => setManualAnalysisResult(null)}
                      variant="outline"
                      style={styles.recalculateButton}
                    />
                  </View>
                )}
              </Card>
            </ScrollView>
          </KeyboardDismissView>
        </Modal>
      </KeyboardDismissView>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Snap Food', headerShown: false }} />
      
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
      >
        <View style={[styles.cameraOverlay, { paddingTop: insets.top }]}>
          <View style={styles.topControls}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => router.back()}
            >
              <X size={24} color="white" />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.flipButton}
              onPress={() => setFacing(current => (current === 'back' ? 'front' : 'back'))}
            >
              <Camera size={24} color="white" />
            </TouchableOpacity>
          </View>

          <View style={styles.bottomControls}>
            <View style={styles.captureContainer}>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={takePicture}
              >
                <View style={styles.captureButtonInner} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.instructionText}>
              Point camera at your food and tap to capture
            </Text>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomControls: {
    alignItems: 'center',
    paddingBottom: theme.space.xxl,
  },
  captureContainer: {
    alignItems: 'center',
    marginBottom: theme.space.lg,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'white',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.md,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.xl,
  },
  permissionTitle: {
    fontSize: theme.size.h2,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginTop: theme.space.lg,
    marginBottom: theme.space.md,
  },
  permissionText: {
    fontSize: theme.size.body,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.space.xl,
  },
  permissionButton: {
    minWidth: 200,
  },
  previewContainer: {
    flex: 1,
    padding: theme.space.lg,
  },
  imagePreview: {
    marginBottom: theme.space.lg,
  },
  imagePlaceholder: {
    height: 200,
    backgroundColor: theme.color.line,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
  },
  imagePlaceholderText: {
    fontSize: theme.size.body,
    color: theme.color.muted,
  },
  portionCard: {
    marginBottom: theme.space.lg,
  },
  portionLabel: {
    fontSize: theme.size.body,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  portionInput: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    fontSize: theme.size.body,
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  portionHint: {
    fontSize: theme.size.label,
    color: theme.color.muted,
  },
  analysisCard: {
    marginBottom: theme.space.lg,
  },
  analysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.space.md,
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    // Ensure the title wraps rather than pushing the badge outside the card
    flex: 1,
    marginRight: theme.space.sm,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.accent.yellow + '20',
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: 8,
    gap: 4,
    // Prevent the badge from shrinking or overflowing outside the container
    flexShrink: 0,
    maxWidth: 200,
  },
  confidenceText: {
    fontSize: theme.size.label,
    fontWeight: '600',
    color: theme.color.accent.yellow,
  },
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.space.md,
  },
  macroItem: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
  },
  macroLabel: {
    fontSize: theme.size.label,
    color: theme.color.muted,
    marginTop: 2,
  },
  itemsList: {
    marginBottom: theme.space.md,
  },
  itemsTitle: {
    fontSize: theme.size.body,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  itemText: {
    fontSize: theme.size.body,
    color: theme.color.muted,
    marginBottom: 2,
  },
  analysisNotes: {
    fontSize: theme.size.body,
    color: theme.color.muted,
    fontStyle: 'italic',
  },
  actionButtons: {
    gap: theme.space.md,
    paddingBottom: theme.space.xl,
  },
  analyzeButton: {
    backgroundColor: theme.color.accent.primary,
  },
  addButton: {
    backgroundColor: theme.color.accent.green,
  },
  manualButton: {
    borderColor: theme.color.accent.blue,
  },
  retakeButton: {
    borderColor: theme.color.muted,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: theme.space.xl,
    gap: theme.space.md,
  },
  loadingText: {
    fontSize: theme.size.body,
    color: theme.color.muted,
  },
  progressLabel: {
    fontSize: theme.size.body,
    color: theme.color.muted,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressContainer: {
    height: 10,
    width: '100%',
    backgroundColor: theme.color.line,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.color.accent.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
  },
  modalContent: {
    flex: 1,
    padding: theme.space.lg,
  },
  manualEntryCard: {
    gap: theme.space.md,
  },
  inputLabel: {
    fontSize: theme.size.body,
    fontWeight: '600',
    color: theme.color.ink,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    fontSize: theme.size.body,
    color: theme.color.ink,
  },
  calculateButton: {
    backgroundColor: theme.color.accent.primary,
    marginTop: theme.space.md,
  },
  analysisResultContainer: {
    marginTop: theme.space.lg,
    padding: theme.space.md,
    backgroundColor: theme.color.line + '40',
    borderRadius: theme.radius.md,
  },
  recalculateButton: {
    marginTop: theme.space.md,
    borderColor: theme.color.accent.primary,
  },
});