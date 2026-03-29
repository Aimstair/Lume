# Lume Architecture (Offline-First + BLE)

## 1) Supabase-First Cloud Schema
- SQL is in `supabase/schema.sql`.
- Tables:
  - `profiles` (includes `radiance_score`)
  - `messages` (daily unique via `(profile_id, message_date)` unique key)
  - `encounters` (observer/observed junction with observed message snapshot)
  - `message_reactions` (heart reactions)
- Trigger logic:
  - `public.apply_radiance_delta_for_reaction()` adds `+5` for heart inserts.
  - Handles updates/deletes safely so score stays consistent.

## 2) Navigation Structure (React Navigation)
Defined in `src/app/navigation.tsx`:

- Root Stack
  - `Onboarding`
  - `MainTabs`
- Main Tabs
  - `Home` (Aura + daily message + Radar toggle)
  - `EchoFeed` (nearby message cards + pending sync badge)
  - `Profile` (Radiance progress + impact stats)

## 3) Offline-First Local Data Layer
- Local SQLite database in `src/db/localDb.ts` using `react-native-quick-sqlite`.
- All writes hit local DB first via `src/db/repositories.ts`:
  - `local_messages`
  - `local_encounters`
  - `local_profiles`
  - `sync_outbox` (queued cloud writes)
- Sync engine (`src/services/sync/syncEngine.ts`):
  - Watches connectivity with NetInfo.
  - Pushes outbox ops to Supabase when online.
  - Marks local rows as synced on success.

## 4) BLE Background Service (Headless)
- Headless task entrypoint: `index.js` (`LumeBleHeadlessTask`).
- Logic:
  - Peripheral mode: advertises Lume ID.
  - Central mode: scans nearby Lume service UUID.
  - On discovery: connects, reads payload characteristic, stores encounter locally, queues sync.
- Files:
  - `src/services/ble/BleBackgroundService.ts`
  - `src/services/ble/BlePayloadCodec.ts`
  - `src/services/ble/headlessTask.ts`

## 5) Optimistic UI Writes (TanStack Query)
Implemented hooks:
- `useUpsertDailyMessage` (`src/hooks/useDailyMessageMutations.ts`)
- `useAddEncounter` (`src/hooks/useEncounterMutations.ts`)
- `useHeartReaction` (`src/hooks/useReactionMutations.ts`)

Pattern:
1. Apply optimistic cache update immediately.
2. Persist local SQLite change instantly.
3. Queue cloud mutation in `sync_outbox`.
4. Background sync flushes when internet is available.

## 6) Requested Screens
- `src/screens/HomeScreen.tsx`
- `src/screens/EchoFeedScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/screens/OnboardingScreen.tsx`

All screens are styled with NativeWind `className` utilities.

## 7) Critical Native Notes
For production BLE background behavior, add platform-specific setup:
- Android:
  - Foreground service for long-running scan/advertise.
  - `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`, location permissions.
  - Register headless task trigger from a background service/receiver.
- iOS:
  - CoreBluetooth background modes in Info.plist.
  - Background execution constraints are tighter than Android.

## 8) Install and Run
```bash
npm install
npm run android
# or
npm run ios
```
