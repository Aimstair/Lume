import React from 'react';
import { Animated, Easing, Text, View } from 'react-native';

type AuraVisualizerProps = {
  isActive: boolean;
  size?: number;
};

export function AuraVisualizer({ isActive, size = 224 }: AuraVisualizerProps) {
  const outerPulse = React.useRef(new Animated.Value(1)).current;
  const innerPulse = React.useRef(new Animated.Value(1)).current;
  const outerLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const innerLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    outerLoopRef.current?.stop();
    innerLoopRef.current?.stop();

    if (isActive) {
      const outerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(outerPulse, {
            toValue: 1.08,
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(outerPulse, {
            toValue: 1,
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

      const innerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(innerPulse, {
            toValue: 1.05,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(innerPulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

      outerLoopRef.current = outerLoop;
      innerLoopRef.current = innerLoop;
      outerLoop.start();
      innerLoop.start();

      return () => {
        outerLoop.stop();
        innerLoop.stop();
      };
    }

    Animated.parallel([
      Animated.timing(outerPulse, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(innerPulse, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      outerLoopRef.current?.stop();
      innerLoopRef.current?.stop();
    };
  }, [innerPulse, isActive, outerPulse]);

  const outerStyle = {
    transform: [{ scale: outerPulse }],
    opacity: isActive ? 0.9 : 0.6,
  };

  const innerStyle = {
    transform: [{ scale: innerPulse }],
    opacity: isActive ? 1 : 0.85,
  };

  return (
    <View className="items-center">
      <View className="items-center justify-center" style={{ width: size, height: size }}>
        <Animated.View
          className="absolute rounded-full border border-emerald-400/45 bg-emerald-400/10"
          style={[{ width: size, height: size }, outerStyle]}
        />
        <Animated.View
          className="absolute rounded-full border border-emerald-400/50 bg-emerald-400/15"
          style={[{ width: Math.round(size * 0.72), height: Math.round(size * 0.72) }, innerStyle]}
        />
        <View
          className="absolute items-center justify-center rounded-full bg-emerald-400"
          style={{ width: Math.round(size * 0.38), height: Math.round(size * 0.38) }}
        >
          <Text className="text-xs font-bold uppercase tracking-wider text-slate-950">
            {isActive ? 'Live' : 'Idle'}
          </Text>
        </View>
      </View>
    </View>
  );
}
