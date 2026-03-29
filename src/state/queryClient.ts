import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import React from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      networkMode: 'offlineFirst',
      retry: 2,
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 1,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'LUME_RQ_CACHE_V1',
  throttleTime: 1000,
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(
    PersistQueryClientProvider,
    {
      client: queryClient,
      persistOptions: {
        persister,
        buster: '1',
      },
    },
    children,
  );
}

export { queryClient };
