import BleManager from 'react-native-ble-manager';
import { AppState, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import BleAdvertiser from 'react-native-ble-advertiser';
import * as Haptics from 'expo-haptics';
import { localRepo } from '../../db/repositories';
import { newId, newUuid } from '../id';
import {
  buildAdvertisementPreviewBytes,
  decodePayload,
  encodePayload,
} from './BlePayloadCodec';
import {
  BLE_MIN_RSSI,
  BLE_SCAN_SECONDS,
  LUME_PAYLOAD_CHAR_UUID,
  LUME_SERVICE_UUID,
} from './constants';
import { session } from '../../state/session';
import {
  notifyEchoReceived,
  notifyProximityWave,
  notifyRippleCarriedBySomeone,
} from '../../services/notifications';
import { getBestEffortEncounterCoordinates } from '../location/encounterLocation';
import { ensureSessionIdentity } from '../supabase/authSession';

type RadarScanConfig = {
  minRssi: number;
  scanSeconds: number;
};

type ProximityPingPayload = {
  profileId: string;
  lumeId: string;
  receivedAt: string;
};

const BleManagerModule = NativeModules.BleManager;
const bleEmitter = new NativeEventEmitter(BleManagerModule);

let subscriptions: Array<{ remove: () => void }> = [];
let started = false;
let starting = false;
let stopping = false;
let activeScanConfig: RadarScanConfig = {
  minRssi: BLE_MIN_RSSI,
  scanSeconds: BLE_SCAN_SECONDS,
};

const proximityPingListeners = new Set<(payload: ProximityPingPayload) => void>();
const lastSeenPingTokenByProfile = new Map<string, number>();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRadarScanConfig(radianceScore: number): RadarScanConfig {
  const safe = Math.max(0, Math.floor(radianceScore));

  if (safe >= 500) {
    return {
      minRssi: -98,
      scanSeconds: 10,
    };
  }

  if (safe >= 100) {
    return {
      minRssi: -96,
      scanSeconds: 9,
    };
  }

  return {
    minRssi: BLE_MIN_RSSI,
    scanSeconds: BLE_SCAN_SECONDS,
  };
}

function refreshRadarScanConfigFromProfile() {
  if (!session.profileId) {
    activeScanConfig = {
      minRssi: BLE_MIN_RSSI,
      scanSeconds: BLE_SCAN_SECONDS,
    };
    return;
  }

  const profile = localRepo.getProfile(session.profileId);
  activeScanConfig = resolveRadarScanConfig(profile.radianceScore);
}

function emitProximityPing(payload: ProximityPingPayload) {
  for (const listener of proximityPingListeners) {
    try {
      listener(payload);
    } catch {
      // Keep BLE event loop resilient if a subscriber throws.
    }
  }
}

export function subscribeToProximityPings(listener: (payload: ProximityPingPayload) => void) {
  proximityPingListeners.add(listener);

  return () => {
    proximityPingListeners.delete(listener);
  };
}

export async function sendProximityPing() {
  const previous = Number(localRepo.getSyncState('ble_ping_token') ?? '0');
  const next = Number.isFinite(previous) ? previous + 1 : 1;
  localRepo.setSyncState('ble_ping_token', String(next));

  await refreshBleBroadcastPayload();

  if (AppState.currentState === 'active') {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      // no-op
    });
  }
}

export async function getBleBackgroundLoopStatus(): Promise<boolean> {
  return started;
}

function encodeUtf8ToBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function decodeUtf8FromBytes(raw: number[]): string {
  return new TextDecoder().decode(new Uint8Array(raw));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? '');
}

function isAdvertisePayloadTooLargeError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('larger than 31 bytes')
    || (message.includes('advertise data') && message.includes('31 bytes'))
  );
}

function ensureBleIdentityReady() {
  ensureSessionIdentity();

  if (!session.profileId || !session.lumeId) {
    throw new Error('Missing local identity for radar startup');
  }
}

