import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radar, Sparkles } from 'lucide-react-native';
import { useUpsertDailyMessage } from '../hooks/useDailyMessageMutations';
import { useDailyMessageStats } from '../hooks/useDailyMessageStats';
import { useTodayMessage } from '../hooks/useTodayMessage';
import {
  getPermissionState,
  requestNotificationPermission,
  requestRadarPermissions,
} from '../services/permissions';
import {
  getBleBackgroundLoopStatus,
  startBleBackgroundLoop,
  stopBleBackgroundLoop,
} from '../services/ble/BleBackgroundService';
import { AuraVisualizer } from '../components/AuraVisualizer';
import { PermissionState } from '../types/domain';

const MAX_MESSAGE_LENGTH = 280;

const EMPTY_PERMISSIONS: PermissionState = {
  bluetoothGranted: false,
  locationGranted: false,
  notificationGranted: false,
};

function timeUntilNextUtcReset(nowMs: number) {
  const now = new Date(nowMs);
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

function formatTimeLeft(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

export function HomeScreen() {
  const [message, setMessage] = useState('');
  const [radarOn, setRadarOn] = useState(false);
  const [isRadarBusy, setIsRadarBusy] = useState(false);
  const [hasHydratedMessage, setHasHydratedMessage] = useState(false);
  const [permissionDialogVisible, setPermissionDialogVisible] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>(EMPTY_PERMISSIONS);
  const [isPermissionBusy, setIsPermissionBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const upsertDailyMessage = useUpsertDailyMessage();
  const todayMessage = useTodayMessage();
  const dailyMessageStats = useDailyMessageStats();

  const remaining = useMemo(() => MAX_MESSAGE_LENGTH - message.length, [message.length]);
  const hasSavedMessageToday = Boolean(todayMessage.data);
  const savedMessageBody = todayMessage.data?.body ?? '';
  const resetCountdown = useMemo(() => formatTimeLeft(timeUntilNextUtcReset(nowMs)), [nowMs]);

  const refreshPermissionDialogState = React.useCallback(async () => {
    const next = await getPermissionState();
    setPermissionState(next);

    const allNeededGranted = next.bluetoothGranted && next.locationGranted && next.notificationGranted;
    setPermissionDialogVisible(!allNeededGranted);
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    const syncRadarStatus = async () => {
      setIsRadarBusy(true);
      try {
        const status = await getBleBackgroundLoopStatus();
        if (isMounted) {
          setRadarOn(status);
        }
      } finally {
        if (isMounted) {
          setIsRadarBusy(false);
        }
      }
    };

    syncRadarStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    refreshPermissionDialogState().catch(() => {
      setPermissionState(EMPTY_PERMISSIONS);
      setPermissionDialogVisible(true);
    });
  }, [refreshPermissionDialogState]);

  React.useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshPermissionDialogState();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [refreshPermissionDialogState]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    if (hasHydratedMessage) return;
    if (!todayMessage.data) return;

    setMessage(todayMessage.data.body);
    setHasHydratedMessage(true);
  }, [hasHydratedMessage, todayMessage.data]);

  const onPromptPermissions = async () => {
    if (isPermissionBusy) return;

    setIsPermissionBusy(true);
    try {
      await requestRadarPermissions();
      await requestNotificationPermission();
      await refreshPermissionDialogState();
    } finally {
      setIsPermissionBusy(false);
    }
  };

  const onSaveDailyMessage = () => {
    const payload = message.trim();
    if (!payload.length || hasSavedMessageToday) return;

    upsertDailyMessage.mutate(
      { body: payload },
      {
        onSuccess: () => {
          setMessage('');
        },
        onError: (error) => {
          if (error.message === 'Daily message already saved') {
            Alert.alert('Message locked', 'You can only save one message per day.');
            return;
          }

          Alert.alert('Could not save message', 'Please try again.');
        },
      },
    );
  };

  const onRadarToggle = async (next: boolean) => {
    if (isRadarBusy) return;
    setIsRadarBusy(true);

    if (!next) {
      try {
        await stopBleBackgroundLoop();
      } finally {
        setRadarOn(false);
        setIsRadarBusy(false);
      }
      return;
    }

    try {
      const hasPermissions = await requestRadarPermissions();
      if (!hasPermissions) {
        setRadarOn(false);
        await refreshPermissionDialogState();
        setPermissionDialogVisible(true);
        return;
      }

      await startBleBackgroundLoop();
      setRadarOn(true);
    } catch {
      setRadarOn(false);
      Alert.alert('Radar unavailable', 'Could not start Radar right now. Please try again.');
    } finally {
      setIsRadarBusy(false);
    }
  };

  return (
    <LinearGradient colors={['#020617', '#052429', '#03111A', '#020617']} className="flex-1">
      <View className="flex-1">
        <Modal
          visible={permissionDialogVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPermissionDialogVisible(false)}
        >
          <View className="flex-1 items-center justify-center bg-slate-950/80 px-6">
            <View className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-700">
              <LinearGradient colors={['#0f172a', '#1e293b']} className="p-6">
                <Text className="text-xl font-black text-white">Permissions Needed</Text>
                <Text className="mt-2 text-slate-300">
                  Turn on Bluetooth, Location, and Notifications for full Lume proximity messaging.
                </Text>

                <View className="mt-4 rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <Text className="text-slate-300">
                    Bluetooth:{' '}
                    <Text className={permissionState.bluetoothGranted ? 'text-emerald-400' : 'text-rose-300'}>
                      {permissionState.bluetoothGranted ? 'On' : 'Off'}
                    </Text>
                  </Text>
                  <Text className="mt-1 text-slate-300">
                    Location:{' '}
                    <Text className={permissionState.locationGranted ? 'text-emerald-400' : 'text-rose-300'}>
                      {permissionState.locationGranted ? 'On' : 'Off'}
                    </Text>
                  </Text>
                  <Text className="mt-1 text-slate-300">
                    Notifications:{' '}
                    <Text className={permissionState.notificationGranted ? 'text-emerald-400' : 'text-rose-300'}>
                      {permissionState.notificationGranted ? 'On' : 'Off'}
                    </Text>
                  </Text>
                </View>

                <Pressable
                  className={
                    isPermissionBusy
                      ? 'mt-5 rounded-2xl bg-emerald-400/70 py-3'
                      : 'mt-5 rounded-2xl bg-emerald-400 py-3'
                  }
                  onPress={onPromptPermissions}
                  disabled={isPermissionBusy}
                >
                  <Text className="text-center font-bold text-slate-950">
                    {isPermissionBusy ? 'Requesting...' : 'Turn On Permissions'}
                  </Text>
                </Pressable>

                <Pressable
                  className="mt-3 rounded-2xl border border-slate-700 py-3"
                  onPress={() => setPermissionDialogVisible(false)}
                >
                  <Text className="text-center font-semibold text-slate-300">Continue in Limited Mode</Text>
                </Pressable>
              </LinearGradient>
            </View>
          </View>
        </Modal>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 22 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center">
            <Text className="text-3xl font-black text-white">Your Aura</Text>
            <View className="ml-2 rounded-full bg-emerald-400/20 px-2 py-1">
              <Sparkles size={13} color="#6ee7b7" />
            </View>
          </View>
          <Text className="mt-2 text-slate-300">Tap the radar to go live or pause your proximity scan.</Text>

          <View className="mt-6 items-center overflow-hidden rounded-[32px] border border-emerald-300/20">
            <LinearGradient colors={['rgba(30,41,59,0.85)', 'rgba(6,78,59,0.25)', 'rgba(15,23,42,0.85)']} className="w-full items-center px-4 py-6">
              <AuraVisualizer
                isActive={radarOn}
                onPress={() => onRadarToggle(!radarOn)}
                disabled={isRadarBusy}
                isBusy={isRadarBusy}
              />

              <View className="mt-4 w-full overflow-hidden rounded-2xl border border-emerald-300/20">
                <LinearGradient colors={['rgba(16,185,129,0.2)', 'rgba(15,23,42,0.75)']} className="px-4 py-3">
                  <View className="flex-row items-center">
                    {isRadarBusy ? (
                      <ActivityIndicator size="small" color="#6ee7b7" />
                    ) : (
                      <Radar size={16} color={radarOn ? '#6ee7b7' : '#94a3b8'} />
                    )}
                    <Text className="ml-2 text-sm font-semibold text-white">
                      {isRadarBusy ? 'Updating radar state...' : radarOn ? 'Radar is live and scanning nearby Lume IDs.' : 'Radar is paused.'}
                    </Text>
                  </View>
                </LinearGradient>
              </View>
            </LinearGradient>
          </View>

          <View className="mt-7 overflow-hidden rounded-3xl border border-emerald-300/20">
            <LinearGradient colors={['rgba(6,95,70,0.2)', 'rgba(30,41,59,0.92)', 'rgba(15,23,42,0.98)']} className="p-5">
              <Text className="mb-2 text-sm uppercase tracking-wider text-emerald-300">Daily Message (1 per day)</Text>

              {hasSavedMessageToday ? (
                <View>
                  <View className="overflow-hidden rounded-2xl border border-emerald-300/30">
                    <LinearGradient colors={['rgba(52,211,153,0.2)', 'rgba(15,23,42,0.8)']} className="px-4 py-4">
                      <Text className="text-xs uppercase tracking-wider text-emerald-200">Saved Broadcast</Text>
                      <Text className="mt-2 text-base leading-6 text-white">{savedMessageBody}</Text>
                    </LinearGradient>
                  </View>

                  <View className="mt-4 flex-row">
                    <View className="mr-2 flex-1 overflow-hidden rounded-2xl border border-slate-700">
                      <LinearGradient colors={['rgba(16,185,129,0.18)', 'rgba(15,23,42,0.85)']} className="px-3 py-3">
                        <Text className="text-xs uppercase tracking-wider text-slate-300">Received By</Text>
                        {dailyMessageStats.isFetching ? (
                          <ActivityIndicator className="mt-2" size="small" color="#6ee7b7" />
                        ) : !dailyMessageStats.data.isRemoteAvailable ? (
                          <Text className="mt-2 text-lg font-bold text-slate-300">Offline</Text>
                        ) : (
                          <Text className="mt-2 text-2xl font-black text-white">{dailyMessageStats.data.receivedUsersCount}</Text>
                        )}
                      </LinearGradient>
                    </View>

                    <View className="ml-2 flex-1 overflow-hidden rounded-2xl border border-slate-700">
                      <LinearGradient colors={['rgba(30,64,175,0.18)', 'rgba(15,23,42,0.85)']} className="px-3 py-3">
                        <Text className="text-xs uppercase tracking-wider text-slate-300">Reset In</Text>
                        <Text className="mt-2 text-2xl font-black text-white">{resetCountdown}</Text>
                      </LinearGradient>
                    </View>
                  </View>

                  <Text className="mt-3 text-xs text-slate-300">
                    You can save a new daily message after the UTC reset.
                  </Text>
                </View>
              ) : (
                <View>
                  <TextInput
                    multiline
                    maxLength={MAX_MESSAGE_LENGTH}
                    placeholder="What energy are you broadcasting today?"
                    placeholderTextColor="#94a3b8"
                    className="min-h-24 rounded-2xl border border-slate-700 bg-slate-950/85 px-4 py-3 text-base text-white"
                    value={message}
                    onChangeText={setMessage}
                  />
                  <Text className="mt-2 text-right text-xs text-slate-300">{remaining} chars left</Text>

                  <Pressable
                    className={
                      message.trim().length > 0
                        ? 'mt-4 overflow-hidden rounded-2xl'
                        : 'mt-4 overflow-hidden rounded-2xl opacity-75'
                    }
                    onPress={onSaveDailyMessage}
                    disabled={
                      message.trim().length === 0 ||
                      upsertDailyMessage.isPending ||
                      todayMessage.isFetching ||
                      hasSavedMessageToday
                    }
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  >
                    <LinearGradient colors={['#6ee7b7', '#34d399', '#10b981']} className="py-3">
                      <Text className="text-center text-base font-bold text-slate-950">
                        {upsertDailyMessage.isPending ? 'Saving...' : 'Save Message'}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              )}
            </LinearGradient>
          </View>
        </ScrollView>
      </View>
    </LinearGradient>
  );
}
