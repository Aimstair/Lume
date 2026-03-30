import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useUpsertDailyMessage } from '../hooks/useDailyMessageMutations';
import { requestRadarPermissions } from '../services/permissions';
import {
  getBleBackgroundLoopStatus,
  startBleBackgroundLoop,
  stopBleBackgroundLoop,
} from '../services/ble/BleBackgroundService';
import { AuraVisualizer } from '../components/AuraVisualizer';

const MAX_MESSAGE_LENGTH = 280;

export function HomeScreen() {
  const [message, setMessage] = useState('');
  const [radarOn, setRadarOn] = useState(false);
  const [isRadarBusy, setIsRadarBusy] = useState(false);
  const upsertDailyMessage = useUpsertDailyMessage();

  const remaining = useMemo(() => MAX_MESSAGE_LENGTH - message.length, [message.length]);

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
    <View className="flex-1 bg-slate-950 px-6 pt-12">
      <Text className="text-3xl font-black text-white">Your Aura</Text>

      <View className="mt-7 items-center justify-center">
        <AuraVisualizer isActive={radarOn} />
      </View>

      <View className="mt-8 rounded-3xl bg-slate-900 p-5">
        <Text className="mb-2 text-sm uppercase tracking-wider text-emerald-400">Daily Message</Text>
        <TextInput
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="What energy are you broadcasting today?"
          placeholderTextColor="#94a3b8"
          className="min-h-24 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white"
          value={message}
          onChangeText={setMessage}
        />
        <Text className="mt-2 text-right text-xs text-slate-400">{remaining} chars left</Text>

        <Pressable
          className={
            message.trim().length > 0
              ? 'mt-4 rounded-2xl bg-emerald-400 py-3'
              : 'mt-4 rounded-2xl bg-emerald-400/50 py-3'
          }
          onPress={() => upsertDailyMessage.mutate({ body: message.trim() })}
          disabled={message.trim().length === 0 || upsertDailyMessage.isPending}
          style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
        >
          <Text className="text-center text-base font-bold text-slate-950">Save Message</Text>
        </Pressable>
      </View>

      <View className="mt-6 flex-row items-center justify-between rounded-2xl bg-slate-900 px-4 py-4">
        <View>
          <Text className="text-lg font-semibold text-white">Radar</Text>
          <Text className="text-slate-400">
            {isRadarBusy ? 'Updating radar state...' : radarOn ? 'Scanning nearby Lume IDs' : 'Paused'}
          </Text>
        </View>
        <View className="flex-row items-center">
          {isRadarBusy ? <ActivityIndicator size="small" color="#34d399" /> : null}
          <Switch
            value={radarOn}
            onValueChange={onRadarToggle}
            trackColor={{ true: '#34d399' }}
            disabled={isRadarBusy}
          />
        </View>
      </View>
    </View>
  );
}
