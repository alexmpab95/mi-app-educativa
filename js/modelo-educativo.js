// modelo-educativo.js — Fase 5, apartado 5.3: modelo educativo del alumno.
//
// Se calcula EN VIVO a partir de los datos que ya existen (controles e
// intentos: las mismas fuentes que usa la pestaña Progreso desde la Fase 3),
// nunca se guarda aparte, así nunca puede quedar desincronizado del
// histórico real. Solo las sugerencias de adaptación que se derivan de él
// (ver db.js) se persisten, porque necesitan un estado (pendiente/aceptada/
// rechazada) que alguien decide explícitamente.
//
// Honestidad sobre el alcance: apartado 5.3 también describe EstrategiaEfectiva
// (qué tipo de apoyo ha funcionado mejor para este alumno concreto). Se deja
// fuera de esta entrega a propósito: el propio objetivo de la Fase 5 dice que
// "requiere ya datos de uso suficientes de las fases anteriores", y afirmar
// qué estrategia es efectiva con los pocos intentos que puede haber en una
// instalación recién empezada sería inventar una conclusión sin evidencia
// real -- justo lo que el documento pide evitar en el apartado 9.3
// (explicabilidad: toda recomendación debe apoyarse en evidencia concreta).

/** Con menos observaciones que este umbral no se afirma ningún nivel de dominio. */
export const UMBRAL_MINIMO_EVIDENCIA = 3;

/**
 * Agrupa los resultados de preguntas cerradas (siempre) y abiertas ya
 * confirmadas (nunca antes de que la Familia confirme, igual que en la Fase
 * 3 — resolución C5) por clave: el criterio de evaluación vinculado a la
 * pregunta si existe (Fase 5), o si no hay ninguno, la materia entera
 * (compatible con el nivel de detalle que ya ofrecía la Fase 3).
 */
export function calcularModeloEducativo(controles, intentos) {
  const porClave = new Map();

  for (const intento of intentos) {
    const control = controles.find((c) => c.id === intento.controlId);
    if (!control) continue; // el control pudo eliminarse después de entregar el intento

    for (const r of intento.resultados) {
      const pregunta = control.preguntas[r.preguntaIndice];
      let correcta;
      let esParcial = false;
      if (r.tipo !== "abierta") {
        correcta = !!r.correcta;
      } else if (r.confirmada) {
        correcta = r.calificacionFinal === "correcta";
        esParcial = r.calificacionFinal === "parcial";
      } else {
        continue; // pendiente de confirmar: no cuenta todavía
      }

      const tieneCriterio = !!(pregunta && pregunta.criterioId);
      const clave = tieneCriterio ? pregunta.criterioId : `materia:${control.materiaId}`;
      if (!porClave.has(clave)) {
        porClave.set(clave, {
          clave,
          tipo: tieneCriterio ? "criterio" : "materia",
          materiaId: control.materiaId,
          materiaNombre: control.materiaNombre,
          criterioCodigo: tieneCriterio ? pregunta.criterioCodigo : null,
          criterioTexto: tieneCriterio ? pregunta.criterioTexto : null,
          total: 0,
          puntos: 0, // acierto = 1, parcial = 0.5, incorrecta = 0
          ultimaObservacion: intento.enviadoEn,
        });
      }
      const el = porClave.get(clave);
      el.total += 1;
      if (esParcial) el.puntos += 0.5;
      else if (correcta) el.puntos += 1;
      if (intento.enviadoEn > el.ultimaObservacion) el.ultimaObservacion = intento.enviadoEn;
    }
  }

  return Array.from(porClave.values()).map(clasificarElemento);
}

