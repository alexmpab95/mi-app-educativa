// Prueba de la Fase 4 (Cuaderno, Escanea y aprende, pizarra ligera) con
// Playwright. Cubre: elegir/previsualizar una foto, reconocerla con el
// motor de OCR (cae automáticamente al motor de prueba, porque este
// entorno de desarrollo no tiene acceso al CDN de Tesseract.js — igual que
// con WebLLM en fases anteriores), revisar y corregir el texto, generar un
// recurso o guardarlo en el Cuaderno, y el descarte de la foto salvo
// guardado explícito (apartado 15.3).
const path = require("path");
const { chromium } = require("playwright");

const BASE = "http://localhost:8791/index.html";
const IMAGEN = path.join(__dirname, "fixtures", "test_image.png");

function log(ok, msg) {
  console.log((ok ? "OK   " : "FALLO") + " - " + msg);
  if (!ok) process.exitCode = 1;
}

async function pruebaEscanearYCuaderno() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erroresConsola = [];
  page.on("pageerror", (err) => erroresConsola.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      // Esperado y honestamente documentado (ver ocr.js y LEEME.md): este entorno de
      // desarrollo no tiene acceso al CDN de Tesseract.js, así que el intento del motor
      // real de OCR falla a nivel de red (lo registra el propio navegador, no nuestro
      // código) antes de caer automáticamente al motor de prueba. No es un error de la
      // aplicación: es la misma situación, ya documentada, que con el CDN de WebLLM.
      if (msg.text().includes("ERR_TUNNEL_CONNECTION_FAILED") || msg.text().includes("tesseract")) return;
      erroresConsola.push(msg.text());
      console.log("CONSOLE ERROR:", msg.text());
    }
  });

  await page.goto(BASE);
  await page.waitForSelector("#nombre-familia");
  await page.fill("#nombre-familia", "Familia Escanear");
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

  await page.click('.tab-btn[data-tab="escanear"]');
  await page.waitForSelector("#input-foto");
  log(await page.isDisabled('[data-accion="reconocer-foto"]'), "El botón 'Reconocer texto' empieza deshabilitado sin ninguna foto elegida");

  await page.setInputFiles("#input-foto", IMAGEN);
  await page.waitForSelector("#previsualizacion-foto img");
  log(!(await page.isDisabled('[data-accion="reconocer-foto"]')), "Tras elegir una foto, el botón se habilita y se ve la previsualización");

  await page.click('[data-accion="reconocer-foto"]');
  await page.waitForSelector("#texto-escaneado", { timeout: 15000 });
  const revision = await page.textContent("#app");
  log(revision.includes("Motor de prueba"), "Sin internet en este entorno, cae automáticamente al motor de prueba de OCR, etiquetado con claridad");
  log(revision.includes("revisa y corrige"), "Se advierte explícitamente que hay que revisar el texto reconocido");
  const textoInicial = await page.inputValue("#texto-escaneado");
  log(textoInicial.length > 0, "El textarea llega prerrellenado con el texto de ejemplo del motor de prueba");

  // Editar el texto reconocido antes de usarlo (simula corregir un error de OCR)
  await page.fill("#texto-escaneado", "Texto corregido a mano por el alumno tras revisar el OCR.");
  await page.selectOption("#materia-escaneado", "mat-primaria");

  await page.click('[data-generar-tipo-escaneado="flashcards"]');
  await page.waitForSelector('[data-tarjeta="0"]', { timeout: 15000 });
  log(true, "Se genera un recurso (flashcards) a partir del texto revisado");
  await page.click('[data-accion="guardar-recurso"]');
  await page.waitForSelector('[data-accion="crear-nuevo"]');
  const listaCrear = await page.textContent("#app");
  log(listaCrear.includes("a partir de una foto escaneada"), "El recurso generado desde Escanea y aprende se etiqueta como tal");

  // --- Guardar en el Cuaderno, con la foto incluida ---
  await page.click('.tab-btn[data-tab="escanear"]');
  await page.waitForSelector("#input-foto");
  await page.setInputFiles("#input-foto", IMAGEN);
  await page.waitForSelector("#previsualizacion-foto img");
  await page.click('[data-accion="reconocer-foto"]');
  await page.waitForSelector("#texto-escaneado", { timeout: 15000 });
  await page.selectOption("#materia-escaneado", "mat-primaria");
  await page.check("#guardar-foto-tambien");
  await page.click('[data-accion="guardar-en-cuaderno"]');
  await page.waitForSelector('[data-accion="nueva-pagina"]');
  const cuadernoTrasGuardar = await page.textContent("#app");
  log(cuadernoTrasGuardar.includes("escaneado"), "La página guardada desde Escanea y aprende aparece en el Cuaderno, etiquetada");

  await page.click('[data-accion="abrir-pagina"]');
  await page.waitForSelector("#lienzo-cuaderno");
  const tieneImagenGuardada = (await page.locator('#app img[src^="data:image"]').count()) > 0;
  log(tieneImagenGuardada, "Al marcar 'Guardar también la foto', la foto se guarda y se puede volver a ver en la página");

  // --- Sin marcar el checkbox: la foto NO se guarda ---
  await page.click('[data-accion="cancelar-pagina"]');
  await page.waitForSelector('[data-accion="nueva-pagina"]');
  await page.click('.tab-btn[data-tab="escanear"]');
  await page.waitForSelector("#input-foto");
  await page.setInputFiles("#input-foto", IMAGEN);
  await page.waitForSelector("#previsualizacion-foto img");
  await page.click('[data-accion="reconocer-foto"]');
  await page.waitForSelector("#texto-escaneado", { timeout: 15000 });
  await page.selectOption("#materia-escaneado", "mat-primaria");
  // No se marca el checkbox esta vez
  await page.click('[data-accion="guardar-en-cuaderno"]');
  await page.waitForSelector('[data-accion="nueva-pagina"]');
  const paginas = await page.locator('[data-accion="abrir-pagina"]').count();
  log(paginas === 2, "Se han guardado las 2 páginas del cuaderno hasta ahora");
  // La lista muestra la más reciente primero: la primera es la que acabamos de guardar sin foto.
  await page.locator('[data-accion="abrir-pagina"]').first().click();
  await page.waitForSelector("#lienzo-cuaderno");
  const sinImagen = (await page.locator('#app img[src^="data:image"]').count()) === 0;
  log(sinImagen, "Sin marcar 'Guardar también la foto', la imagen se descarta y no aparece en la página (apartado 15.3)");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
}

