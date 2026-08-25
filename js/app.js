// app.js — Fase 0: fundamentos.
// Pantallas: cuenta familiar -> selector/creación de perfil -> navegación
// principal vacía (estructura de pestañas sin contenido, tal como describe
// el apartado 17 del documento de arquitectura para esta fase).

import * as db from "./db.js";
import * as cripto from "./crypto.js";
import * as curriculo from "./curriculum.js";
import * as orquestador from "./ia-orquestador.js";
import { obtenerMotorCompartido } from "./motor-compartido.js";
import * as generador from "./generador.js";
import * as correccion from "./correccion.js";
import { crearLienzo, COLORES_LIENZO, GROSORES_LIENZO } from "./lienzo.js";
import * as ocr from "./ocr.js";
import * as modeloEducativo from "./modelo-educativo.js";
import * as gamificacion from "./gamificacion.js";

const appEl = document.getElementById("app");

const estado = {
  familia: null,
  perfiles: [],
  perfilActivo: null,
  vista: "cargando",
  pestanaActiva: "inicio",
  profesor: null, // estado de la pantalla "Mi profesor" (Fase 1), se reinicia al cambiar de perfil
  crear: null, // estado de la pantalla "Crear" (Fase 2), se reinicia al cambiar de perfil
  practicar: null, // estado de la pantalla "Practicar" (Fase 3), se reinicia al cambiar de perfil
  cuaderno: null, // estado de la pantalla "Cuaderno" (Fase 4), se reinicia al cambiar de perfil
  escanear: null, // estado de la pantalla "Escanea y aprende" (Fase 4), se reinicia al cambiar de perfil
  ajustesAccesibilidad: null, // ajustes de accesibilidad del perfil activo (Fase 5), null = sin cargar/perfil de familia
  estudiarHoy: null, // cola de flashcards de "📅 Hoy tengo que estudiar" (Fase 5), se reinicia al cambiar de perfil
};

// ---------- Accesibilidad (Fase 5, apartado 9.1) ----------
//
// Alcance deliberadamente reducido: de la lista completa del apartado 9.1
// (tipografía, tamaño, espaciado, contraste, fondo, regla de lectura,
// resaltado, lectura por palabras/frases, simplificar lenguaje, fragmentar
// instrucciones, ejemplos, imágenes, pictogramas, reformular, repetir,
// mostrar pasos, reducir estímulos, fragmentar actividades, temporizadores,
// pausas, indicadores de progreso, menos ejercicios por pantalla, voz a
// texto, dictado, predicción, corrección, Apple Pencil, reconocimiento de
// escritura), esta primera entrega implementa un subconjunto que se aplica
// DE VERDAD en toda la app (nunca decorativo): un ajuste real por dimensión
// en vez de una pantalla de opciones que no hacen nada. Ampliar el catálogo
// es trabajo natural de una siguiente iteración, documentado en LEEME.md.

const DEFAULT_AJUSTES_ACCESIBILIDAD = {
  tamanoLetra: "normal", // "normal" | "grande" | "muy_grande" (lectura)
  tema: "normal", // "normal" | "alto_contraste" | "oscuro" (lectura)
  espaciado: "normal", // "normal" | "amplio" (lectura)
  lenguajeSimplificado: false, // comprensión: cambia de verdad el prompt de la IA (Mi profesor, pistas, corrección)
  instruccionesFragmentadas: false, // comprensión: ídem, pide pasos numerados en vez de un párrafo seguido
  menosEstimulos: false, // atención: desactiva animaciones/transiciones en toda la app
  vozPorDefecto: false, // escritura: destaca el dictado por voz ya existente (Fase 1) como opción preferente
};

/** Aplica los ajustes de accesibilidad AL INSTANTE (atributos en <html>, que
 * css/styles.css usa para cambiar tamaño de letra/tema/espaciado/animaciones
 * en toda la app) y los deja disponibles en estado.ajustesAccesibilidad para
 * que cualquier prompt de IA los tenga en cuenta (ver ia-orquestador.js y
 * correccion.js). Se llama siempre con el objeto completo (o null), nunca
 * de forma parcial, para que nunca queden atributos "colgados" del perfil
 * anterior al cambiar de alumno. */
function aplicarAjustesAccesibilidad(ajustesGuardados) {
  const a = { ...DEFAULT_AJUSTES_ACCESIBILIDAD, ...(ajustesGuardados || {}) };
  const raiz = document.documentElement;
  raiz.dataset.tamanoLetra = a.tamanoLetra;
  raiz.dataset.tema = a.tema;
  raiz.dataset.espaciado = a.espaciado;
  raiz.dataset.menosEstimulos = String(a.menosEstimulos);
  raiz.dataset.vozPorDefecto = String(a.vozPorDefecto);
  estado.ajustesAccesibilidad = a;
}

const COLORES_AVATAR = ["#2f6690", "#c9184a", "#2a9d8f", "#e07a1e", "#7b5ea7", "#3a7d44"];
function colorAvatar(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_AVATAR[h % COLORES_AVATAR.length];
}
function iniciales(nombre) {
  return (nombre || "?").trim().slice(0, 2).toUpperCase();
}

function render(html) {
  appEl.innerHTML = html;
}

function on(selector, evento, manejador) {
  const el = appEl.querySelector(selector);
  if (el) el.addEventListener(evento, manejador);
}

function onAll(selector, evento, manejador) {
  appEl.querySelectorAll(selector).forEach((el) => el.addEventListener(evento, manejador));
}

// ---------- Arranque ----------

async function pedirAlmacenamientoPersistente() {
  // Reduce el riesgo de que el navegador borre los datos por presión de
  // espacio (adenda v1.4, apartado 13.2). No es una garantía absoluta:
  // por eso existe también la exportación manual de copia de seguridad.
  if (navigator.storage && navigator.storage.persist) {
    try {
      await navigator.storage.persist();
    } catch (err) {
      console.warn("No se ha podido solicitar almacenamiento persistente:", err);
    }
  }
}

async function iniciar() {
  await pedirAlmacenamientoPersistente();
  estado.familia = await db.getFamilia();
  if (!estado.familia) {
    estado.vista = "onboarding";
    return pintarOnboarding();
  }
  estado.perfiles = await db.listarPerfiles();
  estado.vista = "selector-perfil";
  pintarSelectorPerfil();
}

// ---------- Onboarding: crear cuenta familiar ----------

function pintarOnboarding() {
  render(`
    <main class="pantalla" aria-labelledby="titulo-onboarding">
      <h1 id="titulo-onboarding">Bienvenida</h1>
      <p class="subtitulo">Antes de nada, vamos a crear la cuenta de la familia. Es solo para este dispositivo: no hace falta internet ni ningún dato personal más que un nombre.</p>
      <form id="form-familia" class="tarjeta">
        <div class="campo">
          <label for="nombre-familia">Nombre de la familia (como quieras que se llame)</label>
          <input type="text" id="nombre-familia" name="nombreFamilia" required autocomplete="off" placeholder="Ej: Familia García" />
        </div>
        <div class="campo">
          <label for="pin-familia">PIN de la Familia (opcional, 4 a 8 dígitos)</label>
          <input type="password" id="pin-familia" name="pin" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="off" placeholder="Déjalo en blanco si no lo quieres todavía" />
          <p class="ayuda-campo">Este PIN solo protege el panel de configuración de la Familia (crear controles, cambiar ajustes). Los niños y niñas no lo necesitan para usar su propio perfil.</p>
        </div>
        <div id="error-familia" class="error" role="alert" aria-live="polite"></div>
        <div class="fila-botones">
          <button type="submit" class="btn-primario">Crear cuenta familiar</button>
        </div>
      </form>
    </main>
  `);

  on("#form-familia", "submit", async (ev) => {
    ev.preventDefault();
    const nombre = appEl.querySelector("#nombre-familia").value.trim();
    const pin = appEl.querySelector("#pin-familia").value.trim();
    const errorEl = appEl.querySelector("#error-familia");
    errorEl.textContent = "";

    if (!nombre) {
      errorEl.textContent = "Escribe un nombre para la familia.";
      return;
    }
    if (pin && !/^[0-9]{4,8}$/.test(pin)) {
      errorEl.textContent = "El PIN debe tener entre 4 y 8 dígitos, o déjalo en blanco.";
      return;
    }

    const pinHash = pin ? await cripto.hashPin(pin) : null;
    estado.familia = await db.crearFamilia({ nombre, pinHash });
    estado.perfiles = [];
    estado.vista = "selector-perfil";
    pintarSelectorPerfil();
  });
}

// ---------- Selector / creación de perfil de Alumno ----------

function pintarSelectorPerfil() {
  const tarjetas = estado.perfiles
    .map(
      (p) => `
      <button class="perfil-boton" data-id="${p.id}" data-accion="entrar">
        <span class="avatar" style="background:${colorAvatar(p.id)}">${iniciales(p.nombre)}</span>
        <span>${escapeHtml(p.nombre)}</span>
        <span class="ayuda-campo">${escapeHtml(p.cursoNombre || "")}</span>
      </button>`
    )
    .join("");

  render(`
    <main class="pantalla" aria-labelledby="titulo-selector">
      <div class="cabecera-app">
        <div>
          <h1 id="titulo-selector">¿Quién eres?</h1>
          <p class="subtitulo">${escapeHtml(estado.familia.nombre)}</p>
        </div>
        <button class="btn-texto" data-accion="panel-familia">Panel de la Familia</button>
      </div>
      <div class="rejilla-perfiles">
        ${tarjetas}
        <button class="perfil-boton anadir" data-accion="nuevo-perfil">
          <span class="avatar" style="background:#8a96a3">+</span>
          <span>Añadir perfil</span>
        </button>
      </div>
      ${
        estado.perfiles.length === 0
          ? `<p class="aviso">Todavía no hay ningún perfil de Alumno. Pulsa "Añadir perfil" para dar de alta al primer hijo o hija.</p>`
          : ""
      }
    </main>
  `);

  onAll('[data-accion="entrar"]', "click", (ev) => {
    const id = ev.currentTarget.getAttribute("data-id");
    entrarEnPerfil(id);
  });
  on('[data-accion="nuevo-perfil"]', "click", () => pintarFormularioPerfil());
  on('[data-accion="panel-familia"]', "click", () => abrirPanelFamilia());
}

