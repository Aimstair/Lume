import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { AppModalAction, AppModalPayload, subscribeToAppModal } from '../services/appModal';

function actionTextClass(role: AppModalAction['role']) {
  if (role === 'destructive') {
    return 'font-semibold text-rose-600 dark:text-rose-300';
  }

  if (role === 'cancel') {
    return 'font-semibold text-slate-600 dark:text-slate-300';
  }

  return 'font-semibold text-emerald-700 dark:text-emerald-300';
}

export function AppModalHost() {
  const [payload, setPayload] = React.useState<AppModalPayload | null>(null);

  React.useEffect(() => {
    return subscribeToAppModal((nextPayload) => {
      setPayload(nextPayload);
    });
  }, []);

  const onDismiss = React.useCallback(() => {
    setPayload(null);
  }, []);

  const actions = payload?.actions?.length
    ? payload.actions
    : [{ label: 'OK', role: 'default' as const }];

  return (
    <Modal
      transparent
      animationType="fade"
      visible={Boolean(payload)}
      onRequestClose={onDismiss}
    >
      <View className="flex-1 items-center justify-center bg-slate-950/60 px-6">
        <View className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          <Text className="text-xl font-black text-slate-900 dark:text-slate-50">
            {payload?.title ?? ''}
          </Text>
          <Text className="mt-2 text-slate-700 dark:text-slate-200">{payload?.message ?? ''}</Text>

          <View className="mt-5 flex-row justify-end">
            {actions.map((action, index) => (
              <Pressable
                key={`${action.label}-${index}`}
                className={
                  index === 0
                    ? 'min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 dark:border-slate-700 dark:bg-slate-800'
                    : 'ml-2 min-h-11 items-center justify-center rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-4 py-2'
                }
                style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
                onPress={() => {
                  onDismiss();
                  action.onPress?.();
                }}
              >
                <Text className={actionTextClass(action.role)}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
