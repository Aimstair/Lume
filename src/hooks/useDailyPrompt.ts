import React from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { initializeNotifications } from '../services/notifications';
import { requestNotificationPermission } from '../services/permissions';

const DAILY_PROMPT_NOTIFICATION_TYPE = 'daily_prompt';
let hasEnsuredDailyPromptThisSession = false;

const DAILY_SPARK_PROMPTS = [
  'What moment made you feel grounded today?',
  'Share a line that could brighten someone nearby.',
  'What quiet win are you proud of right now?',
  'What is one kind thing you can pass forward today?',
  'Describe your current mood in one poetic sentence.',
  'What reminder would your future self thank you for?',
  'What made you smile unexpectedly this week?',
  'What is a tiny act of courage you took today?',
  'What feeling do you want your message to leave behind?',
  'Share one thought that helps you reset when things feel heavy.',
  'What is a simple joy people often overlook?',
  'What do you want someone nearby to remember tonight?',
];

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function promptForDay(dayKey: string) {
  const index = hashString(dayKey) % DAILY_SPARK_PROMPTS.length;
  return DAILY_SPARK_PROMPTS[index];
}

function randomPrompt(exclude?: string) {
  if (DAILY_SPARK_PROMPTS.length <= 1) {
    return DAILY_SPARK_PROMPTS[0];
  }

  const initial = DAILY_SPARK_PROMPTS[Math.floor(Math.random() * DAILY_SPARK_PROMPTS.length)];
  if (!exclude || initial !== exclude) {
    return initial;
  }

  const currentIndex = DAILY_SPARK_PROMPTS.indexOf(initial);
  const fallbackIndex = (currentIndex + 1) % DAILY_SPARK_PROMPTS.length;
  return DAILY_SPARK_PROMPTS[fallbackIndex];
}

function notificationPermissionGranted(permissions: Notifications.NotificationPermissionsStatus) {
  return (
    permissions.granted ||
    permissions.status === 'granted' ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function listDailyPromptSchedules() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  return scheduled.filter((notification) => {
    const data = notification.content.data as Record<string, unknown> | undefined;
    return data?.type === DAILY_PROMPT_NOTIFICATION_TYPE;
  });
}

async function clearDailyPromptSchedules() {
  const schedules = await listDailyPromptSchedules();

  await Promise.all(
    schedules.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier),
    ),
  );
}

async function scheduleDailyPromptNotification(body: string) {
  const trigger: Notifications.NotificationTriggerInput =
    Platform.OS === 'android'
      ? ({
          hour: 8,
          minute: 0,
          repeats: true,
          channelId: 'echoes',
        } as Notifications.NotificationTriggerInput)
      : ({
          hour: 8,
          minute: 0,
          repeats: true,
        } as Notifications.NotificationTriggerInput);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Spark for Today',
      body,
      sound: 'default',
      data: {
        type: DAILY_PROMPT_NOTIFICATION_TYPE,
      },
    },
    trigger,
  });
}

export function useDailyPrompt() {
  const initialDayKey = React.useMemo(() => getLocalDateKey(), []);
  const [promptDay, setPromptDay] = React.useState(initialDayKey);
  const [prompt, setPrompt] = React.useState(() => promptForDay(initialDayKey));
  const [isScheduling, setIsScheduling] = React.useState(false);
  const schedulingRef = React.useRef(false);

  const syncPromptForToday = React.useCallback(() => {
    const nextDay = getLocalDateKey();

    setPromptDay((current) => {
      if (current === nextDay) {
        return current;
      }

      setPrompt(promptForDay(nextDay));
      return nextDay;
    });
  }, []);

  React.useEffect(() => {
    const dayTimer = setInterval(syncPromptForToday, 60_000);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncPromptForToday();
      }
    });

    return () => {
      clearInterval(dayTimer);
      appStateSubscription.remove();
    };
  }, [syncPromptForToday]);

  const shufflePrompt = React.useCallback(() => {
    setPrompt((currentPrompt) => randomPrompt(currentPrompt));
  }, []);

  const ensureDailyPromptScheduled = React.useCallback(async () => {
    try {
      await initializeNotifications();
      const permissions = await Notifications.getPermissionsAsync();

      if (!notificationPermissionGranted(permissions)) {
        return false;
      }

      const existingSchedules = await listDailyPromptSchedules();
      if (existingSchedules.length === 1) {
        return true;
      }

      if (existingSchedules.length > 1) {
        await clearDailyPromptSchedules();
      }

      await scheduleDailyPromptNotification(randomPrompt());
      return true;
    } catch {
      return false;
    }
  }, []);

  React.useEffect(() => {
    if (hasEnsuredDailyPromptThisSession) {
      return;
    }

    hasEnsuredDailyPromptThisSession = true;
    void ensureDailyPromptScheduled();
  }, [ensureDailyPromptScheduled]);

  const requestAndScheduleDailyPrompt = React.useCallback(async () => {
    if (schedulingRef.current) {
      return false;
    }

    schedulingRef.current = true;
    setIsScheduling(true);

    try {
      let permissionGranted = await requestNotificationPermission();

      if (permissionGranted && Platform.OS !== 'android') {
        const requestedPermissions = await Notifications.requestPermissionsAsync();
        permissionGranted = notificationPermissionGranted(requestedPermissions);
      }

      if (!permissionGranted) {
        return false;
      }

      return ensureDailyPromptScheduled();
    } finally {
      schedulingRef.current = false;
      setIsScheduling(false);
    }
  }, [ensureDailyPromptScheduled]);

  return {
    prompt,
    promptDay,
    isScheduling,
    shufflePrompt,
    ensureDailyPromptScheduled,
    requestAndScheduleDailyPrompt,
  };
}
