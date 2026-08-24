// crypto.js — Cifrado en reposo de los datos locales.
//
// Decisión de diseño (Fase 0, ver apartado 14 del documento de arquitectura):
// en vez de pedir un PIN cada vez que se abre la app (mala experiencia para
// un niño/a que la usa a diario), se genera una clave AES-GCM de 256 bits
// NO EXTRAÍBLE con la Web Crypto API y se guarda el propio objeto CryptoKey
// dentro de IndexedDB. El navegador nunca expone el material de la clave a
// JavaScript, así que un script que lea IndexedDB directamente no puede
// sacar la clave, aunque tampoco es una defensa frente a alguien con acceso
// físico y control total del dispositivo (para eso está el PIN de la
// Familia, que protege el panel de configuración, no el cifrado de datos).
//
// Esto es honesto sobre sus límites: protege los datos "en reposo" frente a
// una lectura casual del almacenamiento del navegador (por ejemplo, si
// alguien copia la carpeta de perfil de Safari), no frente a un atacante
// que ya controla el dispositivo desbloqueado.

const DEVICE_KEY_DB = "educativo_device_key";
const DEVICE_KEY_STORE = "keys";
const DEVICE_KEY_ID = "deviceKey";

function openKeyDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DEVICE_KEY_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DEVICE_KEY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOrCreateDeviceKey() {
  const db = await openKeyDb();
  const existing = await new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_KEY_STORE, "readonly");
    const req = tx.objectStore(DEVICE_KEY_STORE).get(DEVICE_KEY_ID);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (existing) {
    db.close();
    return existing;
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // no extraíble
    ["encrypt", "decrypt"]
  );

  await new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_KEY_STORE, "readwrite");
    tx.objectStore(DEVICE_KEY_STORE).put(key, DEVICE_KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
  return key;
}

function toBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Cifra un objeto JSON con la clave del dispositivo. Devuelve {iv, data} en base64. */
export async function encryptJSON(obj) {
  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: toBase64(iv), data: toBase64(ciphertext) };
}

/** Descifra el resultado de encryptJSON y devuelve el objeto original. */
export async function decryptJSON(payload) {
  const key = await getOrCreateDeviceKey();
  const iv = new Uint8Array(fromBase64(payload.iv));
  const ciphertext = fromBase64(payload.data);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// --- PIN de la Familia: gate del panel de configuración, no se usa para cifrar datos ---

async function pbkdf2Hash(pin, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return toBase64(bits);
}

/** Genera {salt, hash} en base64 a partir de un PIN nuevo. */
export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Hash(pin, salt);
  return { salt: toBase64(salt), hash };
}

/** Comprueba un PIN introducido contra {salt, hash} guardados. */
export async function verifyPin(pin, stored) {
  const salt = new Uint8Array(fromBase64(stored.salt));
  const hash = await pbkdf2Hash(pin, salt);
  return hash === stored.hash;
}
