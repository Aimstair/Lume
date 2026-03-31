import { Linking, PermissionsAndroid, Platform } from 'react-native';
import BleManager, { BleState } from 'react-native-ble-manager';
import * as Location from 'expo-location';
import { PermissionState } from '../types/domain';
import { presentAppModal } from './appModal';

type AndroidPermission = string | undefined;
type KnownAndroidPermission = (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

let bleManagerReady = false;

function isAndroid() {
  return Platform.OS === 'android';
}

async function hasAndroidPermission(permission: AndroidPermission) {
  if (!isAndroid()) return true;
  if (!permission) return true;
  return PermissionsAndroid.check(permission as KnownAndroidPermission);
}

async function ensureBleManagerReady() {
  if (!isAndroid() || bleManagerReady) return;

  try {
    await BleManager.start({ showAlert: false });
  } catch {
    // Keep permission flows resilient even if BLE init races.
  }

  bleManagerReady = true;
}

async function isBluetoothServiceEnabled() {
  if (!isAndroid()) return true;

  try {
    await ensureBleManagerReady();
    const state = await BleManager.checkState();
    return state === BleState.On;
  } catch {
    return false;
  }
}

async function requestBluetoothServiceEnable() {
  if (!isAndroid()) return true;

  if (await isBluetoothServiceEnabled()) {
    return true;
  }

  try {
    await ensureBleManagerReady();
    await BleManager.enableBluetooth();
  } catch {
    // User can cancel the OS dialog. We'll verify final state below.
  }

  if (await isBluetoothServiceEnabled()) {
    return true;
  }

  presentAppModal({
    title: 'Bluetooth is off',
    message: 'Turn on Bluetooth to use Radar and nearby exchange.',
    actions: [
      {
        label: 'Not now',
        role: 'cancel',
      },
      {
        label: 'Open settings',
        role: 'default',
        onPress: () => {
          void openAndroidSettingsIntent('android.settings.BLUETOOTH_SETTINGS');
        },
      },
    ],
  });

  return false;
}

async function isLocationServicesEnabled() {
  if (!isAndroid()) return true;

  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

async function openAndroidSettingsIntent(intentAction: string) {
  if (!isAndroid()) {
    await Linking.openSettings();
    return;
  }

  try {
    await Linking.sendIntent(intentAction);
  } catch {
    await Linking.openSettings();
  }
}

async function ensureLocationServicesEnabled() {
  if (!isAndroid()) return true;

  if (await isLocationServicesEnabled()) {
    return true;
  }

  presentAppModal({
    title: 'Location services are off',
    message: 'Turn on device Location services to discover nearby Lume users.',
    actions: [
      {
        label: 'Not now',
        role: 'cancel',
      },
      {
        label: 'Open settings',
        role: 'default',
        onPress: () => {
          void openAndroidSettingsIntent('android.settings.LOCATION_SOURCE_SETTINGS');
        },
      },
    ],
  });

  return false;
}

async function requestAndroidPermission(permission: AndroidPermission, title: string, message: string) {
  if (!isAndroid()) return true;
  if (!permission) return true;

  const resolvedPermission = permission as KnownAndroidPermission;
  const alreadyGranted = await PermissionsAndroid.check(resolvedPermission);
  if (alreadyGranted) return true;

  const result = await PermissionsAndroid.request(resolvedPermission, {
    title,
    message,
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function androidPermissions() {
  return {
    bluetoothScan: PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    bluetoothConnect: PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    bluetoothAdvertise: PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    location: PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    notification: PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  };
}

export async function getPermissionState(): Promise<PermissionState> {
  const perms = androidPermissions();

  const bluetoothPermissionGranted =
    (await hasAndroidPermission(perms.bluetoothScan)) &&
    (await hasAndroidPermission(perms.bluetoothConnect)) &&
    (await hasAndroidPermission(perms.bluetoothAdvertise));
  const locationPermissionGranted = await hasAndroidPermission(perms.location);
  const notificationGranted = await hasAndroidPermission(perms.notification);

  const bluetoothGranted = bluetoothPermissionGranted && (await isBluetoothServiceEnabled());
  const locationGranted = locationPermissionGranted && (await isLocationServicesEnabled());

  return {
    bluetoothGranted,
    locationGranted,
    notificationGranted,
  };
}

export async function requestBluetoothPermissions() {
  const perms = androidPermissions();
  const scan = await requestAndroidPermission(
    perms.bluetoothScan,
    'Allow Bluetooth scanning',
    'Lume scans nearby devices to discover local messages.',
  );
  const connect = await requestAndroidPermission(
    perms.bluetoothConnect,
    'Allow Bluetooth connection',
    'Lume connects to nearby devices to exchange daily messages.',
  );
  const advertise = await requestAndroidPermission(
    perms.bluetoothAdvertise,
    'Allow Bluetooth advertising',
    'Lume broadcasts your Lume ID to nearby people.',
  );

  return scan && connect && advertise;
}

export async function requestLocationPermission() {
  return requestAndroidPermission(
    androidPermissions().location,
    'Allow Location',
    'Android requires location permission for Bluetooth discovery.',
  );
}

export async function requestNotificationPermission() {
  return requestAndroidPermission(
    androidPermissions().notification,
    'Allow Notifications',
    'Lume uses notifications for encounter and sync updates.',
  );
}

export async function requestRadarPermissions() {
  const bluetoothPermissionGranted = await requestBluetoothPermissions();
  const locationPermissionGranted = await requestLocationPermission();

  if (!bluetoothPermissionGranted || !locationPermissionGranted) {
    presentAppModal({
      title: 'Permissions needed',
      message:
        'Radar needs Bluetooth and Location. You can keep using Lume without Radar, and enable permissions later.',
    });
    return false;
  }

  const bluetoothEnabled = await requestBluetoothServiceEnable();
  if (!bluetoothEnabled) {
    return false;
  }

  const locationEnabled = await ensureLocationServicesEnabled();
  if (!locationEnabled) {
    return false;
  }

  const state = await getPermissionState();
  if (!state.bluetoothGranted || !state.locationGranted) {
    presentAppModal({
      title: 'Permissions needed',
      message: 'Radar requires Bluetooth and Location to be turned on in your device settings.',
    });
    return false;
  }

  return true;
}
