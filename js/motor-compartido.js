// motor-compartido.js — Fase 2.
//
// "Mi profesor" (Fase 1) y "Crear" (Fase 2) usan el mismo modelo de lenguaje.
// Antes cada pantalla creaba su propia instancia; eso significaba cargar el
// modelo en memoria dos veces si el alumno entraba en las dos pestañas en la
// misma sesión. Este módulo guarda una única instancia compartida, tal como
// pide el principio de control de coste del apartado 18.2 ("repetición de
// solicitudes equivalentes... cachear, reutilizar").

import { crearMotor } from "./ia-motores.js";

let promesaMotor = null;

/** Devuelve siempre la misma instancia de motor (y la crea la primera vez que se pide). */
export function obtenerMotorCompartido(onProgreso) {
  if (!promesaMotor) {
    promesaMotor = (async () => {
      const { motor, tipo } = await crearMotor("auto");
      await motor.inicializar(onProgreso);
      return { motor, tipo };
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
