// Almacén clave/valor en IndexedDB, compartido por el service worker y el actualizador.
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('mbp', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('kv', mode);
    const req = fn(t.objectStore('kv'));
    t.oncomplete = () => { db.close(); res(req && req.result); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
};

export const idbGet = (k) => tx('readonly', (s) => s.get(k));
export const idbSet = (k, v) => tx('readwrite', (s) => s.put(v, k));
export const idbDel = (k) => tx('readwrite', (s) => s.delete(k));
