import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import { PoseReferenceScreen } from './src/screens/PoseReferenceScreen';
import { PhotoRecreationScreen } from './src/screens/PhotoRecreationScreen';
import { theme } from './src/theme';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'home' | 'pose_reference' | 'photo_recreation'>('home');

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar style="light" />

        {currentScreen === 'home' && (
          <HomeScreen
            onSelectPoseReference={() => setCurrentScreen('pose_reference')}
            onSelectPhotoRecreation={() => setCurrentScreen('photo_recreation')}
          />
        )}

        {currentScreen === 'pose_reference' && (
          <PoseReferenceScreen onBack={() => setCurrentScreen('home')} />
        )}

        {currentScreen === 'photo_recreation' && (
          <PhotoRecreationScreen onBack={() => setCurrentScreen('home')} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
