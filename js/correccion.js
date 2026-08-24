// correccion.js — Fase 3, apartados 10.3 y 22 del documento de arquitectura.
//
// Dos correctores distintos, a propósito:
//
//  - Preguntas CERRADAS (opción múltiple, verdadero/falso, respuesta corta):
//    se corrigen con una comparación normalizada, sin IA (nivel 1 de la
//    tabla 4.1). Es determinista y no necesita confirmación humana: no hay
//    ningún juicio que un profesor tenga que revisar.
//
//  - Preguntas ABIERTAS: la IA propone una calificación y un posible patrón
//    de error, pero es SOLO una propuesta (nivel 3-4 de la tabla 4.1). La
//    resolución C5 del análisis previo es estricta: ninguna calificación de
//    una pregunta abierta se consolida en el progreso del alumno sin que la
//    Familia la confirme explícitamente (ver app.js, Panel de la Familia).

export const TIPOS_PREGUNTA = [
  { id: "opcion_multiple", nombre: "Opción múltiple" },
  { id: "verdadero_falso", nombre: "Verdadero / Falso" },
  { id: "respuesta_corta", nombre: "Respuesta corta" },
  { id: "abierta", nombre: "Pregunta abierta" },
];

export const NIVELES_AYUDA_CONTROL = [
  { id: 0, nombre: "Sin ayuda" },
  { id: 1, nombre: "Pista ligera (reformular la pregunta)" },
  { id: 2, nombre: "Pista con ejemplo parecido" },
  { id: 3, nombre: "Pista muy guiada (paso a paso, sin el resultado)" },
];

const PATRONES_ERROR = ["ninguno", "error_de_calculo", "error_conceptual", "respuesta_incompleta", "otro"];

export const ETIQUETAS_PATRON_ERROR = {
  ninguno: "Sin error",
  error_de_calculo: "Posible error de cálculo",
  error_conceptual: "Posible error conceptual",
  respuesta_incompleta: "Respuesta incompleta",
  otro: "Otro (revisar manualmente)",
};

function normalizarTexto(t) {
  return (t || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos, tolera erratas de tildeo
    .replace(/\s+/g, " ");
}

/** Corrige una pregunta cerrada sin IA. Nunca se llama con tipo "abierta". */
export function corregirCerrada(pregunta, respuestaAlumno) {
  if (pregunta.tipo === "opcion_multiple") {
    return { correcta: Number(respuestaAlumno) === Number(pregunta.indiceCorrecta) };
  }
  if (pregunta.tipo === "verdadero_falso") {
    return { correcta: Boolean(respuestaAlumno) === Boolean(pregunta.respuestaCorrecta) };
  }
  if (pregunta.tipo === "respuesta_corta") {
    return { correcta: normalizarTexto(respuestaAlumno) === normalizarTexto(pregunta.respuestaCorrecta) };
  }
  throw new Error(`corregirCerrada no admite el tipo "${pregunta.tipo}"`);
}

export function construirPromptCorreccionAbierta({ pregunta, respuestaAlumno, materiaNombre, ajustesAccesibilidad }) {
  const system =
    `Eres un corrector pedagógico de la materia de ${materiaNombre}, evaluando la respuesta de un alumno a ` +
    `una pregunta abierta de un control. Responde ÚNICAMENTE con un objeto JSON válido, sin explicación ` +
    `adicional ni bloque de código, con este formato exacto: {"calificacion":"correcta"|"parcial"|` +
    `"incorrecta","comentario":"...","patronError":"ninguno"|"error_de_calculo"|"error_conceptual"|` +
    `"respuesta_incompleta"|"otro"}. El campo "patronError" es una hipótesis pedagógica orientativa, no un ` +
    `diagnóstico: usa "ninguno" si la respuesta es correcta. Sé justo pero exigente, y el comentario debe ` +
    `ser una frase breve dirigida directamente al alumno.` +
    (ajustesAccesibilidad?.lenguajeSimplificado ? " El comentario debe usar frases muy cortas y vocabulario sencillo." : "");
  const user = `Pregunta: ${pregunta.enunciado}\nRespuesta del alumno: ${respuestaAlumno && respuestaAlumno.trim() ? respuestaAlumno : "(el alumno no ha respondido)"}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function extraerObjetoJSON(texto) {
  const limpio = texto.replace(/```json/gi, "").replace(/```/g, "").trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1 || fin < inicio) return null;
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

/** Nunca lanza: si no se puede interpretar, devuelve null y quien llama debe
 * tratarlo como "no se ha podido generar una propuesta", nunca como aprobado. */
export function parsearCorreccionAbierta(textoCrudo) {
  const datos = extraerObjetoJSON(textoCrudo || "");
  if (!datos || typeof datos !== "object") return null;
  const calificacion = ["correcta", "parcial", "incorrecta"].includes(datos.calificacion) ? datos.calificacion : "parcial";
  const patronError = PATRONES_ERROR.includes(datos.patronError) ? datos.patronError : "otro";
  const comentario = typeof datos.comentario === "string" ? datos.comentario.slice(0, 600) : "";
  return { calificacion, comentario, patronError };
}

const INSTRUCCIONES_NIVEL_FIJO = {
  1: "Da una pista LIGERA: reformula la pregunta o recuerda qué tipo de concepto hay que aplicar, sin dar ningún dato del resultado.",
  2: "Da una pista con un EJEMPLO PARECIDO (otros datos, no los del enunciado), resuelto, para que el alumno aplique el mismo razonamiento a su pregunta.",
  3: "Da una pista MUY GUIADA: acompaña paso a paso sin escribir tú el resultado final ni la respuesta completa.",
};

/** Pista de nivel FIJO durante un control: a diferencia del modo práctica de "Mi profesor",
 * aquí el nivel no escala con cada petición, respeta siempre el nivel configurado por la Familia. */
export function construirPromptPistaControl({ pregunta, nivelAyuda, materiaNombre, ajustesAccesibilidad }) {
  const system =
    `Eres un profesor de apoyo en la materia de ${materiaNombre}, ayudando a un alumno DURANTE un control. ` +
    `Regla estricta que no puedes romper: nunca das la respuesta ni el resultado final, solo la pista exacta ` +
    `que se te pide, ni más ni menos. ${INSTRUCCIONES_NIVEL_FIJO[nivelAyuda] || INSTRUCCIONES_NIVEL_FIJO[1]}` +
    (ajustesAccesibilidad?.lenguajeSimplificado ? " Usa frases muy cortas y vocabulario sencillo." : "") +
    (ajustesAccesibilidad?.instruccionesFragmentadas ? " Si la pista tiene más de un paso, numera cada paso en una línea distinta." : "");
  const user = `Pregunta del control: ${pregunta.enunciado}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
