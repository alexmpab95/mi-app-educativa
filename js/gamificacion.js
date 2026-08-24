// gamificacion.js — Fase 7, apartados 2.2 y 17 ("Gamificación... se construye
// deliberadamente en la última fase del proyecto, cuando ya existen datos
// reales de uso para calibrarla sin caer en mecánicas de dependencia").
//
// Igual que el modelo educativo de la Fase 5, TODO se calcula EN VIVO a
// partir de datos que ya existían (controles, intentos, repasos de
// flashcards): nada se guarda aparte, así los puntos y logros nunca pueden
// desincronizarse del histórico real ni "perderse" por un fallo de guardado.
//
// Principio rector (resolución de la contradicción C7, Parte I, y riesgo
// pedagógico 1.5): las recompensas se calculan sobre esfuerzo, constancia y
// mejora MEDIBLES — preguntas respondidas, días distintos con actividad
// real, resultados que mejoran respecto al intento anterior — nunca sobre
// tiempo de conexión ni sobre la sola calificación obtenida. La "racha" es
// deliberadamente "amable" (ver calcularEstadoRacha): perder un solo día no
// la rompe, y aunque se rompa de verdad, ni los puntos ni los logros ya
// conseguidos se reducen jamás (son recuentos acumulados de hechos pasados,
// nunca un saldo que se pueda gastar o perder).

export const PUNTOS_POR_PREGUNTA_CERRADA = 1;
export const PUNTOS_POR_PREGUNTA_ABIERTA_CONFIRMADA = 2;
export const PUNTOS_POR_DIA_DE_CONSTANCIA = 5;
export const PUNTOS_POR_MEJORA = 3;
export const UMBRAL_NIVEL = 30; // puntos totales necesarios para subir un nivel

/** Días de calendario ("YYYY-MM-DD") con alguna actividad real: entregar un intento o
 * repasar una flashcard. Deliberadamente NO cuenta abrir la app, iniciar sesión, ni el
 * tiempo pasado dentro: solo hechos concretos y medibles (ver principio rector arriba). */
export function diasConActividad(intentos, revisiones) {
  const dias = new Set();
  for (const it of intentos || []) {
    if (it.enviadoEn) dias.add(it.enviadoEn.slice(0, 10));
  }
  for (const r of revisiones || []) {
    if (r.ultimaRevision) dias.add(r.ultimaRevision.slice(0, 10));
  }
  return dias;
}

function diffDias(diaA, diaB) {
  return Math.round((new Date(diaB + "T00:00:00Z") - new Date(diaA + "T00:00:00Z")) / 86400000);
}

/**
 * "Racha amable" (apartado 2.2 y resolución C7): se recorren los días con actividad
 * tolerando UN solo hueco de un día dentro de una misma racha (perder un día no la rompe,
 * perder dos seguidos sí). La racha "actual" solo se considera vigente si la última
 * actividad fue hoy o ayer (todavía hay margen para continuarla hoy mismo sin ningún aviso
 * de urgencia); si ha pasado más tiempo, se muestra en 0 — pero `mejorRacha` (el récord
 * histórico) nunca disminuye, así que ese progreso nunca se pierde de verdad.
 */
export function calcularEstadoRacha(diasActividad, hoyStr) {
  const dias = Array.from(new Set(diasActividad)).sort();
  if (dias.length === 0) {
    return { rachaActual: 0, mejorRacha: 0, ultimoDia: null, diasDesdeUltimaActividad: null, enGracia: false };
  }

  // Mejor racha histórica: recorre todos los días con la misma tolerancia de un hueco por racha.
  let mejorRacha = 1;
  let actual = 1;
  let huecoUsadoHistorico = false;
  for (let i = 1; i < dias.length; i++) {
    const gap = diffDias(dias[i - 1], dias[i]);
    if (gap === 1) {
      actual++;
    } else if (gap === 2 && !huecoUsadoHistorico) {
      actual++;
      huecoUsadoHistorico = true;
    } else {
      actual = 1;
      huecoUsadoHistorico = false;
    }
    mejorRacha = Math.max(mejorRacha, actual);
  }

  const ultimoDia = dias[dias.length - 1];
  const diasDesdeUltimaActividad = diffDias(ultimoDia, hoyStr);

  // Racha que termina en el último día con actividad (misma tolerancia de un hueco).
  let rachaHastaUltimoDia = 1;
  let huecoActual = false;
  for (let i = dias.length - 1; i > 0; i--) {
    const gap = diffDias(dias[i - 1], dias[i]);
    if (gap === 1) {
      rachaHastaUltimoDia++;
    } else if (gap === 2 && !huecoActual) {
      rachaHastaUltimoDia++;
      huecoActual = true;
    } else {
      break;
    }
  }

  const vigente = diasDesdeUltimaActividad <= 1; // hoy o ayer: todavía se puede continuar hoy
  const rachaActual = vigente ? rachaHastaUltimoDia : 0;

  return {
    rachaActual,
    mejorRacha,
    ultimoDia,
    diasDesdeUltimaActividad,
    enGracia: diasDesdeUltimaActividad === 1, // ayer no hubo actividad todavía: hoy se puede recuperar
  };
}

