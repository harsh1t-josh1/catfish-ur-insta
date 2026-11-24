import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Camera,
  Layers,
  Sparkles,
  Lock,
  ChevronRight,
  Wifi,
  Settings,
  CheckCircle2,
  X,
} from 'lucide-react-native';
import { theme } from '../theme';
import { checkHealth, getBackendUrl, setBackendUrl } from '../api';

interface HomeScreenProps {
  onSelectPoseReference: () => void;
  onSelectPhotoRecreation: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSelectPoseReference,
  onSelectPhotoRecreation,
}) => {
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [serverUrlInput, setServerUrlInput] = useState<string>(getBackendUrl());

  useEffect(() => {
    let mounted = true;
    const testConnection = async () => {
      const ok = await checkHealth();
      if (mounted) setBackendOnline(ok);
    };
    testConnection();
    const interval = setInterval(testConnection, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleSaveServerUrl = async () => {
    setBackendUrl(serverUrlInput);
    setShowSettings(false);
    const ok = await checkHealth();
    setBackendOnline(ok);
    Alert.alert(
      ok ? 'Connected' : 'Connection Failed',
      ok
        ? `Successfully connected to ${serverUrlInput}`
        : `Could not reach ${serverUrlInput}. Ensure backend is running.`
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandSubtitle}>AI POSE REFERENCE & RECREATION</Text>
          <Text style={styles.brandTitle}>Pose Studio</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[
              styles.statusPill,
              { backgroundColor: backendOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' },
            ]}
            onPress={() => setShowSettings(true)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: backendOnline ? theme.colors.success : theme.colors.danger },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: backendOnline ? theme.colors.success : theme.colors.danger },
              ]}
            >
              {backendOnline ? 'AI Ready' : 'Connecting'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setShowSettings(true)}
          >
            <Settings size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeader}>Choose Mode</Text>

        {/* CARD 1: POSE REFERENCE MODE */}
        <TouchableOpacity
          style={styles.card}
          onPress={onSelectPoseReference}
          activeOpacity={0.88}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
              <Camera size={26} color={theme.colors.primaryLight} />
            </View>
            <View style={styles.badgeSuccess}>
              <View style={styles.badgeSuccessDot} />
              <Text style={styles.badgeSuccessText}>Functional</Text>
            </View>
          </View>

          <Text style={styles.cardTitle}>Pose Reference Mode</Text>
          <Text style={styles.cardDescription}>
            Match a reference pose while taking a photo in your own environment.
            Features transparent ghost overlay and real-time AI directional guidance.
          </Text>

          <View style={styles.featurePillsRow}>
            <View style={styles.featurePill}>
              <Text style={styles.featurePillText}>Ghost Overlay</Text>
            </View>
            <View style={styles.featurePill}>
              <Text style={styles.featurePillText}>Live Guidance</Text>
            </View>
            <View style={styles.featurePill}>
              <Text style={styles.featurePillText}>Universal Upload</Text>
            </View>
          </View>

          <View style={styles.cardActionRow}>
            <Text style={styles.cardActionText}>Launch Studio</Text>
            <ChevronRight size={18} color={theme.colors.primaryLight} />
          </View>
        </TouchableOpacity>

        {/* CARD 2: PHOTO RECREATION MODE */}
        <TouchableOpacity
          style={styles.card}
          onPress={onSelectPhotoRecreation}
          activeOpacity={0.88}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(243, 201, 115, 0.15)' }]}>
              <Layers size={26} color={theme.colors.accentGold} />
            </View>
            <View style={styles.badgeSuccess}>
              <View style={styles.badgeSuccessDot} />
              <Text style={styles.badgeSuccessText}>Functional</Text>
            </View>
          </View>

          <Text style={styles.cardTitle}>Photo Recreation Mode</Text>
          <Text style={styles.cardDescription}>
            Recreate the complete reference photograph. Automatically extracts your portrait,
            harmonizes scene lighting, and seamlessly places you into the original background.
          </Text>

          <View style={styles.featurePillsRow}>
            <View style={styles.featurePill}>
              <Text style={styles.featurePillText}>Original BG Kept</Text>
            </View>
            <View style={styles.featurePill}>
              <Text style={styles.featurePillText}>CIELAB Lighting</Text>
            </View>
            <View style={styles.featurePill}>
              <Text style={styles.featurePillText}>Contact Shadow</Text>
            </View>
          </View>

          <View style={styles.cardActionRow}>
            <Text style={[styles.cardActionText, { color: theme.colors.accentGold }]}>
              Launch Studio
            </Text>
            <ChevronRight size={18} color={theme.colors.accentGold} />
          </View>
        </TouchableOpacity>

        {/* CARD 3: COMING SOON */}
        <View style={[styles.card, styles.cardDisabled]}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(100, 116, 139, 0.15)' }]}>
              <Sparkles size={26} color={theme.colors.textMuted} />
            </View>
            <View style={styles.badgeSecondary}>
              <Lock size={12} color={theme.colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={styles.badgeSecondaryText}>Coming Soon</Text>
            </View>
          </View>

          <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
            AI Relighting & Style Studio
          </Text>
          <Text style={[styles.cardDescription, { color: theme.colors.textMuted }]}>
            Atmospheric cinematic relighting, volumetric sun rays, seasonal background adaptation,
            and multi-person group pose coordination.
          </Text>

          <View style={styles.featurePillsRow}>
            <View style={[styles.featurePill, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
              <Text style={[styles.featurePillText, { color: theme.colors.textMuted }]}>
                Cinematic Grade
              </Text>
            </View>
            <View style={[styles.featurePill, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
              <Text style={[styles.featurePillText, { color: theme.colors.textMuted }]}>
                Multi-Subject
              </Text>
            </View>
          </View>

          <View style={styles.cardActionRow}>
            <Text style={[styles.cardActionText, { color: theme.colors.textMuted }]}>
              In Development
            </Text>
            <Lock size={14} color={theme.colors.textMuted} />
          </View>
        </View>

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>Designed for solo creators & portrait recreation</Text>
        </View>
      </ScrollView>

      {/* Backend Settings Modal */}
      <Modal visible={showSettings} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Backend Connection</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <X size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Enter the IP address of your workstation running the Python AI backend.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={serverUrlInput}
              onChangeText={setServerUrlInput}
              placeholder="http://192.168.1.50:8000"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalHints}>
              <Text style={styles.hintText}>• Android Emulator: http://10.0.2.2:8000</Text>
              <Text style={styles.hintText}>• Physical Phone on WiFi: http://[YOUR-PC-IP]:8000</Text>
              <Text style={styles.hintText}>• USB adb reverse: http://localhost:8000</Text>
            </View>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={handleSaveServerUrl}
            >
              <Text style={styles.modalSaveText}>Save & Test Connection</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl + 12,
    paddingBottom: theme.spacing.md,
  },
  brandSubtitle: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    color: theme.colors.primaryLight,
    marginBottom: 4,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  settingsButton: {
    padding: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.card,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  cardDisabled: {
    opacity: 0.65,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.full,
    gap: 5,
  },
  badgeSuccessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success,
  },
  badgeSuccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.success,
  },
  badgeSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.full,
  },
  badgeSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  featurePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.lg,
  },
  featurePill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  featurePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  cardActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: theme.spacing.md,
  },
  cardActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primaryLight,
  },
  footerNote: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: theme.colors.cardElevated,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  modalDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  modalInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 14,
    marginBottom: theme.spacing.md,
  },
  modalHints: {
    marginBottom: theme.spacing.lg,
    gap: 4,
  },
  hintText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  modalSaveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
});
