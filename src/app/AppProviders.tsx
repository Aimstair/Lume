import React from 'react';
import { QueryProvider } from '../state/queryClient';
import { bootstrapApp, teardownApp } from '../services/bootstrap';

export function AppProviders({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    bootstrapApp();

    return () => {
      teardownApp();
    };
  }, []);

  return <QueryProvider>{children}</QueryProvider>;
}
