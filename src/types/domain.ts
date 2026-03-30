export type Profile = {
  id: string;
  lumeId: string;
  displayName: string | null;
  radianceScore: number;
  createdAt: string;
};

export type DailyMessage = {
  id: string;
  profileId: string;
  body: string;
  messageDate: string;
  createdAt: string;
  updatedAt: string;
  pendingSync: boolean;
};

export type Encounter = {
  id: string;
  observerProfileId: string;
  observedProfileId: string;
  observedMessageBody: string;
  observedMessageDate: string;
  observedRadianceScore: number;
  happenedAt: string;
  rssi: number | null;
  pendingSync: boolean;
  seen: boolean;
  pinned: boolean;
  reported: boolean;
  deleted: boolean;
};

export type PermissionState = {
  bluetoothGranted: boolean;
  locationGranted: boolean;
  notificationGranted: boolean;
};
