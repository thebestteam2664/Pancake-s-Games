import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const INTERNAL_EMAIL_DOMAIN = 'users.pancakes-games.app';
export const OWNER_USERNAME_LOWER = 'thegghampter';

// Validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
export const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const MIN_USERNAME_LEN = 3;
export const MAX_USERNAME_LEN = 24;
export const MIN_PASSWORD_LEN = 6;
export const MAX_PASSWORD_LEN = 128;
export const MAX_FAVORITES = 1000;
export const MAX_NOTE_LEN = 2000;
export const MAX_STORAGE_KEY_LEN = 256;
export const MAX_STORAGE_VAL_LEN = 100000;
export const MIN_SUGGESTION_TITLE_LEN = 2;
export const MAX_SUGGESTION_TITLE_LEN = 100;
export const MAX_SUGGESTION_URL_LEN = 300;
export const MAX_SUGGESTION_NOTES_LEN = 500;

export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
});

export function handleFirestoreError(error, operationType, path) {
  const user = auth.currentUser;
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user ? user.uid : null,
      email: user ? user.email : null,
      emailVerified: user ? user.emailVerified : null,
      isAnonymous: user ? user.isAnonymous : null,
      tenantId: user ? user.tenantId : null,
      providerInfo:
        user && Array.isArray(user.providerData)
          ? user.providerData.map((provider) => ({
              providerId: provider.providerId || null,
              email: provider.email || null,
            }))
          : [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function validateUsername(rawUsername) {
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
  if (username.length < MIN_USERNAME_LEN || username.length > MAX_USERNAME_LEN) {
    return {
      ok: false,
      username,
      error: `Username must be between ${MIN_USERNAME_LEN} and ${MAX_USERNAME_LEN} characters.`,
    };
  }
  if (!USERNAME_REGEX.test(username)) {
    return {
      ok: false,
      username,
      error: 'Username can only use letters, numbers, underscores (_), hyphens (-), and periods (.).',
    };
  }
  return { ok: true, username, usernameLower: username.toLowerCase(), error: null };
}

export function validatePassword(rawPassword) {
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  if (password.length < MIN_PASSWORD_LEN) {
    return {
      ok: false,
      password,
      error: `Password must be at least ${MIN_PASSWORD_LEN} characters long.`,
    };
  }
  if (password.length > MAX_PASSWORD_LEN) {
    return {
      ok: false,
      password,
      error: `Password must be ${MAX_PASSWORD_LEN} characters or fewer.`,
    };
  }
  return { ok: true, password, error: null };
}

function usernameToInternalEmail(usernameLower) {
  let hex = '';
  for (let i = 0; i < usernameLower.length; i += 1) {
    hex += usernameLower.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return `u_${hex}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function getDisplayUsername(user, profile = null) {
  if (profile && typeof profile.username === 'string' && profile.username.trim()) {
    return profile.username.trim();
  }
  if (user && typeof user.displayName === 'string' && user.displayName.trim()) {
    return user.displayName.trim();
  }
  if (user && typeof user.email === 'string' && user.email.includes('@')) {
    const localPart = user.email.split('@')[0];
    if (localPart.startsWith('u_')) {
      const hex = localPart.slice(2);
      if (/^[0-9a-f]+$/.test(hex) && hex.length % 2 === 0) {
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        }
        if (decoded) return decoded;
      }
    }
    return localPart;
  }
  return 'Player';
}

export function mapAuthErrorMessage(error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That username is already taken. Try signing in or pick a different username.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect username or password.';
    case 'auth/weak-password':
      return `Password must be at least ${MIN_PASSWORD_LEN} characters long.`;
    case 'auth/invalid-email':
      return 'Please enter a valid username (letters, numbers, _, -, .).';
    case 'auth/too-many-requests':
      return 'Too many login attempts. Please wait a moment and try again.';
    case 'auth/operation-not-allowed':
      return 'Username accounts are not enabled yet in Firebase Console. Enable Email/Password under Authentication -> Sign-in method.';
    case 'auth/network-request-failed':
      return 'Network error while connecting to your account. Please try again.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'Unable to complete account request right now.';
  }
}

function sanitizeFavorites(favorites) {
  const list = Array.isArray(favorites) ? favorites : [...(favorites || [])];
  const clean = [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item === 'string' && ID_REGEX.test(item) && item.length <= 128 && !seen.has(item)) {
      seen.add(item);
      clean.push(item);
      if (clean.length >= MAX_FAVORITES) break;
    }
  }
  return clean;
}

function sanitizeSaveRecord(uid, gameId, saveInfo) {
  if (!ID_REGEX.test(gameId) || gameId.length > 128) return null;
  const rawSavedAt = Number(saveInfo && saveInfo.savedAt);
  const savedAt = Number.isFinite(rawSavedAt)
    ? Math.max(0, Math.min(9999999999999, Math.floor(rawSavedAt)))
    : Date.now();
  const rawSeconds = Number(saveInfo && saveInfo.playSeconds);
  const playSeconds = Number.isFinite(rawSeconds)
    ? Math.max(0, Math.min(100000000, Math.floor(rawSeconds)))
    : 0;
  const note =
    saveInfo && typeof saveInfo.note === 'string' ? saveInfo.note.slice(0, MAX_NOTE_LEN) : '';
  return {
    ownerId: uid,
    gameId,
    savedAt,
    playSeconds,
    note,
    updatedAt: serverTimestamp(),
  };
}

function hashStorageKeyToId(gameId, storageKey) {
  let h1 = 2166136261;
  let h2 = 33554467;
  for (let i = 0; i < storageKey.length; i += 1) {
    const code = storageKey.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619);
    h2 ^= code;
    h2 = Math.imul(h2, 2654435761);
  }
  const hex = `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
  const prefix = gameId.slice(0, 64);
  return `${prefix}__${hex}`;
}

function sanitizeStorageEntries(uid, entries) {
  const clean = [];
  for (const entry of entries || []) {
    if (!entry || typeof entry.gameId !== 'string' || !ID_REGEX.test(entry.gameId) || entry.gameId.length > 128) {
      continue;
    }
    if (typeof entry.storageKey !== 'string' || !entry.storageKey || entry.storageKey.length > MAX_STORAGE_KEY_LEN) {
      continue;
    }
    const storageValue =
      typeof entry.storageValue === 'string'
        ? entry.storageValue.slice(0, MAX_STORAGE_VAL_LEN)
        : String(entry.storageValue || '').slice(0, MAX_STORAGE_VAL_LEN);
    const entryId = hashStorageKeyToId(entry.gameId, entry.storageKey);
    if (!ID_REGEX.test(entryId) || entryId.length > 128) continue;
    clean.push({
      entryId,
      data: {
        ownerId: uid,
        gameId: entry.gameId,
        storageKey: entry.storageKey,
        storageValue,
        updatedAt: serverTimestamp(),
      },
    });
  }
  return clean;
}

async function commitBatchedWrites(ops) {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const slice = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    slice.forEach((op) => {
      if (op.type === 'set') {
        batch.set(op.ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(op.ref);
      }
    });
    const path = slice[0] ? slice[0].path : 'users';
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

export function isOwnerAccount(profile, user) {
  const uname =
    profile && typeof profile.usernameLower === 'string'
      ? profile.usernameLower
      : getDisplayUsername(user, profile).toLowerCase();
  return uname === OWNER_USERNAME_LOWER;
}

async function assertAccountNotDeleted(uid) {
  const deletedPath = `deletedAccounts/${uid}`;
  let deletedSnap;
  try {
    deletedSnap = await getDoc(doc(db, 'deletedAccounts', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, deletedPath);
  }
  if (deletedSnap && deletedSnap.exists()) {
    try {
      await signOut(auth);
    } catch {
      // Ignore signOut cleanup error
    }
    throw new Error('This account was deleted by the site owner.');
  }
}

export async function ensureOwnerLock(user, profile = null) {
  if (!user || !isOwnerAccount(profile, user)) return false;
  const ownerPath = 'config/owner';
  const ownerRef = doc(db, 'config', 'owner');
  try {
    const snap = await getDoc(ownerRef);
    if (snap && snap.exists()) {
      const data = snap.data();
      return Boolean(data && data.ownerUid === user.uid);
    }
  } catch {
    // Document does not exist yet or not yet claimed by this user; attempt create below
  }

  try {
    await setDoc(ownerRef, {
      ownerUid: user.uid,
      ownerUsername: OWNER_USERNAME_LOWER,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ownerPath);
    return false;
  }
}

export async function ensureUserProfile(user, fallbackUsername = null) {
  await assertAccountNotDeleted(user.uid);

  const profilePath = `users/${user.uid}`;
  const profileRef = doc(db, 'users', user.uid);
  let snap;
  try {
    snap = await getDoc(profileRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, profilePath);
  }

  if (snap && snap.exists()) {
    const existingProfile = snap.data();
    if (isOwnerAccount(existingProfile, user)) {
      await ensureOwnerLock(user, existingProfile);
    }
    return existingProfile;
  }

  const candidate = getDisplayUsername(user, fallbackUsername ? { username: fallbackUsername } : null);
  const check = validateUsername(candidate);
  const safeUsername = check.ok ? check.username : `player_${user.uid.slice(0, 8)}`;
  const profileData = {
    uid: user.uid,
    username: safeUsername,
    usernameLower: safeUsername.toLowerCase(),
    favorites: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(profileRef, profileData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, profilePath);
  }

  const createdProfile = {
    uid: user.uid,
    username: safeUsername,
    usernameLower: safeUsername.toLowerCase(),
    favorites: [],
  };

  if (isOwnerAccount(createdProfile, user)) {
    await ensureOwnerLock(user, createdProfile);
  }

  return createdProfile;
}

export async function loadUserAccountData(uid) {
  const profilePath = `users/${uid}`;
  const savesPath = `users/${uid}/gameSaves`;
  const storagePath = `users/${uid}/gameStorage`;

  let profileSnap;
  try {
    profileSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, profilePath);
  }

  const profile = profileSnap && profileSnap.exists() ? profileSnap.data() : null;

  let savesSnap;
  try {
    const savesQuery = query(collection(db, 'users', uid, 'gameSaves'), where('ownerId', '==', uid));
    savesSnap = await getDocs(savesQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, savesPath);
  }

  const saves = {};
  if (savesSnap) {
    savesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && typeof data.gameId === 'string') {
        saves[data.gameId] = {
          savedAt: Number(data.savedAt) || Date.now(),
          playSeconds: Number(data.playSeconds) || 0,
          note: typeof data.note === 'string' ? data.note : '',
        };
      }
    });
  }

  let storageSnap;
  try {
    const storageQuery = query(collection(db, 'users', uid, 'gameStorage'), where('ownerId', '==', uid));
    storageSnap = await getDocs(storageQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, storagePath);
  }

  const storageEntries = [];
  if (storageSnap) {
    storageSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && typeof data.storageKey === 'string' && typeof data.storageValue === 'string') {
        storageEntries.push({
          gameId: data.gameId,
          storageKey: data.storageKey,
          storageValue: data.storageValue,
        });
      }
    });
  }

  return {
    profile,
    favorites: profile && Array.isArray(profile.favorites) ? profile.favorites : [],
    saves,
    storageEntries,
  };
}

