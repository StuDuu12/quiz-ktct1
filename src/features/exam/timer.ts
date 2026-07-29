export function remainingSeconds(
  expiresAt: string,
  serverNow: Date,
): number {
  const expiresAtMs = Date.parse(expiresAt);
  const serverNowMs = serverNow.getTime();
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(serverNowMs)) {
    throw new Error("EXAM_DEADLINE_INVALID");
  }
  return Math.max(0, Math.ceil((expiresAtMs - serverNowMs) / 1000));
}
