import React from 'react';
import { View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/core/navigation';

export default function App() {
  return (
    <View style={{ flex: 1, ...(Platform.OS === 'web' && { height: '100vh' }) }}>
      <StatusBar style="auto" />
      <AppNavigator />
    </View>
  );
}
