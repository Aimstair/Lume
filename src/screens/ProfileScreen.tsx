import React from 'react';
import { ActivityIndicator, AppState, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { MessageSquareText, MoonStar, Radar, Sun } from 'lucide-react-native';
import { useProfileDashboard } from '../hooks/useProfileDashboard';
import { RadianceProgressBar } from '../components/RadianceProgressBar';
import { useMessageHistory } from '../hooks/useMessageHistory';
import { useThemePreference } from '../hooks/useThemePreference';
import { useLocalLegendLeaderboard } from '../hooks/useLocalLegendLeaderboard';
import { useGenesisRippleTrail } from '../hooks/useGenesisRippleTrail';
import { getDisplayNameCooldownStatus, useUpdateDisplayName } from '../hooks/useProfileMutations';
import {
  getBleBackgroundLoopStatus,
  startBleBackgroundLoop,
  stopBleBackgroundLoop,
} from '../services/ble/BleBackgroundService';
import { requestRadarPermissions } from '../services/permissions';
import { DailyMessage } from '../types/domain';
import { presentAppModal } from '../services/appModal';

const THEME_OPTIONS: Array<{ value: 'system' | 'light' | 'dark'; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function shortProfileId(value: string) {
  if (!value) {
    return 'Unknown';
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatRelativeSeenTime(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRippleLocation(latitude: number | null, longitude: number | null) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return 'Location unavailable';
  }

  return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
}

export function ProfileScreen() {
  const { profile, stats } = useProfileDashboard();
  const { data: messageHistory } = useMessageHistory();
  const localLegend = useLocalLegendLeaderboard();
  const rippleTrail = useGenesisRippleTrail();
  const { themePreference, setThemePreference } = useThemePreference();
  const updateDisplayName = useUpdateDisplayName();
  const [ghostMode, setGhostMode] = React.useState(false);
  const [isGhostBusy, setIsGhostBusy] = React.useState(false);
  const [displayNameInput, setDisplayNameInput] = React.useState('');

  const syncGhostStatus = React.useCallback(async () => {
    setIsGhostBusy(true);
    try {
      const radarRunning = await getBleBackgroundLoopStatus();
      setGhostMode(!radarRunning);
    } finally {
      setIsGhostBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void syncGhostStatus();
  }, [syncGhostStatus]);

  React.useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncGhostStatus();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [syncGhostStatus]);

  React.useEffect(() => {
    setDisplayNameInput(profile.displayName?.trim() ?? '');
  }, [profile.displayName]);

  const displayName = profile.displayName?.trim() || 'You';
  const trimmedDisplayNameInput = displayNameInput.trim();
  const displayNameCooldown = getDisplayNameCooldownStatus(profile.displayNameChangedAt);
  const nextDisplayNameChangeLabel = displayNameCooldown.nextChangeAt
    ? new Date(displayNameCooldown.nextChangeAt).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const canSubmitDisplayName =
    trimmedDisplayNameInput.length > 0 &&
    trimmedDisplayNameInput !== displayName &&
    displayNameCooldown.canChange &&
    !updateDisplayName.isPending;

  const toggleGhostMode = async () => {
    if (isGhostBusy) return;

    setIsGhostBusy(true);
    try {
      if (ghostMode) {
        const hasPermissions = await requestRadarPermissions();
        if (!hasPermissions) {
          return;
        }
        await startBleBackgroundLoop();
      } else {
        await stopBleBackgroundLoop();
      }
    } catch {
      presentAppModal({
        title: 'Could not update Ghost Mode',
        message: 'Try again in a few seconds.',
      });
    } finally {
      await syncGhostStatus();
    }
  };

  const onSubmitDisplayName = () => {
    if (updateDisplayName.isPending) {
      return;
    }

    const nextName = trimmedDisplayNameInput;
    if (!nextName) {
      presentAppModal({
        title: 'Display name required',
        message: 'Enter a name before saving.',
      });
      return;
    }

    if (nextName.length < 2 || nextName.length > 30) {
      presentAppModal({
        title: 'Use 2 to 30 characters',
        message: 'Display names must be between 2 and 30 characters.',
      });
      return;
    }

    if (!displayNameCooldown.canChange) {
      presentAppModal({
        title: 'Display name locked',
        message: nextDisplayNameChangeLabel
          ? `You can change your display name again on ${nextDisplayNameChangeLabel}.`
          : 'You can change your display name once every 30 days.',
      });
      return;
    }

    presentAppModal({
      title: 'Change display name?',
      message: 'You can only change your display name once every 30 days.',
      actions: [
        {
          label: 'Cancel',
          role: 'cancel',
        },
        {
          label: 'Change',
          role: 'default',
          onPress: () => {
            updateDisplayName.mutate(
              { displayName: nextName },
              {
                onSuccess: () => {
                  presentAppModal({
                    title: 'Display name updated',
                    message: 'Your new display name is now active.',
                  });
                },
                onError: (error) => {
                  presentAppModal({
                    title: 'Could not update display name',
                    message: error.message || 'Please try again.',
                  });
                },
              },
            );
          },
        },
      ],
    });
  };

  const history = messageHistory ?? [];
  const topLegends = (localLegend.data ?? []).slice(0, 5);
  const rippleEvents = (rippleTrail.data ?? []).slice(0, 6);

  const renderHistoryItem = ({ item }: { item: DailyMessage }) => (
    <View className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs uppercase tracking-wider text-emerald-400">{item.messageDate}</Text>
        {item.pendingSync ? (
          <Text className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-xs text-amber-300">
            Pending Sync
          </Text>
        ) : (
          <Text className="text-xs text-slate-500 dark:text-slate-400">Synced</Text>
        )}
      </View>
      <Text className="mt-2 text-base leading-6 text-slate-900 dark:text-slate-50">{item.body}</Text>
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-slate-50 dark:bg-slate-950"
      data={history}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 28, paddingHorizontal: 24, paddingTop: 40 }}
      ListHeaderComponent={
        <View>
          <Text className="text-3xl font-black text-slate-900 dark:text-slate-50">Profile</Text>
          <Text className="mt-1 text-slate-700 dark:text-slate-200">Track your activity, visibility, and message history.</Text>

          <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Lume ID</Text>
            <Text className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{profile.lumeId || 'Pending'}</Text>
            <Text className="mt-1 text-slate-700 dark:text-slate-200">{displayName}</Text>
          </View>

          <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <Text className="text-lg font-semibold text-slate-900 dark:text-slate-50">Display Name</Text>
            <Text className="mt-1 text-slate-700 dark:text-slate-200">
              Changes are limited to once every 30 days.
            </Text>

            <View className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-950">
              <TextInput
                value={displayNameInput}
                onChangeText={setDisplayNameInput}
                placeholder="Enter display name"
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={30}
                className="text-base text-slate-900 dark:text-slate-100"
              />
            </View>

            {displayNameCooldown.canChange ? (
              <Text className="mt-3 text-xs text-emerald-600 dark:text-emerald-300">Your display name is ready to update.</Text>
            ) : (
              <Text className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                {nextDisplayNameChangeLabel
                  ? `Next change available on ${nextDisplayNameChangeLabel}.`
                  : 'Next change available in 30 days from your last update.'}
              </Text>
            )}

            <Pressable
              onPress={onSubmitDisplayName}
              disabled={!canSubmitDisplayName}
              style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
              className={
                canSubmitDisplayName
                  ? 'mt-4 min-h-12 items-center justify-center rounded-2xl border border-emerald-400/50 bg-emerald-400/20 py-3'
                  : 'mt-4 min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 py-3 dark:border-slate-700 dark:bg-slate-800'
              }
            >
              <Text className={canSubmitDisplayName ? 'font-semibold text-emerald-700 dark:text-emerald-200' : 'font-semibold text-slate-500 dark:text-slate-300'}>
                {updateDisplayName.isPending ? 'Saving...' : 'Save Display Name'}
              </Text>
            </Pressable>
          </View>

          <View className="mt-4">
            <RadianceProgressBar score={profile.radianceScore} goal={1000} />
          </View>

          <View className="mt-4 flex-row">
            <View className="mr-2 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Encounters</Text>
              <Text className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{stats.encountersCount}</Text>
            </View>
            <View className="mx-2 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Messages</Text>
              <Text className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{stats.dailyMessagesCount}</Text>
            </View>
            <View className="ml-2 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">Hearts</Text>
              <Text className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{stats.heartsReceived}</Text>
            </View>
          </View>

          <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <View className="flex-row items-center justify-between">
              <View className="mr-4 flex-1">
                <Text className="text-lg font-semibold text-slate-900 dark:text-slate-50">Ghost Mode</Text>
                <Text className="mt-1 text-slate-700 dark:text-slate-200">
                  {ghostMode
                    ? 'You are hidden from proximity exchange.'
                    : 'You are visible and exchanging nearby signals.'}
                </Text>
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                {ghostMode ? <MoonStar size={18} color="#e2e8f0" /> : <Sun size={18} color="#34d399" />}
              </View>
            </View>

            <Pressable
              onPress={toggleGhostMode}
              disabled={isGhostBusy}
              style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
              className={
                ghostMode
                  ? 'mt-4 flex-row items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-400/15 py-3'
                  : 'mt-4 flex-row items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 py-3 dark:border-slate-700 dark:bg-slate-800'
              }
            >
              {isGhostBusy ? <ActivityIndicator size="small" color="#34d399" /> : <Radar size={16} color="#34d399" />}
              <Text className={ghostMode ? 'ml-2 font-semibold text-emerald-300' : 'ml-2 font-semibold text-slate-700 dark:text-slate-200'}>
                {isGhostBusy ? 'Updating...' : ghostMode ? 'Disable Ghost Mode' : 'Enable Ghost Mode'}
              </Text>
            </Pressable>
          </View>

          <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <Text className="text-lg font-semibold text-slate-900 dark:text-slate-50">Appearance</Text>
            <Text className="mt-1 text-slate-700 dark:text-slate-200">
              Choose Light, Dark, or follow your phone setting.
            </Text>

            <View className="mt-4 flex-row">
              {THEME_OPTIONS.map((option, index) => {
                const isSelected = themePreference === option.value;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      void setThemePreference(option.value);
                    }}
                    className={
                      isSelected
                        ? `${index === 0 ? '' : 'ml-2 '}min-h-12 flex-1 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-400/15 px-3 py-2`
                        : `${index === 0 ? '' : 'ml-2 '}min-h-12 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 dark:border-slate-700 dark:bg-slate-800`
                    }
                    style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
                  >
                    <Text className={isSelected ? 'text-sm font-semibold text-emerald-500 dark:text-emerald-300' : 'text-sm font-semibold text-slate-700 dark:text-slate-200'}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-slate-900 dark:text-slate-50">Local Legends</Text>
              <View className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-0.5">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Last 72h
                </Text>
              </View>
            </View>

            <Text className="mt-1 text-slate-700 dark:text-slate-200">
              Most radiant nearby users based on your recent encounter graph.
            </Text>

            {topLegends.length > 0 ? (
              topLegends.map((item, index) => (
                <View
                  key={`${item.profileId}-${index}`}
                  className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                      #{index + 1} {shortProfileId(item.profileId)}
                    </Text>
                    <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      {item.radianceScore} radiance
                    </Text>
                  </View>
                  <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {item.encounterCount} encounter{item.encounterCount === 1 ? '' : 's'} • Seen {formatRelativeSeenTime(item.lastSeenAt)}
                  </Text>
                </View>
              ))
            ) : (
              <Text className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Explore with Radar on to populate your local legends.
              </Text>
            )}
          </View>

          <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-slate-900 dark:text-slate-50">Ripple Trail</Text>
              <View className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                  Genesis
                </Text>
              </View>
            </View>

            <Text className="mt-1 text-slate-700 dark:text-slate-200">
              Every time your original signal appears again nearby, it is logged as a ripple path event.
            </Text>

            {rippleEvents.length > 0 ? (
              rippleEvents.map((event) => (
                <View
                  key={event.encounterId}
                  className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                      Via {shortProfileId(event.carrierProfileId)}
                    </Text>
                    <Text className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                      Ripple {event.rippleCount}
                    </Text>
                  </View>
                  <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {formatRelativeSeenTime(event.happenedAt)} • {formatRippleLocation(event.latitude, event.longitude)}
                  </Text>
                  <Text className="mt-2 text-sm text-slate-800 dark:text-slate-100" numberOfLines={2}>
                    {event.messagePreview}
                  </Text>
                </View>
              ))
            ) : (
              <View className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <Text className="text-sm text-slate-700 dark:text-slate-200">
                  No ripple path events yet. Carry and encounter more echoes to build your legacy map.
                </Text>
              </View>
            )}
          </View>

          <View className="mb-3 mt-6 flex-row items-center">
            <MessageSquareText size={16} color="#34d399" />
            <Text className="ml-2 text-lg font-semibold text-slate-900 dark:text-slate-50">Message History</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          <Text className="text-center font-semibold text-slate-900 dark:text-slate-50">No messages yet</Text>
          <Text className="mt-2 text-center text-slate-700 dark:text-slate-200">Share your first message from Home to build your history.</Text>
        </View>
      }
      renderItem={renderHistoryItem}
    />
  );
}
