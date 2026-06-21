import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from '../../features/auth/LoginScreen';
import HomeScreen from '../../features/home/HomeScreen';
import DuelScreen from '../../features/duel/DuelScreen';
import ProfileScreen from '../../features/profile/ProfileScreen';
import LeaderboardScreen from '../../features/leaderboard/LeaderboardScreen';
import DailyChallengeScreen from '../../features/daily/DailyChallengeScreen';
import SprintScreen from '../../features/sprint/SprintScreen';
import CompoundBuilderScreen from '../../features/compound/CompoundBuilderScreen';

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
          <>
            <Stack.Screen name="Home">
              {(props) => <HomeScreen {...props} onLogout={() => setIsAuth(false)} />}
            </Stack.Screen>
            <Stack.Screen
              name="Duel"
              component={DuelScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Leaderboard"
              component={LeaderboardScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="DailyChallenge"
              component={DailyChallengeScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="PeriodicSprint"
              component={SprintScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="CompoundBuilder"
              component={CompoundBuilderScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
          </>
        ) : (
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLoginSuccess={() => setIsAuth(true)} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
