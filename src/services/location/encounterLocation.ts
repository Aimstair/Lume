import * as Location from 'expo-location';

type EncounterCoordinates = {
  latitude: number;
  longitude: number;
};

const LOCATION_CACHE_TTL_MS = 45_000;

let cachedCoordinates: EncounterCoordinates | null = null;
let cacheTimestamp = 0;

function roundCoordinate(value: number) {
  return Number(value.toFixed(6));
}

export async function getBestEffortEncounterCoordinates(): Promise<EncounterCoordinates | null> {
  const now = Date.now();

  if (cachedCoordinates && now - cacheTimestamp < LOCATION_CACHE_TTL_MS) {
    return cachedCoordinates;
  }

  try {
    const lastKnown = await Location.getLastKnownPositionAsync();
    const coords = lastKnown?.coords;

    if (coords) {
      const nextCoords = {
        latitude: roundCoordinate(coords.latitude),
        longitude: roundCoordinate(coords.longitude),
      };
      cachedCoordinates = nextCoords;
      cacheTimestamp = now;
      return nextCoords;
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    if (!current?.coords) {
      return null;
    }

    const nextCoords = {
      latitude: roundCoordinate(current.coords.latitude),
      longitude: roundCoordinate(current.coords.longitude),
    };
    cachedCoordinates = nextCoords;
    cacheTimestamp = now;
    return nextCoords;
  } catch {
    return null;
  }
}
