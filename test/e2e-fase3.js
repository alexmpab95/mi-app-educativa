// Prueba de la Fase 3 (Controles/Practicar) con Playwright, con el motor de
// prueba (sin WebGPU real, igual que en el resto de este entorno de
// desarrollo sin acceso a internet general). Cubre el ciclo completo:
// la Familia crea un control con las 4 tipologías de pregunta, el Alumno lo
// entrega desde "Practicar" (las preguntas cerradas se corrigen sin IA, la
// abierta recibe una propuesta de la IA), la Familia confirma la
// calificación de la pregunta abierta, y el Alumno ve el resultado final.
// También cubre el repaso informal de fichas.
const { chromium } = require("playwright");

const BASE = "http://localhost:8791/index.html";

function log(ok, msg) {
  console.log((ok ? "OK   " : "FALLO") + " - " + msg);
  if (!ok) process.exitCode = 1;
}

(async () => {
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
  await page.fill("#nombre-familia", "Familia Practicar");
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

  // Familia crea un control con las 4 tipologías
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('[data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  await page.click('[data-accion="nuevo-control"]');
  await page.waitForSelector("#titulo-control");
  await page.fill("#titulo-control", "Control mixto");
  await page.selectOption("#materia-control", "mat-primaria");
  await page.selectOption("#nivel-ayuda-control", "1");

  await page.fill("#enunciado-pregunta-0", "¿Cuánto es 2+2?");
  const opciones0 = page.locator('[data-pregunta="0"] [data-campo="opcion"]');
  await opciones0.nth(0).fill("3");
  await opciones0.nth(1).fill("4");
  await page.locator('[data-pregunta="0"] input[type="radio"][value="1"]').check();

  await page.click('[data-accion="anadir-pregunta"]');
  await page.waitForSelector('[data-pregunta="1"]');
  await page.selectOption("#tipo-pregunta-1", "verdadero_falso");
  await page.waitForTimeout(50);
  await page.fill("#enunciado-pregunta-1", "El sol es una estrella.");
  await page.locator('[data-pregunta="1"] input[type="radio"][value="true"]').check();

  await page.click('[data-accion="anadir-pregunta"]');
  await page.waitForSelector('[data-pregunta="2"]');
  await page.selectOption("#tipo-pregunta-2", "respuesta_corta");
  await page.waitForTimeout(50);
  await page.fill("#enunciado-pregunta-2", "Capital de España");
  await page.fill("#respuesta-corta-2", "Madrid");

  await page.click('[data-accion="anadir-pregunta"]');
  await page.waitForSelector('[data-pregunta="3"]');
  await page.selectOption("#tipo-pregunta-3", "abierta");
  await page.waitForTimeout(50);
  await page.fill("#enunciado-pregunta-3", "Explica qué es la fotosíntesis.");

  await page.click('#form-control button[type="submit"]');
  await page.waitForSelector("#titulo-controles");
  log(true, "Control mixto creado con las 4 tipologías de pregunta");

  await page.click('[data-accion="volver-panel"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('[data-accion="volver"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Nora");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]');
  log((await page.textContent("#app")).includes("Sin entregar"), "El control aparece como 'Sin entregar' antes del primer intento");

  await page.click('[data-accion="empezar-control"]');
  await page.waitForSelector("#form-practicar-control");

  // Responder: pregunta 0 correcta (4), pregunta 1 correcta (true), pregunta 2 incorrecta (Barcelona en vez de Madrid), pregunta 3 abierta
  await page.locator('[data-respuesta="0"] input[type="radio"][value="1"]').check();
  await page.locator('[data-respuesta="1"] input[type="radio"][value="true"]').check();
  await page.fill("#respuesta-2", "Barcelona");
  await page.fill("#respuesta-3", "Es el proceso por el que las plantas fabrican su alimento usando la luz del sol.");

  // Pedir una pista para la pregunta abierta antes de entregar
  await page.click('[data-respuesta="3"] [data-accion="pedir-pista-control"]');
  await page.waitForSelector('[data-pista="3"]', { timeout: 10000 });
  log((await page.textContent('[data-pista="3"]')).includes("Motor de prueba"), "Se puede pedir una pista de nivel fijo durante el control (motor de prueba)");

  await page.click('#form-practicar-control button[type="submit"]');
  await page.waitForSelector("text=Volver a Practicar", { timeout: 15000 });
  const resultado = await page.textContent("#app");
  log(resultado.includes("✅ Correcta"), "Las respuestas correctas se marcan como tales, sin IA");
  log(resultado.includes("❌ Incorrecta"), "La respuesta corta incorrecta se detecta sin IA");
  log(resultado.includes("Propuesta de la IA"), "La pregunta abierta muestra la propuesta de la IA, sin confirmar todavía");
  log(resultado.includes("revisará un adulto"), "Se explica al alumno que la pregunta abierta la revisará la Familia");

  await page.click('[data-accion="volver-practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]');
  const listaTrasEntregar = await page.textContent("#app");
  log(listaTrasEntregar.includes("Entregado"), "Tras entregar, el control pasa a estado 'Entregado' en la lista");
  log(listaTrasEntregar.includes("1 pregunta abierta") && listaTrasEntregar.includes("pendiente"), "La lista indica cuántas preguntas abiertas están pendientes de confirmar");

  // --- Familia confirma la calificación ---
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  const panelConPendiente = await page.textContent("#app");
  log(panelConPendiente.includes("Control mixto") && panelConPendiente.includes("1 pregunta abierta"), "El Panel de la Familia muestra la calificación pendiente de confirmar");

  await page.click('[data-accion="revisar-intento"]');
  await page.waitForSelector("#titulo-revision");
  const revision = await page.textContent("#app");
  log(revision.includes("fotosíntesis"), "La revisión muestra la pregunta abierta y la respuesta del alumno");
  log(revision.includes("Correcta") && revision.includes("Incorrecta"), "La revisión también muestra el resultado de las preguntas cerradas, de solo lectura");

  await page.click('[data-accion="confirmar-calificaciones"]');
  await page.waitForSelector("#titulo-panel");
  const panelTrasConfirmar = await page.textContent("#app");
  log(panelTrasConfirmar.includes("No hay ninguna calificación pendiente"), "Tras confirmar, ya no quedan calificaciones pendientes");

  // Verificar que el alumno ve la calificación ya confirmada
  await page.click('[data-accion="volver"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Nora");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector('[data-accion="ver-resultado"]');
  log((await page.textContent("#app")).includes("Corregido"), "El alumno ve el control como 'Corregido' tras la confirmación de la Familia");
  await page.click('[data-accion="ver-resultado"]');
  await page.waitForSelector("text=Volver a Practicar");
  log((await page.textContent("#app")).includes("Calificación confirmada por la Familia"), "El alumno ve la calificación final ya confirmada, no solo la propuesta");
  await page.click('[data-accion="volver-practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]'); // esperar a que termine de pintarse la lista antes de cambiar de pestaña

  // --- Progreso (primer nivel visible): 2/3 cerradas correctas + 1 abierta confirmada como "parcial" ---
  await page.click('.tab-btn[data-tab="progreso"]');
  // "text=📈 Progreso" también coincide con la pestaña de navegación (siempre presente),
  // así que hay que esperar a un texto propio de la pantalla ya renderizada, no de la barra.
  await page.waitForSelector("text=Solo se cuenta lo que ya está corregido con seguridad");
  const progreso = await page.textContent("#app");
  log(progreso.includes("2/3 correctas") && progreso.includes("67%"), "Progreso: cuenta las 3 preguntas cerradas (2 correctas) sin esperar ninguna confirmación");
  log(progreso.includes("1 parcial"), "Progreso: la pregunta abierta ya confirmada como 'parcial' se refleja en el resumen");
  log(!progreso.includes("pendiente"), "Progreso: no queda ningún aviso de pendiente, porque ya no hay ninguna calificación sin confirmar");

  // --- Aislamiento entre hermanos: Bruno no ve nada de lo de Nora ---
  await page.click('.tab-btn[data-tab="inicio"]');
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click('[data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Bruno");
  await page.selectOption("#etapa-perfil", "primaria");
  await page.waitForTimeout(150);
  await page.selectOption("#curso-perfil", "primaria-3");
  await page.waitForTimeout(150);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Bruno");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector("text=✏️ Controles");
  const practicarBruno = await page.textContent("#app");
  log(practicarBruno.includes("Todavía no tienes ningún control asignado") && !practicarBruno.includes("Control mixto"), "Bruno no ve los controles de Nora (aislamiento entre hermanos)");
  await page.click('.tab-btn[data-tab="progreso"]');
  // Mismo motivo que arriba: se espera un texto propio de la pantalla ya renderizada.
  await page.waitForSelector("text=Todavía no hay ningún control entregado");
  log((await page.textContent("#app")).includes("Todavía no hay ningún control entregado"), "El progreso de Bruno está vacío, no mezclado con el de Nora");

  // --- Fichas para repasar (informal, sin control), seguimos con Bruno ---
  await page.waitForSelector('.tab-btn[data-tab="crear"]');
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

  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector('[data-accion="repasar-fichas"]');
  await page.click('[data-accion="repasar-fichas"]');
  await page.waitForSelector('[data-accion="ver-respuesta-ficha"]');
  log(true, "Se puede entrar al repaso informal de fichas");
  const antesDeVer = await page.textContent("#app");
  log(!antesDeVer.includes("Respuesta de ejemplo 1"), "La respuesta no se muestra hasta pulsar 'Ver respuesta'");
  await page.click('[data-accion="ver-respuesta-ficha"]');
  await page.waitForTimeout(100);
  log((await page.textContent("#app")).includes("Respuesta de ejemplo 1"), "Tras pulsar 'Ver respuesta' se muestra la respuesta de la ficha");
  await page.click('[data-accion="ficha-siguiente"]');
  await page.waitForTimeout(100);
  log((await page.textContent("#app")).includes("Ficha 2 de 3"), "Se puede avanzar a la siguiente ficha");

  // --- Cifrado en reposo: los nuevos almacenes de la Fase 3 tampoco guardan nada en claro ---
  const rawStores = await page.evaluate(async () => {
    const nombres = ["controles", "intentos", "auditoria"];
    const abrir = () =>
      new Promise((resolve) => {
        const req = indexedDB.open("educativo_app");
        req.onsuccess = () => resolve(req.result);
      });
    const db = await abrir();
    const resultado = {};
    for (const nombre of nombres) {
      resultado[nombre] = await new Promise((resolve) => {
        const tx = db.transaction(nombre, "readonly");
        const getAll = tx.objectStore(nombre).getAll();
        getAll.onsuccess = () => resolve(JSON.stringify(getAll.result));
      });
    }
    return resultado;
  });
  const textoPlanoSensible = ["Control mixto", "fotosíntesis", "Barcelona", "confirmar_calificacion_abierta"];
  for (const nombre of ["controles", "intentos", "auditoria"]) {
    const contieneAlgunoEnClaro = textoPlanoSensible.some((t) => rawStores[nombre].includes(t));
    log(!contieneAlgunoEnClaro, `El almacén "${nombre}" no guarda ningún dato sensible en claro (solo iv/data cifrados)`);
  }
  log(rawStores.auditoria.includes('"data"') && rawStores.auditoria.includes('"iv"'), "El registro de auditoría también está cifrado (iv + data), no solo los otros almacenes");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
  console.log("\nPruebas de la Fase 3 completadas.");
})();