async function entrarEnPerfil(id) {
  const perfil = await db.obtenerPerfil(id);
  estado.perfilActivo = perfil;
  estado.pestanaActiva = "inicio";
  estado.vista = "app-principal";
  estado.profesor = null; // aislamiento entre hermanos: nunca arrastrar la conversación de otro perfil
  estado.crear = null;
  estado.practicar = null;
  estado.cuaderno = null;
  estado.escanear = null;
  estado.estudiarHoy = null;
  const configAccesibilidad = await db.obtenerConfigAccesibilidad(id);
  aplicarAjustesAccesibilidad(configAccesibilidad?.ajustes);
  pintarAppPrincipal();
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function pintarFormularioPerfil(perfilExistente) {
  const etapas = await curriculo.listarEtapas();
  const opcionesEtapa = etapas.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join("");

  render(`
    <main class="pantalla" aria-labelledby="titulo-form-perfil">
      <h1 id="titulo-form-perfil">${perfilExistente ? "Editar perfil" : "Nuevo perfil de Alumno"}</h1>
      <form id="form-perfil" class="tarjeta">
        <div class="campo">
          <label for="nombre-perfil">Nombre</label>
          <input type="text" id="nombre-perfil" required autocomplete="off" value="${perfilExistente ? escapeHtml(perfilExistente.nombre) : ""}" />
        </div>
        <div class="campo">
          <label for="etapa-perfil">Etapa</label>
          <select id="etapa-perfil" required>
            <option value="" disabled ${perfilExistente ? "" : "selected"}>Elige una etapa</option>
            ${opcionesEtapa}
          </select>
        </div>
        <div class="campo">
          <label for="curso-perfil">Curso</label>
          <select id="curso-perfil" required disabled>
            <option value="">Elige antes la etapa</option>
          </select>
        </div>
        <div class="campo" id="campo-materias" hidden>
          <label>Materias</label>
          <div id="materias-perfil"></div>
          <p class="ayuda-campo">Puedes cambiar esto más adelante desde el Panel de la Familia.</p>
        </div>
        <div id="error-perfil" class="error" role="alert" aria-live="polite"></div>
        <div class="fila-botones">
          <button type="submit" class="btn-primario">Guardar</button>
          <button type="button" class="btn-secundario" data-accion="cancelar">Cancelar</button>
        </div>
      </form>
    </main>
  `);

  const etapaSelect = appEl.querySelector("#etapa-perfil");
  const cursoSelect = appEl.querySelector("#curso-perfil");
  const campoMaterias = appEl.querySelector("#campo-materias");
  const materiasDiv = appEl.querySelector("#materias-perfil");

  async function refrescarCursos(etapaId) {
    const cursos = await curriculo.listarCursos(etapaId);
    cursoSelect.disabled = false;
    cursoSelect.innerHTML =
      `<option value="" disabled selected>Elige un curso</option>` +
      cursos.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("");
  }

  async function refrescarMaterias(etapaId) {
    const materias = await curriculo.listarMaterias(etapaId);
    campoMaterias.hidden = false;
    materiasDiv.innerHTML = materias
      .map(
        (m, i) => `
        <label style="font-weight:400; display:flex; gap:0.5rem; align-items:center; margin-bottom:0.3rem;">
          <input type="checkbox" name="materia" value="${m.id}" ${
          !perfilExistente || (perfilExistente.materias || []).includes(m.id) ? "checked" : ""
        } />
          ${escapeHtml(m.nombre)}
        </label>`
      )
      .join("");
  }

  etapaSelect.addEventListener("change", async () => {
    await refrescarCursos(etapaSelect.value);
    await refrescarMaterias(etapaSelect.value);
  });

  if (perfilExistente) {
    etapaSelect.value = perfilExistente.etapa;
    await refrescarCursos(perfilExistente.etapa);
    cursoSelect.value = perfilExistente.curso;
    await refrescarMaterias(perfilExistente.etapa);
  }

  on("#form-perfil", "submit", async (ev) => {
    ev.preventDefault();
    const errorEl = appEl.querySelector("#error-perfil");
    errorEl.textContent = "";

    const nombre = appEl.querySelector("#nombre-perfil").value.trim();
    const etapa = etapaSelect.value;
    const curso = cursoSelect.value;
    const materias = Array.from(appEl.querySelectorAll('input[name="materia"]:checked')).map((el) => el.value);
    const cursoNombreOpt = cursoSelect.selectedOptions[0];

    if (!nombre || !etapa || !curso) {
      errorEl.textContent = "Rellena el nombre, la etapa y el curso.";
      return;
    }

    const datos = {
      nombre,
      etapa,
      curso,
      cursoNombre: cursoNombreOpt ? cursoNombreOpt.textContent : "",
      materias,
      comunidadAutonoma: "Comunitat Valenciana",
    };

    if (perfilExistente) {
      await db.actualizarPerfil(perfilExistente.id, datos);
    } else {
      await db.crearPerfil(datos);
    }
    estado.perfiles = await db.listarPerfiles();
    pintarSelectorPerfil();
  });

  on('[data-accion="cancelar"]', "click", () => pintarSelectorPerfil());
}

// ---------- Navegación principal (vacía en Fase 0) ----------

const PESTANAS = [
  { id: "inicio", icono: "🏠", etiqueta: "Inicio" },
  { id: "profesor", icono: "💬", etiqueta: "Mi profesor" },
  { id: "crear", icono: "🧠", etiqueta: "Crear" },
  { id: "escanear", icono: "📷", etiqueta: "Escanea y aprende" },
  { id: "practicar", icono: "✏️", etiqueta: "Practicar" },
  { id: "cuaderno", icono: "📓", etiqueta: "Cuaderno" },
  { id: "progreso", icono: "📈", etiqueta: "Progreso" },
  { id: "logros", icono: "🏆", etiqueta: "Logros" },
];
// Nota: el mapa de navegación completo del documento (apartado 11) tiene más
// pestañas (Aprender, Controles, Escanea y aprende, Biblioteca) y prevé
// reducir el número de accesos simultáneos en los primeros cursos de
// Primaria (apartado 12.2). Aquí se añaden solo las pestañas que ya tienen
// contenido real, fase a fase; la adaptación por edad queda para cuando
// exista personalización (Fase 5).

function cabeceraYNavHtml(contenidoHtml) {
  const p = estado.perfilActivo;
  const tabsHtml = PESTANAS.map(
    (t) => `
    <button class="tab-btn" data-tab="${t.id}" ${estado.pestanaActiva === t.id ? 'aria-current="page"' : ""}>
      <span class="icono" aria-hidden="true">${t.icono}</span>
      <span>${t.etiqueta}</span>
    </button>`
  ).join("");

  return `
    <main class="pantalla" aria-labelledby="titulo-principal">
      <div class="cabecera-app">
        <div>
          <span class="avatar" style="background:${colorAvatar(p.id)}; width:2.2rem; height:2.2rem; font-size:0.95rem; display:inline-flex; vertical-align:middle; margin-right:0.5rem;">${iniciales(p.nombre)}</span>
          <strong id="titulo-principal">${escapeHtml(p.nombre)}</strong>
          <div class="ayuda-campo">${escapeHtml(p.cursoNombre || "")} · ${escapeHtml(p.comunidadAutonoma || "")}</div>
        </div>
        <div class="fila-botones">
          <button class="btn-texto" data-accion="ir-accesibilidad" aria-label="Configuración de accesibilidad" title="Accesibilidad">⚙️</button>
          <button class="btn-texto" data-accion="cambiar-perfil">Cambiar</button>
        </div>
      </div>

      ${contenidoHtml}

      <nav class="tabs-nav" aria-label="Navegación principal">
        ${tabsHtml}
      </nav>
    </main>
  `;
}

function wireCabeceraYNav() {
  onAll(".tab-btn", "click", (ev) => {
    estado.pestanaActiva = ev.currentTarget.getAttribute("data-tab");
    irAPestanaActiva();
  });
  on('[data-accion="cambiar-perfil"]', "click", () => {
    estado.perfilActivo = null;
    estado.profesor = null;
    estado.crear = null;
    estado.practicar = null;
    estado.cuaderno = null;
    estado.escanear = null;
    estado.estudiarHoy = null;
    aplicarAjustesAccesibilidad(null); // no arrastrar los ajustes del hermano anterior al selector de perfiles
    pintarSelectorPerfil();
  });
  on('[data-accion="ir-accesibilidad"]', "click", () => pintarAccesibilidad());
}

function irAPestanaActiva() {
  if (estado.pestanaActiva === "profesor") {
    pintarPestanaProfesor();
  } else if (estado.pestanaActiva === "crear") {
    pintarPestanaCrear();
  } else if (estado.pestanaActiva === "escanear") {
    pintarPestanaEscanear();
  } else if (estado.pestanaActiva === "practicar") {
    pintarPestanaPracticar();
  } else if (estado.pestanaActiva === "cuaderno") {
    pintarPestanaCuaderno();
  } else if (estado.pestanaActiva === "progreso") {
    pintarPestanaProgreso();
  } else if (estado.pestanaActiva === "logros") {
    pintarPestanaLogros();
  } else {
    pintarAppPrincipal();
  }
}

function pintarAppPrincipal() {
  const activa = PESTANAS.find((t) => t.id === estado.pestanaActiva);
  render(
    cabeceraYNavHtml(`
      <section class="tarjeta pantalla-vacia" aria-live="polite">
        <h2>${activa.icono} ${activa.etiqueta}</h2>
        <p>Esta sección todavía no tiene contenido: en la Fase 0 solo se construyó la estructura de navegación. Las siguientes fases irán activando cada pestaña (práctica, cuaderno, progreso).</p>
      </section>
    `)
  );
  wireCabeceraYNav();
}

// ---------- Mi profesor (Fase 1, apartado 17) ----------
//
// estado.profesor pasa por tres momentos: null (selector de materia/tema),
// { cargando:true, ... } (cargando el motor de IA) y luego el chat en sí.
// Se reinicia siempre que se cambia de perfil (aislamiento entre hermanos).

async function pintarPestanaProfesor() {
  if (!estado.profesor) return pintarSelectorTemaProfesor();
  if (estado.profesor.cargando) return pintarCargaProfesor();
  return pintarChatProfesor();
}

async function pintarSelectorTemaProfesor() {
  const perfil = estado.perfilActivo;
  const todasMaterias = await curriculo.listarMaterias(perfil.etapa);
  const materiasPerfil = todasMaterias.filter((m) => (perfil.materias || []).includes(m.id));
  const opciones = materiasPerfil.map((m) => `<option value="${m.id}">${escapeHtml(m.nombre)}</option>`).join("");

  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>💬 Mi profesor</h2>
        ${
          materiasPerfil.length === 0
            ? `<p class="aviso">Tu perfil todavía no tiene materias asignadas. Pídele a la Familia que las añada desde el Panel de la Familia.</p>`
            : `
        <form id="form-tema-profesor">
          <div class="campo">
            <label for="materia-profesor">Materia</label>
            <select id="materia-profesor" required>
              <option value="" disabled selected>Elige una materia</option>
              ${opciones}
            </select>
          </div>
          <div class="campo">
            <label for="tema-profesor">¿Sobre qué quieres hablar hoy?</label>
            <input type="text" id="tema-profesor" placeholder="Ej: las divisiones con dos cifras" autocomplete="off" />
          </div>
          <div id="aviso-verificado"></div>
          <div class="campo">
            <label id="etiqueta-modo">Modo</label>
            <div class="fila-botones" role="group" aria-labelledby="etiqueta-modo">
              <button type="button" class="btn-secundario" data-modo="aprendizaje" aria-pressed="true">📖 Aprendizaje</button>
              <button type="button" class="btn-secundario" data-modo="practica" aria-pressed="false">✏️ Práctica</button>
            </div>
            <p class="ayuda-campo">En modo Práctica el profesor nunca da la solución directamente: va dando pistas poco a poco. En modo Aprendizaje explica con más libertad.</p>
          </div>
          <div class="fila-botones">
            <button type="submit" class="btn-primario">Empezar</button>
          </div>
        </form>`
        }
      </section>
    `)
  );
  wireCabeceraYNav();
  if (materiasPerfil.length === 0) return;

  let modoElegido = "aprendizaje";
  const botonesModo = appEl.querySelectorAll("[data-modo]");
  botonesModo.forEach((btn) =>
    btn.addEventListener("click", () => {
      modoElegido = btn.getAttribute("data-modo");
      botonesModo.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    })
  );

  const materiaSelect = appEl.querySelector("#materia-profesor");
  const avisoVerificado = appEl.querySelector("#aviso-verificado");
  materiaSelect.addEventListener("change", async () => {
    const paquetes = await curriculo.paquetesParaCursoMateria(perfil.curso, materiaSelect.value);
    const verificados = paquetes.filter((p) => p.verificado);
    avisoVerificado.innerHTML = verificados.length
      ? `<p class="aviso">📄 Hay currículo oficial verificado disponible para esta materia y curso: se mostrará antes de empezar a hablar con el profesor.</p>`
      : `<p class="ayuda-campo">Todavía no hay currículo verificado cargado para esta materia y curso; el profesor lo indicará explícitamente en vez de inventarlo.</p>`;
  });

  on("#form-tema-profesor", "submit", async (ev) => {
    ev.preventDefault();
    const materiaId = materiaSelect.value;
    const materiaNombre = materiaSelect.selectedOptions[0]?.textContent || "";
    const tema = appEl.querySelector("#tema-profesor").value.trim() || "un tema general de la materia";
    const paquetesVerificados = (await curriculo.paquetesParaCursoMateria(perfil.curso, materiaId)).filter((p) => p.verificado);

    estado.profesor = {
      materiaId,
      materiaNombre,
      tema,
      modo: modoElegido,
      pistasUsadas: 0,
      solucionMostrada: false,
      historial: [],
      motor: null,
      tipoMotor: null,
      cargando: true,
      progreso: 0,
      textoProgreso: "Preparando el profesor IA…",
      paquetesVerificados,
    };
    iniciarConversacion();
  });
}

function pintarCargaProfesor() {
  const pct = Math.round((estado.profesor.progreso || 0) * 100);
  render(
    cabeceraYNavHtml(`
      <section class="tarjeta" aria-live="polite">
        <h2>💬 Preparando el profesor IA</h2>
        <p id="texto-progreso-profesor">${escapeHtml(estado.profesor.textoProgreso)}</p>
        <div style="background:var(--borde); border-radius:999px; overflow:hidden; height:0.8rem;">
          <div id="barra-progreso-profesor" style="background:var(--azul); height:100%; width:${pct}%; transition:width .2s;"></div>
        </div>
        <p class="ayuda-campo">La primera vez puede tardar, porque el modelo se descarga una sola vez y se queda guardado en el dispositivo. Si tu iPad no soporta WebGPU, se usará automáticamente un motor de prueba, claramente indicado como tal.</p>
      </section>
    `)
  );
  wireCabeceraYNav();
}

function actualizarBarraProgresoProfesor() {
  const pct = Math.round((estado.profesor.progreso || 0) * 100);
  const barra = appEl.querySelector("#barra-progreso-profesor");
  const texto = appEl.querySelector("#texto-progreso-profesor");
  if (barra) barra.style.width = pct + "%";
  if (texto) texto.textContent = estado.profesor.textoProgreso;
}

async function iniciarConversacion() {
  pintarCargaProfesor();
  try {
    const { motor, tipo, errorMotorReal } = await obtenerMotorCompartido((info) => {
      if (!estado.profesor) return; // la pantalla pudo cambiar mientras cargaba
      estado.profesor.progreso = info.progreso;
      estado.profesor.textoProgreso = info.texto || "Cargando…";
      actualizarBarraProgresoProfesor();
    });
    estado.profesor.motor = motor;
    estado.profesor.tipoMotor = tipo;
    // Presente solo cuando el navegador anunciaba soporte de WebGPU pero la carga real del
    // modelo ha fallado (sin red, CDN bloqueado, memoria insuficiente...): el motor de prueba
    // sigue funcionando con normalidad, pero conviene decir la verdad en vez de fingir que
    // todo iba bien desde el principio (ver motor-compartido.js).
    estado.profesor.errorMotorReal = errorMotorReal || null;
    estado.profesor.progreso = 1;
  } catch (err) {
    console.error("No se ha podido inicializar el motor de IA:", err);
    estado.profesor.errorMotor = err.message;
  }
  estado.profesor.cargando = false;
  pintarChatProfesor();
}

function etiquetaMotor() {
  if (estado.profesor.errorMotor) return `<span class="pastilla pendiente">⚠️ Motor no disponible</span>`;
  if (estado.profesor.tipoMotor === "webgpu") return `<span class="pastilla verificado">⚡ Motor real (WebGPU)</span>`;
  if (estado.profesor.errorMotorReal) {
    return `<span class="pastilla pendiente" title="${escapeHtml(estado.profesor.errorMotorReal)}">🧪 Motor de prueba (el motor real no se pudo cargar)</span>`;
  }
  return `<span class="pastilla pendiente">🧪 Motor de prueba (sin IA real)</span>`;
}

function pintarChatProfesor() {
  const perfil = estado.perfilActivo;
  const p = estado.profesor;

  const tarjetaVerificada = p.paquetesVerificados.length
    ? p.paquetesVerificados
        .map(
          (pk) => `
      <section class="tarjeta" aria-label="Currículo oficial verificado">
        <span class="pastilla verificado">📄 Currículo oficial verificado</span>
        <p><strong>Competencia específica ${pk.competenciaEspecifica.numero}:</strong> ${escapeHtml(pk.competenciaEspecifica.texto)}</p>
        <ul>
          ${pk.criteriosEvaluacion.map((c) => `<li><strong>${c.codigo}</strong> ${escapeHtml(c.texto)}</li>`).join("")}
        </ul>
        <p class="ayuda-campo">Fuente: ${escapeHtml(pk.fuente.norma)} · vigente desde ${escapeHtml(pk.fuente.fechaVigencia)}</p>
      </section>`
        )
        .join("")
    : "";

  const mensajesHtml = p.historial.map((m, i) => burbujaHtml(m, i)).join("");

  const controlesPractica =
    p.modo === "practica"
      ? `
      <div class="fila-botones" style="margin-bottom:0.6rem;">
        <button type="button" class="btn-secundario" data-accion="pedir-pista">💡 Pedir otra pista${p.pistasUsadas ? ` (${p.pistasUsadas})` : ""}</button>
        <button type="button" class="btn-secundario" data-accion="ver-solucion" ${p.pistasUsadas < 2 || p.solucionMostrada ? "disabled" : ""}>
          ${p.solucionMostrada ? "✅ Solución ya mostrada" : "🔓 Ver solución completa"}
        </button>
      </div>`
      : "";

  render(
    cabeceraYNavHtml(`
      <section class="cabecera-app" style="margin-bottom:0;">
        <div>
          <h2 style="margin-bottom:0.15rem;">💬 ${escapeHtml(p.materiaNombre)}</h2>
          <div class="ayuda-campo">${escapeHtml(p.tema)} · ${p.modo === "practica" ? "Modo práctica" : "Modo aprendizaje"}</div>
        </div>
        ${etiquetaMotor()}
      </section>
      ${
        estado.profesor.errorMotorReal
          ? `<p class="ayuda-campo">El motor real (WebGPU) no se ha podido cargar, así que de momento ves respuestas de ejemplo. Motivo técnico: ${escapeHtml(estado.profesor.errorMotorReal)}</p>`
          : ""
      }

      ${tarjetaVerificada}

      <section class="tarjeta" style="display:flex; flex-direction:column; gap:0.7rem;">
        <div id="lista-mensajes" aria-live="polite" style="display:flex; flex-direction:column; gap:0.6rem; max-height:22rem; overflow-y:auto;">
          ${mensajesHtml || `<p class="ayuda-campo">Escribe tu pregunta abajo para empezar.</p>`}
        </div>

        ${controlesPractica}

        <form id="form-mensaje" class="fila-botones" style="flex-wrap:nowrap; align-items:flex-start;">
          <label class="visually-hidden" for="campo-mensaje">Escribe tu mensaje</label>
          <input type="text" id="campo-mensaje" autocomplete="off" placeholder="Escribe aquí…" style="flex:1;" />
          <button type="button" id="btn-dictado" class="btn-secundario" title="Dictar por voz" aria-label="Dictar por voz">🎤</button>
          <button type="submit" class="btn-primario">Enviar</button>
        </form>
      </section>

      <div class="fila-botones">
        <button class="btn-texto" data-accion="cambiar-tema">Cambiar de materia o tema</button>
      </div>
    `)
  );
  wireCabeceraYNav();

  on('[data-accion="cambiar-tema"]', "click", () => {
    estado.profesor = null;
    pintarPestanaProfesor();
  });
  on('[data-accion="pedir-pista"]', "click", pedirOtraPista);
  on('[data-accion="ver-solucion"]', "click", verSolucionCompleta);
  on("#form-mensaje", "submit", (ev) => {
    ev.preventDefault();
    const campo = appEl.querySelector("#campo-mensaje");
    const texto = campo.value.trim();
    if (!texto) return;
    campo.value = "";
    enviarMensaje(texto);
  });

  configurarDictado();
  desplazarListaMensajesAbajo();
}

function burbujaHtml(mensaje, indice) {
  const esUsuario = mensaje.rol === "usuario";
  const insignia = esUsuario ? "" : `<span class="pastilla pendiente">🧠 Explicación generada</span> `;
  const botonVoz = esUsuario ? "" : `<button type="button" class="btn-texto" data-accion="leer" data-indice="${indice}" aria-label="Leer en voz alta">🔊</button>`;
  return `
    <div class="tarjeta" style="background:${esUsuario ? "#eaf1f7" : "#fff"}; padding:0.7rem 0.9rem;" data-mensaje="${indice}">
      <div class="ayuda-campo" style="margin-bottom:0.2rem;">${esUsuario ? "Tú" : `${insignia}Profesor`}</div>
      <div data-texto>${escapeHtml(mensaje.texto)}</div>
      ${botonVoz}
    </div>`;
}

function desplazarListaMensajesAbajo() {
  const lista = appEl.querySelector("#lista-mensajes");
  if (lista) lista.scrollTop = lista.scrollHeight;
  onAll('[data-accion="leer"]', "click", (ev) => {
    const indice = Number(ev.currentTarget.getAttribute("data-indice"));
    const mensaje = estado.profesor.historial[indice];
    if (mensaje) leerEnVozAlta(mensaje.texto);
  });
}

async function enviarMensaje(texto) {
  const p = estado.profesor;
  const perfil = estado.perfilActivo;
  const historialPrevio = [...p.historial];
  p.historial.push({ rol: "usuario", texto });
  pintarChatProfesor();

  const systemPrompt = orquestador.construirSystemPrompt({
    perfil,
    materiaNombre: p.materiaNombre,
    modo: p.modo,
    nivelAyuda: p.pistasUsadas,
    ajustesAccesibilidad: estado.ajustesAccesibilidad,
  });
  const mensajes = orquestador.construirMensajes({ systemPrompt, historial: historialPrevio, mensajeNuevo: texto });

  p.historial.push({ rol: "asistente", texto: "" });
  const indiceRespuesta = p.historial.length - 1;
  pintarChatProfesor();

  try {
    const textoFinal = await p.motor.responder({
      mensajes,
      onToken: (delta) => {
        p.historial[indiceRespuesta].texto += delta;
        actualizarBurbuja(indiceRespuesta);
      },
    });
    p.historial[indiceRespuesta].texto = textoFinal;
    actualizarBurbuja(indiceRespuesta);
  } catch (err) {
    console.error("Error al generar respuesta:", err);
    p.historial[indiceRespuesta].texto = "No se ha podido generar una respuesta. Comprueba la conexión la primera vez que se carga el modelo, o vuelve a intentarlo.";
    actualizarBurbuja(indiceRespuesta);
  }
}

function actualizarBurbuja(indice) {
  const nodo = appEl.querySelector(`[data-mensaje="${indice}"] [data-texto]`);
  if (nodo) nodo.textContent = estado.profesor.historial[indice].texto;
  desplazarListaMensajesAbajo();
}

async function pedirOtraPista() {
  const p = estado.profesor;
  p.pistasUsadas += 1;
  await enviarMensaje("Quiero otra pista, por favor.");
  await db.registrarInteraccion({
    perfilId: estado.perfilActivo.id,
    materiaId: p.materiaId,
    tema: p.tema,
    modo: p.modo,
    pistasUsadas: p.pistasUsadas,
    solucionMostrada: p.solucionMostrada,
  });
}

async function verSolucionCompleta() {
  const p = estado.profesor;
  if (p.pistasUsadas < 2 || p.solucionMostrada) return;
  p.solucionMostrada = true;
  await enviarMensaje("Quiero ver la solución completa, paso a paso.");
  await db.registrarInteraccion({
    perfilId: estado.perfilActivo.id,
    materiaId: p.materiaId,
    tema: p.tema,
    modo: p.modo,
    pistasUsadas: p.pistasUsadas,
    solucionMostrada: true,
  });
}

// --- Accesibilidad: dictado (Web Speech API, soporte parcial en Safari, adenda v1.4) ---

function configurarDictado() {
  const boton = appEl.querySelector("#btn-dictado");
  if (!boton) return;
  const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Reconocedor) {
    boton.disabled = true;
    boton.title = "Dictado por voz no disponible en este navegador; usa el teclado.";
    return;
  }
  let escuchando = false;
  boton.addEventListener("click", () => {
    if (escuchando) return;
    const reconocimiento = new Reconocedor();
    reconocimiento.lang = "es-ES";
    reconocimiento.interimResults = false;
    escuchando = true;
    boton.textContent = "🔴";
    reconocimiento.onresult = (ev) => {
      const texto = ev.results[0][0].transcript;
      const campo = appEl.querySelector("#campo-mensaje");
      if (campo) campo.value = (campo.value ? campo.value + " " : "") + texto;
    };
    reconocimiento.onerror = () => {
      /* se deja el teclado como alternativa siempre disponible */
    };
    reconocimiento.onend = () => {
      escuchando = false;
      boton.textContent = "🎤";
    };
    reconocimiento.start();
  });
}

function leerEnVozAlta(texto) {
  if (!("speechSynthesis" in window)) {
    alert("La lectura en voz alta no está disponible en este navegador.");
    return;
  }
  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = "es-ES";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// ---------- Crear (Fase 2, apartado 17) ----------
//
// estado.crear pasa por: null -> pintarListaRecursos() (por defecto),
// luego "selector" (tipo + origen), "generando" (motor de IA) y
// "previsualizar" (editar antes de guardar). Se reinicia al cambiar de
// perfil, igual que "Mi profesor".

async function pintarPestanaCrear() {
  if (!estado.crear || estado.crear.vista === "lista") return pintarListaRecursos();
  if (estado.crear.vista === "selector") return pintarSelectorCrear();
  if (estado.crear.vista === "generando") return pintarGenerando();
  if (estado.crear.vista === "previsualizar") return pintarPrevisualizacion();
  return pintarListaRecursos();
}

async function pintarListaRecursos() {
  const perfil = estado.perfilActivo;
  const recursos = await db.listarRecursos(perfil.id);

  const tarjetas = recursos
    .map((r) => {
      const info = TIPOS_RECURSO_POR_ID[r.tipo];
      return `
      <li class="tarjeta" style="display:flex; justify-content:space-between; align-items:center; gap:0.6rem;">
        <div>
          <strong>${info.icono} ${info.nombre}</strong> — ${escapeHtml(r.materiaNombre)}
          <div class="ayuda-campo">
            ${
              r.origen.tipo === "curriculo"
                ? r.fuentesVerificadas.length
                  ? "📄 basado en currículo verificado"
                  : "🧠 sin anclaje curricular verificado"
                : r.origen.tipo === "cuaderno"
                  ? "📓 a partir de una página del Cuaderno"
                  : r.origen.tipo === "escaneado"
                    ? "📷 a partir de una foto escaneada"
                    : "🧠 a partir de material importado"
            }
            · v${r.version}${r.editadoManualmente ? " (editado)" : ""}
          </div>
        </div>
        <span class="fila-botones">
          <button class="btn-secundario" data-accion="ver-recurso" data-id="${r.id}">Ver / Editar</button>
          <button class="btn-secundario" data-accion="eliminar-recurso" data-id="${r.id}">Eliminar</button>
        </span>
      </li>`;
    })
    .join("");

  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>🧠 Crear</h2>
        <p class="subtitulo">Resúmenes, esquemas, flashcards y ejercicios, a partir del currículo o de material que importes.</p>
        <button class="btn-primario" data-accion="crear-nuevo">+ Crear un recurso nuevo</button>
      </section>
      ${
        recursos.length
          ? `<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.6rem;">${tarjetas}</ul>`
          : `<p class="aviso">Todavía no has creado ningún recurso.</p>`
      }
    `)
  );
  wireCabeceraYNav();

  on('[data-accion="crear-nuevo"]', "click", () => {
    estado.crear = { vista: "selector" };
    pintarSelectorCrear();
  });
  onAll('[data-accion="ver-recurso"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    const recurso = recursos.find((r) => r.id === id);
    estado.crear = {
      vista: "previsualizar",
      recursoEditandoId: id,
      tipo: recurso.tipo,
      materiaNombre: recurso.materiaNombre,
      origen: recurso.origen,
      resultado: { ok: true, contenido: recurso.contenido },
      paquetesVerificados: [], // el recurso ya guardado no vuelve a mostrar la tarjeta de verificación de origen
    };
    pintarPrevisualizacion();
  });
  onAll('[data-accion="eliminar-recurso"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    if (confirm("¿Eliminar este recurso? No se puede deshacer.")) {
      await db.eliminarRecurso(id);
      pintarListaRecursos();
    }
  });
}

const TIPOS_RECURSO_POR_ID = Object.fromEntries(generador.TIPOS_RECURSO.map((t) => [t.id, t]));

async function pintarSelectorCrear() {
  const perfil = estado.perfilActivo;
  const todasMaterias = await curriculo.listarMaterias(perfil.etapa);
  const materiasPerfil = todasMaterias.filter((m) => (perfil.materias || []).includes(m.id));
  const opcionesMaterias = materiasPerfil.map((m) => `<option value="${m.id}">${escapeHtml(m.nombre)}</option>`).join("");

  const botonesTipo = generador.TIPOS_RECURSO.map(
    (t) => `<button type="button" class="btn-secundario" data-tipo="${t.id}" aria-pressed="false">${t.icono} ${t.nombre}</button>`
  ).join("");

  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>🧠 Crear un recurso</h2>
        ${
          materiasPerfil.length === 0
            ? `<p class="aviso">Tu perfil todavía no tiene materias asignadas. Pídele a la Familia que las añada.</p>`
            : `
        <form id="form-crear">
          <div class="campo">
            <label id="etiqueta-tipo">Tipo de recurso</label>
            <div class="fila-botones" role="group" aria-labelledby="etiqueta-tipo">${botonesTipo}</div>
          </div>

          <div class="campo">
            <label for="materia-crear">Materia</label>
            <select id="materia-crear" required>
              <option value="" disabled selected>Elige una materia</option>
              ${opcionesMaterias}
            </select>
          </div>

          <div class="campo">
            <label id="etiqueta-origen">Origen</label>
            <div class="fila-botones" role="group" aria-labelledby="etiqueta-origen">
              <button type="button" class="btn-secundario" data-origen="curriculo" aria-pressed="true">📚 Currículo</button>
              <button type="button" class="btn-secundario" data-origen="importado" aria-pressed="false">📄 Material importado</button>
            </div>
          </div>

          <div id="campos-curriculo" class="campo">
            <label for="tema-crear">Tema (opcional)</label>
            <input type="text" id="tema-crear" autocomplete="off" placeholder="Ej: los ríos de la Comunitat Valenciana" />
            <div id="aviso-verificado-crear"></div>
          </div>

          <div id="campos-importado" class="campo" hidden>
            <label for="texto-importado">Pega aquí el texto, o sube un archivo .txt/.md</label>
            <textarea id="texto-importado" rows="6" style="width:100%; font:inherit; padding:0.65rem 0.75rem; border-radius:0.6rem; border:1.5px solid var(--borde);"></textarea>
            <input type="file" id="archivo-importado" accept=".txt,.md,text/plain" style="margin-top:0.5rem;" />
            <p class="ayuda-campo">Este texto se procesa solo en tu dispositivo: nunca se envía a ningún servidor ni se usa para entrenar ningún modelo.</p>
          </div>

          <div id="error-crear" class="error" role="alert" aria-live="polite"></div>
          <div class="fila-botones">
            <button type="submit" class="btn-primario">Generar</button>
            <button type="button" class="btn-secundario" data-accion="cancelar-crear">Cancelar</button>
          </div>
        </form>`
        }
      </section>
    `)
  );
  wireCabeceraYNav();
  if (materiasPerfil.length === 0) return;

  let tipoElegido = null;
  const botonesTipoEls = appEl.querySelectorAll("[data-tipo]");
  botonesTipoEls.forEach((btn) =>
    btn.addEventListener("click", () => {
      tipoElegido = btn.getAttribute("data-tipo");
      botonesTipoEls.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    })
  );

  let origenElegido = "curriculo";
  const camposCurriculo = appEl.querySelector("#campos-curriculo");
  const camposImportado = appEl.querySelector("#campos-importado");
  const botonesOrigen = appEl.querySelectorAll("[data-origen]");
  botonesOrigen.forEach((btn) =>
    btn.addEventListener("click", () => {
      origenElegido = btn.getAttribute("data-origen");
      botonesOrigen.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      camposCurriculo.hidden = origenElegido !== "curriculo";
      camposImportado.hidden = origenElegido !== "importado";
    })
  );

  const materiaSelect = appEl.querySelector("#materia-crear");
  const avisoVerificado = appEl.querySelector("#aviso-verificado-crear");
  let paquetesVerificados = [];
  materiaSelect.addEventListener("change", async () => {
    const paquetes = await curriculo.paquetesParaCursoMateria(perfil.curso, materiaSelect.value);
    paquetesVerificados = paquetes.filter((p) => p.verificado);
    avisoVerificado.innerHTML = paquetesVerificados.length
      ? `<p class="aviso">📄 Hay currículo oficial verificado disponible: se usará como base, con su fuente citada.</p>`
      : `<p class="ayuda-campo">Todavía no hay currículo verificado cargado para esta materia y curso: el recurso lo dirá explícitamente en vez de inventar una cita oficial.</p>`;
  });

  appEl.querySelector("#archivo-importado").addEventListener("change", async (ev) => {
    const archivo = ev.target.files[0];
    if (!archivo) return;
    const texto = await archivo.text();
    appEl.querySelector("#texto-importado").value = texto;
  });

  on('[data-accion="cancelar-crear"]', "click", () => {
    estado.crear = { vista: "lista" };
    pintarListaRecursos();
  });

  on("#form-crear", "submit", (ev) => {
    ev.preventDefault();
    const errorEl = appEl.querySelector("#error-crear");
    errorEl.textContent = "";

    if (!tipoElegido) {
      errorEl.textContent = "Elige un tipo de recurso.";
      return;
    }
    const materiaId = materiaSelect.value;
    const materiaNombre = materiaSelect.selectedOptions[0]?.textContent || "";
    if (!materiaId) {
      errorEl.textContent = "Elige una materia.";
      return;
    }

    let origen;
    if (origenElegido === "curriculo") {
      const tema = appEl.querySelector("#tema-crear").value.trim() || "un tema general de la materia";
      origen = paquetesVerificados.length
        ? { tipo: "curriculo", tema, paquete: paquetesVerificados[0] }
        : { tipo: "curriculo", tema };
    } else {
      const texto = appEl.querySelector("#texto-importado").value.trim();
      if (!texto) {
        errorEl.textContent = "Pega o sube un texto para poder generar el recurso.";
        return;
      }
      origen = { tipo: "importado", texto };
    }

    estado.crear = {
      vista: "generando",
      tipo: tipoElegido,
      materiaId,
      materiaNombre,
      origen,
      paquetesVerificados: origenElegido === "curriculo" ? paquetesVerificados : [],
    };
    generarRecurso();
  });
}

