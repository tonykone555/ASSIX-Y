import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  QueryConstraint
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Load configuration
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase Client SDK safely
const app = getApps().length === 0 ? initializeApp(config) : getApp();
export const dbInstance = getFirestore(app, config.firestoreDatabaseId || undefined);

class DocumentSnapshotWrapper {
  private _snap: any;
  constructor(snap: any) {
    this._snap = snap;
  }
  get id() {
    return this._snap.id;
  }
  get exists() {
    return this._snap.exists();
  }
  data() {
    return this._snap.data();
  }
}

class QueryDocumentSnapshotWrapper extends DocumentSnapshotWrapper {
  constructor(snap: any) {
    super(snap);
  }
}

class QuerySnapshotWrapper {
  private _snap: any;
  constructor(snap: any) {
    this._snap = snap;
  }
  get docs() {
    return this._snap.docs.map((d: any) => new QueryDocumentSnapshotWrapper(d));
  }
  get empty() {
    return this._snap.empty;
  }
}

class DocumentReferenceWrapper {
  private _path: string;
  private _docId: string;
  constructor(pathStr: string, docId: string) {
    this._path = pathStr;
    this._docId = docId;
  }

  get id() {
    return this._docId;
  }

  collection(subCollectionName: string) {
    return new CollectionReferenceWrapper(`${this._path}/${this._docId}/${subCollectionName}`);
  }

  async get() {
    const docRef = doc(dbInstance, this._path, this._docId);
    const snap = await getDoc(docRef);
    return new DocumentSnapshotWrapper(snap);
  }

  async set(data: any, options?: any) {
    const docRef = doc(dbInstance, this._path, this._docId);
    if (options) {
      await setDoc(docRef, data, options);
    } else {
      await setDoc(docRef, data);
    }
  }

  async update(data: any) {
    const docRef = doc(dbInstance, this._path, this._docId);
    await updateDoc(docRef, data);
  }

  async delete() {
    const docRef = doc(dbInstance, this._path, this._docId);
    await deleteDoc(docRef);
  }
}

class QueryWrapper {
  protected _path: string;
  protected _constraints: QueryConstraint[];

  constructor(pathStr: string, constraints: QueryConstraint[] = []) {
    this._path = pathStr;
    this._constraints = constraints;
  }

  where(field: string, opStr: any, value: any) {
    const c = where(field, opStr, value);
    return new QueryWrapper(this._path, [...this._constraints, c]);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    const c = orderBy(field, direction);
    return new QueryWrapper(this._path, [...this._constraints, c]);
  }

  limit(n: number) {
    const c = limit(n);
    return new QueryWrapper(this._path, [...this._constraints, c]);
  }

  async get() {
    const colRef = collection(dbInstance, this._path);
    const q = query(colRef, ...this._constraints);
    const snap = await getDocs(q);
    return new QuerySnapshotWrapper(snap);
  }
}

class CollectionReferenceWrapper extends QueryWrapper {
  constructor(pathStr: string) {
    super(pathStr, []);
  }

  doc(docId?: string) {
    const finalDocId = docId || doc(collection(dbInstance, this._path)).id;
    return new DocumentReferenceWrapper(this._path, finalDocId);
  }

  async add(data: any) {
    const colRef = collection(dbInstance, this._path);
    const docRef = await addDoc(colRef, data);
    return new DocumentReferenceWrapper(this._path, docRef.id);
  }
}

export const db = {
  collection(collectionName: string) {
    return new CollectionReferenceWrapper(collectionName);
  }
};
