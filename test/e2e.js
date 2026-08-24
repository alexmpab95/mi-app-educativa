// Prueba manual de la Fase 0 con Playwright: crea familia, crea dos
// perfiles, comprueba aislamiento entre hermanos, comprueba persistencia
// tras recargar, y navega por las pestañas vacías.
const { chromium } = require("playwright");

const BASE = "http://localhost:8791/index.html";

function log(ok, msg) {
  console.log((ok ? "OK   " : "FALLO") + " - " + msg);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium/chrome-linux/chrome" }).catch(async () => {
    return chromium.launch();
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
  });

  await page.goto(BASE);
  await page.waitForSelector("#nombre-familia", { timeout: 5000 });
  log(true, "Pantalla de onboarding visible");

  await page.fill("#nombre-familia", "Familia García");
  await page.fill("#pin-familia", "1234");
  await page.click('#form-familia button[type="submit"]');

  await page.waitForSelector('[data-accion="nuevo-perfil"]', { timeout: 5000 });
  log(true, "Cuenta familiar creada, selector de perfiles visible");

  // Crear primer perfil: Lucía, 3º Primaria, Matemáticas
  await page.click('.rejilla-perfiles [data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Lucía");
  await page.selectOption("#etapa-perfil", "primaria");
  await page.waitForTimeout(200);
  await page.selectOption("#curso-perfil", "primaria-3");
  await page.waitForTimeout(200);
  await page.click('#form-perfil button[type="submit"]');

  await page.waitForSelector(".rejilla-perfiles");
  const perfil1Visible = await page.isVisible("text=Lucía");
  log(perfil1Visible, "Perfil 'Lucía' creado y visible en el selector");

  // Crear segundo perfil: Marc, 1º ESO
  await page.click('.rejilla-perfiles [data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", "Marc");
  await page.selectOption("#etapa-perfil", "eso");
  await page.waitForTimeout(200);
  await page.selectOption("#curso-perfil", "eso-1");
  await page.waitForTimeout(200);
  await page.click('#form-perfil button[type="submit"]');

  await page.waitForSelector(".rejilla-perfiles");
  const perfil2Visible = await page.isVisible("text=Marc");
  log(perfil2Visible, "Perfil 'Marc' creado y visible en el selector");

  // Entrar en el perfil de Lucía y comprobar que solo se ve su propio curso
  await page.click("text=Lucía");
  await page.waitForSelector(".tabs-nav");
  const textoCabeceraLucia = await page.textContent(".cabecera-app");
  const soloLucia = textoCabeceraLucia.includes("Lucía") && textoCabeceraLucia.includes("3º de Primaria") && !textoCabeceraLucia.includes("Marc");
  log(soloLucia, "Al entrar como Lucía solo se muestran sus propios datos (curso 3º Primaria), no los de Marc");

  // Navegar por las pestañas vacías
  await page.click('.tab-btn[data-tab="practicar"]');
  const practicarVisible = await page.isVisible("text=Practicar");
  log(practicarVisible, "Pestaña 'Practicar' navega correctamente (contenido pendiente, como corresponde a la Fase 0)");

  // Volver al selector y comprobar que Marc ve solo lo suyo
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Marc");
  await page.waitForSelector(".tabs-nav");
  const textoCabeceraMarc = await page.textContent(".cabecera-app");
  const soloMarc = textoCabeceraMarc.includes("Marc") && textoCabeceraMarc.includes("1º de ESO") && !textoCabeceraMarc.includes("Lucía");
  log(soloMarc, "Al entrar como Marc solo se muestran sus propios datos (1º de ESO), no los de Lucía");

  // Recargar la página entera: los datos deben persistir en IndexedDB
  await page.reload();
  await page.waitForSelector(".rejilla-perfiles", { timeout: 5000 });
  const persisteLucia = await page.isVisible("text=Lucía");
  const persisteMarc = await page.isVisible("text=Marc");
  log(persisteLucia && persisteMarc, "Los dos perfiles sobreviven a un cierre y reapertura de la app (persistencia local)");

  // Tras el reload ya estamos en el selector de perfiles (vista inicial).
  // Comprobar que el PIN protege el Panel de la Familia
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#pin-entrada");
  await page.fill("#pin-entrada", "0000");
  await page.click('#form-pin button[type="submit"]');
  await page.waitForSelector("text=PIN incorrecto.", { timeout: 5000 }).catch(() => {});
  const errorPinVisible = await page.isVisible("text=PIN incorrecto.");
  log(errorPinVisible, "Un PIN incorrecto es rechazado");

  await page.fill("#pin-entrada", "1234");
  await page.click('#form-pin button[type="submit"]');
  await page.waitForSelector("text=Perfiles de Alumno", { timeout: 5000 }).catch(() => {});
  const panelVisible = await page.isVisible("text=Perfiles de Alumno");
  log(panelVisible, "El PIN correcto da acceso al Panel de la Familia");

  await browser.close();
  console.log("\nPruebas de la Fase 0 completadas.");
})();
