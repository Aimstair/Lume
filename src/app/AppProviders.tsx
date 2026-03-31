import React from 'react';
import { QueryProvider } from '../state/queryClient';
import { bootstrapApp, teardownApp } from '../services/bootstrap';
import { applyStoredThemePreference } from '../services/themePreference';
import { AppModalHost } from '../components/AppModalHost';

export function AppProviders({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    bootstrapApp();
    void applyStoredThemePreference();

    return () => {
      teardownApp();
    };
  }, []);

  return (
    <QueryProvider>
      {children}
      <AppModalHost />
    </QueryProvider>
  );
}
