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

export async function notifyRippleCarriedBySomeone(carrierLumeId: string, messagePreview: string) {
  try {
    await initializeNotifications();

    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== 'granted') {
      return;
    }

    const carrierLabel = carrierLumeId?.trim().length ? carrierLumeId.trim() : 'A nearby user';
    const preview = messagePreview?.trim().length
      ? messagePreview.trim().slice(0, 90)
      : 'Your message was carried forward.';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your ripple is spreading',
        body: `${carrierLabel} carried your signal. "${preview}"`,
        sound: 'default',
        data: {
          type: 'ripple_carried',
          carrierLumeId: carrierLabel,
        },
      },
      trigger: null,
    });
  } catch {
    // Ignore notification issues to preserve BLE flow.
  }
}

export async function notifyProximityWave(senderLumeId: string) {
  try {
    await initializeNotifications();

    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== 'granted') {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Nearby wave',
        body: `${senderLumeId || 'A nearby Lume user'} sent a wave.`,
        sound: 'default',
        data: {
          type: 'proximity_wave',
          senderLumeId,
        },
      },
      trigger: null,
    });
  } catch {
    // Keep proximity handling resilient even when notifications fail.
  }
}
