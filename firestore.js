import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth } from './auth.js';
import { firebaseApp } from './config.js';

export const db = getFirestore(firebaseApp);
export const activitiesRef = collection(db, 'activities');

export async function createActivity(activityPayload) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Tidak ada user yang sedang login.');
  }

  const payload = {
    userId: currentUser.uid,
    inventoryCode: activityPayload.inventoryCode || '',
    userName: activityPayload.userName || '',
    location: activityPayload.location || '',
    workCode: activityPayload.workCode || 'HW',
    remarks: activityPayload.remarks || '',
    startedAt: activityPayload.startedAt || Timestamp.now(),
    endedAt: null,
    durationMinutes: null,
    status: 'ongoing'
  };

  console.debug('[Firestore] createActivity -> write requested', {
    userId: currentUser.uid,
    status: payload.status
  });

  try {
    const ref = await addDoc(activitiesRef, payload);
    console.log('[Activity] Firestore save successful', { id: ref.id });
    console.debug('[Firestore] createActivity -> success', { id: ref.id, status: payload.status });
    return { id: ref.id, ...payload };
  } catch (error) {
    console.error('[Activity] Save error:', error);
    console.error('[Firestore] createActivity -> failed', error);
    throw error;
  }
}

export async function updateActivity(activityId, updates) {
  if (!auth.currentUser) {
    throw new Error('Tidak ada user yang sedang login.');
  }

  const ref = doc(db, 'activities', activityId);

  console.debug('[Firestore] updateActivity -> start', {
    activityId,
    fields: Object.keys(updates)
  });

  try {
    await updateDoc(ref, updates);
    console.debug('[Firestore] updateActivity -> success', {
      activityId,
      fields: Object.keys(updates)
    });
  } catch (error) {
    console.error('[Activity] Save error:', error);
    console.error('[Firestore] updateActivity -> failed', { activityId, error });
    throw error;
  }
}

export async function deleteActivity(activityId) {
  if (!auth.currentUser) {
    throw new Error('Tidak ada user yang sedang login.');
  }

  const ref = doc(db, 'activities', activityId);

  console.log('[History] Deleting Firestore activity:', { activityId });

  try {
    await deleteDoc(ref);
    console.log('[History] Firestore activity deleted:', { activityId });
  } catch (error) {
    console.error('[History] Delete failed:', { activityId, error });
    throw error;
  }
}

export function subscribeToActivities(userId, callback, onError) {
  const authUser = auth.currentUser;
  const listenerPath = 'activities';

  console.debug('[Firestore] Activity listener requested', {
    path: listenerPath,
    authUserAvailable: Boolean(authUser),
    authUid: authUser?.uid || null,
    requestedUid: userId || null
  });

  if (!userId || !authUser || authUser.uid !== userId) {
    console.warn('[Firestore] Activity listener skipped: authenticated user mismatch', {
      path: listenerPath,
      authUid: authUser?.uid || null,
      requestedUid: userId || null
    });
    callback([]);
    return () => {};
  }

  const q = query(
    activitiesRef,
    where('userId', '==', authUser.uid),
    orderBy('startedAt', 'desc')
  );

  console.debug('[Firestore] Activity listener created', {
    path: listenerPath,
    uid: userId,
    query: "where('userId', '==', auth.currentUser.uid), orderBy('startedAt', 'desc')"
  });

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data()
      }));
      callback(items);
    },
    (error) => {
      console.error('[Firestore] Activity listener error', {
        path: listenerPath,
        uid: userId,
        code: error.code,
        message: error.message
      });
      if (onError) {
        onError(error);
      }
    }
  );

  return () => {
    console.debug('[Firestore] Activity listener stopped', {
      path: listenerPath,
      uid: userId
    });
    unsubscribe();
  };
}

export async function finishActivity(activityId, startedAt) {
  const endedAt = Timestamp.fromDate(new Date());
  const startedMs = startedAt?.toMillis ? startedAt.toMillis() : new Date(startedAt).getTime();
  const endedMs = endedAt.toMillis();
  const durationMinutes = Math.max(0, Math.round((endedMs - startedMs) / 60000));

  console.debug('[Firestore] finishActivity -> start', {
    activityId,
    startedAt,
    durationMinutes
  });

  await updateActivity(activityId, {
    endedAt,
    durationMinutes,
    status: 'completed'
  });

  console.debug('[Firestore] finishActivity -> success', {
    activityId,
    endedAt: endedAt.toMillis(),
    durationMinutes,
    status: 'completed'
  });
}

export async function cancelActivity(activityId, startedAt) {
  const endedAt = Timestamp.fromDate(new Date());
  const startedMs = startedAt?.toMillis ? startedAt.toMillis() : new Date(startedAt).getTime();
  const durationMinutes = Math.max(0, Math.round((endedAt.toMillis() - startedMs) / 60000));

  console.debug('[Firestore] cancelActivity -> start', {
    activityId,
    startedAt,
    durationMinutes
  });

  await updateActivity(activityId, {
    endedAt,
    durationMinutes,
    status: 'cancelled'
  });

  console.debug('[Firestore] cancelActivity -> success', {
    activityId,
    endedAt: endedAt.toMillis(),
    durationMinutes,
    status: 'cancelled'
  });
}
