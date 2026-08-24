// db.js — Capa de almacenamiento local (Fase 0, apartado 3.2 del documento de arquitectura).
// Todo vive en IndexedDB, en el propio dispositivo, sin servidor. Los campos
// sensibles de cada perfil se cifran con crypto.js antes de guardarse
// (cifrado en reposo, apartado 14).

import { encryptJSON, decryptJSON } from "./crypto.js";

const DB_NAME = "educativo_app";
const DB_VERSION = 6;

const STORE_FAMILIA = "familia"; // un único registro, id="familia"
const STORE_PERFILES = "perfiles"; // uno por hijo/a
const STORE_INTERACCIONES = "interacciones"; // registro agregado, Fase 1 (apartado 17)
const STORE_RECURSOS = "recursos"; // recursos generados, Fase 2 (apartado 17)
const STORE_CONTROLES = "controles"; // controles creados por la Familia, Fase 3 (apartado 17)
const STORE_INTENTOS = "intentos"; // intentos de un control por parte de un Alumno, Fase 3
const STORE_AUDITORIA = "auditoria"; // cada calificación confirmada o modificada por la Familia, Fase 3 (apartado 14)
const STORE_PAGINAS_CUADERNO = "paginas_cuaderno"; // páginas del Cuaderno, Fase 4 (apartado 17)
const STORE_CONFIG_ACCESIBILIDAD = "config_accesibilidad"; // un registro por perfil, Fase 5 (apartado 9 y riesgo de privacidad 1.6)
const STORE_SUGERENCIAS_ADAPTACION = "sugerencias_adaptacion"; // nivel "sugerido" del apartado 9.2, Fase 5
const STORE_REPASO_ESPACIADO = "repaso_espaciado"; // repetición espaciada de flashcards, Fase 5 ("Hoy tengo que estudiar")

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FAMILIA)) {
        db.createObjectStore(STORE_FAMILIA, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PERFILES)) {
        db.createObjectStore(STORE_PERFILES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_INTERACCIONES)) {
        const store = db.createObjectStore(STORE_INTERACCIONES, { keyPath: "id", autoIncrement: true });
        store.createIndex("porPerfil", "perfilId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_RECURSOS)) {
        const store = db.createObjectStore(STORE_RECURSOS, { keyPath: "id", autoIncrement: true });
        store.createIndex("porPerfil", "perfilId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CONTROLES)) {
        const store = db.createObjectStore(STORE_CONTROLES, { keyPath: "id", autoIncrement: true });
        store.createIndex("porPerfil", "perfilId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_INTENTOS)) {
        const store = db.createObjectStore(STORE_INTENTOS, { keyPath: "id", autoIncrement: true });
        store.createIndex("porPerfil", "perfilId", { unique: false });
        store.createIndex("porControl", "controlId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_AUDITORIA)) {
        const store = db.createObjectStore(STORE_AUDITORIA, { keyPath: "id", autoIncrement: true });
        store.createIndex("porPerfil", "perfilId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PAGINAS_CUADERNO)) {
        const store = db.createObjectStore(STORE_PAGINAS_CUADERNO, { keyPath: "id", autoIncrement: true });
        store.createIndex("porPerfil", "perfilId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG_ACCESIBILIDAD)) {
        db.createObjectStore(STORE_CONFIG_ACCESIBILIDAD, { keyPath: "perfilId" });
      }
      if (!db.objectStoreNames.contains(STORE_SUGERENCIAS_ADAPTACION)) {
        const store = db.createObjectStore(STORE_SUGERENCIAS_ADAPTACION, { keyPath: "id", autoIncrement: true });
        store.createIndex("porPerfil", "perfilId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_REPASO_ESPACIADO)) {
        const store = db.createObjectStore(STORE_REPASO_ESPACIADO, { keyPath: "id" });
        store.createIndex("porPerfil", "perfilId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Familia ----------

/** Devuelve el registro de familia (nombre en claro, PIN hash en claro -- no es secreto, es un hash) o null si aún no existe. */
export async function getFamilia() {
  const db = await openDb();
  const result = await reqToPromise(tx(db, STORE_FAMILIA, "readonly").get("familia"));
  db.close();
  return result || null;
}

/** Crea la cuenta familiar. pinHash = { salt, hash } de crypto.js#hashPin, o null si no se activa PIN todavía. */
export async function crearFamilia({ nombre, pinHash }) {
  const db = await openDb();
  const registro = {
    id: "familia",
    nombre: nombre || "",
    pinHash: pinHash || null,
    creadaEn: new Date().toISOString(),
  };
  await reqToPromise(tx(db, STORE_FAMILIA, "readwrite").put(registro));
  db.close();
  return registro;
}

export async function actualizarPinFamilia(pinHash) {
  const db = await openDb();
  const actual = await reqToPromise(tx(db, STORE_FAMILIA, "readonly").get("familia"));
  if (!actual) {
    db.close();
    throw new Error("No existe cuenta familiar todavía.");
  }
  actual.pinHash = pinHash;
  await reqToPromise(tx(db, STORE_FAMILIA, "readwrite").put(actual));
  db.close();
  return actual;
}

// ---------- Perfiles de Alumno ----------
//
// Cada perfil se guarda como { id, creadoEn, cifrado: {iv, data} }.
// El contenido real (nombre, curso, materias, avatar) va dentro de "cifrado",
// para que ni siquiera inspeccionando IndexedDB a mano se lean los datos del
// menor en texto plano.

function nuevoId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export async function crearPerfil(datos) {
  const id = nuevoId();
  const cifrado = await encryptJSON(datos);
  const registro = { id, creadoEn: new Date().toISOString(), cifrado };
  const db = await openDb();
  await reqToPromise(tx(db, STORE_PERFILES, "readwrite").put(registro));
  db.close();
  return { id, ...datos };
}

export async function actualizarPerfil(id, datos) {
  const cifrado = await encryptJSON(datos);
  const db = await openDb();
  const actual = await reqToPromise(tx(db, STORE_PERFILES, "readonly").get(id));
  if (!actual) {
    db.close();
    throw new Error("Perfil no encontrado.");
  }
  actual.cifrado = cifrado;
  await reqToPromise(tx(db, STORE_PERFILES, "readwrite").put(actual));
  db.close();
  return { id, ...datos };
}

export async function eliminarPerfil(id) {
  const db = await openDb();
  await reqToPromise(tx(db, STORE_PERFILES, "readwrite").delete(id));
  db.close();
}

/** Lista todos los perfiles, ya descifrados. Aislamiento entre hermanos: cada
 * llamador solo debe mostrar el perfil activo, nunca "fusionar" datos de dos
 * perfiles a la vez (ver apartado 5.5). */
export async function listarPerfiles() {
  const db = await openDb();
  const registros = await reqToPromise(tx(db, STORE_PERFILES, "readonly").getAll());
  db.close();
  const perfiles = await Promise.all(
    registros.map(async (r) => {
      const datos = await decryptJSON(r.cifrado);
      return { id: r.id, creadoEn: r.creadoEn, ...datos };
    })
  );
  return perfiles.sort((a, b) => (a.creadoEn > b.creadoEn ? 1 : -1));
}

export async function obtenerPerfil(id) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_PERFILES, "readonly").get(id));
  db.close();
  if (!registro) return null;
  const datos = await decryptJSON(registro.cifrado);
  return { id: registro.id, creadoEn: registro.creadoEn, ...datos };
}

// ---------- Registro de interacciones con el profesor IA (Fase 1) ----------
//
// Deliberadamente NO se guarda la conversación completa: solo metadatos
// agregados (materia, tema, modo, cuántas pistas se han pedido, si se llegó
// a ver la solución completa). Esto sigue el principio de minimización de
// datos (apartado 39) y evita mezclar este registro ligero con la "memoria
// educativa" completa del alumno, que es una pieza de la Fase 5, no de esta.
// El propio contenido (materia/tema/nivelAyuda) se cifra igual que un perfil.

export async function registrarInteraccion({ perfilId, materiaId, tema, modo, pistasUsadas, solucionMostrada }) {
  const cifrado = await encryptJSON({ materiaId, tema, modo, pistasUsadas, solucionMostrada });
  const registro = { perfilId, fecha: new Date().toISOString(), cifrado };
  const db = await openDb();
  await reqToPromise(tx(db, STORE_INTERACCIONES, "readwrite").add(registro));
  db.close();
}

/** Interacciones de un único perfil, descifradas. Nunca mezclar perfiles distintos en una misma consulta. */
export async function listarInteracciones(perfilId) {
  const db = await openDb();
  const indice = tx(db, STORE_INTERACCIONES, "readonly").index("porPerfil");
  const registros = await reqToPromise(indice.getAll(IDBKeyRange.only(perfilId)));
  db.close();
  const datos = await Promise.all(
    registros.map(async (r) => ({ id: r.id, fecha: r.fecha, ...(await decryptJSON(r.cifrado)) }))
  );
  return datos.sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
}

// ---------- Recursos generados (Fase 2) ----------
//
// Cada recurso guarda su versión actual y un historial de versiones
// anteriores (apartado 37: "versionado desde el primer recurso generado").
// Todo el contenido va cifrado; perfilId se guarda en claro solo como clave
// de índice, igual que en "interacciones".

export async function guardarRecurso({ perfilId, tipo, materiaId, materiaNombre, origen, contenido, fuentesVerificadas }) {
  const ahora = new Date().toISOString();
  const cifrado = await encryptJSON({
    tipo,
    materiaId,
    materiaNombre,
    origen,
    contenido,
    fuentesVerificadas: fuentesVerificadas || [],
    version: 1,
    historialVersiones: [],
    editadoManualmente: false,
    actualizadoEn: ahora,
  });
  const registro = { perfilId, creadoEn: ahora, cifrado };
  const db = await openDb();
  const id = await reqToPromise(tx(db, STORE_RECURSOS, "readwrite").add(registro));
  db.close();
  return id;
}

/** Guarda una edición del contenido, moviendo la versión anterior al historial. */
export async function actualizarRecurso(id, nuevoContenido) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_RECURSOS, "readonly").get(id));
  if (!registro) {
    db.close();
    throw new Error("Recurso no encontrado.");
  }
  const datos = await decryptJSON(registro.cifrado);
  const ahora = new Date().toISOString();
  const historialVersiones = [
    ...(datos.historialVersiones || []),
    { version: datos.version, contenido: datos.contenido, fecha: datos.actualizadoEn },
  ];
  const actualizado = {
    ...datos,
    contenido: nuevoContenido,
    version: datos.version + 1,
    historialVersiones,
    editadoManualmente: true,
    actualizadoEn: ahora,
  };
  registro.cifrado = await encryptJSON(actualizado);
  await reqToPromise(tx(db, STORE_RECURSOS, "readwrite").put(registro));
  db.close();
  return { id, ...actualizado };
}

export async function eliminarRecurso(id) {
  const db = await openDb();
  await reqToPromise(tx(db, STORE_RECURSOS, "readwrite").delete(id));
  db.close();
}

/** Recursos de un único perfil, descifrados. Aislamiento entre hermanos, igual que con los perfiles. */
export async function listarRecursos(perfilId) {
  const db = await openDb();
  const indice = tx(db, STORE_RECURSOS, "readonly").index("porPerfil");
  const registros = await reqToPromise(indice.getAll(IDBKeyRange.only(perfilId)));
  db.close();
  const datos = await Promise.all(
    registros.map(async (r) => ({ id: r.id, creadoEn: r.creadoEn, ...(await decryptJSON(r.cifrado)) }))
  );
  return datos.sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
}

// ---------- Controles (Fase 3, apartado 17; asignaciones diferenciadas, Fase 6 apartado 31) ----------
//
// Un control lo crea la Familia para un perfil de Alumno concreto: título,
// materia, nivel de ayuda IA permitido (fijo para todo el control, no
// escalable libremente como en el modo práctica de "Mi profesor") y sus
// preguntas. perfilId es el ALUMNO destinatario, no quien lo crea (en este
// alcance solo hay un rol Familia, así que no hace falta guardar el autor).
//
// Fase 6 añade la "asignación diferenciada" del apartado 31 (reducida a
// hermanos, no a una clase): un mismo control se puede crear a la vez para
// varios perfiles, cada uno como su PROPIO registro (el almacenamiento
// sigue siendo un control por perfil, como desde la Fase 3 — sin eso, un
// hermano podría ver o modificar sin querer el intento de otro), pero
// enlazados por un `asignacionId` común para poder mostrar en el Panel de
// la Familia que comparten el mismo objetivo. Por defecto comparten
// también las mismas preguntas y criterios (`esExcepcion: false`); si más
// adelante la Familia decide cambiar el contenido para uno en concreto,
// esa decisión se guarda de forma explícita (`esExcepcion: true` y una
// `notaExcepcion` con el motivo), nunca como un cambio silencioso — así lo
// pide el propio apartado 31 ("salvo que el profesor decida expresamente
// variar también el objetivo... esa decisión queda registrada como
// excepción explícita, no como comportamiento por defecto").

export async function guardarControl({
  perfilId,
  titulo,
  materiaId,
  materiaNombre,
  nivelAyudaIA,
  preguntas,
  fechaLimite,
  asignacionId = null,
  esExcepcion = false,
  notaExcepcion = null,
}) {
  const ahora = new Date().toISOString();
  const cifrado = await encryptJSON({
    titulo,
    materiaId,
    materiaNombre,
    nivelAyudaIA,
    preguntas,
    fechaLimite: fechaLimite || null,
    asignacionId: asignacionId || null,
    esExcepcion: !!esExcepcion,
    notaExcepcion: esExcepcion ? notaExcepcion || null : null,
  });
  const registro = { perfilId, creadoEn: ahora, cifrado };
  const db = await openDb();
  const id = await reqToPromise(tx(db, STORE_CONTROLES, "readwrite").add(registro));
  db.close();
  return id;
}

/**
 * Crea el mismo control (mismo título, materia, preguntas, criterios y
 * fecha límite) para varios perfiles a la vez, cada uno como su propio
 * registro independiente, enlazados por un `asignacionId` compartido.
 * `perfiles` es un array de ids de perfil (el primero no tiene que ser
 * ningún "original": todos quedan al mismo nivel).
 */
export async function guardarControlesAsignados({ perfiles, titulo, materiaId, materiaNombre, nivelAyudaIA, preguntas, fechaLimite }) {
  if (!perfiles || perfiles.length < 2) {
    throw new Error("Una asignación diferenciada necesita al menos dos perfiles.");
  }
  const asignacionId = `asig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const creados = [];
  for (const perfilId of perfiles) {
    // Cada perfil recibe una COPIA independiente de las preguntas (no la misma
    // referencia): así, si más adelante se edita una variante como excepción,
    // no se altera por accidente la de sus hermanos.
    const id = await guardarControl({
      perfilId,
      titulo,
      materiaId,
      materiaNombre,
      nivelAyudaIA,
      preguntas: JSON.parse(JSON.stringify(preguntas)),
      fechaLimite,
      asignacionId,
      esExcepcion: false,
      notaExcepcion: null,
    });
    creados.push({ perfilId, id });
  }
  return { asignacionId, creados };
}

export async function listarControles(perfilId) {
  const db = await openDb();
  const indice = tx(db, STORE_CONTROLES, "readonly").index("porPerfil");
  const registros = await reqToPromise(indice.getAll(IDBKeyRange.only(perfilId)));
  db.close();
  const datos = await Promise.all(
    registros.map(async (r) => ({ id: r.id, perfilId: r.perfilId, creadoEn: r.creadoEn, ...(await decryptJSON(r.cifrado)) }))
  );
  return datos.sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
}

export async function obtenerControl(id) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_CONTROLES, "readonly").get(id));
  db.close();
  if (!registro) return null;
  return { id: registro.id, perfilId: registro.perfilId, creadoEn: registro.creadoEn, ...(await decryptJSON(registro.cifrado)) };
}

/** Sustituye los datos de un control ya creado (editar título/materia/nivel/preguntas/fecha
 * límite/excepción de asignación). `asignacionId` normalmente se conserva tal cual estaba
 * (pásalo de vuelta desde el control ya cargado); solo un control recién creado con
 * guardarControlesAsignados debería tenerlo desde el principio. */
export async function actualizarControl(
  id,
  { titulo, materiaId, materiaNombre, nivelAyudaIA, preguntas, fechaLimite, asignacionId = null, esExcepcion = false, notaExcepcion = null }
) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_CONTROLES, "readonly").get(id));
  if (!registro) {
    db.close();
    throw new Error("Control no encontrado.");
  }
  registro.cifrado = await encryptJSON({
    titulo,
    materiaId,
    materiaNombre,
    nivelAyudaIA,
    preguntas,
    fechaLimite: fechaLimite || null,
    asignacionId: asignacionId || null,
    esExcepcion: !!esExcepcion,
    notaExcepcion: esExcepcion ? notaExcepcion || null : null,
  });
  await reqToPromise(tx(db, STORE_CONTROLES, "readwrite").put(registro));
  db.close();
}

export async function eliminarControl(id) {
  const db = await openDb();
  await reqToPromise(tx(db, STORE_CONTROLES, "readwrite").delete(id));
  db.close();
}

// ---------- Intentos de un control (Fase 3) ----------
//
// Cada vez que un Alumno entrega un control se guarda un intento nuevo (se
// puede repetir un control más de una vez). Las preguntas cerradas quedan
// corregidas al momento (sin IA); las abiertas llevan una "propuestaIA" que
// NUNCA cuenta para el progreso hasta que la Familia la confirma
// explícitamente (resolución C5 del análisis previo, apartado 1.1).

export async function guardarIntento({ perfilId, controlId, respuestas, resultados }) {
  const ahora = new Date().toISOString();
  const cifrado = await encryptJSON({ controlId, respuestas, resultados, confirmadoEn: null });
  const registro = { perfilId, controlId, enviadoEn: ahora, cifrado };
  const db = await openDb();
  const id = await reqToPromise(tx(db, STORE_INTENTOS, "readwrite").add(registro));
  db.close();
  return id;
}

export async function listarIntentos(perfilId) {
  const db = await openDb();
  const indice = tx(db, STORE_INTENTOS, "readonly").index("porPerfil");
  const registros = await reqToPromise(indice.getAll(IDBKeyRange.only(perfilId)));
  db.close();
  const datos = await Promise.all(
    registros.map(async (r) => ({ id: r.id, perfilId: r.perfilId, controlId: r.controlId, enviadoEn: r.enviadoEn, ...(await decryptJSON(r.cifrado)) }))
  );
  return datos.sort((a, b) => (a.enviadoEn < b.enviadoEn ? 1 : -1));
}

export async function obtenerIntento(id) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_INTENTOS, "readonly").get(id));
  db.close();
  if (!registro) return null;
  return { id: registro.id, perfilId: registro.perfilId, controlId: registro.controlId, enviadoEn: registro.enviadoEn, ...(await decryptJSON(registro.cifrado)) };
}

/** Sustituye "resultados" (por ejemplo, tras confirmar o modificar una calificación) y,
 * si ya no queda ninguna pregunta abierta sin confirmar, marca confirmadoEn. */
export async function actualizarResultadosIntento(id, nuevosResultados) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_INTENTOS, "readonly").get(id));
  if (!registro) {
    db.close();
    throw new Error("Intento no encontrado.");
  }
  const datos = await decryptJSON(registro.cifrado);
  const todoConfirmado = nuevosResultados.every((r) => r.tipo !== "abierta" || r.confirmada);
  const actualizado = { ...datos, resultados: nuevosResultados, confirmadoEn: todoConfirmado ? new Date().toISOString() : null };
  registro.cifrado = await encryptJSON(actualizado);
  await reqToPromise(tx(db, STORE_INTENTOS, "readwrite").put(registro));
  db.close();
  return { id, ...actualizado };
}

// ---------- Auditoría de calificaciones (Fase 3, apartado 14) ----------
//
// Se registra cada vez que la Familia confirma o modifica una propuesta de
// calificación de IA, tal como pide el apartado de seguridad de esta fase.

export async function registrarAuditoria({ perfilId, controlId, intentoId, preguntaId, accion, calificacionPropuesta, calificacionFinal }) {
  const cifrado = await encryptJSON({ controlId, intentoId, preguntaId, accion, calificacionPropuesta, calificacionFinal });
  const registro = { perfilId, fecha: new Date().toISOString(), cifrado };
  const db = await openDb();
  await reqToPromise(tx(db, STORE_AUDITORIA, "readwrite").add(registro));
  db.close();
}

export async function listarAuditoria(perfilId) {
  const db = await openDb();
  const indice = tx(db, STORE_AUDITORIA, "readonly").index("porPerfil");
  const registros = await reqToPromise(indice.getAll(IDBKeyRange.only(perfilId)));
  db.close();
  const datos = await Promise.all(
    registros.map(async (r) => ({ id: r.id, fecha: r.fecha, ...(await decryptJSON(r.cifrado)) }))
  );
  return datos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

// ---------- Cuaderno (Fase 4, apartados 2.2 y 17) ----------
//
// Una página de cuaderno guarda trazos vectoriales (ver js/lienzo.js) y/o
// texto libre, organizada por materia, tema, fecha y etiquetas. El vínculo
// con "recursos" (Fase 2) que pide el documento (apartado 17, Fase 4:
// "vínculo entre página de cuaderno y recursos derivados") se guarda como
// una simple lista de ids de recurso generados a partir de esta página.
// Si la página incluye una foto (por ejemplo desde "Escanea y aprende"),
// solo se guarda cuando el Alumno lo pide explícitamente (apartado 15.3:
// las imágenes se descartan tras extraer su contenido salvo guardado
// explícito); por eso fotoDataUrl es siempre opcional.

export async function guardarPaginaCuaderno({ perfilId, materiaId, materiaNombre, tema, etiquetas, texto, trazos, fotoDataUrl }) {
  const ahora = new Date().toISOString();
  const cifrado = await encryptJSON({
    materiaId,
    materiaNombre,
    tema: tema || "",
    etiquetas: etiquetas || [],
    texto: texto || "",
    trazos: trazos || [],
    fotoDataUrl: fotoDataUrl || null,
    recursosDerivados: [],
    actualizadoEn: ahora,
  });
  const registro = { perfilId, creadoEn: ahora, cifrado };
  const db = await openDb();
  const id = await reqToPromise(tx(db, STORE_PAGINAS_CUADERNO, "readwrite").add(registro));
  db.close();
  return id;
}

export async function listarPaginasCuaderno(perfilId) {
  const db = await openDb();
  const indice = tx(db, STORE_PAGINAS_CUADERNO, "readonly").index("porPerfil");
  const registros = await reqToPromise(indice.getAll(IDBKeyRange.only(perfilId)));
  db.close();
  const datos = await Promise.all(
    registros.map(async (r) => ({ id: r.id, perfilId: r.perfilId, creadoEn: r.creadoEn, ...(await decryptJSON(r.cifrado)) }))
  );
  return datos.sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
}

export async function obtenerPaginaCuaderno(id) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_PAGINAS_CUADERNO, "readonly").get(id));
  db.close();
  if (!registro) return null;
  return { id: registro.id, perfilId: registro.perfilId, creadoEn: registro.creadoEn, ...(await decryptJSON(registro.cifrado)) };
}

/** Sustituye materia/tema/etiquetas/texto/trazos/foto de una página ya creada. */
export async function actualizarPaginaCuaderno(id, { materiaId, materiaNombre, tema, etiquetas, texto, trazos, fotoDataUrl }) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_PAGINAS_CUADERNO, "readonly").get(id));
  if (!registro) {
    db.close();
    throw new Error("Página de cuaderno no encontrada.");
  }
  const datos = await decryptJSON(registro.cifrado);
  const actualizado = {
    ...datos,
    materiaId,
    materiaNombre,
    tema: tema || "",
    etiquetas: etiquetas || [],
    texto: texto || "",
    trazos: trazos || [],
    fotoDataUrl: fotoDataUrl === undefined ? datos.fotoDataUrl : fotoDataUrl,
    actualizadoEn: new Date().toISOString(),
  };
  registro.cifrado = await encryptJSON(actualizado);
  await reqToPromise(tx(db, STORE_PAGINAS_CUADERNO, "readwrite").put(registro));
  db.close();
}

/** Añade el id de un recurso generado a partir del texto de esta página (vínculo cuaderno -> recurso). */
export async function vincularRecursoAPagina(paginaId, recursoId) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_PAGINAS_CUADERNO, "readonly").get(paginaId));
  if (!registro) {
    db.close();
    return;
  }
  const datos = await decryptJSON(registro.cifrado);
  datos.recursosDerivados = [...(datos.recursosDerivados || []), recursoId];
  registro.cifrado = await encryptJSON(datos);
  await reqToPromise(tx(db, STORE_PAGINAS_CUADERNO, "readwrite").put(registro));
  db.close();
}

export async function eliminarPaginaCuaderno(id) {
  const db = await openDb();
  await reqToPromise(tx(db, STORE_PAGINAS_CUADERNO, "readwrite").delete(id));
  db.close();
}

// ---------- Configuración de accesibilidad (Fase 5, apartado 9 y riesgo de privacidad 1.6) ----------
//
// Un único registro por perfil, cifrado igual que el resto (esta app no tiene
// un segundo nivel de cifrado distinto del resto de datos sensibles del
// menor; se documenta con honestidad en LEEME.md en vez de afirmar un
// "cifrado reforzado" que no existe de verdad en este alcance). Se guarda
// también un historial de activaciones con su nivel (manual/sugerido/
// automático) y su justificación, tal como pide el apartado 5.3 con
// "AdaptaciónAplicada".

export async function obtenerConfigAccesibilidad(perfilId) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_CONFIG_ACCESIBILIDAD, "readonly").get(perfilId));
  db.close();
  if (!registro) return null;
  return { perfilId, ...(await decryptJSON(registro.cifrado)) };
}

/**
 * Actualiza uno o varios ajustes de accesibilidad. `origen` describe el nivel
 * de aplicación (apartado 9.2: manual/sugerido/automático — "automático" no
 * se usa todavía en esta fase, ver LEEME.md) y su justificación, y solo se
 * añade al historial para los ajustes cuyo valor realmente cambia.
 */
export async function guardarConfigAccesibilidad(perfilId, ajustes, origen) {
  const nivelOrigen = origen?.nivel || "manual";
  const justificacionOrigen =
    origen?.justificacion || "Cambiado directamente por el alumno o la Familia en Configuración de accesibilidad.";
  const db = await openDb();
  const registroActual = await reqToPromise(tx(db, STORE_CONFIG_ACCESIBILIDAD, "readonly").get(perfilId));
  const datosActuales = registroActual ? await decryptJSON(registroActual.cifrado) : { ajustes: {}, historialActivaciones: [] };
  const historialActivaciones = [...(datosActuales.historialActivaciones || [])];
  const ahora = new Date().toISOString();
  for (const [clave, valor] of Object.entries(ajustes)) {
    if (datosActuales.ajustes?.[clave] !== valor) {
      historialActivaciones.push({ clave, valor, nivel: nivelOrigen, justificacion: justificacionOrigen, fecha: ahora });
    }
  }
  const nuevo = {
    ajustes: { ...datosActuales.ajustes, ...ajustes },
    historialActivaciones,
    actualizadoEn: ahora,
  };
  const cifrado = await encryptJSON(nuevo);
  await reqToPromise(tx(db, STORE_CONFIG_ACCESIBILIDAD, "readwrite").put({ perfilId, cifrado }));
  db.close();
  return { perfilId, ...nuevo };
}

// ---------- Adaptaciones sugeridas (Fase 5, apartado 9.2 nivel "sugerido") ----------
//
// Una sugerencia nunca se aplica sola: queda "pendiente" hasta que el alumno
// o la Familia la acepta o la rechaza de forma explícita (criterio de
// aceptación de la Fase 5). Guarda también la evidencia que la origina, para
// el panel de explicabilidad del apartado 9.3.

export async function guardarSugerenciaAdaptacion({ perfilId, clave, materiaId, materiaNombre, criterioTexto, adaptaciones, evidencia }) {
  const ahora = new Date().toISOString();
  const cifrado = await encryptJSON({
    clave,
    materiaId,
    materiaNombre,
    criterioTexto: criterioTexto || null,
    adaptaciones,
    evidencia,
    estado: "pendiente",
    respondidaEn: null,
  });
  const registro = { perfilId, creadoEn: ahora, cifrado };
  const db = await openDb();
  const id = await reqToPromise(tx(db, STORE_SUGERENCIAS_ADAPTACION, "readwrite").add(registro));
  db.close();
  return id;
}

export async function listarSugerenciasAdaptacion(perfilId) {
  const db = await openDb();
  const indice = tx(db, STORE_SUGERENCIAS_ADAPTACION, "readonly").index("porPerfil");
  const registros = await reqToPromise(indice.getAll(IDBKeyRange.only(perfilId)));
  db.close();
  const datos = await Promise.all(
    registros.map(async (r) => ({ id: r.id, perfilId: r.perfilId, creadoEn: r.creadoEn, ...(await decryptJSON(r.cifrado)) }))
  );
  return datos.sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
}

/** estado: "aceptada" o "rechazada". Nunca se vuelve a "pendiente" desde aquí. */
export async function responderSugerenciaAdaptacion(id, estado) {
  const db = await openDb();
  const registro = await reqToPromise(tx(db, STORE_SUGERENCIAS_ADAPTACION, "readonly").get(id));
  if (!registro) {
    db.close();
    throw new Error("Sugerencia no encontrada.");
  }
  const datos = await decryptJSON(registro.cifrado);
  datos.estado = estado;
  datos.respondidaEn = new Date().toISOString();
  registro.cifrado = await encryptJSON(datos);
  await reqToPromise(tx(db, STORE_SUGERENCIAS_ADAPTACION, "readwrite").put(registro));
  db.close();
  return { id, perfilId: registro.perfilId, ...datos };
}

// ---------- Repetición espaciada de flashcards (Fase 5, "📅 Hoy tengo que estudiar") ----------
//
// Una flashcard vive dentro del "contenido" de un recurso (Fase 2), no como
// entidad propia, así que se identifica por (recursoId, índice dentro del
// array de flashcards de ese recurso). Si se edita el recurso y cambia el
// orden de las flashcards, el repaso programado puede quedar desalineado con
// la flashcard "correcta": es una simplificación conocida de esta primera
// versión, documentada en LEEME.md.
//
// El intervalo se recalcula con una versión simplificada de SM-2 (no la
// fórmula completa con factor de facilidad continuo, sino tres pasos fijos
// crecientes según la dificultad indicada), suficiente para un uso personal.

function idRepaso(perfilId, recursoId, indiceFlashcard) {
  return `${perfilId}::${recursoId}::${indiceFlashcard}`;
}

/** resultado: "otra_vez" | "dificil" | "normal" | "facil". */
export async function registrarRepasoFlashcard({ perfilId, recursoId, indiceFlashcard, resultado }) {
  const db = await openDb();
  const id = idRepaso(perfilId, recursoId, indiceFlashcard);
  const registroExistente = await reqToPromise(tx(db, STORE_REPASO_ESPACIADO, "readonly").get(id));
  const anterior = registroExistente ? await decryptJSON(registroExistente.cifrado) : { intervaloDias: 0, repeticiones: 0, racha: 0 };

  const ahora = new Date();
  let { intervaloDias, repeticiones, racha } = anterior;
  if (resultado === "otra_vez") {
    intervaloDias = 0;
    repeticiones = 0;
    racha = 0;
  } else {
    repeticiones += 1;
    racha += 1;
    if (repeticiones === 1) intervaloDias = 1;
    else if (repeticiones === 2) intervaloDias = 3;
    else {
      const factor = resultado === "facil" ? 2.3 : resultado === "dificil" ? 1.3 : 1.8;
      intervaloDias = Math.max(1, Math.round((intervaloDias || 1) * factor));
    }
  }
  const proximaRevision = new Date(ahora.getTime() + intervaloDias * 24 * 60 * 60 * 1000).toISOString();
  const datos = {
    intervaloDias,
    repeticiones,
    racha,
    ultimaRevision: ahora.toISOString(),
    proximaRevision,
    ultimoResultado: resultado,
  };
  const cifrado = await encryptJSON(datos);
  await reqToPromise(tx(db, STORE_REPASO_ESPACIADO, "readwrite").put({ id, perfilId, recursoId, indiceFlashcard, cifrado }));
  db.close();
  return datos;
}

export async function listarRepasoFlashcards(perfilId) {
  const db = await openDb();
  const indice = tx(db, STORE_REPASO_ESPACIADO, "readonly").index("porPerfil");
  const registros = await reqToPromise(indice.getAll(IDBKeyRange.only(perfilId)));
  db.close();
  const datos = await Promise.all(
    registros.map(async (r) => ({
      recursoId: r.recursoId,
      indiceFlashcard: r.indiceFlashcard,
      ...(await decryptJSON(r.cifrado)),
    }))
  );
  return datos;
}
