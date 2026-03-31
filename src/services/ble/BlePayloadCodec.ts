import { MessagePinType } from '../../types/domain';

export type LumePayload = {
  lumeId: string;
  profileId: string;
  radianceScore: number;
  dailyMessage: string;
  messageDate: string;
  pinType: MessagePinType;
  rippleCount: number;
  originalSenderId: string | null;
  auraColor: string | null;
  voiceSpark: string | null;
  pingToken?: number;
};

function pinTypeCode(pinType: MessagePinType) {
  if (pinType === 'star') {
    return 2;
  }

  if (pinType === 'crystal') {
    return 3;
  }

  return 1;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.floor(value)));
}

function hashSignalTag(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 251;
  }

  return hash + 1;
}

export function buildAdvertisementPreviewBytes(input: {
  pinType: MessagePinType;
  radianceScore: number;
  rippleCount: number;
  auraColor?: string | null;
  voiceSpark?: string | null;
}) {
  const clampedRadiance = Math.max(0, Math.min(65535, Math.floor(input.radianceScore)));
  const radianceHigh = (clampedRadiance >> 8) & 0xff;
  const radianceLow = clampedRadiance & 0xff;

  return [
    0x4c,
    0x55,
    0x4d,
    0x45,
    pinTypeCode(input.pinType),
    radianceHigh,
    radianceLow,
    clampByte(input.rippleCount),
    hashSignalTag(input.auraColor),
    hashSignalTag(input.voiceSpark),
  ];
}

export function encodePayload(input: LumePayload): string {
  return JSON.stringify({
    lumeId: input.lumeId,
    profileId: input.profileId,
    radianceScore: input.radianceScore,
    dailyMessage: input.dailyMessage.slice(0, 280),
    messageDate: input.messageDate,
    pinType: input.pinType,
    rippleCount: Math.max(0, Math.floor(input.rippleCount)),
    originalSenderId: input.originalSenderId,
    auraColor: input.auraColor ? String(input.auraColor).slice(0, 24) : null,
    voiceSpark: input.voiceSpark ? String(input.voiceSpark).slice(0, 24) : null,
    pingToken: Math.max(0, Math.floor(Number(input.pingToken ?? 0))),
  });
}

export function decodePayload(json: string): LumePayload | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.lumeId || !parsed.profileId) return null;
    return {
      lumeId: String(parsed.lumeId),
      profileId: String(parsed.profileId),
      radianceScore: Number(parsed.radianceScore ?? 0),
      dailyMessage: String(parsed.dailyMessage ?? '').slice(0, 280),
      messageDate: String(parsed.messageDate ?? new Date().toISOString().slice(0, 10)),
      pinType: (parsed.pinType === 'star' || parsed.pinType === 'crystal' ? parsed.pinType : 'classic') as MessagePinType,
      rippleCount: Math.max(0, Number(parsed.rippleCount ?? 0)),
      originalSenderId: parsed.originalSenderId ? String(parsed.originalSenderId) : null,
      auraColor: parsed.auraColor ? String(parsed.auraColor) : null,
      voiceSpark: parsed.voiceSpark ? String(parsed.voiceSpark) : null,
      pingToken: Math.max(0, Number(parsed.pingToken ?? 0)),
    };
  } catch {
    return null;
  }
}
