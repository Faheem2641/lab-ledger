import { supabase } from './supabase';

export type Purchase = {
  id: string;
  item: string;
  details: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  hasReceipt?: boolean;
  receiptUrl?: string;
};

// ── Purchases ───────────────────────────────────────────────────

export async function fetchPurchasesFromSupabase(): Promise<Purchase[]> {
  try {
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.warn('Supabase fetch purchases error, falling back to local:', error.message);
      return getLocalPurchases();
    }

    if (data) {
      const mapped: Purchase[] = data.map((row: any) => ({
        id: row.id,
        item: row.item,
        details: row.details || '',
        description: row.description || '',
        amount: Number(row.amount),
        date: row.date,
        category: row.category || 'Hardware',
        hasReceipt: row.has_receipt || false,
        receiptUrl: row.receipt_url || undefined,
      }));
      // Backup to localStorage
      localStorage.setItem('labPurchases', JSON.stringify(mapped));
      return mapped;
    }
  } catch (err) {
    console.warn('Supabase connection error:', err);
  }
  return getLocalPurchases();
}

export async function savePurchaseToSupabase(purchase: Purchase): Promise<void> {
  // Always update local storage as cache
  const local = getLocalPurchases();
  const existingIdx = local.findIndex((p) => p.id === purchase.id);
  if (existingIdx >= 0) {
    local[existingIdx] = purchase;
  } else {
    local.unshift(purchase);
  }
  localStorage.setItem('labPurchases', JSON.stringify(local));

  try {
    const payload = {
      id: purchase.id,
      item: purchase.item,
      details: purchase.details,
      description: purchase.description || '',
      amount: purchase.amount,
      date: purchase.date,
      category: purchase.category,
      has_receipt: purchase.hasReceipt || false,
      receipt_url: purchase.receiptUrl || null,
    };

    const { error } = await supabase.from('purchases').upsert(payload);
    if (error) console.error('Supabase save purchase error:', error.message);
  } catch (err) {
    console.error('Supabase save error:', err);
  }
}

export async function deletePurchaseFromSupabase(id: string): Promise<void> {
  const local = getLocalPurchases().filter((p) => p.id !== id);
  localStorage.setItem('labPurchases', JSON.stringify(local));

  try {
    const { error } = await supabase.from('purchases').delete().eq('id', id);
    if (error) console.error('Supabase delete purchase error:', error.message);
  } catch (err) {
    console.error('Supabase delete error:', err);
  }
}

// ── Budget ─────────────────────────────────────────────────────

export async function fetchBudgetFromSupabase(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('lab_settings')
      .select('total_budget')
      .eq('id', 1)
      .single();

    if (!error && data) {
      const budget = Number(data.total_budget);
      localStorage.setItem('labTotalBudget', budget.toString());
      return budget;
    }
  } catch (err) {
    console.warn('Supabase fetch budget error:', err);
  }
  const saved = localStorage.getItem('labTotalBudget');
  return saved ? Number(saved) : 10000;
}

export async function saveBudgetToSupabase(amount: number): Promise<void> {
  localStorage.setItem('labTotalBudget', amount.toString());
  try {
    const { error } = await supabase
      .from('lab_settings')
      .upsert({ id: 1, total_budget: amount, updated_at: new Date().toISOString() });

    if (error) console.error('Supabase save budget error:', error.message);
  } catch (err) {
    console.error('Supabase save budget error:', err);
  }
}

// ── Receipts (Storage Bucket & Fallback) ───────────────────────

export async function uploadReceiptImage(id: string, fileOrBase64: File | string): Promise<string | null> {
  try {
    let fileBody: File | Blob;
    if (typeof fileOrBase64 === 'string') {
      const res = await fetch(fileOrBase64);
      fileBody = await res.blob();
    } else {
      fileBody = fileOrBase64;
    }

    const filePath = `receipt_${id}`;
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(filePath, fileBody, { upsert: true });

    if (error) {
      console.warn('Supabase storage upload failed, using IndexedDB fallback:', error.message);
      if (typeof fileOrBase64 === 'string') {
        await saveReceiptImageToIndexedDB(id, fileOrBase64);
      }
      return null;
    }

    const { data: publicUrlData } = supabase.storage.from('receipts').getPublicUrl(filePath);
    return publicUrlData?.publicUrl || null;
  } catch (err) {
    console.warn('Receipt upload exception:', err);
    return null;
  }
}

export async function getReceiptImage(id: string): Promise<string | null> {
  // Check IndexedDB fallback first
  const localData = await getReceiptImageFromIndexedDB(id);
  if (localData) return localData;

  const { data } = supabase.storage.from('receipts').getPublicUrl(`receipt_${id}`);
  return data?.publicUrl || null;
}

export async function deleteReceiptImage(id: string): Promise<void> {
  await deleteReceiptImageFromIndexedDB(id);
  try {
    await supabase.storage.from('receipts').remove([`receipt_${id}`]);
  } catch (e) {}
}

// ── Local Helpers ──────────────────────────────────────────────

function getLocalPurchases(): Purchase[] {
  const saved = localStorage.getItem('labPurchases');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return [];
}

// ── IndexedDB Legacy / Fallback ────────────────────────────────

export const DB_NAME = 'LabBudgetDB';
export const DB_VERSION = 1;
export const STORE_NAME = 'receipts';

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event: Event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function saveReceiptImageToIndexedDB(id: string, base64Data: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(base64Data, id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getReceiptImageFromIndexedDB(id: string): Promise<string | null> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    return null;
  }
}

export async function deleteReceiptImageFromIndexedDB(id: string): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {}
}
