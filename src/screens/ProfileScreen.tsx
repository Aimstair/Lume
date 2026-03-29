import React from 'react';
import { Text, View } from 'react-native';
import { useProfileDashboard } from '../hooks/useProfileDashboard';

export function ProfileScreen() {
  const { profile, stats } = useProfileDashboard();
  const progress = Math.min(100, Math.round((profile.radianceScore / 1000) * 100));

  return (
    <View className="flex-1 bg-slate-950 px-6 pt-12">
      <Text className="text-3xl font-black text-white">Radiance</Text>
      <Text className="mt-2 text-slate-400">Build impact by sharing and receiving hearts.</Text>

      <View className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-5">
        <Text className="text-sm uppercase tracking-wider text-slate-400">Current Score</Text>
        <Text className="mt-2 text-5xl font-black text-emerald-400">{profile.radianceScore}</Text>

        <View className="mt-5 h-3 rounded-full bg-slate-800">
          <View className="h-3 rounded-full bg-emerald-400" style={{ width: `${progress}%` }} />
        </View>
      </View>

      <View className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5">
        <Text className="mb-3 text-sm uppercase tracking-wider text-slate-400">Impact</Text>
        <Text className="text-white">Encounters logged: {stats.encountersCount}</Text>
        <Text className="mt-1 text-white">Messages sent: {stats.dailyMessagesCount}</Text>
        <Text className="mt-1 text-white">Hearts received: {stats.heartsReceived}</Text>
      </View>
    </View>
  );
}
