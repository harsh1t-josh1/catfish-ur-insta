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
  Modal,
  ScrollView,
} from 'react-native';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import {
  Camera as CameraIcon,
  RotateCcw,
  FlipHorizontal,
  Zap,
  ZapOff,
  Sliders,
  ChevronLeft,
  Check,
  Share2,
  Download,
  Upload,
  AlertCircle,
  Eye,
  Maximize2,
  Move,
} from 'lucide-react-native';
import { theme } from '../theme';
import {
  analyzeReferencePhoto,
  compareLivePose,
  AnalyzeReferenceResponse,
  ComparePoseResponse,
  DetectedPerson,
} from '../api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PoseReferenceScreenProps {
  onBack: () => void;
}

export const PoseReferenceScreen: React.FC<PoseReferenceScreenProps> = ({ onBack }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const cameraRef = useRef<any>(null);

  // Reference photo analysis state
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [refData, setRefData] = useState<AnalyzeReferenceResponse | null>(null);
  const [multiplePersonsModal, setMultiplePersonsModal] = useState<boolean>(false);
  const [detectedPersons, setDetectedPersons] = useState<DetectedPerson[]>([]);

  // Ghost overlay controls
  const [opacity, setOpacity] = useState<number>(0.55);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [mirrorOverlay, setMirrorOverlay] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);

  // Live pose comparison & guidance
  const [comparing, setComparing] = useState<boolean>(false);
  const [poseFeedback, setPoseFeedback] = useState<ComparePoseResponse | null>(null);

  // Capture & review state
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showReview, setShowReview] = useState<boolean>(false);
  const [reviewMode, setReviewMode] = useState<'side_by_side' | 'overlay'>('side_by_side');

  // Request permissions on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  // Periodic pose comparison when reference is loaded
  useEffect(() => {
    if (!refData || showReview || !cameraRef.current) return;

    let isSubscribed = true;
    const interval = setInterval(async () => {
      if (comparing || !cameraRef.current) return;
      try {
        setComparing(true);
        // Take a quick low-res snapshot for live pose analysis
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.3,
          skipProcessing: true,
        });

        if (photo && isSubscribed) {
          const res = await compareLivePose(
            refData.landmarks,
            refData.angles,
            photo.uri,
            mirrorOverlay || cameraType === 'front'
          );
          if (isSubscribed) {
            setPoseFeedback(res);
            if (res.is_aligned) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
      } catch (err) {
        // Silently continue polling on transient frame errors
      } finally {
        if (isSubscribed) setComparing(false);
      }
    }, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [refData, showReview, cameraType, mirrorOverlay]);

  const handlePickReferenceImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!res.canceled && res.assets[0]?.uri) {
        setAnalyzing(true);
        const analysis = await analyzeReferencePhoto(res.assets[0].uri);
        setRefData(analysis);

        if (analysis.multiple_persons && analysis.persons.length > 1) {
          setDetectedPersons(analysis.persons);
          setMultiplePersonsModal(true);
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      Alert.alert('Analysis Failed', err.message || 'Could not analyze reference image.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
      });
      setCapturedUri(photo.uri);
      setShowReview(true);
    } catch (err) {
      Alert.alert('Capture Error', 'Failed to capture photo.');
    }
  };

  const handleSaveToGallery = async () => {
    if (!capturedUri) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(capturedUri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Saved', 'Photograph saved to your gallery.');
      } else {
        Alert.alert('Permission Denied', 'Gallery permission is required to save.');
      }
    } catch (err) {
      Alert.alert('Save Failed', 'Could not save photograph.');
    }
  };

  const handleShare = async () => {
    if (!capturedUri) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(capturedUri);
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
        <CameraIcon size={48} color={theme.colors.primaryLight} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionDesc}>
          Pose Reference Mode needs camera access to display your live preview and ghost overlay.
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

  // REVIEW SCREEN
  if (showReview && capturedUri) {
    return (
      <View style={styles.reviewContainer}>
        <View style={styles.reviewHeader}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setShowReview(false)}
          >
            <RotateCcw size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.reviewTitle}>Pose Result</Text>
          <View style={styles.reviewBadge}>
            <Text style={styles.reviewBadgeText}>
              {poseFeedback?.similarity_score ? `${poseFeedback.similarity_score}% Match` : 'Captured'}
            </Text>
          </View>
        </View>

        <View style={styles.reviewModeSwitch}>
          <TouchableOpacity
            style={[
              styles.reviewModeBtn,
              reviewMode === 'side_by_side' && styles.reviewModeBtnActive,
            ]}
            onPress={() => setReviewMode('side_by_side')}
          >
            <Text
              style={[
                styles.reviewModeText,
                reviewMode === 'side_by_side' && styles.reviewModeTextActive,
              ]}
            >
              Side by Side
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.reviewModeBtn,
              reviewMode === 'overlay' && styles.reviewModeBtnActive,
            ]}
            onPress={() => setReviewMode('overlay')}
          >
            <Text
              style={[
                styles.reviewModeText,
                reviewMode === 'overlay' && styles.reviewModeTextActive,
              ]}
            >
              Ghost Overlay
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.reviewPreviewArea}>
          {reviewMode === 'side_by_side' ? (
            <View style={styles.sideBySideRow}>
              {refData && (
                <View style={styles.sideItem}>
                  <Image
                    source={{ uri: refData.original_image }}
                    style={styles.sideImage}
                    resizeMode="cover"
                  />
                  <View style={styles.sideLabel}>
                    <Text style={styles.sideLabelText}>Reference Pose</Text>
                  </View>
                </View>
              )}
              <View style={styles.sideItem}>
                <Image
                  source={{ uri: capturedUri }}
                  style={styles.sideImage}
                  resizeMode="cover"
                />
                <View style={styles.sideLabel}>
                  <Text style={styles.sideLabelText}>Your Photograph</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.overlayPreviewBox}>
              <Image
                source={{ uri: capturedUri }}
                style={styles.fullPreviewImage}
                resizeMode="cover"
              />
              {refData && (
                <Image
                  source={{ uri: refData.ghost_overlay }}
                  style={[
                    styles.fullPreviewImage,
                    { position: 'absolute', opacity: 0.5 },
                  ]}
                  resizeMode="contain"
                />
              )}
            </View>
          )}
        </View>

        <View style={styles.reviewActionsRow}>
          <TouchableOpacity style={styles.actionBtnSecondary} onPress={() => setShowReview(false)}>
            <RotateCcw size={18} color={theme.colors.textPrimary} />
            <Text style={styles.actionBtnSecondaryText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtnSecondary} onPress={handleShare}>
            <Share2 size={18} color={theme.colors.textPrimary} />
            <Text style={styles.actionBtnSecondaryText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtnPrimary} onPress={handleSaveToGallery}>
            <Download size={18} color="#FFF" />
            <Text style={styles.actionBtnPrimaryText}>Save to Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live Camera Feed */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing={cameraType}
        flash={flash}
      />

      {/* Ghost Overlay: Transparent Reference Person */}
      {refData && (
        <View
          pointerEvents="none"
          style={[
            styles.ghostOverlayContainer,
            {
              opacity: opacity,
              transform: [
                { translateX: panX },
                { translateY: panY },
                { scale: scale },
                { rotate: `${rotation}deg` },
                { scaleX: mirrorOverlay ? -1 : 1 },
              ],
            },
          ]}
        >
          <Image
            source={{ uri: refData.ghost_overlay }}
            style={styles.ghostImage}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Top Floating Controls */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={onBack}>
          <ChevronLeft size={22} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          <TouchableOpacity
            style={styles.uploadRefButton}
            onPress={handlePickReferenceImage}
            activeOpacity={0.8}
          >
            <Upload size={16} color="#FFF" />
            <Text style={styles.uploadRefText}>
              {refData ? 'Change Reference' : 'Upload Reference Photo'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setFlash(f => (f === 'off' ? 'on' : 'off'))}
          >
            {flash === 'on' ? <Zap size={20} color={theme.colors.accentGold} /> : <ZapOff size={20} color="#FFF" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setCameraType(t => (t === 'back' ? 'front' : 'back'))}
          >
            <RotateCcw size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Live Pose Guidance Banner */}
      {refData && (
        <View style={styles.guidanceContainer}>
          <View style={styles.guidanceCard}>
            <View style={styles.similarityScoreBox}>
              <Text style={styles.similarityPercent}>
                {poseFeedback?.similarity_score ?? 0}%
              </Text>
              <Text style={styles.similarityLabel}>MATCH</Text>
            </View>

            <View style={styles.cuesBox}>
              <Text style={styles.cueText} numberOfLines={2}>
                {poseFeedback?.cues?.[0] || 'Align your body to match the ghost overlay'}
              </Text>

              {/* Limb Alignment Indicators */}
              <View style={styles.limbIndicatorsRow}>
                {['head', 'left_arm', 'right_arm', 'torso', 'legs'].map(part => {
                  const status = (poseFeedback?.part_status as any)?.[part] || 'aligning';
                  const isGood = status === 'aligned';
                  return (
                    <View key={part} style={styles.limbPill}>
                      <View
                        style={[
                          styles.limbDot,
                          { backgroundColor: isGood ? theme.colors.success : theme.colors.warning },
                        ]}
                      />
                      <Text style={styles.limbName}>
                        {part.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Ghost Overlay Fine-Tuning Controls (Sliders & Adjustment) */}
      {refData && showControls && (
        <View style={styles.controlsPanel}>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Opacity ({Math.round(opacity * 100)}%)</Text>
            <View style={styles.btnGroup}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOpacity(o => Math.max(0.1, o - 0.15))}
              >
                <Text style={styles.stepBtnText}>-</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setOpacity(o => Math.min(1.0, o + 0.15))}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Scale ({scale.toFixed(1)}x)</Text>
            <View style={styles.btnGroup}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setScale(s => Math.max(0.6, s - 0.1))}
              >
                <Text style={styles.stepBtnText}>-</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setScale(s => Math.min(2.0, s + 0.1))}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Position (Pan)</Text>
            <View style={styles.btnGroup}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setPanX(x => x - 25)}
              >
                <Text style={styles.stepBtnText}>←</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setPanX(x => x + 25)}
              >
                <Text style={styles.stepBtnText}>→</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setPanY(y => y - 25)}
              >
                <Text style={styles.stepBtnText}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setPanY(y => y + 25)}
              >
                <Text style={styles.stepBtnText}>↓</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, mirrorOverlay && styles.toggleBtnActive]}
              onPress={() => setMirrorOverlay(m => !m)}
            >
              <FlipHorizontal size={14} color={mirrorOverlay ? '#FFF' : theme.colors.textSecondary} />
              <Text
                style={[
                  styles.toggleBtnText,
                  mirrorOverlay && { color: '#FFF' },
                ]}
              >
                Mirror Selfie Mode
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => {
                setScale(1.0);
                setPanX(0);
                setPanY(0);
                setRotation(0);
                setOpacity(0.55);
              }}
            >
              <Text style={styles.resetBtnText}>Reset Overlay</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom Shutter & Controls Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.bottomSideButton}
          onPress={() => setShowControls(c => !c)}
        >
          <Sliders size={22} color={showControls ? theme.colors.accentGold : '#FFF'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shutterButtonOuter}
          onPress={handleCapture}
          activeOpacity={0.8}
        >
          <View style={styles.shutterButtonInner} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomSideButton}
          onPress={handlePickReferenceImage}
        >
          <Upload size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Loading Overlay */}
      {analyzing && (
        <View style={styles.loadingBackdrop}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={theme.colors.primaryLight} />
            <Text style={styles.loadingTitle}>Analyzing Pose & Matting</Text>
            <Text style={styles.loadingSubtitle}>
              Removing original background & extracting 33 keypoints...
            </Text>
          </View>
        </View>
      )}

      {/* Multiple Persons Selector Modal */}
      <Modal visible={multiplePersonsModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Multiple People Detected</Text>
            <Text style={styles.modalDesc}>
              We detected {detectedPersons.length} people in the reference photograph. Select
              which person's pose you wish to recreate.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 16 }}>
              {detectedPersons.map((p, idx) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.personCard}
                  onPress={() => {
                    setMultiplePersonsModal(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                >
                  <Text style={styles.personCardTitle}>Person {idx + 1}</Text>
                  <Text style={styles.personCardSub}>
                    Width: {Math.round(p.normalized_bbox.width * 100)}%
                  </Text>
                  <View style={styles.selectPersonBtn}>
                    <Text style={styles.selectPersonBtnText}>Select Pose</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.md,
  },
  permissionButtonText: {
    color: '#FFF',
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
  ghostOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ghostImage: {
    width: '90%',
    height: '90%',
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
  topBarCenter: {
    flex: 1,
    marginHorizontal: 12,
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
    alignSelf: 'center',
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
  guidanceContainer: {
    position: 'absolute',
    top: 105,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  guidanceCard: {
    backgroundColor: 'rgba(19, 19, 26, 0.88)',
    borderRadius: theme.borderRadius.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  similarityScoreBox: {
    alignItems: 'center',
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    minWidth: 60,
  },
  similarityPercent: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.success,
  },
  similarityLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1,
  },
  cuesBox: {
    flex: 1,
    paddingLeft: 12,
  },
  cueText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 6,
  },
  limbIndicatorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  limbPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  limbDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  limbName: {
    fontSize: 9,
    color: theme.colors.textSecondary,
    fontWeight: '600',
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
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  toggleBtnText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  resetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resetBtnText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '600',
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
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF',
  },
  loadingBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
  reviewContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: 45,
    paddingHorizontal: 16,
  },
  reviewHeader: {
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
  reviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  reviewBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.full,
  },
  reviewBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.success,
  },
  reviewModeSwitch: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.sm,
    padding: 4,
    marginBottom: 12,
  },
  reviewModeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  reviewModeBtnActive: {
    backgroundColor: theme.colors.cardElevated,
  },
  reviewModeText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  reviewModeTextActive: {
    color: theme.colors.textPrimary,
  },
  reviewPreviewArea: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 16,
  },
  sideBySideRow: {
    flex: 1,
    flexDirection: 'row',
  },
  sideItem: {
    flex: 1,
    position: 'relative',
  },
  sideImage: {
    width: '100%',
    height: '100%',
  },
  sideLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
  },
  sideLabelText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  overlayPreviewBox: {
    flex: 1,
  },
  fullPreviewImage: {
    width: '100%',
    height: '100%',
  },
  reviewActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 30,
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
  actionBtnPrimary: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    gap: 6,
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.colors.cardElevated,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  modalDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  personCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    marginRight: 12,
    width: 140,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  personCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  personCardSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  selectPersonBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  selectPersonBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
});