function pintarGenerando() {
  const pct = Math.round((estado.crear.progreso || 0) * 100);
  render(
    cabeceraYNavHtml(`
      <section class="tarjeta" aria-live="polite">
        <h2>🧠 Generando…</h2>
        <p id="texto-progreso-crear">${escapeHtml(estado.crear.textoProgreso || "Preparando el motor de IA…")}</p>
        <div style="background:var(--borde); border-radius:999px; overflow:hidden; height:0.8rem;">
          <div id="barra-progreso-crear" style="background:var(--azul); height:100%; width:${pct}%; transition:width .2s;"></div>
        </div>
      </section>
    `)
  );
  wireCabeceraYNav();
}

function actualizarBarraProgresoCrear() {
  const pct = Math.round((estado.crear.progreso || 0) * 100);
  const barra = appEl.querySelector("#barra-progreso-crear");
  const texto = appEl.querySelector("#texto-progreso-crear");
  if (barra) barra.style.width = pct + "%";
  if (texto) texto.textContent = estado.crear.textoProgreso;
}

async function generarRecurso() {
  const c = estado.crear;
  pintarGenerando();
  try {
    const { motor } = await obtenerMotorCompartido((info) => {
      if (!estado.crear) return;
      estado.crear.progreso = info.progreso;
      estado.crear.textoProgreso = info.texto || "Cargando…";
      actualizarBarraProgresoCrear();
    });
    const mensajes = generador.construirPrompt({ tipo: c.tipo, origen: c.origen, materiaNombre: c.materiaNombre });
    const textoFinal = await motor.responder({ mensajes, onToken: () => {} });
    c.resultado = generador.parsearRespuesta(c.tipo, textoFinal);
  } catch (err) {
    console.error("Error al generar el recurso:", err);
    c.resultado = { ok: false, bruto: "", error: err.message };
  }
  c.vista = "previsualizar";
  pintarPrevisualizacion();
}

function pintarPrevisualizacion() {
  const c = estado.crear;
  const info = TIPOS_RECURSO_POR_ID[c.tipo];

  const tarjetaVerificada = (c.paquetesVerificados || [])
    .map(
      (pk) => `
    <section class="tarjeta" aria-label="Currículo oficial verificado">
      <span class="pastilla verificado">📄 Currículo oficial verificado (base de este recurso)</span>
      <p><strong>Competencia específica ${pk.competenciaEspecifica.numero}:</strong> ${escapeHtml(pk.competenciaEspecifica.texto)}</p>
      <p class="ayuda-campo">Fuente: ${escapeHtml(pk.fuente.norma)}</p>
    </section>`
    )
    .join("");

  let cuerpoHtml;
  if (!c.resultado.ok) {
    cuerpoHtml = `
      <section class="tarjeta">
        <p class="error">No se ha podido interpretar la respuesta como ${info.nombre.toLowerCase()}.</p>
        ${c.resultado.bruto ? `<p class="ayuda-campo">Esto es lo que se generó, sin procesar:</p><pre style="white-space:pre-wrap;">${escapeHtml(c.resultado.bruto)}</pre>` : ""}
        <div class="fila-botones">
          <button type="button" class="btn-primario" data-accion="reintentar-generar">Reintentar</button>
        </div>
      </section>`;
  } else if (c.tipo === "resumen") {
    cuerpoHtml = `
      <section class="tarjeta">
        <span class="pastilla pendiente">🧠 Contenido generado, editable</span>
        <label for="editor-resumen" class="visually-hidden">Editar resumen</label>
        <textarea id="editor-resumen" rows="10" style="width:100%; font:inherit; padding:0.65rem 0.75rem; border-radius:0.6rem; border:1.5px solid var(--borde); margin-top:0.5rem;">${escapeHtml(c.resultado.contenido)}</textarea>
      </section>`;
  } else if (c.tipo === "esquema" && !c.resultado.formatoLibre) {
    const textoEsquema = c.resultado.contenido
      .map((p) => `- ${p.titulo}\n` + p.subpuntos.map((s) => `  - ${s}`).join("\n"))
      .join("\n");
    cuerpoHtml = `
      <section class="tarjeta">
        <span class="pastilla pendiente">🧠 Contenido generado, editable</span>
        <p class="ayuda-campo">Formato: una línea "- punto principal" y líneas "  - subpunto" con dos espacios de sangría.</p>
        <label for="editor-esquema" class="visually-hidden">Editar esquema</label>
        <textarea id="editor-esquema" rows="10" style="width:100%; font:inherit; padding:0.65rem 0.75rem; border-radius:0.6rem; border:1.5px solid var(--borde); margin-top:0.5rem;">${escapeHtml(textoEsquema)}</textarea>
      </section>`;
  } else if (c.tipo === "esquema") {
    cuerpoHtml = `
      <section class="tarjeta">
        <span class="pastilla pendiente">🧠 Contenido generado, editable</span>
        <textarea id="editor-esquema-libre" rows="10" style="width:100%; font:inherit; padding:0.65rem 0.75rem; border-radius:0.6rem; border:1.5px solid var(--borde); margin-top:0.5rem;">${escapeHtml(c.resultado.contenido)}</textarea>
      </section>`;
  } else {
    // flashcards / ejercicios: lista de tarjetas editables
    const campo1 = c.tipo === "flashcards" ? "pregunta" : "enunciado";
    const campo2 = c.tipo === "flashcards" ? "respuesta" : "solucion";
    const tarjetas = c.resultado.contenido
      .map(
        (item, i) => `
      <div class="tarjeta" data-tarjeta="${i}" style="margin-bottom:0.5rem;">
        <label class="ayuda-campo" for="campo1-${i}">${campo1[0].toUpperCase() + campo1.slice(1)}</label>
        <input type="text" id="campo1-${i}" data-campo="${campo1}" value="${escapeHtml(item[campo1] || "")}" style="margin-bottom:0.4rem;" />
        <label class="ayuda-campo" for="campo2-${i}">${campo2[0].toUpperCase() + campo2.slice(1)}</label>
        <textarea id="campo2-${i}" data-campo="${campo2}" rows="2" style="width:100%; font:inherit; padding:0.5rem; border-radius:0.5rem; border:1.5px solid var(--borde);">${escapeHtml(item[campo2] || "")}</textarea>
        <div class="fila-botones" style="margin-top:0.4rem;">
          <button type="button" class="btn-texto" data-accion="eliminar-tarjeta" data-indice="${i}">Eliminar</button>
        </div>
      </div>`
      )
      .join("");
    cuerpoHtml = `
      <section class="tarjeta">
        <span class="pastilla pendiente">🧠 Contenido generado, editable</span>
      </section>
      <div id="lista-tarjetas">${tarjetas}</div>
      <div class="fila-botones">
        <button type="button" class="btn-secundario" data-accion="anadir-tarjeta">+ Añadir</button>
      </div>`;
  }

  render(
    cabeceraYNavHtml(`
      <h2>${info.icono} ${info.nombre} — ${escapeHtml(c.materiaNombre)}</h2>
      ${tarjetaVerificada}
      ${cuerpoHtml}
      <div class="fila-botones">
        <button type="button" class="btn-primario" data-accion="guardar-recurso">Guardar</button>
        ${c.recursoEditandoId ? "" : `<button type="button" class="btn-secundario" data-accion="reintentar-generar">Volver a generar</button>`}
        <button type="button" class="btn-secundario" data-accion="volver-lista">Volver a Crear</button>
      </div>
    `)
  );
  wireCabeceraYNav();

  on('[data-accion="volver-lista"]', "click", () => {
    estado.crear = { vista: "lista" };
    pintarListaRecursos();
  });
  on('[data-accion="reintentar-generar"]', "click", () => generarRecurso());
  onAll('[data-accion="eliminar-tarjeta"]', "click", (ev) => {
    sincronizarTarjetasDesdeDOM(); // no perder ediciones ya escritas antes de re-renderizar
    const i = Number(ev.currentTarget.getAttribute("data-indice"));
    c.resultado.contenido.splice(i, 1);
    pintarPrevisualizacion();
  });
  on('[data-accion="anadir-tarjeta"]', "click", () => {
    sincronizarTarjetasDesdeDOM(); // no perder ediciones ya escritas antes de re-renderizar
    const campo1 = c.tipo === "flashcards" ? "pregunta" : "enunciado";
    const campo2 = c.tipo === "flashcards" ? "respuesta" : "solucion";
    c.resultado.contenido.push({ [campo1]: "", [campo2]: "" });
    pintarPrevisualizacion();
  });
  on('[data-accion="guardar-recurso"]', "click", async () => {
    const contenidoFinal = recogerContenidoEditado();
    if (contenidoFinal === null) return; // error ya mostrado dentro de recogerContenidoEditado
    if (c.recursoEditandoId) {
      await db.actualizarRecurso(c.recursoEditandoId, contenidoFinal);
    } else {
      // "cuaderno" (Fase 4, Convierte mis apuntes) y "escaneado" (Fase 4, Escanea y aprende)
      // se guardan con su propio tipo de origen, no mezclados con "importado": la lista de
      // recursos los etiqueta de forma distinta (ver pintarListaRecursos).
      const origenGuardado =
        c.origen.tipo === "curriculo"
          ? { tipo: "curriculo", tema: c.origen.tema }
          : { tipo: c.origen.tipo === "cuaderno" || c.origen.tipo === "escaneado" ? c.origen.tipo : "importado" };
      const nuevoId = await db.guardarRecurso({
        perfilId: estado.perfilActivo.id,
        tipo: c.tipo,
        materiaId: c.materiaId,
        materiaNombre: c.materiaNombre,
        origen: origenGuardado,
        contenido: contenidoFinal,
        fuentesVerificadas: (c.paquetesVerificados || []).map((p) => p.id),
      });
      if (c.origen.tipo === "cuaderno" && c.origen.paginaId) {
        await db.vincularRecursoAPagina(c.origen.paginaId, nuevoId);
      }
    }
    estado.crear = { vista: "lista" };
    pintarListaRecursos();
  });
}

/** Vuelca lo que haya escrito en los campos de flashcards/ejercicios de vuelta a
 * estado.crear.resultado.contenido, para no perderlo al añadir/eliminar una tarjeta
 * (que fuerza un re-renderizado de toda la lista) ni al guardar. */
function sincronizarTarjetasDesdeDOM() {
  const c = estado.crear;
  const campo1 = c.tipo === "flashcards" ? "pregunta" : "enunciado";
  const campo2 = c.tipo === "flashcards" ? "respuesta" : "solucion";
  const nodos = appEl.querySelectorAll("[data-tarjeta]");
  if (nodos.length === 0) return;
  c.resultado.contenido = Array.from(nodos).map((nodo) => ({
    [campo1]: nodo.querySelector(`[data-campo="${campo1}"]`).value.trim(),
    [campo2]: nodo.querySelector(`[data-campo="${campo2}"]`).value.trim(),
  }));
}

function recogerContenidoEditado() {
  const c = estado.crear;
  if (c.tipo === "resumen") {
    return appEl.querySelector("#editor-resumen").value.trim();
  }
  if (c.tipo === "esquema" && appEl.querySelector("#editor-esquema")) {
    const reparse = generador.parsearRespuesta("esquema", appEl.querySelector("#editor-esquema").value);
    if (!reparse.ok || reparse.formatoLibre) {
      alert('No se ha podido interpretar el esquema editado. Revisa que cada línea use "- " o "  - " tal como se indica arriba.');
      return null;
    }
    return reparse.contenido;
  }
  if (c.tipo === "esquema") {
    return appEl.querySelector("#editor-esquema-libre").value.trim();
  }
  // flashcards / ejercicios
  sincronizarTarjetasDesdeDOM();
  const campo1 = c.tipo === "flashcards" ? "pregunta" : "enunciado";
  const campo2 = c.tipo === "flashcards" ? "respuesta" : "solucion";
  return c.resultado.contenido.filter((t) => t[campo1] || t[campo2]);
}

// ---------- Practicar (Fase 3, apartado 17) ----------
//
// Dos cosas distintas conviven en esta pestaña, a propósito:
//
//  - Controles: los crea la Familia (Panel de la Familia) y el Alumno los
//    entrega desde aquí. Las preguntas cerradas se corrigen al instante sin
//    IA; las abiertas llevan una propuesta de la IA que NO cuenta para el
//    progreso hasta que la Familia la confirma (resolución C5).
//  - Fichas para repasar: un repaso informal de las flashcards ya creadas en
//    "Crear", sin ninguna calificación ni envío a nadie.

async function pintarPestanaPracticar() {
  if (!estado.practicar || estado.practicar.vista === "lista") return pintarListaPracticar();
  if (estado.practicar.vista === "haciendo-control") return pintarHaciendoControl();
  if (estado.practicar.vista === "resultado-control") return pintarResultadoControl();
  if (estado.practicar.vista === "fichas") return pintarFichas();
  return pintarListaPracticar();
}

function resumenIntento(control, intento) {
  const totalCerradas = intento.resultados.filter((r) => r.tipo !== "abierta").length;
  const correctasCerradas = intento.resultados.filter((r) => r.tipo !== "abierta" && r.correcta).length;
  const abiertasPendientes = intento.resultados.filter((r) => r.tipo === "abierta" && !r.confirmada).length;
  const partes = [];
  if (totalCerradas) partes.push(`${correctasCerradas}/${totalCerradas} preguntas cerradas correctas`);
  if (abiertasPendientes) partes.push(`${abiertasPendientes} pregunta${abiertasPendientes === 1 ? "" : "s"} abierta${abiertasPendientes === 1 ? "" : "s"} pendiente${abiertasPendientes === 1 ? "" : "s"} de confirmar`);
  else if (intento.resultados.some((r) => r.tipo === "abierta")) partes.push("preguntas abiertas ya confirmadas por la Familia");
  return partes.join(" · ") || "Sin preguntas";
}

async function pintarListaPracticar() {
  const perfil = estado.perfilActivo;
  const [controles, intentos, recursos] = await Promise.all([
    db.listarControles(perfil.id),
    db.listarIntentos(perfil.id),
    db.listarRecursos(perfil.id),
  ]);
  const fichasDisponibles = recursos.filter((r) => r.tipo === "flashcards");

  const filasControles = controles
    .map((c) => {
      const intentosControl = intentos.filter((it) => it.controlId === c.id);
      const ultimo = intentosControl[0]; // listarIntentos ya viene ordenado del más reciente al más antiguo
      let estadoHtml;
      if (!ultimo) {
        estadoHtml = `<span class="pastilla pendiente">Sin entregar</span>`;
      } else if (ultimo.confirmadoEn) {
        estadoHtml = `<span class="pastilla verificado">✅ Corregido — ${escapeHtml(resumenIntento(c, ultimo))}</span>`;
      } else {
        estadoHtml = `<span class="pastilla pendiente">🧠➜✅ Entregado — ${escapeHtml(resumenIntento(c, ultimo))}</span>`;
      }
      return `
      <li class="tarjeta" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;">
        <span>
          <strong>${escapeHtml(c.titulo)}</strong> — ${escapeHtml(c.materiaNombre)}
          <div class="ayuda-campo">${estadoHtml}</div>
        </span>
        <button class="btn-primario" data-accion="empezar-control" data-id="${c.id}">${ultimo ? "Volver a hacerlo" : "Empezar"}</button>
        ${ultimo ? `<button class="btn-secundario" data-accion="ver-resultado" data-id="${ultimo.id}">Ver resultado</button>` : ""}
      </li>`;
    })
    .join("");

  const filasFichas = fichasDisponibles
    .map(
      (r) => `
      <li class="tarjeta" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${escapeHtml(r.materiaNombre)} — ${r.contenido.length} ficha${r.contenido.length === 1 ? "" : "s"}</span>
        <button class="btn-secundario" data-accion="repasar-fichas" data-id="${r.id}">Repasar</button>
      </li>`
    )
    .join("");

  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>✏️ Controles</h2>
        ${controles.length ? `<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.6rem;">${filasControles}</ul>` : `<p class="aviso">Todavía no tienes ningún control asignado.</p>`}
      </section>
      <section class="tarjeta">
        <h2>🔁 Fichas para repasar</h2>
        <p class="ayuda-campo">Un repaso libre de tus flashcards de "Crear", sin calificación ni envío a nadie.</p>
        ${fichasDisponibles.length ? `<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.6rem;">${filasFichas}</ul>` : `<p class="aviso">Todavía no tienes flashcards creadas. Puedes crearlas desde la pestaña "Crear".</p>`}
      </section>
    `)
  );
  wireCabeceraYNav();

  onAll('[data-accion="empezar-control"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    const control = await db.obtenerControl(id);
    estado.practicar = { vista: "haciendo-control", control, pistas: {}, cargandoPista: {}, motor: null, enviando: false };
    pintarHaciendoControl();
  });
  onAll('[data-accion="ver-resultado"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    const intento = await db.obtenerIntento(id);
    const control = await db.obtenerControl(intento.controlId);
    estado.practicar = { vista: "resultado-control", intento, control };
    pintarResultadoControl();
  });
  onAll('[data-accion="repasar-fichas"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    const recurso = recursos.find((r) => r.id === id);
    estado.practicar = { vista: "fichas", recurso, indiceFicha: 0, mostrarRespuesta: false };
    pintarFichas();
  });
}

/** `previa` es lo último que se guardó de esta pregunta en pr.respuestas (ver
 * sincronizarRespuestasControlDesdeDOM): sin esto, pedir una pista en una pregunta
 * fuerza un re-renderizado de todo el formulario y borraría las respuestas ya
 * escritas en las demás, igual que pasaba con las flashcards en la Fase 2. */
function preguntaControlRespuestaHtml(p, i, previa) {
  if (p.tipo === "opcion_multiple") {
    return (p.opciones || [])
      .map((op, oi) =>
        op
          ? `<label style="font-weight:400; display:flex; gap:0.5rem; align-items:center; margin-bottom:0.3rem;">
        <input type="radio" name="respuesta-${i}" data-campo="respuesta" value="${oi}" ${previa !== null && previa !== undefined && Number(previa) === oi ? "checked" : ""} />
        ${escapeHtml(op)}
      </label>`
          : ""
      )
      .join("");
  }
  if (p.tipo === "verdadero_falso") {
    return `
      <div class="fila-botones" role="group" aria-label="Tu respuesta">
        <label style="font-weight:400; display:flex; gap:0.4rem; align-items:center;"><input type="radio" name="respuesta-${i}" data-campo="respuesta" value="true" ${previa === true ? "checked" : ""} /> Verdadero</label>
        <label style="font-weight:400; display:flex; gap:0.4rem; align-items:center;"><input type="radio" name="respuesta-${i}" data-campo="respuesta" value="false" ${previa === false ? "checked" : ""} /> Falso</label>
      </div>`;
  }
  if (p.tipo === "respuesta_corta") {
    return `<input type="text" id="respuesta-${i}" data-campo="respuesta" autocomplete="off" value="${escapeHtml(previa || "")}" />`;
  }
  return `<textarea id="respuesta-${i}" data-campo="respuesta" rows="4" style="width:100%; font:inherit; padding:0.5rem; border-radius:0.5rem; border:1.5px solid var(--borde);">${escapeHtml(previa || "")}</textarea>`;
}

/** Vuelca lo que haya escrito el alumno en el DOM a pr.respuestas, para no perderlo
 * al pedir una pista (que fuerza un re-renderizado de todo el formulario). Tolerante
 * con preguntas sin responder todavía: no lanza, deja lo que hubiera o null/"". */
function sincronizarRespuestasControlDesdeDOM() {
  const pr = estado.practicar;
  const c = pr.control;
  pr.respuestas = pr.respuestas || {};
  c.preguntas.forEach((p, i) => {
    const nodo = appEl.querySelector(`[data-respuesta="${i}"]`);
    if (!nodo) return;
    if (p.tipo === "opcion_multiple") {
      const marcado = nodo.querySelector('[data-campo="respuesta"]:checked');
      pr.respuestas[i] = marcado ? Number(marcado.value) : null;
    } else if (p.tipo === "verdadero_falso") {
      const marcado = nodo.querySelector('[data-campo="respuesta"]:checked');
      pr.respuestas[i] = marcado ? marcado.value === "true" : null;
    } else {
      pr.respuestas[i] = nodo.querySelector('[data-campo="respuesta"]').value;
    }
  });
}

// Pizarra ligera (Fase 4, apartado 2.2): el mismo componente de lienzo del
// Cuaderno, reutilizado aquí "restringido a una casilla de respuesta" (tal
// cual lo describe el documento), solo en preguntas abiertas. A propósito
// NO incluye ningún reconocimiento de procedimiento matemático: el propio
// documento clasifica esa pieza como el mayor riesgo técnico del proyecto y
// pide empezar por un alcance muy reducido (apartado 1.4). Aquí el trabajo
// manuscrito se guarda junto con la respuesta, para que quien corrija pueda
// verlo, pero nunca se analiza automáticamente — ver LEEME.md.
function pizarraControlHtml(i) {
  return `
    <p class="ayuda-campo">🖍️ Si quieres, muestra aquí tu trabajo (opcional; nadie lo corrige automáticamente todavía):</p>
    <canvas id="pizarra-${i}" data-pizarra="${i}" width="600" height="200" style="width:100%; max-width:100%; touch-action:none; border:1.5px solid var(--borde); border-radius:0.6rem; background:#fff; display:block;"></canvas>
    <div class="fila-botones" style="margin-top:0.3rem;">
      <button type="button" class="btn-texto" data-accion="limpiar-pizarra" data-indice="${i}">Borrar el dibujo</button>
    </div>`;
}

function pintarHaciendoControl() {
  const pr = estado.practicar;
  const c = pr.control;
  pr.respuestas = pr.respuestas || {};
  pr.trazosPizarra = pr.trazosPizarra || {};
  pr.lienzosActivos = {};

  const bloques = c.preguntas
    .map((p, i) => {
      const pista = pr.pistas[i];
      const botonPista =
        c.nivelAyudaIA > 0
          ? `<button type="button" class="btn-texto" data-accion="pedir-pista-control" data-indice="${i}" ${pr.cargandoPista[i] ? "disabled" : ""}>
              ${pr.cargandoPista[i] ? "Pensando…" : "💡 Pedir una pista"}
            </button>`
          : "";
      return `
      <div class="tarjeta" data-respuesta="${i}" style="margin-bottom:0.5rem;">
        <p><strong>${i + 1}. ${escapeHtml(p.enunciado)}</strong></p>
        ${preguntaControlRespuestaHtml(p, i, pr.respuestas[i])}
        ${botonPista}
        ${pista ? `<p class="ayuda-campo" data-pista="${i}">💡 ${escapeHtml(pista)}</p>` : ""}
        ${p.tipo === "abierta" ? pizarraControlHtml(i) : ""}
      </div>`;
    })
    .join("");

  render(
    cabeceraYNavHtml(`
      <section class="cabecera-app" style="margin-bottom:0;">
        <div>
          <h2 style="margin-bottom:0.15rem;">✏️ ${escapeHtml(c.titulo)}</h2>
          <div class="ayuda-campo">${escapeHtml(c.materiaNombre)}</div>
        </div>
      </section>
      <form id="form-practicar-control">
        ${bloques}
        <div id="error-practicar-control" class="error" role="alert" aria-live="polite"></div>
        <div class="fila-botones">
          <button type="submit" class="btn-primario" ${pr.enviando ? "disabled" : ""}>${pr.enviando ? "Corrigiendo…" : "Entregar"}</button>
          <button type="button" class="btn-secundario" data-accion="cancelar-control-practicar">Cancelar</button>
        </div>
      </form>
    `)
  );
  wireCabeceraYNav();

  c.preguntas.forEach((p, i) => {
    if (p.tipo !== "abierta") return;
    pr.lienzosActivos[i] = crearLienzo(appEl.querySelector(`#pizarra-${i}`), { trazosIniciales: pr.trazosPizarra[i] || [] });
  });

  function sincronizarPizarrasDesdeLienzos() {
    for (const i of Object.keys(pr.lienzosActivos)) {
      pr.trazosPizarra[i] = pr.lienzosActivos[i].obtenerTrazos();
    }
  }

  onAll('[data-accion="limpiar-pizarra"]', "click", (ev) => {
    const i = Number(ev.currentTarget.getAttribute("data-indice"));
    if (pr.lienzosActivos[i]) pr.lienzosActivos[i].limpiar();
  });

  on('[data-accion="cancelar-control-practicar"]', "click", () => {
    estado.practicar = { vista: "lista" };
    pintarListaPracticar();
  });

  onAll('[data-accion="pedir-pista-control"]', "click", async (ev) => {
    const i = Number(ev.currentTarget.getAttribute("data-indice"));
    sincronizarRespuestasControlDesdeDOM(); // no perder las respuestas ya escritas al re-renderizar
    sincronizarPizarrasDesdeLienzos(); // ídem con el trabajo manuscrito de las pizarras abiertas
    pr.cargandoPista[i] = true;
    pintarHaciendoControl();
    try {
      if (!pr.motor) {
        const { motor } = await obtenerMotorCompartido(() => {});
        pr.motor = motor;
      }
      const mensajes = correccion.construirPromptPistaControl({
        pregunta: c.preguntas[i],
        nivelAyuda: c.nivelAyudaIA,
        materiaNombre: c.materiaNombre,
        ajustesAccesibilidad: estado.ajustesAccesibilidad,
      });
      const texto = await pr.motor.responder({ mensajes, onToken: () => {} });
      pr.pistas[i] = texto;
    } catch (err) {
      console.error("No se ha podido obtener una pista:", err);
      pr.pistas[i] = "No se ha podido generar una pista ahora mismo.";
    }
    pr.cargandoPista[i] = false;
    pintarHaciendoControl();
  });

  on("#form-practicar-control", "submit", async (ev) => {
    ev.preventDefault();
    sincronizarPizarrasDesdeLienzos();
    await enviarControl();
  });
}