/** Porcentaje de acierto de UN intento concreto (0 a 1), o null si nada cuenta todavía con
 * seguridad (p.ej. todas las preguntas eran abiertas y ninguna se ha confirmado aún). Misma
 * regla de cómputo que el modelo educativo de la Fase 5 (parcial = 0.5 puntos). */
function pctIntento(intento) {
  let total = 0;
  let puntos = 0;
  for (const r of intento.resultados) {
    if (r.tipo !== "abierta") {
      total++;
      if (r.correcta) puntos++;
    } else if (r.confirmada) {
      total++;
      if (r.calificacionFinal === "correcta") puntos++;
      else if (r.calificacionFinal === "parcial") puntos += 0.5;
    }
  }
  return total ? puntos / total : null;
}

/**
 * Mejora real y medible (no solo "acertar", sino acertar MÁS que la vez anterior): compara
 * cada intento con el intento anterior de la MISMA materia, en orden cronológico, y cuenta
 * como mejora cuando el porcentaje de acierto sube. Es una señal deliberadamente sencilla
 * (no intenta aislar el efecto de la dificultad de cada control concreto), pero es real y
 * verificable con los datos ya guardados, sin inventar ninguna métrica nueva.
 */
export function detectarMejoras(controles, intentos) {
  const ordenados = [...(intentos || [])].sort((a, b) => (a.enviadoEn < b.enviadoEn ? -1 : a.enviadoEn > b.enviadoEn ? 1 : 0));
  const ultimoPctPorMateria = new Map();
  const mejoras = [];
  for (const intento of ordenados) {
    const control = (controles || []).find((c) => c.id === intento.controlId);
    if (!control) continue;
    const pct = pctIntento(intento);
    if (pct === null) continue;
    const anterior = ultimoPctPorMateria.get(control.materiaId);
    if (anterior !== undefined && pct > anterior) {
      mejoras.push({
        materiaId: control.materiaId,
        materiaNombre: control.materiaNombre,
        controlId: control.id,
        intentoId: intento.id,
        pctAnterior: Math.round(anterior * 100),
        pctNuevo: Math.round(pct * 100),
      });
    }
    ultimoPctPorMateria.set(control.materiaId, pct);
  }
  return mejoras;
}

export function calcularPuntos({ controles, intentos, revisiones }) {
  let puntosEsfuerzo = 0;
  for (const intento of intentos || []) {
    for (const r of intento.resultados) {
      if (r.tipo !== "abierta") puntosEsfuerzo += PUNTOS_POR_PREGUNTA_CERRADA;
      else if (r.confirmada) puntosEsfuerzo += PUNTOS_POR_PREGUNTA_ABIERTA_CONFIRMADA;
    }
  }
  const dias = diasConActividad(intentos, revisiones);
  const puntosConstancia = dias.size * PUNTOS_POR_DIA_DE_CONSTANCIA;
  const mejoras = detectarMejoras(controles, intentos);
  const puntosMejora = mejoras.length * PUNTOS_POR_MEJORA;
  const puntosTotales = puntosEsfuerzo + puntosConstancia + puntosMejora;
  return { puntosEsfuerzo, puntosConstancia, puntosMejora, puntosTotales, diasActivos: dias.size, mejoras };
}

export function calcularNivel(puntosTotales) {
  return 1 + Math.floor(puntosTotales / UMBRAL_NIVEL);
}

/** Catálogo de logros/insignias (apartado 2.2). Cada condición se evalúa sobre recuentos
 * ACUMULADOS (nunca disminuyen con el tiempo), así que un logro desbloqueado no puede
 * "perderse" después — coherente con el criterio de aceptación de la Fase 7 ("recuperar su
 * racha sin perder el progreso acumulado"). Usan emoji + texto siempre juntos, nunca solo
 * color (apartado 12.3/35: la gamificación no depende de la percepción de color única), y
 * ninguna condición depende de velocidad de reacción ni de un cronómetro. */
