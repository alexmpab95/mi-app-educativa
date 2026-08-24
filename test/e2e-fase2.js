// Prueba manual de la Fase 2 ("Crear") con Playwright, con el motor de
// prueba (sin WebGPU real, igual que en el resto de este entorno de
// desarrollo sin acceso a internet general).
const { chromium } = require("playwright");

const BASE = "http://localhost:8791/index.html";

function log(ok, msg) {
  console.log((ok ? "OK   " : "FALLO") + " - " + msg);
  if (!ok) process.exitCode = 1;
}

async function crearPerfil(page, { nombre, etapa, curso }) {
  await page.click('.rejilla-perfiles [data-accion="nuevo-perfil"]');
  await page.waitForSelector("#nombre-perfil");
  await page.fill("#nombre-perfil", nombre);
  await page.selectOption("#etapa-perfil", etapa);
  await page.waitForTimeout(150);
  await page.selectOption("#curso-perfil", curso);
  await page.waitForTimeout(150);
  await page.click('#form-perfil button[type="submit"]');
  await page.waitForSelector(".rejilla-perfiles");
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
  await page.fill("#nombre-familia", "Familia Fase2");
  await page.click('#form-familia button[type="submit"]');

  await page.waitForSelector('[data-accion="nuevo-perfil"]');
  await crearPerfil(page, { nombre: "Nora", etapa: "primaria", curso: "primaria-6" }); // tiene currículo verificado
  await crearPerfil(page, { nombre: "Tino", etapa: "primaria", curso: "primaria-3" }); // no tiene currículo verificado

  // --- Entrar como Nora: currículo verificado disponible ---
  await page.click("text=Nora");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="crear"]');
  await page.waitForSelector('[data-accion="crear-nuevo"]');
  log(true, "Pestaña Crear visible, con lista vacía inicialmente");

  await page.click('[data-accion="crear-nuevo"]');
  await page.waitForSelector("#materia-crear");
  await page.click('[data-tipo="flashcards"]');
  await page.selectOption("#materia-crear", "mat-primaria");
  await page.waitForSelector("text=Hay currículo oficial verificado", { timeout: 3000 });
  log(true, "Se detecta currículo verificado para Nora (Matemáticas, 6º)");

  await page.click('#form-crear button[type="submit"]');
  await page.waitForSelector("text=Generando", { timeout: 5000 });
  await page.waitForSelector('[data-tarjeta="0"]', { timeout: 15000 });
  log(true, "Se generan flashcards de ejemplo con el motor de prueba");

  const tarjetaVerificadaVisible = (await page.textContent("#app")).includes("Currículo oficial verificado (base de este recurso)");
  log(tarjetaVerificadaVisible, "Se muestra la tarjeta de currículo verificado como base del recurso (📄, no generada por el modelo)");

  const numTarjetasIniciales = await page.locator("[data-tarjeta]").count();
  log(numTarjetasIniciales === 3, "Se generan las 3 flashcards de ejemplo del motor de prueba");

  // Editar la primera, añadir una nueva, eliminar la última
  await page.fill("#campo1-0", "Pregunta editada a mano");
  await page.click('[data-accion="anadir-tarjeta"]');
  await page.waitForTimeout(100);
  const numTrasAnadir = await page.locator("[data-tarjeta]").count();
  log(numTrasAnadir === 4, "Se puede añadir una flashcard nueva antes de guardar");

  await page.locator('[data-accion="eliminar-tarjeta"]').last().click();
  await page.waitForTimeout(100);
  const numTrasEliminar = await page.locator("[data-tarjeta]").count();
  log(numTrasEliminar === 3, "Se puede eliminar una flashcard antes de guardar");

  await page.click('[data-accion="guardar-recurso"]');
  await page.waitForSelector('[data-accion="crear-nuevo"]');
  const listaTrasGuardar = await page.textContent("#app");
  log(listaTrasGuardar.includes("Flashcards") && listaTrasGuardar.includes("basado en currículo verificado"), "El recurso guardado aparece en la lista, marcado como basado en currículo verificado");
  log(listaTrasGuardar.includes("v1") && !listaTrasGuardar.includes("(editado)"), "La primera versión guardada es v1, sin marca de editado");

  // Reabrir, editar y volver a guardar: debe subir a v2
  await page.click('[data-accion="ver-recurso"]');
  await page.waitForSelector("#campo1-0");
  const valorEditado = await page.inputValue("#campo1-0");
  log(valorEditado === "Pregunta editada a mano", "El recurso guardado conserva la edición manual hecha antes de guardar");

  await page.fill("#campo1-0", "Segunda edición");
  await page.click('[data-accion="guardar-recurso"]');
  await page.waitForSelector('[data-accion="crear-nuevo"]');
  const listaTrasSegundaEdicion = await page.textContent("#app");
  log(listaTrasSegundaEdicion.includes("v2 (editado)"), "Editar y volver a guardar sube la versión a v2 y la marca como editada (apartado 37)");

  // --- Origen importado, tipo resumen: no debe mostrar tarjeta de currículo ---
  await page.click('[data-accion="crear-nuevo"]');
  await page.waitForSelector("#materia-crear");
  await page.click('[data-tipo="resumen"]');
  await page.selectOption("#materia-crear", "mat-primaria");
  await page.click('[data-origen="importado"]');
  await page.fill("#texto-importado", "Texto de prueba pegado por el usuario, sobre las fracciones.");
  await page.click('#form-crear button[type="submit"]');
  await page.waitForSelector("text=Generando");
  await page.waitForSelector("#editor-resumen", { timeout: 15000 });
  const sinTarjetaVerificada = !(await page.textContent("#app")).includes("Currículo oficial verificado (base de este recurso)");
  log(sinTarjetaVerificada, "Un recurso a partir de material importado no muestra ninguna tarjeta de currículo verificado");

  await page.click('[data-accion="guardar-recurso"]');
  await page.waitForSelector('[data-accion="crear-nuevo"]');
  const listaConImportado = await page.textContent("#app");
  log(listaConImportado.includes("a partir de material importado"), "El recurso importado queda etiquetado como tal en la lista, no como currículo verificado");

  // --- Cambiar de perfil: aislamiento, la lista de Tino debe estar vacía ---
  await page.click('[data-accion="cambiar-perfil"]');
  await page.waitForSelector(".rejilla-perfiles");
  await page.click("text=Tino");
  await page.waitForSelector(".tabs-nav");
  await page.click('.tab-btn[data-tab="crear"]');
  await page.waitForSelector('[data-accion="crear-nuevo"]');
  const listaTino = await page.textContent("#app");
  log(listaTino.includes("Todavía no has creado ningún recurso"), "Los recursos de Nora no aparecen en la lista de Tino (aislamiento entre hermanos)");

  // --- Tino no tiene currículo verificado para su curso: debe decirlo explícitamente ---
  await page.click('[data-accion="crear-nuevo"]');
  await page.waitForSelector("#materia-crear");
  await page.click('[data-tipo="esquema"]');
  await page.selectOption("#materia-crear", "mat-primaria");
  await page.waitForSelector("text=Todavía no hay currículo verificado cargado", { timeout: 3000 });
  log(true, "Para Tino (3º de Primaria) se avisa explícitamente de que no hay currículo verificado para Matemáticas, en vez de inventarlo");

  await page.click('#form-crear button[type="submit"]');
  await page.waitForSelector("text=Generando");
  await page.waitForSelector("#editor-esquema, #editor-esquema-libre", { timeout: 15000 });
  const sinTarjetaVerificadaTino = !(await page.textContent("#app")).includes("Currículo oficial verificado (base de este recurso)");
  log(sinTarjetaVerificadaTino, "Sin currículo verificado disponible, el recurso generado tampoco muestra una tarjeta de verificación inventada");

  log(erroresConsola.length === 0, "Sin errores de consola/página durante todo el flujo" + (erroresConsola.length ? ": " + erroresConsola.join(" | ") : ""));

  await browser.close();
  console.log("\nPruebas de la Fase 2 completadas.");
})();