async function tienePixeles(page, selector) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel);
    if (!c) return false;
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
    return false;
  }, selector);
}

// Pizarra ligera (componente de lienzo reutilizado, restringido a una pregunta abierta de un
// control): dibujar, sobrevivir a un re-renderizado (pedir una pista), borrar, y que tanto el
// resultado del alumno como la revisión de la Familia muestren el trabajo manuscrito guardado,
// sin ningún reconocimiento automático de procedimiento (alcance reducido a propósito).
async function pruebaPizarra() {
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
  await page.fill("#nombre-familia", "Familia Pizarra");
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

  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('[data-accion="controles"]');
  await page.waitForSelector("#titulo-controles");
  await page.click('[data-accion="nuevo-control"]');
  await page.waitForSelector("#titulo-control");
  await page.fill("#titulo-control", "Control con pizarra");
  await page.selectOption("#materia-control", "mat-primaria");
  await page.selectOption("#nivel-ayuda-control", "1");
  await page.selectOption("#tipo-pregunta-0", "abierta");
  await page.waitForTimeout(50);
  await page.fill("#enunciado-pregunta-0", "Resuelve 345 - 178 mostrando el procedimiento.");
  await page.click('#form-control button[type="submit"]');
  await page.waitForSelector("#titulo-controles");

  await page.click('[data-accion="volver-panel"]');
  await page.click('[data-accion="volver"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Nora");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="practicar"]');
  await page.waitForSelector('[data-accion="empezar-control"]');
  await page.click('[data-accion="empezar-control"]');
  await page.waitForSelector("#form-practicar-control");

  log(await page.isVisible("#pizarra-0"), "La pizarra ligera aparece bajo la pregunta abierta");

  await page.fill("#respuesta-0", "El resultado es 167.");

  await page.locator("#pizarra-0").scrollIntoViewIfNeeded();
  const box = await page.locator("#pizarra-0").boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 100, { steps: 8 });
  await page.mouse.up();
  log(await tienePixeles(page, "#pizarra-0"), "Se puede dibujar en la pizarra con eventos de puntero");

  await page.click('[data-respuesta="0"] [data-accion="pedir-pista-control"]');
  await page.waitForSelector('[data-pista="0"]', { timeout: 10000 });
  log(await tienePixeles(page, "#pizarra-0"), "El dibujo de la pizarra sobrevive a pedir una pista (no se pierde al re-renderizar)");
  log((await page.inputValue("#respuesta-0")) === "El resultado es 167.", "La respuesta de texto también sobrevive a pedir una pista");

  await page.click('[data-respuesta="0"] [data-accion="limpiar-pizarra"]');
  await page.waitForTimeout(100);
  log(!(await tienePixeles(page, "#pizarra-0")), "El botón 'Borrar el dibujo' limpia la pizarra");

  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 100, { steps: 8 });
  await page.mouse.up();
  await page.click('#form-practicar-control button[type="submit"]');
  await page.waitForSelector("text=Volver a Practicar", { timeout: 15000 });

  log(await tienePixeles(page, "canvas[data-pizarra-resultado]"), "El resultado del control muestra el trabajo manuscrito de la pizarra");
  const resultadoTexto = await page.textContent("#app");
  log(resultadoTexto.includes("sin corrección automática"), "Se deja claro que la pizarra no tiene corrección automática de procedimiento");

  await page.click('[data-accion="volver-practicar"]');
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click('[data-accion="panel-familia"]');
  await page.waitForSelector("#titulo-panel");
  await page.click('[data-accion="revisar-intento"]');
  await page.waitForSelector("#titulo-revision");
  log(await tienePixeles(page, "canvas[data-pizarra-revision]"), "La Familia ve el trabajo manuscrito de la pizarra al revisar la calificación");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo (pizarra)" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
}

(async () => {
  await pruebaEscanearYCuaderno();
  await pruebaPizarra();
  console.log("\nPruebas de la Fase 4 completadas.");
})();
