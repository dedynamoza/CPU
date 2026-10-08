let serverOffsetMs = 0;

/**
 * Updates the estimated offset between client local clock and Firestore server timestamp
 */
export function updateServerOffset(serverDate: Date) {
  const localNow = Date.now();
  serverOffsetMs = serverDate.getTime() - localNow;
}

export function getServerSyncedNow(): number {
  return Date.now() + serverOffsetMs;
}

export function getRemainingSeconds(expiresAt: any): number {
  if (!expiresAt) return 0;
  let targetMillis = 0;
  if (typeof expiresAt.toMillis === 'function') {
    targetMillis = expiresAt.toMillis();
  } else if (expiresAt instanceof Date) {
    targetMillis = expiresAt.getTime();
  } else if (typeof expiresAt === 'number') {
    targetMillis = expiresAt;
  } else if (typeof expiresAt === 'string') {
    targetMillis = new Date(expiresAt).getTime();
  } else if (expiresAt.seconds) {
    targetMillis = expiresAt.seconds * 1000;
  }

  const remaining = Math.max(0, Math.floor((targetMillis - getServerSyncedNow()) / 1000));
  return remaining;
}

export function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
