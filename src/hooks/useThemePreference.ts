import React from 'react';
import { Appearance } from 'react-native';
import { useColorScheme } from 'nativewind';
import {
  getStoredThemePreference,
  persistThemePreference,
  ThemePreference,
} from '../services/themePreference';

export function useThemePreference() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [themePreference, setThemePreferenceState] = React.useState<ThemePreference>('system');

  React.useEffect(() => {
    let isMounted = true;

    void getStoredThemePreference().then((storedPreference) => {
      if (!isMounted) {
        return;
      }

      setThemePreferenceState(storedPreference);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const setThemePreference = React.useCallback(
    async (nextPreference: ThemePreference) => {
      setThemePreferenceState(nextPreference);
      setColorScheme(nextPreference);
      await persistThemePreference(nextPreference);
    },
    [setColorScheme],
  );

  const activeScheme = (colorScheme ?? Appearance.getColorScheme() ?? 'light') as 'light' | 'dark';

  return {
    themePreference,
    setThemePreference,
    activeScheme,
  };
}
