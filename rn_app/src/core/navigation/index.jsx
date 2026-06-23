import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Auth
import LoginScreen from '../../features/auth/LoginScreen';

// Student — Learn tab
import DashboardScreen from '../../features/learn/DashboardScreen';
import AdventurePathScreen from '../../features/learn/AdventurePathScreen';
import LessonIntroScreen from '../../features/learn/LessonIntroScreen';
import RewardScreen from '../../features/learn/RewardScreen';
import BossBattleScreen from '../../features/learn/BossBattleScreen';
import ReactionPredictorScreen from '../../features/predictor/ReactionPredictorScreen';

// Student — Compete tab
import CompeteHomeScreen from '../../features/compete/CompeteHomeScreen';
import DuelScreen from '../../features/duel/DuelScreen';
import ProfileScreen from '../../features/profile/ProfileScreen';
import LeaderboardScreen from '../../features/leaderboard/LeaderboardScreen';
import DailyChallengeScreen from '../../features/daily/DailyChallengeScreen';
import SprintScreen from '../../features/sprint/SprintScreen';
import CompoundBuilderScreen from '../../features/compound/CompoundBuilderScreen';

// Teacher tabs
import OverviewScreen from '../../features/teacher/OverviewScreen';
import StudentsScreen from '../../features/teacher/StudentsScreen';
import InsightsScreen from '../../features/teacher/InsightsScreen';
import ManageScreen from '../../features/teacher/ManageScreen';

// ── Navigators ────────────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_BAR_STYLE = {
  backgroundColor: '#ffffff',
  borderTopColor: '#e9edf5',
  borderTopWidth: 1,
  height: 60,
  paddingBottom: 8,
  paddingTop: 6,
};

// ── Student tab navigators ─────────────────────────────────────────────────

function LearnStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="AdventurePath" component={AdventurePathScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="LessonIntro" component={LessonIntroScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ReactionPredictor" component={ReactionPredictorScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PeriodicSprint" component={SprintScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="CompoundBuilder" component={CompoundBuilderScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Reward" component={RewardScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="BossBattle" component={BossBattleScreen} options={{ animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}

function CompeteStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CompeteHome" component={CompeteHomeScreen} />
      <Stack.Screen name="Duel" component={DuelScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="PeriodicSprint" component={SprintScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ReactionPredictor" component={ReactionPredictorScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="CompoundBuilder" component={CompoundBuilderScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="DailyChallenge" component={DailyChallengeScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}

function ProfileStack({ onLogout }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain">
        {(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function StudentTabs({ onLogout }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: TAB_BAR_STYLE,
        tabBarActiveTintColor: '#2fc665',
        tabBarInactiveTintColor: '#8892a4',
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'Nunito_600SemiBold' },
        tabBarIcon: ({ color, size }) => {
          const icons = { Learn: '📚', Compete: '⚔️', Profile: '👤' };
          return <Text style={{ fontSize: size - 4 }}>{icons[route.name]}</Text>;
        },
      })}
    >
      <Tab.Screen name="Learn" component={LearnStack} />
      <Tab.Screen name="Compete" component={CompeteStack} />
      <Tab.Screen name="Profile">
        {() => <ProfileStack onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ── Teacher tab navigators ─────────────────────────────────────────────────

function TeacherTabs({ onLogout }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: TAB_BAR_STYLE,
        tabBarActiveTintColor: '#2f6bfe',
        tabBarInactiveTintColor: '#8892a4',
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'Nunito_600SemiBold' },
        tabBarIcon: ({ color, size }) => {
          const icons = { Overview: '📊', Students: '👨‍🎓', Insights: '💡', Manage: '⚙️' };
          return <Text style={{ fontSize: size - 4 }}>{icons[route.name]}</Text>;
        },
      })}
    >
      <Tab.Screen name="Overview" component={OverviewScreen} />
      <Tab.Screen name="Students" component={StudentsScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="Manage">
        {(props) => <ManageScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ── Root navigator ─────────────────────────────────────────────────────────

export default function AppNavigator() {
  const [auth, setAuth] = useState(null); // null = loading

  useEffect(() => {
    AsyncStorage.multiGet(['jwt', 'role']).then(([[, token], [, role]]) => {
      if (token) {
        setAuth({ token, role: role ?? 'student' });
      } else {
        setAuth(false);
      }
    });
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['jwt', 'role']);
    setAuth(false);
  };

  const handleLoginSuccess = async (role) => {
    const token = await AsyncStorage.getItem('jwt');
    setAuth({ token, role: role ?? 'student' });
  };

  if (auth === null) return null;

  return (
    <NavigationContainer>
      {!auth ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
          </Stack.Screen>
        </Stack.Navigator>
      ) : auth.role === 'teacher' ? (
        <TeacherTabs onLogout={handleLogout} />
      ) : (
        <StudentTabs onLogout={handleLogout} />
      )}
    </NavigationContainer>
  );
}
