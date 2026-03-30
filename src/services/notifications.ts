import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let initialized = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function initializeNotifications() {
  if (initialized) {
    return;
  }

  initialized = true;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('echoes', {
      name: 'Echoes',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#34d399',
      enableVibrate: true,
      sound: 'default',
    });
  }
}

export async function notifyEchoReceived(unseenCount: number, messagePreview: string) {
  try {
    await initializeNotifications();

    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== 'granted') {
      return;
    }

    const bodyText = messagePreview?.trim().length
      ? messagePreview.trim().slice(0, 120)
      : 'Someone nearby shared a message.';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: unseenCount > 1 ? `${unseenCount} new echoes` : 'New echo received',
        body: bodyText,
        sound: 'default',
        data: {
          type: 'echo_received',
          unseenCount,
        },
      },
      trigger: null,
    });
  } catch {
    // Keep BLE pipeline resilient even when notifications are unavailable.
  }
}
