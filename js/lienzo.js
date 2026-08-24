// lienzo.js — Fase 4, apartado 2.2 del documento de arquitectura: "Componente
// de lienzo con Apple Pencil".
//
// El documento original (versiones 1.0-1.3) construía este componente sobre
// PencilKit, con acceso directo al lápiz de Apple y predicción de trazo de
// baja latencia. La adenda v1.4 lo sustituye por la Pointer Events API
// estándar del navegador, porque PencilKit no existe fuera de una app nativa
// de Apple: funciona razonablemente bien para escribir y dibujar, pero con
// algo más de retardo y sin la fidelidad de presión/inclinación de PencilKit
// (apartado 3.1, riesgo técnico C6 del análisis previo). Este componente es
// el único punto de captura de trazo de toda la aplicación, reutilizado tal
// cual en el Cuaderno (libre) y en Practicar (pizarra ligera de apoyo, sin
// reconocimiento de procedimiento: ver ocr.js y LEEME.md para el porqué).
//
// Los trazos se guardan como datos vectoriales (lista de puntos), no como
// una imagen: ocupan poco espacio, se pueden volver a dibujar en cualquier
// tamaño de pantalla y no dependen de ninguna librería externa.

/**
 * Instala el lienzo sobre un <canvas> ya presente en el DOM.
 * @param {HTMLCanvasElement} canvasEl
 * @param {{trazosIniciales?: Array, color?: string, grosor?: number, soloLectura?: boolean}} opciones
 */
export function crearLienzo(canvasEl, opciones = {}) {
  const ctx = canvasEl.getContext("2d");
  let trazos = (opciones.trazosIniciales || []).map((t) => ({ color: t.color, grosor: t.grosor, puntos: t.puntos.slice() }));
  let trazoActual = null;
  let colorActual = opciones.color || "#1d3557";
  let grosorActual = opciones.grosor || 3;
  const soloLectura = !!opciones.soloLectura;

  function dibujarTrazo(t) {
    if (!t.puntos.length) return;
    if (t.puntos.length === 1) {
      // Un toque sin arrastre: se dibuja como un punto, para que no desaparezca.
      ctx.beginPath();
      ctx.fillStyle = t.color;
      ctx.arc(t.puntos[0].x, t.puntos[0].y, t.grosor / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.strokeStyle = t.color;
    ctx.lineWidth = t.grosor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(t.puntos[0].x, t.puntos[0].y);
    for (let i = 1; i < t.puntos.length; i++) ctx.lineTo(t.puntos[i].x, t.puntos[i].y);
    ctx.stroke();
  }

  function redibujar() {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    for (const t of trazos) dibujarTrazo(t);
  }

  function posicionRelativa(ev) {
    const rect = canvasEl.getBoundingClientRect();
    const escalaX = canvasEl.width / rect.width;
    const escalaY = canvasEl.height / rect.height;
    return { x: (ev.clientX - rect.left) * escalaX, y: (ev.clientY - rect.top) * escalaY };
  }

  function onPointerDown(ev) {
    ev.preventDefault();
    if (canvasEl.setPointerCapture) {
      try {
        canvasEl.setPointerCapture(ev.pointerId);
      } catch {
        /* algunos navegadores en pruebas automatizadas no soportan captura de puntero; no es crítico */
      }
    }
    trazoActual = { color: colorActual, grosor: grosorActual, puntos: [posicionRelativa(ev)] };
  }

  function onPointerMove(ev) {
    if (!trazoActual) return;
    trazoActual.puntos.push(posicionRelativa(ev));
    dibujarTrazo(trazoActual); // se dibuja incrementalmente, sin redibujar todo el lienzo en cada movimiento
  }

  function onPointerUp() {
    if (!trazoActual) return;
    trazos.push(trazoActual);
    trazoActual = null;
  }

  if (!soloLectura) {
    canvasEl.addEventListener("pointerdown", onPointerDown);
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerup", onPointerUp);
    canvasEl.addEventListener("pointercancel", onPointerUp);
    // Evita que el navegador interprete el trazo como un gesto de scroll/zoom.
    canvasEl.style.touchAction = "none";
  }

  redibujar();

  return {
    /** Copia profunda de los trazos actuales, lista para guardar en IndexedDB. */
    obtenerTrazos: () => trazos.map((t) => ({ color: t.color, grosor: t.grosor, puntos: t.puntos.slice() })),
    deshacer: () => {
      trazos.pop();
      redibujar();
    },
    limpiar: () => {
      trazos = [];
      redibujar();
    },
    estaVacio: () => trazos.length === 0,
    cambiarColor: (c) => {
      colorActual = c;
    },
    cambiarGrosor: (g) => {
      grosorActual = g;
    },
    destruir: () => {
      canvasEl.removeEventListener("pointerdown", onPointerDown);
      canvasEl.removeEventListener("pointermove", onPointerMove);
      canvasEl.removeEventListener("pointerup", onPointerUp);
      canvasEl.removeEventListener("pointercancel", onPointerUp);
    },
  };
}

/** Colores y grosores de ejemplo para la barra de herramientas del lienzo. */
export const COLORES_LIENZO = ["#1d3557", "#c9184a", "#2a9d8f", "#e07a1e", "#000000"];
export const GROSORES_LIENZO = [
  { id: 2, nombre: "Fino" },
  { id: 4, nombre: "Medio" },
  { id: 8, nombre: "Grueso" },
];