export const CATALOGO_LOGROS = [
  { id: "primer_control", emoji: "🎯", etiqueta: "Primer paso", descripcion: "Entregar tu primer control.", condicion: (s) => s.intentosEntregados >= 1 },
  { id: "constante_5", emoji: "🗓️", etiqueta: "Constante", descripcion: "Actividad registrada en al menos 5 días distintos.", condicion: (s) => s.diasActivos >= 5 },
  { id: "racha_3", emoji: "🔥", etiqueta: "Racha de 3 días", descripcion: "Alcanzar una racha de 3 días seguidos, alguna vez.", condicion: (s) => s.mejorRacha >= 3 },
  { id: "racha_7", emoji: "🔥", etiqueta: "Racha de 7 días", descripcion: "Alcanzar una racha de 7 días seguidos, alguna vez.", condicion: (s) => s.mejorRacha >= 7 },
  { id: "mejora_real", emoji: "📈", etiqueta: "Mejora real", descripcion: "Superar tu propio resultado anterior en la misma materia.", condicion: (s) => s.mejoras >= 1 },
  { id: "explorador", emoji: "🧭", etiqueta: "Explorador de materias", descripcion: "Actividad registrada en al menos 2 materias distintas.", condicion: (s) => s.materiasDistintas >= 2 },
  { id: "repasador", emoji: "🔁", etiqueta: "Repasador", descripcion: "Al menos 10 repasos de flashcards registrados.", condicion: (s) => s.repasosTotales >= 10 },
];

export function calcularLogrosDesbloqueados(stats) {
  return CATALOGO_LOGROS.filter((l) => l.condicion(stats));
}

/**
 * Analítica personal ligera (apartado 2.2: "analítica personal de progreso"): un calendario
 * de los últimos `ventanaDias` días con o sin actividad real, terminando hoy. Alcance
 * deliberadamente reducido respecto a la "analítica... a lo largo de los cursos" completa del
 * documento: eso supondría comparar varios cursos escolares distintos, y en una instalación
 * que todavía no ha vivido más de un curso no habría más que un único punto de datos que
 * comparar — se documenta como pendiente en LEEME.md en vez de inventar una comparación sin
 * sentido. Esta ventana de días sí es real y útil desde el primer momento.
 */
export function calcularCalendarioActividad(diasActividad, hoyStr, ventanaDias = 14) {
  const set = new Set(diasActividad);
  const dias = [];
  for (let i = ventanaDias - 1; i >= 0; i--) {
    const fecha = new Date(hoyStr + "T00:00:00Z");
    fecha.setUTCDate(fecha.getUTCDate() - i);
    const fechaStr = fecha.toISOString().slice(0, 10);
    dias.push({ fecha: fechaStr, actividad: set.has(fechaStr) });
  }
  return dias;
}

/** Punto de entrada único: calcula todo el estado de gamificación de un perfil a partir de
 * sus datos ya guardados. `hoyStr` se pasa desde fuera (no se usa Date.now() aquí dentro)
 * para que este módulo sea una función pura, fácil de probar con fechas fijas. */
export function calcularGamificacion({ controles, intentos, revisiones, hoyStr }) {
  const { puntosEsfuerzo, puntosConstancia, puntosMejora, puntosTotales, diasActivos, mejoras } = calcularPuntos({
    controles,
    intentos,
    revisiones,
  });
  const nivel = calcularNivel(puntosTotales);
  const dias = Array.from(diasConActividad(intentos, revisiones));
  const racha = calcularEstadoRacha(dias, hoyStr);
  const materiasDistintas = new Set(
    (intentos || [])
      .map((it) => {
        const c = (controles || []).find((cc) => cc.id === it.controlId);
        return c ? c.materiaId : null;
      })
      .filter(Boolean)
  ).size;
  const stats = {
    intentosEntregados: (intentos || []).length,
    diasActivos,
    mejoras: mejoras.length,
    repasosTotales: (revisiones || []).length,
    materiasDistintas,
    mejorRacha: racha.mejorRacha,
  };
  const logros = calcularLogrosDesbloqueados(stats);
  return { puntosEsfuerzo, puntosConstancia, puntosMejora, puntosTotales, nivel, racha, logros, stats };
}
