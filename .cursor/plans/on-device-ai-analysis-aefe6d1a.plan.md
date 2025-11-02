<!-- aefe6d1a-6ed2-45b4-9b37-cb07fbcd098b 21310a45-e048-4aee-a534-7b7e8a44b8f4 -->
# On-Device AI Analysis with Edge Function Fallback

## Overview

Refactor food analysis in `app/snap-food.tsx` to perform AI analysis directly on-device using DeepSeek for manual entries and Gemini for image snaps. Implement automatic fallback to the existing Edge Function if on-device analysis fails, use device timezone for data consistency, and add robust client-side rate limiting with exponential backoff.

## Implementation Steps

### 1. Add Rate Limiting & Backoff Utilities

Create helper functions in `app/snap-food.tsx` for:

- **Rate limiter**: Track API calls per minute/hour to prevent abuse
- **Exponential backoff**: Retry failed requests with increasing delays (1s, 2s, 4s) and random jitter
- **Circuit breaker**: Already exists (lines 57, 229-232) - enhance with on-device tracking
```typescript
// Add state for rate limiting
const [onDeviceCallCount, setOnDeviceCallCount] = useState({ count: 0, resetAt: Date.now() });
const MAX_ON_DEVICE_CALLS_PER_HOUR = 50; // Adjust based on API limits

// Helper functions
const checkRateLimit = () => {
  const now = Date.now();
  if (now > onDeviceCallCount.resetAt) {
    setOnDeviceCallCount({ count: 0, resetAt: now + 3600000 });
    return true;
  }
  return onDeviceCallCount.count < MAX_ON_DEVICE_CALLS_PER_HOUR;
};

const incrementRateLimit = () => {
  setOnDeviceCallCount(prev => ({ ...prev, count: prev.count + 1 }));
};

const retryWithBackoff = async <T,>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable = error?.status === 429 || error?.status >= 500;
      if (i === maxRetries - 1 || !isRetryable) throw error;
      
      const baseDelay = 1000 * Math.pow(2, i);
      const jitter = Math.random() * 500;
      await new Promise(r => setTimeout(r, baseDelay + jitter));
    }
  }
  throw new Error('Max retries exceeded');
};
```


### 2. Add On-Device Analysis Functions

#### 2.1 Manual Entry (DeepSeek)

Add function after line 152 in `snap-food.tsx`:

```typescript
const analyzeManualOnDevice = useCallback(async (name: string, portion: string, notes?: string): Promise<FoodAnalysisResponse> => {
  const apiKey = process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY || process.env.EXPO_PUBLIC_AI_API_KEY;
  if (!apiKey) throw new Error('DeepSeek API key not configured');

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a nutrition expert. Return ONLY JSON with fields: items[{name,quantity,calories,protein_g,carbs_g,fat_g}], totals{kcal,protein_g,carbs_g,fat_g}, confidence (0..1), notes.',
        },
        {
          role: 'user',
          content: `Food: ${name}\nPortion: ${portion}\nNotes: ${notes ?? ''}\nReturn valid JSON only.`,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw { status: response.status, message: `DeepSeek failed: ${text}` };
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(text);
}, []);
```

#### 2.2 Image Analysis (Gemini)

Add function after the DeepSeek function:

```typescript
const analyzeImageOnDevice = useCallback(async (imageUri: string, notes?: string): Promise<FoodAnalysisResponse> => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');

  const model = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';
  
  // Convert to base64
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: base64 } },
        { text: `Analyze this food image and estimate nutrition. ${notes ?? ''}` },
      ],
    }],
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
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw { status: response.status, message: `Gemini failed: ${text}` };
  }

  const json = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(text);
}, []);
```

### 3. Update Image Analysis Flow (handleAnalyze)

Modify the existing `handleAnalyze` function (lines 228-281) to try on-device first:

