import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
// Gracefully read local config file if present, avoiding build errors if excluded from git/Vercel
const localConfigs = import.meta.glob<{ default: Record<string, string> }>('../../firebase-applet-config.json', { eager: true });
const localConfig = localConfigs['../../firebase-applet-config.json']?.default || {};

// Support environment variables (e.g. on Vercel) while keeping json config as fallback
const activeConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || localConfig.apiKey || 'AIzaSyBPybgn5k1US8aPCMmxTdxAgrHE6KQ9_8w',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || localConfig.authDomain || 'gen-lang-client-0619552458.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || localConfig.projectId || 'gen-lang-client-0619552458',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || localConfig.storageBucket || 'gen-lang-client-0619552458.firebasestorage.app',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || localConfig.messagingSenderId || '557558820445',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || localConfig.appId || '1:557558820445:web:28de49dcbba3daa5a1a7b4',
  firestoreDatabaseId: (import.meta.env.VITE_FIREBASE_DATABASE_ID as string) || localConfig.firestoreDatabaseId || 'ai-studio-8afa8c90-965b-4d3b-a3f3-ca0ac07cc03e',
};

const app = initializeApp(activeConfig);

// CRITICAL: Must use activeConfig.firestoreDatabaseId for AI Studio
export const db = getFirestore(app, activeConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

// SKILL MANDATE: Test connection to Firestore on initialization
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: Client is offline.');
    }
  }
}
testConnection();

export default app;
