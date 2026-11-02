// Licencias GRTS Pro: claves firmadas con Ed25519, verificadas sin servidor.
// Formato: GRTS-<datos en base64url>.<firma en base64url>
// Los datos son JSON: { v: 1, n: nombre, e: email, p: 'pro', d: 'AAAA-MM-DD', x?: 'AAAA-MM-DD' (vencimiento) }
export const PUBLIC_KEY = 'dbeDX8vuu+S4NMd99ZYPkNNN1Zy2KoeX7lYo58NolIg=';

// Funciones que requieren Pro
export const PRO_CATEGORIES = ['annoyances', 'clean', 'gpc', 'cookies'];

const b64urlToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

let keyPromise = null;
const publicKey = () => (keyPromise ||= crypto.subtle.importKey(
  'raw', Uint8Array.from(atob(PUBLIC_KEY), (c) => c.charCodeAt(0)), { name: 'Ed25519' }, false, ['verify']));

// Devuelve los datos de la licencia si es válida y vigente; si no, null
export async function verifyLicense(key) {
  try {
    key = String(key || '').trim().replace(/\s+/g, '');
    const m = /^GRTS-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key);
    if (!m) return null;
    const data = b64urlToBytes(m[1]);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, await publicKey(), b64urlToBytes(m[2]), data);
    if (!ok) return null;
    const info = JSON.parse(new TextDecoder().decode(data));
    if (info.v !== 1 || info.p !== 'pro') return null;
    if (info.x && new Date(info.x + 'T23:59:59Z') < new Date()) return { ...info, expired: true };
    return info;
  } catch {
    return null;
  }
}
