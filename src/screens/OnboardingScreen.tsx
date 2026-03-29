import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { requestBluetoothPermissions, requestLocationPermission, requestNotificationPermission } from '../services/permissions';

type Step = 'bluetooth' | 'location' | 'notifications' | 'complete';

export function OnboardingScreen({ onComplete }: { onComplete?: () => void }) {
  const [step, setStep] = useState<Step>('bluetooth');

  const progress = useMemo(() => {
    const map: Record<Step, number> = {
      bluetooth: 25,
      location: 50,
      notifications: 75,
      complete: 100,
    };
    return map[step];
  }, [step]);

  const nextStep = async () => {
    if (step === 'bluetooth') {
      await requestBluetoothPermissions();
      setStep('location');
      return;
    }

    if (step === 'location') {
      await requestLocationPermission();
      setStep('notifications');
      return;
    }

    if (step === 'notifications') {
      await requestNotificationPermission();
      setStep('complete');
      return;
    }

    onComplete?.();
  };

  return (
    <View className="flex-1 bg-slate-950 px-6 pt-20">
      <View className="absolute left-0 right-0 top-0 h-72 bg-emerald-600/20" />
      <Text className="text-5xl font-black text-white">Lume</Text>
      <Text className="mt-3 text-base text-slate-300">
        Turn on proximity permissions to discover nearby voices instantly, even offline.
      </Text>

      <View className="mt-8 h-3 rounded-full bg-slate-800">
        <View className="h-3 rounded-full bg-emerald-400" style={{ width: `${progress}%` }} />
      </View>

      <View className="mt-8 rounded-3xl border border-slate-700 bg-slate-900 p-5">
        <Text className="text-sm uppercase tracking-widest text-emerald-400">Step</Text>
        {step === 'bluetooth' ? (
          <Text className="mt-2 text-2xl font-bold text-white">Allow Bluetooth Access</Text>
        ) : null}
        {step === 'location' ? (
          <Text className="mt-2 text-2xl font-bold text-white">Allow Location Access</Text>
        ) : null}
        {step === 'notifications' ? (
          <Text className="mt-2 text-2xl font-bold text-white">Allow Notifications</Text>
        ) : null}
        {step === 'complete' ? (
          <Text className="mt-2 text-2xl font-bold text-white">You Are Ready</Text>
        ) : null}

        <Text className="mt-3 text-slate-300">
          Lume uses BLE scanning and broadcasting in the background to exchange daily messages nearby.
        </Text>
      </View>

      <Pressable
        className="mt-8 rounded-2xl bg-emerald-400 py-4"
        onPress={nextStep}
      >
        <Text className="text-center text-lg font-bold text-slate-950">
          {step === 'complete' ? 'Continue' : 'Allow & Continue'}
        </Text>
      </Pressable>
    </View>
  );
}
