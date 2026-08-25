// motor-compartido.js — Fase 2.
//
// "Mi profesor" (Fase 1) y "Crear" (Fase 2) usan el mismo modelo de lenguaje.
// Antes cada pantalla creaba su propia instancia; eso significaba cargar el
// modelo en memoria dos veces si el alumno entraba en las dos pestañas en la
// misma sesión. Este módulo guarda una única instancia compartida, tal como
// pide el principio de control de coste del apartado 18.2 ("repetición de
// solicitudes equivalentes... cachear, reutilizar").

import { crearMotor, MotorSimulado } from "./ia-motores.js";

let promesaMotor = null;

/**
 * Devuelve siempre la misma instancia de motor (y la crea la primera vez que se pide).
 *
 * Corrección importante (detectada al validar en un iPad real, fuera de este entorno de
 * desarrollo sin internet): `crearMotor("auto")` solo decide "webgpu" o "prueba" según si el
 * NAVEGADOR anuncia soporte de WebGPU (`navigator.gpu` + un adaptador). Eso no garantiza que
 * la carga real del modelo vaya a funcionar después: puede fallar por falta de red, por un
 * CDN bloqueado, por memoria insuficiente en el dispositivo, o por cualquier otro motivo del
 * propio WebLLM. Antes, si eso ocurría, el error se propagaba tal cual y la pantalla se
 * quedaba en "⚠️ Motor no disponible" — justo lo contrario de lo que pide el documento de
 * arquitectura ("la aplicación se degrada con elegancia... cae automáticamente a un motor de
 * prueba"). Ahora, si el motor real anuncia soporte pero su inicialización falla de verdad,
 * se cae al motor de prueba en vez de romper la pantalla, y se recuerda el motivo del fallo
 * (`errorMotorReal`) para poder mostrarlo con honestidad en vez de ocultarlo.
 */
export function obtenerMotorCompartido(onProgreso) {
  if (!promesaMotor) {
    promesaMotor = (async () => {
      let { motor, tipo } = await crearMotor("auto");
      try {
        await motor.inicializar(onProgreso);
        return { motor, tipo };
      } catch (err) {
        if (tipo !== "webgpu") throw err; // el motor de prueba no debería fallar nunca; si falla, no hay a qué caer
        console.error("El motor real (WebGPU) anunciaba soporte pero no se ha podido cargar; se usa el motor de prueba:", err);
        motor = new MotorSimulado();
        await motor.inicializar(onProgreso);
        return { motor, tipo: "prueba", errorMotorReal: err.message || String(err) };
      }
    })().catch((err) => {
      // Si falla, no se deja memorizado el fallo para siempre: la próxima
      // pantalla que lo pida podrá reintentarlo desde cero.
      promesaMotor = null;
      throw err;
    });
  }
  return promesaMotor;
}

/** Solo para pruebas o para forzar recarga si algo fue mal (por ejemplo, tras un error). */
export function reiniciarMotorCompartido() {
  promesaMotor = null;
}
