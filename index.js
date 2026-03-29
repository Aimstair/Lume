import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';
import App from './App';
import LumeBleHeadlessTask from './src/services/ble/headlessTask';

registerRootComponent(App);
AppRegistry.registerComponent('Lume', () => App);

// Android headless task entrypoint for BLE scanning/advertising while app is backgrounded.
AppRegistry.registerHeadlessTask('LumeBleHeadlessTask', () => LumeBleHeadlessTask);
