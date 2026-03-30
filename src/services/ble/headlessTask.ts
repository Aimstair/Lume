import { triggerSyncNow } from '../sync/syncEngine';
import { startBleBackgroundLoop } from './BleBackgroundService';

export default async function LumeBleHeadlessTask() {
  try {
    await startBleBackgroundLoop();
  } catch {
    // Headless execution should stay alive even when BLE is temporarily unavailable.
  }

  await triggerSyncNow();
}
