import React from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type RadianceProgressBarProps = {
  score: number;
  goal?: number;
};

export function RadianceProgressBar({ score, goal = 1000 }: RadianceProgressBarProps) {
  const safeGoal = Math.max(1, goal);
  const percentage = Math.max(0, Math.min(100, Math.round((score / safeGoal) * 100)));
  const animatedProgress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: percentage,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedProgress, percentage]);

  const width = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <View className="flex-row items-end justify-between">
          <Text className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-300">Glow Score</Text>
          <Text className="text-xs text-slate-600 dark:text-slate-300">{percentage}% of level goal</Text>
        </View>

        <Text className="mt-2 text-5xl font-black text-emerald-300">{score}</Text>

        <View className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800/80">
          <Animated.View className="h-3 overflow-hidden rounded-full" style={{ width }}>
            <LinearGradient
              colors={['#6ee7b7', '#34d399', '#10b981']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
            <View className="absolute bottom-0 left-0 right-0 top-0 rounded-full bg-emerald-100/15" />
          </Animated.View>
        </View>

        <Text className="mt-3 text-xs text-slate-700 dark:text-slate-200">Keep sharing daily messages and collecting sparks to level up.</Text>
    </View>
  );
}
