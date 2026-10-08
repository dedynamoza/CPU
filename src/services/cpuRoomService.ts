import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  getDocs,
  query,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface CpuMsgData {
  id: string;
  senderId: string;
  alias: string;
  text: string;
  effect: 'normal' | 'snake' | 'bang';
  c: number;
  e: number;
}

export type SignalType = 'shake' | 'blackhole' | 'ghost';

export interface CpuSignalData {
  type: SignalType;
  senderId: string;
}

/**
 * Handle Firestore error logging
 */
function handleFsError(err: unknown, op: string, path: string) {
  console.warn(`[CPU Firestore ${op}] ${path}:`, err);
}

/**
 * Check if a CPU room already exists in Firestore
 */
export async function checkCpuRoomExists(roomId: string): Promise<boolean> {
  const cleanId = roomId.toLowerCase().trim();
  if (!cleanId) return false;
  const roomRef = doc(db, 'cpuRooms', cleanId);
  try {
    const snap = await getDoc(roomRef);
    return snap.exists();
  } catch (err) {
    handleFsError(err, 'get', `cpuRooms/${cleanId}`);
    throw err;
  }
}

/**
 * Retrieve the creator peerId of a CPU room
 */
export async function getRoomCreator(roomId: string): Promise<string | null> {
  const cleanId = roomId.toLowerCase().trim();
  if (!cleanId) return null;
  const roomRef = doc(db, 'cpuRooms', cleanId);
  try {
    const snap = await getDoc(roomRef);
    if (snap.exists()) {
      return snap.data()?.createdBy || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a new CPU room in Firestore with creator peerId
 */
export async function createCpuRoom(
  roomId: string,
  hostPeerId: string
): Promise<{ success: boolean; alreadyExists?: boolean; error?: string }> {
  const cleanId = roomId.toLowerCase().trim();
  if (!cleanId) return { success: false, error: 'Kode ruang tidak boleh kosong.' };
  const roomRef = doc(db, 'cpuRooms', cleanId);

  try {
    const snap = await getDoc(roomRef);
    if (snap.exists()) {
      return { success: false, alreadyExists: true, error: 'Ruangan sudah pernah dibuat sebelumnya.' };
    }

    await setDoc(roomRef, {
      roomId: cleanId,
      createdBy: hostPeerId,
      createdAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
    });

    return { success: true };
  } catch (err: any) {
    handleFsError(err, 'create', `cpuRooms/${cleanId}`);
    return { success: false, error: err?.message || 'Gagal membuat ruang di server.' };
  }
}

/**
 * Update room lastActivity timestamp when active
 */
export async function updateCpuRoomActivity(roomId: string): Promise<void> {
  const cleanId = roomId.toLowerCase().trim();
  if (!cleanId) return;
  const roomRef = doc(db, 'cpuRooms', cleanId);
  try {
    await updateDoc(roomRef, {
      lastActivity: serverTimestamp(),
    });
  } catch {
    // Fallback if document not found or schema mismatch
  }
}

/**
 * Touch or create the room in Firestore (backward compatibility)
 */
export async function touchCpuRoom(roomId: string): Promise<void> {
  const cleanId = roomId.toLowerCase().trim();
  const roomRef = doc(db, 'cpuRooms', cleanId);
  try {
    await setDoc(
      roomRef,
      {
        roomId: cleanId,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFsError(err, 'write', `cpuRooms/${cleanId}`);
  }
}

/**
 * Send an ephemeral message to a CPU room in Firestore
 */
export async function sendCpuMessage(roomId: string, msg: CpuMsgData): Promise<void> {
  const cleanId = roomId.toLowerCase().trim();
  const msgDocRef = doc(db, 'cpuRooms', cleanId, 'messages', msg.id);
  const now = Date.now();
  const expireDate = new Date(msg.e || now + 30000);

  try {
    await setDoc(msgDocRef, {
      id: msg.id,
      senderId: msg.senderId,
      alias: msg.alias,
      text: msg.text.slice(0, 280),
      effect: msg.effect,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expireDate),
    });
  } catch (err) {
    handleFsError(err, 'create', `cpuRooms/${cleanId}/messages/${msg.id}`);
  }
}

/**
 * Broadcast a real-time signal to the room (/shake, /blackhole, /ghost)
 */
export async function sendCpuSignal(roomId: string, type: SignalType, senderId: string): Promise<void> {
  const cleanId = roomId.toLowerCase().trim();
  const sigId = 'sig_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const sigRef = doc(db, 'cpuRooms', cleanId, 'signals', sigId);

  try {
    await setDoc(sigRef, {
      type,
      senderId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFsError(err, 'create', `cpuRooms/${cleanId}/signals/${sigId}`);
  }
}

/**
 * Send presence heartbeat for an anonymous peer
 */
export async function sendPeerHeartbeat(roomId: string, peerId: string, alias: string): Promise<void> {
  const cleanId = roomId.toLowerCase().trim();
  const peerRef = doc(db, 'cpuRooms', cleanId, 'peers', peerId);

  try {
    await setDoc(
      peerRef,
      {
        peerId,
        alias,
        lastSeen: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFsError(err, 'write', `cpuRooms/${cleanId}/peers/${peerId}`);
  }
}

/**
 * Remove peer presence when leaving room
 */
export async function removePeerPresence(roomId: string, peerId: string): Promise<void> {
  const cleanId = roomId.toLowerCase().trim();
  const peerRef = doc(db, 'cpuRooms', cleanId, 'peers', peerId);

  try {
    await deleteDoc(peerRef);
  } catch (err) {
    handleFsError(err, 'delete', `cpuRooms/${cleanId}/peers/${peerId}`);
  }
}

/**
 * Delete a specific message once expired from Firestore
 */
export async function deleteExpiredMessage(roomId: string, messageId: string): Promise<void> {
  const cleanId = roomId.toLowerCase().trim();
  const msgRef = doc(db, 'cpuRooms', cleanId, 'messages', messageId);
  try {
    await deleteDoc(msgRef);
  } catch (err) {
    handleFsError(err, 'delete', `cpuRooms/${cleanId}/messages/${messageId}`);
  }
}

/**
 * Clean up old messages in Firestore
 */
export async function cleanOldMessagesInRoom(roomId: string): Promise<void> {
  const cleanId = roomId.toLowerCase().trim();
  try {
    const msgsColl = collection(db, 'cpuRooms', cleanId, 'messages');
    const snap = await getDocs(query(msgsColl, limit(20)));
    const now = Date.now();
    snap.forEach((d) => {
      const data = d.data();
      const exp = data.expiresAt ? data.expiresAt.toMillis() : 0;
      if (exp > 0 && exp <= now) {
        deleteDoc(d.ref).catch(() => {});
      }
    });
  } catch (err) {
    handleFsError(err, 'list', `cpuRooms/${cleanId}/messages`);
  }
}

/**
 * Subscribe to real-time room events (messages, signals, and peers)
 */
export function subscribeToCpuRoom(
  roomId: string,
  myPeerId: string,
  onMessage: (msg: CpuMsgData, isMine: boolean) => void,
  onSignal: (sig: CpuSignalData) => void,
  onPeerCount: (count: number) => void
): () => void {
  const cleanId = roomId.toLowerCase().trim();
  const joinTimestamp = Date.now();
  const unsubscribers: (() => void)[] = [];

  // 1. Subscribe to messages
  const msgsColl = collection(db, 'cpuRooms', cleanId, 'messages');
  const unsubMsgs = onSnapshot(
    msgsColl,
    (snapshot) => {
      const now = Date.now();
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const createdAtMillis = data.createdAt?.toMillis ? data.createdAt.toMillis() : now;
          const expiresAtMillis = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : now + 30000;

          // Abaikan pesan yang sudah kedaluwarsa sebelum kita terima
          if (expiresAtMillis <= now) {
            deleteDoc(change.doc.ref).catch(() => {});
            return;
          }

          const msg: CpuMsgData = {
            id: data.id || change.doc.id,
            senderId: data.senderId || 'anon',
            alias: data.alias || 'CEPU',
            text: data.text || '',
            effect: data.effect || 'normal',
            c: createdAtMillis,
            e: expiresAtMillis,
          };

          const isMine = msg.senderId === myPeerId;
          onMessage(msg, isMine);
        }
      });
    },
    (err) => {
      handleFsError(err, 'list', `cpuRooms/${cleanId}/messages`);
    }
  );
  unsubscribers.push(unsubMsgs);

  // 2. Subscribe to signals (/shake, /blackhole, /ghost)
  const signalsColl = collection(db, 'cpuRooms', cleanId, 'signals');
  const unsubSignals = onSnapshot(
    signalsColl,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const senderId = data.senderId;
          const createdAtMillis = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();

          // Hanya eksekusi sinyal jika dibuat setelah kita join (atau maksimal 3 detik lalu)
          if (createdAtMillis >= joinTimestamp - 3000) {
            if (senderId !== myPeerId) {
              onSignal({
                type: data.type,
                senderId: data.senderId,
              });
            }
          }

          // Hapus dokumen sinyal setelah 6 detik agar tidak menumpuk
          setTimeout(() => {
            deleteDoc(change.doc.ref).catch(() => {});
          }, 6000);
        }
      });
    },
    (err) => {
      handleFsError(err, 'list', `cpuRooms/${cleanId}/signals`);
    }
  );
  unsubscribers.push(unsubSignals);

  // 3. Subscribe to peers presence
  const peersColl = collection(db, 'cpuRooms', cleanId, 'peers');
  const unsubPeers = onSnapshot(
    peersColl,
    (snapshot) => {
      const now = Date.now();
      let activePeers = 0;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const lastSeenMillis = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : now;
        // Dianggap aktif jika ada heartbeat dalam 12 detik terakhir
        if (now - lastSeenMillis <= 12000) {
          activePeers++;
        }
      });
      onPeerCount(Math.max(1, activePeers));
    },
    (err) => {
      handleFsError(err, 'list', `cpuRooms/${cleanId}/peers`);
    }
  );
  unsubscribers.push(unsubPeers);

  return () => {
    unsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch {}
    });
  };
}
