import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import {
  Camera as CameraIcon,
  RotateCcw,
  Zap,
  ZapOff,
  Sliders,
  ChevronLeft,
  Share2,
  Download,
  Upload,
  Layers,
  Wand2,
  SunMedium,
  Maximize2,
  Move,
  CheckCircle,
} from 'lucide-react-native';
import { theme } from '../theme';
import { recreatePhoto, exportComposite, RecreatePhotoResponse } from '../api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PhotoRecreationScreenProps {
  onBack: () => void;
}

export const PhotoRecreationScreen: React.FC<PhotoRecreationScreenProps> = ({ onBack }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const cameraRef = useRef<any>(null);

  // Reference photograph (original with background)
  const [refImageUri, setRefImageUri] = useState<string | null>(null);
  const [refImageBase64, setRefImageBase64] = useState<string | null>(null);

  // Camera zoom control
  const [cameraZoom, setCameraZoom] = useState<number>(0);

  // Camera overlay controls
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const [overlayScale, setOverlayScale] = useState<number>(1.0);
  const [overlayPanX, setOverlayPanX] = useState<number>(0);
  const [overlayPanY, setOverlayPanY] = useState<number>(0);
  const [showControls, setShowControls] = useState<boolean>(true);

  // Capture & Processing state
  const [userCapturedUri, setUserCapturedUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [recreateResult, setRecreateResult] = useState<RecreatePhotoResponse | null>(null);

  // Fine-tuning parameters for recreation result
  const [lightingStrength, setLightingStrength] = useState<number>(0.65);
  const [scaleMult, setScaleMult] = useState<number>(1.0);
  const [xOffset, setXOffset] = useState<number>(0.0);
  const [yOffset, setYOffset] = useState<number>(0.0);
  const [compareSplit, setCompareSplit] = useState<number>(50); // 0 to 100 for before/after split
  const [isRecompositing, setIsRecompositing] = useState<boolean>(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const handlePickReferencePhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });

      if (!res.canceled && res.assets[0]?.uri) {
        setRefImageUri(res.assets[0].uri);
        if (res.assets[0].base64) {
          setRefImageBase64(`data:image/jpeg;base64,${res.assets[0].base64}`);
        } else {
          const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setRefImageBase64(`data:image/jpeg;base64,${b64}`);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      Alert.alert('Selection Error', err.message || 'Could not load reference image.');
    }
  };

  const handleCaptureAndRecreate = async () => {
    if (!cameraRef.current) return;
    if (!refImageBase64) {
      Alert.alert('Upload Reference First', 'Please upload a reference photograph before capturing.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        base64: true,
      });
      setUserCapturedUri(photo.uri);

      // Trigger photo recreation pipeline
      setProcessing(true);
      setProcessingStep('1/3: Extracting subject with hair-preserving matting...');

      setTimeout(() => {
        setProcessingStep('2/3: Harmonizing scene lighting in CIELAB space...');
      }, 1200);

      setTimeout(() => {
        setProcessingStep('3/3: Placing into original background with contact shadow...');
      }, 2400);

      const userB64 = photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : undefined;

      const res = await recreatePhoto(refImageBase64, photo.uri, {
        scaleMult,
        lightingStrength,
        xOffsetPct: xOffset,
        yOffsetPct: yOffset,
        userBase64: userB64,
      });

      setRecreateResult(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Recreation Failed', err.message || 'Failed to composite photograph.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRecomposite = async () => {
    if (!refImageBase64 || !userCapturedUri) return;
    try {
      setIsRecompositing(true);
      const res = await recreatePhoto(refImageBase64, userCapturedUri, {
        scaleMult,
        lightingStrength,
        xOffsetPct: xOffset,
        yOffsetPct: yOffset,
      });
      setRecreateResult(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update composite.');
    } finally {
      setIsRecompositing(false);
    }
  };

  const handleSaveRecreated = async () => {
    if (!recreateResult?.recreated_image) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery access is needed to save the photograph.');
        return;
      }

      // Write base64 to temp file and save to media library
      const cacheDir = (FileSystem as any).cacheDirectory || '';
      const filename = `${cacheDir}recreated_photo_${Date.now()}.jpg`;
      const base64Data = recreateResult.recreated_image.replace(/^data:image\/\w+;base64,/, '');
      await FileSystem.writeAsStringAsync(filename, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await MediaLibrary.saveToLibraryAsync(filename);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved!', 'Recreated photograph has been saved to your gallery.');
    } catch (err) {
      Alert.alert('Save Failed', 'Could not save the image.');
    }
  };

  const handleShareRecreated = async () => {
    if (!recreateResult?.recreated_image) return;
    try {
      const cacheDir = (FileSystem as any).cacheDirectory || '';
      const filename = `${cacheDir}recreated_photo_${Date.now()}.jpg`;
      const base64Data = recreateResult.recreated_image.replace(/^data:image\/\w+;base64,/, '');
      await FileSystem.writeAsStringAsync(filename, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filename);
      } else {
        Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      }
    } catch (err) {
      Alert.alert('Share Failed', 'Could not open share sheet.');
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.permissionContainer}>
        <CameraIcon size={48} color={theme.colors.accentGold} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionDesc}>
          Photo Recreation Mode needs camera access to capture your pose for background replacement.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButtonSimple} onPress={onBack}>
          <Text style={styles.backButtonSimpleText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // RECREATION RESULT & FINE-TUNING STUDIO
  if (recreateResult) {
    return (
      <View style={styles.resultContainer}>
        {/* Header */}
        <View style={styles.resultHeader}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setRecreateResult(null)}
          >
            <RotateCcw size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.resultHeaderTitle}>Photo Recreation Studio</Text>
          <View style={styles.originalBgBadge}>
            <CheckCircle size={12} color={theme.colors.success} style={{ marginRight: 4 }} />
            <Text style={styles.originalBgBadgeText}>Original BG Preserved</Text>
          </View>
        </View>

        {/* Before / After Viewer */}
        <View style={styles.resultViewerCard}>
          <View style={styles.viewerWrapper}>
            {/* Base Recreated Photo */}
            <Image
              source={{ uri: recreateResult.recreated_image }}
              style={styles.resultMainImage}
              resizeMode="cover"
            />

            {/* Split Comparison Overlay */}
            {refImageBase64 && compareSplit < 95 && (
              <View
                style={[
                  styles.splitOverlay,
                  { width: `${100 - compareSplit}%`, right: 0 },
                ]}
              >
                <Image
                  source={{ uri: refImageBase64 }}
                  style={[
                    styles.resultMainImage,
                    {
                      width: SCREEN_WIDTH - 32,
                      position: 'absolute',
                      right: 0,
                    },
                  ]}
                  resizeMode="cover"
                />
                <View style={styles.splitTag}>
                  <Text style={styles.splitTagText}>Reference</Text>
                </View>
              </View>
            )}

            <View style={styles.recreatedTag}>
              <Text style={styles.recreatedTagText}>Recreated</Text>
            </View>
          </View>

          {/* Split Slider Buttons */}
          <View style={styles.splitControlRow}>
            <Text style={styles.splitLabel}>Comparison Slider</Text>
            <View style={styles.splitBtnGroup}>
              <TouchableOpacity
                style={[styles.splitBtn, compareSplit === 0 && styles.splitBtnActive]}
                onPress={() => setCompareSplit(0)}
              >
                <Text style={styles.splitBtnText}>Original</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.splitBtn, compareSplit === 50 && styles.splitBtnActive]}
                onPress={() => setCompareSplit(50)}
              >
                <Text style={styles.splitBtnText}>Split 50%</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.splitBtn, compareSplit === 100 && styles.splitBtnActive]}
                onPress={() => setCompareSplit(100)}
              >
                <Text style={styles.splitBtnText}>Recreated</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Fine-Tuning Adjustment Controls */}
        <ScrollView style={styles.adjustmentsScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.adjustmentCard}>
            <Text style={styles.adjustmentCardTitle}>Compositing Adjustments</Text>

            {/* Lighting Match Slider */}
            <View style={styles.adjustRow}>
              <View style={styles.adjustLabelGroup}>
                <SunMedium size={16} color={theme.colors.accentGold} />
                <Text style={styles.adjustName}>
                  Lighting Match ({Math.round(lightingStrength * 100)}%)
                </Text>
              </View>
              <View style={styles.adjustBtnGroup}>
                <TouchableOpacity
                  style={styles.adjustStepBtn}
                  onPress={() => setLightingStrength(l => Math.max(0.0, l - 0.15))}
                >
                  <Text style={styles.adjustStepBtnText}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.adjustStepBtn}
                  onPress={() => setLightingStrength(l => Math.min(1.0, l + 0.15))}
                >
                  <Text style={styles.adjustStepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Scale Multiplier */}
            <View style={styles.adjustRow}>
              <View style={styles.adjustLabelGroup}>
                <Maximize2 size={16} color={theme.colors.primaryLight} />
                <Text style={styles.adjustName}>
                  Subject Scale ({scaleMult.toFixed(2)}x)
                </Text>
              </View>
              <View style={styles.adjustBtnGroup}>
                <TouchableOpacity
                  style={styles.adjustStepBtn}
                  onPress={() => setScaleMult(s => Math.max(0.7, s - 0.05))}
                >
                  <Text style={styles.adjustStepBtnText}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.adjustStepBtn}
                  onPress={() => setScaleMult(s => Math.min(1.4, s + 0.05))}
                >
                  <Text style={styles.adjustStepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Position Shift */}
            <View style={styles.adjustRow}>
              <View style={styles.adjustLabelGroup}>
                <Move size={16} color={theme.colors.success} />
                <Text style={styles.adjustName}>Position Offset</Text>
              </View>
              <View style={styles.adjustBtnGroup}>
                <TouchableOpacity
                  style={styles.adjustStepBtn}
                  onPress={() => setXOffset(x => x - 3)}
                >
                  <Text style={styles.adjustStepBtnText}>←</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.adjustStepBtn}
                  onPress={() => setXOffset(x => x + 3)}
                >
                  <Text style={styles.adjustStepBtnText}>→</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.adjustStepBtn}
                  onPress={() => setYOffset(y => y - 3)}
                >
                  <Text style={styles.adjustStepBtnText}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.adjustStepBtn}
                  onPress={() => setYOffset(y => y + 3)}
                >
                  <Text style={styles.adjustStepBtnText}>↓</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Re-composite Button */}
            <TouchableOpacity
              style={styles.recompositeBtn}
              onPress={handleRecomposite}
              disabled={isRecompositing}
            >
              {isRecompositing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Wand2 size={16} color="#FFF" />
                  <Text style={styles.recompositeBtnText}>Update Harmonization & Scale</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.resultActionsBar}>
          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={() => setRecreateResult(null)}
          >
            <RotateCcw size={18} color={theme.colors.textPrimary} />
            <Text style={styles.actionBtnSecondaryText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtnSecondary} onPress={handleShareRecreated}>
            <Share2 size={18} color={theme.colors.textPrimary} />
            <Text style={styles.actionBtnSecondaryText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtnGold} onPress={handleSaveRecreated}>
            <Download size={18} color="#000" />
            <Text style={styles.actionBtnGoldText}>Save to Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // CAMERA & ALIGNMENT SCREEN
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={cameraType}
        flash={flash}
        zoom={cameraZoom}
      />

      {/* Semi-Transparent Reference Photograph Overlay */}
      {refImageUri && (
        <View
          pointerEvents="none"
          style={[
            styles.refOverlayContainer,
            {
              opacity: overlayOpacity,
              transform: [
                { translateX: overlayPanX },
                { translateY: overlayPanY },
                { scale: overlayScale },
              ],
            },
          ]}
        >
          <Image
            source={{ uri: refImageUri }}
            style={styles.refOverlayImage}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Top Floating Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={onBack}>
          <ChevronLeft size={22} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.uploadRefButton}
          onPress={handlePickReferencePhoto}
          activeOpacity={0.8}
        >
          <Upload size={16} color="#FFF" />
          <Text style={styles.uploadRefText}>
            {refImageUri ? 'Change Reference Scene' : 'Upload Complete Reference'}
          </Text>
        </TouchableOpacity>

        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setFlash(f => (f === 'off' ? 'on' : 'off'))}
          >
            {flash === 'on' ? (
              <Zap size={20} color={theme.colors.accentGold} />
            ) : (
              <ZapOff size={20} color="#FFF" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setCameraType(t => (t === 'back' ? 'front' : 'back'))}
          >
            <RotateCcw size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Instruction Banner */}
      <View style={styles.instructionBanner}>
        <Text style={styles.instructionText}>
          {refImageUri
            ? 'Align yourself with the reference person, then tap Capture'
            : 'Upload a reference photo to recreate yourself in its original scene'}
        </Text>
      </View>

      {/* Overlay Alignment Sliders */}
      {refImageUri && showControls && (
        <View style={styles.controlsPanel}>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Overlay Opacity ({Math.round(overlayOpacity * 100)}%)</Text>
            <View style={styles.btnGroup}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOverlayOpacity(o => Math.max(0.1, o - 0.15))}
              >
                <Text style={styles.stepBtnText}>-</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOverlayOpacity(o => Math.min(1.0, o + 0.15))}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Scale ({overlayScale.toFixed(1)}x)</Text>
            <View style={styles.btnGroup}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOverlayScale(s => Math.max(0.6, s - 0.1))}
              >
                <Text style={styles.stepBtnText}>-</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOverlayScale(s => Math.min(2.0, s + 0.1))}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Pan Position</Text>
            <View style={styles.btnGroup}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOverlayPanX(x => x - 25)}
              >
                <Text style={styles.stepBtnText}>←</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOverlayPanX(x => x + 25)}
              >
                <Text style={styles.stepBtnText}>→</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOverlayPanY(y => y - 25)}
              >
                <Text style={styles.stepBtnText}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOverlayPanY(y => y + 25)}
              >
                <Text style={styles.stepBtnText}>↓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Camera Zoom Selector */}
      <View style={styles.zoomBar}>
        {[
          { label: '1x', val: 0.0 },
          { label: '2x', val: 0.15 },
          { label: '3x', val: 0.3 },
          { label: '5x', val: 0.5 },
        ].map((item, idx) => (
          <TouchableOpacity
            key={idx}
            style={[
              styles.zoomPill,
              Math.abs(cameraZoom - item.val) < 0.05 && styles.zoomPillActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setCameraZoom(item.val);
            }}
          >
            <Text
              style={[
                styles.zoomPillText,
                Math.abs(cameraZoom - item.val) < 0.05 && styles.zoomPillTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.bottomSideButton}
          onPress={() => setShowControls(c => !c)}
        >
          <Sliders size={22} color={showControls ? theme.colors.accentGold : '#FFF'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.shutterButtonOuter,
            { borderColor: theme.colors.accentGold },
          ]}
          onPress={handleCaptureAndRecreate}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.shutterButtonInner,
              { backgroundColor: theme.colors.accentGold },
            ]}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomSideButton}
          onPress={handlePickReferencePhoto}
        >
          <Upload size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Processing Pipeline Animation */}
      {processing && (
        <View style={styles.loadingBackdrop}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={theme.colors.accentGold} />
            <Text style={styles.loadingTitle}>Recreating Photograph</Text>
            <Text style={styles.loadingSubtitle}>{processingStep}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  permissionDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.spacing.xl,
  },
  permissionButton: {
    backgroundColor: theme.colors.accentGold,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.md,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  backButtonSimple: {
    padding: 10,
  },
  backButtonSimpleText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  refOverlayContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refOverlayImage: {
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 45,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  uploadRefButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 28, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: 6,
  },
  uploadRefText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20, 20, 28, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  instructionBanner: {
    position: 'absolute',
    top: 105,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(19, 19, 26, 0.88)',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  controlsPanel: {
    position: 'absolute',
    bottom: 110,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(19, 19, 26, 0.92)',
    borderRadius: theme.borderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10,
    gap: 8,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  btnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  stepBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: 34,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  zoomBar: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(20, 20, 28, 0.75)',
    borderRadius: theme.borderRadius.full,
    padding: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
  },
  zoomPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
  },
  zoomPillActive: {
    backgroundColor: theme.colors.accentGold,
  },
  zoomPillText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomPillTextActive: {
    color: '#000',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 25,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  bottomSideButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(20, 20, 28, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  shutterButtonOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  loadingBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingCard: {
    backgroundColor: theme.colors.cardElevated,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
    marginBottom: 4,
  },
  loadingSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  resultContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: 45,
    paddingHorizontal: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIconButton: {
    padding: 8,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.full,
  },
  resultHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  originalBgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  originalBgBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.success,
  },
  resultViewerCard: {
    borderRadius: theme.borderRadius.lg,
    backgroundColor: '#000',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  viewerWrapper: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.42,
    position: 'relative',
    overflow: 'hidden',
  },
  resultMainImage: {
    width: '100%',
    height: '100%',
  },
  splitOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.accentGold,
  },
  splitTag: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  splitTagText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '700',
  },
  recreatedTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  recreatedTagText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '700',
  },
  splitControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: theme.colors.card,
  },
  splitLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  splitBtnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  splitBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  splitBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  splitBtnText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  adjustmentsScroll: {
    flex: 1,
    marginVertical: 10,
  },
  adjustmentCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    gap: 12,
  },
  adjustmentCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  adjustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adjustLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustName: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  adjustBtnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  adjustStepBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: 34,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustStepBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  recompositeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    gap: 8,
    marginTop: 4,
  },
  recompositeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  resultActionsBar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 25,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardElevated,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  actionBtnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  actionBtnGold: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentGold,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    gap: 6,
  },
  actionBtnGoldText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
  },
});
