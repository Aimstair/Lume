import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  withDelay,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type AuraTierKey = 'spark' | 'glow' | 'supernova';

type AuraTier = {
  key: AuraTierKey;
  label: string;
  outerRing: [string, string, string];
  innerRing: [string, string, string];
  core: [string, string, string];
  sparkleColor: string;
  sweep: [string, string, string];
  ringBorder: string;
};

const AURA_TIERS: Record<AuraTierKey, AuraTier> = {
  spark: {
    key: 'spark',
    label: 'Spark',
    outerRing: ['rgba(125,211,252,0.34)', 'rgba(8,145,178,0.14)', 'rgba(15,23,42,0.02)'],
    innerRing: ['rgba(56,189,248,0.3)', 'rgba(14,116,144,0.22)', 'rgba(15,23,42,0.09)'],
    core: ['#bae6fd', '#38bdf8', '#0e7490'],
    sparkleColor: '#e0f2fe',
    sweep: ['rgba(56,189,248,0)', 'rgba(125,211,252,0.95)', 'rgba(56,189,248,0)'],
    ringBorder: 'rgba(186,230,253,0.55)',
  },
  glow: {
    key: 'glow',
    label: 'Glow',
    outerRing: ['rgba(110,231,183,0.35)', 'rgba(16,185,129,0.12)', 'rgba(15,23,42,0.02)'],
    innerRing: ['rgba(16,185,129,0.3)', 'rgba(5,150,105,0.2)', 'rgba(15,23,42,0.09)'],
    core: ['#6ee7b7', '#34d399', '#059669'],
    sparkleColor: '#bbf7d0',
    sweep: ['rgba(16,185,129,0)', 'rgba(52,211,153,0.95)', 'rgba(16,185,129,0)'],
    ringBorder: 'rgba(167,243,208,0.55)',
  },
  supernova: {
    key: 'supernova',
    label: 'Supernova',
    outerRing: ['rgba(253,186,116,0.38)', 'rgba(249,115,22,0.16)', 'rgba(15,23,42,0.02)'],
    innerRing: ['rgba(251,146,60,0.34)', 'rgba(234,88,12,0.23)', 'rgba(15,23,42,0.1)'],
    core: ['#fde68a', '#fb923c', '#ea580c'],
    sparkleColor: '#fef3c7',
    sweep: ['rgba(251,146,60,0)', 'rgba(254,215,170,0.95)', 'rgba(251,146,60,0)'],
    ringBorder: 'rgba(254,215,170,0.6)',
  },
};

const SPARKLE_LAYOUT = [
  { leftRatio: 0.14, topRatio: 0.13, scale: 0.9, phase: 0.1 },
  { leftRatio: 0.76, topRatio: 0.24, scale: 1, phase: 0.35 },
  { leftRatio: 0.72, topRatio: 0.72, scale: 1.15, phase: 0.6 },
  { leftRatio: 0.2, topRatio: 0.78, scale: 0.85, phase: 0.85 },
];

function resolveAuraTier(radianceScore: number) {
  if (radianceScore >= 500) {
    return AURA_TIERS.supernova;
  }

  if (radianceScore >= 100) {
    return AURA_TIERS.glow;
  }

  return AURA_TIERS.spark;
}

type SparkleDotProps = {
  left: number;
  top: number;
  size: number;
  scale: number;
  color: string;
  phase: number;
  twinkleProgress: SharedValue<number>;
};

const SparkleDot = React.memo(function SparkleDot({
  left,
  top,
  size,
  scale,
  color,
  phase,
  twinkleProgress,
}: SparkleDotProps) {
  const sparkleStyle = useAnimatedStyle(() => {
    const wave = Math.sin((twinkleProgress.value + phase) * Math.PI * 2);
    const opacity = interpolate(wave, [-1, 1], [0.25, 1]);
    const pulseScale = interpolate(wave, [-1, 1], [0.8, 1.35]);

    return {
      opacity,
      transform: [{ scale: pulseScale * scale }],
    };
  }, [phase, scale, twinkleProgress]);

  return (
    <Animated.View
      className="absolute rounded-full"
      style={[
        {
          left,
          top,
          width: size,
          height: size,
          backgroundColor: color,
        },
        sparkleStyle,
      ]}
    />
  );
});

type AuraVisualizerProps = {
  isActive: boolean;
  size?: number;
  onPress?: () => void;
  disabled?: boolean;
  isBusy?: boolean;
  radianceScore?: number;
};

