export type Profile = {
  id: string;
  lumeId: string;
  displayName: string | null;
  displayNameChangedAt: string | null;
  radianceScore: number;
  createdAt: string;
};

export type MessagePinType = 'classic' | 'star' | 'crystal';

export type DailyMessage = {
  id: string;
  profileId: string;
  body: string;
  messageDate: string;
  pinType: MessagePinType;
  rippleCount: number;
  originalSenderId: string | null;
  auraColor: string | null;
  voiceSpark: string | null;
  createdAt: string;
  updatedAt: string;
  pendingSync: boolean;
};

export type Message = DailyMessage;

export type Encounter = {
  id: string;
  observerProfileId: string;
  observedProfileId: string;
  observedMessageBody: string;
  observedMessageDate: string;
  observedPinType: MessagePinType;
  observedRippleCount: number;
  originalSenderId: string | null;
  observedAuraColor: string | null;
  observedVoiceSpark: string | null;
  observedRadianceScore: number;
  happenedAt: string;
  encounterLatitude: number | null;
  encounterLongitude: number | null;
  rssi: number | null;
  pendingSync: boolean;
  seen: boolean;
  pinned: boolean;
  reportHits: number;
  reported: boolean;
  deleted: boolean;
};

export type PermissionState = {
  bluetoothGranted: boolean;
  locationGranted: boolean;
  notificationGranted: boolean;
};
