// Prueba de la Fase 5 (Personalización): criterio de evaluación opcional en
// preguntas de control, modelo educativo del alumno (calculado en vivo),
// panel de explicabilidad, configuración de accesibilidad ampliada aplicada
// de verdad (CSS + prompts de IA), sugerencias de adaptación de nivel
// "sugerido" con aceptación explícita, y "📅 Hoy tengo que estudiar"
// (repetición espaciada + refuerzo + controles próximos).
//
// Incluye dos pruebas unitarias puras (sin navegador, sobre js/modelo-educativo.js
// y los puntos de ia-orquestador.js/correccion.js que leen los ajustes de
// accesibilidad) además de las tres pruebas de extremo a extremo con Playwright.
const assert = require("assert");
const { chromium } = require("playwright");

const BASE = "http://localhost:8791/index.html";

function log(ok, msg) {
  console.log((ok ? "OK   " : "FALLO") + " - " + msg);
  if (!ok) process.exitCode = 1;
}

function fechaEnDias(dias) {
  const d = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Mismo cálculo que pintarEstudiarHoy en app.js (redondea hacia arriba hasta el final del día
 * de la fecha límite), para no depender de la hora exacta a la que se ejecuta la prueba. */
function diasRestantesEsperados(fechaLimite) {
  return Math.ceil((new Date(`${fechaLimite}T23:59:59`) - new Date()) / (24 * 60 * 60 * 1000));
}

// --- Prueba unitaria pura: js/modelo-educativo.js ---
async function pruebaUnitariaModeloEducativo() {
  const mod = await import("../js/modelo-educativo.js");
  const { calcularModeloEducativo, detectarSugerenciasCandidatas, UMBRAL_MINIMO_EVIDENCIA } = mod;

  const control = {
    id: 1,
    materiaId: "mat-primaria",
    materiaNombre: "Matemáticas",
    preguntas: [
      { tipo: "respuesta_corta", enunciado: "3+4", respuestaCorrecta: "7", criterioId: "pkg::1.1", criterioCodigo: "1.1", criterioTexto: "Comprender problemas de la vida cotidiana." },
      { tipo: "respuesta_corta", enunciado: "5+5", respuestaCorrecta: "10", criterioId: "pkg::1.1", criterioCodigo: "1.1", criterioTexto: "Comprender problemas de la vida cotidiana." },
      { tipo: "respuesta_corta", enunciado: "sin criterio", respuestaCorrecta: "x", criterioId: null },
      { tipo: "abierta", enunciado: "Explica tu razonamiento." },
    ],
  };

  function intento(resultados, enviadoEn) {
    return { controlId: 1, enviadoEn, resultados };
  }

  // 5 intentos sobre la pregunta 0 (criterio 1.1): 1 acierto, 4 fallos -> "con_dificultad"
  const intentos = [
    intento([{ preguntaIndice: 0, tipo: "respuesta_corta", correcta: true }], "2026-08-01T00:00:00.000Z"),
    intento([{ preguntaIndice: 0, tipo: "respuesta_corta", correcta: false }], "2026-08-02T00:00:00.000Z"),
    intento([{ preguntaIndice: 0, tipo: "respuesta_corta", correcta: false }], "2026-08-03T00:00:00.000Z"),
    intento([{ preguntaIndice: 0, tipo: "respuesta_corta", correcta: false }], "2026-08-04T00:00:00.000Z"),
    intento([{ preguntaIndice: 0, tipo: "respuesta_corta", correcta: false }], "2026-08-05T00:00:00.000Z"),
    // Pregunta sin criterio (fallback a materia): 2 aciertos de 2
    intento([{ preguntaIndice: 2, tipo: "respuesta_corta", correcta: true }], "2026-08-01T00:00:00.000Z"),
    intento([{ preguntaIndice: 2, tipo: "respuesta_corta", correcta: true }], "2026-08-02T00:00:00.000Z"),
    // Pregunta abierta SIN confirmar todavía: no debe contar para nada
    intento([{ preguntaIndice: 3, tipo: "abierta", confirmada: false, calificacionFinal: null }], "2026-08-06T00:00:00.000Z"),
    // Pregunta abierta confirmada como "parcial": debe sumar 0.5 al fallback de materia
    intento([{ preguntaIndice: 3, tipo: "abierta", confirmada: true, calificacionFinal: "parcial" }], "2026-08-07T00:00:00.000Z"),
  ];

  const modelo = calcularModeloEducativo([control], intentos);

  const porCriterio = modelo.find((m) => m.clave === "pkg::1.1");
  log(!!porCriterio, "Se agrupa correctamente por criterio de evaluación cuando la pregunta lo tiene");
  log(porCriterio && porCriterio.total === 5, "Cuenta las 5 observaciones del criterio 1.1");
  log(porCriterio && porCriterio.nivel === "con_dificultad", "Con 1/5 aciertos (20%) el nivel es 'con_dificultad'");
  log(porCriterio && porCriterio.confianza === "media", "Con 5 observaciones la confianza es 'media' (no 'baja', no 'alta')");

  const porMateria = modelo.find((m) => m.clave === "materia:mat-primaria");
  log(!!porMateria, "Las preguntas sin criterio caen en el fallback por materia");
  // 2 aciertos (pregunta sin criterio) + 0.5 (abierta confirmada parcial) = 2.5 puntos sobre 3 observaciones
  log(porMateria && porMateria.total === 3, "El fallback por materia cuenta la abierta confirmada, pero no la pendiente de confirmar");
  log(porMateria && porMateria.puntos === 2.5, "Una calificación 'parcial' confirmada suma medio punto, ni cero ni uno entero");
  log(porMateria && porMateria.nivel === "dominado", "2.5/3 (83%) se clasifica como 'dominado'");

  // --- Umbral mínimo de evidencia: con menos de UMBRAL_MINIMO_EVIDENCIA no se afirma nivel ---
  const controlPoco = { id: 2, materiaId: "lengua-primaria", materiaNombre: "Lengua", preguntas: [{ tipo: "verdadero_falso", enunciado: "x", criterioId: null }] };
  const modeloPoco = calcularModeloEducativo(
    [controlPoco],
    [
      { controlId: 2, enviadoEn: "2026-08-01T00:00:00.000Z", resultados: [{ preguntaIndice: 0, tipo: "verdadero_falso", correcta: false }] },
      { controlId: 2, enviadoEn: "2026-08-02T00:00:00.000Z", resultados: [{ preguntaIndice: 0, tipo: "verdadero_falso", correcta: false }] },
    ]
  );
  const elementoPoco = modeloPoco.find((m) => m.clave === "materia:lengua-primaria");
  log(elementoPoco && elementoPoco.total < UMBRAL_MINIMO_EVIDENCIA && elementoPoco.nivel === "sin_datos", "Con menos observaciones que el umbral mínimo, nunca se afirma un nivel de dominio (aunque todo sean fallos)");

  // --- Detección de sugerencias candidatas ---
  const candidatas = detectarSugerenciasCandidatas(modelo, []);
  log(candidatas.some((s) => s.clave === "pkg::1.1"), "Se detecta una sugerencia candidata para el criterio con dificultad y confianza media/alta");
  log(!candidatas.some((s) => s.clave === "materia:mat-primaria"), "No se sugiere nada para un elemento 'dominado'");

  const candidatasYaExistentes = detectarSugerenciasCandidatas(modelo, [{ clave: "pkg::1.1", estado: "pendiente" }]);
  log(!candidatasYaExistentes.some((s) => s.clave === "pkg::1.1"), "No se duplica una sugerencia para una clave que ya tiene una sugerencia (pendiente, aceptada o rechazada)");

  const candidata = candidatas.find((s) => s.clave === "pkg::1.1");
  log(candidata.evidencia.conclusion.includes("5") && candidata.evidencia.conclusion.includes("20%"), "La evidencia de la sugerencia cita el número real de preguntas y el porcentaje real de acierto");
}

// --- Prueba unitaria pura: ajustes de accesibilidad en los prompts de IA ---
async function pruebaUnitariaPromptsAccesibilidad() {
  const orquestador = await import("../js/ia-orquestador.js");
  const correccion = await import("../js/correccion.js");

  const perfil = { nombre: "Nora", cursoNombre: "6º de Primaria" };

  const sinAjustes = orquestador.construirSystemPrompt({ perfil, materiaNombre: "Matemáticas", modo: "practica", nivelAyuda: 0 });
  log(!sinAjustes.includes("frases muy cortas"), "Sin ajustes de accesibilidad, el prompt de 'Mi profesor' no menciona lenguaje simplificado");

  const conLenguajeSimple = orquestador.construirSystemPrompt({
    perfil,
    materiaNombre: "Matemáticas",
    modo: "practica",
    nivelAyuda: 0,
    ajustesAccesibilidad: { lenguajeSimplificado: true },
  });
  log(conLenguajeSimple.includes("frases muy cortas y vocabulario sencillo"), "Con 'lenguaje simplificado' aceptado, el prompt de 'Mi profesor' lo pide explícitamente");

  const conInstruccionesFragmentadas = orquestador.construirSystemPrompt({
    perfil,
    materiaNombre: "Matemáticas",
    modo: "aprendizaje",
    nivelAyuda: 0,
    ajustesAccesibilidad: { instruccionesFragmentadas: true },
  });
  log(conInstruccionesFragmentadas.includes("lista numerada"), "Con 'instrucciones fragmentadas' aceptado, el prompt pide una lista numerada de pasos");

  const pistaControl = correccion.construirPromptPistaControl({
    pregunta: { enunciado: "3+4" },
    nivelAyuda: 1,
    materiaNombre: "Matemáticas",
    ajustesAccesibilidad: { lenguajeSimplificado: true, instruccionesFragmentadas: true },
  });
  const systemPistaControl = pistaControl[0].content;
  log(systemPistaControl.includes("frases muy cortas") && systemPistaControl.includes("numera cada paso"), "La pista de un control durante Practicar también respeta ambos ajustes de accesibilidad");

  const correccionAbierta = correccion.construirPromptCorreccionAbierta({
    pregunta: { enunciado: "Explica el ciclo del agua" },
    respuestaAlumno: "Llueve y luego se evapora",
    materiaNombre: "Ciencias",
    ajustesAccesibilidad: { lenguajeSimplificado: true },
  });
  const systemCorreccion = correccionAbierta[0].content;
  log(systemCorreccion.includes("frases muy cortas y vocabulario sencillo"), "El comentario de corrección de una pregunta abierta también respeta 'lenguaje simplificado'");

  const pistaSinAjustes = correccion.construirPromptPistaControl({ pregunta: { enunciado: "3+4" }, nivelAyuda: 1, materiaNombre: "Matemáticas" });
  log(!pistaSinAjustes[0].content.includes("frases muy cortas"), "Sin ajustesAccesibilidad (undefined), la pista de control no falla y no añade nada de más");
}

// --- Criterio de evaluación opcional en preguntas de control ---
async function pruebaCriterioEvaluacion() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erroresConsola = [];
  page.on("pageerror", (err) => erroresConsola.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") erroresConsola.push(msg.text());
  });

  await page.goto(BASE);
  await page.waitForSelector("#nombre-familia");
  await page.fill("#nombre-familia", "Familia Criterio");
  await page.click('#form-familia button[type="submit"]');
  await page.waitForSelector('[data-accion="nuevo-perfil"]');
  await page.click('[data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Vera");
  await page.selectOption("#etapa-perfil", "primaria");
  await page.waitForTimeout(150);
  await page.selectOption("#curso-perfil", "primaria-6"); // curso con currículo verificado de Matemáticas
  await page.waitForTimeout(150);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");

  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('[data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  await page.click('[data-accion="nuevo-control"]');
  await page.waitForSelector("#titulo-control");
  await page.fill("#titulo-control", "Control con criterio");

  // Antes de elegir materia no debería haber selector de criterio (sin currículo cargado aún)
  log(!(await page.isVisible("#criterio-pregunta-0")), "Sin materia elegida todavía no aparece el selector de criterio");

  await page.selectOption("#materia-control", "mat-primaria");
  await page.waitForSelector("#criterio-pregunta-0", { timeout: 5000 });
  log(true, "Al elegir Matemáticas (con currículo verificado en 6º) aparece el selector de criterio");

  const opciones = await page.locator("#criterio-pregunta-0 option").allTextContents();
  log(opciones.some((t) => t.includes("1.1")), "El selector de criterio lista los criterios verificados reales (p.ej. 1.1)");

  await page.fill("#enunciado-pregunta-0", "¿Cuánto es 345 - 178?");
  await page.selectOption("#criterio-pregunta-0", { label: opciones.find((t) => t.includes("1.1")) });
  await page.selectOption("#tipo-pregunta-0", "respuesta_corta");
  await page.waitForSelector("#respuesta-corta-0");
  // Al cambiar el tipo se reescribe el DOM: el enunciado se conserva por diseño, pero hay
  // que rellenar la respuesta correcta del nuevo tipo.
  await page.fill("#respuesta-corta-0", "167");
  // El criterio elegido debe seguir marcado tras cambiar el tipo de pregunta
  const criterioTrasCambioTipo = await page.locator("#criterio-pregunta-0").inputValue();
  log(!!criterioTrasCambioTipo, "El criterio elegido sobrevive a un cambio de tipo de pregunta");

  await page.click('#form-control button[type="submit"]');
  await page.waitForSelector("#titulo-controles");
  log(true, "El control con pregunta vinculada a un criterio se guarda sin errores");

  // Reabrir el control y comprobar que el criterio se conserva
  await page.click('[data-accion="editar-control"]');
  await page.waitForSelector("#criterio-pregunta-0");
  const criterioAlReabrir = await page.locator("#criterio-pregunta-0").inputValue();
  log(!!criterioAlReabrir && criterioAlReabrir === criterioTrasCambioTipo, "El criterio elegido se conserva al reabrir el control para editarlo");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo (criterio)" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
}

// --- Progreso por criterio, explicabilidad, sugerencias de adaptación, accesibilidad ---
async function pruebaProgresoExplicabilidadSugerenciasAccesibilidad() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erroresConsola = [];
  page.on("pageerror", (err) => erroresConsola.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("ERR_TUNNEL_CONNECTION_FAILED") && !msg.text().toLowerCase().includes("tesseract")) {
      erroresConsola.push(msg.text());
      console.log("CONSOLE ERROR:", msg.text());
    }
  });

  await page.goto(BASE);
  await page.waitForSelector("#nombre-familia");
  await page.fill("#nombre-familia", "Familia Fase5");
  await page.click('#form-familia button[type="submit"]');
  await page.waitForSelector('[data-accion="nuevo-perfil"]');
  await page.click('[data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Iris");
  await page.selectOption("#etapa-perfil", "primaria");
  await page.waitForTimeout(150);
  await page.selectOption("#curso-perfil", "primaria-6");
  await page.waitForTimeout(150);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");

  // --- La Familia crea un control con 5 preguntas vinculadas al mismo criterio, con fecha límite ---
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('[data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  await page.click('[data-accion="nuevo-control"]');
  await page.waitForSelector("#titulo-control");
  await page.fill("#titulo-control", "Control de fracciones");
  await page.selectOption("#materia-control", "mat-primaria");
  await page.waitForSelector("#criterio-pregunta-0");
  const fechaLimite = fechaEnDias(2);
  await page.fill("#fecha-limite-control", fechaLimite);

  const opciones0 = await page.locator("#criterio-pregunta-0 option").allTextContents();
  const etiquetaCriterio11 = opciones0.find((t) => t.includes("1.1"));

  async function rellenarPreguntaRespuestaCorta(i, enunciado, respuestaCorrecta) {
    await page.selectOption(`#tipo-pregunta-${i}`, "respuesta_corta");
    await page.waitForSelector(`#respuesta-corta-${i}`);
    await page.fill(`#enunciado-pregunta-${i}`, enunciado);
    await page.fill(`#respuesta-corta-${i}`, respuestaCorrecta);
    await page.selectOption(`#criterio-pregunta-${i}`, { label: etiquetaCriterio11 });
  }

  await rellenarPreguntaRespuestaCorta(0, "1/2 + 1/2 =", "1");
  for (let i = 1; i < 5; i++) {
    await page.click('[data-accion="anadir-pregunta"]');
    await page.waitForSelector(`#tipo-pregunta-${i}`);
    await rellenarPreguntaRespuestaCorta(i, `Pregunta ${i + 1}`, "42");
  }

  await page.click('#form-control button[type="submit"]');
  await page.waitForSelector("#titulo-controles");
  log(true, "El control con 5 preguntas vinculadas al criterio 1.1 y fecha límite se guarda sin errores");

  // --- El alumno responde: 1 acierto, 4 fallos (para provocar 'con dificultad') ---
  await page.click('[data-accion="volver-panel"]');
  await page.click('[data-accion="volver"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Iris");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]');
  await page.click('[data-accion="empezar-control"]');
  await page.waitForSelector("#form-practicar-control");

  await page.fill("#respuesta-0", "1"); // correcta
  await page.fill("#respuesta-1", "no lo sé");
  await page.fill("#respuesta-2", "no lo sé");
  await page.fill("#respuesta-3", "no lo sé");
  await page.fill("#respuesta-4", "no lo sé");
  await page.click('#form-practicar-control button[type="submit"]');
  await page.waitForSelector("text=Volver a Practicar", { timeout: 15000 });
  log(true, "El alumno entrega el control (1 acierto, 4 fallos sobre el criterio 1.1)");

  // --- Progreso: debe verse el desglose por criterio con "Con dificultad" ---
  await page.click('[data-accion="volver-practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]');
  await page.click('.tab-btn[data-tab="progreso"]');
  await page.waitForSelector("text=Solo se cuenta lo que ya está corregido con seguridad");
  let progresoTexto = await page.textContent("#app");
  log(progresoTexto.includes("Con dificultad"), "Progreso muestra el criterio 1.1 como 'Con dificultad' (1/5 = 20%)");
  log(progresoTexto.includes("1.1"), "Progreso identifica el criterio por su código (1.1)");

  await page.click('[data-accion="ver-explicabilidad"]');
  await page.waitForSelector("#titulo-explicabilidad");
  const explicabilidadTexto = await page.textContent("#app");
  log(explicabilidadTexto.includes("5") && explicabilidadTexto.includes("20%"), "El panel de explicabilidad cita el número real de preguntas (5) y el porcentaje real (20%)");
  log(explicabilidadTexto.includes("Con dificultad"), "El panel de explicabilidad muestra el mismo nivel que Progreso");
  await page.click('[data-accion="volver-progreso"]');
  await page.waitForSelector("text=Solo se cuenta lo que ya está corregido con seguridad");

  // --- Debe haber aparecido una sugerencia de adaptación (nivel "sugerido") ---
  progresoTexto = await page.textContent("#app");
  log(progresoTexto.includes("sugerencia"), "Progreso avisa de que hay una sugerencia de adaptación pendiente");
  await page.click('[data-accion="ir-accesibilidad-sugerencias"]');
  await page.waitForSelector("#titulo-accesibilidad");
  let accesibilidadTexto = await page.textContent("#app");
  log(accesibilidadTexto.includes("Lenguaje más sencillo"), "La pantalla de Accesibilidad muestra la sugerencia con la adaptación concreta propuesta");
  log(accesibilidadTexto.includes("20%"), "La sugerencia incluye la misma evidencia (20%) que el panel de explicabilidad");

  log(!(await page.isChecked("#ax-lenguaje-simplificado")), "Antes de aceptar la sugerencia, 'lenguaje simplificado' todavía no está activado");
  await page.click('[data-accion="aceptar-sugerencia"]');
  // "#titulo-accesibilidad" ya existe en el DOM ANTES de aceptar (misma pantalla, solo se
  // re-renderiza el contenido): hay que esperar a que el botón de la sugerencia desaparezca,
  // no a un elemento que ya estaba presente desde antes de la respuesta asíncrona.
  await page.waitForSelector('[data-accion="aceptar-sugerencia"]', { state: "detached", timeout: 10000 });
  log(await page.isChecked("#ax-lenguaje-simplificado"), "Tras aceptar la sugerencia, 'lenguaje simplificado' queda activado de verdad (no solo la sugerencia marcada)");
  log(await page.isChecked("#ax-instrucciones-fragmentadas"), "Tras aceptar la sugerencia, 'instrucciones fragmentadas' también queda activado");
  accesibilidadTexto = await page.textContent("#app");
  log(!accesibilidadTexto.includes("Sí, probarlo"), "Una vez aceptada, la sugerencia ya no se vuelve a mostrar como pendiente");

  // --- Ajustes manuales de accesibilidad: deben aplicarse de verdad (atributos en <html>) ---
  await page.selectOption("#ax-tamano-letra", "muy_grande");
  await page.selectOption("#ax-tema", "oscuro");
  await page.selectOption("#ax-espaciado", "amplio");
  await page.check("#ax-menos-estimulos");
  await page.check("#ax-voz-por-defecto");
  await page.click('#form-accesibilidad button[type="submit"]');
  // ".tabs-nav" también ya está presente en la propia pantalla de Accesibilidad: esperar a la
  // pantalla de destino real (Inicio, "pantalla-vacia"), no a un elemento compartido por ambas.
  await page.waitForSelector(".pantalla-vacia", { timeout: 10000 });

  const atributosHtml = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  log(atributosHtml.tamanoLetra === "muy_grande", "El tamaño de letra 'muy grande' se aplica como atributo real en <html>");
  log(atributosHtml.tema === "oscuro", "El tema oscuro manual se aplica como atributo real en <html>");
  log(atributosHtml.espaciado === "amplio", "El espaciado amplio se aplica como atributo real en <html>");
  log(atributosHtml.menosEstimulos === "true", "El modo 'menos estímulos' se aplica como atributo real en <html>");
  log(atributosHtml.vozPorDefecto === "true", "El ajuste 'voz por defecto' se aplica como atributo real en <html>");

  const fontSizeHtml = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  log(parseFloat(fontSizeHtml) > 16, "El tamaño de letra 'muy grande' cambia de verdad el tamaño de fuente calculado (más de 16px base)");

  // --- Persistencia: recargar la app entera y volver a entrar en el mismo perfil ---
  await page.reload();
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Iris");
  await page.waitForSelector(".tabs-nav");
  const atributosTrasRecargar = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  log(atributosTrasRecargar.tamanoLetra === "muy_grande" && atributosTrasRecargar.tema === "oscuro", "Los ajustes de accesibilidad sobreviven a recargar la app y volver a entrar en el perfil");

  // --- Aislamiento: Teo (otro hermano) no hereda los ajustes de Iris ---
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click('[data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Teo");
  await page.selectOption("#etapa-perfil", "primaria");
  await page.waitForTimeout(150);
  await page.selectOption("#curso-perfil", "primaria-3");
  await page.waitForTimeout(150);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Teo");
  await page.waitForSelector(".tabs-nav");
  const atributosTeo = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  log(atributosTeo.tamanoLetra === "normal" && atributosTeo.tema === "normal", "Un hermano nuevo (Teo) no hereda los ajustes de accesibilidad de Iris (aislamiento entre hermanos)");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo (progreso/accesibilidad)" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
}

// --- "📅 Hoy tengo que estudiar" ---
async function pruebaEstudiarHoy() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erroresConsola = [];
  page.on("pageerror", (err) => erroresConsola.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      erroresConsola.push(msg.text());
      console.log("CONSOLE ERROR:", msg.text());
    }
  });

  await page.goto(BASE);
  await page.waitForSelector("#nombre-familia");
  await page.fill("#nombre-familia", "Familia Estudiar");
  await page.click('#form-familia button[type="submit"]');
  await page.waitForSelector('[data-accion="nuevo-perfil"]');
  await page.click('[data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Uma");
  await page.selectOption("#etapa-perfil", "primaria");
  await page.waitForTimeout(150);
  await page.selectOption("#curso-perfil", "primaria-6");
  await page.waitForTimeout(150);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");

  // --- Un control con fecha límite próxima, sin necesidad de responderlo ---
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('[data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  await page.click('[data-accion="nuevo-control"]');
  await page.waitForSelector("#titulo-control");
  await page.fill("#titulo-control", "Examen de fracciones");
  await page.selectOption("#materia-control", "mat-primaria");
  const fechaLimiteControl = fechaEnDias(3);
  await page.fill("#fecha-limite-control", fechaLimiteControl);
  await page.fill("#enunciado-pregunta-0", "1/2 + 1/4 = ?");
  // La pregunta por defecto es de opción múltiple: basta con rellenar dos opciones para poder guardar.
  const opciones = page.locator('[data-pregunta="0"] [data-campo="opcion"]');
  await opciones.nth(0).fill("3/4");
  await opciones.nth(1).fill("1/2");
  await page.click('#form-control button[type="submit"]');
  await page.waitForSelector("#titulo-controles");
  log(true, "Se crea un control con fecha límite dentro de 3 días");

  await page.click('[data-accion="volver-panel"]');
  await page.click('[data-accion="volver"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Uma");
  await page.waitForSelector(".tabs-nav");

  // --- Crear un recurso de flashcards (motor de prueba: 3 fichas de ejemplo) ---
  await page.click('.tab-btn[data-tab="crear"]');
  await page.waitForSelector('[data-accion="crear-nuevo"]');
  await page.click('[data-accion="crear-nuevo"]');
  await page.waitForSelector("#materia-crear");
  await page.click('[data-tipo="flashcards"]');
  await page.selectOption("#materia-crear", "mat-primaria");
  await page.click('#form-crear button[type="submit"]');
  await page.waitForSelector('[data-tarjeta="0"]', { timeout: 15000 });
  await page.click('[data-accion="guardar-recurso"]');
  await page.waitForSelector('[data-accion="crear-nuevo"]');
  log(true, "Se crea un recurso de flashcards (3 fichas de ejemplo del motor de prueba)");

  // --- "📅 Hoy tengo que estudiar" ---
  await page.click('.tab-btn[data-tab="progreso"]');
  await page.waitForSelector("text=Solo se cuenta lo que ya está corregido con seguridad");
  await page.click('[data-accion="ir-estudiar-hoy"]');
  await page.waitForSelector("#titulo-estudiar-hoy");

  let texto = await page.textContent("#app");
  log(texto.includes("Flashcards pendientes de repasar (3)"), "Las 3 flashcards recién creadas aparecen pendientes de repasar hoy (nunca se han repasado)");
  log(texto.includes("Pregunta de ejemplo 1"), "Se muestra la pregunta real de la primera flashcard pendiente");
  const diasEsperados = diasRestantesEsperados(fechaLimiteControl);
  log(
    texto.includes("Examen de fracciones") && texto.includes(`En ${diasEsperados} día`),
    `El control con fecha límite próxima aparece en 'Controles próximos', con la cuenta atrás correcta (En ${diasEsperados} día(s))`
  );
  log(!(await page.isVisible('[data-respuesta-hoy]')), "La respuesta de la flashcard no se muestra hasta pulsar 'Ver respuesta'");

  await page.click('[data-accion="ver-respuesta-hoy"]');
  await page.waitForSelector('[data-respuesta-hoy]');
  texto = await page.textContent("#app");
  log(texto.includes("Respuesta de ejemplo 1"), "Al pulsar 'Ver respuesta' se muestra la respuesta real de la flashcard");

  // Resultado "Normal": la flashcard se retira de la cola de hoy (no vuelve hasta su próxima revisión programada).
  await page.click('[data-accion="repasar-resultado"][data-resultado="normal"]');
  await page.waitForSelector("text=Flashcards pendientes de repasar (2)");
  log(true, "Tras calificar una flashcard como 'Normal', la cola de hoy baja de 3 a 2");

  // Resultado "Otra vez": la flashcard vuelve a la cola de HOY (no se retira, se manda al final).
  await page.click('[data-accion="ver-respuesta-hoy"]');
  await page.waitForSelector('[data-respuesta-hoy]');
  await page.click('[data-accion="repasar-resultado"][data-resultado="otra_vez"]');
  await page.waitForTimeout(200);
  texto = await page.textContent("#app");
  log(texto.includes("Flashcards pendientes de repasar (2)"), "Tras 'Otra vez', la cola de hoy sigue teniendo 2 (la ficha vuelve a la cola, no desaparece)");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo (estudiar hoy)" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
}

(async () => {
  await pruebaUnitariaModeloEducativo();
  await pruebaUnitariaPromptsAccesibilidad();
  await pruebaCriterioEvaluacion();
  await pruebaProgresoExplicabilidadSugerenciasAccesibilidad();
  await pruebaEstudiarHoy();
  console.log("\nPruebas de la Fase 5 completadas.");
})();
