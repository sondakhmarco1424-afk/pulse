import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import { configValue } from './config';

export const firebaseConfig = {
  apiKey: configValue('VITE_FIREBASE_API_KEY'),
  authDomain: configValue('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: configValue('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: configValue('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: configValue('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: configValue('VITE_FIREBASE_APP_ID'),
  firestoreDatabaseId: configValue('VITE_FIREBASE_FIRESTORE_DATABASE_ID'),
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

let messagingInstance: any = null;
try {
  if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
    messagingInstance = getMessaging(app);
  }
} catch (e) {
  console.warn('Firebase Messaging not supported on plain HTTP domain/IP:', e);
}
export const messaging = messagingInstance;
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
