import React from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { EchoFeedScreen } from '../screens/EchoFeedScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { MapsScreen } from '../screens/MapsScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, MapPinned, Radar, UserRound } from 'lucide-react-native';
import { useUnseenEchoes } from '../hooks/useEchoInbox';
import { useEchoInboxActions } from '../hooks/useEchoInboxActions';
import { EchoInboxPrompt } from '../components/EchoInboxPrompt';
import { EchoSwipeDeckModal } from '../components/EchoSwipeDeckModal';

type TabKey = 'Home' | 'EchoFeed' | 'Maps' | 'Profile';

type TabDefinition = {
  key: TabKey;
  label: string;
  Icon: typeof House;
};

const TABS: TabDefinition[] = [
  { key: 'Home', label: 'Glow', Icon: House },
  { key: 'EchoFeed', label: 'Echoes', Icon: Radar },
  { key: 'Maps', label: 'Maps', Icon: MapPinned },
  { key: 'Profile', label: 'Profile', Icon: UserRound },
];

export function RootNavigator() {
  const insets = useSafeAreaInsets();
  const [needsOnboarding, setNeedsOnboarding] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<TabKey>('Home');
  const [inboxPromptVisible, setInboxPromptVisible] = React.useState(false);
  const [deckVisible, setDeckVisible] = React.useState(false);
  const [largestPromptedCount, setLargestPromptedCount] = React.useState(0);
  const unseenEchoes = useUnseenEchoes();
  const { pinEcho, reportEcho, deleteEcho } = useEchoInboxActions();

  const unseenCount = unseenEchoes.data.length;

  React.useEffect(() => {
    if (needsOnboarding || deckVisible) {
      return;
    }

    if (unseenCount === 0) {
      setInboxPromptVisible(false);
      setLargestPromptedCount(0);
      return;
    }

    if (unseenCount > largestPromptedCount) {
      setInboxPromptVisible(true);
      setLargestPromptedCount(unseenCount);
    }
  }, [deckVisible, largestPromptedCount, needsOnboarding, unseenCount]);

  React.useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && unseenCount > 0 && !needsOnboarding && !deckVisible) {
        setInboxPromptVisible(true);
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [deckVisible, needsOnboarding, unseenCount]);

  const openSwipeInbox = React.useCallback(() => {
    setInboxPromptVisible(false);
    setDeckVisible(true);
    setActiveTab('EchoFeed');
  }, []);

  const closeSwipeInbox = React.useCallback(() => {
    setDeckVisible(false);
  }, []);

  if (needsOnboarding) {
    return <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />;
  }

  const renderActiveScreen = () => {
    if (activeTab === 'Home') return <HomeScreen />;
    if (activeTab === 'EchoFeed') {
      return <EchoFeedScreen onOpenInbox={openSwipeInbox} unreadCount={unseenCount} />;
    }
    if (activeTab === 'Maps') {
      return <MapsScreen />;
    }
    return <ProfileScreen />;
  };

  return (
    <View className="flex-1 bg-emerald-50 dark:bg-slate-950">
      <View className="flex-1">{renderActiveScreen()}</View>

      <EchoInboxPrompt
        visible={inboxPromptVisible}
        unseenCount={unseenCount}
        onDismiss={() => setInboxPromptVisible(false)}
        onOpenInbox={openSwipeInbox}
      />

      <EchoSwipeDeckModal
        visible={deckVisible}
        echoes={unseenEchoes.data}
        onClose={closeSwipeInbox}
        onPin={pinEcho}
        onReport={reportEcho}
        onDelete={deleteEcho}
      />

      <View
        className="flex-row items-center justify-center border-t border-slate-200 bg-white px-2 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
        style={{ paddingBottom: Math.max(insets.bottom, 8), height: 55 + Math.max(insets.bottom, 8) }}
      >
        {TABS.map(({ key, label, Icon }) => (
          <Pressable
            key={key}
            className="flex-1 items-center justify-center"
            onPress={() => setActiveTab(key)}
            style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1 })}
          >
            <Icon size={18} color={activeTab === key ? '#34d399' : '#94a3b8'} />
            <Text className={activeTab === key ? 'mt-1 font-semibold text-emerald-500 dark:text-emerald-400' : 'mt-1 text-slate-600 dark:text-slate-400'}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