/** Lee las respuestas del DOM con el mismo tipo que se guardó en la pregunta
 * (número/booleano/cadena), para que corregirCerrada compare tipos correctos. */
function leerRespuestasControl(control) {
  return control.preguntas.map((p, i) => {
    const nodo = appEl.querySelector(`[data-respuesta="${i}"]`);
    if (p.tipo === "opcion_multiple") {
      const marcado = nodo.querySelector('[data-campo="respuesta"]:checked');
      return marcado ? Number(marcado.value) : null;
    }
    if (p.tipo === "verdadero_falso") {
      const marcado = nodo.querySelector('[data-campo="respuesta"]:checked');
      return marcado ? marcado.value === "true" : null;
    }
    return nodo.querySelector('[data-campo="respuesta"]').value.trim();
  });
}

async function enviarControl() {
  const pr = estado.practicar;
  const control = pr.control;
  const errorEl = appEl.querySelector("#error-practicar-control");
  const respuestas = leerRespuestasControl(control);

  const sinResponderCerradas = control.preguntas.some((p, i) => p.tipo !== "abierta" && (respuestas[i] === null || respuestas[i] === undefined));
  if (sinResponderCerradas) {
    errorEl.textContent = "Responde todas las preguntas de opción múltiple y verdadero/falso antes de entregar.";
    return;
  }

  pr.enviando = true;
  pintarHaciendoControl();

  // Corrección inmediata de las preguntas cerradas, sin IA.
  const resultados = control.preguntas.map((p, i) => {
    if (p.tipo === "abierta") {
      return {
        preguntaIndice: i,
        tipo: "abierta",
        respuestaAlumno: respuestas[i],
        // Trabajo manuscrito de la pizarra ligera (Fase 4): se guarda tal cual para que
        // quien corrija pueda verlo, pero nunca se analiza automáticamente (ver LEEME.md).
        trabajoManuscrito: (pr.trazosPizarra && pr.trazosPizarra[i]) || [],
        propuestaIA: null,
        calificacionFinal: null,
        confirmada: false,
      };
    }
    const { correcta } = correccion.corregirCerrada(p, respuestas[i]);
    return { preguntaIndice: i, tipo: p.tipo, respuestaAlumno: respuestas[i], correcta };
  });

  // Propuesta de la IA para cada pregunta abierta (nunca cuenta hasta que la Familia la confirme).
  const indicesAbiertas = control.preguntas.map((p, i) => (p.tipo === "abierta" ? i : -1)).filter((i) => i >= 0);
  if (indicesAbiertas.length > 0) {
    try {
      if (!pr.motor) {
        const { motor } = await obtenerMotorCompartido(() => {});
        pr.motor = motor;
      }
      for (const i of indicesAbiertas) {
        const mensajes = correccion.construirPromptCorreccionAbierta({
          pregunta: control.preguntas[i],
          respuestaAlumno: respuestas[i],
          materiaNombre: control.materiaNombre,
          ajustesAccesibilidad: estado.ajustesAccesibilidad,
        });
        const textoCrudo = await pr.motor.responder({ mensajes, onToken: () => {} });
        resultados[i].propuestaIA = correccion.parsearCorreccionAbierta(textoCrudo);
      }
    } catch (err) {
      console.error("No se ha podido obtener la corrección de la IA:", err);
      // Si falla, las preguntas abiertas se quedan con propuestaIA: null: la Familia
      // verá "no se ha podido generar una propuesta" y calificará a mano (nunca se
      // aprueba nada por error de red o del motor).
    }
  }

  const idIntento = await db.guardarIntento({ perfilId: estado.perfilActivo.id, controlId: control.id, respuestas, resultados });
  await db.actualizarResultadosIntento(idIntento, resultados); // calcula confirmadoEn si no queda ninguna abierta pendiente
  const intento = await db.obtenerIntento(idIntento);

  estado.practicar = { vista: "resultado-control", intento, control };
  pintarResultadoControl();
}

function pintarResultadoControl() {
  const pr = estado.practicar;
  const { intento, control } = pr;

  const bloques = intento.resultados
    .map((r, i) => {
      const pregunta = control.preguntas[r.preguntaIndice];
      if (r.tipo !== "abierta") {
        return `
        <div class="tarjeta" style="margin-bottom:0.5rem;">
          <p><strong>${i + 1}. ${escapeHtml(pregunta ? pregunta.enunciado : "")}</strong></p>
          <span class="pastilla ${r.correcta ? "verificado" : "pendiente"}">${r.correcta ? "✅ Correcta" : "❌ Incorrecta"}</span>
        </div>`;
      }
      return `
      <div class="tarjeta" style="margin-bottom:0.5rem;">
        <p><strong>${i + 1}. ${escapeHtml(pregunta ? pregunta.enunciado : "")}</strong></p>
        <p class="ayuda-campo">Tu respuesta: ${escapeHtml(r.respuestaAlumno && r.respuestaAlumno.trim() ? r.respuestaAlumno : "(sin responder)")}</p>
        ${
          r.trabajoManuscrito && r.trabajoManuscrito.length
            ? `<p class="ayuda-campo">🖍️ Trabajo manuscrito (sin corrección automática):</p>
               <canvas data-pizarra-resultado="${i}" width="600" height="200" style="width:100%; max-width:100%; border:1.5px solid var(--borde); border-radius:0.6rem; background:#fff; display:block;"></canvas>`
            : ""
        }
        ${
          r.confirmada
            ? `<span class="pastilla verificado">✅ Calificación confirmada por la Familia: ${escapeHtml(r.calificacionFinal)}</span>`
            : `<span class="pastilla pendiente">🧠 Propuesta de la IA (sin confirmar todavía): ${escapeHtml(r.propuestaIA ? r.propuestaIA.calificacion : "no disponible")}</span>
               <p class="ayuda-campo">Esta pregunta la revisará un adulto de tu Familia antes de que cuente para tu progreso.</p>`
        }
      </div>`;
    })
    .join("");

  render(
    cabeceraYNavHtml(`
      <h2>✏️ ${escapeHtml(control ? control.titulo : "")}</h2>
      ${bloques}
      <div class="fila-botones">
        <button type="button" class="btn-secundario" data-accion="volver-practicar">Volver a Practicar</button>
      </div>
    `)
  );
  wireCabeceraYNav();

  intento.resultados.forEach((r, i) => {
    if (r.trabajoManuscrito && r.trabajoManuscrito.length) {
      crearLienzo(appEl.querySelector(`[data-pizarra-resultado="${i}"]`), { trazosIniciales: r.trabajoManuscrito, soloLectura: true });
    }
  });

  on('[data-accion="volver-practicar"]', "click", () => {
    estado.practicar = { vista: "lista" };
    pintarListaPracticar();
  });
}

function pintarFichas() {
  const pr = estado.practicar;
  const r = pr.recurso;
  const ficha = r.contenido[pr.indiceFicha];

  render(
    cabeceraYNavHtml(`
      <h2>🔁 ${escapeHtml(r.materiaNombre)}</h2>
      <p class="ayuda-campo">Ficha ${pr.indiceFicha + 1} de ${r.contenido.length} · repaso informal, sin calificación</p>
      <section class="tarjeta" style="min-height:8rem;">
        <p><strong>${escapeHtml(ficha.pregunta || "")}</strong></p>
        ${pr.mostrarRespuesta ? `<p style="margin-top:0.6rem;">${escapeHtml(ficha.respuesta || "")}</p>` : ""}
      </section>
      <div class="fila-botones">
        ${pr.mostrarRespuesta ? "" : `<button type="button" class="btn-primario" data-accion="ver-respuesta-ficha">Ver respuesta</button>`}
        <button type="button" class="btn-secundario" data-accion="ficha-anterior" ${pr.indiceFicha === 0 ? "disabled" : ""}>← Anterior</button>
        <button type="button" class="btn-secundario" data-accion="ficha-siguiente" ${pr.indiceFicha >= r.contenido.length - 1 ? "disabled" : ""}>Siguiente →</button>
      </div>
      <div class="fila-botones">
        <button type="button" class="btn-secundario" data-accion="volver-practicar">Volver a Practicar</button>
      </div>
    `)
  );
  wireCabeceraYNav();

  on('[data-accion="ver-respuesta-ficha"]', "click", () => {
    pr.mostrarRespuesta = true;
    pintarFichas();
  });
  on('[data-accion="ficha-anterior"]', "click", () => {
    pr.indiceFicha = Math.max(0, pr.indiceFicha - 1);
    pr.mostrarRespuesta = false;
    pintarFichas();
  });
  on('[data-accion="ficha-siguiente"]', "click", () => {
    pr.indiceFicha = Math.min(r.contenido.length - 1, pr.indiceFicha + 1);
    pr.mostrarRespuesta = false;
    pintarFichas();
  });
  on('[data-accion="volver-practicar"]', "click", () => {
    estado.practicar = { vista: "lista" };
    pintarListaPracticar();
  });
}

// ---------- Progreso (Fase 3, apartado 17: "primer nivel visible") ----------
//
// Solo cuenta lo que ya es seguro contar: las preguntas cerradas (siempre,
// porque se corrigen sin IA y sin ambigüedad) y las preguntas abiertas SOLO
// cuando la Familia ya ha confirmado su calificación (resolución C5). Las
// abiertas todavía pendientes de confirmar se muestran aparte, aclarando
// explícitamente que no cuentan todavía, en vez de mezclarlas u ocultarlas.

function badgeNivelDominio(nivel) {
  if (nivel === "dominado") return { emoji: "🟢", etiqueta: "Dominado", clase: "verificado" };
  if (nivel === "en_progreso") return { emoji: "🟡", etiqueta: "En progreso", clase: "verificado" };
  if (nivel === "con_dificultad") return { emoji: "🟠", etiqueta: "Con dificultad", clase: "pendiente" };
  return { emoji: "⚪", etiqueta: "Sin datos suficientes todavía", clase: "pendiente" };
}

