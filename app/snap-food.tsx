import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, TextInput, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { router, Stack } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Camera, X, Check, Zap } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';

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
  const { addExtraFood } = useUserStore();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<FoodAnalysisResponse | null>(null);
  const [extraNotes, setExtraNotes] = useState('');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState<ManualFoodEntry>({
    name: '',
    portionSize: '',
  });
  const [isAnalyzingManual, setIsAnalyzingManual] = useState(false);
  const [manualAnalysisResult, setManualAnalysisResult] = useState<FoodAnalysisResponse | null>(null);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

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

  const convertToBase64 = useCallback(async (uri: string): Promise<string> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]); // Remove data:image/jpeg;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting to base64:', error);
      throw error;
    }
  }, []);

  const analyzeFood = useCallback(async (imageBase64: string, notes: string) => {
    try {
      const response = await fetch('https://toolkit.rork.com/text/llm/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a nutrition expert. Analyze the food image and provide nutritional information in STRICT JSON format. Return only valid JSON with this exact structure: {"items":[{"name":"string","quantity":"string","calories":number,"protein_g":number,"carbs_g":number,"fat_g":number}],"totals":{"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number},"confidence":number,"notes":"string"}. Confidence should be between 0 and 1. Do not include any other text, just the JSON.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this food image and estimate nutritional information.${notes && notes.trim() ? ` Additional notes: ${notes.trim()}` : ''}`
                },
                {
                  type: 'image',
                  image: imageBase64
                }
              ]
            }
          ]
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Raw API response:', data.completion);
      
      // Try to extract JSON from the response
      let result: FoodAnalysisResponse;
      try {
        // First try to parse directly
        result = JSON.parse(data.completion);
      } catch (parseError) {
        console.log('Direct parse failed, trying to extract JSON...');
        // Try to extract JSON from the response text
        const jsonMatch = data.completion.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }
      
      // Validate the result structure
      if (!result.totals || typeof result.totals.kcal !== 'number') {
        throw new Error('Invalid response structure');
      }
      
      return result;
    } catch (error) {
      console.error('Error analyzing food:', error);
      throw error;
    }
  }, []);

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
    if (!capturedImageUri) {
      Alert.alert('Missing Information', 'Please capture a photo first.');
      return;
    }

    setIsAnalyzing(true);
    
    try {
      const imageBase64 = await convertToBase64(capturedImageUri);
      const result = await analyzeFood(imageBase64, extraNotes.trim());
      setAnalysisResult(result);
    } catch (error) {
      console.error('Analysis failed:', error);
      Alert.alert(
        'Analysis Failed',
        'Could not analyze the food. Would you like to enter the details manually?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Manual Entry', onPress: () => setShowManualEntry(true) },
        ]
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [capturedImageUri, extraNotes, convertToBase64, analyzeFood]);

  const handleAddToExtras = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }

    let foodData;
    
    if (analysisResult) {
      // Use AI analysis result
      foodData = {
        name: analysisResult.items.map(item => item.name).join(', ') || 'Food Snap',
        calories: analysisResult.totals.kcal,
        protein: analysisResult.totals.protein_g,
        fat: analysisResult.totals.fat_g,
        carbs: analysisResult.totals.carbs_g,
        confidence: analysisResult.confidence,
        notes: (extraNotes && extraNotes.trim()) ? extraNotes.trim() : (analysisResult.notes || undefined),
        imageUri: capturedImageUri || undefined,
      };
    } else if (manualAnalysisResult) {
      // Use manual analysis result
      foodData = {
        name: manualAnalysisResult.items.map(item => item.name).join(', ') || manualEntry.name.trim(),
        calories: manualAnalysisResult.totals.kcal,
        protein: manualAnalysisResult.totals.protein_g,
        fat: manualAnalysisResult.totals.fat_g,
        carbs: manualAnalysisResult.totals.carbs_g,
        confidence: manualAnalysisResult.confidence,
        notes: (extraNotes && extraNotes.trim()) ? extraNotes.trim() : (manualAnalysisResult.notes || undefined),
        imageUri: capturedImageUri || undefined,
      };
    } else {
      return;
    }

    try {
      const success = await addExtraFood(foodData);
      if (success) {
        Alert.alert(
          'Added Successfully!',
          `${foodData.name} has been added to your extras.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', 'Failed to add food to extras. Please try again.');
      }
    } catch (error) {
      console.error('Error adding extra food:', error);
      Alert.alert('Error', 'Failed to add food to extras. Please try again.');
    }
  }, [analysisResult, manualAnalysisResult, manualEntry, extraNotes, capturedImageUri, addExtraFood]);

  const handleAnalyzeManualEntry = useCallback(async () => {
    if (!manualEntry.name.trim() || !manualEntry.portionSize.trim()) {
      Alert.alert('Missing Information', 'Please provide both food name and portion size.');
      return;
    }

    setIsAnalyzingManual(true);
    
    try {
      const response = await fetch('https://toolkit.rork.com/text/llm/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Calculate the macros of this food in the given portion respond with the macros only no other text or info. Food: ${manualEntry.name.trim()}, Portion: ${manualEntry.portionSize.trim()}. Respond in this EXACT JSON format: {"items":[{"name":"${manualEntry.name.trim()}","quantity":"${manualEntry.portionSize.trim()}","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}],"totals":{"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0},"confidence":0.9,"notes":""}`
            }
          ]
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Manual entry API response:', data.completion);
      
      // Try to extract JSON from the response
      let result: FoodAnalysisResponse;
      try {
        // First try to parse directly
        result = JSON.parse(data.completion);
      } catch (parseError) {
        console.log('Direct parse failed, trying to extract JSON...');
        // Try to extract JSON from the response text
        const jsonMatch = data.completion.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }
      
      // Validate the result structure
      if (!result.totals || typeof result.totals.kcal !== 'number') {
        throw new Error('Invalid response structure');
      }
      
      setManualAnalysisResult(result);
    } catch (error) {
      console.error('Manual analysis failed:', error);
      Alert.alert(
        'Analysis Failed',
        'Could not calculate nutritional information. Please try again or check your internet connection.'
      );
    } finally {
      setIsAnalyzingManual(false);
    }
  }, [manualEntry]);

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
      <View style={styles.container}>
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
                <ActivityIndicator size="large" color={theme.color.accent.primary} />
                <Text style={styles.loadingText}>Analyzing food...</Text>
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
          <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
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
        </Modal>
      </View>
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
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.accent.yellow + '20',
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: 8,
    gap: 4,
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