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
 * Membersihkan kode ruang dengan mempertahankan huruf besar dan kecil (case-sensitive).
 * Karakter yang diizinkan: huruf besar A-Z, huruf kecil a-z, angka 0-9, dash (-), dan underscore (_).
 * Maksimal 16 karakter.
 */
export function sanitizeRoomCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
}

/**
 * Handle Firestore error logging
 */
function handleFsError(err: unknown, op: string, path: string) {
  console.warn(`[GHIBAH Firestore ${op}] ${path}:`, err);
}

// Client-side rate limiting to prevent spam and preserve Firestore write quota
let lastMessageTime = 0;
let lastSignalTime = 0;
let lastHeartbeatTime = 0;
const messageTimestamps: number[] = [];
const MAX_MESSAGES_PER_MINUTE = 40;
const MIN_MESSAGE_INTERVAL_MS = 300;
const MIN_SIGNAL_INTERVAL_MS = 2500;
const MIN_HEARTBEAT_INTERVAL_MS = 4000;

/**
 * Check if a room already exists and is actively used in Firestore (exact case-sensitive match).
 * Jika ruangan kosong tanpa orang aktif dan dibuat lebih dari 45 detik lalu, ruangan dianggap usang/tutup.
 */
export async function checkCpuRoomExists(roomId: string): Promise<boolean> {
  const cleanId = sanitizeRoomCode(roomId.trim());
  if (!cleanId) return false;
  const roomRef = doc(db, 'cpuRooms', cleanId);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return false;

    const data = snap.data();
    const createdAtMillis = data?.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
    const ageSeconds = (Date.now() - createdAtMillis) / 1000;

    // Periksa apakah ada anggota aktif di subkoleksi peers
    const peersColl = collection(db, 'cpuRooms', cleanId, 'peers');
    const peersSnap = await getDocs(query(peersColl, limit(10)));
    const now = Date.now();
    let hasActivePeers = false;

    peersSnap.forEach((pDoc) => {
      const pData = pDoc.data();
      const lastSeen = pData.lastSeen?.toMillis ? pData.lastSeen.toMillis() : now;
      if (now - lastSeen <= 12000) {
        hasActivePeers = true;
      } else {
        // Hapus peer yang sudah lama tidak aktif
        deleteDoc(pDoc.ref).catch(() => {});
      }
    });

    // Jika tidak ada seorang pun yang aktif dan ruangan sudah lebih dari 45 detik,
    // ruangan dianggap ditutup/kedaluwarsa sehingga tidak bisa dimasuki tanpa dibuat ulang.
    if (!hasActivePeers && ageSeconds > 45) {
      deleteDoc(roomRef).catch(() => {});
      return false;
    }

    return true;
  } catch (err) {
    handleFsError(err, 'get', `cpuRooms/${cleanId}`);
    throw err;
  }
}

/**
 * Retrieve the creator and current host peerId of a room
 */