async function pintarPestanaProgreso() {
  const perfil = estado.perfilActivo;
  const [controles, intentos] = await Promise.all([db.listarControles(perfil.id), db.listarIntentos(perfil.id)]);
  const sugerenciasPendientes = (await sincronizarSugerenciasAdaptacion(perfil)).filter((s) => s.estado === "pendiente");

  const porMateria = {};
  for (const intento of intentos) {
    const control = controles.find((c) => c.id === intento.controlId);
    if (!control) continue; // el control pudo eliminarse después de entregar el intento
    if (!porMateria[control.materiaId]) {
      porMateria[control.materiaId] = {
        materiaId: control.materiaId,
        materiaNombre: control.materiaNombre,
        cerradasTotal: 0,
        cerradasCorrectas: 0,
        abiertasCorrectas: 0,
        abiertasParciales: 0,
        abiertasIncorrectas: 0,
        abiertasPendientes: 0,
      };
    }
    const m = porMateria[control.materiaId];
    for (const r of intento.resultados) {
      if (r.tipo !== "abierta") {
        m.cerradasTotal++;
        if (r.correcta) m.cerradasCorrectas++;
      } else if (r.confirmada) {
        if (r.calificacionFinal === "correcta") m.abiertasCorrectas++;
        else if (r.calificacionFinal === "parcial") m.abiertasParciales++;
        else m.abiertasIncorrectas++;
      } else {
        m.abiertasPendientes++;
      }
    }
  }

  const materias = Object.values(porMateria);

  // Fase 5, apartado 5.3: nivel de dominio por criterio de evaluación, cuando
  // las preguntas del control están vinculadas a uno (ver Panel de la
  // Familia). Es la misma fuente de datos (controles + intentos), solo con
  // más detalle cuando ese detalle existe de verdad.
  const modelo = modeloEducativo.calcularModeloEducativo(controles, intentos);

  const tarjetas = materias
    .map((m) => {
      const pctCerradas = m.cerradasTotal ? Math.round((100 * m.cerradasCorrectas) / m.cerradasTotal) : null;
      const abiertasConfirmadas = m.abiertasCorrectas + m.abiertasParciales + m.abiertasIncorrectas;
      const porCriterio = modelo.filter((el) => el.tipo === "criterio" && el.materiaId === m.materiaId);
      const filasCriterio = porCriterio
        .map((el) => {
          const badge = badgeNivelDominio(el.nivel);
          const textoCorto = el.criterioTexto.length > 90 ? el.criterioTexto.slice(0, 87) + "…" : el.criterioTexto;
          return `
          <div class="fila-botones" style="justify-content:space-between; align-items:center; padding:0.35rem 0; border-top:1px solid var(--borde);">
            <span style="flex:1;">${badge.emoji} <strong>${escapeHtml(el.criterioCodigo)}</strong> — ${escapeHtml(textoCorto)} <span class="pastilla ${badge.clase}">${badge.etiqueta}</span></span>
            <button type="button" class="btn-texto" data-accion="ver-explicabilidad" data-clave="${escapeHtml(el.clave)}">¿Por qué?</button>
          </div>`;
        })
        .join("");
      return `
      <div class="tarjeta" style="margin-bottom:0.6rem;">
        <h3 style="margin-top:0;">${escapeHtml(m.materiaNombre)}</h3>
        ${
          pctCerradas === null
            ? ""
            : `<p>✅ Preguntas cerradas: <strong>${m.cerradasCorrectas}/${m.cerradasTotal} correctas (${pctCerradas}%)</strong></p>`
        }
        ${
          abiertasConfirmadas
            ? `<p>🧠➜✅ Preguntas abiertas confirmadas: <strong>${abiertasConfirmadas}</strong> (${m.abiertasCorrectas} correcta${m.abiertasCorrectas === 1 ? "" : "s"}, ${m.abiertasParciales} parcial${m.abiertasParciales === 1 ? "" : "es"}, ${m.abiertasIncorrectas} incorrecta${m.abiertasIncorrectas === 1 ? "" : "s"})</p>`
            : ""
        }
        ${
          m.abiertasPendientes
            ? `<p class="ayuda-campo">${m.abiertasPendientes} pregunta${m.abiertasPendientes === 1 ? "" : "s"} abierta${m.abiertasPendientes === 1 ? "" : "s"} todavía pendiente${m.abiertasPendientes === 1 ? "" : "s"} de que la Familia confirme la calificación: no cuenta${m.abiertasPendientes === 1 ? "" : "n"} todavía en este progreso.</p>`
            : ""
        }
        ${
          filasCriterio
            ? `<p class="ayuda-campo" style="margin-bottom:0;"><strong>Por criterio de evaluación (currículo verificado):</strong></p>${filasCriterio}`
            : ""
        }
      </div>`;
    })
    .join("");

  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>📈 Progreso</h2>
        <p class="ayuda-campo">
          Solo se cuenta lo que ya está corregido con seguridad: las preguntas cerradas (siempre) y las
          preguntas abiertas una vez que la Familia ha confirmado su calificación. Cuando una pregunta está
          vinculada a un criterio de evaluación verificado (Fase 5), el progreso se muestra también con ese
          nivel de detalle, con un botón "¿Por qué?" que explica la evidencia detrás de cada valoración
          (apartado 9.3).
        </p>
        <button type="button" class="btn-secundario" data-accion="ir-estudiar-hoy">📅 Hoy tengo que estudiar</button>
      </section>
      ${
        sugerenciasPendientes.length
          ? `<p class="aviso">💡 Hay ${sugerenciasPendientes.length} sugerencia${sugerenciasPendientes.length === 1 ? "" : "s"} de adaptación esperando tu respuesta. <button type="button" class="btn-texto" data-accion="ir-accesibilidad-sugerencias">Verla${sugerenciasPendientes.length === 1 ? "" : "s"}</button></p>`
          : ""
      }
      ${
        materias.length
          ? tarjetas
          : `<p class="aviso">Todavía no hay ningún control entregado para calcular el progreso.</p>`
      }
    `)
  );
  wireCabeceraYNav();
  onAll('[data-accion="ver-explicabilidad"]', "click", (ev) => {
    pintarExplicabilidad(perfil, ev.currentTarget.getAttribute("data-clave"));
  });
  on('[data-accion="ir-estudiar-hoy"]', "click", () => pintarEstudiarHoy());
  on('[data-accion="ir-accesibilidad-sugerencias"]', "click", () => pintarAccesibilidad());
}

/** Fase 5, apartado 9.3: panel de explicabilidad — la evidencia concreta detrás
 * de cualquier nivel de dominio mostrado al alumno o a la Familia. */
async function pintarExplicabilidad(perfil, clave) {
  const [controles, intentos] = await Promise.all([db.listarControles(perfil.id), db.listarIntentos(perfil.id)]);
  const modelo = modeloEducativo.calcularModeloEducativo(controles, intentos);
  const el = modelo.find((m) => m.clave === clave);
  const badge = el ? badgeNivelDominio(el.nivel) : null;

  render(
    cabeceraYNavHtml(`
      <main class="pantalla" aria-labelledby="titulo-explicabilidad">
        <section class="tarjeta">
          <h2 id="titulo-explicabilidad">🔍 ¿Por qué te recomendamos esto?</h2>
          ${
            el
              ? `
            <p><span class="pastilla ${badge.clase}">${badge.emoji} ${escapeHtml(badge.etiqueta)}</span></p>
            <p>${escapeHtml(modeloEducativo.construirConclusion(el))}</p>
            <p class="ayuda-campo">
              Evidencia considerada: ${el.total} pregunta${el.total === 1 ? "" : "s"} corregida${el.total === 1 ? "" : "s"} con
              seguridad (las cerradas siempre cuentan; las abiertas, solo una vez que la Familia confirma la
              calificación), con ${el.puntos} punto${el.puntos === 1 ? "" : "s"} de acierto en total (una respuesta
              "parcial" confirmada suma medio punto). Confianza de esta estimación: <strong>${el.confianza}</strong>,
              según cuántas observaciones hay todavía.
            </p>
            <p class="ayuda-campo">Última observación: ${new Date(el.ultimaObservacion).toLocaleDateString("es-ES")}.</p>
          `
              : `<p class="aviso">No se ha encontrado información para este elemento: puede que el control asociado se haya eliminado desde entonces.</p>`
          }
          <button type="button" class="btn-secundario" data-accion="volver-progreso">Volver a Progreso</button>
        </section>
      </main>
    `)
  );
  wireCabeceraYNav();
  on('[data-accion="volver-progreso"]', "click", () => pintarPestanaProgreso());
}

/**
 * Fase 5, apartado 9.2 (nivel "sugerido"): detecta candidatas nuevas a partir
 * del modelo educativo actual y las persiste como sugerencias "pendiente".
 * Es intencionadamente conservador — como mucho una sugerencia nueva por
 * criterio/materia con dificultad detectada, nunca se repite para la misma
 * clave — y NUNCA aplica nada por sí sola: solo dispone la propuesta para
 * que el alumno o la Familia la acepten o la rechacen explícitamente.
 */
async function sincronizarSugerenciasAdaptacion(perfil) {
  const [controles, intentos, sugerenciasExistentes] = await Promise.all([
    db.listarControles(perfil.id),
    db.listarIntentos(perfil.id),
    db.listarSugerenciasAdaptacion(perfil.id),
  ]);
  const modelo = modeloEducativo.calcularModeloEducativo(controles, intentos);
  const candidatas = modeloEducativo.detectarSugerenciasCandidatas(modelo, sugerenciasExistentes);
  for (const c of candidatas) {
    await db.guardarSugerenciaAdaptacion({ perfilId: perfil.id, ...c });
  }
  return candidatas.length ? db.listarSugerenciasAdaptacion(perfil.id) : sugerenciasExistentes;
}

/** Fase 5, apartado 9.1: configuración de accesibilidad. Nivel "manual" (el
 * alumno o la Familia cambian un ajuste directamente) y nivel "sugerido"
 * (aceptar/rechazar una propuesta con su evidencia) en la misma pantalla;
 * el nivel "automático" del apartado 9.2 se deja fuera de esta entrega, ver
 * LEEME.md. */
/** Tarjeta de una sugerencia de adaptación pendiente (compartida entre la pantalla de
 * Accesibilidad del propio perfil y la vista de Adaptaciones del Panel de la Familia, Fase 6). */
function tarjetaSugerenciaAdaptacionHtml(s) {
  const etiquetas = s.adaptaciones.map((clave) => modeloEducativo.CATALOGO_ADAPTACIONES[clave]?.etiqueta || clave).join(", ");
  return `
      <div class="tarjeta" data-sugerencia="${s.id}" style="margin-bottom:0.6rem; border-color:var(--acento);">
        <p><strong>💡 ${escapeHtml(s.materiaNombre)}${s.criterioTexto ? ` — ${escapeHtml(s.criterioTexto.length > 80 ? s.criterioTexto.slice(0, 77) + "…" : s.criterioTexto)}` : ""}</strong></p>
        <p>${escapeHtml(s.evidencia.conclusion)}</p>
        <p class="ayuda-campo">Adaptación propuesta: ${escapeHtml(etiquetas)}. Nunca se aplica sin confirmación, y se puede desactivar cuando quieras.</p>
        <div class="fila-botones">
          <button type="button" class="btn-primario" data-accion="aceptar-sugerencia" data-id="${s.id}">Sí, probarlo</button>
          <button type="button" class="btn-secundario" data-accion="rechazar-sugerencia" data-id="${s.id}">No, gracias</button>
        </div>
      </div>`;
}

/** Campos del formulario de ajustes de accesibilidad (sin el <form> ni los botones, para
 * poder reutilizarlos tanto dentro del perfil como desde el Panel de la Familia, Fase 6). */
function bloqueAjustesAccesibilidadHtml(ajustes) {
  return `
          <h2 style="margin-top:0; font-size:1.05rem;">🔤 Lectura</h2>
          <div class="campo">
            <label for="ax-tamano-letra">Tamaño de letra</label>
            <select id="ax-tamano-letra">
              <option value="normal" ${ajustes.tamanoLetra === "normal" ? "selected" : ""}>Normal</option>
              <option value="grande" ${ajustes.tamanoLetra === "grande" ? "selected" : ""}>Grande</option>
              <option value="muy_grande" ${ajustes.tamanoLetra === "muy_grande" ? "selected" : ""}>Muy grande</option>
            </select>
          </div>
          <div class="campo">
            <label for="ax-tema">Tema</label>
            <select id="ax-tema">
              <option value="normal" ${ajustes.tema === "normal" ? "selected" : ""}>Normal (según el sistema)</option>
              <option value="oscuro" ${ajustes.tema === "oscuro" ? "selected" : ""}>Oscuro</option>
              <option value="alto_contraste" ${ajustes.tema === "alto_contraste" ? "selected" : ""}>Alto contraste</option>
            </select>
          </div>
          <div class="campo">
            <label for="ax-espaciado">Espaciado del texto</label>
            <select id="ax-espaciado">
              <option value="normal" ${ajustes.espaciado === "normal" ? "selected" : ""}>Normal</option>
              <option value="amplio" ${ajustes.espaciado === "amplio" ? "selected" : ""}>Amplio</option>
            </select>
          </div>

          <h2 style="font-size:1.05rem;">🧩 Comprensión</h2>
          <label style="font-weight:400; display:flex; gap:0.5rem; align-items:center;">
            <input type="checkbox" id="ax-lenguaje-simplificado" ${ajustes.lenguajeSimplificado ? "checked" : ""} />
            Lenguaje más sencillo en las explicaciones de la IA (Mi profesor, pistas, corrección de controles)
          </label>
          <label style="font-weight:400; display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem;">
            <input type="checkbox" id="ax-instrucciones-fragmentadas" ${ajustes.instruccionesFragmentadas ? "checked" : ""} />
            Mostrar las instrucciones paso a paso en vez de en un solo párrafo
          </label>

          <h2 style="font-size:1.05rem;">🎯 Atención</h2>
          <label style="font-weight:400; display:flex; gap:0.5rem; align-items:center;">
            <input type="checkbox" id="ax-menos-estimulos" ${ajustes.menosEstimulos ? "checked" : ""} />
            Modo con menos estímulos (sin animaciones ni transiciones)
          </label>

          <h2 style="font-size:1.05rem;">✍️ Escritura</h2>
          <label style="font-weight:400; display:flex; gap:0.5rem; align-items:center;">
            <input type="checkbox" id="ax-voz-por-defecto" ${ajustes.vozPorDefecto ? "checked" : ""} />
            Destacar el dictado por voz como forma de responder preferente
          </label>`;
}

function leerAjustesAccesibilidadDesdeDOM() {
  return {
    tamanoLetra: appEl.querySelector("#ax-tamano-letra").value,
    tema: appEl.querySelector("#ax-tema").value,
    espaciado: appEl.querySelector("#ax-espaciado").value,
    lenguajeSimplificado: appEl.querySelector("#ax-lenguaje-simplificado").checked,
    instruccionesFragmentadas: appEl.querySelector("#ax-instrucciones-fragmentadas").checked,
    menosEstimulos: appEl.querySelector("#ax-menos-estimulos").checked,
    vozPorDefecto: appEl.querySelector("#ax-voz-por-defecto").checked,
  };
}

async function pintarAccesibilidad() {
  const perfil = estado.perfilActivo;
  const configActual = await db.obtenerConfigAccesibilidad(perfil.id);
  const ajustes = { ...DEFAULT_AJUSTES_ACCESIBILIDAD, ...(configActual?.ajustes || {}) };
  const sugerencias = await sincronizarSugerenciasAdaptacion(perfil);
  const pendientes = sugerencias.filter((s) => s.estado === "pendiente");
  const filasSugerencias = pendientes.map(tarjetaSugerenciaAdaptacionHtml).join("");

  render(
    cabeceraYNavHtml(`
      <main class="pantalla" aria-labelledby="titulo-accesibilidad">
        <section class="tarjeta">
          <h1 id="titulo-accesibilidad">⚙️ Accesibilidad</h1>
          <p class="ayuda-campo">
            Un subconjunto real de las adaptaciones del documento de arquitectura (apartado 9.1): cada ajuste
            que ves aquí cambia de verdad la app al instante, nada es decorativo. Se guarda por perfil.
          </p>
        </section>

        ${pendientes.length ? `<section><h2 style="font-size:1.05rem;">Sugerencias para ${escapeHtml(perfil.nombre)}</h2>${filasSugerencias}</section>` : ""}

        <form id="form-accesibilidad" class="tarjeta">
          ${bloqueAjustesAccesibilidadHtml(ajustes)}
          <div class="fila-botones" style="margin-top:1rem;">
            <button type="submit" class="btn-primario">Guardar</button>
            <button type="button" class="btn-secundario" data-accion="volver-accesibilidad">Volver</button>
          </div>
        </form>
      </main>
    `)
  );
  wireCabeceraYNav();

  on('[data-accion="volver-accesibilidad"]', "click", () => pintarAppPrincipal());

  onAll('[data-accion="aceptar-sugerencia"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    const sugerencia = pendientes.find((s) => s.id === id);
    await db.responderSugerenciaAdaptacion(id, "aceptada");
    if (sugerencia) {
      const cambios = {};
      for (const clave of sugerencia.adaptaciones) cambios[clave] = true;
      await db.guardarConfigAccesibilidad(perfil.id, cambios, {
        nivel: "sugerido",
        justificacion: sugerencia.evidencia.conclusion,
      });
      const nuevaConfig = await db.obtenerConfigAccesibilidad(perfil.id);
      aplicarAjustesAccesibilidad(nuevaConfig?.ajustes);
    }
    pintarAccesibilidad();
  });
  onAll('[data-accion="rechazar-sugerencia"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    await db.responderSugerenciaAdaptacion(id, "rechazada");
    pintarAccesibilidad();
  });

  on("#form-accesibilidad", "submit", async (ev) => {
    ev.preventDefault();
    const nuevosAjustes = leerAjustesAccesibilidadDesdeDOM();
    const nuevaConfig = await db.guardarConfigAccesibilidad(perfil.id, nuevosAjustes, {
      nivel: "manual",
      justificacion: "Cambiado directamente por el alumno o la Familia en Configuración de accesibilidad.",
    });
    aplicarAjustesAccesibilidad(nuevaConfig.ajustes);
    pintarAppPrincipal();
  });
}

// ---------- Fase 7 (apartados 2.2 y 17): Gamificación ----------
//
// Se construye deliberadamente en último lugar, tal como pide el propio
// documento ("cuando ya existen datos reales de uso para calibrarla"): en
// una instalación recién empezada los puntos y logros arrancan en cero y
// van reflejando la actividad real desde ese momento, sin datos inventados.

/** Nombre del logro/racha en texto SIEMPRE junto al emoji (nunca solo color, apartado 12.3/35),
 * y sin ninguna barra de tiempo ni cronómetro (la gamificación no depende de velocidad de
 * reacción). */
async function pintarPestanaLogros() {
  const perfil = estado.perfilActivo;
  const [controles, intentos, revisiones] = await Promise.all([
    db.listarControles(perfil.id),
    db.listarIntentos(perfil.id),
    db.listarRepasoFlashcards(perfil.id),
  ]);
  const hoyStr = new Date().toISOString().slice(0, 10);
  const g = gamificacion.calcularGamificacion({ controles, intentos, revisiones, hoyStr });
  const dias = Array.from(gamificacion.diasConActividad(intentos, revisiones));
  const calendario = gamificacion.calcularCalendarioActividad(dias, hoyStr, 14);

  const logrosIds = new Set(g.logros.map((l) => l.id));
  const tarjetasLogros = gamificacion.CATALOGO_LOGROS.map((l) => {
    const conseguido = logrosIds.has(l.id);
    return `
      <div class="tarjeta" style="margin-bottom:0.5rem; opacity:${conseguido ? "1" : "0.5"};">
        <p style="margin:0;">${l.emoji} <strong>${escapeHtml(l.etiqueta)}</strong> ${conseguido ? '<span class="pastilla verificado">Conseguido</span>' : '<span class="pastilla pendiente">Todavía no</span>'}</p>
        <p class="ayuda-campo" style="margin-bottom:0;">${escapeHtml(l.descripcion)}</p>
      </div>`;
  }).join("");

  const racha = g.racha;
  let textoRacha;
  if (racha.rachaActual > 0) {
    textoRacha = `🔥 Racha actual: <strong>${racha.rachaActual} día${racha.rachaActual === 1 ? "" : "s"}</strong>${racha.enGracia ? " — ayer no hubo actividad, pero hoy todavía se puede seguir la racha." : ""}`;
  } else if (racha.mejorRacha > 0) {
    textoRacha = `Hoy empieza una racha nueva. Tu mejor racha hasta ahora fue de <strong>${racha.mejorRacha} día${racha.mejorRacha === 1 ? "" : "s"}</strong>, y ese récord no se pierde.`;
  } else {
    textoRacha = "Todavía no hay ninguna racha empezada: en cuanto entregues un control o repases una flashcard, empieza a contar.";
  }

  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>🏆 Logros de ${escapeHtml(perfil.nombre)}</h2>
        <p class="ayuda-campo">
          Los puntos y los logros premian el esfuerzo, la constancia y la mejora real — nunca el tiempo que
          pasas dentro de la app ni solo acertar. Perder un día no rompe la racha; solo dos días seguidos sin
          nada de actividad la reinician, y siempre con calma: ningún aviso de urgencia, y tu mejor racha
          histórica queda guardada para siempre.
        </p>
        <p style="font-size:1.3rem; margin:0.3rem 0;">⭐ Nivel ${g.nivel} <span class="ayuda-campo" style="font-size:0.85rem;">(${g.puntosTotales} puntos en total)</span></p>
        <p class="ayuda-campo">${textoRacha}</p>
      </section>
      <section class="tarjeta">
        <h2 style="font-size:1.05rem;">¿De dónde salen los puntos?</h2>
        <p>💪 Esfuerzo (preguntas respondidas): <strong>${g.puntosEsfuerzo}</strong></p>
        <p>🗓️ Constancia (${g.stats.diasActivos} día${g.stats.diasActivos === 1 ? " distinto" : "s distintos"} con actividad): <strong>${g.puntosConstancia}</strong></p>
        <p>📈 Mejora real (superar tu resultado anterior en la misma materia, ${g.stats.mejoras} vez${g.stats.mejoras === 1 ? "" : "es"}): <strong>${g.puntosMejora}</strong></p>
      </section>
      <section class="tarjeta">
        <h2 style="font-size:1.05rem;">📅 Actividad de los últimos 14 días</h2>
        <div style="display:flex; gap:0.25rem; flex-wrap:wrap;" aria-hidden="true">
          ${calendario.map((d) => `<span title="${d.fecha}" style="width:1.6rem; height:1.6rem; display:flex; align-items:center; justify-content:center; border-radius:0.3rem; background:${d.actividad ? "var(--acento, #4a7)" : "var(--borde, #ddd)"};">${d.actividad ? "✅" : ""}</span>`).join("")}
        </div>
        <p class="ayuda-campo" data-calendario-actividad>
          ${calendario.filter((d) => d.actividad).length} de los últimos 14 días con actividad real.
        </p>
      </section>
      <section>
        <h2 style="font-size:1.05rem;">Insignias</h2>
        ${tarjetasLogros}
      </section>
    `)
  );
  wireCabeceraYNav();
}

// ---------- Fase 6 (apartados 8.1, 9, 17 y 31): Panel de la Familia como "Profesor" ----------
//
// La Fase 3 ya deja crear controles y confirmar calificaciones desde el
// Panel de la Familia; la Fase 6 añade las dos piezas que faltaban del rol
// Profesor (apartado 8.1: "puede actuar además como Profesor sobre esos
// mismos perfiles, sin que eso implique una cuenta ni un rol distinto") sin
// tener que entrar en la sesión de cada hijo/a: un informe de progreso
// (apartado 2.2, "Panel de familias e informes", sobre el mismo modelo
// educativo de la Fase 5) y la gestión de sus adaptaciones de accesibilidad.
// Es DELIBERADAMENTE la misma pantalla de Accesibilidad, no una copia con
// lógica distinta: solo cambia desde dónde se entra y a dónde se vuelve.

/** Informe de progreso de un hijo/a para la Familia (apartado 2.2 y 9.3): la misma fuente de
 * datos y el mismo modelo educativo que ve el propio alumno en Progreso, pero accesible sin
 * tener que entrar en su perfil, y con la evidencia siempre visible (no oculta tras "¿Por
 * qué?"), porque aquí quien mira ya es la persona autorizada a ver el detalle completo. */
async function pintarInformeFamilia(perfil) {
  const [controles, intentos] = await Promise.all([db.listarControles(perfil.id), db.listarIntentos(perfil.id)]);
  const modelo = modeloEducativo.calcularModeloEducativo(controles, intentos);
  const porCriterio = modelo.filter((el) => el.tipo === "criterio");
  const porMateriaSinCriterio = modelo.filter((el) => el.tipo === "materia");

  function filaElemento(el) {
    const badge = badgeNivelDominio(el.nivel);
    const titulo = el.tipo === "criterio" ? `${escapeHtml(el.criterioCodigo)} — ${escapeHtml(el.criterioTexto)}` : escapeHtml(el.materiaNombre);
    return `
      <div class="tarjeta" style="margin-bottom:0.5rem;">
        <p style="margin-top:0;"><span class="pastilla ${badge.clase}">${badge.emoji} ${escapeHtml(badge.etiqueta)}</span> <strong>${titulo}</strong>${el.tipo === "criterio" ? ` <span class="ayuda-campo">(${escapeHtml(el.materiaNombre)})</span>` : ""}</p>
        <p class="ayuda-campo">${escapeHtml(modeloEducativo.construirConclusion(el))}</p>
      </div>`;
  }

  render(`
    <main class="pantalla" aria-labelledby="titulo-informe">
      <h1 id="titulo-informe">📊 Informe de ${escapeHtml(perfil.nombre)}</h1>
      <p class="ayuda-campo">
        Calculado en vivo a partir de sus controles entregados (apartado 5.3): las preguntas cerradas cuentan
        siempre, las abiertas solo una vez que confirmas su calificación. Este informe muestra el mismo
        modelo que ve ${escapeHtml(perfil.nombre)} en su propia pestaña Progreso.
      </p>
      ${
        porCriterio.length
          ? `<section><h2 style="font-size:1.05rem;">Por criterio de evaluación</h2>${porCriterio.map(filaElemento).join("")}</section>`
          : ""
      }
      ${
        porMateriaSinCriterio.length
          ? `<section><h2 style="font-size:1.05rem;">Por materia (sin criterio vinculado)</h2>${porMateriaSinCriterio.map(filaElemento).join("")}</section>`
          : ""
      }
      ${modelo.length === 0 ? `<p class="aviso">Todavía no hay ningún control entregado por ${escapeHtml(perfil.nombre)} para calcular un informe.</p>` : ""}
      <div class="fila-botones">
        <button type="button" class="btn-secundario" data-accion="volver-panel">Volver al Panel de la Familia</button>
      </div>
    </main>
  `);
  on('[data-accion="volver-panel"]', "click", () => pintarPanelFamilia());
}

/** Gestión de las adaptaciones de accesibilidad de un hijo/a desde el Panel de la Familia
 * (apartado 8.1: "gestión de adaptaciones por hijo/a"), sin tener que entrar en su perfil.
 * Reutiliza el mismo formulario y el mismo catálogo de sugerencias que la pantalla de
 * Accesibilidad del propio alumno (pintarAccesibilidad) — es la misma configuración, solo con
 * otra puerta de entrada y de salida. A diferencia de esa pantalla, aquí NO se llama a
 * aplicarAjustesAccesibilidad(): no hay ningún perfil "activo" en este contexto (el Panel de la
 * Familia se abre sin entrar en ningún hijo/a), así que cambiar el atributo global de <html>
 * aquí podría aplicarse por error al perfil que estuviera activo antes. El ajuste se guarda en
 * su ficha y se aplicará solo la próxima vez que ese hijo/a entre en su propio perfil. */
async function pintarAdaptacionesFamilia(perfil) {
  const configActual = await db.obtenerConfigAccesibilidad(perfil.id);
  const ajustes = { ...DEFAULT_AJUSTES_ACCESIBILIDAD, ...(configActual?.ajustes || {}) };
  const sugerencias = await sincronizarSugerenciasAdaptacion(perfil);
  const pendientes = sugerencias.filter((s) => s.estado === "pendiente");
  const filasSugerencias = pendientes.map(tarjetaSugerenciaAdaptacionHtml).join("");

  render(`
    <main class="pantalla" aria-labelledby="titulo-adaptaciones-familia">
      <h1 id="titulo-adaptaciones-familia">⚙️ Adaptaciones de ${escapeHtml(perfil.nombre)}</h1>
      <p class="ayuda-campo">
        Los mismos ajustes reales de accesibilidad que ${escapeHtml(perfil.nombre)} puede cambiar desde su
        propio perfil (apartado 9.1), gestionados aquí directamente por la Familia. Se aplicarán la próxima
        vez que ${escapeHtml(perfil.nombre)} entre en su perfil.
      </p>
      ${pendientes.length ? `<section><h2 style="font-size:1.05rem;">Sugerencias pendientes</h2>${filasSugerencias}</section>` : ""}
      <form id="form-accesibilidad-familia" class="tarjeta">
        ${bloqueAjustesAccesibilidadHtml(ajustes)}
        <div class="fila-botones" style="margin-top:1rem;">
          <button type="submit" class="btn-primario">Guardar</button>
          <button type="button" class="btn-secundario" data-accion="volver-panel">Volver al Panel de la Familia</button>
        </div>
      </form>
    </main>
  `);

  on('[data-accion="volver-panel"]', "click", () => pintarPanelFamilia());
  onAll('[data-accion="aceptar-sugerencia"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    const sugerencia = pendientes.find((s) => s.id === id);
    await db.responderSugerenciaAdaptacion(id, "aceptada");
    if (sugerencia) {
      const cambios = {};
      for (const clave of sugerencia.adaptaciones) cambios[clave] = true;
      await db.guardarConfigAccesibilidad(perfil.id, cambios, {
        nivel: "sugerido",
        justificacion: sugerencia.evidencia.conclusion,
      });
    }
    pintarAdaptacionesFamilia(perfil);
  });
  onAll('[data-accion="rechazar-sugerencia"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    await db.responderSugerenciaAdaptacion(id, "rechazada");
    pintarAdaptacionesFamilia(perfil);
  });
  on("#form-accesibilidad-familia", "submit", async (ev) => {
    ev.preventDefault();
    const nuevosAjustes = leerAjustesAccesibilidadDesdeDOM();
    await db.guardarConfigAccesibilidad(perfil.id, nuevosAjustes, {
      nivel: "manual",
      justificacion: `Cambiado por la Familia desde su Panel, sin entrar en el perfil de ${perfil.nombre}.`,
    });
    pintarPanelFamilia();
  });
}

// ---------- "📅 Hoy tengo que estudiar" (Fase 5, apartado 2.2: motor de planificación) ----------
//
// Alcance deliberadamente reducido respecto al apartado 2.2 completo: la
// "ruta de aprendizaje" completa (diagnóstico → concepto → representación
// visual → manipulación → ejercicio → aplicación → repaso → evaluación →
// refuerzo) da por hecho manipulativos digitales y varias representaciones
// que todavía no existen como funcionalidad en esta app; se aplaza a una
// fase posterior (ver LEEME.md). Esta vista cubre en cambio la otra mitad
// del apartado 2.2, "repetición espaciada, recuperación activa, práctica
// distribuida y feedback inmediato", con datos 100% reales: flashcards ya
// creadas en "Crear", contenidos con dificultad ya detectada (mismo modelo
// educativo que Progreso) y controles con fecha límite próxima.

/** Repetición espaciada simplificada (SM-2 reducido, ver db.js#registrarRepasoFlashcard).
 * Devuelve la cola de flashcards que tocan hoy: las que nunca se han repasado
 * y las que ya han superado su fecha de próxima revisión. */
async function construirColaFlashcardsHoy(perfil) {
  const recursos = (await db.listarRecursos(perfil.id)).filter((r) => r.tipo === "flashcards");
  const repasos = await db.listarRepasoFlashcards(perfil.id);
  const repasoPorClave = new Map(repasos.map((r) => [`${r.recursoId}::${r.indiceFlashcard}`, r]));
  const ahora = new Date();
  const cola = [];
  for (const r of recursos) {
    (r.contenido || []).forEach((ficha, indice) => {
      const repaso = repasoPorClave.get(`${r.id}::${indice}`);
      const debeRepasarse = !repaso || new Date(repaso.proximaRevision) <= ahora;
      if (debeRepasarse) {
        cola.push({ recursoId: r.id, indiceFlashcard: indice, materiaNombre: r.materiaNombre, ficha, nunca: !repaso });
      }
    });
  }
  return cola;
}

async function pintarEstudiarHoy() {
  const perfil = estado.perfilActivo;
  if (!estado.estudiarHoy) {
    const cola = await construirColaFlashcardsHoy(perfil);
    estado.estudiarHoy = { cola, indice: 0, mostrarRespuesta: false };
  }
  const eh = estado.estudiarHoy;
  if (eh.indice >= eh.cola.length) eh.indice = 0;

  const [controles, intentos] = await Promise.all([db.listarControles(perfil.id), db.listarIntentos(perfil.id)]);
  const modelo = modeloEducativo.calcularModeloEducativo(controles, intentos);
  const paraReforzar = modelo.filter((el) => el.nivel === "con_dificultad");

  const ahora = new Date();
  const controlesProximos = controles
    .filter((c) => c.fechaLimite)
    .map((c) => ({ ...c, diasRestantes: Math.ceil((new Date(`${c.fechaLimite}T23:59:59`) - ahora) / (24 * 60 * 60 * 1000)) }))
    .filter((c) => c.diasRestantes <= 7)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  const ficha = eh.cola[eh.indice];

  render(
    cabeceraYNavHtml(`
      <main class="pantalla" aria-labelledby="titulo-estudiar-hoy">
        <section class="tarjeta">
          <h1 id="titulo-estudiar-hoy">📅 Hoy tengo que estudiar</h1>
          <p class="ayuda-campo">
            Repetición espaciada de tus flashcards, contenidos para reforzar y controles próximos — calculado
            a partir de lo que ya has hecho, sin inventar nada nuevo.
          </p>
        </section>

        <section class="tarjeta">
          <h2 style="margin-top:0; font-size:1.05rem;">🃏 Flashcards pendientes de repasar (${eh.cola.length})</h2>
          ${
            !eh.cola.length
              ? `<p class="aviso">No hay ninguna flashcard pendiente de repaso hoy. ¡Buen trabajo!</p>`
              : `
            <p class="ayuda-campo" data-contador-cola>${escapeHtml(ficha.materiaNombre)} · ficha ${eh.indice + 1} de ${eh.cola.length}${ficha.nunca ? " · todavía no repasada" : ""}</p>
            <div class="tarjeta" style="min-height:6rem; background:var(--fondo);">
              <p data-pregunta-hoy><strong>${escapeHtml(ficha.ficha.pregunta || "")}</strong></p>
              ${eh.mostrarRespuesta ? `<p data-respuesta-hoy style="margin-top:0.6rem;">${escapeHtml(ficha.ficha.respuesta || "")}</p>` : ""}
            </div>
            ${
              eh.mostrarRespuesta
                ? `
              <p class="ayuda-campo">¿Qué tal te ha salido?</p>
              <div class="fila-botones">
                <button type="button" class="btn-secundario" data-accion="repasar-resultado" data-resultado="otra_vez">😵 Otra vez</button>
                <button type="button" class="btn-secundario" data-accion="repasar-resultado" data-resultado="dificil">😕 Difícil</button>
                <button type="button" class="btn-secundario" data-accion="repasar-resultado" data-resultado="normal">🙂 Normal</button>
                <button type="button" class="btn-secundario" data-accion="repasar-resultado" data-resultado="facil">😄 Fácil</button>
              </div>`
                : `<button type="button" class="btn-primario" data-accion="ver-respuesta-hoy">Ver respuesta</button>`
            }
          `
          }
        </section>

        ${
          paraReforzar.length
            ? `
          <section class="tarjeta">
            <h2 style="margin-top:0; font-size:1.05rem;">🎯 Para reforzar</h2>
            ${paraReforzar
              .map(
                (el) => `
              <p>🟠 ${el.tipo === "criterio" ? escapeHtml(el.criterioTexto) : escapeHtml(el.materiaNombre)}
                <button type="button" class="btn-texto" data-accion="ver-explicabilidad-hoy" data-clave="${escapeHtml(el.clave)}">¿Por qué?</button></p>`
              )
              .join("")}
          </section>`
            : ""
        }

        ${
          controlesProximos.length
            ? `
          <section class="tarjeta">
            <h2 style="margin-top:0; font-size:1.05rem;">📝 Controles próximos</h2>
            ${controlesProximos
              .map(
                (c) => `
              <p>${c.diasRestantes < 0 ? `⚠️ Venció hace ${Math.abs(c.diasRestantes)} día${Math.abs(c.diasRestantes) === 1 ? "" : "s"}` : c.diasRestantes === 0 ? "⚠️ Hoy" : `En ${c.diasRestantes} día${c.diasRestantes === 1 ? "" : "s"}`}:
                <strong>${escapeHtml(c.titulo)}</strong> (${escapeHtml(c.materiaNombre)})</p>`
              )
              .join("")}
          </section>`
            : ""
        }

        <button type="button" class="btn-secundario" data-accion="volver-estudiar-hoy">Volver</button>
      </main>
    `)
  );
  wireCabeceraYNav();

  on('[data-accion="volver-estudiar-hoy"]', "click", () => {
    estado.estudiarHoy = null;
    pintarAppPrincipal();
  });
  on('[data-accion="ver-respuesta-hoy"]', "click", () => {
    eh.mostrarRespuesta = true;
    pintarEstudiarHoy();
  });
  onAll('[data-accion="ver-explicabilidad-hoy"]', "click", (ev) => {
    pintarExplicabilidad(perfil, ev.currentTarget.getAttribute("data-clave"));
  });
  onAll('[data-accion="repasar-resultado"]', "click", async (ev) => {
    const resultado = ev.currentTarget.getAttribute("data-resultado");
    const actual = eh.cola[eh.indice];
    await db.registrarRepasoFlashcard({
      perfilId: perfil.id,
      recursoId: actual.recursoId,
      indiceFlashcard: actual.indiceFlashcard,
      resultado,
    });
    const [tarjetaHecha] = eh.cola.splice(eh.indice, 1);
    if (resultado === "otra_vez") {
      tarjetaHecha.nunca = false;
      eh.cola.push(tarjetaHecha); // vuelve a aparecer más tarde en esta misma sesión
    }
    if (eh.indice >= eh.cola.length) eh.indice = 0;
    eh.mostrarRespuesta = false;
    pintarEstudiarHoy();
  });
}

// ---------- Cuaderno (Fase 4, apartados 2.2 y 17) ----------
//
// Cada página combina trazos libres (el componente de lienzo reutilizable,
// js/lienzo.js) con texto opcional, organizada por materia, tema y
// etiquetas. El texto de una página se puede convertir en un recurso
// (resumen/esquema/flashcards/ejercicios) reutilizando el mismo motor de
// generación de la Fase 2 — es el flujo que el documento original llama
// "Convierte mis apuntes" (apartado 19): apuntes → revisión del alumno →
// texto digital → recursos derivados, con el vínculo guardado en la propia
// página (db.vincularRecursoAPagina).

async function pintarPestanaCuaderno() {
  if (!estado.cuaderno || estado.cuaderno.vista === "lista") return pintarListaCuaderno();
  if (estado.cuaderno.vista === "editor") return pintarEditorPagina();
  return pintarListaCuaderno();
}

async function pintarListaCuaderno() {
  const perfil = estado.perfilActivo;
  const paginas = await db.listarPaginasCuaderno(perfil.id);

  const tarjetas = paginas
    .map(
      (p) => `
      <li class="tarjeta" style="display:flex; justify-content:space-between; align-items:center; gap:0.6rem; flex-wrap:wrap;">
        <div>
          <strong>${escapeHtml(p.materiaNombre)}</strong>${p.tema ? " — " + escapeHtml(p.tema) : ""}
          <div class="ayuda-campo">
            ${new Date(p.creadoEn).toLocaleDateString("es-ES")}
            ${p.etiquetas && p.etiquetas.length ? " · " + p.etiquetas.map((e) => escapeHtml(e)).join(", ") : ""}
            ${p.trazos && p.trazos.length ? " · ✍️ con dibujo" : ""}
          </div>
        </div>
        <span class="fila-botones">
          <button class="btn-secundario" data-accion="abrir-pagina" data-id="${p.id}">Abrir</button>
          <button class="btn-secundario" data-accion="eliminar-pagina" data-id="${p.id}">Eliminar</button>
        </span>
      </li>`
    )
    .join("");

  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>📓 Cuaderno</h2>
        <p class="ayuda-campo">Un espacio libre para escribir y dibujar, organizado por materia y tema.</p>
        <button class="btn-primario" data-accion="nueva-pagina">+ Nueva página</button>
      </section>
      ${
        paginas.length
          ? `<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.6rem;">${tarjetas}</ul>`
          : `<p class="aviso">Todavía no tienes ninguna página en el cuaderno.</p>`
      }
    `)
  );
  wireCabeceraYNav();

  on('[data-accion="nueva-pagina"]', "click", () => {
    estado.cuaderno = { vista: "editor", paginaExistente: null };
    pintarEditorPagina();
  });
  onAll('[data-accion="abrir-pagina"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    const pagina = await db.obtenerPaginaCuaderno(id);
    estado.cuaderno = { vista: "editor", paginaExistente: pagina };
    pintarEditorPagina();
  });
  onAll('[data-accion="eliminar-pagina"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    if (confirm("¿Eliminar esta página del cuaderno? No se puede deshacer.")) {
      await db.eliminarPaginaCuaderno(id);
      pintarListaCuaderno();
    }
  });
}

// Referencia al controlador del lienzo de la página abierta (fuera de estado.cuaderno
// a propósito: no es serializable ni debe sobrevivir a un cambio de perfil por sí solo).
let lienzoCuadernoActivo = null;

async function pintarEditorPagina() {
  const perfil = estado.perfilActivo;
  const existente = estado.cuaderno.paginaExistente;
  const materias = await curriculo.listarMaterias(perfil.etapa);
  const materiasPerfil = materias.filter((m) => (perfil.materias || []).includes(m.id));

  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>${existente ? "Editar página" : "Nueva página"}</h2>
        <div class="campo">
          <label for="materia-pagina">Materia</label>
          <select id="materia-pagina">
            ${materiasPerfil.map((m) => `<option value="${m.id}" ${existente && existente.materiaId === m.id ? "selected" : ""}>${escapeHtml(m.nombre)}</option>`).join("")}
          </select>
        </div>
        <div class="campo">
          <label for="tema-pagina">Tema (opcional)</label>
          <input type="text" id="tema-pagina" autocomplete="off" value="${existente ? escapeHtml(existente.tema || "") : ""}" />
        </div>
        <div class="campo">
          <label for="etiquetas-pagina">Etiquetas (separadas por comas, opcional)</label>
          <input type="text" id="etiquetas-pagina" autocomplete="off" value="${existente ? escapeHtml((existente.etiquetas || []).join(", ")) : ""}" />
        </div>
      </section>
      <section class="tarjeta">
        <p class="ayuda-campo">Dibuja con el dedo o con el lápiz (Apple Pencil vía Pointer Events, adenda v1.4).</p>
        <div class="fila-botones" style="flex-wrap:wrap;">
          ${COLORES_LIENZO.map((c) => `<button type="button" data-color="${c}" style="background:${c}; width:1.8rem; height:1.8rem; border-radius:50%; border:2px solid var(--borde); padding:0;" aria-label="Color ${c}"></button>`).join("")}
          ${GROSORES_LIENZO.map((g) => `<button type="button" class="btn-secundario" data-grosor="${g.id}">${g.nombre}</button>`).join("")}
          <button type="button" class="btn-secundario" data-accion="deshacer-trazo">Deshacer</button>
          <button type="button" class="btn-secundario" data-accion="limpiar-lienzo">Borrar todo</button>
        </div>
        <canvas id="lienzo-cuaderno" width="700" height="350" style="width:100%; max-width:100%; touch-action:none; border:1.5px solid var(--borde); border-radius:0.6rem; background:#fff; display:block; margin-top:0.5rem;"></canvas>
      </section>
      ${
        existente && existente.fotoDataUrl
          ? `<section class="tarjeta">
        <p class="ayuda-campo">Foto guardada en esta página (la pediste guardar explícitamente al escanearla):</p>
        <img src="${existente.fotoDataUrl}" alt="Foto guardada en esta página" style="max-width:100%; max-height:16rem; border-radius:0.6rem;" />
        <div class="fila-botones" style="margin-top:0.5rem;">
          <button type="button" class="btn-texto" data-accion="quitar-foto-pagina">Quitar la foto</button>
        </div>
      </section>`
          : ""
      }
      <section class="tarjeta">
        <label for="texto-pagina">Texto (opcional)</label>
        <textarea id="texto-pagina" rows="6" style="width:100%; font:inherit; padding:0.65rem 0.75rem; border-radius:0.6rem; border:1.5px solid var(--borde);">${existente ? escapeHtml(existente.texto || "") : ""}</textarea>
      </section>
      ${
        existente && existente.materiaId
          ? `<section class="tarjeta">
        <label id="etiqueta-generar-cuaderno">Generar un recurso a partir del texto de esta página</label>
        <div class="fila-botones" role="group" aria-labelledby="etiqueta-generar-cuaderno">
          ${generador.TIPOS_RECURSO.map((t) => `<button type="button" class="btn-secundario" data-generar-tipo="${t.id}">${t.icono} ${t.nombre}</button>`).join("")}
        </div>
      </section>`
          : ""
      }
      <div id="error-pagina" class="error" role="alert" aria-live="polite"></div>
      <div class="fila-botones">
        <button type="button" class="btn-primario" data-accion="guardar-pagina">Guardar</button>
        <button type="button" class="btn-secundario" data-accion="cancelar-pagina">Cancelar</button>
      </div>
    `)
  );
  wireCabeceraYNav();

  if (lienzoCuadernoActivo) lienzoCuadernoActivo.destruir();
  lienzoCuadernoActivo = crearLienzo(appEl.querySelector("#lienzo-cuaderno"), {
    trazosIniciales: existente ? existente.trazos || [] : [],
  });

  onAll("[data-color]", "click", (ev) => lienzoCuadernoActivo.cambiarColor(ev.currentTarget.getAttribute("data-color")));
  onAll("[data-grosor]", "click", (ev) => lienzoCuadernoActivo.cambiarGrosor(Number(ev.currentTarget.getAttribute("data-grosor"))));
  on('[data-accion="deshacer-trazo"]', "click", () => lienzoCuadernoActivo.deshacer());
  on('[data-accion="limpiar-lienzo"]', "click", () => {
    if (confirm("¿Borrar todo el dibujo de esta página?")) lienzoCuadernoActivo.limpiar();
  });

  on('[data-accion="cancelar-pagina"]', "click", () => {
    estado.cuaderno = { vista: "lista" };
    pintarListaCuaderno();
  });

  let quitarFotoPedido = false;
  on('[data-accion="quitar-foto-pagina"]', "click", () => {
    quitarFotoPedido = true;
    appEl.querySelector("#error-pagina").textContent = "";
    const seccionFoto = appEl.querySelector('[data-accion="quitar-foto-pagina"]').closest("section");
    if (seccionFoto) seccionFoto.remove();
  });

  on('[data-accion="guardar-pagina"]', "click", async () => {
    const errorEl = appEl.querySelector("#error-pagina");
    errorEl.textContent = "";
    const materiaSelect = appEl.querySelector("#materia-pagina");
    const materiaId = materiaSelect.value;
    const materiaNombre = materiaSelect.selectedOptions[0]?.textContent || "";
    const tema = appEl.querySelector("#tema-pagina").value.trim();
    const etiquetas = appEl
      .querySelector("#etiquetas-pagina")
      .value.split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const texto = appEl.querySelector("#texto-pagina").value.trim();
    const trazos = lienzoCuadernoActivo.obtenerTrazos();

    if (!materiaId) {
      errorEl.textContent = "Elige una materia.";
      return;
    }
    if (!texto && trazos.length === 0) {
      errorEl.textContent = "Escribe algo o dibuja algo antes de guardar.";
      return;
    }

    // fotoDataUrl se omite (undefined) para no tocar la foto ya guardada, salvo que se haya pedido quitarla.
    const fotoDataUrl = quitarFotoPedido ? null : undefined;
    if (existente) {
      await db.actualizarPaginaCuaderno(existente.id, { materiaId, materiaNombre, tema, etiquetas, texto, trazos, fotoDataUrl });
    } else {
      await db.guardarPaginaCuaderno({ perfilId: perfil.id, materiaId, materiaNombre, tema, etiquetas, texto, trazos });
    }
    estado.cuaderno = { vista: "lista" };
    pintarListaCuaderno();
  });

  if (existente) {
    onAll("[data-generar-tipo]", "click", (ev) => {
      const tipo = ev.currentTarget.getAttribute("data-generar-tipo");
      const texto = appEl.querySelector("#texto-pagina").value.trim();
      if (!texto) {
        appEl.querySelector("#error-pagina").textContent = "Esta página todavía no tiene texto para generar un recurso.";
        return;
      }
      const materiaSelect = appEl.querySelector("#materia-pagina");
      estado.crear = {
        vista: "generando",
        tipo,
        materiaId: materiaSelect.value,
        materiaNombre: materiaSelect.selectedOptions[0]?.textContent || "",
        origen: { tipo: "cuaderno", texto, paginaId: existente.id },
        paquetesVerificados: [],
      };
      estado.pestanaActiva = "crear";
      generarRecurso();
    });
  }
}

