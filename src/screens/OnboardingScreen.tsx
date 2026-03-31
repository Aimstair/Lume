import React from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Compass, ShieldCheck, Sparkles } from 'lucide-react-native';
import {
  getPermissionState,
  requestRadarPermissions,
} from '../services/permissions';
import { PermissionState } from '../types/domain';

type OnboardingPage = {
  key: string;
  title: string;
  subtitle: string;
  body: string;
  Icon: typeof Compass;
};

const PAGES: OnboardingPage[] = [
  {
    key: 'concept',
    title: 'Stay Connected Nearby',
    subtitle: 'How Lume works',
    body: 'Share a message with the people around you.',
    Icon: Compass,
  },
  {
    key: 'privacy',
    title: 'Bluetooth On, Location Private',
    subtitle: 'Privacy',
    body: 'Android requires Location permission for Bluetooth scanning. Lume never publishes your precise location.',
    Icon: ShieldCheck,
  },
  {
    key: 'vibes',
    title: 'A Friendly Community',
    subtitle: 'Community',
    body: 'Kind words help everyone feel welcome. Keep your messages respectful and thoughtful.',
    Icon: Sparkles,
  },
];

const EMPTY_PERMISSIONS: PermissionState = {
  bluetoothGranted: false,
  locationGranted: false,
  notificationGranted: false,
};

export function OnboardingScreen({ onComplete }: { onComplete?: () => void }) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isRequesting, setIsRequesting] = React.useState(false);
  const [hasRequestedCorePermissions, setHasRequestedCorePermissions] = React.useState(false);
  const [permissions, setPermissions] = React.useState<PermissionState>(EMPTY_PERMISSIONS);

  const refreshPermissions = React.useCallback(async () => {
    try {
      const next = await getPermissionState();
      setPermissions(next);
    } catch {
      setPermissions(EMPTY_PERMISSIONS);
    }
  }, []);

  React.useEffect(() => {
    refreshPermissions();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshPermissions();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [refreshPermissions]);

  const coreGranted = permissions.bluetoothGranted && permissions.locationGranted;
  const canEnter = coreGranted || hasRequestedCorePermissions;

  const onPageScrollEnd = (offsetX: number) => {
    const index = Math.round(offsetX / width);
    setActiveIndex(Math.max(0, Math.min(PAGES.length - 1, index)));
  };

  const requestCorePermissions = async () => {
    setIsRequesting(true);
    setHasRequestedCorePermissions(true);

    try {
      const coreAccessReady = await requestRadarPermissions();
      await refreshPermissions();

      if (!coreAccessReady) {
        Alert.alert(
          'Limited mode available',
          'You can still enter Lume without permissions. Radar and BLE exchange will stay off until granted.',
        );
      }
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50 pt-14 dark:bg-slate-950">
      <View className="px-6">
        <Text className="text-4xl font-black text-slate-900 dark:text-slate-50">Lume</Text>
        <Text className="mt-2 text-slate-700 dark:text-slate-200">Connect with your city, one passing moment at a time.</Text>
      </View>

      <FlatList
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={PAGES}
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={(event) => onPageScrollEnd(event.nativeEvent.contentOffset.x)}
        renderItem={({ item }) => (
          <View style={{ width }} className="px-6 pb-5 pt-7">
            <View className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/20">
                <item.Icon size={24} color="#34d399" />
              </View>
              <Text className="mt-5 text-sm uppercase tracking-wider text-emerald-400">{item.subtitle}</Text>
              <Text className="mt-2 text-3xl font-black leading-10 text-slate-900 dark:text-slate-50">{item.title}</Text>
              <Text className="mt-3 text-base leading-7 text-slate-700 dark:text-slate-200">{item.body}</Text>
            </View>
          </View>
        )}
      />

      <View className="px-6">
        <View className="mb-4 flex-row justify-center">
          {PAGES.map((page, index) => (
            <View
              key={page.key}
              className={
                index === activeIndex
                  ? 'mx-1 h-2 w-6 rounded-full bg-emerald-400'
                  : 'mx-1 h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700'
              }
            />
          ))}
        </View>

        <View className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <Text className="text-slate-700 dark:text-slate-200">
            Bluetooth: <Text className={permissions.bluetoothGranted ? 'text-emerald-400' : 'text-rose-300'}>{permissions.bluetoothGranted ? 'On' : 'Off'}</Text>
            {'  '}Location: <Text className={permissions.locationGranted ? 'text-emerald-400' : 'text-rose-300'}>{permissions.locationGranted ? 'On' : 'Off'}</Text>
          </Text>
        </View>

        {!coreGranted ? (
          <Pressable
            onPress={requestCorePermissions}
            disabled={isRequesting}
            style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
            className={
              isRequesting
                ? 'min-h-12 rounded-2xl bg-emerald-400/70 py-4'
                : 'min-h-12 rounded-2xl bg-emerald-400 py-4'
            }
          >
            <View className="flex-row items-center justify-center">
              {isRequesting ? <ActivityIndicator color="#020617" size="small" /> : null}
              <Text className="ml-2 text-center text-base font-bold text-slate-950">
                {isRequesting ? 'Turning On Access...' : 'Turn On Bluetooth + Location'}
              </Text>
            </View>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => onComplete?.()}
          disabled={!canEnter}
          style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1, marginTop: coreGranted ? 0 : 12 })}
          className={
            canEnter
              ? 'mt-3 min-h-12 rounded-2xl border border-emerald-400/40 bg-white py-4 shadow-sm dark:bg-slate-900 dark:shadow-none'
              : 'mt-3 min-h-12 rounded-2xl border border-slate-200 bg-white py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none'
          }
        >
          <Text className={canEnter ? 'text-center font-semibold text-emerald-500 dark:text-emerald-300' : 'text-center font-semibold text-slate-500 dark:text-slate-400'}>
            {coreGranted ? 'Enter Lume' : 'Enter Lume (Limited Mode)'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
