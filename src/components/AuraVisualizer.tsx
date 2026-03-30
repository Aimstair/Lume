import React from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type AuraVisualizerProps = {
  isActive: boolean;
  size?: number;
  onPress?: () => void;
  disabled?: boolean;
  isBusy?: boolean;
};

export function AuraVisualizer({
  isActive,
  size = 224,
  onPress,
  disabled,
  isBusy,
}: AuraVisualizerProps) {
  const outerPulse = React.useRef(new Animated.Value(1)).current;
  const innerPulse = React.useRef(new Animated.Value(1)).current;
  const sweepRotation = React.useRef(new Animated.Value(0)).current;
  const sparkleValues = React.useRef([
    new Animated.Value(0.45),
    new Animated.Value(0.5),
    new Animated.Value(0.55),
    new Animated.Value(0.5),
  ]).current;
  const outerLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const innerLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const sweepLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const sparkleLoopsRef = React.useRef<Animated.CompositeAnimation[]>([]);

  const outerSize = size;
  const innerSize = Math.round(size * 0.72);
  const coreSize = Math.round(size * 0.42);

  const sweepRotate = sweepRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const sparklePositions = React.useMemo(
    () => [
      { left: Math.round(size * 0.14), top: Math.round(size * 0.13), scale: 0.9 },
      { left: Math.round(size * 0.76), top: Math.round(size * 0.24), scale: 1 },
      { left: Math.round(size * 0.72), top: Math.round(size * 0.72), scale: 1.15 },
      { left: Math.round(size * 0.2), top: Math.round(size * 0.78), scale: 0.85 },
    ],
    [size],
  );

  React.useEffect(() => {
    outerLoopRef.current?.stop();
    innerLoopRef.current?.stop();
    sweepLoopRef.current?.stop();

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

      const sweepLoop = Animated.loop(
        Animated.timing(sweepRotation, {
          toValue: 1,
          duration: 3600,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      sweepLoopRef.current = sweepLoop;

      outerLoop.start();
      innerLoop.start();
      sweepLoop.start();

      return () => {
        outerLoop.stop();
        innerLoop.stop();
        sweepLoop.stop();
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
      Animated.timing(sweepRotation, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      outerLoopRef.current?.stop();
      innerLoopRef.current?.stop();
      sweepLoopRef.current?.stop();
    };
  }, [innerPulse, isActive, outerPulse, sweepRotation]);

  React.useEffect(() => {
    sparkleLoopsRef.current.forEach((loop) => loop.stop());

    sparkleLoopsRef.current = sparkleValues.map((value, index) => {
      const peak = isActive ? 1 : 0.72;
      const base = isActive ? 0.3 : 0.2;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: peak,
            duration: 520 + index * 130,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: base,
            duration: 620 + index * 160,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    });

    sparkleLoopsRef.current.forEach((loop) => loop.start());

    return () => {
      sparkleLoopsRef.current.forEach((loop) => loop.stop());
    };
  }, [isActive, sparkleValues]);

  const outerStyle = {
    transform: [{ scale: outerPulse }],
    opacity: isActive ? 0.9 : 0.6,
  };

  const innerStyle = {
    transform: [{ scale: innerPulse }],
    opacity: isActive ? 1 : 0.85,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        opacity: disabled ? 0.7 : 1,
        transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
      })}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{ checked: isActive, disabled: Boolean(disabled) }}
      accessibilityLabel="Radar power"
      accessibilityHint="Tap to turn radar on or off"
    >
      <View className="items-center justify-center" style={{ width: size, height: size }}>
        {sparklePositions.map((position, index) => (
          <Animated.View
            key={`sparkle-${index}`}
            className="absolute rounded-full bg-emerald-300"
            style={{
              left: position.left,
              top: position.top,
              width: Math.round(size * 0.022),
              height: Math.round(size * 0.022),
              opacity: sparkleValues[index],
              transform: [{ scale: sparkleValues[index] }, { scale: position.scale }],
            }}
          />
        ))}

        <Animated.View
          className="absolute overflow-hidden rounded-full border border-emerald-300/45"
          style={[{ width: outerSize, height: outerSize }, outerStyle]}
        >
          <LinearGradient
            colors={
              isActive
                ? ['rgba(110,231,183,0.35)', 'rgba(16,185,129,0.11)', 'rgba(15,23,42,0.02)']
                : ['rgba(71,85,105,0.2)', 'rgba(30,41,59,0.1)', 'rgba(15,23,42,0.02)']
            }
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          className="absolute overflow-hidden rounded-full border border-emerald-300/55"
          style={[{ width: innerSize, height: innerSize }, innerStyle]}
        >
          <LinearGradient
            colors={
              isActive
                ? ['rgba(16,185,129,0.3)', 'rgba(5,150,105,0.2)', 'rgba(15,23,42,0.08)']
                : ['rgba(100,116,139,0.24)', 'rgba(71,85,105,0.15)', 'rgba(15,23,42,0.08)']
            }
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 0.8 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          className="absolute"
          style={{ width: outerSize, height: outerSize, transform: [{ rotate: sweepRotate }] }}
          pointerEvents="none"
        >
          <View
            className="absolute overflow-hidden rounded-full"
            style={{
              left: Math.round(outerSize / 2 - 2),
              top: Math.round(outerSize * 0.06),
              width: 4,
              height: Math.round(outerSize * 0.28),
            }}
          >
            <LinearGradient
              colors={['rgba(16,185,129,0)', 'rgba(52,211,153,0.95)', 'rgba(16,185,129,0)']}
              start={{ x: 0.5, y: 1 }}
              end={{ x: 0.5, y: 0 }}
              style={{ flex: 1 }}
            />
          </View>
        </Animated.View>

        <View
          className="absolute overflow-hidden rounded-full border border-emerald-200/60"
          style={{ width: coreSize, height: coreSize }}
        >
          <LinearGradient
            colors={
              isActive
                ? ['#6ee7b7', '#34d399', '#059669']
                : ['#94a3b8', '#64748b', '#334155']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}
          >
            <Text className="text-center text-xs font-black uppercase tracking-widest text-slate-950">
              {isBusy ? 'Syncing' : isActive ? 'Radar On' : 'Radar Off'}
            </Text>
            <Text className="mt-1 text-center text-[11px] font-semibold text-slate-900/85">
              {isBusy ? 'Please wait' : isActive ? 'Tap to pause' : 'Tap to scan'}
            </Text>
          </LinearGradient>
        </View>
      </View>
    </Pressable>
  );
}
