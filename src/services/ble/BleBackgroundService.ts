import BleManager from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import BleAdvertiser from 'react-native-ble-advertiser';
import { localRepo } from '../../db/repositories';
import { newId, newUuid } from '../id';
import { decodePayload, encodePayload } from './BlePayloadCodec';
import {
  BLE_MIN_RSSI,
  BLE_SCAN_SECONDS,
  LUME_LUME_ID_CHAR_UUID,
  LUME_PAYLOAD_CHAR_UUID,
  LUME_SERVICE_UUID,
} from './constants';
import { session } from '../../state/session';
import { notifyEchoReceived } from '../../services/notifications';

const BleManagerModule = NativeModules.BleManager;
const bleEmitter = new NativeEventEmitter(BleManagerModule);

let subscriptions: Array<{ remove: () => void }> = [];
let started = false;
let starting = false;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getBleBackgroundLoopStatus(): Promise<boolean> {
  try {
    const advertiserActive = await BleAdvertiser.isActive();
    const scanActive = await BleManager.isScanning().catch(() => false);
    started = advertiserActive || scanActive;
    return started;
  } catch {
    return started;
  }
}

function encodeUtf8ToBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function decodeUtf8FromBytes(raw: number[]): string {
  return new TextDecoder().decode(new Uint8Array(raw));
}

async function getLocalBroadcastPayload() {
  const profile = localRepo.getProfile(session.profileId);
  const todayMessage = localRepo.getTodayMessage(session.profileId);

  return {
    lumeId: session.lumeId,
    profileId: session.profileId,
    radianceScore: profile.radianceScore,
    dailyMessage: todayMessage?.body ?? '',
    messageDate: new Date().toISOString().slice(0, 10),
  };
}

async function startPeripheralAdvertising() {
  const payload = await getLocalBroadcastPayload();

  // Advertisement packet stays small with just Lume ID.
  await BleAdvertiser.setCompanyId(0x1234);
  await BleAdvertiser.broadcast(
    session.lumeId,
    [0x4c, 0x55, 0x4d, 0x45],
    {
      includeDeviceName: false,
      advertiseMode: 2,
      txPowerLevel: 3,
    },
  );

  // Full payload is exposed via the custom GATT characteristic.
  await BleManager.startNotification('self', LUME_SERVICE_UUID, LUME_PAYLOAD_CHAR_UUID);
  await BleManager.write(
    'self',
    LUME_SERVICE_UUID,
    LUME_PAYLOAD_CHAR_UUID,
    encodeUtf8ToBytes(encodePayload(payload)),
  );
}

async function exchangePayloadWithDiscoveredDevice(peripheralId: string, rssi: number | null) {
  try {
    await BleManager.connect(peripheralId);
    await BleManager.retrieveServices(peripheralId);

    const rawBytes = (await BleManager.read(
      peripheralId,
      LUME_SERVICE_UUID,
      LUME_PAYLOAD_CHAR_UUID,
    )) as number[];
    const payload = decodePayload(decodeUtf8FromBytes(rawBytes));

    if (!payload || payload.profileId === session.profileId) {
      return;
    }

    const alreadyStored = localRepo.hasEncounterForMessageDay(
      session.profileId,
      payload.profileId,
      payload.messageDate,
    );

    if (alreadyStored) {
      return;
    }

    const encounterId = newUuid();
    localRepo.addEncounter({
      id: encounterId,
      observerProfileId: session.profileId,
      observedProfileId: payload.profileId,
      observedMessageBody: payload.dailyMessage,
      observedMessageDate: payload.messageDate,
      observedRadianceScore: payload.radianceScore,
      happenedAt: new Date().toISOString(),
      rssi,
      pendingSync: true,
      seen: false,
      pinned: false,
      reported: false,
      deleted: false,
    });

    localRepo.queue({
      id: newId('out_'),
      opType: 'insert_encounter',
      tableName: 'encounters',
      payloadJson: JSON.stringify({
        id: encounterId,
        observer_profile_id: session.profileId,
        observed_profile_id: payload.profileId,
        observed_message_body: payload.dailyMessage,
        observed_radiance_score: payload.radianceScore,
        happened_at: new Date().toISOString(),
        rssi,
      }),
      createdAt: new Date().toISOString(),
    });

    const unseenCount = localRepo.countUnseenEncounters(session.profileId);
    void notifyEchoReceived(unseenCount, payload.dailyMessage);
  } catch {
    // Keep scan loop resilient. Errors are expected in transient BLE ranges.
  } finally {
    try {
      await BleManager.disconnect(peripheralId);
    } catch {
      // no-op
    }
  }
}

async function startCentralScanning() {
  try {
    await BleManager.stopScan();
  } catch {
    // no-op
  }

  await BleManager.scan([LUME_SERVICE_UUID], BLE_SCAN_SECONDS, true, {
    scanMode: Platform.OS === 'android' ? 2 : undefined,
    matchMode: Platform.OS === 'android' ? 1 : undefined,
  });
}

function addBleListeners() {
  subscriptions.push(
    bleEmitter.addListener('BleManagerDiscoverPeripheral', (peripheral: { id?: string; rssi?: number }) => {
      const rssi = typeof peripheral.rssi === 'number' ? peripheral.rssi : null;
      if (rssi !== null && rssi < BLE_MIN_RSSI) return;
      if (!peripheral?.id) return;

      exchangePayloadWithDiscoveredDevice(peripheral.id, rssi);
    }),
  );

  subscriptions.push(
    bleEmitter.addListener('BleManagerStopScan', () => {
      if (!started || starting) {
        return;
      }

      startCentralScanning().catch(() => {
        // no-op
      });
    }),
  );
}

export async function startBleBackgroundLoop() {
  if (started || starting) return;
  starting = true;

  try {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await BleManager.start({ showAlert: false });
        addBleListeners();
        await startPeripheralAdvertising();
        await startCentralScanning();
        started = true;
        return;
      } catch (error) {
        lastError = error;
        for (const sub of subscriptions) {
          sub.remove();
        }
        subscriptions = [];
        started = false;

        try {
          await BleManager.stopScan();
        } catch {
          // no-op
        }

        try {
          await BleAdvertiser.stopBroadcast();
        } catch {
          // no-op
        }

        if (attempt < 2) {
          await wait(400);
          continue;
        }
      }
    }

    throw lastError ?? new Error('Radar start failed');
  } finally {
    starting = false;
  }
}

export async function stopBleBackgroundLoop() {
  starting = false;

  for (const sub of subscriptions) {
    sub.remove();
  }
  subscriptions = [];

  try {
    await BleManager.stopScan();
  } catch {
    // no-op
  }

  try {
    await BleAdvertiser.stopBroadcast();
  } catch {
    // no-op
  }

  started = false;
}
