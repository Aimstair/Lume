import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Heart, Sparkles } from 'lucide-react-native';

type MessageCardProps = {
  id: string;
  message: string;
  happenedAt: string;
  radianceScore: number;
  pendingSync?: boolean;
  sparkCount: number;
  isSparked: boolean;
  onSparkPress: (id: string) => void;
};

function toRelativeTime(timestamp: string) {
  const date = new Date(timestamp);
  const deltaMs = Date.now() - date.getTime();

  const mins = Math.max(1, Math.floor(deltaMs / 60_000));
  if (mins < 60) return `Passed ${mins} min${mins === 1 ? '' : 's'} ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Passed ${hours} hr${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `Passed ${days} day${days === 1 ? '' : 's'} ago`;
}

export function MessageCard({
  id,
  message,
  happenedAt,
  radianceScore,
  pendingSync,
  sparkCount,
  isSparked,
  onSparkPress,
}: MessageCardProps) {
  return (
    <View className="mb-3 rounded-3xl border border-slate-800 bg-slate-900 p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="h-3 w-3 rounded-full bg-emerald-400" />
          <Text className="ml-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Radiance {radianceScore}
          </Text>
        </View>
        {pendingSync ? (
          <View className="rounded-full bg-emerald-400/15 px-2 py-1">
            <Text className="text-xs font-semibold text-emerald-300">Pending Sync</Text>
          </View>
        ) : null}
      </View>

      <Text className="mt-3 text-base leading-6 text-white">{message}</Text>

      <View className="mt-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Sparkles size={14} color="#94a3b8" />
          <Text className="ml-1 text-xs text-slate-400">{toRelativeTime(happenedAt)}</Text>
        </View>

        <Pressable
          onPress={() => onSparkPress(id)}
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
          className={
            isSparked
              ? 'flex-row items-center rounded-full border border-emerald-400 bg-emerald-400/20 px-3 py-1.5'
              : 'flex-row items-center rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5'
          }
        >
          <Heart size={14} color={isSparked ? '#34d399' : '#94a3b8'} fill={isSparked ? '#34d399' : 'transparent'} />
          <Text className={isSparked ? 'ml-1 text-xs font-semibold text-emerald-300' : 'ml-1 text-xs text-slate-300'}>
            Spark {sparkCount > 0 ? `(${sparkCount})` : ''}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
