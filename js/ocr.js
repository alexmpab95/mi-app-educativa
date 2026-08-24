// ocr.js — Fase 4, apartado 2.2 y adenda v1.4: reconocimiento de texto (OCR)
// en el navegador con Tesseract.js, en sustitución de Vision/VisionKit (que
// solo existen dentro de una app nativa de Apple). Se usa en "Escanea y
// aprende" y, indirectamente, en cualquier página del Cuaderno que quiera
// convertir una foto en texto.
//
// Mismo patrón que ia-motores.js (Fase 1): un motor real (MotorOCRTesseract)
// y un motor de prueba (MotorOCRSimulado), para poder probar todo el flujo
// sin depender de que la librería pueda descargarse.
//
// AVISO IMPORTANTE (honestidad sobre lo que se ha podido probar aquí): igual
// que con WebLLM, este entorno de desarrollo no tiene acceso al CDN que
// sirve Tesseract.js ni a los datos entrenados del idioma, así que
// MotorOCRTesseract no se ha podido ejecutar ni una sola vez durante el
// desarrollo. Su código sigue la API pública documentada de la librería en
// el momento de escribirlo (createWorker + worker.recognize); conviene
// revisar la documentación vigente en https://github.com/naptha/tesseract.js
// por si hubiera cambiado, y probarla de verdad en el iPad real (LEEME.md).

const CDN_TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.esm.min.js";

export class MotorOCRTesseract {
  async reconocer(imagen, onProgreso) {
    const { createWorker } = await import(/* @vite-ignore */ CDN_TESSERACT);
    const worker = await createWorker("spa", 1, {
      logger: (info) => {
        if (onProgreso && info && info.status === "recognizing text") {
          onProgreso({ progreso: info.progress ?? 0, texto: "Reconociendo texto…" });
        }
      },
    });
    try {
      const {
        data: { text },
      } = await worker.recognize(imagen);
      return (text || "").trim();
    } finally {
      await worker.terminate();
    }
  }
}

const TEXTO_EJEMPLO =
  "(Motor de prueba) Los ríos de la Comunitat Valenciana nacen, en su mayoría, en zonas de interior " +
  "y desembocan en el mar Mediterráneo.";

export class MotorOCRSimulado {
  async reconocer(_imagen, onProgreso) {
    for (let p = 0; p <= 1; p += 0.34) {
      if (onProgreso) onProgreso({ progreso: Math.min(p, 1), texto: "Reconociendo texto (motor de prueba)…" });
      await new Promise((r) => setTimeout(r, 40));
    }
    return TEXTO_EJEMPLO;
  }
}

/**
 * Intenta el motor real; si falla (o si se pide explícitamente "prueba"), cae
 * automáticamente al motor de prueba, igual que con el motor de IA — nunca
 * rompe el flujo de "Escanea y aprende", solo etiqueta con claridad cuál se
 * ha usado para que nunca se confunda un texto de ejemplo con uno real.
 */
export async function reconocerTexto(imagen, { onProgreso, preferencia = "auto" } = {}) {
  if (preferencia === "prueba") {
    const texto = await new MotorOCRSimulado().reconocer(imagen, onProgreso);
    return { texto, tipo: "prueba" };
  }
  try {
    const texto = await new MotorOCRTesseract().reconocer(imagen, onProgreso);
    return { texto, tipo: "tesseract" };
  } catch (err) {
    console.warn("No se ha podido usar el OCR real (Tesseract.js); se usa el motor de prueba:", err);
    const texto = await new MotorOCRSimulado().reconocer(imagen, onProgreso);
    return { texto, tipo: "prueba" };
  }
}