function clasificarElemento(el) {
  const pct = el.total ? el.puntos / el.total : 0;
  let nivel; // "dominado" | "en_progreso" | "con_dificultad" | "sin_datos"
  if (el.total < UMBRAL_MINIMO_EVIDENCIA) nivel = "sin_datos";
  else if (pct >= 0.8) nivel = "dominado";
  else if (pct >= 0.5) nivel = "en_progreso";
  else nivel = "con_dificultad";

  let confianza; // "baja" | "media" | "alta" — proxy simple del "nivel de confianza" del apartado 5.3
  if (el.total < 5) confianza = "baja";
  else if (el.total < 10) confianza = "media";
  else confianza = "alta";

  return { ...el, pctAcierto: Math.round(pct * 100), nivel, confianza };
}

/**
 * Frase de explicabilidad (apartado 9.3) para un elemento del modelo
 * educativo, cualquiera que sea su nivel — se usa tanto en el panel "¿por
 * qué te recomendamos esto?" como en la evidencia de una sugerencia de
 * adaptación, para no mantener dos redacciones distintas de la misma idea.
 */
export function construirConclusion(el) {
  const sujeto = el.tipo === "criterio" ? `sobre "${el.criterioTexto}"` : `de ${el.materiaNombre}`;
  if (el.nivel === "sin_datos") {
    return `Todavía hay muy pocas preguntas corregidas ${sujeto} (${el.total}) para estimar el nivel de dominio con seguridad. Hacen falta al menos ${UMBRAL_MINIMO_EVIDENCIA}.`;
  }
  return `De las últimas ${el.total} preguntas ${sujeto}, el acierto ha sido de un ${el.pctAcierto}%.`;
}

/** Catálogo reducido de adaptaciones que la Fase 5 puede sugerir (ver js/app.js, pantalla de accesibilidad). */
// Las claves coinciden EXACTAMENTE con los campos de ajustes de accesibilidad
// (ver DEFAULT_AJUSTES_ACCESIBILIDAD en app.js) para que aceptar una
// sugerencia pueda escribir directamente ese objeto sin traducir nombres.
export const CATALOGO_ADAPTACIONES = {
  lenguajeSimplificado: {
    etiqueta: "Lenguaje más sencillo en las explicaciones de la IA",
    dimension: "comprensión",
  },
  instruccionesFragmentadas: {
    etiqueta: "Mostrar las instrucciones paso a paso, no todas juntas",
    dimension: "comprensión",
  },
};

/**
 * Detecta, como máximo, una propuesta de adaptación nueva por cada elemento
 * "con dificultad" y con confianza al menos media, que todavía no tenga
 * ninguna sugerencia (pendiente, aceptada o rechazada) para la misma clave.
 *
 * Regla deliberadamente única y simple (documentado en LEEME.md): no intenta
 * distinguir el TIPO de error (conceptual/procedimental/de cálculo/de
 * comprensión/lingüístico/omisión, apartado 5.3) — esa clasificación es una
 * tarea de análisis pedagógico más profunda (apartado 21/22, "Generador de
 * fichas y análisis pedagógico de errores"), aplazada a una fase posterior
 * por prudencia. Aquí solo se ofrece una ayuda de comprensión general,
 * siempre reversible y nunca aplicada sin aceptación explícita (apartado
 * 9.2, nivel "sugerido").
 */
export function detectarSugerenciasCandidatas(modeloEducativo, sugerenciasExistentes) {
  const clavesConSugerencia = new Set((sugerenciasExistentes || []).map((s) => s.clave));
  return modeloEducativo
    .filter((el) => el.nivel === "con_dificultad" && el.confianza !== "baja" && !clavesConSugerencia.has(el.clave))
    .map((el) => ({
      clave: el.clave,
      materiaId: el.materiaId,
      materiaNombre: el.materiaNombre,
      criterioTexto: el.criterioTexto,
      adaptaciones: ["lenguajeSimplificado", "instruccionesFragmentadas"],
      evidencia: {
        total: el.total,
        aciertos: el.puntos,
        pctAcierto: el.pctAcierto,
        conclusion: construirConclusion(el),
      },
    }));
}
