import React from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { Heart, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

type MessageCardProps = {
  id: string;
  message: string;
  happenedAt: string;
  radianceScore: number;
  pendingSync?: boolean;
  sparkCount: number;
  isSparked: boolean;
  isSparkPending?: boolean;
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
  isSparkPending,
  onSparkPress,
}: MessageCardProps) {
  const mountProgress = React.useRef(new Animated.Value(0)).current;
  const sparkPulse = React.useRef(new Animated.Value(1)).current;
  const sparkLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    Animated.timing(mountProgress, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mountProgress]);

  React.useEffect(() => {
    sparkLoopRef.current?.stop();

    if (isSparked) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(sparkPulse, {
            toValue: 1.06,
            duration: 480,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(sparkPulse, {
            toValue: 1,
            duration: 480,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

      sparkLoopRef.current = loop;
      loop.start();

      return () => {
        loop.stop();
      };
    }

    Animated.timing(sparkPulse, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    return () => {
      sparkLoopRef.current?.stop();
    };
  }, [isSparked, sparkPulse]);

  const cardAnimatedStyle = {
    opacity: mountProgress,
    transform: [
      {
        translateY: mountProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View style={cardAnimatedStyle} className="mb-3 overflow-hidden rounded-3xl border border-emerald-300/20">
      <LinearGradient
        colors={
          isSparked
            ? ['rgba(16,185,129,0.26)', 'rgba(15,23,42,0.96)', 'rgba(2,6,23,0.98)']
            : ['rgba(30,41,59,0.94)', 'rgba(15,23,42,0.98)', 'rgba(2,6,23,0.98)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="p-4"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="h-3 w-3 rounded-full bg-emerald-300" />
            <Text className="ml-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Radiance {radianceScore}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Sparkles size={13} color={isSparked ? '#6ee7b7' : '#94a3b8'} />
            {pendingSync ? (
              <View className="ml-2 rounded-full bg-emerald-400/15 px-2 py-1">
                <Text className="text-xs font-semibold text-emerald-200">Pending Sync</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text className="mt-3 text-base leading-6 text-white">{message}</Text>

        <View className="mt-4 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Sparkles size={14} color="#a7f3d0" />
            <Text className="ml-1 text-xs text-slate-300">{toRelativeTime(happenedAt)}</Text>
          </View>

          <Animated.View style={{ transform: [{ scale: sparkPulse }] }}>
            <Pressable
              onPress={() => onSparkPress(id)}
              disabled={Boolean(isSparkPending)}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              className={
                isSparked
                  ? 'overflow-hidden rounded-full border border-emerald-300/70'
                  : 'overflow-hidden rounded-full border border-slate-700'
              }
            >
              <LinearGradient
                colors={
                  isSparked ? ['rgba(110,231,183,0.35)', 'rgba(16,185,129,0.18)'] : ['rgba(51,65,85,0.9)', 'rgba(30,41,59,0.95)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="flex-row items-center px-3 py-1.5"
              >
                <Heart
                  size={14}
                  color={isSparked ? '#6ee7b7' : '#cbd5e1'}
                  fill={isSparked ? '#6ee7b7' : 'transparent'}
                />
                <Text className={isSparked ? 'ml-1 text-xs font-semibold text-emerald-200' : 'ml-1 text-xs text-slate-200'}>
                  {isSparkPending ? 'Sparking...' : `Spark ${sparkCount > 0 ? `(${sparkCount})` : ''}`}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
