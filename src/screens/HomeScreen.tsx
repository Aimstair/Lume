import React, { useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CircleHelp, Lock, Radar, Sparkles, X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import {
  useQueueMessageDraft,
  useRemoveQueuedMessageDraft,
  useUpsertDailyMessage,
} from '../hooks/useDailyMessageMutations';
import { useDailyMessageStats } from '../hooks/useDailyMessageStats';
import { useTodayMessage } from '../hooks/useTodayMessage';
import { useProfileDashboard } from '../hooks/useProfileDashboard';
import { useDailyPrompt } from '../hooks/useDailyPrompt';
import { useQueuedMessageDrafts } from '../hooks/useQueuedMessageDrafts';
import { useEchoOfPast } from '../hooks/useEchoOfPast';
import { useEncounterFeed } from '../hooks/useEchoInbox';
import {
  getPermissionState,
  requestRadarPermissions,
} from '../services/permissions';
import {
  getBleBackgroundLoopStatus,
  sendProximityPing,
  startBleBackgroundLoop,
  stopBleBackgroundLoop,
  subscribeToProximityPings,
} from '../services/ble/BleBackgroundService';
import { AuraVisualizer } from '../components/AuraVisualizer';
import { MessagePinType, PermissionState } from '../types/domain';
import { presentAppModal } from '../services/appModal';

const MAX_MESSAGE_LENGTH = 280;

const EMPTY_PERMISSIONS: PermissionState = {
  bluetoothGranted: false,
  locationGranted: false,
  notificationGranted: false,
};

const PIN_TYPE_OPTIONS: Array<{ value: MessagePinType; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'star', label: 'Star' },
  { value: 'crystal', label: 'Crystal' },
];

const PIN_TYPE_UNLOCKS: Record<MessagePinType, number> = {
  classic: 0,
  star: 150,
  crystal: 500,
};

const AURA_COLOR_OPTIONS: Array<{ label: string; value: string | null; swatch: string }> = [
  { label: 'None', value: null, swatch: '#94a3b8' },
  { label: 'Dawn', value: 'dawn-amber', swatch: '#f59e0b' },
  { label: 'Ocean', value: 'ocean-cyan', swatch: '#06b6d4' },
  { label: 'Forest', value: 'forest-emerald', swatch: '#10b981' },
  { label: 'Rose', value: 'rose-blush', swatch: '#fb7185' },
];

const VOICE_SPARK_OPTIONS: Array<{ label: string; value: string | null }> = [
  { label: 'None', value: null },
  { label: 'Whisper 8k', value: 'whisper-8k' },
  { label: 'Pulse 8k', value: 'pulse-8k' },
  { label: 'Breeze 8k', value: 'breeze-8k' },
];

const RADAR_TIERS: Array<{
  name: string;
  threshold: string;
  accentColor: string;
  effect: string;
}> = [
  {
    name: 'Spark',
    threshold: '0-99 radiance',
    accentColor: '#22d3ee',
    effect: 'Cool blue sweep with lighter pulse rings.',
  },
  {
    name: 'Glow',
    threshold: '100-499 radiance',
    accentColor: '#34d399',
    effect: 'Balanced green sweep with brighter halo rhythm.',
  },
  {
    name: 'Supernova',
    threshold: '500+ radiance',
    accentColor: '#fb923c',
    effect: 'Warm orange sweep with stronger pulse waves and highlights.',
  },
];

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

function getRadarUnavailableReason(error: unknown) {
  if (typeof error === 'string' && error.trim().length) {
    return error.trim();
  }

  if (error && typeof error === 'object') {
    const maybeError = error as {
      message?: unknown;
      reason?: unknown;
      code?: unknown;
    };

    const details: string[] = [];

    if (typeof maybeError.message === 'string' && maybeError.message.trim().length) {
      details.push(maybeError.message.trim());
    }

    if (
      typeof maybeError.reason === 'string' &&
      maybeError.reason.trim().length &&
      maybeError.reason !== maybeError.message
    ) {
      details.push(maybeError.reason.trim());
    }

    if (typeof maybeError.code === 'string' || typeof maybeError.code === 'number') {
      details.push(`Code: ${String(maybeError.code)}`);
    }

    if (details.length) {
      return details.join(' | ');
    }
  }

  return 'Bluetooth stack startup failed without a native error message.';
}

function isPinTypeUnlocked(pinType: MessagePinType, radianceScore: number) {
  return radianceScore >= (PIN_TYPE_UNLOCKS[pinType] ?? 0);
}

