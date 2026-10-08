import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  getDocs,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { ChatMessage, ChatSession, ReportReason } from '../types';
import { getServerSyncedNow } from '../utils/timeSync';

/**
 * Listens to active chat session metadata
 */
export function subscribeToChatSession(
  sessionId: string,
  onUpdate: (session: ChatSession | null) => void,
  onError: (error: any) => void
): () => void {
  const sessionDocRef = doc(db, 'chatSessions', sessionId);
  return onSnapshot(
    sessionDocRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onUpdate(null);
        return;
      }
      const data = snapshot.data();
      onUpdate({
        sessionId: data.sessionId || sessionId,
        userA: data.userA,
        userB: data.userB,
        userAName: data.userAName || 'Stranger',
        userBName: data.userBName || 'Stranger',
        vibe: data.vibe || 'random',
        status: data.status || 'active',
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        endedBy: data.endedBy,
      });
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.GET, `chatSessions/${sessionId}`);
    }
  );
}

/**
 * Listens to messages within a session, filtering out any messages that have expired
 */
export function subscribeToMessages(
  sessionId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (error: any) => void
): () => void {
  const messagesColRef = collection(db, 'chatSessions', sessionId, 'messages');
  const q = query(messagesColRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const now = getServerSyncedNow();
      const validMessages: ChatMessage[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let expiresAtMillis = 0;
        if (data.expiresAt?.toMillis) {
          expiresAtMillis = data.expiresAt.toMillis();
        } else if (data.expiresAt?.seconds) {
          expiresAtMillis = data.expiresAt.seconds * 1000;
        }

        // If message is already expired on arrival, trigger async deletion and do not show
        if (expiresAtMillis > 0 && expiresAtMillis <= now) {
          deleteMessage(sessionId, docSnap.id, data.storagePath).catch(() => {});
          return;
        }

        validMessages.push({
          id: docSnap.id,
          senderId: data.senderId,
          senderName: data.senderName,
          type: data.type || 'text',
          text: data.text || '',
          imageUrl: data.imageUrl,
          storagePath: data.storagePath,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
        });
      });

      onMessages(validMessages);
    },
    (error) => {
      onError(error);
      handleFirestoreError(
        error,
        OperationType.LIST,
        `chatSessions/${sessionId}/messages`
      );
    }
  );
}

/**
 * Sends a text message with strict 5-minute lifespan
 */
export async function sendTextMessage(
  sessionId: string,
  senderId: string,
  senderName: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 500) return;

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const messageRef = doc(db, 'chatSessions', sessionId, 'messages', messageId);

  // Exact 5-minute expiration timestamp
  const expiresAtDate = new Date(Date.now() + 5 * 60 * 1000);

  try {
    await setDoc(messageRef, {
      senderId,
      senderName,
      type: 'text',
      text: trimmed,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAtDate),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `chatSessions/${sessionId}/messages/${messageId}`
    );
  }
}

/**
 * Uploads an image to Firebase Storage and creates an image message with 5-minute expiration
 */
export async function sendImageMessage(
  sessionId: string,
  senderId: string,
  senderName: string,
  imageBlob: Blob
): Promise<void> {
  const messageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const filePath = `chatImages/${sessionId}/${messageId}.jpg`;
  const fileRef = storageRef(storage, filePath);

  // 1. Upload to Storage
  let downloadUrl = '';
  try {
    const uploadResult = await uploadBytes(fileRef, imageBlob, {
      contentType: 'image/jpeg',
      cacheControl: 'no-cache, max-age=300',
    });
    downloadUrl = await getDownloadURL(uploadResult.ref);
  } catch (err) {
    console.error('Failed to upload image to Firebase Storage:', err);
    throw new Error('Image upload failed. Please try again.');
  }

  // 2. Create message in Firestore
  const messageRef = doc(db, 'chatSessions', sessionId, 'messages', messageId);
  const expiresAtDate = new Date(Date.now() + 5 * 60 * 1000);

  try {
    await setDoc(messageRef, {
      senderId,
      senderName,
      type: 'image',
      imageUrl: downloadUrl,
      storagePath: filePath,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAtDate),
    });
  } catch (err) {
    // Attempt rollback of storage file
    deleteObject(fileRef).catch(() => {});
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `chatSessions/${sessionId}/messages/${messageId}`
    );
  }
}

/**
 * Deletes message from Firestore AND corresponding Firebase Storage file
 */
export async function deleteMessage(
  sessionId: string,
  messageId: string,
  storagePath?: string
): Promise<void> {
  // Delete storage file if present
  if (storagePath) {
    try {
      const fileRef = storageRef(storage, storagePath);
      await deleteObject(fileRef);
    } catch (storageErr) {
      // File may already have been deleted
      console.warn('Storage object deletion notice:', storageErr);
    }
  }

  // Delete message document
  try {
    await deleteDoc(doc(db, 'chatSessions', sessionId, 'messages', messageId));
  } catch (dbErr) {
    console.warn('Message document deletion notice:', dbErr);
  }
}

/**
 * Ends a chat session (user tapped NEXT or time expired)
 */
export async function endChatSession(
  sessionId: string,
  userId: string
): Promise<void> {
  const sessionRef = doc(db, 'chatSessions', sessionId);
  try {
    await updateDoc(sessionRef, {
      status: 'ended',
      endedBy: userId,
    });
  } catch (err) {
    console.warn('Session end update notice:', err);
  }
}

/**
 * Cleans up remaining messages when leaving a session to guarantee ephemerality
 */
export async function cleanupSessionMessages(sessionId: string): Promise<void> {
  try {
    const messagesCol = collection(db, 'chatSessions', sessionId, 'messages');
    const snap = await getDocs(messagesCol);
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      deleteMessage(sessionId, docSnap.id, data.storagePath).catch(() => {});
    }
  } catch {}
}

/**
 * Submits a safety report
 */
export async function reportUser(
  reporterId: string,
  reportedUserId: string,
  sessionId: string,
  reason: ReportReason,
  details = ''
): Promise<void> {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const reportRef = doc(db, 'reports', reportId);

  try {
    await setDoc(reportRef, {
      reporterId,
      reportedUserId,
      sessionId,
      reason,
      details: details.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `reports/${reportId}`);
  }
}

/**
 * Blocks a user to prevent future matchmaking
 */
export async function blockUser(
  userId: string,
  blockedUserId: string
): Promise<void> {
  const blockId = `blk_${userId}_${blockedUserId}`;
  const blockRef = doc(db, 'blocks', blockId);

  try {
    await setDoc(blockRef, {
      userId,
      blockedUserId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `blocks/${blockId}`);
  }
}
