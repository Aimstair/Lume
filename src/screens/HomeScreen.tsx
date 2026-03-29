import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useUpsertDailyMessage } from '../hooks/useDailyMessageMutations';
import { requestRadarPermissions } from '../services/permissions';
import { startBleBackgroundLoop, stopBleBackgroundLoop } from '../services/ble/BleBackgroundService';

const MAX_MESSAGE_LENGTH = 280;

export function HomeScreen() {
  const [message, setMessage] = useState('');
  const [radarOn, setRadarOn] = useState(false);
  const upsertDailyMessage = useUpsertDailyMessage();

  const remaining = useMemo(() => MAX_MESSAGE_LENGTH - message.length, [message.length]);

  const onRadarToggle = async (next: boolean) => {
    if (!next) {
      setRadarOn(false);
      await stopBleBackgroundLoop();
      return;
    }

    const hasPermissions = await requestRadarPermissions();
    if (!hasPermissions) {
      setRadarOn(false);
      return;
    }

    try {
      await startBleBackgroundLoop();
      setRadarOn(true);
    } catch {
      setRadarOn(false);
      Alert.alert('Radar unavailable', 'Could not start Radar right now. Please try again.');
    }
  };

  return (
    <View className="flex-1 bg-slate-950 px-6 pt-12">
      <Text className="text-3xl font-black text-white">Your Aura</Text>

      <View className="mt-7 items-center justify-center">
        <View className="h-56 w-56 rounded-full border border-emerald-300/50 bg-emerald-300/10" />
        <View className="absolute h-36 w-36 rounded-full bg-emerald-400/50" />
        <View className="absolute h-20 w-20 rounded-full bg-emerald-300" />
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
          className="mt-4 rounded-2xl bg-emerald-400 py-3"
          onPress={() => upsertDailyMessage.mutate({ body: message.trim() })}
        >
          <Text className="text-center text-base font-bold text-slate-950">Save Message</Text>
        </Pressable>
      </View>

      <View className="mt-6 flex-row items-center justify-between rounded-2xl bg-slate-900 px-4 py-4">
        <View>
          <Text className="text-lg font-semibold text-white">Radar</Text>
          <Text className="text-slate-400">{radarOn ? 'Scanning nearby Lume IDs' : 'Paused'}</Text>
        </View>
        <Switch value={radarOn} onValueChange={onRadarToggle} trackColor={{ true: '#34d399' }} />
      </View>
    </View>
  );
}
