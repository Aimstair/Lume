import React from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BellRing, Sparkles } from 'lucide-react-native';

type EchoInboxPromptProps = {
  visible: boolean;
  unseenCount: number;
  onOpenInbox: () => void;
  onDismiss: () => void;
};

export function EchoInboxPrompt({ visible, unseenCount, onOpenInbox, onDismiss }: EchoInboxPromptProps) {
  const scale = React.useRef(new Animated.Value(0.9)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.03,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();

    return () => {
      pulse.stop();
      scale.setValue(1);
      opacity.setValue(0);
    };
  }, [opacity, scale, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 items-center justify-center bg-slate-950/90 px-6">
        <Animated.View
          style={{ opacity, transform: [{ scale }] }}
          className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-300/30"
        >
          <LinearGradient colors={['#0b3a3d', '#0f172a', '#020617']} className="p-6">
            <View className="items-center">
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-emerald-300/20">
                <BellRing size={30} color="#6ee7b7" />
              </View>

              <Text className="mt-5 text-center text-3xl font-black text-white">New Echoes</Text>
              <Text className="mt-2 text-center text-slate-200">
                You have {unseenCount} unread {unseenCount === 1 ? 'message' : 'messages'} waiting.
              </Text>

              <View className="mt-3 flex-row items-center rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1">
                <Sparkles size={13} color="#a7f3d0" />
                <Text className="ml-1 text-xs font-semibold uppercase tracking-wider text-emerald-100">
                  Swipe inbox ready
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onOpenInbox}
              className="mt-6 overflow-hidden rounded-2xl"
              style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}
            >
              <LinearGradient colors={['#6ee7b7', '#34d399', '#10b981']} className="py-3">
                <Text className="text-center text-base font-bold text-slate-950">Open Swipe Inbox</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={onDismiss}
              className="mt-3 rounded-2xl border border-slate-600 py-3"
              style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
            >
              <Text className="text-center font-semibold text-slate-300">Not now</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}
