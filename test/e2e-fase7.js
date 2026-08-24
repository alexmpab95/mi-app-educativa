// Prueba de la Fase 7 (Expansión: gamificación y analítica personal,
// apartados 2.2 y 17) con Playwright, más una prueba unitaria pura (sin
// navegador) de js/gamificacion.js. Cubre: puntos por esfuerzo/constancia/
// mejora real calculados en vivo a partir de datos ya existentes, la
// "racha amable" (un día perdido no la rompe, dos sí, pero el récord
// histórico nunca se pierde), el nivel, el catálogo de logros/insignias, y
// el calendario de actividad de los últimos 14 días.
const { chromium } = require("playwright");

const BASE = "http://localhost:8791/index.html";

function log(ok, msg) {
  console.log((ok ? "OK   " : "FALLO") + " - " + msg);
  if (!ok) process.exitCode = 1;
}

// --- Prueba unitaria pura: js/gamificacion.js ---
async function pruebaUnitariaGamificacion() {
  const g = await import("../js/gamificacion.js");

  // --- Racha amable ---
  // Tres días seguidos terminando hoy: racha de 3, vigente.
  let r = g.calcularEstadoRacha(["2026-08-22", "2026-08-23", "2026-08-24"], "2026-08-24");
  log(r.rachaActual === 3 && r.mejorRacha === 3, "Tres días seguidos terminando hoy dan una racha de 3, vigente");

  // Falta un solo día (23), pero hay actividad el 22 y hoy (24): el hueco se perdona, racha de 2.
  r = g.calcularEstadoRacha(["2026-08-22", "2026-08-24"], "2026-08-24");
  log(r.rachaActual === 2 && !r.enGracia, "Un solo día perdido dentro de la racha no la rompe (se perdona un hueco)");

  // Ayer no hubo actividad y hoy tampoco todavía: sigue "en gracia", se puede recuperar hoy.
  r = g.calcularEstadoRacha(["2026-08-20", "2026-08-21", "2026-08-22"], "2026-08-24");
  log(r.enGracia === false, "Si ya han pasado dos días completos sin actividad, ya no está 'en gracia' (diasDesdeUltimaActividad=2)");
  r = g.calcularEstadoRacha(["2026-08-20", "2026-08-21", "2026-08-23"], "2026-08-24");
  log(
    r.enGracia === true && r.rachaActual === 3,
    "Con la última actividad ayer (no hoy), la racha sigue 'en gracia' y se sigue mostrando activa (3 días), no rota: se puede continuar hoy mismo sin perder nada"
  );

  // Dos días seguidos sin actividad SÍ rompen la racha (se reinicia con calma, sin perder el récord).
  r = g.calcularEstadoRacha(["2026-08-01", "2026-08-10", "2026-08-11", "2026-08-12"], "2026-08-24");
  log(r.rachaActual === 0 && r.mejorRacha === 3, "Tras varios días sin actividad la racha actual baja a 0, pero el récord histórico (mejorRacha) se conserva");

  // --- Puntos y mejora real ---
  const controles = [
    { id: 1, materiaId: "mat-primaria", materiaNombre: "Matemáticas", preguntas: [{ tipo: "opcion_multiple" }, { tipo: "opcion_multiple" }, { tipo: "opcion_multiple" }] },
    { id: 2, materiaId: "mat-primaria", materiaNombre: "Matemáticas", preguntas: [{ tipo: "opcion_multiple" }, { tipo: "opcion_multiple" }, { tipo: "opcion_multiple" }] },
  ];
  const intentos = [
    {
      controlId: 1,
      enviadoEn: "2026-08-24T09:00:00.000Z",
      resultados: [
        { tipo: "opcion_multiple", correcta: true },
        { tipo: "opcion_multiple", correcta: false },
        { tipo: "opcion_multiple", correcta: false },
      ],
    }, // 1/3 = 33%
    {
      controlId: 2,
      enviadoEn: "2026-08-24T10:00:00.000Z",
      resultados: [
        { tipo: "opcion_multiple", correcta: true },
        { tipo: "opcion_multiple", correcta: true },
        { tipo: "opcion_multiple", correcta: true },
      ],
    }, // 3/3 = 100% -> mejora respecto al 33% anterior en la misma materia
  ];
  const mejoras = g.detectarMejoras(controles, intentos);
  log(mejoras.length === 1 && mejoras[0].pctAnterior === 33 && mejoras[0].pctNuevo === 100, "Se detecta una mejora real: de 33% a 100% en la misma materia, entre dos controles distintos");

  const puntos = g.calcularPuntos({ controles, intentos, revisiones: [] });
  log(puntos.puntosEsfuerzo === 6, "6 preguntas cerradas respondidas (independientemente de si acertaron) dan 6 puntos de esfuerzo");
  log(puntos.puntosConstancia === g.PUNTOS_POR_DIA_DE_CONSTANCIA, "Ambos intentos son del mismo día: la constancia cuenta un solo día, no dos");
  log(puntos.puntosMejora === g.PUNTOS_POR_MEJORA, "La mejora real detectada suma sus puntos correspondientes");

  const stats = { intentosEntregados: 2, diasActivos: 1, mejoras: 1, repasosTotales: 0, materiasDistintas: 1, mejorRacha: 1 };
  const logros = g.calcularLogrosDesbloqueados(stats);
  log(logros.some((l) => l.id === "primer_control"), "Con al menos un intento entregado se desbloquea 'Primer paso'");
  log(logros.some((l) => l.id === "mejora_real"), "Con al menos una mejora real se desbloquea 'Mejora real'");
  log(!logros.some((l) => l.id === "explorador"), "Con una sola materia no se desbloquea 'Explorador de materias' (hacen falta al menos 2)");
  log(!logros.some((l) => l.id === "constante_5"), "Con un solo día de actividad no se desbloquea 'Constante' (hacen falta al menos 5)");

  // El nivel nunca depende del tiempo de conexión: dos perfiles con los mismos puntos por
  // motivos distintos (esfuerzo vs. constancia) deben llegar al mismo nivel.
  log(g.calcularNivel(0) === 1, "0 puntos es nivel 1 (nunca nivel 0)");
  log(g.calcularNivel(g.UMBRAL_NIVEL) === 2, "Alcanzar el umbral exacto sube al nivel 2");

  const calendario = g.calcularCalendarioActividad(["2026-08-24"], "2026-08-24", 3);
  log(calendario.length === 3 && calendario[2].actividad === true && calendario[0].actividad === false, "El calendario de actividad marca correctamente el día de hoy y dos días vacíos hacia atrás");
}

