import { db } from '../firebase-client-wrapper';

export async function getTaskFromFirestore(taskId: string) {
  const snap = await db.collection('assix_tasks').doc(taskId).get();
  return snap.exists ? snap.data() : null;
}

export async function saveTaskToFirestore(taskId: string, data: any, options?: any) {
  await db.collection('assix_tasks').doc(taskId).set(data, options);
}

export async function updateTaskInFirestore(taskId: string, data: any) {
  await db.collection('assix_tasks').doc(taskId).update(data);
}
