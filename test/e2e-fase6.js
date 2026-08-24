// Prueba de la Fase 6 (Rol de Profesor sobre los propios perfiles, apartados
// 8.1, 9, 17 y 31) con Playwright. Cubre: asignación diferenciada de un
// mismo control a varios hermanos del mismo curso (compartiendo objetivo y
// criterios por defecto), marcar una variante como excepción explícita
// cuando la Familia decide cambiar el contenido solo para uno, el informe
// de progreso de un hijo/a accesible desde el Panel de la Familia sin
// entrar en su perfil (y que nunca expone datos de otro hermano), y la
// gestión de las adaptaciones de accesibilidad desde ese mismo Panel.
const { chromium } = require("playwright");

const BASE = "http://localhost:8791/index.html";

function log(ok, msg) {
  console.log((ok ? "OK   " : "FALLO") + " - " + msg);
  if (!ok) process.exitCode = 1;
}

async function crearPerfilDesdeSelector(page, nombre, etapa, curso) {
  await page.click('[data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", nombre);
  await page.selectOption("#etapa-perfil", etapa);
  await page.waitForTimeout(150);
  await page.selectOption("#curso-perfil", curso);
  await page.waitForTimeout(150);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");
}

// --- Asignación diferenciada entre hermanos del mismo curso, y excepción explícita ---
async function pruebaAsignacionDiferenciada() {
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
  await page.fill("#nombre-familia", "Familia Asignacion");
  await page.click('#form-familia button[type="submit"]');
  await page.waitForSelector('[data-accion="nuevo-perfil"]');

  await crearPerfilDesdeSelector(page, "Lucas", "primaria", "primaria-6");
  await crearPerfilDesdeSelector(page, "Marta", "primaria", "primaria-6"); // mismo curso que Lucas
  await crearPerfilDesdeSelector(page, "Nico", "primaria", "primaria-3"); // curso DISTINTO

  // --- Crear un control nuevo para Lucas, con la opción de asignarlo también a hermanos ---
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('li:has-text("Lucas") [data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  await page.click('[data-accion="nuevo-control"]');
  await page.waitForSelector("#titulo-control");

  log(await page.isVisible('label:has-text("Marta")'), "Al crear un control nuevo para Lucas, se ofrece asignarlo también a Marta (mismo curso)");
  log(!(await page.isVisible('label:has-text("Nico")')), "Nico NO se ofrece como candidato: está en un curso distinto, sus criterios no coinciden");

  await page.fill("#titulo-control", "Control compartido de fracciones");
  await page.selectOption("#materia-control", "mat-primaria");
  await page.fill("#enunciado-pregunta-0", "1/2 + 1/4 = ?");
  const opciones = page.locator('[data-pregunta="0"] [data-campo="opcion"]');
  await opciones.nth(0).fill("3/4");
  await opciones.nth(1).fill("1/2");
  await page.locator('label:has-text("Marta") input[data-campo="hermano-asignado"]').check();
  await page.click('#form-control button[type="submit"]');
  await page.waitForSelector("#titulo-controles");
  log(true, "El control se guarda, asignado también a Marta");

  let textoControlesLucas = await page.textContent("#app");
  log(textoControlesLucas.includes("Asignación compartida con: Marta"), "En la lista de Lucas se ve que el control está compartido con Marta");

  // --- Marta debe tener su propia variante del mismo control ---
  await page.click('[data-accion="volver-panel"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('li:has-text("Marta") [data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  let textoControlesMarta = await page.textContent("#app");
  log(textoControlesMarta.includes("Control compartido de fracciones"), "Marta tiene su propia copia del control asignado");
  log(textoControlesMarta.includes("Asignación compartida con: Lucas"), "La copia de Marta muestra que está compartida con Lucas");

  // --- Aislamiento: responder como Lucas no afecta al control de Marta ---
  await page.click('[data-accion="volver-panel"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('[data-accion="volver"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Lucas");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]');
  await page.click('[data-accion="empezar-control"]');
  await page.waitForSelector("#form-practicar-control");
  await page.check('[data-respuesta="0"] [data-campo="respuesta"][value="0"]');
  await page.click('#form-practicar-control button[type="submit"]');
  await page.waitForSelector("text=Volver a Practicar", { timeout: 15000 });
  log(true, "Lucas entrega su propia variante del control");

  await page.click('[data-accion="volver-practicar"]');
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Marta");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]');
  log(true, "El control de Marta sigue pendiente de entregar: la entrega de Lucas no lo ha afectado (aislamiento)");

  // --- Excepción explícita: la Familia cambia el enunciado de la variante de Marta ---
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('li:has-text("Marta") [data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  await page.click('[data-accion="editar-control"]');
  await page.waitForSelector("#titulo-control");
  log(await page.isVisible("text=Este control forma parte de una asignación compartida"), "Al editar la variante de Marta se avisa de que es parte de una asignación compartida");

  await page.fill("#enunciado-pregunta-0", "1/3 + 1/3 = ? (versión más sencilla para Marta)");
  await page.check("#excepcion-asignacion");
  await page.waitForSelector("#nota-excepcion");
  await page.fill("#nota-excepcion", "Marta necesita una versión con fracciones más simples de momento.");
  await page.click('#form-control button[type="submit"]');
  await page.waitForSelector("#titulo-controles");
  textoControlesMarta = await page.textContent("#app");
  log(textoControlesMarta.includes("Excepción respecto a sus hermanos"), "La lista de Marta muestra la marca de excepción");
  log(
    textoControlesMarta.includes("Marta necesita una versión con fracciones más simples"),
    "La lista de Marta muestra el motivo real de la excepción"
  );

  // --- El control de Lucas NO se ha visto afectado por la excepción de Marta ---
  await page.click('[data-accion="volver-panel"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('li:has-text("Lucas") [data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  textoControlesLucas = await page.textContent("#app");
  log(!textoControlesLucas.includes("Excepción respecto a sus hermanos"), "El control de Lucas sigue sin marca de excepción");
  await page.click('[data-accion="editar-control"]');
  await page.waitForSelector("#titulo-control");
  const enunciadoLucas = await page.inputValue("#enunciado-pregunta-0");
  log(enunciadoLucas === "1/2 + 1/4 = ?", "El enunciado original de Lucas no ha cambiado al marcar la excepción de Marta");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo (asignación diferenciada)" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
}

// --- Informe y Adaptaciones desde el Panel de la Familia, sin entrar en el perfil ---
async function pruebaInformeYAdaptacionesFamilia() {
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
  await page.fill("#nombre-familia", "Familia Informes");
  await page.click('#form-familia button[type="submit"]');
  await page.waitForSelector('[data-accion="nuevo-perfil"]');

  await crearPerfilDesdeSelector(page, "Vega", "primaria", "primaria-6");
  await crearPerfilDesdeSelector(page, "Iker", "primaria", "primaria-3"); // hermano sin ningún dato

  // --- Vega: un control de 5 preguntas sobre el mismo criterio, 1 acierto y 4 fallos ---
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('li:has-text("Vega") [data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  await page.click('[data-accion="nuevo-control"]');
  await page.waitForSelector("#titulo-control");
  await page.selectOption("#materia-control", "mat-primaria");
  await page.waitForSelector("#criterio-pregunta-0");
  const opciones0 = await page.locator("#criterio-pregunta-0 option").allTextContents();
  const etiquetaCriterio11 = opciones0.find((t) => t.includes("1.1"));

  await page.fill("#titulo-control", "Control de informe");
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

  await page.click('[data-accion="volver-panel"]');
  await page.click('[data-accion="volver"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Vega");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]');
  await page.click('[data-accion="empezar-control"]');
  await page.waitForSelector("#form-practicar-control");
  await page.fill("#respuesta-0", "1");
  await page.fill("#respuesta-1", "no lo sé");
  await page.fill("#respuesta-2", "no lo sé");
  await page.fill("#respuesta-3", "no lo sé");
  await page.fill("#respuesta-4", "no lo sé");
  await page.click('#form-practicar-control button[type="submit"]');
  await page.waitForSelector("text=Volver a Practicar", { timeout: 15000 });
  await page.click('[data-accion="volver-practicar"]');
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");

  // --- Informe desde el Panel de la Familia, SIN entrar en el perfil de Vega ---
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('li:has-text("Vega") [data-accion="informe"]');
  await page.waitForSelector("#titulo-informe");
  let textoInforme = await page.textContent("#app");
  log(textoInforme.includes("Informe de Vega"), "Se abre el informe de Vega directamente desde el Panel de la Familia");
  log(textoInforme.includes("Con dificultad") && textoInforme.includes("1.1") && textoInforme.includes("20%"), "El informe muestra la evidencia real (criterio 1.1, con dificultad, 20%) sin necesidad de un clic extra en '¿Por qué?'");

  // --- Aislamiento: el informe de Iker (sin datos) nunca expone los datos de Vega ---
  await page.click('[data-accion="volver-panel"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('li:has-text("Iker") [data-accion="informe"]');
  await page.waitForSelector("#titulo-informe");
  const textoInformeIker = await page.textContent("#app");
  log(textoInformeIker.includes("Todavía no hay ningún control entregado"), "El informe de Iker, sin datos propios, lo indica con claridad");
  log(!textoInformeIker.includes("1.1") && !textoInformeIker.includes("20%") && !textoInformeIker.includes("Con dificultad"), "El informe de Iker nunca expone la evidencia de Vega (aislamiento entre hermanos)");

  // --- Adaptaciones desde el Panel de la Familia, sin entrar en el perfil ---
  await page.click('[data-accion="volver-panel"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('li:has-text("Vega") [data-accion="adaptaciones-familia"]');
  await page.waitForSelector("#titulo-adaptaciones-familia");
  let textoAdaptaciones = await page.textContent("#app");
  log(textoAdaptaciones.includes("Lenguaje más sencillo"), "La vista de Adaptaciones de la Familia muestra la sugerencia detectada para Vega");

  await page.click('[data-accion="aceptar-sugerencia"]');
  await page.waitForSelector('[data-accion="aceptar-sugerencia"]', { state: "detached", timeout: 10000 });
  log(await page.isChecked("#ax-lenguaje-simplificado"), "Aceptar la sugerencia desde el Panel de la Familia activa de verdad el ajuste");

  await page.selectOption("#ax-tamano-letra", "grande");
  await page.selectOption("#ax-tema", "oscuro");
  await page.click('#form-accesibilidad-familia button[type="submit"]');
  await page.waitForSelector("#titulo-panel", { timeout: 10000 });
  log(true, "Guardar los ajustes desde el Panel de la Familia vuelve al propio Panel");

  const atributosTrasGuardarDesdePanel = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  log(
    atributosTrasGuardarDesdePanel.tamanoLetra !== "grande",
    "Guardar los ajustes de Vega desde el Panel de la Familia NO cambia el <html> global (no hay ningún perfil activo en ese contexto)"
  );

  // --- Al entrar de verdad en el perfil de Vega, los ajustes guardados por la Familia se aplican ---
  await page.click('[data-accion="volver"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Vega");
  await page.waitForSelector(".tabs-nav");
  const atributosVega = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  log(atributosVega.tamanoLetra === "grande" && atributosVega.tema === "oscuro", "Al entrar en el perfil de Vega, los ajustes guardados por la Familia desde su Panel ya están activos");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo (informe/adaptaciones)" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
}

(async () => {
  await pruebaAsignacionDiferenciada();
  await pruebaInformeYAdaptacionesFamilia();
  console.log("\nPruebas de la Fase 6 completadas.");
})();