async function getLocalBroadcastPayload() {
  ensureBleIdentityReady();

  const profile = localRepo.getProfile(session.profileId);
  const todayMessage = localRepo.getTodayMessage(session.profileId);

  return {
    lumeId: session.lumeId,
    profileId: session.profileId,
    radianceScore: profile.radianceScore,
    dailyMessage: todayMessage?.body ?? '',
    messageDate: todayMessage?.messageDate ?? new Date().toISOString().slice(0, 10),
    pinType: todayMessage?.pinType ?? 'classic',
    rippleCount: todayMessage?.rippleCount ?? 0,
    originalSenderId: todayMessage?.originalSenderId ?? null,
    auraColor: todayMessage?.auraColor ?? null,
    voiceSpark: todayMessage?.voiceSpark ?? null,
    pingToken: Math.max(0, Number(localRepo.getSyncState('ble_ping_token') ?? '0')),
  };
}

async function startPeripheralAdvertising() {
  const payload = await getLocalBroadcastPayload();
  const previewBytes = buildAdvertisementPreviewBytes({
    pinType: payload.pinType,
    radianceScore: payload.radianceScore,
    rippleCount: payload.rippleCount,
    auraColor: payload.auraColor,
    voiceSpark: payload.voiceSpark,
  });

  // Some Android devices only support legacy 31-byte advertising payloads.
  // If preview metadata overflows, fall back to a service-only broadcast.
  const broadcastOptions = {
    includeDeviceName: false,
    advertiseMode: 2,
    txPowerLevel: 3,
  };

  try {
    // Keep advertisement preview compact while signaling pin/radiance/media traits.
    await BleAdvertiser.setCompanyId(0x1234);
    await BleAdvertiser.broadcast(
      LUME_SERVICE_UUID,
      previewBytes,
      broadcastOptions,
    );
  } catch (error) {
    if (!isAdvertisePayloadTooLargeError(error)) {
      throw error;
    }

    try {
      await BleAdvertiser.stopBroadcast();
    } catch {
      // no-op
    }

    await BleAdvertiser.broadcast(
      LUME_SERVICE_UUID,
      [],
      broadcastOptions,
    );
  }

  // Some Android BLE stacks don't expose a local "self" GATT target. Keep Radar alive even
  // when characteristic writes fail, so scanning/advertising can continue.
  try {
    await BleManager.startNotification('self', LUME_SERVICE_UUID, LUME_PAYLOAD_CHAR_UUID);
    await BleManager.write(
      'self',
      LUME_SERVICE_UUID,
      LUME_PAYLOAD_CHAR_UUID,
      encodeUtf8ToBytes(encodePayload(payload)),
    );
  } catch {
    // no-op
  }
}

