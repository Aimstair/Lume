import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { PermissionState } from '../types/domain';

type AndroidPermission = string | undefined;
type KnownAndroidPermission = (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

function isAndroid() {
  return Platform.OS === 'android';
}

async function hasAndroidPermission(permission: AndroidPermission) {
  if (!isAndroid()) return true;
  if (!permission) return true;
  return PermissionsAndroid.check(permission as KnownAndroidPermission);
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

  const bluetoothGranted =
    (await hasAndroidPermission(perms.bluetoothScan)) &&
    (await hasAndroidPermission(perms.bluetoothConnect)) &&
    (await hasAndroidPermission(perms.bluetoothAdvertise));

  const locationGranted = await hasAndroidPermission(perms.location);
  const notificationGranted = await hasAndroidPermission(perms.notification);

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
  const bluetoothGranted = await requestBluetoothPermissions();
  const locationGranted = await requestLocationPermission();

  if (!bluetoothGranted || !locationGranted) {
    Alert.alert(
      'Permissions needed',
      'Radar needs Bluetooth and Location. You can keep using Lume without Radar, and enable permissions later.',
    );
    return false;
  }

  return true;
}