export function HomeScreen() {
  const [message, setMessage] = useState('');
  const [radarOn, setRadarOn] = useState(false);
  const [isRadarBusy, setIsRadarBusy] = useState(false);
  const [hasHydratedMessage, setHasHydratedMessage] = useState(false);
  const [permissionDialogVisible, setPermissionDialogVisible] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>(EMPTY_PERMISSIONS);
  const [isPermissionBusy, setIsPermissionBusy] = useState(false);
  const [radarTierModalVisible, setRadarTierModalVisible] = useState(false);
  const [isWaveBusy, setIsWaveBusy] = useState(false);
  const [pingPulseSignal, setPingPulseSignal] = useState(0);
  const [latestPingSource, setLatestPingSource] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedPinType, setSelectedPinType] = useState<MessagePinType>('classic');
  const [selectedAuraColor, setSelectedAuraColor] = useState<string | null>(null);
  const [selectedVoiceSpark, setSelectedVoiceSpark] = useState<string | null>(null);
  const upsertDailyMessage = useUpsertDailyMessage();
  const queueMessageDraft = useQueueMessageDraft();
  const removeQueuedDraft = useRemoveQueuedMessageDraft();
  const queuedDrafts = useQueuedMessageDrafts();
  const todayMessage = useTodayMessage();
  const dailyMessageStats = useDailyMessageStats();
  const echoOfPast = useEchoOfPast();
  const encounters = useEncounterFeed();
  const { profile, stats } = useProfileDashboard();
  const dailyPrompt = useDailyPrompt();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const radarPanelGradient = isDark
    ? (['rgba(30,41,59,0.85)', 'rgba(6,78,59,0.25)', 'rgba(15,23,42,0.85)'] as const)
    : (['rgba(236,253,245,0.96)', 'rgba(167,243,208,0.64)', 'rgba(220,252,231,0.92)'] as const);

  const radarStatusGradient = isDark
    ? (['rgba(16,185,129,0.2)', 'rgba(15,23,42,0.75)'] as const)
    : (['rgba(16,185,129,0.16)', 'rgba(255,255,255,0.94)'] as const);

  const messageCardGradient = isDark
    ? (['rgba(6,95,70,0.2)', 'rgba(30,41,59,0.92)', 'rgba(15,23,42,0.98)'] as const)
    : (['rgba(236,253,245,0.98)', 'rgba(209,250,229,0.93)', 'rgba(240,253,250,0.96)'] as const);

  const savedMessageGradient = isDark
    ? (['rgba(52,211,153,0.2)', 'rgba(15,23,42,0.8)'] as const)
    : (['rgba(167,243,208,0.4)', 'rgba(255,255,255,0.96)'] as const);

  const receivedStatsGradient = isDark
    ? (['rgba(16,185,129,0.18)', 'rgba(15,23,42,0.85)'] as const)
    : (['rgba(16,185,129,0.16)', 'rgba(236,253,245,0.96)'] as const);

  const resetStatsGradient = isDark
    ? (['rgba(30,64,175,0.18)', 'rgba(15,23,42,0.85)'] as const)
    : (['rgba(59,130,246,0.12)', 'rgba(239,246,255,0.96)'] as const);

  const remaining = useMemo(() => MAX_MESSAGE_LENGTH - message.length, [message.length]);
  const pinOptionsWithUnlocks = useMemo(
    () =>
      PIN_TYPE_OPTIONS.map((option) => {
        const unlockAt = PIN_TYPE_UNLOCKS[option.value] ?? 0;
        return {
          ...option,
          unlockAt,
          isUnlocked: profile.radianceScore >= unlockAt,
        };
      }),
    [profile.radianceScore],
  );
  const hasSavedMessageToday = Boolean(todayMessage.data);
  const savedMessageBody = todayMessage.data?.body ?? '';
  const resetCountdown = useMemo(() => formatTimeLeft(timeUntilNextUtcReset(nowMs)), [nowMs]);
  const queuedDraftCount = queuedDrafts.data.length;
  const oldestQueuedDraft = queuedDrafts.data[0] ?? null;
  const lastNearbyNotifyCountRef = React.useRef(0);

  const nearbyPeopleCount = useMemo(() => {
    const cutoffMs = Date.now() - 20 * 60 * 1000;
    const unique = new Set<string>();

    for (const encounter of encounters.data ?? []) {
      const happenedAtMs = new Date(encounter.happenedAt).getTime();
      if (!Number.isFinite(happenedAtMs) || happenedAtMs < cutoffMs) {
        continue;
      }

      unique.add(encounter.observedProfileId);
    }

    return unique.size;
  }, [encounters.data, nowMs]);

  const refreshPermissionDialogState = React.useCallback(async () => {
    const next = await getPermissionState();
    setPermissionState(next);

    const corePermissionsGranted = next.bluetoothGranted && next.locationGranted;
    setPermissionDialogVisible(!corePermissionsGranted);
  }, []);

  const syncRadarStatus = React.useCallback(async () => {
    try {
      const status = await getBleBackgroundLoopStatus();
      setRadarOn(status);
    } catch {
      // Keep last known UI state if status probing fails.
    }
  }, []);

  React.useEffect(() => {
    void syncRadarStatus();
  }, [syncRadarStatus]);

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
        void syncRadarStatus();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [refreshPermissionDialogState, syncRadarStatus]);

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
    const hydratedPinType = todayMessage.data.pinType ?? 'classic';
    setSelectedPinType(
      isPinTypeUnlocked(hydratedPinType, profile.radianceScore) ? hydratedPinType : 'classic',
    );
    setSelectedAuraColor(todayMessage.data.auraColor ?? null);
    setSelectedVoiceSpark(todayMessage.data.voiceSpark ?? null);
    setHasHydratedMessage(true);
  }, [hasHydratedMessage, profile.radianceScore, todayMessage.data]);

  React.useEffect(() => {
    const unsubscribe = subscribeToProximityPings((payload) => {
      setPingPulseSignal((previous) => previous + 1);
      setLatestPingSource(payload.lumeId || payload.profileId);
    });

    return unsubscribe;
  }, []);

  React.useEffect(() => {
    if (!latestPingSource) {
      return;
    }

    const timer = setTimeout(() => {
      setLatestPingSource(null);
    }, 4500);

    return () => {
      clearTimeout(timer);
    };
  }, [latestPingSource]);

  React.useEffect(() => {
    if (!radarOn || nearbyPeopleCount <= 0) {
      if (nearbyPeopleCount <= 0) {
        lastNearbyNotifyCountRef.current = 0;
      }
      return;
    }

    if (nearbyPeopleCount === lastNearbyNotifyCountRef.current) {
      return;
    }

    lastNearbyNotifyCountRef.current = nearbyPeopleCount;

    presentAppModal({
      title: 'Nearby users detected',
      message:
        nearbyPeopleCount === 1
          ? '1 person is nearby right now. Send a wave to say hi.'
          : `${nearbyPeopleCount} people are nearby right now. Send a wave to say hi.`,
    });
  }, [nearbyPeopleCount, radarOn]);

  const onPromptPermissions = async () => {
    if (isPermissionBusy) return;

    setIsPermissionBusy(true);
    try {
      await requestRadarPermissions();
      await refreshPermissionDialogState();
    } finally {
      setIsPermissionBusy(false);
    }
  };

  const onSaveDailyMessage = () => {
    const payload = message.trim();
    if (!payload.length || hasSavedMessageToday) return;

    if (!isPinTypeUnlocked(selectedPinType, profile.radianceScore)) {
      presentAppModal({
        title: 'Pin locked',
        message: `${selectedPinType[0].toUpperCase()}${selectedPinType.slice(1)} unlocks at ${PIN_TYPE_UNLOCKS[selectedPinType]} radiance.`,
      });
      return;
    }

    upsertDailyMessage.mutate(
      {
        body: payload,
        pinType: selectedPinType,
        auraColor: selectedAuraColor,
        voiceSpark: selectedVoiceSpark,
      },
      {
        onSuccess: () => {
          setMessage('');
          setSelectedAuraColor(null);
          setSelectedVoiceSpark(null);
          void dailyPrompt.requestAndScheduleDailyPrompt();
        },
        onError: (error) => {
          if (error.message === 'Daily message already saved') {
            presentAppModal({
              title: 'Message locked',
              message: 'You can only save one message per day.',
            });
            return;
          }

          presentAppModal({
            title: 'Could not save message',
            message: 'Please try again.',
          });
        },
      },
    );
  };

  const onQueueDraft = () => {
    const payload = message.trim();
    if (!payload.length) {
      return;
    }

    queueMessageDraft.mutate(
      {
        body: payload,
        pinType: selectedPinType,
        auraColor: selectedAuraColor,
        voiceSpark: selectedVoiceSpark,
      },
      {
        onSuccess: () => {
          setMessage('');
          setSelectedAuraColor(null);
          setSelectedVoiceSpark(null);
          presentAppModal({
            title: 'Draft queued',
            message: 'Saved to your offline draft queue. You can load it anytime.',
          });
        },
        onError: (error) => {
          presentAppModal({
            title: 'Could not queue draft',
            message: error.message || 'Please try again.',
          });
        },
      },
    );
  };

  const onLoadQueuedDraft = () => {
    const draft = oldestQueuedDraft;
    if (!draft) {
      return;
    }

    const nextPinType = isPinTypeUnlocked(draft.pinType, profile.radianceScore)
      ? draft.pinType
      : 'classic';

    if (nextPinType !== draft.pinType) {
      presentAppModal({
        title: 'Draft pin adjusted',
        message: `${draft.pinType[0].toUpperCase()}${draft.pinType.slice(1)} is currently locked. Loaded as Classic instead.`,
      });
    }

    setSelectedPinType(nextPinType);
    setMessage(draft.body);
    setSelectedAuraColor(draft.auraColor ?? null);
    setSelectedVoiceSpark(draft.voiceSpark ?? null);
    removeQueuedDraft.mutate({ draftId: draft.id });
  };

  const onUseEchoOfPast = () => {
    if (!echoOfPast.data) {
      return;
    }

    const nextPinType = isPinTypeUnlocked(echoOfPast.data.pinType, profile.radianceScore)
      ? echoOfPast.data.pinType
      : 'classic';

    setSelectedPinType(nextPinType);
    setMessage(echoOfPast.data.body);
  };

  const onSendWave = async () => {
    if (isWaveBusy) {
      return;
    }

    if (!radarOn) {
      presentAppModal({
        title: 'Radar is off',
        message: 'Turn Radar on before sending a wave.',
      });
      return;
    }

    if (nearbyPeopleCount <= 0) {
      presentAppModal({
        title: 'No nearby users yet',
        message: 'Keep Radar on a little longer, then send a wave when someone appears nearby.',
      });
      return;
    }

    setIsWaveBusy(true);
    try {
      await sendProximityPing();
      setPingPulseSignal((previous) => previous + 1);
      setLatestPingSource('You');
      presentAppModal({
        title: 'Wave sent',
        message:
          nearbyPeopleCount === 1
            ? 'Your wave was sent to 1 nearby person.'
            : `Your wave was sent to ${nearbyPeopleCount} nearby people.`,
      });
    } catch (error: any) {
      presentAppModal({
        title: 'Wave failed',
        message: error?.message || 'Could not send a wave right now. Please try again.',
      });
    } finally {
      setIsWaveBusy(false);
    }
  };

  const onRadarToggle = async (next: boolean) => {
    if (isRadarBusy) return;
    setIsRadarBusy(true);

    try {
      if (!next) {
        await stopBleBackgroundLoop();
        setRadarOn(false);
        return;
      }

      const hasPermissions = await requestRadarPermissions();
      if (!hasPermissions) {
        setRadarOn(false);
        await refreshPermissionDialogState();
        setPermissionDialogVisible(true);
        return;
      }

      await startBleBackgroundLoop();
      setRadarOn(true);
    } catch (error) {
      const status = await getBleBackgroundLoopStatus();
      setRadarOn(status);

      presentAppModal({
        title: 'Radar unavailable',
        message: `Could not start Radar right now.\n\nReason: ${getRadarUnavailableReason(error)}`,
      });
    } finally {
      setIsRadarBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-lume-bgLight dark:bg-lume-bgDark">
      <View className="flex-1">
        <Modal
          visible={permissionDialogVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPermissionDialogVisible(false)}
        >
          <View className="flex-1 items-center justify-center bg-lume-bgLight/80 px-6 dark:bg-lume-bgDark/80">
            <View className="w-full max-w-md overflow-hidden rounded-3xl border border-lume-borderLight bg-lume-surfaceLight p-6 shadow-sm dark:border-lume-borderDark dark:bg-lume-surfaceDark dark:shadow-none">
                <Text className="text-xl font-black text-slate-900 dark:text-slate-50">Permissions Needed</Text>
                <Text className="mt-2 text-slate-700 dark:text-slate-200">
                  Turn on Bluetooth and Location for full Lume proximity messaging. Daily Spark reminders
                  are optional and requested after your first saved message.
                </Text>

                <View className="mt-4 rounded-2xl border border-lume-borderLight bg-lume-bgLight p-4 dark:border-lume-borderDark dark:bg-lume-surfaceDarker">
                  <Text className="text-slate-700 dark:text-slate-200">
                    Bluetooth:{' '}
                    <Text className={permissionState.bluetoothGranted ? 'text-emerald-400' : 'text-rose-300'}>
                      {permissionState.bluetoothGranted ? 'On' : 'Off'}
                    </Text>
                  </Text>
                  <Text className="mt-1 text-slate-700 dark:text-slate-200">
                    Location:{' '}
                    <Text className={permissionState.locationGranted ? 'text-emerald-400' : 'text-rose-300'}>
                      {permissionState.locationGranted ? 'On' : 'Off'}
                    </Text>
                  </Text>
                </View>

                <Pressable
                  className={
                    isPermissionBusy
                      ? 'mt-5 min-h-12 rounded-2xl bg-emerald-400/70 py-3'
                      : 'mt-5 min-h-12 rounded-2xl bg-emerald-400 py-3'
                  }
                  onPress={onPromptPermissions}
                  disabled={isPermissionBusy}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                >
                  <Text className="text-center font-bold text-slate-950">
                    {isPermissionBusy ? 'Requesting...' : 'Turn On Core Permissions'}
                  </Text>
                </Pressable>

                <Pressable
                  className="mt-3 min-h-12 rounded-2xl border border-lume-borderLight py-3 dark:border-lume-borderDark"
                  onPress={() => setPermissionDialogVisible(false)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                >
                  <Text className="text-center font-semibold text-slate-700 dark:text-slate-200">Continue in Limited Mode</Text>
                </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={radarTierModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRadarTierModalVisible(false)}
        >
          <View className="flex-1 items-center justify-center bg-lume-bgDark/70 px-6">
            <View className="w-full max-w-md rounded-3xl border border-lume-borderLight bg-lume-surfaceLight p-5 shadow-sm dark:border-lume-borderDark dark:bg-lume-surfaceDark dark:shadow-none">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-black text-slate-900 dark:text-slate-50">Radar Tiers</Text>
                <Pressable
                  onPress={() => setRadarTierModalVisible(false)}
                  className="h-9 w-9 items-center justify-center rounded-full border border-lume-borderLight bg-lume-bgLight dark:border-lume-borderDark dark:bg-lume-surfaceDarker"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  })}
                >
                  <X size={14} color="#94a3b8" />
                </Pressable>
              </View>

              <Text className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                Radar color and pulse effects evolve as your radiance grows.
              </Text>

              {RADAR_TIERS.map((tier) => (
                <View key={tier.name} className="mt-3 rounded-2xl border border-lume-borderLight bg-lume-bgLight px-4 py-3 dark:border-lume-borderDark dark:bg-lume-surfaceDarker">
                  <View className="flex-row items-center">
                    <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tier.accentColor }} />
                    <Text className="ml-2 text-sm font-semibold text-slate-900 dark:text-slate-50">{tier.name}</Text>
                    <Text className="ml-2 text-xs text-slate-500 dark:text-slate-300">{tier.threshold}</Text>
                  </View>
                  <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">{tier.effect}</Text>
                </View>
              ))}
            </View>
          </View>
        </Modal>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 22 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center">
            <Text className="text-3xl font-black text-slate-900 dark:text-slate-50">Your Presence</Text>
            <View className="ml-2 rounded-full bg-emerald-400/20 px-2 py-1">
              <Sparkles size={13} color="#6ee7b7" />
            </View>
          </View>
          <Text className="mt-2 text-slate-700 dark:text-slate-200">Share a message with the people around you.</Text>

          <View className="mt-3 flex-row">
            <View className="mr-2 flex-1 rounded-2xl border border-lume-borderLight bg-lume-surfaceLight px-3 py-3 dark:border-lume-borderDark dark:bg-lume-surfaceDark">
              <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Radiance Streak</Text>
              <Text className="mt-1 text-lg font-black text-slate-900 dark:text-slate-50">{stats.streakDays} days</Text>
            </View>

            <View className="ml-2 flex-1 rounded-2xl border border-lume-borderLight bg-lume-surfaceLight px-3 py-3 dark:border-lume-borderDark dark:bg-lume-surfaceDark">
              <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Queued Drafts</Text>
              <Text className="mt-1 text-lg font-black text-slate-900 dark:text-slate-50">{queuedDraftCount}</Text>
            </View>
          </View>

          <View className="mt-3 items-center overflow-hidden rounded-[32px] border border-lume-borderLight bg-lume-surfaceLight shadow-sm dark:border-lume-borderDark dark:bg-lume-surfaceDark dark:shadow-none">
            <LinearGradient colors={radarPanelGradient} className="w-full items-center px-4 py-6">
              <View className="w-full items-center">
                <Pressable
                  onPress={() => setRadarTierModalVisible(true)}
                  className="absolute right-1 top-0 z-10 h-9 w-9 items-center justify-center rounded-full border border-lume-borderLight bg-lume-surfaceLight/90 dark:border-lume-borderDark dark:bg-lume-surfaceDark/90"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  })}
                >
                  <CircleHelp size={15} color="#10b981" />
                </Pressable>

                <AuraVisualizer
                  isActive={radarOn}
                  onPress={() => onRadarToggle(!radarOn)}
                  disabled={isRadarBusy}
                  isBusy={isRadarBusy}
                  radianceScore={profile.radianceScore}
                  pingPulseSignal={pingPulseSignal}
                />
              </View>

              <View className="mt-4 w-full overflow-hidden rounded-2xl border border-emerald-300/20">
                <LinearGradient colors={radarStatusGradient} className="px-4 py-3">
                  <View className="flex-row items-center">
                    {isRadarBusy ? (
                      <ActivityIndicator size="small" color="#6ee7b7" />
                    ) : (
                      <Radar size={16} color={radarOn ? '#6ee7b7' : '#94a3b8'} />
                    )}
                    <Text className={isDark ? 'ml-2 text-sm font-semibold text-slate-50' : 'ml-2 text-sm font-semibold text-slate-800'}>
                      {isRadarBusy ? 'Updating radar state...' : radarOn ? 'Radar is live and scanning nearby Lume IDs.' : 'Radar is paused.'}
                    </Text>
                  </View>

                  <View className="mt-3 flex-row items-center justify-between">
                    <Text className="text-xs text-slate-600 dark:text-slate-300">
                      {latestPingSource ? `Wave received from ${latestPingSource}` : 'Send a wave to nearby Lume users.'}
                    </Text>

                    <Pressable
                      onPress={onSendWave}
                      disabled={isWaveBusy}
                      className={
                        isWaveBusy
                          ? 'min-h-10 rounded-xl border border-emerald-300/40 bg-emerald-300/20 px-3 py-2 opacity-70'
                          : 'min-h-10 rounded-xl border border-emerald-300/40 bg-emerald-300/20 px-3 py-2'
                      }
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.8 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      })}
                    >
                      <Text className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
                        {isWaveBusy ? 'Sending...' : 'Send Wave'}
                      </Text>
                    </Pressable>
                  </View>

                  <View className="mt-3 flex-row items-center justify-between rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2">
                    <View className="flex-row items-center">
                      <View
                        className={
                          nearbyPeopleCount > 0
                            ? 'h-2.5 w-2.5 rounded-full bg-emerald-400'
                            : 'h-2.5 w-2.5 rounded-full bg-slate-400'
                        }
                      />
                      <Text className="ml-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
                        Nearby {nearbyPeopleCount}
                      </Text>
                    </View>

                    <Text className="text-[11px] text-slate-600 dark:text-slate-300">
                      {nearbyPeopleCount > 0 ? 'People in range for a wave.' : 'Waiting for nearby users...'}
                    </Text>
                  </View>
                </LinearGradient>
              </View>
            </LinearGradient>
          </View>

          <View className="mt-3 overflow-hidden rounded-3xl border border-lume-borderLight bg-lume-surfaceLight shadow-sm dark:border-lume-borderDark dark:bg-lume-surfaceDark dark:shadow-none">
            <LinearGradient colors={messageCardGradient} className="p-5">
              <Text className={isDark ? 'mb-2 text-sm uppercase tracking-wider text-emerald-300' : 'mb-2 text-sm uppercase tracking-wider text-emerald-700'}>Daily Message (1 per day)</Text>

              {hasSavedMessageToday ? (
                <View>
                  <View className="overflow-hidden rounded-2xl border border-emerald-300/30">
                    <LinearGradient colors={savedMessageGradient} className="px-4 py-4">
                      <Text className={isDark ? 'text-xs uppercase tracking-wider text-emerald-200' : 'text-xs uppercase tracking-wider text-emerald-700'}>Saved Message</Text>
                      <Text className="mt-2 text-base leading-6 text-slate-900 dark:text-slate-50">{savedMessageBody}</Text>
                      <Text className={isDark ? 'mt-3 text-xs uppercase tracking-wider text-emerald-200/80' : 'mt-3 text-xs uppercase tracking-wider text-emerald-700/80'}>
                        Pin Type {todayMessage.data?.pinType ?? 'classic'}
                      </Text>

                      {todayMessage.data?.auraColor ? (
                        <Text className="mt-1 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          Aura {todayMessage.data.auraColor}
                        </Text>
                      ) : null}

                      {todayMessage.data?.voiceSpark ? (
                        <Text className="mt-1 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          Voice {todayMessage.data.voiceSpark}
                        </Text>
                      ) : null}
                    </LinearGradient>
                  </View>

                  <View className="mt-4 flex-row">
                    <View className="mr-2 flex-1 overflow-hidden rounded-2xl border border-lume-borderLight dark:border-lume-borderDark">
                      <LinearGradient colors={receivedStatsGradient} className="px-3 py-3">
                        <Text className="text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">Received By</Text>
                        {dailyMessageStats.isFetching ? (
                          <ActivityIndicator className="mt-2" size="small" color="#6ee7b7" />
                        ) : !dailyMessageStats.data.isRemoteAvailable ? (
                          <Text className="mt-2 text-lg font-bold text-slate-700 dark:text-slate-200">Offline</Text>
                        ) : (
                          <Text className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{dailyMessageStats.data.receivedUsersCount}</Text>
                        )}
                      </LinearGradient>
                    </View>

                    <View className="ml-2 flex-1 overflow-hidden rounded-2xl border border-lume-borderLight dark:border-lume-borderDark">
                      <LinearGradient colors={resetStatsGradient} className="px-3 py-3">
                        <Text className="text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">Reset In</Text>
                        <Text className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{resetCountdown}</Text>
                      </LinearGradient>
                    </View>
                  </View>

                  <Text className="mt-3 text-xs text-slate-700 dark:text-slate-200">
                    You can save a new daily message after the UTC reset.
                  </Text>
                </View>
              ) : (
                <View>
                  {echoOfPast.data ? (
                    <View className="mb-4 rounded-2xl border border-cyan-300/35 bg-cyan-400/10 p-4">
                      <Text className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                        Echo of the Past
                      </Text>
                      <Text className="mt-1 text-sm text-slate-700 dark:text-slate-200" numberOfLines={3}>
                        {echoOfPast.data.body}
                      </Text>
                      <Text className="mt-2 text-[11px] uppercase tracking-wider text-cyan-700/90 dark:text-cyan-300/90">
                        {echoOfPast.data.source} • {echoOfPast.data.messageDate} • {echoOfPast.data.rippleCount} ripples
                      </Text>

                      <Pressable
                        onPress={onUseEchoOfPast}
                        className="mt-3 min-h-11 self-start rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-3 py-2"
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.8 : 1,
                          transform: [{ scale: pressed ? 0.98 : 1 }],
                        })}
                      >
                        <Text className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-200">
                          Use this echo
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View className="rounded-3xl border border-lume-borderLight bg-lume-surfaceLight p-6 shadow-sm dark:border-lume-borderDark dark:bg-lume-surfaceDark dark:shadow-none">
                    <Text className="text-sm font-medium tracking-wide uppercase text-slate-500 dark:text-slate-300">
                      What message would you like to share today?
                    </Text>

                    <View className="mt-4 flex-row">
                      {pinOptionsWithUnlocks.map((option, index) => {
                        const isSelected = selectedPinType === option.value;
                        const isLocked = !option.isUnlocked;
                        return (
                          <Pressable
                            key={option.value}
                            onPress={() => {
                              if (isLocked) {
                                presentAppModal({
                                  title: `${option.label} is locked`,
                                  message: `Reach ${option.unlockAt} radiance to unlock this pin type.`,
                                });
                                return;
                              }

                              setSelectedPinType(option.value);
                            }}
                            className={
                              isSelected
                                ? `${index === 0 ? '' : 'ml-2 '}min-h-12 flex-1 items-center justify-center rounded-xl border border-emerald-300/60 bg-emerald-400/20 px-3 py-2`
                                : `${index === 0 ? '' : 'ml-2 '}min-h-12 flex-1 items-center justify-center rounded-xl border border-lume-borderLight bg-lume-bgLight px-3 py-2 dark:border-lume-borderDark dark:bg-lume-surfaceDarker`
                            }
                            style={({ pressed }) => ({
                              opacity: pressed ? 0.8 : 1,
                              transform: [{ scale: pressed ? 0.98 : 1 }],
                            })}
                          >
                            <Text className={isSelected ? 'text-sm font-semibold text-emerald-700 dark:text-emerald-200' : 'text-sm font-semibold text-slate-700 dark:text-slate-200'}>
                              {option.label}
                            </Text>

                            {isLocked ? (
                              <View className="mt-1 flex-row items-center rounded-full border border-amber-300/40 bg-amber-300/15 px-2 py-0.5">
                                <Lock size={10} color="#b45309" />
                                <Text className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-200">
                                  {option.unlockAt}+
                                </Text>
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>

                    <View className="mt-4">
                      <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Aura Color</Text>
                      <View className="mt-2 flex-row flex-wrap">
                        {AURA_COLOR_OPTIONS.map((option, index) => {
                          const isSelected = selectedAuraColor === option.value;
                          return (
                            <Pressable
                              key={option.label}
                              onPress={() => setSelectedAuraColor(option.value)}
                              className={
                                isSelected
                                  ? `${index === 0 ? '' : 'ml-2 '}mb-2 min-h-10 flex-row items-center rounded-full border border-emerald-300/60 bg-emerald-400/15 px-3 py-2`
                                  : `${index === 0 ? '' : 'ml-2 '}mb-2 min-h-10 flex-row items-center rounded-full border border-lume-borderLight bg-lume-bgLight px-3 py-2 dark:border-lume-borderDark dark:bg-lume-surfaceDarker`
                              }
                              style={({ pressed }) => ({
                                opacity: pressed ? 0.8 : 1,
                                transform: [{ scale: pressed ? 0.98 : 1 }],
                              })}
                            >
                              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.swatch }} />
                              <Text className="ml-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View className="mt-1">
                      <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Voice Spark</Text>
                      <View className="mt-2 flex-row flex-wrap">
                        {VOICE_SPARK_OPTIONS.map((option, index) => {
                          const isSelected = selectedVoiceSpark === option.value;
                          return (
                            <Pressable
                              key={option.label}
                              onPress={() => setSelectedVoiceSpark(option.value)}
                              className={
                                isSelected
                                  ? `${index === 0 ? '' : 'ml-2 '}mb-2 min-h-10 rounded-full border border-sky-300/60 bg-sky-400/15 px-3 py-2`
                                  : `${index === 0 ? '' : 'ml-2 '}mb-2 min-h-10 rounded-full border border-lume-borderLight bg-lume-bgLight px-3 py-2 dark:border-lume-borderDark dark:bg-lume-surfaceDarker`
                              }
                              style={({ pressed }) => ({
                                opacity: pressed ? 0.8 : 1,
                                transform: [{ scale: pressed ? 0.98 : 1 }],
                              })}
                            >
                              <Text className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View className="mt-3 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-3">
                      <Text className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        {dailyPrompt.themeTitle}
                      </Text>
                      <Text className="mt-1 text-xs uppercase tracking-wider text-emerald-700/80 dark:text-emerald-300/80">
                        {dailyPrompt.dayFlavor}
                      </Text>
                    </View>

                    <View className="mt-4 flex-row items-center justify-between">
                      <Text className={isDark ? 'text-xs uppercase tracking-wider text-emerald-300' : 'text-xs uppercase tracking-wider text-emerald-700'}>Inspiration ✦</Text>
                      <Pressable
                        onPress={dailyPrompt.shufflePrompt}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.8 : 1,
                          transform: [{ scale: pressed ? 0.98 : 1 }],
                        })}
                        className="min-h-11 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2"
                      >
                        <Text className={isDark ? 'text-xs font-semibold uppercase tracking-wider text-emerald-200' : 'text-xs font-semibold uppercase tracking-wider text-emerald-700'}>Shuffle</Text>
                      </Pressable>
                    </View>
                    <Text className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{dailyPrompt.prompt}</Text>

                    <View className="mt-3 rounded-2xl border border-lume-borderLight bg-lume-bgLight dark:border-lume-borderDark dark:bg-lume-surfaceDarker">
                      <TextInput
                        multiline
                        maxLength={MAX_MESSAGE_LENGTH}
                        placeholder={dailyPrompt.prompt}
                        placeholderTextColor="#64748b"
                        className="min-h-[140px] px-6 py-4 text-lg font-medium leading-relaxed text-slate-900 dark:text-slate-200"
                        textAlignVertical="top"
                        value={message}
                        onChangeText={setMessage}
                      />
                    </View>

                    <Text className="mt-3 text-sm font-medium tracking-wide uppercase text-slate-500 dark:text-slate-300">
                      {remaining} chars left
                    </Text>

                    <View className="mt-4 rounded-2xl border border-lume-borderLight bg-lume-bgLight px-3 py-3 dark:border-lume-borderDark dark:bg-lume-surfaceDarker">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Offline Draft Queue</Text>
                        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-200">{queuedDraftCount} queued</Text>
                      </View>

                      {oldestQueuedDraft ? (
                        <Text className="mt-2 text-xs text-slate-700 dark:text-slate-200" numberOfLines={2}>
                          Next draft: {oldestQueuedDraft.body}
                        </Text>
                      ) : (
                        <Text className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                          Queue drafts in poor signal and load them later.
                        </Text>
                      )}

                      <View className="mt-3 flex-row">
                        <Pressable
                          onPress={onQueueDraft}
                          disabled={message.trim().length === 0 || queueMessageDraft.isPending}
                          className={
                            message.trim().length === 0 || queueMessageDraft.isPending
                              ? 'mr-2 min-h-11 flex-1 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 opacity-70'
                              : 'mr-2 min-h-11 flex-1 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2'
                          }
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.8 : 1,
                            transform: [{ scale: pressed ? 0.98 : 1 }],
                          })}
                        >
                          <Text className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
                            {queueMessageDraft.isPending ? 'Queueing...' : 'Queue Draft'}
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={onLoadQueuedDraft}
                          disabled={!oldestQueuedDraft || removeQueuedDraft.isPending}
                          className={
                            !oldestQueuedDraft || removeQueuedDraft.isPending
                              ? 'ml-2 min-h-11 flex-1 items-center justify-center rounded-xl border border-sky-300/30 bg-sky-400/10 px-3 py-2 opacity-70'
                              : 'ml-2 min-h-11 flex-1 items-center justify-center rounded-xl border border-sky-300/30 bg-sky-400/10 px-3 py-2'
                          }
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.8 : 1,
                            transform: [{ scale: pressed ? 0.98 : 1 }],
                          })}
                        >
                          <Text className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-200">
                            {removeQueuedDraft.isPending ? 'Loading...' : 'Load Oldest'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

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
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.8 : 1,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    })}
                  >
                    <LinearGradient colors={['#6ee7b7', '#34d399', '#10b981']} className="min-h-12 justify-center px-6 py-3">
                      <Text className="text-center text-base font-bold tracking-tight text-slate-950">
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
    </View>
  );
}