```typescript
const handleAnalyze = useCallback(async () => {
  if (circuitOpenUntil && Date.now() < circuitOpenUntil) {
    Alert.alert('Service busy', 'Analysis is temporarily unavailable. Please try again later.');
    return;
  }
  if (!capturedImageUri) {
    Alert.alert('Missing Information', 'Please capture a photo first.');
    return;
  }

  setIsAnalyzing(true);
  let analysisData: FoodAnalysisResponse | null = null;
  let usedFallback = false;
  
  try {
    // Try on-device analysis first (if rate limit allows)
    if (checkRateLimit()) {
      try {
        console.log('[snap-food] Attempting on-device Gemini analysis...');
        analysisData = await retryWithBackoff(() => 
          analyzeImageOnDevice(capturedImageUri, extraNotes.trim() || undefined)
        );
        incrementRateLimit();
        console.log('[snap-food] ✅ On-device analysis succeeded');
      } catch (onDeviceError: any) {
        console.warn('[snap-food] On-device analysis failed, falling back to Edge Function:', onDeviceError);
        usedFallback = true;
      }
    } else {
      console.log('[snap-food] Rate limit reached, using Edge Function');
      usedFallback = true;
    }

    // Fallback to Edge Function if on-device failed
    if (!analysisData) {
      console.log('[snap-food] Using Edge Function for analysis...');
      const path = await uploadImageToStorage(capturedImageUri);
      setUploadedImagePath(path);
      analysisData = await invokeWithRetry({
        kind: 'image',
        image_path: path,
        notes: extraNotes.trim() || undefined,
        previewOnly: true,
        occurred_at_local: new Date().toISOString(),
      });
    }

    setAnalysisResult(analysisData);
    setFailCount(0);
  } catch (error: any) {
    console.error('[snap-food] All analysis attempts failed:', error);
    reportError(error);
    
    const nextFails = failCount + 1;
    setFailCount(nextFails);
    if (nextFails >= 3) setCircuitOpenUntil(Date.now() + 120000);
    
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
}, [capturedImageUri, extraNotes, analyzeImageOnDevice, uploadImageToStorage, invokeWithRetry, failCount, circuitOpenUntil, checkRateLimit, incrementRateLimit]);
```

### 4. Update Manual Analysis Flow (handleAnalyzeManualEntry)

Modify the existing function (lines 355-385) similarly:

```typescript
const handleAnalyzeManualEntry = useCallback(async () => {
  if (!manualEntry.name.trim() || !manualEntry.portionSize.trim()) {
    Alert.alert('Missing Information', 'Please provide both food name and portion size.');
    return;
  }

  setIsAnalyzingManual(true);
  let analysisData: FoodAnalysisResponse | null = null;
  
  try {
    // Try on-device analysis first (if rate limit allows)
    if (checkRateLimit()) {
      try {
        console.log('[snap-food] Attempting on-device DeepSeek analysis...');
        analysisData = await retryWithBackoff(() => 
          analyzeManualOnDevice(
            manualEntry.name.trim(),
            manualEntry.portionSize.trim(),
            extraNotes.trim() || undefined
          )
        );
        incrementRateLimit();
        console.log('[snap-food] ✅ On-device manual analysis succeeded');
      } catch (onDeviceError: any) {
        console.warn('[snap-food] On-device manual analysis failed, falling back to Edge Function:', onDeviceError);
      }
    }

    // Fallback to Edge Function if on-device failed
    if (!analysisData) {
      console.log('[snap-food] Using Edge Function for manual analysis...');
      analysisData = await invokeWithRetry({
        kind: 'text',
        name: manualEntry.name.trim(),
        portion: manualEntry.portionSize.trim(),
        notes: extraNotes.trim() || undefined,
        previewOnly: true,
        occurred_at_local: new Date().toISOString(),
      });
    }

    setManualAnalysisResult(analysisData);
  } catch (error: any) {
    console.error('[snap-food] All manual analysis attempts failed:', error);
    reportError(error);
    Alert.alert('Analysis Failed', friendlyErrorMessage(error));
  } finally {
    setIsAnalyzingManual(false);
  }
}, [manualEntry, extraNotes, analyzeManualOnDevice, invokeWithRetry, checkRateLimit, incrementRateLimit, friendlyErrorMessage]);
```

### 5. Update Save Flow (handleAddToExtras)

Modify the existing function (lines 283-353) to save directly to Supabase with device timezone:

