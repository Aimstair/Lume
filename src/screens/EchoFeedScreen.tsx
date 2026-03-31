import React from 'react';
import * as Haptics from 'expo-haptics';
import {
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
import { useTodayMessage } from '../hooks/useTodayMessage';
import { MessagePinType } from '../types/domain';
import { presentAppModal } from '../services/appModal';

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
  auraColor: string | null;
  voiceSpark: string | null;
  isMock?: boolean;
};

type EchoSection = {
  key: string;
  title: string;
  data: EchoCard[];
};

type SwipeAction = 'spark' | 'report' | 'carry';

type ActionFeedbackTone = 'success' | 'error';

const MOCK_ECHO_CARDS: EchoCard[] = [
  {
    id: 'mock-echo-card-1',
    encounterId: 'mock-echo-card-1',
    content: 'The sky looked unreal tonight. Sharing this calm with whoever catches it next.',
    senderId: 'LUME-MOCK-1A',
    happenedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    messageDate: new Date().toISOString().slice(0, 10),
    pinType: 'star',
    rippleCount: 3,
    originalSenderId: 'GENESIS-A1C3',
    auraColor: null,
    voiceSpark: null,
    isMock: true,
  },
  {
    id: 'mock-echo-card-2',
    encounterId: 'mock-echo-card-2',
    content: 'If your chest is tight, unclench your jaw and take one deeper breath right now.',
    senderId: 'LUME-MOCK-7K',
    happenedAt: new Date(Date.now() - 44 * 60 * 1000).toISOString(),
    messageDate: new Date().toISOString().slice(0, 10),
    pinType: 'classic',
    rippleCount: 6,
    originalSenderId: 'GENESIS-B9M1',
    auraColor: null,
    voiceSpark: null,
    isMock: true,
  },
  {
    id: 'mock-echo-card-3',
    encounterId: 'mock-echo-card-3',
    content: 'You are not late. You are arriving with the version of you that survived.',
    senderId: 'LUME-MOCK-4Q',
    happenedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    messageDate: new Date().toISOString().slice(0, 10),
    pinType: 'crystal',
    rippleCount: 8,
    originalSenderId: 'GENESIS-R2X8',
    auraColor: null,
    voiceSpark: null,
    isMock: true,
  },
];

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
  const todayMessage = useTodayMessage();

  const [selectedMessage, setSelectedMessage] = React.useState<EchoCard | null>(null);
  const [sparkedEncounterIds, setSparkedEncounterIds] = React.useState<Set<string>>(new Set());
  const [isCardActionBusy, setIsCardActionBusy] = React.useState(false);
  const [actionFeedback, setActionFeedback] = React.useState<{
    message: string;
    tone: ActionFeedbackTone;
  } | null>(null);

  const pan = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const feedbackOpacity = React.useRef(new Animated.Value(0)).current;
  const feedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSavedMessageToday = Boolean(todayMessage.data);

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
    const mapped = (encounters.data ?? []).map((encounter) => ({
      id: encounter.id,
      encounterId: encounter.id,
      content: encounter.observedMessageBody,
      senderId: encounter.observedProfileId,
      happenedAt: encounter.happenedAt,
      messageDate: encounter.observedMessageDate,
      pinType: encounter.observedPinType,
      rippleCount: encounter.observedRippleCount,
      originalSenderId: encounter.originalSenderId,
      auraColor: encounter.observedAuraColor,
      voiceSpark: encounter.observedVoiceSpark,
      isMock: false,
    }));

    if (mapped.length === 0) {
      return MOCK_ECHO_CARDS;
    }

    return mapped;
  }, [encounters.data]);

  const nearbyParticipants = React.useMemo(() => {
    const cutoffMs = Date.now() - 20 * 60 * 1000;
    const participants = new Set<string>();

    for (const card of cards) {
      const happenedAtMs = new Date(card.happenedAt).getTime();
      if (!Number.isFinite(happenedAtMs) || happenedAtMs < cutoffMs) {
        continue;
      }

      participants.add(card.senderId);
    }

    return Array.from(participants);
  }, [cards]);

  const groupEchoUnlocked = nearbyParticipants.length >= 3;
  const groupEchoThreadPreview = React.useMemo(
    () => cards.slice(0, 3).map((card) => ({ id: card.id, senderId: card.senderId, snippet: card.content })),
    [cards],
  );

  const auraSyncPercent = React.useMemo(() => {
    if (!selectedMessage) {
      return 0;
    }

    const repeatSignals = cards.filter((card) => card.senderId === selectedMessage.senderId).length;
    const repeatScore = Math.min(28, Math.max(0, repeatSignals - 1) * 8);
    const rippleScore = Math.min(22, Math.max(0, selectedMessage.rippleCount) * 2);
    const genesisScore = selectedMessage.originalSenderId ? 8 : 0;

    return Math.max(35, Math.min(98, 42 + repeatScore + rippleScore + genesisScore));
  }, [cards, selectedMessage]);

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

  const showActionFeedback = React.useCallback(
    (message: string, tone: ActionFeedbackTone = 'success') => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }

      setActionFeedback({ message, tone });
      feedbackOpacity.stopAnimation();
      feedbackOpacity.setValue(0);

      Animated.timing(feedbackOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();

      feedbackTimerRef.current = setTimeout(() => {
        Animated.timing(feedbackOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => {
          setActionFeedback(null);
        });
      }, 1800);
    },
    [feedbackOpacity],
  );

  React.useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const performSwipeAction = React.useCallback(
    async (action: SwipeAction) => {
      if (!selectedMessage || isCardActionBusy) {
        return;
      }

      if (action === 'carry' && hasSavedMessageToday) {
        resetCardPosition();
        showActionFeedback('Carry blocked: message already saved today.', 'error');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {
          // no-op
        });
        presentAppModal({
          title: 'Carry unavailable',
          message: 'You already saved a daily message today, so this echo cannot be carried yet.',
        });
        return;
      }

      setIsCardActionBusy(true);

      try {
        if (selectedMessage.isMock) {
          if (action === 'spark') {
            await animateCardOut({ x: width * 0.95, y: 0 });
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
              // no-op
            });
            showActionFeedback('Spark sent.');
            setSelectedMessage(null);
            return;
          }

          if (action === 'report') {
            await animateCardOut({ x: -width * 0.95, y: 0 });
            showActionFeedback('Report submitted.');
            setSelectedMessage(null);
            return;
          }

          await animateCardOut({ x: 0, y: -height * 0.7 });
          showActionFeedback('Echo carried.');
          setSelectedMessage(null);
          return;
        }

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

            showActionFeedback('Spark sent.');
          } else {
            showActionFeedback('Already sparked.');
          }

          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
            // no-op
          });

          setSelectedMessage(null);
          return;
        }

        if (action === 'report') {
          await animateCardOut({ x: -width * 0.95, y: 0 });
          const reportResult = await reportEcho(selectedMessage.encounterId);
          if (reportResult.isReported) {
            showActionFeedback('Report submitted.');
          } else {
            showActionFeedback(`Report noted (${reportResult.reportHits}/${reportResult.requiredHits}).`);
          }
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
          sourceAuraColor: selectedMessage.auraColor,
          sourceVoiceSpark: selectedMessage.voiceSpark,
        });
        showActionFeedback('Echo carried.');
        setSelectedMessage(null);
      } catch (error: any) {
        resetCardPosition();

        if (error?.message === 'Daily message already saved') {
          showActionFeedback('Carry blocked: message already saved today.', 'error');
          presentAppModal({
            title: 'Carry unavailable',
            message: 'You already saved a daily message today, so this echo cannot be carried yet.',
          });
          return;
        }

        presentAppModal({
          title: 'Action failed',
          message: error?.message || 'Please try again.',
        });
      } finally {
        setIsCardActionBusy(false);
      }
    },
    [
      animateCardOut,
      hasSavedMessageToday,
      heartReaction,
      height,
      isCardActionBusy,
      reportEcho,
      resetCardPosition,
      rippleMessage,
      selectedMessage,
      showActionFeedback,
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
    <View className="flex-1 bg-lume-bgLight dark:bg-lume-bgDark">
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
          const isStarPin = item.pinType === 'star';
          const isCrystalPin = item.pinType === 'crystal';

          return (
            <Pressable
              onPress={() => setSelectedMessage(item)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
              className={
                isStarPin
                  ? 'mb-3 rounded-3xl border border-amber-300/50 bg-amber-50/55 p-4 shadow-sm dark:border-amber-300/30 dark:bg-amber-500/10 dark:shadow-none'
                  : isCrystalPin
                    ? 'mb-3 rounded-3xl border border-cyan-300/55 bg-cyan-50/60 p-4 shadow-sm dark:border-cyan-300/30 dark:bg-cyan-500/10 dark:shadow-none'
                    : 'mb-3 rounded-3xl border border-lume-borderLight bg-lume-surfaceLight p-4 shadow-sm dark:border-lume-borderDark dark:bg-lume-surfaceDark dark:shadow-none'
              }
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Text className="text-xs font-semibold uppercase tracking-widest text-emerald-500 dark:text-emerald-300">
                    {item.pinType} pin
                  </Text>

                  {isStarPin ? (
                    <View className="ml-2 rounded-full border border-amber-300/45 bg-amber-300/15 px-2 py-0.5">
                      <Text className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-200">
                        Sparkle
                      </Text>
                    </View>
                  ) : null}

                  {isCrystalPin ? (
                    <View className="ml-2 rounded-full border border-cyan-300/45 bg-cyan-300/15 px-2 py-0.5">
                      <Text className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-200">
                        Shield 2x
                      </Text>
                    </View>
                  ) : null}

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

              {item.originalSenderId ? (
                <View className="mt-2 self-start rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                    Genesis {item.originalSenderId.slice(0, 10)}
                  </Text>
                </View>
              ) : null}

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

                <View className="mt-2 self-start rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                    Genesis credit stays attached through every carry
                  </Text>
                </View>
              </View>

              {unreadCount > 0 ? (
                <Pressable
                  onPress={onOpenInbox}
                  className="rounded-full border border-lume-borderLight bg-lume-surfaceLight px-3 py-1.5 dark:border-lume-borderDark dark:bg-lume-surfaceDark"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  })}
                >
                  <View className="flex-row items-center">
                    <Inbox size={13} color="#10b981" />
                    <Text className="ml-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">{unreadCount}</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>

            <View className="mt-4 rounded-2xl border border-lume-borderLight bg-lume-surfaceLight px-4 py-3 dark:border-lume-borderDark dark:bg-lume-surfaceDark">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">Group Echo</Text>
                <Text className={groupEchoUnlocked ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-300' : 'text-xs font-semibold text-amber-700 dark:text-amber-300'}>
                  {groupEchoUnlocked ? 'Unlocked' : `${nearbyParticipants.length}/3 nearby`}
                </Text>
              </View>

              <Text className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Group Echo unlocks when three or more nearby users are active in this area.
              </Text>

              {groupEchoUnlocked ? (
                <View className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2">
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Live thread preview
                  </Text>

                  {groupEchoThreadPreview.map((entry) => (
                    <Text key={entry.id} className="mt-1 text-xs text-slate-700 dark:text-slate-200" numberOfLines={1}>
                      {entry.senderId}: {entry.snippet}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View className="mt-10 rounded-3xl border border-lume-borderLight bg-lume-surfaceLight px-6 py-8 dark:border-lume-borderDark dark:bg-lume-surfaceDark">
            <Text className="text-center text-lg font-bold text-slate-900 dark:text-slate-50">No echoes yet</Text>
            <Text className="mt-2 text-center text-slate-700 dark:text-slate-200">
              Keep Radar on and move around to receive your first nearby message.
            </Text>
          </View>
        }
      />

      {actionFeedback ? (
        <Animated.View
          pointerEvents="none"
          className={
            actionFeedback.tone === 'success'
              ? 'absolute left-6 right-6 top-8 rounded-2xl border border-emerald-300/40 bg-emerald-400/15 px-4 py-3'
              : 'absolute left-6 right-6 top-8 rounded-2xl border border-rose-300/40 bg-rose-400/15 px-4 py-3'
          }
          style={{
            opacity: feedbackOpacity,
            transform: [
              {
                translateY: feedbackOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-12, 0],
                }),
              },
            ],
          }}
        >
          <Text
            className={
              actionFeedback.tone === 'success'
                ? 'text-center text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-200'
                : 'text-center text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-200'
            }
          >
            {actionFeedback.message}
          </Text>
        </Animated.View>
      ) : null}

      <Modal visible={Boolean(selectedMessage)} transparent animationType="fade" onRequestClose={closeReader}>
        <Pressable
          className="flex-1 items-center justify-center bg-lume-bgDark/80 px-6"
          onPress={closeReader}
          style={({ pressed }) => ({
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Animated.View
            {...panResponder.panHandlers}
            onStartShouldSetResponder={() => true}
            className="w-full max-w-md rounded-3xl border border-lume-borderLight bg-lume-surfaceLight p-5 dark:border-lume-borderDark dark:bg-lume-surfaceDark"
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
                <Text className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Spark</Text>
              </Animated.View>

              <Animated.View
                className="absolute left-4 top-4 rounded-full border border-rose-300/40 bg-rose-400/15 px-3 py-1"
                style={{ opacity: reportHintOpacity }}
                pointerEvents="none"
              >
                <Text className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">Report</Text>
              </Animated.View>

              <Animated.View
                className="absolute self-center rounded-full border border-blue-300/40 bg-blue-500/15 px-3 py-1"
                style={{
                  top: 10,
                  opacity: carryHintOpacity,
                }}
                pointerEvents="none"
              >
                <Text className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Carry</Text>
              </Animated.View>

              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-300">Echo Reader</Text>
                <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">{selectedMessage?.senderId}</Text>
              </View>

              <View className="mt-2 self-start rounded-full border border-indigo-300/40 bg-indigo-400/10 px-2 py-0.5">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  Aura Sync {auraSyncPercent}%
                </Text>
              </View>

              {selectedMessage?.pinType === 'star' ? (
                <View className="mt-2 self-start rounded-full border border-amber-300/45 bg-amber-400/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-200">
                    Star sparkle signature
                  </Text>
                </View>
              ) : null}

              {selectedMessage?.pinType === 'crystal' ? (
                <View className="mt-2 self-start rounded-full border border-cyan-300/45 bg-cyan-400/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-200">
                    Crystal shield resists first report
                  </Text>
                </View>
              ) : null}

              {selectedMessage?.originalSenderId ? (
                <View className="mt-2 self-start rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                    Genesis {selectedMessage.originalSenderId.slice(0, 10)}
                  </Text>
                </View>
              ) : null}

              {selectedMessage?.auraColor ? (
                <View className="mt-2 self-start rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Aura {selectedMessage.auraColor}
                  </Text>
                </View>
              ) : null}

              {selectedMessage?.voiceSpark ? (
                <View className="mt-2 self-start rounded-full border border-sky-300/40 bg-sky-400/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                    Voice {selectedMessage.voiceSpark}
                  </Text>
                </View>
              ) : null}

              <Text className="mt-4 text-lg leading-8 text-slate-900 dark:text-slate-100">{selectedMessage?.content}</Text>

              <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Ripples {selectedMessage?.rippleCount ?? 0}
              </Text>

              {selectedMessage && sparkedEncounterIds.has(selectedMessage.encounterId) ? (
                <View className="mt-3 self-start rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Already Sparked</Text>
                </View>
              ) : null}

              <Text className="mt-6 text-xs text-slate-600 dark:text-slate-400">
                Swipe right to spark, left to report, up to carry. Tap outside to close.
              </Text>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}
