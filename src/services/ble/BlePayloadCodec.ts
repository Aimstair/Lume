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
};

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
    };
  } catch {
    return null;
  }
}
