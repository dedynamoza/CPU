import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import {
  User,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { UserProfile, VibeType } from '../types';
import { generateAnonymousName, getRandomAvatarColor } from '../utils/nameGenerator';
import { updateServerOffset } from '../utils/timeSync';

interface AuthContextType {
  currentUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  onlineCount: number;
  blockedUserIds: string[];
  isAnonymousDisabled: boolean;
  loginWithGoogle: () => Promise<void>;
  loginAnonymously: () => Promise<void>;
  logout: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  updateUserVibe: (vibe: VibeType) => Promise<void>;
  setUserStatus: (status: 'idle' | 'searching' | 'chatting') => Promise<void>;
  refreshBlockedUsers: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [isAnonymousDisabled, setIsAnonymousDisabled] = useState(false);
  const heartbeatTimerRef = useRef<any>(null);

  // Setup auth state observer with graceful anonymous / Google auth
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          let userSnap;
          try {
            userSnap = await getDoc(userDocRef);
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          }

          if (userSnap && userSnap.exists()) {
            const data = userSnap.data();
            if (data.lastActiveAt?.toDate) {
              updateServerOffset(data.lastActiveAt.toDate());
            }
            setProfile({
              uid: user.uid,
              // Always prioritize anonymous whistleblower codename
              displayName: data.displayName || generateAnonymousName(),
              avatarColor: data.avatarColor || getRandomAvatarColor(),
              vibe: data.vibe || 'random',
              status: data.status || 'idle',
              createdAt: data.createdAt,
              lastActiveAt: data.lastActiveAt,
            });
            await updateDoc(userDocRef, {
              lastActiveAt: serverTimestamp(),
            }).catch(() => {});
          } else {
            // Create initial ephemeral profile with zero personal identifiable information
            const randomName = generateAnonymousName();
            const randomColor = getRandomAvatarColor();
            const newProfileData = {
              displayName: randomName,
              avatarColor: randomColor,
              vibe: 'random' as VibeType,
              status: 'idle' as const,
              createdAt: serverTimestamp(),
              lastActiveAt: serverTimestamp(),
            };

            try {
              await setDoc(userDocRef, newProfileData);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
            }

            setProfile({
              uid: user.uid,
              ...newProfileData,
            });
          }
        } catch (error) {
          console.error('Error loading profile:', error);
        }
        setLoading(false);
      } else {
        setCurrentUser(null);
        setProfile(null);
        // Attempt anonymous sign-in in the background
        signInAnonymously(auth)
          .catch((err: any) => {
            if (err?.code === 'auth/admin-restricted-operation') {
              // Anonymous sign-in provider is disabled in Firebase Console
              console.warn(
                'Firebase Anonymous Auth is not enabled in Firebase Console. Google Sign-In is available as fallback.'
              );
              setIsAnonymousDisabled(true);
            } else {
              console.warn('Anonymous auth notice:', err?.message || err);
            }
          })
          .finally(() => {
            setLoading(false);
          });
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Presence heartbeat & Active Online Users
  useEffect(() => {
    if (!currentUser) return;

    const presenceRef = doc(db, 'presence', currentUser.uid);

    const sendHeartbeat = async () => {
      try {
        await setDoc(presenceRef, {
          uid: currentUser.uid,
          lastSeen: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Presence heartbeat notice:', err);
      }
    };

    sendHeartbeat();
    heartbeatTimerRef.current = setInterval(sendHeartbeat, 30000);

    // Listen to blocks for this user
    const blocksQuery = query(
      collection(db, 'blocks'),
      where('userId', '==', currentUser.uid)
    );
    const unsubBlocks = onSnapshot(
      blocksQuery,
      (snapshot) => {
        const ids = snapshot.docs.map((d) => d.data().blockedUserId as string);
        setBlockedUserIds(ids);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'blocks');
      }
    );

    // Listen to online presence count
    const presenceCol = collection(db, 'presence');
    const unsubPresence = onSnapshot(
      presenceCol,
      (snapshot) => {
        const liveCount = Math.max(1, snapshot.size);
        setOnlineCount(liveCount);
      },
      (error) => {
        console.warn('Presence listen notice:', error);
      }
    );

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      unsubBlocks();
      unsubPresence();
      deleteDoc(presenceRef).catch(() => {});
    };
  }, [currentUser]);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.warn('Google sign-in popup notice:', error?.message || error);
      throw error;
    }
  };

  const loginAnonymously = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      if (error?.code === 'auth/admin-restricted-operation') {
        setIsAnonymousDisabled(true);
        // Automatically route to configured Google provider so the user is never stuck
        await loginWithGoogle();
        return;
      }
      throw error;
    }
  };

  const logout = async () => {
    if (currentUser) {
      try {
        await deleteDoc(doc(db, 'presence', currentUser.uid)).catch(() => {});
      } catch {}
    }
    await signOut(auth);
  };

  const updateDisplayName = async (name: string) => {
    if (!currentUser || !name.trim()) return;
    const sanitized = name.trim().slice(0, 30);
    const userDocRef = doc(db, 'users', currentUser.uid);
    try {
      await updateDoc(userDocRef, {
        displayName: sanitized,
        lastActiveAt: serverTimestamp(),
      });
      setProfile((prev) => (prev ? { ...prev, displayName: sanitized } : null));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const updateUserVibe = async (vibe: VibeType) => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    try {
      await updateDoc(userDocRef, {
        vibe,
        lastActiveAt: serverTimestamp(),
      });
      setProfile((prev) => (prev ? { ...prev, vibe } : null));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const setUserStatus = async (status: 'idle' | 'searching' | 'chatting') => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    try {
      await updateDoc(userDocRef, {
        status,
        lastActiveAt: serverTimestamp(),
      });
      setProfile((prev) => (prev ? { ...prev, status } : null));
    } catch (err) {
      console.warn('Status update notice:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        profile,
        loading,
        onlineCount,
        blockedUserIds,
        isAnonymousDisabled,
        loginWithGoogle,
        loginAnonymously,
        logout,
        updateDisplayName,
        updateUserVibe,
        setUserStatus,
        refreshBlockedUsers: () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
