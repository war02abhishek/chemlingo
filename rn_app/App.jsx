import 'react-native-gesture-handler';
import React from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/core/navigation';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, ...(Platform.OS === 'web' && { height: '100vh' }) }}>
      <StatusBar style="auto" />
      <AppNavigator />
    </GestureHandlerRootView>
  );
}
