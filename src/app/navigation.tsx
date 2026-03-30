import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { EchoFeedScreen } from '../screens/EchoFeedScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, Radar, UserRound } from 'lucide-react-native';

type TabKey = 'Home' | 'EchoFeed' | 'Profile';

type TabDefinition = {
  key: TabKey;
  label: string;
  Icon: typeof House;
};

const TABS: TabDefinition[] = [
  { key: 'Home', label: 'Aura', Icon: House },
  { key: 'EchoFeed', label: 'Echoes', Icon: Radar },
  { key: 'Profile', label: 'Profile', Icon: UserRound },
];

export function RootNavigator() {
  const insets = useSafeAreaInsets();
  const [needsOnboarding, setNeedsOnboarding] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<TabKey>('Home');

  if (needsOnboarding) {
    return <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />;
  }

  const renderActiveScreen = () => {
    if (activeTab === 'Home') return <HomeScreen />;
    if (activeTab === 'EchoFeed') return <EchoFeedScreen />;
    return <ProfileScreen />;
  };

  return (
    <View className="flex-1 bg-slate-950">
      <View className="flex-1">{renderActiveScreen()}</View>

      <View
        className="flex-row border-t border-slate-800 bg-slate-900 px-2"
        style={{ paddingBottom: Math.max(insets.bottom, 8), height: 66 + Math.max(insets.bottom, 8) }}
      >
        {TABS.map(({ key, label, Icon }) => (
          <Pressable
            key={key}
            className="flex-1 items-center justify-center"
            onPress={() => setActiveTab(key)}
            style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1 })}
          >
            <Icon size={18} color={activeTab === key ? '#34d399' : '#94a3b8'} />
            <Text className={activeTab === key ? 'mt-1 font-semibold text-emerald-400' : 'mt-1 text-slate-400'}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
