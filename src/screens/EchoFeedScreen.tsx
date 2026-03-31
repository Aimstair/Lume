import React from 'react';
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  SectionList,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Heart, Inbox } from 'lucide-react-native';
import { useEncounterFeed } from '../hooks/useEchoInbox';
import { useRippleMessage } from '../hooks/useDailyMessageMutations';
import { useEchoInboxActions } from '../hooks/useEchoInboxActions';
import { useHeartReaction } from '../hooks/useReactionMutations';
import { MessagePinType } from '../types/domain';

type EchoFeedScreenProps = {
  onOpenInbox?: () => void;
  unreadCount?: number;
};

type EchoCard = {
  id: string;
  encounterId: string;
  content: string;
  senderId: string;
  happenedAt: string;
  messageDate: string;
  pinType: MessagePinType;
  rippleCount: number;
  originalSenderId: string | null;
};

type EchoSection = {
  key: string;
  title: string;
  data: EchoCard[];
};

type SwipeAction = 'spark' | 'report' | 'carry';

function dayKeyFromIso(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown';
  }

  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSectionTitle(dayKey: string) {
  if (dayKey === 'unknown') {
    return 'Unknown date';
  }

  const parsed = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dayKey;
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimestamp(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }

  return parsed.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function EchoFeedScreen({ onOpenInbox, unreadCount = 0 }: EchoFeedScreenProps) {
  const { width, height } = useWindowDimensions();
  const encounters = useEncounterFeed();
  const rippleMessage = useRippleMessage();
  const heartReaction = useHeartReaction();
  const { reportEcho } = useEchoInboxActions();

  const [selectedMessage, setSelectedMessage] = React.useState<EchoCard | null>(null);
  const [sparkedEncounterIds, setSparkedEncounterIds] = React.useState<Set<string>>(new Set());
  const [isCardActionBusy, setIsCardActionBusy] = React.useState(false);

  const pan = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const cardRotate = pan.x.interpolate({
    inputRange: [-180, 0, 180],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  const sparkHintOpacity = pan.x.interpolate({
    inputRange: [40, 140],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const reportHintOpacity = pan.x.interpolate({
    inputRange: [-140, -40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const carryHintOpacity = pan.y.interpolate({
    inputRange: [-140, -40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const cards = React.useMemo<EchoCard[]>(() => {
    return (encounters.data ?? []).map((encounter) => ({
      id: encounter.id,
      encounterId: encounter.id,
      content: encounter.observedMessageBody,
      senderId: encounter.observedProfileId,
      happenedAt: encounter.happenedAt,
      messageDate: encounter.observedMessageDate,
      pinType: encounter.observedPinType,
      rippleCount: encounter.observedRippleCount,
      originalSenderId: encounter.originalSenderId,
    }));
  }, [encounters.data]);

  const sections = React.useMemo<EchoSection[]>(() => {
    const grouped = new Map<string, EchoCard[]>();

    for (const card of cards) {
      const dayKey = dayKeyFromIso(card.happenedAt);
      const existing = grouped.get(dayKey) ?? [];
      existing.push(card);
      grouped.set(dayKey, existing);
    }

    return Array.from(grouped.entries())
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([key, data]) => ({
        key,
        title: formatSectionTitle(key),
        data,
      }));
  }, [cards]);

  const closeReader = React.useCallback(() => {
    if (isCardActionBusy) {
      return;
    }

    setSelectedMessage(null);
  }, [isCardActionBusy]);

  React.useEffect(() => {
    if (!selectedMessage) {
      pan.setValue({ x: 0, y: 0 });
      setIsCardActionBusy(false);
    }
  }, [pan, selectedMessage]);

  const resetCardPosition = React.useCallback(() => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 7,
      tension: 80,
    }).start();
  }, [pan]);

  const animateCardOut = React.useCallback(
    (toValue: { x: number; y: number }) => {
      return new Promise<void>((resolve) => {
        Animated.timing(pan, {
          toValue,
          duration: 220,
          useNativeDriver: true,
        }).start(() => resolve());
      });
    },
    [pan],
  );

  const performSwipeAction = React.useCallback(
    async (action: SwipeAction) => {
      if (!selectedMessage || isCardActionBusy) {
        return;
      }

      setIsCardActionBusy(true);

      try {
        if (action === 'spark') {
          await animateCardOut({ x: width * 0.95, y: 0 });

          if (!sparkedEncounterIds.has(selectedMessage.encounterId)) {
            await heartReaction.mutateAsync({
              encounterId: selectedMessage.encounterId,
              observedProfileId: selectedMessage.senderId,
              messageDate: selectedMessage.messageDate,
            });

            setSparkedEncounterIds((previous) => {
              const next = new Set(previous);
              next.add(selectedMessage.encounterId);
              return next;
            });
          }

          setSelectedMessage(null);
          return;
        }

        if (action === 'report') {
          await animateCardOut({ x: -width * 0.95, y: 0 });
          await reportEcho(selectedMessage.encounterId);
          setSelectedMessage(null);
          return;
        }

        await animateCardOut({ x: 0, y: -height * 0.7 });
        await rippleMessage.mutateAsync({
          encounterId: selectedMessage.encounterId,
          body: selectedMessage.content,
          sourceProfileId: selectedMessage.senderId,
          sourceMessageDate: selectedMessage.messageDate,
          sourceOriginalSenderId: selectedMessage.originalSenderId,
          pinType: selectedMessage.pinType,
        });
        setSelectedMessage(null);
      } catch (error: any) {
        resetCardPosition();
        Alert.alert('Action failed', error?.message || 'Please try again.');
      } finally {
        setIsCardActionBusy(false);
      }
    },
    [
      animateCardOut,
      heartReaction,
      height,
      isCardActionBusy,
      reportEcho,
      resetCardPosition,
      rippleMessage,
      selectedMessage,
      sparkedEncounterIds,
      width,
    ],
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          if (isCardActionBusy) {
            return false;
          }

          return Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_evt, gestureState) => {
          if (isCardActionBusy) {
            return;
          }

          const absX = Math.abs(gestureState.dx);
          const absY = Math.abs(gestureState.dy);

          if (gestureState.dx > 120 && absX > absY) {
            void performSwipeAction('spark');
            return;
          }

          if (gestureState.dx < -120 && absX > absY) {
            void performSwipeAction('report');
            return;
          }

          if (gestureState.dy < -120 && absY > absX) {
            void performSwipeAction('carry');
            return;
          }

          resetCardPosition();
        },
        onPanResponderTerminate: () => {
          if (!isCardActionBusy) {
            resetCardPosition();
          }
        },
      }),
    [isCardActionBusy, pan.x, pan.y, performSwipeAction, resetCardPosition],
  );

  return (
    <View className="flex-1 bg-emerald-50 dark:bg-slate-950">
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 34 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View className="mb-2 mt-6">
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-300">
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isSparked = sparkedEncounterIds.has(item.encounterId);

          return (
            <Pressable
              onPress={() => setSelectedMessage(item)}
              style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
              className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Text className="text-xs font-semibold uppercase tracking-widest text-emerald-500 dark:text-emerald-300">
                    {item.pinType} pin
                  </Text>

                  {isSparked ? (
                    <View className="ml-2 flex-row items-center rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2 py-0.5">
                      <Heart size={10} color="#34d399" fill="#34d399" />
                      <Text className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                        Sparked
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text className="text-xs text-slate-500 dark:text-slate-300">{formatTimestamp(item.happenedAt)}</Text>
              </View>

              <Text className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">From {item.senderId}</Text>
              <Text className="mt-2 text-base leading-6 text-slate-800 dark:text-slate-100" numberOfLines={4}>
                {item.content}
              </Text>

              <Text className="mt-3 text-xs text-slate-500 dark:text-slate-300">Ripples {item.rippleCount}</Text>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View>
            <View className="flex-row items-start justify-between">
              <View className="max-w-[78%]">
                <Text className="text-3xl font-black text-slate-900 dark:text-slate-50">Echoes</Text>
                <Text className="mt-1 text-slate-700 dark:text-slate-200">
                  Open a card, then swipe right to spark, left to report, and up to carry.
                </Text>
              </View>

              {unreadCount > 0 ? (
                <Pressable
                  onPress={onOpenInbox}
                  className="rounded-full border border-emerald-300/40 bg-white px-3 py-1.5 dark:bg-slate-900"
                  style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
                >
                  <View className="flex-row items-center">
                    <Inbox size={13} color="#10b981" />
                    <Text className="ml-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">{unreadCount}</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View className="mt-10 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-8 dark:border-slate-700 dark:bg-slate-900">
            <Text className="text-center text-lg font-bold text-slate-900 dark:text-slate-50">No echoes yet</Text>
            <Text className="mt-2 text-center text-slate-700 dark:text-slate-200">
              Keep Radar on and move around to receive your first nearby message.
            </Text>
          </View>
        }
      />

      <Modal visible={Boolean(selectedMessage)} transparent animationType="fade" onRequestClose={closeReader}>
        <Pressable className="flex-1 items-center justify-center bg-black/80 px-6" onPress={closeReader}>
          <Pressable onPress={() => {}}>
            <Animated.View
              {...panResponder.panHandlers}
              className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-5"
              style={{
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { rotate: cardRotate },
                ],
              }}
            >
              <Animated.View
                className="absolute right-4 top-4 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1"
                style={{ opacity: sparkHintOpacity }}
                pointerEvents="none"
              >
                <Text className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Spark</Text>
              </Animated.View>

              <Animated.View
                className="absolute left-4 top-4 rounded-full border border-rose-300/40 bg-rose-400/15 px-3 py-1"
                style={{ opacity: reportHintOpacity }}
                pointerEvents="none"
              >
                <Text className="text-xs font-semibold uppercase tracking-wider text-rose-300">Report</Text>
              </Animated.View>

              <Animated.View
                className="absolute self-center rounded-full border border-blue-300/40 bg-blue-500/15 px-3 py-1"
                style={{
                  top: 10,
                  opacity: carryHintOpacity,
                }}
                pointerEvents="none"
              >
                <Text className="text-xs font-semibold uppercase tracking-wider text-blue-300">Carry</Text>
              </Animated.View>

              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold uppercase tracking-widest text-slate-400">Echo Reader</Text>
                <Text className="text-xs font-semibold text-slate-500">{selectedMessage?.senderId}</Text>
              </View>

              <Text className="mt-4 text-lg leading-8 text-slate-200">{selectedMessage?.content}</Text>

              <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Ripples {selectedMessage?.rippleCount ?? 0}
              </Text>

              {selectedMessage && sparkedEncounterIds.has(selectedMessage.encounterId) ? (
                <View className="mt-3 self-start rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Already Sparked</Text>
                </View>
              ) : null}

              <Text className="mt-6 text-xs text-slate-400">
                Swipe right to spark, left to report, up to carry. Tap outside to close.
              </Text>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