export async function refreshBleBroadcastPayload() {
  if ((!started && !starting) || stopping) {
    return;
  }

  try {
    ensureBleIdentityReady();
    await startPeripheralAdvertising();
  } catch {
    // Keep app stable if the broadcast refresh races with BLE transitions.
  }
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

    const incomingPingToken = Math.max(0, Math.floor(payload.pingToken ?? 0));
    const previousPingToken = lastSeenPingTokenByProfile.get(payload.profileId) ?? 0;
    if (incomingPingToken > 0 && incomingPingToken !== previousPingToken) {
      lastSeenPingTokenByProfile.set(payload.profileId, incomingPingToken);

      emitProximityPing({
        profileId: payload.profileId,
        lumeId: payload.lumeId,
        receivedAt: new Date().toISOString(),
      });

      if (AppState.currentState === 'active') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
          // no-op
        });
      } else {
        void notifyProximityWave(payload.lumeId);
      }
    }

    const alreadyStored = localRepo.hasEncounterForMessageDay(
      session.profileId,
      payload.profileId,
      payload.messageDate,
    );

    if (alreadyStored) {
      return;
    }

    const encounterCoordinates = await getBestEffortEncounterCoordinates();
    const encounterId = newUuid();
    localRepo.addEncounter({
      id: encounterId,
      observerProfileId: session.profileId,
      observedProfileId: payload.profileId,
      observedMessageBody: payload.dailyMessage,
      observedMessageDate: payload.messageDate,
      observedPinType: payload.pinType,
      observedRippleCount: payload.rippleCount,
      originalSenderId: payload.originalSenderId,
      observedAuraColor: payload.auraColor,
      observedVoiceSpark: payload.voiceSpark,
      observedRadianceScore: payload.radianceScore,
      happenedAt: new Date().toISOString(),
      encounterLatitude: encounterCoordinates?.latitude ?? null,
      encounterLongitude: encounterCoordinates?.longitude ?? null,
      rssi,
      pendingSync: true,
      seen: false,
      pinned: false,
      reportHits: 0,
      reported: false,
      deleted: false,
    });

    if (AppState.currentState === 'active') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        // no-op
      });
    }

    localRepo.queue({
      id: newId('out_'),
      opType: 'insert_encounter',
      tableName: 'encounters',
      payloadJson: JSON.stringify({
        id: encounterId,
        observer_profile_id: session.profileId,
        observed_profile_id: payload.profileId,
        observed_message_body: payload.dailyMessage,
        observed_message_date: payload.messageDate,
        observed_pin_type: payload.pinType,
        observed_ripple_count: Math.max(0, Math.floor(payload.rippleCount ?? 0)),
        original_sender_id: payload.originalSenderId,
        observed_aura_color: payload.auraColor,
        observed_voice_spark: payload.voiceSpark,
        observed_radiance_score: payload.radianceScore,
        happened_at: new Date().toISOString(),
        rssi,
      }),
      createdAt: new Date().toISOString(),
    });

    const unseenCount = localRepo.countUnseenEncounters(session.profileId);
    void notifyEchoReceived(unseenCount, payload.dailyMessage);

    if (payload.originalSenderId === session.profileId && payload.profileId !== session.profileId) {
      void notifyRippleCarriedBySomeone(payload.lumeId, payload.dailyMessage);
    }
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

  refreshRadarScanConfigFromProfile();

  await BleManager.scan([LUME_SERVICE_UUID], activeScanConfig.scanSeconds, true, {
    scanMode: Platform.OS === 'android' ? 2 : undefined,
    matchMode: Platform.OS === 'android' ? 1 : undefined,
  });
}

function addBleListeners() {
  subscriptions.push(
    bleEmitter.addListener('BleManagerDiscoverPeripheral', (peripheral: { id?: string; rssi?: number }) => {
      const rssi = typeof peripheral.rssi === 'number' ? peripheral.rssi : null;
      if (rssi !== null && rssi < activeScanConfig.minRssi) return;
      if (!peripheral?.id) return;

      exchangePayloadWithDiscoveredDevice(peripheral.id, rssi);
    }),
  );

  subscriptions.push(
    bleEmitter.addListener('BleManagerStopScan', () => {
      if (!started || starting || stopping) {
        return;
      }

      startCentralScanning().catch(() => {
        // no-op
      });
    }),
  );
}

export async function startBleBackgroundLoop() {
  if (stopping) {
    await wait(250);
  }

  if (started || starting) return;
  starting = true;
  stopping = false;

  try {
    ensureBleIdentityReady();

    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        if (stopping) {
          throw new Error('Radar is stopping');
        }

        try {
          await BleManager.start({ showAlert: false });
        } catch {
          // Native module may already be initialized; continue startup.
        }

        if (stopping) {
          throw new Error('Radar is stopping');
        }

        for (const sub of subscriptions) {
          sub.remove();
        }
        subscriptions = [];

        addBleListeners();
        await startPeripheralAdvertising();

        if (stopping) {
          throw new Error('Radar is stopping');
        }

        await startCentralScanning();

        if (stopping) {
          throw new Error('Radar is stopping');
        }

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
  stopping = true;
  starting = false;
  started = false;

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

  lastSeenPingTokenByProfile.clear();

  stopping = false;
}