```typescript
const handleAddToExtras = useCallback(async () => {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync();
  }

  try {
    const idem = makeId();
    let savedRow: any = null;

    // For image snap
    if (analysisResult && capturedImageUri) {
      // Upload image first if not already uploaded
      let imagePath = uploadedImagePath;
      if (!imagePath) {
        imagePath = await uploadImageToStorage(capturedImageUri);
        setUploadedImagePath(imagePath);
      }

      // Get device timezone and format date
      const now = new Date();
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const dayKeyLocal = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format

      const portionQty = analysisResult.items?.[0]?.quantity ?? null;

      // Direct Supabase insert
      const { data: row, error } = await supabase
        .from('food_extras')
        .upsert({
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
          image_path: imagePath,
          source: 'snap',
          idempotency_key: idem,
        }, { onConflict: 'user_id,idempotency_key' })
        .select()
        .single();

      if (error) throw error;
      savedRow = row;

      // Update local state
      await addExtraFood({
        name: row.name,
        calories: row.calories,
        protein: row.protein,
        fat: row.fat,
        carbs: row.carbs,
        confidence: row.confidence ?? undefined,
        notes: row.notes ?? undefined,
        imageUri: capturedImageUri,
        imagePath: row.image_path ?? undefined,
        serverId: row.id,
      });
    } 
    // For manual entry
    else if (manualAnalysisResult) {
      const now = new Date();
      const dayKeyLocal = now.toLocaleDateString('en-CA');

      const portionQty = manualAnalysisResult.items?.[0]?.quantity ?? manualEntry.portionSize;

      const { data: row, error } = await supabase
        .from('food_extras')
        .upsert({
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
          image_path: null,
          source: 'manual',
          idempotency_key: idem,
        }, { onConflict: 'user_id,idempotency_key' })
        .select()
        .single();

      if (error) throw error;
      savedRow = row;

      await addExtraFood({
        name: row.name,
        calories: row.calories,
        protein: row.protein,
        fat: row.fat,
        carbs: row.carbs,
        confidence: row.confidence ?? undefined,
        notes: row.notes ?? undefined,
        imageUri: undefined,
        imagePath: undefined,
        serverId: row.id,
      });
    } else {
      return;
    }

    Alert.alert('Added Successfully!', `${savedRow.name} added.`, [
      { 
        text: 'Undo', 
        style: 'destructive', 
        onPress: async () => { 
          try { 
            await removeExtraFood(savedRow.id); 
          } catch {} 
          router.back(); 
        } 
      },
      { text: 'OK', onPress: () => router.back() }
    ]);
  } catch (error: any) {
    console.error('[snap-food] Error adding extra food:', error);
    reportError(error);
    Alert.alert('Error', friendlyErrorMessage(error) || 'Failed to add food to extras. Please try again.');
  }
}, [
  analysisResult, 
  manualAnalysisResult, 
  manualEntry, 
  extraNotes, 
  capturedImageUri, 
  uploadedImagePath, 
  uploadImageToStorage, 
  makeId, 
  session, 
  supabase, 
  addExtraFood, 
  removeExtraFood, 
  friendlyErrorMessage
]);
```

### 6. Import FileSystem

Add to imports at the top of the file (line 1-16):

```typescript
import * as FileSystem from 'expo-file-system';
```

### 7. Environment Variables

Environment variables are already configured in `app.config.js` (lines 12-18):

- `EXPO_PUBLIC_GEMINI_API_KEY` ✅
- `EXPO_PUBLIC_GEMINI_MODEL` (defaults to gemini-2.5-flash) ✅
- `EXPO_PUBLIC_DEEPSEEK_API_KEY` / `EXPO_PUBLIC_AI_API_KEY` ✅

Need to ensure these are set in EAS Secrets for production builds.

## Key Benefits

1. **Resilience**: App works even when Edge Function has issues
2. **Speed**: No server round-trip for analysis preview
3. **Cost**: Reduced serverless function invocations
4. **Timezone**: Accurate local date tracking using device timezone
5. **Rate Protection**: Client-side limits prevent API abuse
6. **Graceful Degradation**: Automatic fallback ensures reliability

## Testing Checklist

- [ ] Manual entry with on-device DeepSeek
- [ ] Image snap with on-device Gemini  
- [ ] Fallback to Edge Function when on-device fails
- [ ] Rate limiting triggers Edge Function after limit
- [ ] Exponential backoff on retryable errors
- [ ] Timezone handling produces correct `day_key_local`
- [ ] Direct Supabase insert saves data correctly
- [ ] Image upload only happens on "Add to Extras"
- [ ] Undo functionality works properly
- [ ] Circuit breaker prevents excessive failures

### To-dos

- [ ] Add rate limiting state and helper functions (checkRateLimit, incrementRateLimit, retryWithBackoff)
- [ ] Add analyzeManualOnDevice function for DeepSeek API calls
- [ ] Add analyzeImageOnDevice function for Gemini API calls with base64 conversion
- [ ] Refactor handleAnalyze to try on-device first, then fallback to Edge Function
- [ ] Refactor handleAnalyzeManualEntry to try on-device first, then fallback
- [ ] Refactor handleAddToExtras to use direct Supabase insert with device timezone
- [ ] Add expo-file-system import at the top of the file
- [ ] Test complete manual entry flow with on-device and fallback
- [ ] Test complete snap flow with on-device and fallback