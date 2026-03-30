import React from 'react';
import { Text, View } from 'react-native';

type RadianceProgressBarProps = {
  score: number;
  goal?: number;
};

export function RadianceProgressBar({ score, goal = 1000 }: RadianceProgressBarProps) {
  const safeGoal = Math.max(1, goal);
  const percentage = Math.max(0, Math.min(100, Math.round((score / safeGoal) * 100)));

  return (
    <View className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <View className="flex-row items-end justify-between">
        <Text className="text-sm uppercase tracking-wider text-slate-400">Radiance</Text>
        <Text className="text-xs text-slate-400">{percentage}% of level goal</Text>
      </View>

      <Text className="mt-2 text-5xl font-black text-emerald-400">{score}</Text>

      <View className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
        <View className="h-3 rounded-full bg-emerald-400" style={{ width: `${percentage}%` }} />
        <View className="absolute bottom-0 top-0 rounded-full bg-emerald-300/35" style={{ width: `${percentage}%` }} />
      </View>
    </View>
  );
}
