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
import { firebaseApp } from './config.js';

export const db = getFirestore(firebaseApp);
export const activitiesRef = collection(db, 'activities');

export async function createActivity(activityPayload) {
  const payload = {
    userId: activityPayload.userId,
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

  console.debug('[Firestore] createActivity -> write payload', {
    userId: payload.userId,
    userName: payload.userName,
    workCode: payload.workCode,
    location: payload.location,
    status: payload.status
  });

  try {
    const ref = await addDoc(activitiesRef, payload);
    console.log('[Activity] Firestore save successful', { id: ref.id, userName: payload.userName });
    console.debug('[Firestore] createActivity -> success', { id: ref.id, status: payload.status });
    return { id: ref.id, ...payload };
  } catch (error) {
    console.error('[Activity] Save error:', error);
    console.error('[Firestore] createActivity -> failed', error);
    throw error;
  }
}

export async function updateActivity(activityId, updates) {
  const ref = doc(db, 'activities', activityId);

  console.debug('[Firestore] updateActivity -> start', {
    activityId,
    userName: updates.userName,
    updates
  });

  try {
    await updateDoc(ref, updates);
    if (Object.prototype.hasOwnProperty.call(updates, 'userName')) {
      console.log('[Activity] Firestore save successful', { activityId, userName: updates.userName });
    }
    console.debug('[Firestore] updateActivity -> success', { activityId, updates });
  } catch (error) {
    console.error('[Activity] Save error:', error);
    console.error('[Firestore] updateActivity -> failed', { activityId, error });
    throw error;
  }
}

export async function deleteActivity(activityId) {
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

export function subscribeToActivities(userId, callback) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const q = query(
    activitiesRef,
    where('userId', '==', userId),
    orderBy('startedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data()
      }));
      items.forEach((activity) => {
        console.log('[History] Activity data:', activity);
        console.log('[History] Nama yang ditampilkan:', activity.userName || 'User');
      });
      callback(items);
    },
    (error) => {
      console.error('Firestore listener error:', error);
      callback([]);
    }
  );
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