export function AuraVisualizer({
  isActive,
  size = 224,
  onPress,
  disabled,
  isBusy,
  radianceScore = 0,
}: AuraVisualizerProps) {
  const tier = React.useMemo(() => resolveAuraTier(Math.max(0, Math.floor(radianceScore))), [radianceScore]);

  const outerPulse = useSharedValue(1);
  const innerPulse = useSharedValue(1);
  const corePulse = useSharedValue(1);
  const sweepRotation = useSharedValue(0);
  const twinkleProgress = useSharedValue(0);
  const tierPulse = useSharedValue(0);
  const pulseWaveA = useSharedValue(0);
  const pulseWaveB = useSharedValue(0);

  const outerSize = size;
  const innerSize = Math.round(size * 0.72);
  const coreSize = Math.round(size * 0.42);

  const sparkleSize = Math.round(size * 0.022);

  React.useEffect(() => {
    cancelAnimation(outerPulse);
    cancelAnimation(innerPulse);
    cancelAnimation(corePulse);
    cancelAnimation(sweepRotation);
    cancelAnimation(twinkleProgress);
    cancelAnimation(pulseWaveA);
    cancelAnimation(pulseWaveB);

    if (isActive) {
      outerPulse.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1050, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );

      innerPulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );

      corePulse.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 760, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 760, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );

      sweepRotation.value = 0;
      sweepRotation.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: 1800,
            easing: Easing.linear,
          }),
          withTiming(0, {
            duration: 0,
            easing: Easing.linear,
          }),
        ),
        -1,
        false,
      );

      twinkleProgress.value = withRepeat(
        withTiming(1, {
          duration: 1650,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      );

      pulseWaveA.value = 0;
      pulseWaveA.value = withRepeat(
        withTiming(1, {
          duration: 2100,
          easing: Easing.linear,
        }),
        -1,
        false,
      );

      pulseWaveB.value = 0;
      pulseWaveB.value = withDelay(
        1000,
        withRepeat(
          withTiming(1, {
            duration: 2100,
            easing: Easing.linear,
          }),
          -1,
          false,
        ),
      );

      return;
    }

    outerPulse.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) });
    innerPulse.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) });
    corePulse.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) });
    sweepRotation.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) });
    twinkleProgress.value = withTiming(0.35, { duration: 280, easing: Easing.out(Easing.ease) });
    pulseWaveA.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.ease) });
    pulseWaveB.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.ease) });
  }, [
    corePulse,
    innerPulse,
    isActive,
    outerPulse,
    pulseWaveA,
    pulseWaveB,
    sweepRotation,
    twinkleProgress,
  ]);

  React.useEffect(() => {
    tierPulse.value = 0;
    tierPulse.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: 260, easing: Easing.in(Easing.ease) }),
    );
  }, [tier.key, tierPulse]);

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: outerPulse.value }],
    opacity: isActive ? 0.9 : 0.62,
  }));

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: innerPulse.value }],
    opacity: isActive ? 1 : 0.85,
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweepRotation.value * 360}deg` }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: corePulse.value + tierPulse.value * 0.05 }],
  }));

  const pulseWaveAStyle = useAnimatedStyle(() => ({
    opacity: isActive ? interpolate(pulseWaveA.value, [0, 1], [0.42, 0]) : 0,
    transform: [{ scale: 0.62 + pulseWaveA.value * 0.9 }],
  }));

  const pulseWaveBStyle = useAnimatedStyle(() => ({
    opacity: isActive ? interpolate(pulseWaveB.value, [0, 1], [0.35, 0]) : 0,
    transform: [{ scale: 0.7 + pulseWaveB.value * 0.86 }],
  }));

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
        <Animated.View
          className="absolute rounded-full border"
          style={[
            {
              width: Math.round(size * 0.84),
              height: Math.round(size * 0.84),
              borderColor: tier.ringBorder,
            },
            pulseWaveAStyle,
          ]}
          pointerEvents="none"
        />

        <Animated.View
          className="absolute rounded-full border"
          style={[
            {
              width: Math.round(size * 0.76),
              height: Math.round(size * 0.76),
              borderColor: tier.ringBorder,
            },
            pulseWaveBStyle,
          ]}
          pointerEvents="none"
        />

        {SPARKLE_LAYOUT.map((position, index) => (
          <SparkleDot
            key={`sparkle-${index}`}
            left={Math.round(size * position.leftRatio)}
            top={Math.round(size * position.topRatio)}
            size={sparkleSize}
            scale={position.scale}
            phase={position.phase}
            color={tier.sparkleColor}
            twinkleProgress={twinkleProgress}
          />
        ))}

        <Animated.View
          className="absolute overflow-hidden rounded-full border"
          style={[
            {
              width: outerSize,
              height: outerSize,
              borderColor: tier.ringBorder,
            },
            outerStyle,
          ]}
        >
          <LinearGradient
            colors={isActive ? tier.outerRing : ['rgba(71,85,105,0.2)', 'rgba(30,41,59,0.1)', 'rgba(15,23,42,0.02)']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          className="absolute overflow-hidden rounded-full border"
          style={[
            {
              width: innerSize,
              height: innerSize,
              borderColor: tier.ringBorder,
            },
            innerStyle,
          ]}
        >
          <LinearGradient
            colors={isActive ? tier.innerRing : ['rgba(100,116,139,0.24)', 'rgba(71,85,105,0.15)', 'rgba(15,23,42,0.08)']}
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 0.8 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          className="absolute"
          style={[{ width: outerSize, height: outerSize }, sweepStyle]}
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
              colors={isActive ? tier.sweep : ['rgba(100,116,139,0)', 'rgba(148,163,184,0.75)', 'rgba(100,116,139,0)']}
              start={{ x: 0.5, y: 1 }}
              end={{ x: 0.5, y: 0 }}
              style={{ flex: 1 }}
            />
          </View>
        </Animated.View>

        <Animated.View
          className="absolute overflow-hidden rounded-full border"
          style={[
            {
              width: coreSize,
              height: coreSize,
              borderColor: tier.ringBorder,
            },
            coreStyle,
          ]}
        >
          <LinearGradient
            colors={isActive ? tier.core : ['#94a3b8', '#64748b', '#334155']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}
          >
            <Text className="text-center text-[11px] font-black uppercase tracking-widest text-slate-950">
              {isBusy ? 'Syncing' : isActive ? 'Radar On' : 'Radar Off'}
            </Text>
            <Text className="mt-1 text-center text-[11px] font-semibold text-slate-900/85">
              {isBusy ? 'Please wait' : `${Math.max(0, Math.floor(radianceScore))} radiance`}
            </Text>
          </LinearGradient>
        </Animated.View>
      </View>
    </Pressable>
  );
}
