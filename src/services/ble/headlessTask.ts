import { triggerSyncNow } from '../sync/syncEngine';
import { startBleBackgroundLoop } from './BleBackgroundService';

export default async function LumeBleHeadlessTask() {
  await startBleBackgroundLoop();
  await triggerSyncNow();
}
