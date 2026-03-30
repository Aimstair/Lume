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
import { LinearGradient } from 'expo-linear-gradient';
import { Flag, Heart, Trash2 } from 'lucide-react-native';
import { Encounter } from '../types/domain';

type EchoSwipeDeckModalProps = {
  visible: boolean;
  echoes: Encounter[];
  onClose: () => void;
  onPin: (encounterId: string) => Promise<void> | void;
  onReport: (encounterId: string) => Promise<void> | void;
  onDelete: (encounterId: string) => Promise<void> | void;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SWIPE_X_THRESHOLD = 110;
const SWIPE_UP_THRESHOLD = 95;

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
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isActing, setIsActing] = React.useState(false);

  React.useEffect(() => {
    if (!visible) {
      cardPosition.setValue({ x: 0, y: 0 });
      setActiveIndex(0);
      setIsActing(false);
    }
  }, [cardPosition, visible]);

  const currentEcho = echoes[activeIndex] ?? null;
  const nextEcho = echoes[activeIndex + 1] ?? null;

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

  const animateCardOut = React.useCallback(
    (action: SwipeAction, toValue: { x: number; y: number }) => {
      if (!currentEcho || isActing) {
        return;
      }

      setIsActing(true);

      Animated.timing(cardPosition, {
        toValue,
        duration: 230,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        void performAction(currentEcho.id, action)
          .finally(() => {
            cardPosition.setValue({ x: 0, y: 0 });
            setActiveIndex((previous) => {
              const next = previous + 1;
              if (next >= echoes.length) {
                onClose();
                return 0;
              }
              return next;
            });
          })
          .finally(() => {
            setIsActing(false);
          });
      });
    },
    [cardPosition, currentEcho, echoes.length, isActing, onClose, performAction],
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
        },
        onPanResponderRelease: (_, gesture) => {
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
      }),
    [animateCardOut, cardPosition, currentEcho, isActing, resetCardPosition, visible],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-950/95 px-4 pt-12">
        <View className="mb-5 flex-row items-center justify-between">
          <Text className="text-2xl font-black text-white">Swipe Inbox</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}
            className="rounded-xl border border-slate-600 px-4 py-2"
          >
            <Text className="font-semibold text-slate-300">Close</Text>
          </Pressable>
        </View>

        <Text className="text-slate-300">Right = Pin, Left = Delete, Up = Report</Text>

        <View className="mt-6 flex-1 items-center justify-center">
          {!currentEcho ? (
            <View className="w-full overflow-hidden rounded-3xl border border-emerald-300/30">
              <LinearGradient colors={['#0b3a3d', '#0f172a']} className="p-7">
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
                  className="absolute w-[94%] overflow-hidden rounded-3xl border border-slate-700"
                  style={{ transform: [{ scale: 0.96 }, { translateY: 12 }] }}
                >
                  <LinearGradient colors={['rgba(71,85,105,0.35)', 'rgba(15,23,42,0.92)']} className="p-6">
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
                className="w-[96%] overflow-hidden rounded-3xl border border-emerald-300/35"
                style={{
                  transform: [
                    { translateX: cardPosition.x },
                    { translateY: cardPosition.y },
                    { rotate: cardRotate },
                  ],
                }}
              >
                <LinearGradient colors={['#114f54', '#0f172a', '#020617']} className="p-6">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs uppercase tracking-widest text-emerald-200">
                      Echo {activeIndex + 1} / {echoes.length}
                    </Text>
                    <Text className="text-xs text-slate-300">{new Date(currentEcho.happenedAt).toLocaleString()}</Text>
                  </View>

                  <Text className="mt-5 text-2xl font-bold leading-9 text-white">
                    {currentEcho.observedMessageBody?.trim().length
                      ? currentEcho.observedMessageBody
                      : 'A nearby user shared their daily signal.'}
                  </Text>

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
                <Text className="font-bold text-emerald-100">PIN</Text>
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
              style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}
            >
              <Trash2 size={14} color="#fda4af" />
              <Text className="ml-2 font-semibold text-rose-200">Delete</Text>
            </Pressable>

            <Pressable
              onPress={() => animateCardOut('report', { x: 0, y: -SCREEN_HEIGHT * 0.95 })}
              disabled={isActing}
              className="mx-2 flex-1 flex-row items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/10 py-3"
              style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}
            >
              <Flag size={14} color="#fcd34d" />
              <Text className="ml-2 font-semibold text-amber-200">Report</Text>
            </Pressable>

            <Pressable
              onPress={() => animateCardOut('pin', { x: SCREEN_WIDTH * 1.15, y: 16 })}
              disabled={isActing}
              className="ml-2 flex-1 flex-row items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-300/10 py-3"
              style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}
            >
              <Heart size={14} color="#a7f3d0" />
              <Text className="ml-2 font-semibold text-emerald-100">Pin</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mb-6" />
        )}
      </View>
    </Modal>
  );
}