// --- Prueba de extremo a extremo: la pestaña Logros con datos reales ---
async function pruebaLogrosEnLaApp() {
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
  await page.fill("#nombre-familia", "Familia Logros");
  await page.click('#form-familia button[type="submit"]');
  await page.waitForSelector('[data-accion="nuevo-perfil"]');
  await page.click('[data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Nora");
  await page.selectOption("#etapa-perfil", "primaria");
  await page.waitForTimeout(150);
  await page.selectOption("#curso-perfil", "primaria-6");
  await page.waitForTimeout(150);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Nora");
  await page.waitForSelector(".tabs-nav");

  // --- Estado inicial: sin ninguna actividad todavía ---
  await page.click('.tab-btn[data-tab="logros"]');
  await page.waitForSelector("text=🏆 Logros de Nora");
  let texto = await page.textContent("#app");
  log(texto.includes("Nivel 1") && texto.includes("(0 puntos en total)"), "Sin actividad, Nora empieza en el nivel 1 con 0 puntos");
  log(texto.includes("Todavía no hay ninguna racha empezada"), "Sin actividad, no hay ninguna racha empezada todavía");
  log(texto.includes("0 de los últimos 14 días con actividad real"), "El calendario de los últimos 14 días empieza vacío");

  // --- Crear DOS controles de la misma materia, para poder provocar una mejora real ---
  async function crearControlOpcionMultiple(titulo) {
    await page.click('[data-accion="cambiar-perfil"]');
    await page.waitForSelector(".rejilla-perfiles");
    await page.click('[data-accion="panel-familia"]');
    await page.waitForSelector("#titulo-panel");
    await page.click('li:has-text("Nora") [data-accion="controles"]');
    await page.waitForSelector("#titulo-controles");
    await page.click('[data-accion="nuevo-control"]');
    await page.waitForSelector("#titulo-control");
    await page.fill("#titulo-control", titulo);
    await page.selectOption("#materia-control", "mat-primaria");
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        await page.click('[data-accion="anadir-pregunta"]');
        await page.waitForSelector(`#tipo-pregunta-${i}`);
      }
      await page.fill(`#enunciado-pregunta-${i}`, `Pregunta ${i + 1} de ${titulo}`);
      const opciones = page.locator(`[data-pregunta="${i}"] [data-campo="opcion"]`);
      await opciones.nth(0).fill("Correcta");
      await opciones.nth(1).fill("Incorrecta");
      // La opción 0 ya queda marcada como correcta por defecto (indiceCorrecta inicial = 0).
    }
    await page.click('#form-control button[type="submit"]');
    await page.waitForSelector("#titulo-controles");
    await page.click('[data-accion="volver-panel"]');
    await page.waitForSelector("#titulo-panel");
    await page.click('[data-accion="volver"]');
    await page.waitForSelector(".rejilla-perfiles");
    await page.click("text=Nora");
    await page.waitForSelector(".tabs-nav");
  }

  await crearControlOpcionMultiple("Control A");
  await crearControlOpcionMultiple("Control B");

  // --- Entregar el Control A con 1 acierto de 3 (33%) ---
  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]');
  await page.locator('li:has-text("Control A") [data-accion="empezar-control"]').click();
  await page.waitForSelector("#form-practicar-control");
  await page.check('[data-respuesta="0"] [data-campo="respuesta"][value="0"]'); // correcta
  await page.check('[data-respuesta="1"] [data-campo="respuesta"][value="1"]'); // incorrecta
  await page.check('[data-respuesta="2"] [data-campo="respuesta"][value="1"]'); // incorrecta
  await page.click('#form-practicar-control button[type="submit"]');
  await page.waitForSelector("text=Volver a Practicar", { timeout: 15000 });
  await page.click('[data-accion="volver-practicar"]');

  // --- Entregar el Control B con 3 aciertos de 3 (100%): mejora real respecto al 33% anterior ---
  await page.waitForSelector('[data-accion="empezar-control"]');
  await page.locator('li:has-text("Control B") [data-accion="empezar-control"]').click();
  await page.waitForSelector("#form-practicar-control");
  await page.check('[data-respuesta="0"] [data-campo="respuesta"][value="0"]');
  await page.check('[data-respuesta="1"] [data-campo="respuesta"][value="0"]');
  await page.check('[data-respuesta="2"] [data-campo="respuesta"][value="0"]');
  await page.click('#form-practicar-control button[type="submit"]');
  await page.waitForSelector("text=Volver a Practicar", { timeout: 15000 });
  await page.click('[data-accion="volver-practicar"]');

  // --- Comprobar los puntos, el nivel, la racha, el calendario y los logros ---
  await page.click('.tab-btn[data-tab="logros"]');
  await page.waitForSelector("text=🏆 Logros de Nora");
  texto = await page.textContent("#app");

  // 6 preguntas cerradas respondidas = 6 esfuerzo; 1 día distinto = 5 constancia; 1 mejora real = 3.
  log(texto.includes("(14 puntos en total)"), "El total de puntos coincide con lo esperado: 6 esfuerzo + 5 constancia + 3 mejora = 14");
  log(texto.includes("Esfuerzo (preguntas respondidas)") && texto.includes("6"), "Se contabilizan las 6 preguntas cerradas respondidas, acertadas o no");
  log(texto.includes("Mejora real") && texto.includes("superar tu resultado anterior"), "Se reconoce la mejora real entre el Control A y el Control B");
  log(texto.includes("Racha actual: 1 día"), "Tras responder hoy, la racha actual muestra 1 día");
  log(texto.includes("1 de los últimos 14 días con actividad real"), "El calendario de actividad refleja el único día con actividad hasta ahora");

  log(texto.includes("Primer paso") && /Primer paso[\s\S]{0,40}Conseguido/.test(texto), "El logro 'Primer paso' aparece como conseguido");
  log(/Mejora real[\s\S]{0,80}Conseguido/.test(texto), "El logro 'Mejora real' aparece como conseguido");
  log(/Explorador de materias[\s\S]{0,40}Todavía no/.test(texto), "El logro 'Explorador de materias' NO está conseguido (ambos controles son de la misma materia)");
  log(/Constante[\s\S]{0,40}Todavía no/.test(texto), "El logro 'Constante' NO está conseguido todavía (solo hay actividad en 1 día)");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo (logros)" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
}

(async () => {
  await pruebaUnitariaGamificacion();
  await pruebaLogrosEnLaApp();
  console.log("\nPruebas de la Fase 7 completadas.");
})();
