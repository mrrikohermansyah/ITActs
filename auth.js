import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseApp } from './config.js';

export const auth = getAuth(firebaseApp);

export async function registerUser(email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function loginUser(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function logoutUser() {
  await signOut(auth);
}

export async function updateCurrentUserDisplayName(displayName) {
  if (!auth.currentUser) {
    throw new Error('Tidak ada user yang sedang login.');
  }

  await updateProfile(auth.currentUser, { displayName });
  return auth.currentUser;
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
