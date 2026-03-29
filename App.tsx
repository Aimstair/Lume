import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { AppProviders } from './src/app/AppProviders';
import { RootNavigator } from './src/app/navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AppProviders>
        <RootNavigator />
      </AppProviders>
    </SafeAreaProvider>
  );
}