export async function signUpWithUsername(rawUsername, rawPassword, initialData = {}) {
  const uCheck = validateUsername(rawUsername);
  if (!uCheck.ok) {
    throw new Error(uCheck.error);
  }
  const pCheck = validatePassword(rawPassword);
  if (!pCheck.ok) {
    throw new Error(pCheck.error);
  }

  const internalEmail = usernameToInternalEmail(uCheck.usernameLower);
  const credential = await createUserWithEmailAndPassword(auth, internalEmail, pCheck.password);
  const user = credential.user;

  try {
    await updateProfile(user, { displayName: uCheck.username });
  } catch {
    // Profile doc stores username authoritatively even if Auth displayName update fails
  }

  await assertAccountNotDeleted(user.uid);

  const cleanFavorites = sanitizeFavorites(initialData.favorites);
  const profilePath = `users/${user.uid}`;
  const profileRef = doc(db, 'users', user.uid);

  try {
    await setDoc(profileRef, {
      uid: user.uid,
      username: uCheck.username,
      usernameLower: uCheck.usernameLower,
      favorites: cleanFavorites,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, profilePath);
  }

  const createdProfile = {
    uid: user.uid,
    username: uCheck.username,
    usernameLower: uCheck.usernameLower,
    favorites: cleanFavorites,
  };

  if (isOwnerAccount(createdProfile, user)) {
    await ensureOwnerLock(user, createdProfile);
  }

  // Upload guest saves and scoped localStorage entries now that parent /users/{uid} exists
  const ops = [];
  const savesObj = initialData.saves && typeof initialData.saves === 'object' ? initialData.saves : {};
  Object.entries(savesObj).forEach(([gameId, saveInfo]) => {
    const payload = sanitizeSaveRecord(user.uid, gameId, saveInfo);
    if (payload) {
      ops.push({
        type: 'set',
        ref: doc(db, 'users', user.uid, 'gameSaves', gameId),
        data: payload,
        path: `users/${user.uid}/gameSaves/${gameId}`,
      });
    }
  });

  const cleanStorage = sanitizeStorageEntries(user.uid, initialData.storageEntries);
  cleanStorage.forEach(({ entryId, data }) => {
    ops.push({
      type: 'set',
      ref: doc(db, 'users', user.uid, 'gameStorage', entryId),
      data,
      path: `users/${user.uid}/gameStorage/${entryId}`,
    });
  });

  if (ops.length > 0) {
    await commitBatchedWrites(ops);
  }

  return {
    user,
    profile: createdProfile,
  };
}

export async function signInWithUsername(rawUsername, rawPassword) {
  const uCheck = validateUsername(rawUsername);
  if (!uCheck.ok) {
    throw new Error(uCheck.error);
  }
  const pCheck = validatePassword(rawPassword);
  if (!pCheck.ok) {
    throw new Error(pCheck.error);
  }

  const internalEmail = usernameToInternalEmail(uCheck.usernameLower);
  const credential = await signInWithEmailAndPassword(auth, internalEmail, pCheck.password);
  const user = credential.user;

  await ensureUserProfile(user, uCheck.username);
  const accountData = await loadUserAccountData(user.uid);
  return { user, ...accountData };
}

export async function signOutAccount() {
  await signOut(auth);
}

export async function syncFavoritesToCloud(uid, favorites) {
  if (!uid) return;
  const path = `users/${uid}`;
  const cleanFavorites = sanitizeFavorites(favorites);
  try {
    await updateDoc(doc(db, 'users', uid), {
      favorites: cleanFavorites,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncSingleGameToCloud(uid, gameId, saveInfo, storageEntries = []) {
  if (!uid || !gameId) return;
  const ops = [];
  const savePayload = sanitizeSaveRecord(uid, gameId, saveInfo);
  if (savePayload) {
    ops.push({
      type: 'set',
      ref: doc(db, 'users', uid, 'gameSaves', gameId),
      data: savePayload,
      path: `users/${uid}/gameSaves/${gameId}`,
    });
  }

  const cleanStorage = sanitizeStorageEntries(uid, storageEntries);
  cleanStorage.forEach(({ entryId, data }) => {
    ops.push({
      type: 'set',
      ref: doc(db, 'users', uid, 'gameStorage', entryId),
      data,
      path: `users/${uid}/gameStorage/${entryId}`,
    });
  });

  if (ops.length > 0) {
    await commitBatchedWrites(ops);
  }
}

export async function deleteRemoteSingleGameSave(uid, gameId) {
  if (!uid || !gameId || !ID_REGEX.test(gameId)) return;

  const savePath = `users/${uid}/gameSaves/${gameId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'gameSaves', gameId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, savePath);
  }

  const storagePath = `users/${uid}/gameStorage`;
  let storageSnap;
  try {
    const q = query(collection(db, 'users', uid, 'gameStorage'), where('ownerId', '==', uid));
    storageSnap = await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, storagePath);
  }

  const ops = [];
  if (storageSnap) {
    storageSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.gameId === gameId) {
        ops.push({
          type: 'delete',
          ref: docSnap.ref,
          path: `${storagePath}/${docSnap.id}`,
        });
      }
    });
  }

  if (ops.length > 0) {
    await commitBatchedWrites(ops);
  }
}

export async function deleteAllRemoteSaves(uid) {
  if (!uid) return;
  const savesPath = `users/${uid}/gameSaves`;
  const storagePath = `users/${uid}/gameStorage`;

  let savesSnap;
  try {
    savesSnap = await getDocs(query(collection(db, 'users', uid, 'gameSaves'), where('ownerId', '==', uid)));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, savesPath);
  }

  let storageSnap;
  try {
    storageSnap = await getDocs(
      query(collection(db, 'users', uid, 'gameStorage'), where('ownerId', '==', uid))
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, storagePath);
  }

  const ops = [];
  if (savesSnap) {
    savesSnap.forEach((docSnap) => {
      ops.push({ type: 'delete', ref: docSnap.ref, path: `${savesPath}/${docSnap.id}` });
    });
  }
  if (storageSnap) {
    storageSnap.forEach((docSnap) => {
      ops.push({ type: 'delete', ref: docSnap.ref, path: `${storagePath}/${docSnap.id}` });
    });
  }

  if (ops.length > 0) {
    await commitBatchedWrites(ops);
  }
}

export async function adminFetchAllAccounts() {
  const usersPath = 'users';
  let snap;
  try {
    snap = await getDocs(collection(db, usersPath));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, usersPath);
  }

  const accounts = [];
  if (snap) {
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data || typeof data.uid !== 'string') return;
      accounts.push({
        uid: data.uid,
        username: typeof data.username === 'string' ? data.username : data.uid,
        usernameLower: typeof data.usernameLower === 'string' ? data.usernameLower : '',
        favorites: Array.isArray(data.favorites) ? data.favorites : [],
        createdAtMs:
          data.createdAt && typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : 0,
        updatedAtMs:
          data.updatedAt && typeof data.updatedAt.toMillis === 'function' ? data.updatedAt.toMillis() : 0,
        isOwner: data.usernameLower === OWNER_USERNAME_LOWER,
      });
    });
  }

  accounts.sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    return (b.createdAtMs || 0) - (a.createdAtMs || 0);
  });

  return accounts;
}

export async function adminInspectUserAccount(targetUid) {
  if (!targetUid || !ID_REGEX.test(targetUid)) {
    throw new Error('Invalid account ID.');
  }

  const savesPath = `users/${targetUid}/gameSaves`;
  const storagePath = `users/${targetUid}/gameStorage`;

  let savesSnap;
  try {
    savesSnap = await getDocs(collection(db, 'users', targetUid, 'gameSaves'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, savesPath);
  }

  const saves = [];
  if (savesSnap) {
    savesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && typeof data.gameId === 'string') {
        saves.push({
          gameId: data.gameId,
          savedAt: Number(data.savedAt) || 0,
          playSeconds: Number(data.playSeconds) || 0,
          note: typeof data.note === 'string' ? data.note : '',
        });
      }
    });
  }
  saves.sort((a, b) => b.savedAt - a.savedAt);

  let storageSnap;
  try {
    storageSnap = await getDocs(collection(db, 'users', targetUid, 'gameStorage'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, storagePath);
  }

  const storageEntries = [];
  if (storageSnap) {
    storageSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && typeof data.storageKey === 'string') {
        storageEntries.push({
          gameId: data.gameId || '',
          storageKey: data.storageKey,
          storageValue: typeof data.storageValue === 'string' ? data.storageValue : '',
        });
      }
    });
  }

  return { saves, storageEntries };
}

export async function adminDeleteUserAccount(targetUid, targetUsername = 'Player') {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in as TheGGhampter.');
  }
  if (!targetUid || !ID_REGEX.test(targetUid)) {
    throw new Error('Invalid account ID.');
  }
  if (targetUid === currentUser.uid) {
    throw new Error('You cannot delete the owner account.');
  }

  const savesPath = `users/${targetUid}/gameSaves`;
  const storagePath = `users/${targetUid}/gameStorage`;

  let savesSnap;
  try {
    savesSnap = await getDocs(collection(db, 'users', targetUid, 'gameSaves'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, savesPath);
  }

  let storageSnap;
  try {
    storageSnap = await getDocs(collection(db, 'users', targetUid, 'gameStorage'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, storagePath);
  }

  const subOps = [];
  if (savesSnap) {
    savesSnap.forEach((docSnap) => {
      subOps.push({ type: 'delete', ref: docSnap.ref, path: `${savesPath}/${docSnap.id}` });
    });
  }
  if (storageSnap) {
    storageSnap.forEach((docSnap) => {
      subOps.push({ type: 'delete', ref: docSnap.ref, path: `${storagePath}/${docSnap.id}` });
    });
  }

  if (subOps.length > 0) {
    await commitBatchedWrites(subOps);
  }

  const safeName =
    typeof targetUsername === 'string' && targetUsername.trim()
      ? targetUsername.trim().slice(0, MAX_USERNAME_LEN)
      : 'Player';

  const finalBatch = writeBatch(db);
  finalBatch.set(doc(db, 'deletedAccounts', targetUid), {
    uid: targetUid,
    username: safeName,
    deletedBy: currentUser.uid,
    deletedAt: serverTimestamp(),
  });
  finalBatch.delete(doc(db, 'users', targetUid));

  try {
    await finalBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${targetUid}`);
  }
}

export function validateSuggestionInput({ title, siteUrl, notes }) {
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (cleanTitle.length < MIN_SUGGESTION_TITLE_LEN || cleanTitle.length > MAX_SUGGESTION_TITLE_LEN) {
    return {
      ok: false,
      error: `Please enter a game or site name (${MIN_SUGGESTION_TITLE_LEN}–${MAX_SUGGESTION_TITLE_LEN} characters).`,
    };
  }

  let cleanUrl = typeof siteUrl === 'string' ? siteUrl.trim() : '';
  if (cleanUrl) {
    if (!cleanUrl.includes('://') && !cleanUrl.includes(':') && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }
    if (cleanUrl.length > MAX_SUGGESTION_URL_LEN) {
      return {
        ok: false,
        error: `Website link must be ${MAX_SUGGESTION_URL_LEN} characters or fewer.`,
      };
    }
    try {
      const parsed = new URL(cleanUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          ok: false,
          error: 'Website link must start with https:// or http://.',
        };
      }
      cleanUrl = parsed.href.slice(0, MAX_SUGGESTION_URL_LEN);
    } catch {
      return {
        ok: false,
        error: 'Please enter a valid link (for example https://example.com) or leave it blank.',
      };
    }
  }

  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, MAX_SUGGESTION_NOTES_LEN) : '';

  return {
    ok: true,
    title: cleanTitle,
    siteUrl: cleanUrl,
    notes: cleanNotes,
    error: null,
  };
}

export async function submitGameSuggestion({ title, siteUrl = '', notes = '' }, currentUsername = '') {
  const check = validateSuggestionInput({ title, siteUrl, notes });
  if (!check.ok) {
    throw new Error(check.error);
  }

  const rand = Math.random().toString(36).slice(2, 10);
  const suggestionId = `sug_${Date.now().toString(36)}_${rand}`;
  const path = `gameSuggestions/${suggestionId}`;
  const currentUser = auth.currentUser;

  let submittedByUid = 'guest';
  let submittedByUsername = 'Guest';

  if (currentUser) {
    submittedByUid = currentUser.uid;
    const candidate = currentUsername || getDisplayUsername(currentUser);
    const unameCheck = validateUsername(candidate);
    submittedByUsername = unameCheck.ok ? unameCheck.username : 'Player';
  }

  try {
    await setDoc(doc(db, 'gameSuggestions', suggestionId), {
      suggestionId,
      title: check.title,
      siteUrl: check.siteUrl,
      notes: check.notes,
      submittedByUid,
      submittedByUsername,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return { suggestionId, title: check.title };
}

export async function adminFetchGameSuggestions() {
  const path = 'gameSuggestions';
  let snap;
  try {
    snap = await getDocs(collection(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }

  const suggestions = [];
  if (snap) {
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data || typeof data.title !== 'string') return;
      suggestions.push({
        suggestionId: typeof data.suggestionId === 'string' ? data.suggestionId : docSnap.id,
        title: data.title,
        siteUrl: typeof data.siteUrl === 'string' ? data.siteUrl : '',
        notes: typeof data.notes === 'string' ? data.notes : '',
        submittedByUid: typeof data.submittedByUid === 'string' ? data.submittedByUid : 'guest',
        submittedByUsername:
          typeof data.submittedByUsername === 'string' ? data.submittedByUsername : 'Guest',
        createdAtMs:
          data.createdAt && typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : 0,
      });
    });
  }

  suggestions.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return suggestions;
}

export async function adminDeleteGameSuggestion(suggestionId) {
  if (!suggestionId || !ID_REGEX.test(suggestionId)) {
    throw new Error('Invalid suggestion ID.');
  }
  const path = `gameSuggestions/${suggestionId}`;
  try {
    await deleteDoc(doc(db, 'gameSuggestions', suggestionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
