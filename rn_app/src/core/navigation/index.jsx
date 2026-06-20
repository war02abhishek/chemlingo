import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from '../../features/auth/LoginScreen';
import DuelScreen from '../../features/duel/DuelScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [isAuth, setIsAuth] = useState(null); // null = loading

  useEffect(() => {
    AsyncStorage.getItem('jwt').then((t) => setIsAuth(!!t));
  }, []);

  if (isAuth === null) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuth ? (
          <Stack.Screen name="Duel" component={DuelScreen} />
        ) : (
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLoginSuccess={() => setIsAuth(true)} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
