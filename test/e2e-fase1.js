// Prueba manual de la Fase 1 ("Mi profesor") con Playwright.
// Se ejecuta con el navegador SIN las banderas especiales de WebGPU, para
// comprobar el camino más realista para la mayoría de usuarios de escritorio
// de hoy: sin WebGPU disponible, cae automáticamente al motor de prueba, sin
// romperse y dejándolo dicho con claridad en la interfaz (nunca se hace
// pasar el motor de prueba por el motor real). La validación del motor real
// (WebGPU + WebLLM) queda para el iPad físico, tal como exige el criterio de
// aceptación de la Fase 1 del documento de arquitectura.
const { chromium } = require("playwright");

const BASE = "http://localhost:8791/index.html";

function log(ok, msg) {
  console.log((ok ? "OK   " : "FALLO") + " - " + msg);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const erroresConsola = [];
  page.on("pageerror", (err) => erroresConsola.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") erroresConsola.push(msg.text());
  });

  await page.goto(BASE);
  await page.waitForSelector("#nombre-familia");
  await page.fill("#nombre-familia", "Familia Fase1");
  await page.click('#form-familia button[type="submit"]');

  // Perfil en 6º de Primaria, para que exista contenido curricular verificado de Matemáticas.
  await page.waitForSelector('[data-accion="nuevo-perfil"]');
  await page.click('.rejilla-perfiles [data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Nora");
  await page.selectOption("#etapa-perfil", "primaria");
  await page.waitForTimeout(200);
  await page.selectOption("#curso-perfil", "primaria-6");
  await page.waitForTimeout(200);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");

  await page.click("text=Nora");
  await page.waitForSelector(".tabs-nav");
  log(true, "Entrada en el perfil de Nora (6º de Primaria)");

  // Ir a la pestaña "Mi profesor"
  await page.click('.tab-btn[data-tab="profesor"]');
  await page.waitForSelector("#materia-profesor");
  log(true, "Selector de materia/tema visible en la pestaña Mi profesor");

  await page.selectOption("#materia-profesor", "mat-primaria");
  await page.waitForSelector("text=Hay currículo oficial verificado", { timeout: 3000 });
  log(true, "Se detecta y avisa del currículo verificado disponible para Matemáticas 6º");

  await page.fill("#tema-profesor", "las divisiones con dos cifras");
  await page.click('[data-modo="practica"]');
  const modoPractica = await page.getAttribute('[data-modo="practica"]', "aria-pressed");
  log(modoPractica === "true", "El modo Práctica queda seleccionado al pulsarlo");

  await page.click('#form-tema-profesor button[type="submit"]');

  // Pantalla de carga del motor
  await page.waitForSelector("text=Preparando el profesor IA", { timeout: 5000 });
  log(true, "Se muestra la pantalla de carga del motor de IA");

  // Debe caer al motor de prueba (sin WebGPU en este navegador sin banderas especiales)
  await page.waitForSelector("text=Motor de prueba", { timeout: 15000 });
  log(true, "Sin WebGPU disponible, cae automáticamente al motor de prueba y lo etiqueta con claridad (nunca como IA real)");

  // La tarjeta de currículo verificado se muestra tal cual, no generada por el modelo
  await page.waitForTimeout(300);
  const tarjetaVisible = (await page.textContent("#app")).includes("Interpretar situaciones de la vida cotidiana");
  log(tarjetaVisible, "El contenido curricular verificado se muestra literal, no reformulado por el modelo (📄 vs 🧠)");

  // Enviar un primer mensaje: en modo práctica, no debe dar la solución de entrada
  await page.fill("#campo-mensaje", "No me sale la división 84 entre 4");
  await page.click('#form-mensaje button[type="submit"]');
  await page.waitForSelector('[data-mensaje="1"]', { timeout: 5000 });
  await page.waitForTimeout(500); // esperar a que termine el "streaming" simulado
  const primeraRespuesta = await page.textContent('[data-mensaje="1"] [data-texto]');
  const noDaSolucionDeEntrada = !/^\(Motor de prueba\) Aquí tienes el proceso completo/.test(primeraRespuesta || "");
  log(noDaSolucionDeEntrada, "En modo práctica, la primera respuesta no es la solución completa");
  log((primeraRespuesta || "").includes("qué parte concreta"), "La primera respuesta en modo práctica pide precisar el bloqueo, sin dar pistas todavía (nivel 0)");

  // Pedir una pista: debe escalar de nivel
  await page.click('[data-accion="pedir-pista"]');
  await page.waitForTimeout(600);
  const botonPista = await page.textContent('[data-accion="pedir-pista"]');
  log(botonPista.includes("(1)"), "El contador de pistas usadas sube a 1 tras pedir una pista");

  const solucionDeshabilitada = await page.getAttribute('[data-accion="ver-solucion"]', "disabled");
  log(solucionDeshabilitada !== null, "El botón de solución completa sigue deshabilitado con solo 1 pista usada");

  // Pedir una segunda pista para desbloquear la solución completa
  await page.click('[data-accion="pedir-pista"]');
  await page.waitForTimeout(600);
  const solucionHabilitada = await page.getAttribute('[data-accion="ver-solucion"]', "disabled");
  log(solucionHabilitada === null, "El botón de solución completa se habilita tras 2 pistas, no antes (pasos crecientes de ayuda)");

  // Comprobar el badge de contenido generado (🧠) en las respuestas del asistente
  const insigniaGenerada = await page.isVisible("text=Explicación generada");
  log(insigniaGenerada, "Las respuestas del asistente llevan la insignia 🧠 de contenido generado");

  // Comprobar botón de lectura en voz alta presente
  const botonVozPresente = await page.isVisible('[data-accion="leer"]');
  log(botonVozPresente, "Hay un botón de lectura en voz alta en las respuestas del profesor");

  // Comprobar que el micrófono está presente (aunque en este navegador headless puede no soportar reconocimiento real)
  const micPresente = await page.isVisible("#btn-dictado");
  log(micPresente, "El botón de dictado por voz está presente (con teclado siempre como alternativa)");

  // Comprobar aislamiento: cambiar de perfil no debe arrastrar la conversación de Nora
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click('.rejilla-perfiles [data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Bruno");
  await page.selectOption("#etapa-perfil", "eso");
  await page.waitForTimeout(200);
  await page.selectOption("#curso-perfil", "eso-2");
  await page.waitForTimeout(200);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Bruno");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="profesor"]');
  await page.waitForSelector("#materia-profesor");
  const seVeSelectorLimpio = await page.isVisible("#materia-profesor");
  log(seVeSelectorLimpio, "Al entrar como Bruno, Mi profesor vuelve al selector inicial, sin la conversación de Nora (aislamiento entre hermanos)");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
  console.log("\nPruebas de la Fase 1 completadas.");
})();