// ---------- Escanea y aprende (Fase 4, apartados 4, 17 y 15.3) ----------
//
// Foto → reconocimiento de texto (OCR, js/ocr.js) → revisión y edición
// SIEMPRE obligatoria (el reconocimiento puede equivocarse) → generar un
// recurso o guardar en el Cuaderno. La foto se descarta al terminar salvo
// que el Alumno pida explícitamente guardarla también (apartado 15.3:
// "descarte de imágenes... tras la extracción de contenido, salvo guardado
// explícito"), y nunca se sube a ningún servidor: todo ocurre en el propio
// dispositivo, igual que el resto de la aplicación.

async function pintarPestanaEscanear() {
  if (!estado.escanear || estado.escanear.vista === "seleccionar") return pintarSeleccionarFoto();
  if (estado.escanear.vista === "reconociendo") return pintarReconociendoFoto();
  if (estado.escanear.vista === "revisar") return pintarRevisarTextoEscaneado();
  return pintarSeleccionarFoto();
}

function pintarSeleccionarFoto() {
  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>📷 Escanea y aprende</h2>
        <p class="ayuda-campo">
          Fotografía una página de un libro o de tus apuntes: se reconoce el texto para que lo revises
          y lo uses para generar un recurso o guardarlo en el Cuaderno. La foto nunca sale de este
          dispositivo y se descarta en cuanto se extrae el texto, salvo que pidas guardarla también.
        </p>
        <div class="campo">
          <label for="input-foto">Foto o imagen</label>
          <input type="file" id="input-foto" accept="image/*" capture="environment" />
        </div>
        <div id="previsualizacion-foto"></div>
        <div id="error-escanear" class="error" role="alert" aria-live="polite"></div>
        <div class="fila-botones">
          <button type="button" class="btn-primario" data-accion="reconocer-foto" disabled>Reconocer texto</button>
        </div>
      </section>
    `)
  );
  wireCabeceraYNav();

  let archivoElegido = null;
  const inputFoto = appEl.querySelector("#input-foto");
  const previsualizacion = appEl.querySelector("#previsualizacion-foto");
  const botonReconocer = appEl.querySelector('[data-accion="reconocer-foto"]');

  inputFoto.addEventListener("change", () => {
    const archivo = inputFoto.files[0];
    if (!archivo) return;
    archivoElegido = archivo;
    const url = URL.createObjectURL(archivo);
    previsualizacion.innerHTML = `<img src="${url}" alt="Previsualización de la foto elegida" style="max-width:100%; max-height:16rem; border-radius:0.6rem; margin-top:0.5rem;" />`;
    botonReconocer.disabled = false;
  });

  botonReconocer.addEventListener("click", () => {
    if (!archivoElegido) return;
    estado.escanear = { vista: "reconociendo", archivo: archivoElegido, progreso: 0, textoProgreso: "Preparando el reconocimiento de texto…" };
    reconocerFotoActual();
  });
}

function pintarReconociendoFoto() {
  const e = estado.escanear;
  const pct = Math.round((e.progreso || 0) * 100);
  render(
    cabeceraYNavHtml(`
      <section class="tarjeta" aria-live="polite">
        <h2>📷 Reconociendo texto…</h2>
        <p id="texto-progreso-escanear">${escapeHtml(e.textoProgreso || "Preparando…")}</p>
        <div style="background:var(--borde); border-radius:999px; overflow:hidden; height:0.8rem;">
          <div id="barra-progreso-escanear" style="background:var(--azul); height:100%; width:${pct}%; transition:width .2s;"></div>
        </div>
      </section>
    `)
  );
  wireCabeceraYNav();
}

function actualizarBarraProgresoEscanear() {
  const pct = Math.round((estado.escanear.progreso || 0) * 100);
  const barra = appEl.querySelector("#barra-progreso-escanear");
  const texto = appEl.querySelector("#texto-progreso-escanear");
  if (barra) barra.style.width = pct + "%";
  if (texto) texto.textContent = estado.escanear.textoProgreso;
}

async function reconocerFotoActual() {
  pintarReconociendoFoto();
  const e = estado.escanear;
  try {
    const { texto, tipo } = await ocr.reconocerTexto(e.archivo, {
      onProgreso: (info) => {
        if (!estado.escanear) return; // la pantalla pudo cambiar mientras se reconocía el texto
        estado.escanear.progreso = info.progreso;
        estado.escanear.textoProgreso = info.texto || "Reconociendo…";
        actualizarBarraProgresoEscanear();
      },
    });
    e.textoReconocido = texto;
    e.tipoMotorOCR = tipo;
  } catch (err) {
    console.error("No se ha podido reconocer el texto de la imagen:", err);
    e.textoReconocido = "";
    e.errorOCR = err.message;
  }
  e.vista = "revisar";
  pintarRevisarTextoEscaneado();
}

async function pintarRevisarTextoEscaneado() {
  const perfil = estado.perfilActivo;
  const e = estado.escanear;
  const materias = await curriculo.listarMaterias(perfil.etapa);
  const materiasPerfil = materias.filter((m) => (perfil.materias || []).includes(m.id));

  const etiquetaMotorOCR = e.errorOCR
    ? `<span class="pastilla pendiente">⚠️ No se ha podido reconocer el texto: escríbelo a mano abajo</span>`
    : e.tipoMotorOCR === "tesseract"
      ? `<span class="pastilla verificado">📷 Texto reconocido</span>`
      : `<span class="pastilla pendiente">🧪 Motor de prueba (sin OCR real)</span>`;

  render(
    cabeceraYNavHtml(`
      <section class="tarjeta">
        <h2>📷 Revisa el texto reconocido</h2>
        ${etiquetaMotorOCR}
        <p class="ayuda-campo">El reconocimiento de texto puede equivocarse: revisa y corrige el texto antes de usarlo.</p>
        <label for="texto-escaneado" class="visually-hidden">Texto reconocido</label>
        <textarea id="texto-escaneado" rows="8" style="width:100%; font:inherit; padding:0.65rem 0.75rem; border-radius:0.6rem; border:1.5px solid var(--borde);">${escapeHtml(e.textoReconocido || "")}</textarea>
      </section>
      <section class="tarjeta">
        <div class="campo">
          <label for="materia-escaneado">Materia</label>
          <select id="materia-escaneado">
            <option value="" disabled selected>Elige una materia</option>
            ${materiasPerfil.map((m) => `<option value="${m.id}">${escapeHtml(m.nombre)}</option>`).join("")}
          </select>
        </div>
        <label id="etiqueta-generar-escaneado">Generar un recurso a partir de este texto</label>
        <div class="fila-botones" role="group" aria-labelledby="etiqueta-generar-escaneado">
          ${generador.TIPOS_RECURSO.map((t) => `<button type="button" class="btn-secundario" data-generar-tipo-escaneado="${t.id}">${t.icono} ${t.nombre}</button>`).join("")}
        </div>
      </section>
      <section class="tarjeta">
        <label style="font-weight:400; display:flex; gap:0.5rem; align-items:center;">
          <input type="checkbox" id="guardar-foto-tambien" />
          Guardar también la foto en esta página del Cuaderno
        </label>
        <p class="ayuda-campo">Por defecto la foto se descarta en cuanto se extrae el texto: solo se guarda si lo pides explícitamente.</p>
        <div class="fila-botones">
          <button type="button" class="btn-primario" data-accion="guardar-en-cuaderno">Guardar en el Cuaderno</button>
        </div>
      </section>
      <div id="error-escanear-revision" class="error" role="alert" aria-live="polite"></div>
      <div class="fila-botones">
        <button type="button" class="btn-secundario" data-accion="descartar-foto">Descartar y volver a empezar</button>
      </div>
    `)
  );
  wireCabeceraYNav();

  on('[data-accion="descartar-foto"]', "click", () => {
    estado.escanear = { vista: "seleccionar" };
    pintarSeleccionarFoto();
  });

  onAll("[data-generar-tipo-escaneado]", "click", (ev) => {
    const errorEl = appEl.querySelector("#error-escanear-revision");
    errorEl.textContent = "";
    const texto = appEl.querySelector("#texto-escaneado").value.trim();
    if (!texto) {
      errorEl.textContent = "No hay texto para generar un recurso. Revisa o escribe el texto primero.";
      return;
    }
    const materiaSelect = appEl.querySelector("#materia-escaneado");
    if (!materiaSelect.value) {
      errorEl.textContent = "Elige una materia.";
      return;
    }
    const tipo = ev.currentTarget.getAttribute("data-generar-tipo-escaneado");
    estado.crear = {
      vista: "generando",
      tipo,
      materiaId: materiaSelect.value,
      materiaNombre: materiaSelect.selectedOptions[0]?.textContent || "",
      origen: { tipo: "escaneado", texto },
      paquetesVerificados: [],
    };
    estado.pestanaActiva = "crear";
    estado.escanear = { vista: "seleccionar" }; // la foto en memoria se descarta al salir de esta pantalla
    generarRecurso();
  });

  on('[data-accion="guardar-en-cuaderno"]', "click", async () => {
    const errorEl = appEl.querySelector("#error-escanear-revision");
    errorEl.textContent = "";
    const texto = appEl.querySelector("#texto-escaneado").value.trim();
    const materiaSelect = appEl.querySelector("#materia-escaneado");
    if (!texto) {
      errorEl.textContent = "No hay texto que guardar. Revisa o escribe el texto primero.";
      return;
    }
    if (!materiaSelect.value) {
      errorEl.textContent = "Elige una materia.";
      return;
    }
    const guardarFoto = appEl.querySelector("#guardar-foto-tambien").checked;
    let fotoDataUrl = null;
    if (guardarFoto && e.archivo) {
      fotoDataUrl = await new Promise((resolve) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result);
        lector.readAsDataURL(e.archivo);
      });
    }
    await db.guardarPaginaCuaderno({
      perfilId: perfil.id,
      materiaId: materiaSelect.value,
      materiaNombre: materiaSelect.selectedOptions[0]?.textContent || "",
      tema: "",
      etiquetas: ["escaneado"],
      texto,
      trazos: [],
      fotoDataUrl,
    });
    estado.escanear = { vista: "seleccionar" }; // la foto en memoria se descarta (guardarPaginaCuaderno ya tiene su copia si se pidió)
    estado.pestanaActiva = "cuaderno";
    estado.cuaderno = { vista: "lista" };
    pintarPestanaCuaderno();
  });
}

// ---------- Panel de la Familia (protegido por PIN si existe) ----------

async function abrirPanelFamilia() {
  if (estado.familia.pinHash) {
    render(`
      <main class="pantalla" aria-labelledby="titulo-pin">
        <h1 id="titulo-pin">Panel de la Familia</h1>
        <form id="form-pin" class="tarjeta">
          <div class="campo">
            <label for="pin-entrada">Introduce el PIN de la Familia</label>
            <input type="password" id="pin-entrada" inputmode="numeric" autocomplete="off" />
          </div>
          <div id="error-pin" class="error" role="alert" aria-live="polite"></div>
          <div class="fila-botones">
            <button type="submit" class="btn-primario">Entrar</button>
            <button type="button" class="btn-secundario" data-accion="volver">Volver</button>
          </div>
        </form>
      </main>
    `);
    on("#form-pin", "submit", async (ev) => {
      ev.preventDefault();
      const pin = appEl.querySelector("#pin-entrada").value.trim();
      const ok = await cripto.verifyPin(pin, estado.familia.pinHash);
      if (ok) {
        pintarPanelFamilia();
      } else {
        appEl.querySelector("#error-pin").textContent = "PIN incorrecto.";
      }
    });
    on('[data-accion="volver"]', "click", () => pintarSelectorPerfil());
    return;
  }
  pintarPanelFamilia();
}

async function pintarPanelFamilia() {
  const filas = estado.perfiles
    .map(
      (p) => `
      <li class="tarjeta" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;">
        <span>${escapeHtml(p.nombre)} — ${escapeHtml(p.cursoNombre || "")}</span>
        <span class="fila-botones">
          <button class="btn-secundario" data-accion="controles" data-id="${p.id}">📋 Controles</button>
          <button class="btn-secundario" data-accion="informe" data-id="${p.id}">📊 Informe</button>
          <button class="btn-secundario" data-accion="adaptaciones-familia" data-id="${p.id}">⚙️ Adaptaciones</button>
          <button class="btn-secundario" data-accion="editar" data-id="${p.id}">Editar</button>
          <button class="btn-secundario" data-accion="eliminar" data-id="${p.id}">Eliminar</button>
        </span>
      </li>`
    )
    .join("");

  const pendientes = await calificacionesPendientes();

  render(`
    <main class="pantalla" aria-labelledby="titulo-panel">
      <h1 id="titulo-panel">Panel de la Familia</h1>
      <p class="subtitulo">${escapeHtml(estado.familia.nombre)}</p>
      <section class="tarjeta">
        <h2>Perfiles de Alumno</h2>
        <ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.6rem;">
          ${filas || "<li>Todavía no hay perfiles.</li>"}
        </ul>
        <div class="fila-botones" style="margin-top:0.8rem;">
          <button class="btn-primario" data-accion="nuevo-perfil">Añadir perfil</button>
        </div>
      </section>
      <section class="tarjeta">
        <h2>🧠➜✅ Calificaciones pendientes de confirmar</h2>
        <p class="ayuda-campo">
          Las preguntas abiertas de un control las corrige primero la IA, pero esa calificación es
          solo una propuesta: no cuenta para el progreso del alumno hasta que la Familia la confirma
          (o la corrige a mano).
        </p>
        ${
          pendientes.length === 0
            ? `<p class="aviso">No hay ninguna calificación pendiente de confirmar ahora mismo.</p>`
            : `<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.6rem;">
                ${pendientes
                  .map(
                    (it) => `
                  <li class="tarjeta" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;">
                    <span><strong>${escapeHtml(it.perfilNombre)}</strong> — ${escapeHtml(it.controlTitulo)}
                      <span class="ayuda-campo">(${it.numPendientes} pregunta${it.numPendientes === 1 ? "" : "s"} abierta${it.numPendientes === 1 ? "" : "s"} por confirmar)</span>
                    </span>
                    <button class="btn-primario" data-accion="revisar-intento" data-id="${it.id}">Revisar</button>
                  </li>`
                  )
                  .join("")}
              </ul>`
        }
      </section>
      <div class="fila-botones">
        <button class="btn-secundario" data-accion="volver">Volver al selector de perfiles</button>
      </div>
    </main>
  `);

  onAll('[data-accion="editar"]', "click", async (ev) => {
    const id = ev.currentTarget.getAttribute("data-id");
    const perfil = await db.obtenerPerfil(id);
    pintarFormularioPerfil(perfil);
  });
  onAll('[data-accion="eliminar"]', "click", async (ev) => {
    const id = ev.currentTarget.getAttribute("data-id");
    if (confirm("¿Eliminar este perfil? Se borrarán sus datos de este dispositivo.")) {
      await db.eliminarPerfil(id);
      estado.perfiles = await db.listarPerfiles();
      pintarPanelFamilia();
    }
  });
  onAll('[data-accion="controles"]', "click", async (ev) => {
    const id = ev.currentTarget.getAttribute("data-id");
    const perfil = await db.obtenerPerfil(id);
    pintarPanelControles(perfil);
  });
  onAll('[data-accion="informe"]', "click", async (ev) => {
    const id = ev.currentTarget.getAttribute("data-id");
    const perfil = await db.obtenerPerfil(id);
    pintarInformeFamilia(perfil);
  });
  onAll('[data-accion="adaptaciones-familia"]', "click", async (ev) => {
    const id = ev.currentTarget.getAttribute("data-id");
    const perfil = await db.obtenerPerfil(id);
    pintarAdaptacionesFamilia(perfil);
  });
  onAll('[data-accion="revisar-intento"]', "click", (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    pintarRevisionIntento(id);
  });
  on('[data-accion="nuevo-perfil"]', "click", () => pintarFormularioPerfil());
  on('[data-accion="volver"]', "click", () => pintarSelectorPerfil());
}

/** Recorre los intentos de TODOS los perfiles (no solo el activo, porque el Panel
 * de la Familia se abre sin haber entrado en ningún perfil) y devuelve los que
 * tienen al menos una pregunta abierta con propuesta de la IA todavía sin confirmar. */
async function calificacionesPendientes() {
  const resultado = [];
  for (const perfil of estado.perfiles) {
    const intentos = await db.listarIntentos(perfil.id);
    for (const it of intentos) {
      const numPendientes = (it.resultados || []).filter((r) => r.tipo === "abierta" && !r.confirmada).length;
      if (numPendientes === 0) continue;
      const control = await db.obtenerControl(it.controlId);
      resultado.push({
        id: it.id,
        perfilNombre: perfil.nombre,
        controlTitulo: control ? control.titulo : "(control eliminado)",
        numPendientes,
      });
    }
  }
  return resultado;
}

// ---------- Panel de la Familia: Controles (Fase 3, apartados 10.3 y 22) ----------

/** Fase 6, apartado 31: nombres de los hermanos que tienen su propia variante del mismo
 * control asignado (mismo asignacionId), buscando entre todos los perfiles de la Familia
 * (los controles se guardan uno por perfil, así que no hay un único registro que consultar). */
async function hermanosDeAsignacion(asignacionId, perfilIdExcluir) {
  if (!asignacionId) return [];
  const resultado = [];
  for (const p of estado.perfiles) {
    if (p.id === perfilIdExcluir) continue;
    const controles = await db.listarControles(p.id);
    if (controles.some((c) => c.asignacionId === asignacionId)) resultado.push(p.nombre);
  }
  return resultado;
}

async function pintarPanelControles(perfil) {
  const controles = await db.listarControles(perfil.id);
  const filas = (
    await Promise.all(
      controles.map(async (c) => {
        let etiquetaAsignacion = "";
        if (c.asignacionId) {
          const hermanos = await hermanosDeAsignacion(c.asignacionId, perfil.id);
          if (hermanos.length) {
            etiquetaAsignacion += `<div class="ayuda-campo">🔗 Asignación compartida con: ${escapeHtml(hermanos.join(", "))}</div>`;
          }
          etiquetaAsignacion += c.esExcepcion
            ? `<div class="aviso" style="margin-top:0.2rem;">⚠️ Excepción respecto a sus hermanos: ${escapeHtml(c.notaExcepcion || "(sin motivo indicado)")}</div>`
            : "";
        }
        return `
      <li class="tarjeta" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;">
        <span>
          <strong>${escapeHtml(c.titulo)}</strong> — ${escapeHtml(c.materiaNombre)}
          <div class="ayuda-campo">${c.preguntas.length} pregunta${c.preguntas.length === 1 ? "" : "s"} · ayuda IA: ${escapeHtml(correccion.NIVELES_AYUDA_CONTROL.find((n) => n.id === c.nivelAyudaIA)?.nombre || "Sin ayuda")}</div>
          ${etiquetaAsignacion}
        </span>
        <span class="fila-botones">
          <button class="btn-secundario" data-accion="editar-control" data-id="${c.id}">Editar</button>
          <button class="btn-secundario" data-accion="eliminar-control" data-id="${c.id}">Eliminar</button>
        </span>
      </li>`;
      })
    )
  ).join("");

  render(`
    <main class="pantalla" aria-labelledby="titulo-controles">
      <h1 id="titulo-controles">📋 Controles de ${escapeHtml(perfil.nombre)}</h1>
      <section class="tarjeta">
        <ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.6rem;">
          ${filas || "<li>Todavía no has creado ningún control para este perfil.</li>"}
        </ul>
        <div class="fila-botones" style="margin-top:0.8rem;">
          <button class="btn-primario" data-accion="nuevo-control">+ Crear un control nuevo</button>
        </div>
      </section>
      <div class="fila-botones">
        <button class="btn-secundario" data-accion="volver-panel">Volver al Panel de la Familia</button>
      </div>
    </main>
  `);

  on('[data-accion="nuevo-control"]', "click", () => pintarFormularioControl(perfil));
  onAll('[data-accion="editar-control"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    const control = await db.obtenerControl(id);
    pintarFormularioControl(perfil, control);
  });
  onAll('[data-accion="eliminar-control"]', "click", async (ev) => {
    const id = Number(ev.currentTarget.getAttribute("data-id"));
    if (confirm("¿Eliminar este control? No se puede deshacer.")) {
      await db.eliminarControl(id);
      pintarPanelControles(perfil);
    }
  });
  on('[data-accion="volver-panel"]', "click", () => pintarPanelFamilia());
}

function preguntaControlVacia(tipo) {
  if (tipo === "opcion_multiple") return { tipo, enunciado: "", opciones: ["", "", "", ""], indiceCorrecta: 0, criterioId: null };
  if (tipo === "verdadero_falso") return { tipo, enunciado: "", respuestaCorrecta: true, criterioId: null };
  if (tipo === "respuesta_corta") return { tipo, enunciado: "", respuestaCorrecta: "", criterioId: null };
  return { tipo: "abierta", enunciado: "", criterioId: null };
}

function preguntaControlHtml(p, i, criteriosDisponibles) {
  const opcionesTipo = correccion.TIPOS_PREGUNTA.map(
    (t) => `<option value="${t.id}" ${p.tipo === t.id ? "selected" : ""}>${t.nombre}</option>`
  ).join("");

  let subcampos = "";
  if (p.tipo === "opcion_multiple") {
    subcampos = `
      <p class="ayuda-campo">Escribe las opciones y marca cuál es la correcta.</p>
      ${(p.opciones || ["", "", "", ""])
        .map(
          (op, oi) => `
        <div class="fila-botones" style="align-items:center;">
          <input type="radio" name="correcta-${i}" data-campo="indiceCorrecta" value="${oi}" ${Number(p.indiceCorrecta) === oi ? "checked" : ""} aria-label="Opción ${oi + 1} correcta" />
          <input type="text" data-campo="opcion" data-opcion="${oi}" value="${escapeHtml(op)}" placeholder="Opción ${oi + 1}" style="flex:1;" />
        </div>`
        )
        .join("")}`;
  } else if (p.tipo === "verdadero_falso") {
    subcampos = `
      <div class="fila-botones" role="group" aria-label="Respuesta correcta">
        <label style="font-weight:400; display:flex; gap:0.4rem; align-items:center;"><input type="radio" name="vf-${i}" data-campo="respuestaCorrecta" value="true" ${p.respuestaCorrecta === true ? "checked" : ""} /> Verdadero</label>
        <label style="font-weight:400; display:flex; gap:0.4rem; align-items:center;"><input type="radio" name="vf-${i}" data-campo="respuestaCorrecta" value="false" ${p.respuestaCorrecta === false ? "checked" : ""} /> Falso</label>
      </div>`;
  } else if (p.tipo === "respuesta_corta") {
    subcampos = `
      <label class="ayuda-campo" for="respuesta-corta-${i}">Respuesta correcta</label>
      <input type="text" id="respuesta-corta-${i}" data-campo="respuestaCorrecta" value="${escapeHtml(p.respuestaCorrecta || "")}" />
      <p class="ayuda-campo">Se corrige sin IA: se acepta con mayúsculas/minúsculas y tildes distintas, pero el texto debe ser el mismo.</p>`;
  } else {
    subcampos = `<p class="ayuda-campo">🧠 Esta pregunta la corrige la IA cuando el alumno responda, pero solo como propuesta: la Familia tiene que confirmar la calificación antes de que cuente para el progreso.</p>`;
  }

  let campoCriterio;
  if (criteriosDisponibles && criteriosDisponibles.length) {
    campoCriterio = `
      <label class="ayuda-campo" for="criterio-pregunta-${i}">Criterio de evaluación (opcional, Fase 5)</label>
      <select id="criterio-pregunta-${i}" data-campo="criterioId">
        <option value="">Sin criterio específico</option>
        ${criteriosDisponibles
          .map(
            (c) =>
              `<option value="${c.id}" data-codigo="${escapeHtml(c.codigo)}" data-texto="${escapeHtml(c.texto)}" ${p.criterioId === c.id ? "selected" : ""}>${escapeHtml(c.codigo)} — ${escapeHtml(c.texto.length > 70 ? c.texto.slice(0, 67) + "…" : c.texto)}</option>`
          )
          .join("")}
      </select>
      <p class="ayuda-campo">Vincular la pregunta a un criterio verificado permite que el Progreso y el modelo educativo del alumno (Fase 5) sean más precisos que un simple porcentaje por materia.</p>`;
  } else {
    campoCriterio = `<p class="ayuda-campo">Sin currículo verificado para esta materia y curso: esta pregunta no se puede vincular a un criterio de evaluación concreto (se seguirá contando solo a nivel de materia).</p>`;
  }

  return `
    <div class="tarjeta" data-pregunta="${i}" style="margin-bottom:0.5rem;">
      <div class="fila-botones" style="justify-content:space-between;">
        <span><strong>Pregunta ${i + 1}</strong></span>
        <button type="button" class="btn-texto" data-accion="eliminar-pregunta" data-indice="${i}">Eliminar</button>
      </div>
      <label class="ayuda-campo" for="tipo-pregunta-${i}">Tipo</label>
      <select id="tipo-pregunta-${i}" data-campo="tipo">${opcionesTipo}</select>
      <label class="ayuda-campo" for="enunciado-pregunta-${i}">Enunciado</label>
      <textarea id="enunciado-pregunta-${i}" data-campo="enunciado" rows="2" style="width:100%; font:inherit; padding:0.5rem; border-radius:0.5rem; border:1.5px solid var(--borde);">${escapeHtml(p.enunciado || "")}</textarea>
      ${subcampos}
      ${campoCriterio}
    </div>`;
}

async function pintarFormularioControl(perfil, controlExistente) {
  const materias = await curriculo.listarMaterias(perfil.etapa);
  const materiasPerfil = materias.filter((m) => (perfil.materias || []).includes(m.id));

  // Fase 6, apartado 31 (asignación diferenciada, reducida a hermanos): solo tiene sentido
  // ofrecer co-asignar un control NUEVO a hermanos del MISMO curso, porque así la materia y
  // los criterios de evaluación elegidos siguen siendo válidos para todos a la vez.
  const hermanosMismoCurso = !controlExistente ? estado.perfiles.filter((p) => p.id !== perfil.id && p.curso === perfil.curso) : [];
  // Si se está editando un control que ya forma parte de una asignación compartida, averiguar
  // con quién, para poder mostrarlo (y para poder ofrecer marcarlo como excepción).
  const hermanosAsignacionExistente =
    controlExistente && controlExistente.asignacionId ? await hermanosDeAsignacion(controlExistente.asignacionId, perfil.id) : [];

  let preguntas = controlExistente ? JSON.parse(JSON.stringify(controlExistente.preguntas)) : [preguntaControlVacia("opcion_multiple")];
  // Cabecera del control (título/materia/nivel): igual que con las preguntas, si no se
  // conserva en una variable propia se pierde cada vez que añadir/quitar/cambiar el tipo
  // de una pregunta fuerza un re-renderizado completo del formulario.
  let tituloActual = controlExistente ? controlExistente.titulo : "";
  let materiaIdActual = controlExistente ? controlExistente.materiaId : "";
  let nivelActual = controlExistente ? controlExistente.nivelAyudaIA : 0;
  let fechaLimiteActual = controlExistente && controlExistente.fechaLimite ? controlExistente.fechaLimite : "";
  let hermanosSeleccionados = new Set(); // ids de perfil marcados para co-asignar (solo control nuevo)
  let esExcepcionActual = controlExistente ? !!controlExistente.esExcepcion : false;
  let notaExcepcionActual = controlExistente && controlExistente.notaExcepcion ? controlExistente.notaExcepcion : "";

  function sincronizarCabeceraDesdeDOM() {
    const tituloEl = appEl.querySelector("#titulo-control");
    const materiaEl = appEl.querySelector("#materia-control");
    const nivelEl = appEl.querySelector("#nivel-ayuda-control");
    const fechaLimiteEl = appEl.querySelector("#fecha-limite-control");
    if (tituloEl) tituloActual = tituloEl.value;
    if (materiaEl) materiaIdActual = materiaEl.value;
    if (nivelEl) nivelActual = Number(nivelEl.value);
    if (fechaLimiteEl) fechaLimiteActual = fechaLimiteEl.value;
    const hermanoChecks = appEl.querySelectorAll('[data-campo="hermano-asignado"]');
    if (hermanoChecks.length) {
      hermanosSeleccionados = new Set(Array.from(hermanoChecks).filter((el) => el.checked).map((el) => el.value));
    }
    const excepcionEl = appEl.querySelector("#excepcion-asignacion");
    const notaExcepcionEl = appEl.querySelector("#nota-excepcion");
    if (excepcionEl) esExcepcionActual = excepcionEl.checked;
    if (notaExcepcionEl) notaExcepcionActual = notaExcepcionEl.value;
  }

  function sincronizarPreguntasDesdeDOM() {
    const nodos = appEl.querySelectorAll("[data-pregunta]");
    if (nodos.length === 0) return;
    preguntas = Array.from(nodos).map((nodo, i) => {
      const tipoActual = preguntas[i] ? preguntas[i].tipo : "opcion_multiple";
      const p = { tipo: tipoActual, enunciado: nodo.querySelector('[data-campo="enunciado"]')?.value.trim() || "" };
      if (tipoActual === "opcion_multiple") {
        p.opciones = Array.from(nodo.querySelectorAll('[data-campo="opcion"]')).map((el) => el.value.trim());
        const radioMarcado = nodo.querySelector('[data-campo="indiceCorrecta"]:checked');
        p.indiceCorrecta = radioMarcado ? Number(radioMarcado.value) : 0;
      } else if (tipoActual === "verdadero_falso") {
        const radioMarcado = nodo.querySelector('[data-campo="respuestaCorrecta"]:checked');
        p.respuestaCorrecta = radioMarcado ? radioMarcado.value === "true" : true;
      } else if (tipoActual === "respuesta_corta") {
        p.respuestaCorrecta = nodo.querySelector('[data-campo="respuestaCorrecta"]')?.value.trim() || "";
      }
      const criterioSelect = nodo.querySelector('[data-campo="criterioId"]');
      if (criterioSelect && criterioSelect.value) {
        const opt = criterioSelect.selectedOptions[0];
        p.criterioId = criterioSelect.value;
        p.criterioCodigo = opt?.getAttribute("data-codigo") || "";
        p.criterioTexto = opt?.getAttribute("data-texto") || "";
      } else {
        p.criterioId = null;
        p.criterioCodigo = null;
        p.criterioTexto = null;
      }
      return p;
    });
  }

  function bloqueAsignacionHtml() {
    if (!controlExistente) {
      if (!hermanosMismoCurso.length) return "";
      return `
          <div class="campo">
            <label>🔗 Asignar también a hermanos/as del mismo curso (opcional)</label>
            ${hermanosMismoCurso
              .map(
                (h) => `
            <label style="font-weight:400; display:flex; gap:0.5rem; align-items:center;">
              <input type="checkbox" data-campo="hermano-asignado" value="${h.id}" ${hermanosSeleccionados.has(String(h.id)) ? "checked" : ""} />
              ${escapeHtml(h.nombre)}
            </label>`
              )
              .join("")}
            <p class="ayuda-campo">
              Si marcas a alguno, se crea el mismo control (mismas preguntas, mismos criterios y la misma
              fecha límite) también para él o ella, enlazado a este (apartado 31). Cada hijo/a lo verá con
              sus propios ajustes de accesibilidad ya activados (Fase 5). Si más adelante quieres cambiar el
              contenido solo para uno, puedes editarlo y marcarlo como excepción explícita.
            </p>
          </div>`;
    }
    if (!controlExistente.asignacionId) return "";
    return `
          <div class="campo tarjeta">
            <p style="margin-top:0;">
              🔗 Este control forma parte de una asignación compartida${
                hermanosAsignacionExistente.length ? " con: " + escapeHtml(hermanosAsignacionExistente.join(", ")) : ""
              }.
            </p>
            <label style="font-weight:400; display:flex; gap:0.5rem; align-items:center;">
              <input type="checkbox" id="excepcion-asignacion" ${esExcepcionActual ? "checked" : ""} />
              Marcar como excepción para ${escapeHtml(perfil.nombre)} (el objetivo o las preguntas son distintos de los de sus hermanos en esta asignación)
            </label>
            ${
              esExcepcionActual
                ? `<div class="campo">
                <label for="nota-excepcion">Motivo de la excepción</label>
                <textarea id="nota-excepcion" rows="2" required>${escapeHtml(notaExcepcionActual)}</textarea>
              </div>`
                : `<p class="ayuda-campo">Por defecto comparte objetivo y criterios con sus hermanos (apartado 31): no se guarda como excepción salvo que la marques y expliques el motivo.</p>`
            }
          </div>`;
  }

  async function renderFormulario() {
    const criteriosDisponibles = materiaIdActual ? await curriculo.criteriosParaCursoMateria(perfil.curso, materiaIdActual) : [];
    render(`
      <main class="pantalla" aria-labelledby="titulo-form-control">
        <h1 id="titulo-form-control">${controlExistente ? "Editar control" : "Nuevo control"} — ${escapeHtml(perfil.nombre)}</h1>
        <form id="form-control" class="tarjeta">
          <div class="campo">
            <label for="titulo-control">Título</label>
            <input type="text" id="titulo-control" required autocomplete="off" value="${escapeHtml(tituloActual)}" />
          </div>
          <div class="campo">
            <label for="materia-control">Materia</label>
            <select id="materia-control" required>
              <option value="" disabled ${materiaIdActual ? "" : "selected"}>Elige una materia</option>
              ${materiasPerfil.map((m) => `<option value="${m.id}" ${materiaIdActual === m.id ? "selected" : ""}>${escapeHtml(m.nombre)}</option>`).join("")}
            </select>
          </div>
          <div class="campo">
            <label for="nivel-ayuda-control">Nivel de ayuda de la IA durante el control</label>
            <select id="nivel-ayuda-control">
              ${correccion.NIVELES_AYUDA_CONTROL.map((n) => `<option value="${n.id}" ${nivelActual === n.id ? "selected" : ""}>${n.nombre}</option>`).join("")}
            </select>
            <p class="ayuda-campo">A diferencia de "Mi profesor", aquí el nivel es fijo: el alumno no puede subirlo pidiendo más pistas.</p>
          </div>
          <div class="campo">
            <label for="fecha-limite-control">Fecha límite (opcional, Fase 5)</label>
            <input type="date" id="fecha-limite-control" value="${escapeHtml(fechaLimiteActual)}" />
            <p class="ayuda-campo">Si la eliges, este control aparecerá en "📅 Hoy tengo que estudiar" cuando se acerque la fecha.</p>
          </div>
          ${bloqueAsignacionHtml()}
          <div id="lista-preguntas">${preguntas.map((p, i) => preguntaControlHtml(p, i, criteriosDisponibles)).join("")}</div>
          <div class="fila-botones">
            <button type="button" class="btn-secundario" data-accion="anadir-pregunta">+ Añadir pregunta</button>
          </div>
          <div id="error-control" class="error" role="alert" aria-live="polite"></div>
          <div class="fila-botones">
            <button type="submit" class="btn-primario">Guardar control</button>
            <button type="button" class="btn-secundario" data-accion="cancelar-control">Cancelar</button>
          </div>
        </form>
      </main>
    `);
    wireFormulario();
  }

  function wireFormulario() {
    on("#materia-control", "change", () => {
      sincronizarCabeceraDesdeDOM();
      sincronizarPreguntasDesdeDOM();
      renderFormulario();
    });
    onAll('[data-campo="tipo"]', "change", (ev) => {
      sincronizarCabeceraDesdeDOM();
      sincronizarPreguntasDesdeDOM();
      const i = Number(ev.currentTarget.closest("[data-pregunta]").getAttribute("data-pregunta"));
      const enunciadoPrevio = preguntas[i].enunciado;
      const criterioPrevio = preguntas[i].criterioId;
      const criterioCodigoPrevio = preguntas[i].criterioCodigo;
      const criterioTextoPrevio = preguntas[i].criterioTexto;
      preguntas[i] = preguntaControlVacia(ev.currentTarget.value);
      preguntas[i].enunciado = enunciadoPrevio;
      preguntas[i].criterioId = criterioPrevio;
      preguntas[i].criterioCodigo = criterioCodigoPrevio;
      preguntas[i].criterioTexto = criterioTextoPrevio;
      renderFormulario();
    });
    onAll('[data-accion="eliminar-pregunta"]', "click", (ev) => {
      sincronizarCabeceraDesdeDOM();
      sincronizarPreguntasDesdeDOM();
      const i = Number(ev.currentTarget.getAttribute("data-indice"));
      preguntas.splice(i, 1);
      renderFormulario();
    });
    on('[data-accion="anadir-pregunta"]', "click", () => {
      sincronizarCabeceraDesdeDOM();
      sincronizarPreguntasDesdeDOM();
      preguntas.push(preguntaControlVacia("opcion_multiple"));
      renderFormulario();
    });
    on('[data-accion="cancelar-control"]', "click", () => pintarPanelControles(perfil));
    on("#excepcion-asignacion", "change", () => {
      sincronizarCabeceraDesdeDOM();
      sincronizarPreguntasDesdeDOM();
      renderFormulario();
    });

    on("#form-control", "submit", async (ev) => {
      ev.preventDefault();
      sincronizarPreguntasDesdeDOM();
      const errorEl = appEl.querySelector("#error-control");
      errorEl.textContent = "";

      const titulo = appEl.querySelector("#titulo-control").value.trim();
      const materiaSelect = appEl.querySelector("#materia-control");
      const materiaId = materiaSelect.value;
      const materiaNombre = materiaSelect.selectedOptions[0]?.textContent || "";
      const nivelAyudaIA = Number(appEl.querySelector("#nivel-ayuda-control").value);
      const fechaLimite = appEl.querySelector("#fecha-limite-control").value || null;

      if (!titulo || !materiaId) {
        errorEl.textContent = "Rellena el título y la materia.";
        return;
      }
      if (preguntas.length === 0) {
        errorEl.textContent = "Añade al menos una pregunta.";
        return;
      }
      const sinEnunciado = preguntas.some((p) => !p.enunciado);
      if (sinEnunciado) {
        errorEl.textContent = "Todas las preguntas necesitan un enunciado.";
        return;
      }
      const opcionMultipleIncompleta = preguntas.some((p) => p.tipo === "opcion_multiple" && p.opciones.filter((o) => o).length < 2);
      if (opcionMultipleIncompleta) {
        errorEl.textContent = "Cada pregunta de opción múltiple necesita al menos dos opciones rellenas.";
        return;
      }
      const respuestaCortaVacia = preguntas.some((p) => p.tipo === "respuesta_corta" && !p.respuestaCorrecta);
      if (respuestaCortaVacia) {
        errorEl.textContent = "Cada pregunta de respuesta corta necesita su respuesta correcta.";
        return;
      }

      const hermanosMarcados = Array.from(appEl.querySelectorAll('[data-campo="hermano-asignado"]:checked')).map((el) => el.value);
      const excepcionEl = appEl.querySelector("#excepcion-asignacion");
      const esExcepcion = excepcionEl ? excepcionEl.checked : false;
      const notaExcepcion = esExcepcion ? (appEl.querySelector("#nota-excepcion")?.value.trim() || "") : "";
      if (esExcepcion && !notaExcepcion) {
        errorEl.textContent = "Explica brevemente el motivo antes de guardar la excepción.";
        return;
      }

      if (controlExistente) {
        await db.actualizarControl(controlExistente.id, {
          titulo,
          materiaId,
          materiaNombre,
          nivelAyudaIA,
          preguntas,
          fechaLimite,
          asignacionId: controlExistente.asignacionId || null,
          esExcepcion,
          notaExcepcion: esExcepcion ? notaExcepcion : null,
        });
      } else if (hermanosMarcados.length) {
        await db.guardarControlesAsignados({
          perfiles: [perfil.id, ...hermanosMarcados],
          titulo,
          materiaId,
          materiaNombre,
          nivelAyudaIA,
          preguntas,
          fechaLimite,
        });
      } else {
        await db.guardarControl({ perfilId: perfil.id, titulo, materiaId, materiaNombre, nivelAyudaIA, preguntas, fechaLimite });
      }
      pintarPanelControles(perfil);
    });
  }

  renderFormulario();
}

// ---------- Panel de la Familia: confirmar calificaciones de preguntas abiertas ----------

async function pintarRevisionIntento(intentoId) {
  const intento = await db.obtenerIntento(intentoId);
  const control = await db.obtenerControl(intento.controlId);
  const perfil = estado.perfiles.find((p) => p.id === intento.perfilId) || { nombre: "(alumno)" };

  const bloques = intento.resultados
    .map((r, i) => {
      const pregunta = control.preguntas[r.preguntaIndice];
      if (r.tipo !== "abierta") {
        return `
        <div class="tarjeta" style="margin-bottom:0.5rem;">
          <p><strong>${i + 1}. ${escapeHtml(pregunta ? pregunta.enunciado : "")}</strong></p>
          <p class="ayuda-campo">Respuesta del alumno: ${escapeHtml(String(r.respuestaAlumno ?? ""))}</p>
          <span class="pastilla ${r.correcta ? "verificado" : "pendiente"}">${r.correcta ? "✅ Correcta (sin IA)" : "❌ Incorrecta (sin IA)"}</span>
        </div>`;
      }
      const propuesta = r.propuestaIA;
      return `
      <div class="tarjeta" data-resultado="${i}" style="margin-bottom:0.5rem;">
        <p><strong>${i + 1}. ${escapeHtml(pregunta ? pregunta.enunciado : "")}</strong></p>
        <p class="ayuda-campo">Respuesta del alumno: ${escapeHtml(r.respuestaAlumno && r.respuestaAlumno.trim() ? r.respuestaAlumno : "(sin responder)")}</p>
        ${
          r.trabajoManuscrito && r.trabajoManuscrito.length
            ? `<p class="ayuda-campo">🖍️ Trabajo manuscrito del alumno (sin corrección automática):</p>
               <canvas data-pizarra-revision="${i}" width="600" height="200" style="width:100%; max-width:100%; border:1.5px solid var(--borde); border-radius:0.6rem; background:#fff; display:block;"></canvas>`
            : ""
        }
        ${
          r.confirmada
            ? `<span class="pastilla verificado">✅ Ya confirmada como "${escapeHtml(r.calificacionFinal)}"</span>`
            : propuesta
              ? `
          <span class="pastilla pendiente">🧠 Propuesta de la IA: ${escapeHtml(propuesta.calificacion)}</span>
          <p class="ayuda-campo">${escapeHtml(propuesta.comentario || "")}${propuesta.patronError && propuesta.patronError !== "ninguno" ? " · " + escapeHtml(correccion.ETIQUETAS_PATRON_ERROR[propuesta.patronError] || propuesta.patronError) : ""}</p>
          <label class="ayuda-campo" for="calif-final-${i}">Calificación final (puedes cambiarla antes de confirmar)</label>
          <select id="calif-final-${i}" data-campo="calificacionFinal">
            <option value="correcta" ${propuesta.calificacion === "correcta" ? "selected" : ""}>Correcta</option>
            <option value="parcial" ${propuesta.calificacion === "parcial" ? "selected" : ""}>Parcial</option>
            <option value="incorrecta" ${propuesta.calificacion === "incorrecta" ? "selected" : ""}>Incorrecta</option>
          </select>`
              : `<p class="aviso">No se ha podido generar una propuesta de la IA para esta respuesta. Elige tú la calificación.</p>
          <select id="calif-final-${i}" data-campo="calificacionFinal">
            <option value="correcta">Correcta</option>
            <option value="parcial" selected>Parcial</option>
            <option value="incorrecta">Incorrecta</option>
          </select>`
        }
      </div>`;
    })
    .join("");

  render(`
    <main class="pantalla" aria-labelledby="titulo-revision">
      <h1 id="titulo-revision">Revisar: ${escapeHtml(control ? control.titulo : "")}</h1>
      <p class="subtitulo">${escapeHtml(perfil.nombre)}</p>
      ${bloques}
      <div class="fila-botones">
        <button type="button" class="btn-primario" data-accion="confirmar-calificaciones">Confirmar calificaciones</button>
        <button type="button" class="btn-secundario" data-accion="volver-panel">Volver al Panel de la Familia</button>
      </div>
    </main>
  `);

  intento.resultados.forEach((r, i) => {
    if (r.trabajoManuscrito && r.trabajoManuscrito.length) {
      crearLienzo(appEl.querySelector(`[data-pizarra-revision="${i}"]`), { trazosIniciales: r.trabajoManuscrito, soloLectura: true });
    }
  });

  on('[data-accion="volver-panel"]', "click", () => pintarPanelFamilia());
  on('[data-accion="confirmar-calificaciones"]', "click", async () => {
    const nuevosResultados = intento.resultados.map((r, i) => {
      if (r.tipo !== "abierta" || r.confirmada) return r;
      const select = appEl.querySelector(`#calif-final-${i}`);
      const calificacionFinal = select ? select.value : r.propuestaIA?.calificacion || "parcial";
      return { ...r, calificacionFinal, confirmada: true };
    });
    await db.actualizarResultadosIntento(intento.id, nuevosResultados);
    for (let i = 0; i < nuevosResultados.length; i++) {
      const r = nuevosResultados[i];
      const anterior = intento.resultados[i];
      if (r.tipo !== "abierta" || anterior.confirmada) continue;
      await db.registrarAuditoria({
        perfilId: intento.perfilId,
        controlId: intento.controlId,
        intentoId: intento.id,
        preguntaId: r.preguntaIndice,
        accion: "confirmar_calificacion_abierta",
        calificacionPropuesta: r.propuestaIA ? r.propuestaIA.calificacion : null,
        calificacionFinal: r.calificacionFinal,
      });
    }
    pintarPanelFamilia();
  });
}

// ---------- Arranque ----------

iniciar().catch((err) => {
  console.error(err);
  render(`<main class="pantalla"><div class="tarjeta"><h1>Ha ocurrido un error</h1><p>${escapeHtml(err.message)}</p></div></main>`);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => console.warn("Service worker no registrado:", err));
  });
}
