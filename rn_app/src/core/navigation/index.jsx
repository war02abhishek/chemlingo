import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';

import LoginScreen from '../../features/auth/LoginScreen';
import DrillScreen from '../../features/drill/DrillScreen';
import LeaderboardScreen from '../../features/leaderboard/LeaderboardScreen';
import StreakScreen from '../../features/streak/StreakScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AppTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Drill" component={DrillScreen} options={{ tabBarLabel: '⚗️ Drill' }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ tabBarLabel: '🏆 Board' }} />
      <Tab.Screen name="Streak" component={StreakScreen} options={{ tabBarLabel: '🔥 Streak' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [isAuth, setIsAuth] = useState(null); // null = loading

  useEffect(() => {
    AsyncStorage.getItem('jwt').then((t) => setIsAuth(!!t));
  }, []);

  if (isAuth === null) return null; // splash / loading

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuth ? (
          <Stack.Screen name="Main" component={AppTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
