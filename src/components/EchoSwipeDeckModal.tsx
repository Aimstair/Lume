import React from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Flag, Heart, Trash2 } from 'lucide-react-native';
import { Encounter } from '../types/domain';
import { presentAppModal } from '../services/appModal';

type EchoSwipeDeckModalProps = {
  visible: boolean;
  echoes: Encounter[];
  onClose: () => void;
  onPin: (encounterId: string) => Promise<void> | void;
  onReport: (encounterId: string) => Promise<unknown> | void;
  onDelete: (encounterId: string) => Promise<void> | void;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SWIPE_X_THRESHOLD = 110;
const SWIPE_UP_THRESHOLD = 95;
const EDGE_SNAP_TRIGGER = 0.9;

const MOCK_DECK_ECHOES: Encounter[] = [
  {
    id: 'mock-deck-1',
    observerProfileId: 'you',
    observedProfileId: 'LUME-ORBIT-14',
    observedMessageBody: 'If today felt heavy, this is your reminder that you still carried it.',
    observedMessageDate: new Date().toISOString().slice(0, 10),
    observedPinType: 'classic',
    observedRippleCount: 4,
    originalSenderId: null,
    observedAuraColor: null,
    observedVoiceSpark: null,
    observedRadianceScore: 312,
    happenedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    encounterLatitude: null,
    encounterLongitude: null,
    rssi: -58,
    pendingSync: false,
    seen: false,
    pinned: false,
    reportHits: 0,
    reported: false,
    deleted: false,
  },
  {
    id: 'mock-deck-2',
    observerProfileId: 'you',
    observedProfileId: 'LUME-MIST-09',
    observedMessageBody: 'You are allowed to begin again without explaining the reset.',
    observedMessageDate: new Date().toISOString().slice(0, 10),
    observedPinType: 'star',
    observedRippleCount: 2,
    originalSenderId: null,
    observedAuraColor: null,
    observedVoiceSpark: null,
    observedRadianceScore: 229,
    happenedAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    encounterLatitude: null,
    encounterLongitude: null,
    rssi: -66,
    pendingSync: false,
    seen: false,
    pinned: false,
    reportHits: 0,
    reported: false,
    deleted: false,
  },
  {
    id: 'mock-deck-3',
    observerProfileId: 'you',
    observedProfileId: 'LUME-SOL-31',
    observedMessageBody: 'Small acts of courage count. This one does too.',
    observedMessageDate: new Date().toISOString().slice(0, 10),
    observedPinType: 'crystal',
    observedRippleCount: 6,
    originalSenderId: null,
    observedAuraColor: null,
    observedVoiceSpark: null,
    observedRadianceScore: 401,
    happenedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    encounterLatitude: null,
    encounterLongitude: null,
    rssi: -61,
    pendingSync: false,
    seen: false,
    pinned: false,
    reportHits: 0,
    reported: false,
    deleted: false,
  },
];

type SwipeAction = 'pin' | 'report' | 'delete';

export function EchoSwipeDeckModal({
  visible,
  echoes,
  onClose,
  onPin,
  onReport,
  onDelete,
}: EchoSwipeDeckModalProps) {
  const cardPosition = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [deckEchoes, setDeckEchoes] = React.useState<Encounter[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [totalCount, setTotalCount] = React.useState(0);
  const [isActing, setIsActing] = React.useState(false);
  const edgeHapticsRef = React.useRef({ pin: false, delete: false, report: false });

  const resetEdgeHaptics = React.useCallback(() => {
    edgeHapticsRef.current = {
      pin: false,
      delete: false,
      report: false,
    };
  }, []);

  React.useEffect(() => {
    if (!visible) {
      cardPosition.setValue({ x: 0, y: 0 });
      setActiveIndex(0);
      setTotalCount(0);
      setDeckEchoes([]);
      setIsActing(false);
      resetEdgeHaptics();
      return;
    }

    setDeckEchoes((previous) => {
      if (previous.length > 0) {
        return previous;
      }

      const nextDeck = echoes.length > 0 ? echoes : MOCK_DECK_ECHOES;
      setTotalCount(nextDeck.length);
      return nextDeck;
    });
  }, [cardPosition, echoes, resetEdgeHaptics, visible]);

  const currentEcho = deckEchoes[0] ?? null;
  const nextEcho = deckEchoes[1] ?? null;

  const pinOpacity = cardPosition.x.interpolate({
    inputRange: [0, SWIPE_X_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const deleteOpacity = cardPosition.x.interpolate({
    inputRange: [-SWIPE_X_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const reportOpacity = cardPosition.y.interpolate({
    inputRange: [-SWIPE_UP_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const cardRotate = cardPosition.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  const performAction = React.useCallback(
    async (encounterId: string, action: SwipeAction) => {
      if (action === 'pin') {
        await onPin(encounterId);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
          // no-op
        });
        return;
      }

      if (action === 'report') {
        await onReport(encounterId);
        return;
      }

      await onDelete(encounterId);
    },
    [onDelete, onPin, onReport],
  );

  const maybeTriggerEdgeSnapHaptic = React.useCallback(
    (gesture: { dx: number; dy: number }) => {
      if (!currentEcho || isActing) {
        return;
      }

      const prefersHorizontal = Math.abs(gesture.dx) >= Math.abs(gesture.dy);
      if (prefersHorizontal) {
        const pinEdgeReached = gesture.dx >= SWIPE_X_THRESHOLD * EDGE_SNAP_TRIGGER;
        const deleteEdgeReached = gesture.dx <= -SWIPE_X_THRESHOLD * EDGE_SNAP_TRIGGER;

        if (pinEdgeReached && !edgeHapticsRef.current.pin) {
          edgeHapticsRef.current.pin = true;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
            // no-op
          });
        }

        if (deleteEdgeReached && !edgeHapticsRef.current.delete) {
          edgeHapticsRef.current.delete = true;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
            // no-op
          });
        }

        if (!pinEdgeReached) {
          edgeHapticsRef.current.pin = false;
        }
        if (!deleteEdgeReached) {
          edgeHapticsRef.current.delete = false;
        }
        edgeHapticsRef.current.report = false;
        return;
      }

      const reportEdgeReached = gesture.dy <= -SWIPE_UP_THRESHOLD * EDGE_SNAP_TRIGGER;
      if (reportEdgeReached && !edgeHapticsRef.current.report) {
        edgeHapticsRef.current.report = true;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
          // no-op
        });
      }

      if (!reportEdgeReached) {
        edgeHapticsRef.current.report = false;
      }

      edgeHapticsRef.current.pin = false;
      edgeHapticsRef.current.delete = false;
    },
    [currentEcho, isActing],
  );

  const animateCardOut = React.useCallback(
    (action: SwipeAction, toValue: { x: number; y: number }) => {
      if (!currentEcho || isActing) {
        return;
      }

      setIsActing(true);
      resetEdgeHaptics();

      Animated.timing(cardPosition, {
        toValue,
        duration: 230,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        void performAction(currentEcho.id, action)
          .then(() => {
            cardPosition.setValue({ x: 0, y: 0 });

            setDeckEchoes((previous) => {
              const next = previous.slice(1);
              if (next.length === 0) {
                onClose();
              }
              return next;
            });

            setActiveIndex((previous) => previous + 1);
          })
          .catch((error: unknown) => {
            cardPosition.setValue({ x: 0, y: 0 });
            presentAppModal({
              title: 'Action failed',
              message: error instanceof Error ? error.message : 'Please try again.',
            });
          })
          .finally(() => {
            setIsActing(false);
          });
      });
    },
    [cardPosition, currentEcho, isActing, onClose, performAction, resetEdgeHaptics],
  );

  const resetCardPosition = React.useCallback(() => {
    Animated.spring(cardPosition, {
      toValue: { x: 0, y: 0 },
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [cardPosition]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => visible && !isActing && Boolean(currentEcho),
        onPanResponderMove: (_, gesture) => {
          cardPosition.setValue({ x: gesture.dx, y: gesture.dy });
          maybeTriggerEdgeSnapHaptic(gesture);
        },
        onPanResponderRelease: (_, gesture) => {
          resetEdgeHaptics();

          if (gesture.dx > SWIPE_X_THRESHOLD) {
            animateCardOut('pin', { x: SCREEN_WIDTH * 1.15, y: gesture.dy });
            return;
          }

          if (gesture.dx < -SWIPE_X_THRESHOLD) {
            animateCardOut('delete', { x: -SCREEN_WIDTH * 1.15, y: gesture.dy });
            return;
          }

          if (gesture.dy < -SWIPE_UP_THRESHOLD) {
            animateCardOut('report', { x: gesture.dx, y: -SCREEN_HEIGHT * 0.95 });
            return;
          }

          resetCardPosition();
        },
        onPanResponderTerminate: () => {
          resetEdgeHaptics();
          if (!isActing) {
            resetCardPosition();
          }
        },
      }),
    [
      animateCardOut,
      cardPosition,
      currentEcho,
      isActing,
      maybeTriggerEdgeSnapHaptic,
      resetCardPosition,
      resetEdgeHaptics,
      visible,
    ],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-lume-bgDark/95 px-4 pt-12">
        <View className="mb-5 flex-row items-center justify-between">
          <Text className="text-2xl font-black text-white">Swipe Inbox</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              opacity: pressed ? 0.8 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
            className="rounded-xl border border-lume-borderDark bg-lume-surfaceDark px-4 py-2"
          >
            <Text className="font-semibold text-slate-300">Close</Text>
          </Pressable>
        </View>

        <Text className="text-slate-300">Right = Spark, Left = Delete, Up = Report</Text>

        <View className="mt-6 flex-1 items-center justify-center">
          {!currentEcho ? (
            <View className="w-full overflow-hidden rounded-3xl border border-lume-borderDark">
              <LinearGradient colors={['hsl(225, 8%, 12%)', 'hsl(225, 8%, 10%)']} className="p-7">
                <Text className="text-center text-2xl font-black text-white">Inbox cleared</Text>
                <Text className="mt-2 text-center text-slate-300">
                  You are all caught up. New echoes will appear here.
                </Text>
              </LinearGradient>
            </View>
          ) : (
            <View className="h-[68%] w-full items-center justify-center">
              {nextEcho ? (
                <View
                  className="absolute w-[94%] overflow-hidden rounded-3xl border border-lume-borderDark"
                  style={{ transform: [{ scale: 0.96 }, { translateY: 12 }] }}
                >
                  <LinearGradient colors={['hsla(225, 8%, 18%, 0.7)', 'hsla(225, 8%, 10%, 0.95)']} className="p-6">
                    <Text className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                      Next Echo
                    </Text>
                    <Text className="mt-4 text-base text-slate-100" numberOfLines={3}>
                      {nextEcho.observedMessageBody}
                    </Text>
                  </LinearGradient>
                </View>
              ) : null}

              <Animated.View
                {...panResponder.panHandlers}
                className="w-[96%] overflow-hidden rounded-3xl border border-lume-borderDark"
                style={{
                  transform: [
                    { translateX: cardPosition.x },
                    { translateY: cardPosition.y },
                    { rotate: cardRotate },
                  ],
                }}
              >
                <LinearGradient colors={['hsl(225, 8%, 14%)', 'hsl(225, 8%, 11%)', 'hsl(225, 8%, 9%)']} className="p-6">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs uppercase tracking-widest text-emerald-200">
                      Echo {Math.min(activeIndex + 1, Math.max(totalCount, 1))} / {Math.max(totalCount, 1)}
                    </Text>
                    <Text className="text-xs text-slate-300">{new Date(currentEcho.happenedAt).toLocaleString()}</Text>
                  </View>

                  <Text className="mt-5 text-2xl font-bold leading-9 text-white">
                    {currentEcho.observedMessageBody?.trim().length
                      ? currentEcho.observedMessageBody
                      : 'A nearby user shared their daily signal.'}
                  </Text>

                  {currentEcho.originalSenderId ? (
                    <View className="mt-3 self-start rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-1">
                      <Text className="text-[10px] font-semibold uppercase tracking-wider text-cyan-100">
                        Genesis {currentEcho.originalSenderId.slice(0, 10)}
                      </Text>
                    </View>
                  ) : null}

                  <View className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2">
                    <Text className="text-xs text-emerald-100">
                      Radiance {currentEcho.observedRadianceScore} • Date {currentEcho.observedMessageDate}
                    </Text>
                  </View>
                </LinearGradient>
              </Animated.View>

              <Animated.View
                pointerEvents="none"
                className="absolute left-8 top-8 rounded-full border border-emerald-300/70 bg-emerald-300/20 px-3 py-1"
                style={{ opacity: pinOpacity }}
              >
                <Text className="font-bold text-emerald-100">SPARK</Text>
              </Animated.View>

              <Animated.View
                pointerEvents="none"
                className="absolute right-8 top-8 rounded-full border border-rose-300/70 bg-rose-300/20 px-3 py-1"
                style={{ opacity: deleteOpacity }}
              >
                <Text className="font-bold text-rose-100">DELETE</Text>
              </Animated.View>

              <Animated.View
                pointerEvents="none"
                className="absolute top-2 rounded-full border border-amber-300/70 bg-amber-300/20 px-3 py-1"
                style={{ opacity: reportOpacity }}
              >
                <Text className="font-bold text-amber-100">REPORT</Text>
              </Animated.View>
            </View>
          )}
        </View>

        {currentEcho ? (
          <View className="mb-6 mt-2 flex-row justify-between">
            <Pressable
              onPress={() => animateCardOut('delete', { x: -SCREEN_WIDTH * 1.15, y: 16 })}
              disabled={isActing}
              className="mr-2 flex-1 flex-row items-center justify-center rounded-2xl border border-rose-300/40 bg-rose-300/10 py-3"
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <Trash2 size={14} color="#fda4af" />
              <Text className="ml-2 font-semibold text-rose-200">Delete</Text>
            </Pressable>

            <Pressable
              onPress={() => animateCardOut('report', { x: 0, y: -SCREEN_HEIGHT * 0.95 })}
              disabled={isActing}
              className="mx-2 flex-1 flex-row items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/10 py-3"
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <Flag size={14} color="#fcd34d" />
              <Text className="ml-2 font-semibold text-amber-200">Report</Text>
            </Pressable>

            <Pressable
              onPress={() => animateCardOut('pin', { x: SCREEN_WIDTH * 1.15, y: 16 })}
              disabled={isActing}
              className="ml-2 flex-1 flex-row items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-300/10 py-3"
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <Heart size={14} color="#a7f3d0" />
              <Text className="ml-2 font-semibold text-emerald-100">Spark</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mb-6" />
        )}
      </View>
    </Modal>
  );
}
