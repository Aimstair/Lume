import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme } from 'nativewind';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = 'lume.theme.preference';

function parseThemePreference(input: string | null): ThemePreference {
  if (input === 'light' || input === 'dark' || input === 'system') {
    return input;
  }

  return 'system';
}

export async function getStoredThemePreference() {
  const stored = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  return parseThemePreference(stored);
}

export async function applyStoredThemePreference() {
  const preference = await getStoredThemePreference();
  colorScheme.set(preference);
  return preference;
}

export async function persistThemePreference(preference: ThemePreference) {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
}
