import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
    },
    operationType,
    path
  };

  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function getFriendlyFirebaseError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'Unknown Firebase error');

  let message = raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === 'string') {
      message = parsed.error;
    }
  } catch {
    // Not serialized FirestoreErrorInfo
  }

  const lower = message.toLowerCase();
  if (lower.includes('popup-closed-by-user')) {
    return 'Google sign-in was cancelled before completing.';
  }
  if (lower.includes('popup-blocked')) {
    return 'Pop-up blocked by browser. Allow pop-ups for this site and try again.';
  }
  if (lower.includes('unauthorized-domain')) {
    return 'This preview domain is not yet authorised for Firebase Auth.';
  }
  if (lower.includes('network-request-failed') || lower.includes('client is offline')) {
    return 'Network unavailable. Check your internet connection and retry.';
  }
  if (lower.includes('resource-exhausted') || lower.includes('quota')) {
    return 'Firestore quota exceeded. Please try again shortly.';
  }
  if (lower.includes('permission-denied') || lower.includes('insufficient permissions')) {
    return 'Permission denied for your account workspace. Please sign in again with a verified Google account.';
  }
  return message;
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('the client is offline')) {
      console.warn('Please check your Firebase configuration or internet connectivity.');
      return false;
    }
    // Expected permission-denied on /test/connection confirms Firestore server reachability
    return true;
  }
}
