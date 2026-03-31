import React from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { initializeNotifications } from '../services/notifications';
import { requestNotificationPermission } from '../services/permissions';

const DAILY_PROMPT_NOTIFICATION_TYPE = 'daily_prompt';
let hasEnsuredDailyPromptThisSession = false;

type WeeklyTheme = {
  id: string;
  title: string;
  prompts: string[];
};

const WEEKLY_THEMES: WeeklyTheme[] = [
  {
    id: 'gratitude',
    title: 'Gratitude Week',
    prompts: [
      'What felt quietly generous today?',
      'Who made your day easier without knowing it?',
      'Name one small thing you are genuinely thankful for right now.',
      'What simple moment felt like a gift this week?',
    ],
  },
  {
    id: 'travel',
    title: 'Travel Tuesday Week',
    prompts: [
      'What place changed your perspective, even briefly?',
      'Share a memory from a street, station, or trail that still lingers.',
      'If someone nearby could teleport today, where should they go?',
      'What would your city sound like as a one-line postcard?',
    ],
  },
  {
    id: 'courage',
    title: 'Courage Week',
    prompts: [
      'What brave choice did you make that nobody saw?',
      'What fear shrank a little today?',
      'Share a sentence someone needs before a hard conversation.',
      'What does courage look like in ordinary life for you?',
    ],
  },
  {
    id: 'wonder',
    title: 'Wonder Week',
    prompts: [
      'What moment felt unexpectedly magical today?',
      'Describe something ordinary as if it were the first time you saw it.',
      'What made you pause and notice the world for a second?',
      'Share a line that makes nearby strangers feel curious again.',
    ],
  },
];

const DAY_FLAVORS = [
  'Mindful Monday',
  'Travel Tuesday',
  'Warmth Wednesday',
  'Thoughtful Thursday',
  'Future Friday',
  'Slow Saturday',
  'Soulful Sunday',
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

function getThemeForDay(date: Date) {
  const weekOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
  const theme = WEEKLY_THEMES[weekOfYear % WEEKLY_THEMES.length] ?? WEEKLY_THEMES[0];
  const dayFlavor = DAY_FLAVORS[date.getDay()] ?? 'Daily Spark';

  return {
    theme,
    dayFlavor,
  };
}

function promptForDay(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00`);
  const { theme, dayFlavor } = getThemeForDay(Number.isNaN(date.getTime()) ? new Date() : date);
  const prompts = theme.prompts;
  const index = hashString(`${dayKey}-${theme.id}-${dayFlavor}`) % prompts.length;
  return prompts[index] ?? prompts[0] ?? 'What do you want someone nearby to feel today?';
}

function randomPrompt(activePrompts: string[], exclude?: string) {
  if (activePrompts.length <= 1) {
    return activePrompts[0] ?? 'What do you want someone nearby to feel today?';
  }

  const initial = activePrompts[Math.floor(Math.random() * activePrompts.length)];
  if (!exclude || initial !== exclude) {
    return initial;
  }

  const currentIndex = activePrompts.indexOf(initial);
  const fallbackIndex = (currentIndex + 1) % activePrompts.length;
  return activePrompts[fallbackIndex] ?? activePrompts[0];
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
  const [themeTitle, setThemeTitle] = React.useState(() => getThemeForDay(new Date(`${initialDayKey}T00:00:00`)).theme.title);
  const [dayFlavor, setDayFlavor] = React.useState(() => getThemeForDay(new Date(`${initialDayKey}T00:00:00`)).dayFlavor);
  const [isScheduling, setIsScheduling] = React.useState(false);
  const schedulingRef = React.useRef(false);

  const syncPromptForToday = React.useCallback(() => {
    const nextDay = getLocalDateKey();

    setPromptDay((current) => {
      if (current === nextDay) {
        return current;
      }

      const { theme, dayFlavor: nextDayFlavor } = getThemeForDay(new Date(`${nextDay}T00:00:00`));
      setPrompt(promptForDay(nextDay));
      setThemeTitle(theme.title);
      setDayFlavor(nextDayFlavor);
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
    const { theme } = getThemeForDay(new Date(`${promptDay}T00:00:00`));
    setPrompt((currentPrompt) => randomPrompt(theme.prompts, currentPrompt));
  }, [promptDay]);

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

      const { theme } = getThemeForDay(new Date());
      await scheduleDailyPromptNotification(randomPrompt(theme.prompts));
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
    themeTitle,
    dayFlavor,
    isScheduling,
    shufflePrompt,
    ensureDailyPromptScheduled,
    requestAndScheduleDailyPrompt,
  };
}
