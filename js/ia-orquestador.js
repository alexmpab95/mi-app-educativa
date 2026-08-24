// ia-orquestador.js — Fase 1, apartado 10.1-10.2 y 4.2 del documento de arquitectura.
//
// Construye el prompt pedagógico y gestiona la ventana de contexto. No habla
// directamente con ningún motor de IA (eso es trabajo de ia-motores.js): esta
// pieza solo decide QUÉ se le pide al modelo, no CÓMO se ejecuta.
//
// Regla de diseño importante (separación 📄/🧠, apartado 4.3): el contenido
// curricular verificado NUNCA pasa por el modelo para que lo "explique con
// sus palabras" y se muestre como si fuera oficial. Se muestra tal cual,
// tomado directamente del JSON local, en su propia tarjeta. Lo único que
// genera el modelo es la conversación de apoyo alrededor de ese contenido.

const MAX_MENSAJES_HISTORIAL = 8; // últimos mensajes (usuario+asistente), no toda la conversación

const NIVELES_AYUDA_PRACTICA = [
  {
    minimo: 0,
    instruccion:
      'No des ninguna pista todavía. Pide al alumno, con una sola pregunta, que te explique con sus propias palabras qué parte del ejercicio le cuesta. No repitas el enunciado ni avances ningún paso.',
  },
  {
    minimo: 1,
    instruccion:
      'Da una pista CONCEPTUAL: qué estrategia, propiedad o tipo de operación hay que aplicar en general, sin usar los números ni los datos concretos del ejercicio del alumno.',
  },
  {
    minimo: 2,
    instruccion:
      'Da una pista más concreta: resuelve un ejemplo parecido pero con otros números o palabras, paso a paso, sin tocar el ejercicio original del alumno.',
  },
  {
    minimo: 3,
    instruccion:
      'El alumno ya ha pedido varias pistas. Puedes guiarle paso a paso por su propio ejercicio, preguntándole qué obtiene en cada paso, en vez de decírselo tú. Sigue sin escribir el resultado final de golpe.',
  },
];

function instruccionParaNivel(nivelAyuda) {
  const nivel = [...NIVELES_AYUDA_PRACTICA].reverse().find((n) => nivelAyuda >= n.minimo);
  return nivel.instruccion;
}

/**
 * Fase 5, apartado 9.1 (dimensión "comprensión"): frase adicional que se añade
 * al system prompt cuando el alumno o la Familia han aceptado explícitamente
 * una adaptación de lenguaje o de instrucciones fragmentadas (nunca se aplica
 * sola, ver js/app.js y js/db.js#guardarConfigAccesibilidad). Vive aquí, no
 * en app.js, para que cualquier lugar que construya un prompt pedagógico
 * (Mi profesor, pistas de control, corrección) pueda reutilizar exactamente
 * la misma redacción.
 */
export function instruccionAccesibilidad(ajustesAccesibilidad) {
  if (!ajustesAccesibilidad) return "";
  let extra = "";
  if (ajustesAccesibilidad.lenguajeSimplificado) {
    extra += " Usa frases muy cortas y vocabulario sencillo, explicando cualquier término poco común en cuanto lo uses.";
  }
  if (ajustesAccesibilidad.instruccionesFragmentadas) {
    extra += " Si das más de un paso, preséntalos siempre como una lista numerada corta, un paso por línea, nunca como un párrafo seguido.";
  }
  return extra;
}

/** Construye el system prompt según el modo (aprendizaje/práctica) y el nivel de ayuda alcanzado. */
export function construirSystemPrompt({ perfil, materiaNombre, modo, nivelAyuda, ajustesAccesibilidad }) {
  const base =
    `Eres un profesor de apoyo escolar para ${perfil.nombre}, que está en ${perfil.cursoNombre} ` +
    `(Comunitat Valenciana), en la materia de ${materiaNombre}. Responde siempre en español, con frases ` +
    `cortas y claras, adecuadas a su edad, sin tono condescendiente. No inventes nunca contenido curricular ` +
    `oficial: si no tienes un fragmento verificado en el contexto, dilo explícitamente en vez de presentar ` +
    `algo como si fuera del currículo oficial.` +
    instruccionAccesibilidad(ajustesAccesibilidad);

  if (modo === "practica") {
    return (
      `${base}\n\nModo PRÁCTICA. Regla estricta que nunca puedes romper: no des la solución completa de un ` +
      `ejercicio como primera respuesta. Sigue esta instrucción de nivel de ayuda: ${instruccionParaNivel(nivelAyuda)}`
    );
  }

  return (
    `${base}\n\nModo APRENDIZAJE: puedes explicar conceptos con más libertad (ejemplos, analogías, preguntas ` +
    `que fomenten que el alumno razone), pero si te pide resolver un ejercicio concreto que no ha intentado ` +
    `todavía, anímale primero a intentarlo con una pista, en vez de resolverlo entero de golpe.`
  );
}

/** Recorta el historial a los últimos turnos, para no degradar la calidad de la respuesta
 * con una ventana de contexto demasiado larga (riesgo técnico 1.4, modelo pequeño). */
export function recortarHistorial(historial) {
  return historial.slice(-MAX_MENSAJES_HISTORIAL);
}

/** Construye la lista de mensajes en el formato que espera el motor de IA (estilo OpenAI/WebLLM). */
export function construirMensajes({ systemPrompt, historial, mensajeNuevo }) {
  const mensajes = [{ role: "system", content: systemPrompt }];
  for (const m of recortarHistorial(historial)) {
    mensajes.push({ role: m.rol === "usuario" ? "user" : "assistant", content: m.texto });
  }
  mensajes.push({ role: "user", content: mensajeNuevo });
  return mensajes;
}

/** Texto de la solución completa: solo se ofrece bajo un botón explícito y gateado por la UI
 * (nunca como primera respuesta), conforme a la regla del modo práctica. */
export function construirPeticionSolucionCompleta() {
  return (
    "El alumno ha pedido explícitamente ver la solución completa, paso a paso, después de haber pedido " +
    "ya varias pistas. Explica el proceso completo con claridad, pero manteniendo el objetivo de que " +
    "entienda el razonamiento, no solo el resultado."
  );
}
