import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  Unsubscribe
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { BaselineOrderMode, PetStop, ServiceCategory, Species, UrgencyLevel, Weekday, WEEKDAYS } from '../types';

export interface UserWorkspaceDoc {
  businessName: string;
  fuelPricePerLitre: number;
  fuelConsumptionLPer100Km: number;
  maxShiftHours?: number;
  fleetSize?: number;
  workingDaysPerMonth?: number;
  avgPricePerVisitZar?: number;
  grossMarginPercent?: number;
  baselineMode?: BaselineOrderMode;
  pastedOrderText?: string;
  breakEvenMonthlyFeeZar?: number;
  departureMinutes?: number;
}

const VALID_SPECIES: Species[] = ['dog', 'cat', 'bunny', 'alpaca', 'capybara'];
const VALID_CATEGORIES: ServiceCategory[] = ['pool', 'pest', 'garden'];
const VALID_URGENCY: UrgencyLevel[] = ['critical', 'high', 'standard'];

export function isDepotStop(stop: Pick<PetStop, 'id'>): boolean {
  return !stop.id || stop.id === 'depot' || stop.id.startsWith('depot-');
}

export function sanitizeDocId(rawId: string): string {
  const cleaned = (rawId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `cust_${Date.now()}`;
}

function clampString(val: unknown, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

function clampAvatar(val: unknown): string {
  const str = String(val ?? '💧').trim() || '💧';
  let out = '';
  for (const ch of Array.from(str)) {
    if ((out + ch).length > 16) break;
    out += ch;
  }
  return out || '💧';
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildMutableWorkspaceFields(workspace: UserWorkspaceDoc): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    businessName: clampString(workspace.businessName || 'Hamba Services', 100) || 'Hamba Services',
    fuelPricePerLitre: clampNumber(workspace.fuelPricePerLitre, 0.01, 250, 30),
    fuelConsumptionLPer100Km: clampNumber(workspace.fuelConsumptionLPer100Km, 0.01, 100, 10)
  };

  if (workspace.maxShiftHours !== undefined) {
    payload.maxShiftHours = clampNumber(workspace.maxShiftHours, 1, 24, 9);
  }
  if (workspace.fleetSize !== undefined) {
    payload.fleetSize = clampNumber(workspace.fleetSize, 1, 20, 3);
  }
  if (workspace.workingDaysPerMonth !== undefined) {
    payload.workingDaysPerMonth = clampNumber(workspace.workingDaysPerMonth, 1, 31, 21);
  }
  if (workspace.avgPricePerVisitZar !== undefined) {
    payload.avgPricePerVisitZar = clampNumber(workspace.avgPricePerVisitZar, 0, 100000, 520);
  }
  if (workspace.grossMarginPercent !== undefined) {
    payload.grossMarginPercent = clampNumber(workspace.grossMarginPercent, 0, 100, 30);
  }
  if (workspace.baselineMode && ['suburb', 'alphabetical', 'pasted'].includes(workspace.baselineMode)) {
    payload.baselineMode = workspace.baselineMode;
  }
  if (workspace.pastedOrderText !== undefined) {
    payload.pastedOrderText = String(workspace.pastedOrderText).slice(0, 20000);
  }
  if (workspace.breakEvenMonthlyFeeZar !== undefined) {
    payload.breakEvenMonthlyFeeZar = clampNumber(workspace.breakEvenMonthlyFeeZar, 0, 500000, 1500);
  }
  if (workspace.departureMinutes !== undefined) {
    payload.departureMinutes = clampNumber(workspace.departureMinutes, 0, 1439, 420);
  }

  return payload;
}

/**
 * Sanitizes a PetStop into mutable fields strictly conforming to firestore.rules.
 * Strips ephemeral simulation fields (actualArrival, actualDeparture, waitTimeMinutes, timeWindowStatus) and undefined values.
 */
function buildMutableCustomerFields(stop: PetStop, isUpdate: boolean): Record<string, unknown> {
  const lat = clampNumber(stop.location?.lat, -90, 90, -26.1076);
  const lng = clampNumber(stop.location?.lng, -180, 180, 28.0567);
  const location: Record<string, number> = { lat, lng };
  if (typeof stop.location?.altitude === 'number' && Number.isFinite(stop.location.altitude)) {
    location.altitude = stop.location.altitude;
  }

  const startStr = clampString(stop.timeWindow?.start || '07:00', 10) || '07:00';
  const endStr = clampString(stop.timeWindow?.end || '16:00', 10) || '16:00';
  const status = ['pending', 'in-grooming', 'completed'].includes(stop.status) ? stop.status : 'pending';

  const payload: Record<string, unknown> = {
    name: clampString(stop.name || 'Customer Visit', 120) || 'Customer Visit',
    phone: clampString(stop.phone && stop.phone.trim() ? stop.phone : '+27 11 000 0000', 32) || '+27 11 000 0000',
    address: clampString(stop.address || 'Johannesburg, South Africa', 300) || 'Johannesburg, South Africa',
    location,
    serviceType: clampString(stop.serviceType || 'Pool Cleaning', 160) || 'Pool Cleaning',
    serviceCost: clampNumber(stop.serviceCost, 0, 100000, 450),
    durationMin: clampNumber(Math.round(Number(stop.durationMin || 25)), 1, 480, 25),
    timeWindow: { start: startStr, end: endStr },
    status
  };

  if (typeof stop.order === 'number' && Number.isFinite(stop.order)) {
    payload.order = clampNumber(stop.order, 0, 10000, 1);
  }
  if (stop.ownerName !== undefined) {
    payload.ownerName = clampString(stop.ownerName, 120);
  }
  if (stop.breed !== undefined) {
    payload.breed = clampString(stop.breed, 120);
  }
  if (stop.species && VALID_SPECIES.includes(stop.species)) {
    payload.species = stop.species;
  }
  if (stop.serviceCategory && VALID_CATEGORIES.includes(stop.serviceCategory)) {
    payload.serviceCategory = stop.serviceCategory;
  }
  if (stop.suburb !== undefined) {
    payload.suburb = clampString(stop.suburb, 80);
  }
  if (stop.weeklyFrequency !== undefined) {
    payload.weeklyFrequency = clampString(stop.weeklyFrequency, 80);
  }
  if (stop.avatar !== undefined) {
    payload.avatar = clampAvatar(stop.avatar);
  }
  if (stop.personality !== undefined) {
    payload.personality = clampString(stop.personality, 300);
  }
  if (stop.urgency && VALID_URGENCY.includes(stop.urgency)) {
    payload.urgency = stop.urgency;
  }
  if (typeof stop.mudLevel === 'number' && Number.isFinite(stop.mudLevel)) {
    payload.mudLevel = stop.mudLevel;
  }
  if (typeof stop.fluffFactor === 'number' && Number.isFinite(stop.fluffFactor)) {
    payload.fluffFactor = stop.fluffFactor;
  }
  if (stop.specialInstructions !== undefined) {
    payload.specialInstructions = clampString(stop.specialInstructions, 300);
  }
  const cleanedNotes = stop.notes !== undefined ? clampString(stop.notes, 500) : '';
  if (cleanedNotes) {
    payload.notes = cleanedNotes;
  } else if (isUpdate) {
    payload.notes = deleteField();
  }
  if (stop.funnyQuote !== undefined) {
    payload.funnyQuote = clampString(stop.funnyQuote, 300);
  }
  if (typeof stop.isPinned === 'boolean') {
    payload.isPinned = stop.isPinned;
  }
  if (stop.assignedVanId) {
    payload.assignedVanId = clampString(stop.assignedVanId, 32);
  } else if (isUpdate) {
    payload.assignedVanId = deleteField();
  }

  if (typeof stop.vanOrder === 'number' && Number.isFinite(stop.vanOrder)) {
    payload.vanOrder = stop.vanOrder;
  } else if (isUpdate) {
    payload.vanOrder = deleteField();
  }

  if (stop.assignedWeekday && WEEKDAYS.includes(stop.assignedWeekday)) {
    payload.assignedWeekday = stop.assignedWeekday as Weekday;
  } else if (isUpdate) {
    payload.assignedWeekday = deleteField();
  }

  if (typeof stop.weekdayOrder === 'number' && Number.isFinite(stop.weekdayOrder)) {
    payload.weekdayOrder = stop.weekdayOrder;
  } else if (isUpdate) {
    payload.weekdayOrder = deleteField();
  }

  return payload;
}

export function subscribeToUserWorkspace(
  uid: string,
  onData: (workspace: UserWorkspaceDoc | null, exists: boolean) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null, false);
        return;
      }
      const d = snap.data();
      onData(
        {
          businessName: typeof d.businessName === 'string' ? d.businessName : 'Hamba Services',
          fuelPricePerLitre: typeof d.fuelPricePerLitre === 'number' ? d.fuelPricePerLitre : 30,
          fuelConsumptionLPer100Km: typeof d.fuelConsumptionLPer100Km === 'number' ? d.fuelConsumptionLPer100Km : 10,
          maxShiftHours: typeof d.maxShiftHours === 'number' ? d.maxShiftHours : undefined,
          fleetSize: typeof d.fleetSize === 'number' ? d.fleetSize : undefined,
          workingDaysPerMonth: typeof d.workingDaysPerMonth === 'number' ? d.workingDaysPerMonth : undefined,
          avgPricePerVisitZar: typeof d.avgPricePerVisitZar === 'number' ? d.avgPricePerVisitZar : undefined,
          grossMarginPercent: typeof d.grossMarginPercent === 'number' ? d.grossMarginPercent : undefined,
          baselineMode: ['suburb', 'alphabetical', 'pasted'].includes(d.baselineMode) ? d.baselineMode : undefined,
          pastedOrderText: typeof d.pastedOrderText === 'string' ? d.pastedOrderText : undefined,
          breakEvenMonthlyFeeZar: typeof d.breakEvenMonthlyFeeZar === 'number' ? d.breakEvenMonthlyFeeZar : undefined,
          departureMinutes: typeof d.departureMinutes === 'number' ? d.departureMinutes : undefined
        },
        true
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

export async function saveUserWorkspace(
  uid: string,
  workspace: UserWorkspaceDoc,
  workspaceExists: boolean
): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const mutableFields = buildMutableWorkspaceFields(workspace);

  try {
    if (!workspaceExists) {
      await setDoc(ref, {
        ...mutableFields,
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(ref, {
        ...mutableFields,
        updatedAt: serverTimestamp()
      });
    }
  } catch (err) {
    handleFirestoreError(err, workspaceExists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export function subscribeToCustomers(
  uid: string,
  onData: (stops: PetStop[], customerIds: Set<string>) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `users/${uid}/customers`;
  const q = query(collection(db, 'users', uid, 'customers'), orderBy('order', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const ids = new Set<string>();
      const customers: PetStop[] = [];
      snapshot.docs.forEach((docSnap, idx) => {
        ids.add(docSnap.id);
        const d = docSnap.data();
        customers.push({
          id: docSnap.id,
          order: typeof d.order === 'number' ? d.order : idx + 2,
          name: String(d.name || 'Customer Visit'),
          ownerName: String(d.ownerName || d.name || 'Customer'),
          breed: String(d.breed || `${d.suburb || 'Johannesburg'} • ${d.serviceType || 'Service'}`),
          species: VALID_SPECIES.includes(d.species) ? d.species : 'dog',
          serviceCategory: VALID_CATEGORIES.includes(d.serviceCategory) ? d.serviceCategory : undefined,
          suburb: typeof d.suburb === 'string' ? d.suburb : undefined,
          phone: typeof d.phone === 'string' ? d.phone : undefined,
          weeklyFrequency: typeof d.weeklyFrequency === 'string' ? d.weeklyFrequency : undefined,
          avatar: String(d.avatar || '💧'),
          address: String(d.address || ''),
          location: {
            lat: Number(d.location?.lat ?? -26.1076),
            lng: Number(d.location?.lng ?? 28.0567),
            ...(typeof d.location?.altitude === 'number' ? { altitude: d.location.altitude } : {})
          },
          serviceType: String(d.serviceType || 'Pool Cleaning'),
          serviceCost: Number(d.serviceCost ?? 450),
          personality: String(d.personality || ''),
          urgency: VALID_URGENCY.includes(d.urgency) ? d.urgency : 'standard',
          mudLevel: typeof d.mudLevel === 'number' ? d.mudLevel : 30,
          fluffFactor: typeof d.fluffFactor === 'number' ? d.fluffFactor : 50,
          timeWindow: {
            start: String(d.timeWindow?.start || '07:00'),
            end: String(d.timeWindow?.end || '16:00')
          },
          durationMin: Number(d.durationMin ?? 25),
          specialInstructions: String(d.specialInstructions || ''),
          ...(typeof d.notes === 'string' && d.notes.trim() ? { notes: d.notes } : {}),
          funnyQuote: String(d.funnyQuote || ''),
          status: ['pending', 'in-grooming', 'completed'].includes(d.status) ? d.status : 'pending',
          isPinned: typeof d.isPinned === 'boolean' ? d.isPinned : undefined,
          assignedVanId: typeof d.assignedVanId === 'string' ? d.assignedVanId : undefined,
          vanOrder: typeof d.vanOrder === 'number' ? d.vanOrder : undefined,
          assignedWeekday: WEEKDAYS.includes(d.assignedWeekday) ? d.assignedWeekday : undefined,
          weekdayOrder: typeof d.weekdayOrder === 'number' ? d.weekdayOrder : undefined
        });
      });

      onData(customers, ids);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    }
  );
}

export async function upsertCustomerStop(
  uid: string,
  stop: PetStop,
  existsInFirestore: boolean
): Promise<string> {
  if (isDepotStop(stop)) return stop.id;
  const docId = sanitizeDocId(stop.id);
  const path = `users/${uid}/customers/${docId}`;
  const ref = doc(db, 'users', uid, 'customers', docId);

  try {
    if (!existsInFirestore) {
      await setDoc(ref, {
        ...buildMutableCustomerFields(stop, false),
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(ref, {
        ...buildMutableCustomerFields(stop, true),
        updatedAt: serverTimestamp()
      });
    }
    return docId;
  } catch (err) {
    handleFirestoreError(err, existsInFirestore ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCustomerStop(uid: string, customerId: string): Promise<void> {
  const docId = sanitizeDocId(customerId);
  const path = `users/${uid}/customers/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'customers', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncCustomerListToFirestore(
  uid: string,
  nextStops: PetStop[],
  knownIds: Set<string>
): Promise<Set<string>> {
  const path = `users/${uid}/customers`;
  const customerStops = nextStops.filter((s) => !isDepotStop(s));
  const nextIds = new Set<string>();

  type PendingOp =
    | { type: 'create'; id: string; data: Record<string, unknown> }
    | { type: 'update'; id: string; data: Record<string, unknown> }
    | { type: 'delete'; id: string };

  const ops: PendingOp[] = [];

  customerStops.forEach((stop, index) => {
    const docId = sanitizeDocId(stop.id);
    nextIds.add(docId);
    const normalizedStop: PetStop = {
      ...stop,
      id: docId,
      order: stop.order && stop.order >= 2 ? stop.order : index + 2
    };
    const isExisting = knownIds.has(docId);
    if (isExisting) {
      ops.push({
        type: 'update',
        id: docId,
        data: {
          ...buildMutableCustomerFields(normalizedStop, true),
          updatedAt: serverTimestamp()
        }
      });
    } else {
      ops.push({
        type: 'create',
        id: docId,
        data: {
          ...buildMutableCustomerFields(normalizedStop, false),
          ownerUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      });
    }
  });

  knownIds.forEach((existingId) => {
    if (!nextIds.has(existingId)) {
      ops.push({ type: 'delete', id: existingId });
    }
  });

  const CHUNK_SIZE = 450;
  try {
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const op of chunk) {
        const ref = doc(db, 'users', uid, 'customers', op.id);
        if (op.type === 'create') batch.set(ref, op.data);
        else if (op.type === 'update') batch.update(ref, op.data);
        else batch.delete(ref);
      }
      await batch.commit();
    }
    return nextIds;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteAllUserData(uid: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'customers'));
    const docRefs = snap.docs.map((d) => d.ref);

    const CHUNK_SIZE = 450;
    for (let i = 0; i < docRefs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      docRefs.slice(i, i + CHUNK_SIZE).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, 'users', uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
