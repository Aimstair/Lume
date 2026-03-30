import React from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { MessageSquareText, MoonStar, Radar, Sun } from 'lucide-react-native';
import { useProfileDashboard } from '../hooks/useProfileDashboard';
import { RadianceProgressBar } from '../components/RadianceProgressBar';
import { useMessageHistory } from '../hooks/useMessageHistory';
import {
  getBleBackgroundLoopStatus,
  startBleBackgroundLoop,
  stopBleBackgroundLoop,
} from '../services/ble/BleBackgroundService';
import { requestRadarPermissions } from '../services/permissions';
import { DailyMessage } from '../types/domain';

export function ProfileScreen() {
  const { profile, stats } = useProfileDashboard();
  const { data: messageHistory } = useMessageHistory();
  const [ghostMode, setGhostMode] = React.useState(false);
  const [isGhostBusy, setIsGhostBusy] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    const syncGhostStatus = async () => {
      setIsGhostBusy(true);
      try {
        const radarRunning = await getBleBackgroundLoopStatus();
        if (isMounted) {
          setGhostMode(!radarRunning);
        }
      } finally {
        if (isMounted) {
          setIsGhostBusy(false);
        }
      }
    };

    syncGhostStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const displayName = profile.displayName?.trim() || 'You';

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
        setGhostMode(false);
        return;
      }

      await stopBleBackgroundLoop();
      setGhostMode(true);
    } catch {
      Alert.alert('Could not update Ghost Mode', 'Try again in a few seconds.');
    } finally {
      setIsGhostBusy(false);
    }
  };

  const history = messageHistory ?? [];

  const renderHistoryItem = ({ item }: { item: DailyMessage }) => (
    <View className="mb-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs uppercase tracking-wider text-emerald-400">{item.messageDate}</Text>
        {item.pendingSync ? (
          <Text className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-xs text-amber-300">
            Pending Sync
          </Text>
        ) : (
          <Text className="text-xs text-slate-500">Synced</Text>
        )}
      </View>
      <Text className="mt-2 text-base leading-6 text-white">{item.body}</Text>
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-slate-950"
      data={history}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 28, paddingHorizontal: 24, paddingTop: 40 }}
      ListHeaderComponent={
        <View>
          <Text className="text-3xl font-black text-white">Profile</Text>
          <Text className="mt-1 text-slate-400">Track your radiance, visibility, and broadcast history.</Text>

          <View className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <Text className="text-xs uppercase tracking-wider text-slate-400">Lume ID</Text>
            <Text className="mt-1 text-lg font-semibold text-white">{profile.lumeId || 'Pending'}</Text>
            <Text className="mt-1 text-slate-400">{displayName}</Text>
          </View>

          <View className="mt-4">
            <RadianceProgressBar score={profile.radianceScore} goal={1000} />
          </View>

          <View className="mt-4 flex-row">
            <View className="mr-2 flex-1 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <Text className="text-xs uppercase tracking-wider text-slate-500">Encounters</Text>
              <Text className="mt-2 text-2xl font-black text-white">{stats.encountersCount}</Text>
            </View>
            <View className="mx-2 flex-1 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <Text className="text-xs uppercase tracking-wider text-slate-500">Messages</Text>
              <Text className="mt-2 text-2xl font-black text-white">{stats.dailyMessagesCount}</Text>
            </View>
            <View className="ml-2 flex-1 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <Text className="text-xs uppercase tracking-wider text-slate-500">Hearts</Text>
              <Text className="mt-2 text-2xl font-black text-white">{stats.heartsReceived}</Text>
            </View>
          </View>

          <View className="mt-4 rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <View className="flex-row items-center justify-between">
              <View className="mr-4 flex-1">
                <Text className="text-lg font-semibold text-white">Ghost Mode</Text>
                <Text className="mt-1 text-slate-400">
                  {ghostMode
                    ? 'You are hidden from proximity exchange.'
                    : 'You are visible and exchanging nearby signals.'}
                </Text>
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-slate-800">
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
                  : 'mt-4 flex-row items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 py-3'
              }
            >
              {isGhostBusy ? <ActivityIndicator size="small" color="#34d399" /> : <Radar size={16} color="#34d399" />}
              <Text className={ghostMode ? 'ml-2 font-semibold text-emerald-300' : 'ml-2 font-semibold text-slate-200'}>
                {isGhostBusy ? 'Updating...' : ghostMode ? 'Disable Ghost Mode' : 'Enable Ghost Mode'}
              </Text>
            </Pressable>
          </View>

          <View className="mb-3 mt-6 flex-row items-center">
            <MessageSquareText size={16} color="#34d399" />
            <Text className="ml-2 text-lg font-semibold text-white">Message History</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-5">
          <Text className="text-center font-semibold text-white">No messages yet</Text>
          <Text className="mt-2 text-center text-slate-400">Share your first daily message from Home to build your history.</Text>
        </View>
      }
      renderItem={renderHistoryItem}
    />
  );
}
