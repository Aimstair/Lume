import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { LocateFixed, RefreshCw } from 'lucide-react-native';
import { useEncounterFeed } from '../hooks/useEchoInbox';
import { getPermissionState, requestLocationPermission } from '../services/permissions';
import { Encounter } from '../types/domain';

type Coordinates = {
  latitude: number;
  longitude: number;
};

type EncounterPin = {
  id: string;
  latitude: number;
  longitude: number;
  happenedAt: string;
  senderId: string;
  preview: string;
  isNewToday: boolean;
};

const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveEncounterCoordinates(encounter: Encounter) {
  const hasStoredCoords =
    typeof encounter.encounterLatitude === 'number' &&
    Number.isFinite(encounter.encounterLatitude) &&
    typeof encounter.encounterLongitude === 'number' &&
    Number.isFinite(encounter.encounterLongitude);

  if (!hasStoredCoords) {
    return null;
  }

  return {
    latitude: clamp(encounter.encounterLatitude as number, -85, 85),
    longitude: clamp(encounter.encounterLongitude as number, -180, 180),
  };
}

function formatWhen(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isToday(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const now = new Date();
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  );
}

export function MapsScreen() {
  const encounters = useEncounterFeed();
  const cameraRef = React.useRef<Mapbox.Camera>(null);
  const locatingRef = React.useRef(false);

  const [currentLocation, setCurrentLocation] = React.useState<Coordinates | null>(null);
  const [isLocateButtonBusy, setIsLocateButtonBusy] = React.useState(false);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [selectedPin, setSelectedPin] = React.useState<EncounterPin | null>(null);

  const hasMapboxToken = Boolean(MAPBOX_ACCESS_TOKEN);

  const refreshLocation = React.useCallback(
    async ({
      requestPermissionFirst = false,
      showButtonBusy = false,
    }: {
      requestPermissionFirst?: boolean;
      showButtonBusy?: boolean;
    } = {}) => {
      if (locatingRef.current) {
        return;
      }

      locatingRef.current = true;
      if (showButtonBusy) {
        setIsLocateButtonBusy(true);
      }

      try {
        if (requestPermissionFirst) {
          const granted = await requestLocationPermission();
          if (!granted) {
            setLocationError('Location permission is needed to place your live position on the map.');
            return;
          }
        }

        const permissionState = await getPermissionState();
        if (!permissionState.locationGranted) {
          setCurrentLocation(null);
          setLocationError('Location services are off. Enable Location to place your live marker.');
          return;
        }

        const lastKnown = await Location.getLastKnownPositionAsync();
        const position =
          lastKnown ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));

        if (!position?.coords) {
          setCurrentLocation(null);
          setLocationError('Could not determine your current location yet.');
          return;
        }

        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationError(null);
      } catch {
        setCurrentLocation(null);
        setLocationError('Unable to load location right now.');
      } finally {
        locatingRef.current = false;
        if (showButtonBusy) {
          setIsLocateButtonBusy(false);
        }
      }
    },
    [],
  );

  React.useEffect(() => {
    void refreshLocation({ showButtonBusy: false });
  }, [refreshLocation]);

  React.useEffect(() => {
    let watcher: Location.LocationSubscription | null = null;
    let cancelled = false;

    const startWatcher = async () => {
      const permissionState = await getPermissionState();
      if (!permissionState.locationGranted) {
        return;
      }

      watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 15_000,
          distanceInterval: 15,
        },
        (nextLocation) => {
          if (cancelled || !nextLocation.coords) {
            return;
          }

          setCurrentLocation({
            latitude: nextLocation.coords.latitude,
            longitude: nextLocation.coords.longitude,
          });
        },
      );
    };

    startWatcher().catch(() => {
      // Keep map usable without background location watch updates.
    });

    return () => {
      cancelled = true;
      watcher?.remove();
    };
  }, []);

  const encounterPins = React.useMemo<EncounterPin[]>(() => {
    const source = encounters.data ?? [];

    return source
      .map((encounter) => {
        const coords = resolveEncounterCoordinates(encounter);
        if (!coords) {
          return null;
        }

        return {
          id: encounter.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          happenedAt: encounter.happenedAt,
          senderId: encounter.observedProfileId,
          preview: encounter.observedMessageBody,
          isNewToday: isToday(encounter.happenedAt),
        };
      })
      .filter((item): item is EncounterPin => Boolean(item));
  }, [encounters.data]);

  const initialCenter = React.useMemo(() => {
    if (currentLocation) {
      return currentLocation;
    }

    const firstPin = encounterPins[0];
    if (firstPin) {
      return {
        latitude: firstPin.latitude,
        longitude: firstPin.longitude,
      };
    }

    return null;
  }, [currentLocation, encounterPins]);

  const centerOnMyLocation = React.useCallback(() => {
    if (!currentLocation) {
      return;
    }

    cameraRef.current?.setCamera({
      centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
      zoomLevel: 12,
      animationDuration: 700,
      animationMode: 'flyTo',
    });
  }, [currentLocation]);

  return (
    <View className="flex-1 bg-emerald-50 dark:bg-slate-950">
      {hasMapboxToken ? (
        <Mapbox.MapView
          style={{ flex: 1 }}
          styleURL={Mapbox.StyleURL.Street}
          scaleBarEnabled={false}
          logoEnabled={false}
          compassEnabled
        >
          <Mapbox.Camera
            ref={cameraRef}
            zoomLevel={initialCenter ? 10 : 2.25}
            centerCoordinate={initialCenter ? [initialCenter.longitude, initialCenter.latitude] : [0, 20]}
            animationDuration={700}
          />

          <Mapbox.UserLocation visible minDisplacement={8} />

          {encounterPins.map((pin) => (
            <Mapbox.PointAnnotation
              id={pin.id}
              key={pin.id}
              coordinate={[pin.longitude, pin.latitude]}
              onSelected={() => setSelectedPin(pin)}
            >
              <View
                className={
                  pin.isNewToday
                    ? 'h-5 w-5 rounded-full border-2 border-white bg-emerald-500'
                    : 'h-5 w-5 rounded-full border-2 border-white bg-rose-500'
                }
              />
            </Mapbox.PointAnnotation>
          ))}
        </Mapbox.MapView>
      ) : (
        <View className="flex-1 items-center justify-center bg-emerald-50 px-8 dark:bg-slate-950">
          <Text className="text-center text-sm font-semibold text-slate-900 dark:text-slate-50">
            Missing EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
          </Text>
        </View>
      )}

      <View className="absolute left-4 top-16 rounded-full border border-white/80 bg-emerald-500/90 px-3 py-1">
        <View className="flex-row items-center">
          <View className="h-2.5 w-2.5 rounded-full bg-white" />
          <Text className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-white">New Today</Text>
        </View>
      </View>

      <View className="absolute left-4 top-28 rounded-full border border-white/80 bg-rose-500/90 px-3 py-1">
        <View className="flex-row items-center">
          <View className="h-2.5 w-2.5 rounded-full bg-white" />
          <Text className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-white">Older</Text>
        </View>
      </View>

      <View className="absolute right-4 top-1/3">
        <Pressable
          className="mb-3 h-12 w-12 items-center justify-center rounded-full border border-white bg-white/95 shadow-sm"
          onPress={() => {
            void refreshLocation({ showButtonBusy: true });
            centerOnMyLocation();
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
          disabled={isLocateButtonBusy}
        >
          {isLocateButtonBusy ? <ActivityIndicator size="small" color="#10b981" /> : <LocateFixed size={18} color="#10b981" />}
        </Pressable>

        <Pressable
          className="h-12 w-12 items-center justify-center rounded-full border border-white bg-white/95 shadow-sm"
          onPress={() => void refreshLocation({ showButtonBusy: false })}
          style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
        >
          <RefreshCw size={18} color="#10b981" />
        </Pressable>
      </View>

      {locationError ? (
        <View className="absolute inset-x-4 bottom-40 rounded-2xl border border-amber-300/40 bg-amber-50 px-4 py-3 dark:border-amber-300/20 dark:bg-amber-400/10">
          <Text className="text-sm text-amber-800 dark:text-amber-200">{locationError}</Text>
          <Pressable
            className="mt-3 min-h-11 self-start rounded-xl border border-amber-400/40 bg-amber-400/20 px-3 py-2"
            onPress={() => void refreshLocation({ requestPermissionFirst: true, showButtonBusy: true })}
            style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
          >
            <Text className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-200">Enable Location</Text>
          </Pressable>
        </View>
      ) : null}

      {selectedPin ? (
        <View className="absolute inset-x-4 bottom-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <Text className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-300">
            {selectedPin.isNewToday ? 'New Today' : 'Encounter'}
          </Text>
          <Text className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
            From {selectedPin.senderId}
          </Text>
          <Text className="mt-1 text-xs text-slate-500 dark:text-slate-300">{formatWhen(selectedPin.happenedAt)}</Text>
          <Text className="mt-3 text-base leading-6 text-slate-800 dark:text-slate-100">{selectedPin.preview}</Text>

          <Pressable
            onPress={() => setSelectedPin(null)}
            className="mt-4 min-h-11 self-start rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
          >
            <Text className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">Close</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
