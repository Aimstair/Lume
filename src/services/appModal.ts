export type AppModalAction = {
  label: string;
  role?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type AppModalPayload = {
  title: string;
  message: string;
  actions?: AppModalAction[];
};

type ModalListener = (payload: AppModalPayload) => void;

const listeners = new Set<ModalListener>();

export function presentAppModal(payload: AppModalPayload) {
  if (!listeners.size) {
    return;
  }

  for (const listener of listeners) {
    listener(payload);
  }
}

export function subscribeToAppModal(listener: ModalListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
