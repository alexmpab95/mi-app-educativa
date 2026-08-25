// Prueba de regresión de un bug real, encontrado al validar en un iPad real
// (fuera de este entorno de desarrollo sin internet): si el navegador
// anunciaba soporte de WebGPU (navigator.gpu + un adaptador) pero la carga
// real del modelo fallaba después (red, CDN bloqueado, memoria insuficiente
// del dispositivo...), la pantalla se quedaba en "⚠️ Motor no disponible" en
// vez de caer al motor de prueba — justo lo contrario de lo que promete el
// propio documento de arquitectura ("se degrada con elegancia"). Corregido
// en js/motor-compartido.js. Esta prueba simula exactamente ese escenario:
// un adaptador WebGPU falso (para que hayWebGPU() devuelva true) y la
// petición de red al CDN de WebLLM bloqueada (para que la carga real falle
// de verdad), y comprueba que la app cae al motor de prueba en vez de
// romperse.
const { chromium } = require("playwright");

const BASE = "http://localhost:8791/index.html";

function log(ok, msg) {
  console.log((ok ? "OK   " : "FALLO") + " - " + msg);
  if (!ok) process.exitCode = 1;
}

async function pruebaCaidaAMotorDePruebaTrasFalloReal() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erroresConsola = [];
  page.on("pageerror", (err) => erroresConsola.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      // Se espera un error de red real (el CDN bloqueado a propósito) y el propio
      // console.error que añade motor-compartido.js al capturarlo: ambos son la señal
      // de que la prueba está ejerciendo el camino correcto, no un fallo de la app.
      const t = msg.text();
      if (t.includes("esm.run") || t.includes("motor real") || t.toLowerCase().includes("failed to fetch") || t.toLowerCase().includes("err_failed")) return;
      erroresConsola.push(t);
      console.log("CONSOLE ERROR:", t);
    }
  });

  // Antes de que cargue ningún script de la app: simula que el navegador SÍ anuncia
  // soporte de WebGPU (como haría Safari/iPadOS real), devolviendo un adaptador falso
  // pero "verdadero" para navigator.gpu.requestAdapter().
  await page.addInitScript(() => {
    window.navigator.__defineGetter__ ? null : null; // no-op, por claridad de que no se toca nada más
    Object.defineProperty(window.navigator, "gpu", {
      value: { requestAdapter: async () => ({ falso: true }) },
      configurable: true,
    });
  });

  // Bloquea de verdad la petición de red al CDN de WebLLM, para que la carga del motor
  // real falle tal como fallaría sin conexión o con el CDN bloqueado por la red del centro.
  await page.route("**/esm.run/**", (route) => route.abort("failed"));

  await page.goto(BASE);
  await page.waitForSelector("#nombre-familia");
  await page.fill("#nombre-familia", "Familia FalloMotor");
  await page.click('#form-familia button[type="submit"]');
  await page.waitForSelector('[data-accion="nuevo-perfil"]');
  await page.click('[data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Uxue");
  await page.selectOption("#etapa-perfil", "primaria");
  await page.waitForTimeout(150);
  await page.selectOption("#curso-perfil", "primaria-6");
  await page.waitForTimeout(150);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Uxue");
  await page.waitForSelector(".tabs-nav");

  await page.click('.tab-btn[data-tab="profesor"]');
  await page.waitForSelector("#materia-profesor");
  await page.selectOption("#materia-profesor", "mat-primaria");
  await page.fill("#tema-profesor", "Fracciones");
  await page.click('#form-tema-profesor button[type="submit"]');

  // Con el bug original, aquí se quedaba (o llegaba) a "⚠️ Motor no disponible" y el chat
  // podía quedar inservible. Con la corrección, cae automáticamente al motor de prueba.
  await page.waitForSelector("text=🧪 Motor de prueba", { timeout: 20000 });
  const texto = await page.textContent("#app");
  log(!texto.includes("⚠️ Motor no disponible"), "La app NO se queda en '⚠️ Motor no disponible' cuando el motor real falla tras anunciar soporte");
  log(texto.includes("el motor real no se pudo cargar"), "Se explica con honestidad que el motor real no se pudo cargar, no que nunca hubo soporte");
  log(await page.isVisible("#campo-mensaje"), "El chat sigue siendo utilizable (con el motor de prueba) en vez de quedar roto");

  // Comprobar que el motor de prueba responde de verdad (la conversación sigue funcionando).
  await page.fill("#campo-mensaje", "¿Cómo sumo fracciones?");
  await page.click('#form-mensaje button[type="submit"]');
  await page.waitForSelector("text=(Motor de prueba)", { timeout: 15000 });
  log(true, "El motor de prueba responde con normalidad tras la caída del motor real");

  log(erroresConsola.length === 0, "Sin errores de consola inesperados durante todo el flujo" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
}

(async () => {
  await pruebaCaidaAMotorDePruebaTrasFalloReal();
  console.log("\nPrueba de regresión de la caída al motor de prueba completada.");
})();
