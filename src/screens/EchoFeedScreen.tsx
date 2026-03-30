import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Radio, Sparkles } from 'lucide-react-native';
import { useEchoFeed } from '../hooks/useEchoFeed';
import { MessageCard } from '../components/MessageCard';
import { Encounter } from '../types/domain';

export function EchoFeedScreen() {
  const { data } = useEchoFeed();
  const [sparkState, setSparkState] = React.useState<Record<string, { sparkCount: number; isSparked: boolean }>>({});

  const onSparkPress = React.useCallback((id: string) => {
    setSparkState((prev) => {
      const existing = prev[id] ?? { sparkCount: 0, isSparked: false };
      const nextSparked = !existing.isSparked;

      return {
        ...prev,
        [id]: {
          sparkCount: Math.max(0, existing.sparkCount + (nextSparked ? 1 : -1)),
          isSparked: nextSparked,
        },
      };
    });
  }, []);

  return (
    <View className="flex-1 bg-slate-950 px-4 pt-10">
      <View className="mb-5 flex-row items-end justify-between px-1">
        <View>
          <Text className="text-3xl font-black text-white">Echo Feed</Text>
          <Text className="mt-1 text-slate-400">Nearby voices collected by your radar.</Text>
        </View>
        <View className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5">
          <Text className="text-xs text-slate-300">{(data ?? []).length} echoes</Text>
        </View>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(item: Encounter) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <View className="mt-14 items-center rounded-3xl border border-dashed border-slate-700 bg-slate-900 px-5 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15">
              <Radio size={22} color="#34d399" />
            </View>
            <Text className="mt-4 text-center text-xl font-bold text-white">No echoes yet</Text>
            <Text className="mt-2 text-center leading-6 text-slate-400">
              Turn on Radar in Home and move around to discover nearby daily messages.
            </Text>
          </View>
        }
        renderItem={({ item }: { item: Encounter }) => {
          const localSpark = sparkState[item.id] ?? { sparkCount: 0, isSparked: false };
          const safeMessage = item.observedMessageBody?.trim().length
            ? item.observedMessageBody
            : 'A nearby user shared quiet energy today.';

          return (
            <MessageCard
              id={item.id}
              message={safeMessage}
              happenedAt={item.happenedAt}
              radianceScore={item.observedRadianceScore}
              pendingSync={item.pendingSync}
              sparkCount={localSpark.sparkCount}
              isSparked={localSpark.isSparked}
              onSparkPress={onSparkPress}
            />
          );
        }}
      />

      <View className="mb-3 flex-row items-center rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
        <Sparkles size={14} color="#34d399" />
        <Text className="ml-2 text-xs text-slate-400">Sparks are local reactions for now and update instantly.</Text>
      </View>
    </View>
  );
}
