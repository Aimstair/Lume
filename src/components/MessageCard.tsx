import React from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { Heart, Sparkles } from 'lucide-react-native';

interface MessageCardProps {
  id: string;
  message: string;
  happenedAt: string;
  radianceScore: number;
  pendingSync?: boolean;
  sparkCount: number;
  isSparked: boolean;
  isSparkPending?: boolean;
  onSparkPress: (id: string) => void;
}

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
    <Animated.View style={cardAnimatedStyle} className="mb-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <Text className="ml-2 text-sm font-medium tracking-wide uppercase text-slate-500 dark:text-slate-300">
            Glow Score {radianceScore}
          </Text>
        </View>

        {pendingSync ? (
          <View className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5">
            <Text className="text-sm font-medium tracking-wide uppercase text-emerald-300">Pending</Text>
          </View>
        ) : null}
      </View>

      <Text className="mt-4 text-lg font-medium leading-relaxed text-slate-700 dark:text-slate-200">{message}</Text>

      <View className="mt-5 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Sparkles size={14} color="#94a3b8" />
          <Text className="ml-2 text-sm font-medium tracking-wide uppercase text-slate-500 dark:text-slate-300">
            {toRelativeTime(happenedAt)}
          </Text>
        </View>

        <Animated.View style={{ transform: [{ scale: sparkPulse }] }}>
          <Pressable
            onPress={() => onSparkPress(id)}
            disabled={Boolean(isSparkPending)}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.82 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
            className={
              isSparked
                ? 'min-h-12 min-w-12 flex-row items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-400/15 px-4 py-3'
                : 'min-h-12 min-w-12 flex-row items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-700 dark:bg-slate-800'
            }
          >
            <Heart
              size={16}
              color={isSparked ? '#34d399' : '#cbd5e1'}
              fill={isSparked ? '#34d399' : 'transparent'}
            />
            <Text className={isSparked ? 'ml-2 text-sm font-medium tracking-wide uppercase text-emerald-500 dark:text-emerald-300' : 'ml-2 text-sm font-medium tracking-wide uppercase text-slate-700 dark:text-slate-200'}>
              {isSparkPending ? 'Sparking...' : `Spark ${sparkCount > 0 ? `(${sparkCount})` : ''}`}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
