import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { useEchoFeed } from '../hooks/useEchoFeed';
import { Encounter } from '../types/domain';

export function EchoFeedScreen() {
  const { data } = useEchoFeed();

  return (
    <View className="flex-1 bg-slate-950 px-4 pt-10">
      <Text className="mb-5 text-3xl font-black text-white">Echo Feed</Text>
      <FlatList
        data={data ?? []}
        keyExtractor={(item: Encounter) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }: { item: Encounter }) => (
          <View className="mb-3 rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-emerald-400">Radiance {item.observedRadianceScore}</Text>
              {item.pendingSync ? (
                <Text className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-300">
                  Pending Sync
                </Text>
              ) : (
                <Text className="text-xs text-slate-400">Synced</Text>
              )}
            </View>
            <Text className="mt-2 text-base text-white">{item.observedMessageBody}</Text>
            <Text className="mt-2 text-xs text-slate-500">{new Date(item.happenedAt).toLocaleString()}</Text>
          </View>
        )}
      />
    </View>
  );
}
