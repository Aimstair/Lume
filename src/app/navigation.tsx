import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { EchoFeedScreen } from '../screens/EchoFeedScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';

type TabKey = 'Home' | 'EchoFeed' | 'Profile';

export function RootNavigator() {
  const [needsOnboarding, setNeedsOnboarding] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<TabKey>('Home');

  if (needsOnboarding) {
    return (
      <View className="flex-1 bg-slate-950">
        <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />
        <View className="px-6 pb-8">
          <Pressable
            className="rounded-2xl border border-emerald-500/40 bg-slate-900 py-3"
            onPress={() => setNeedsOnboarding(false)}
          >
            <Text className="text-center font-semibold text-emerald-300">Enter Lume</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const renderActiveScreen = () => {
    if (activeTab === 'Home') return <HomeScreen />;
    if (activeTab === 'EchoFeed') return <EchoFeedScreen />;
    return <ProfileScreen />;
  };

  return (
    <View className="flex-1 bg-slate-950">
      <View className="flex-1">{renderActiveScreen()}</View>
      <View className="h-16 flex-row border-t border-slate-800 bg-slate-900 px-3">
        {(['Home', 'EchoFeed', 'Profile'] as TabKey[]).map((tab) => (
          <Pressable
            key={tab}
            className="flex-1 items-center justify-center"
            onPress={() => setActiveTab(tab)}
          >
            <Text className={activeTab === tab ? 'font-semibold text-emerald-400' : 'text-slate-400'}>
              {tab === 'EchoFeed' ? 'Echoes' : tab}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
