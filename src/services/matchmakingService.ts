import {
  collection,
  doc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
  deleteDoc,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { UserProfile, VibeType } from '../types';

export interface MatchResult {
  sessionId: string;
  partnerId: string;
  partnerName: string;
  vibe: VibeType;
}

/**
 * Executes real-time random matchmaking in Firestore with transactional locking
 */
export async function startMatchmaking(
  user: UserProfile,
  blockedUserIds: string[],
  onStatusUpdate: (statusText: string) => void,
  signal: AbortSignal
): Promise<MatchResult> {
  const currentUid = user.uid;
  onStatusUpdate('Scanning for active strangers...');

  // Step 1: Look for waiting users with the same vibe first
  let candidates: { uid: string; displayName: string; vibe: VibeType }[] = [];

  try {
    const sameVibeQuery = query(
      collection(db, 'matchQueue'),
      where('status', '==', 'waiting'),
      where('vibe', '==', user.vibe)
    );
    const snap = await getDocs(sameVibeQuery);
    snap.forEach((d) => {
      const data = d.data();
      if (data.uid !== currentUid && !blockedUserIds.includes(data.uid)) {
        candidates.push({
          uid: data.uid,
          displayName: data.displayName || 'Stranger',
          vibe: data.vibe,
        });
      }
    });

    // If no same-vibe user, fallback to any vibe
    if (candidates.length === 0) {
      const anyVibeQuery = query(
        collection(db, 'matchQueue'),
        where('status', '==', 'waiting')
      );
      const anySnap = await getDocs(anyVibeQuery);
      anySnap.forEach((d) => {
        const data = d.data();
        if (data.uid !== currentUid && !blockedUserIds.includes(data.uid)) {
          candidates.push({
            uid: data.uid,
            displayName: data.displayName || 'Stranger',
            vibe: data.vibe,
          });
        }
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'matchQueue');
  }

  if (signal.aborted) {
    throw new Error('Matchmaking cancelled by user');
  }

  // Step 2: Try to match with an existing waiting candidate via Transaction
  for (const candidate of candidates) {
    try {
      onStatusUpdate(`Connecting with ${candidate.displayName}...`);
      const candidateRef = doc(db, 'matchQueue', candidate.uid);
      const randomSessionId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const sessionRef = doc(db, 'chatSessions', randomSessionId);

      const matched = await runTransaction(db, async (transaction) => {
        const candidateDoc = await transaction.get(candidateRef);
        if (!candidateDoc.exists() || candidateDoc.data().status !== 'waiting') {
          return null; // Candidate was claimed by someone else or cancelled
        }

        const candidateData = candidateDoc.data();
        const expiresAtDate = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // 1. Create chat session
        transaction.set(sessionRef, {
          sessionId: randomSessionId,
          userA: candidate.uid,
          userB: currentUid,
          userAName: candidateData.displayName || 'Stranger',
          userBName: user.displayName,
          vibe: user.vibe,
          status: 'active',
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiresAtDate),
        });

        // 2. Mark candidate as matched
        transaction.update(candidateRef, {
          status: 'matched',
          matchedSessionId: randomSessionId,
        });

        return {
          sessionId: randomSessionId,
          partnerId: candidate.uid,
          partnerName: candidateData.displayName || 'Stranger',
          vibe: user.vibe,
        };
      });

      if (matched) {
        // Successfully paired!
        return matched;
      }
    } catch (txErr) {
      console.warn('Matchmaking race condition, trying next candidate...', txErr);
    }
  }

  if (signal.aborted) {
    throw new Error('Matchmaking cancelled by user');
  }

  // Step 3: No immediate match found -> Enter queue and wait for someone else to connect
  onStatusUpdate('Waiting for a stranger to connect...');
  const myQueueRef = doc(db, 'matchQueue', currentUid);

  try {
    const queueData = {
      uid: currentUid,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
      vibe: user.vibe,
      status: 'waiting' as const,
      createdAt: serverTimestamp(),
    };
    await runTransaction(db, async (transaction) => {
      transaction.set(myQueueRef, queueData);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `matchQueue/${currentUid}`);
  }

  // Step 4: Listen to our own queue doc until matched or cancelled
  return new Promise<MatchResult>((resolve, reject) => {
    let unsub: (() => void) | null = null;
    let timeoutTimer: any = null;

    const cleanup = async () => {
      if (unsub) unsub();
      if (timeoutTimer) clearTimeout(timeoutTimer);
      try {
        await deleteDoc(myQueueRef);
      } catch {}
    };

    signal.addEventListener('abort', () => {
      cleanup();
      reject(new Error('Matchmaking cancelled by user'));
    });

    // Wait up to 45 seconds before timing out to show empty state
    timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error('NO_PARTNER_FOUND'));
    }, 45000);

    unsub = onSnapshot(
      myQueueRef,
      async (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (data.status === 'matched' && data.matchedSessionId) {
          const sessId = data.matchedSessionId;
          cleanup();
          resolve({
            sessionId: sessId,
            partnerId: 'partner',
            partnerName: 'Stranger',
            vibe: user.vibe,
          });
        }
      },
      (error) => {
        cleanup();
        handleFirestoreError(error, OperationType.GET, `matchQueue/${currentUid}`);
      }
    );
  });
}

/**
 * Removes user from queue if they cancel
 */
export async function cancelMatchmaking(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'matchQueue', uid));
  } catch (err) {
    console.warn('Queue cancellation warning:', err);
  }
}
