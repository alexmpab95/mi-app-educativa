// generador.js — Fase 2, apartado 2.2 y 4.2 del documento de arquitectura.
//
// Motor único de generación de contenido: resumen, esquema, flashcards y
// ejercicios, a partir de currículo verificado o de material importado por
// el usuario (texto pegado o un archivo .txt/.md). Consolida en una sola
// pieza lo que el prompt original describía como varias funciones distintas
// (ver 1.2 del análisis previo: "Motor de generación de contenido").
//
// Regla que no se negocia (apartado 4.3 y C1 del análisis previo): el
// modelo NUNCA es la fuente de una cita curricular. Si el recurso se basa en
// currículo, el fragmento verificado que se muestra al lado del recurso
// generado es siempre el que este módulo copia tal cual del JSON local, no
// algo que el modelo diga haber citado. Esto es lo que permite comprobar
// automáticamente que "ningún recurso generado cita un criterio de
// evaluación inexistente o incorrecto" (plan de pruebas de la Fase 2):
// comprobamos la tarjeta verificada contra el JSON, no la prosa del modelo.

export const TIPOS_RECURSO = [
  { id: "resumen", nombre: "Resumen", icono: "📝" },
  { id: "esquema", nombre: "Esquema", icono: "🗂️" },
  { id: "flashcards", nombre: "Flashcards", icono: "🃏" },
  { id: "ejercicios", nombre: "Ejercicios", icono: "✏️" },
];

const INSTRUCCIONES_TIPO = {
  resumen:
    "Escribe un RESUMEN claro y bien organizado en 3 a 6 párrafos cortos, en español, adecuado para un " +
    "estudiante. No uses JSON ni listas: solo texto normal en párrafos.",
  esquema:
    'Escribe un ESQUEMA jerárquico en español. Usa exactamente este formato: cada punto principal en su ' +
    'propia línea empezando por "- ", y cada subpunto en la línea siguiente empezando por "  - " (dos ' +
    "espacios de sangría antes del guion). No uses JSON, no numeres a mano, no añadas nada fuera del esquema.",
  flashcards:
    'Genera entre 6 y 10 FLASHCARDS de estudio. Responde ÚNICAMENTE con un array JSON válido, sin explicación ' +
    'adicional ni bloque de código, con este formato exacto: [{"pregunta":"...","respuesta":"..."}]. Preguntas ' +
    "cortas, respuestas concretas.",
  ejercicios:
    'Genera entre 4 y 8 EJERCICIOS de práctica. Responde ÚNICAMENTE con un array JSON válido, sin explicación ' +
    'adicional ni bloque de código, con este formato exacto: [{"enunciado":"...","solucion":"..."}]. La ' +
    "solución debe explicar el razonamiento, no dar solo el resultado.",
};

function recorta(texto, max) {
  return texto.length > max ? texto.slice(0, max) + "…" : texto;
}

function bloqueOrigen(origen) {
  if (origen.tipo === "curriculo" && origen.paquete) {
    const pk = origen.paquete;
    return (
      `Basa el recurso en este fragmento de currículo oficial verificado. Puedes explicarlo y ejemplificarlo, ` +
      `pero no inventes otros criterios ni códigos que no aparezcan aquí:\n` +
      `Competencia específica ${pk.competenciaEspecifica.numero}: ${pk.competenciaEspecifica.texto}\n` +
      pk.criteriosEvaluacion.map((c) => `Criterio ${c.codigo}: ${c.texto}`).join("\n") +
      `\nSaberes básicos (${pk.saberesBasicos.bloque}): ${pk.saberesBasicos.resumen}`
    );
  }
  if (origen.tipo === "curriculo") {
    return (
      `No hay ningún fragmento de currículo oficial verificado cargado todavía para esta materia y curso. ` +
      `Genera el recurso sobre el tema "${origen.tema}" con conocimiento general de la materia, y dilo ` +
      `explícitamente al final: que no está anclado a un criterio de evaluación oficial verificado.`
    );
  }
  // origen.tipo === "importado"
  return (
    `Basa el recurso ÚNICAMENTE en el siguiente texto proporcionado por el usuario. No añadas currículo ` +
    `oficial ni lo presentes como si lo fuera en ningún momento:\n"""\n${recorta(origen.texto, 4000)}\n"""`
  );
}

export function construirPrompt({ tipo, origen, materiaNombre }) {
  const system =
    `Eres un generador de material de estudio en español para la materia de ${materiaNombre}. ` +
    `${INSTRUCCIONES_TIPO[tipo]} No inventes nunca contenido curricular oficial ni cites un criterio de ` +
    `evaluación que no se te haya dado explícitamente en el contexto.`;
  return [
    { role: "system", content: system },
    { role: "user", content: bloqueOrigen(origen) },
  ];
}

function extraerJSON(texto) {
  const limpio = texto.replace(/```json/gi, "").replace(/```/g, "").trim();
  const inicio = limpio.indexOf("[");
  const fin = limpio.lastIndexOf("]");
  if (inicio === -1 || fin === -1 || fin < inicio) return null;
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

/** Convierte la respuesta cruda del modelo en la estructura de cada tipo de recurso.
 * Nunca lanza: si no se puede interpretar, devuelve {ok:false} con el texto bruto
 * para que la interfaz pueda mostrarlo y ofrecer reintentar, en vez de romperse. */
export function parsearRespuesta(tipo, textoCrudo) {
  const texto = (textoCrudo || "").trim();

  if (tipo === "resumen") {
    if (!texto) return { ok: false, bruto: textoCrudo };
    return { ok: true, contenido: texto };
  }

  if (tipo === "esquema") {
    const lineas = texto
      .split("\n")
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l) => l.trim());
    const puntos = [];
    let actual = null;
    for (const linea of lineas) {
      if (/^\s{2,}-/.test(linea)) {
        if (actual) actual.subpuntos.push(linea.replace(/^\s*-\s?/, ""));
      } else if (/^-/.test(linea.trim())) {
        actual = { titulo: linea.replace(/^-\s?/, "").trim(), subpuntos: [] };
        puntos.push(actual);
      }
    }
    if (puntos.length === 0) {
      // Formato inesperado: se muestra igualmente como texto, en vez de perder el contenido generado.
      return texto ? { ok: true, contenido: texto, formatoLibre: true } : { ok: false, bruto: textoCrudo };
    }
    return { ok: true, contenido: puntos };
  }

  if (tipo === "flashcards" || tipo === "ejercicios") {
    const datos = extraerJSON(texto);
    if (!datos || !Array.isArray(datos) || datos.length === 0) {
      return { ok: false, bruto: textoCrudo };
    }
    const limpio = datos.filter((d) => d && typeof d === "object");
    if (limpio.length === 0) return { ok: false, bruto: textoCrudo };
    return { ok: true, contenido: limpio };
  }

  return { ok: false, bruto: textoCrudo };
}