export async function getRoomCreator(roomId: string): Promise<string | null> {
  const cleanId = sanitizeRoomCode(roomId.trim());
  if (!cleanId) return null;
  const roomRef = doc(db, 'cpuRooms', cleanId);
  try {
    const snap = await getDoc(roomRef);
    if (snap.exists()) {
      const data = snap.data();
      return data?.currentHost || data?.createdBy || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Update the current host of a room when host disconnects/migrates
 */
export async function updateCpuRoomHost(roomId: string, newHostPeerId: string): Promise<void> {
  const cleanId = sanitizeRoomCode(roomId.trim());
  if (!cleanId) return;
  const roomRef = doc(db, 'cpuRooms', cleanId);
  try {
    await updateDoc(roomRef, {
      currentHost: newHostPeerId,
      lastActivity: serverTimestamp(),
    });
  } catch (err) {
    handleFsError(err, 'updateHost', `cpuRooms/${cleanId}`);
  }
}

/**
 * Create a new room in Firestore with creator peerId (exact case-sensitive match)
 */
export async function createCpuRoom(
  roomId: string,
  hostPeerId: string
): Promise<{ success: boolean; alreadyExists?: boolean; error?: string }> {
  const cleanId = sanitizeRoomCode(roomId.trim());
  if (!cleanId) return { success: false, error: 'Kode ruang tidak boleh kosong.' };
  const roomRef = doc(db, 'cpuRooms', cleanId);

  try {
    const snap = await getDoc(roomRef);
    if (snap.exists()) {
      const data = snap.data();
      const createdAtMillis = data?.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
      const ageSeconds = (Date.now() - createdAtMillis) / 1000;

      // Cek apakah ada peer aktif
      const peersColl = collection(db, 'cpuRooms', cleanId, 'peers');
      const peersSnap = await getDocs(query(peersColl, limit(5)));
      const now = Date.now();
      let hasActivePeers = false;

      peersSnap.forEach((pDoc) => {
        const pData = pDoc.data();
        const lastSeen = pData.lastSeen?.toMillis ? pData.lastSeen.toMillis() : now;
        if (now - lastSeen <= 12000) {
          hasActivePeers = true;
        } else {
          deleteDoc(pDoc.ref).catch(() => {});
        }
      });

      if (hasActivePeers || ageSeconds <= 45) {
        return { success: false, alreadyExists: true, error: 'Ruangan sudah aktif digunakan oleh orang lain.' };
      }
      // Jika ruangan lama sudah kosong/mati, kita timpa sebagai ruangan baru
    }

    await setDoc(roomRef, {
      roomId: cleanId,
      createdBy: hostPeerId,
      currentHost: hostPeerId,
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
  const cleanId = sanitizeRoomCode(roomId.trim());
  if (!cleanId) return;
  const roomRef = doc(db, 'cpuRooms', cleanId);
  try {
    await updateDoc(roomRef, {
      lastActivity: serverTimestamp(),
    });
  } catch {
    // Fallback if document not found
  }
}

/**
 * Touch or create the room in Firestore (backward compatibility)
 */
export async function touchCpuRoom(roomId: string): Promise<void> {
  const cleanId = sanitizeRoomCode(roomId.trim());
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
 * Send an ephemeral message to a GHIBAH room in Firestore
 */
export async function sendCpuMessage(roomId: string, msg: CpuMsgData): Promise<void> {
  const cleanId = sanitizeRoomCode(roomId.trim());
  if (!cleanId) return;

  const now = Date.now();
  // Anti-spam interval check
  if (now - lastMessageTime < MIN_MESSAGE_INTERVAL_MS) {
    console.warn('[GHIBAH Quota Guard] Message throttled: sending too fast.');
    return;
  }

  // Sliding window rate limiter (max messages per minute)
  while (messageTimestamps.length > 0 && messageTimestamps[0] < now - 60000) {
    messageTimestamps.shift();
  }
  if (messageTimestamps.length >= MAX_MESSAGES_PER_MINUTE) {
    console.warn('[GHIBAH Quota Guard] Message rate limit reached: please slow down.');
    return;
  }

  lastMessageTime = now;
  messageTimestamps.push(now);

  const msgDocRef = doc(db, 'cpuRooms', cleanId, 'messages', msg.id);
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
  const cleanId = sanitizeRoomCode(roomId.trim());
  if (!cleanId) return;

  const now = Date.now();
  if (now - lastSignalTime < MIN_SIGNAL_INTERVAL_MS) {
    console.warn('[GHIBAH Quota Guard] Signal throttled: sending too fast.');
    return;
  }
  lastSignalTime = now;

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
 * Send presence heartbeat for an anonymous peer with joinedAt timestamp
 */
export async function sendPeerHeartbeat(
  roomId: string,
  peerId: string,
  alias: string,
  joinedAt?: number
): Promise<void> {
  const cleanId = sanitizeRoomCode(roomId.trim());
  if (!cleanId || !peerId) return;

  const now = Date.now();
  if (now - lastHeartbeatTime < MIN_HEARTBEAT_INTERVAL_MS) {
    return; // Skip heartbeat if called too frequently
  }
  lastHeartbeatTime = now;

  const peerRef = doc(db, 'cpuRooms', cleanId, 'peers', peerId);

  try {
    await setDoc(
      peerRef,
      {
        peerId,
        alias,
        joinedAt: joinedAt || Date.now(),
        lastSeen: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFsError(err, 'write', `cpuRooms/${cleanId}/peers/${peerId}`);
  }
}

/**
 * Remove peer presence when leaving room.
 * Jika ruangan kosong, hapus ruangan agar tidak menggantung.
 */
export async function removePeerPresence(roomId: string, peerId: string): Promise<void> {
  const cleanId = sanitizeRoomCode(roomId.trim());
  const peerRef = doc(db, 'cpuRooms', cleanId, 'peers', peerId);

  try {
    await deleteDoc(peerRef);
    const peersColl = collection(db, 'cpuRooms', cleanId, 'peers');
    const snap = await getDocs(query(peersColl, limit(2)));
    if (snap.empty) {
      deleteDoc(doc(db, 'cpuRooms', cleanId)).catch(() => {});
    }
  } catch (err) {
    handleFsError(err, 'delete', `cpuRooms/${cleanId}/peers/${peerId}`);
  }
}

/**
 * Delete a specific message once expired from Firestore
 */
export async function deleteExpiredMessage(roomId: string, messageId: string): Promise<void> {
  const cleanId = sanitizeRoomCode(roomId.trim());
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
  const cleanId = sanitizeRoomCode(roomId.trim());
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
 * Subscribe to real-time room events (messages, signals, peers, and host succession)
 */
export function subscribeToCpuRoom(
  roomId: string,
  myPeerId: string,
  onMessage: (msg: CpuMsgData, isMine: boolean) => void,
  onSignal: (sig: CpuSignalData) => void,
  onPeerCount: (count: number) => void,
  onHostSuccession?: (isHost: boolean, hostPeerId: string, hostAlias: string, wasPromoted: boolean) => void
): () => void {
  const cleanId = sanitizeRoomCode(roomId.trim());
  const joinTimestamp = Date.now();
  const unsubscribers: (() => void)[] = [];
  let currentHostId: string | null = null;
  let initialHostCheckDone = false;

  // 1. Subscribe to room doc to track current host
  const roomRef = doc(db, 'cpuRooms', cleanId);
  const unsubRoom = onSnapshot(
    roomRef,
    (roomSnap) => {
      if (roomSnap.exists()) {
        const rData = roomSnap.data();
        currentHostId = rData?.currentHost || rData?.createdBy || null;
      }
    },
    (err) => {
      handleFsError(err, 'get', `cpuRooms/${cleanId}`);
    }
  );
  unsubscribers.push(unsubRoom);

  // 2. Subscribe to messages
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
            alias: data.alias || 'GHIBAH',
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

  // 3. Subscribe to signals (/shake, /blackhole, /ghost)
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

  // 4. Subscribe to peers presence & handle Host Succession (Orang ke-2 jadi Host dst.)
  const peersColl = collection(db, 'cpuRooms', cleanId, 'peers');
  const unsubPeers = onSnapshot(
    peersColl,
    (snapshot) => {
      const now = Date.now();
      const activePeers: { peerId: string; alias: string; joinedAt: number }[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const lastSeenMillis = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : now;
        // Dianggap aktif jika ada heartbeat dalam 12 detik terakhir
        if (now - lastSeenMillis <= 12000) {
          activePeers.push({
            peerId: data.peerId || docSnap.id,
            alias: data.alias || 'GHIBAH',
            joinedAt: typeof data.joinedAt === 'number' ? data.joinedAt : now,
          });
        } else if (now - lastSeenMillis > 18000) {
          // Hapus peer stale yang disconnect tiba-tiba
          deleteDoc(docSnap.ref).catch(() => {});
        }
      });

      onPeerCount(Math.max(1, activePeers.length));

      // Urutkan peer berdasarkan waktu gabung (joinedAt) paling awal:
      // Index 0 = Anggota tertua di ruangan saat ini
      activePeers.sort((a, b) => a.joinedAt - b.joinedAt);

      if (activePeers.length === 0) return;

      const hostIsActive = currentHostId && activePeers.some((p) => p.peerId === currentHostId);

      if (!hostIsActive) {
        // Host sebelumnya disconnect atau belum ditentukan!
        // Orang tertua yang tersisa di ruangan (activePeers[0]) otomatis menjadi Host baru!
        const newHost = activePeers[0];
        const prevHost = currentHostId;
        currentHostId = newHost.peerId;

        const isMe = newHost.peerId === myPeerId;
        if (isMe) {
          updateCpuRoomHost(cleanId, myPeerId).catch(() => {});
        }

        if (onHostSuccession) {
          onHostSuccession(
            isMe,
            newHost.peerId,
            newHost.alias,
            initialHostCheckDone && prevHost !== null && prevHost !== newHost.peerId
          );
        }
      } else {
        const isMe = currentHostId === myPeerId;
        const hostPeer = activePeers.find((p) => p.peerId === currentHostId);
        if (onHostSuccession) {
          onHostSuccession(isMe, currentHostId || '', hostPeer?.alias || 'HOST', false);
        }
      }
      initialHostCheckDone = true;
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
