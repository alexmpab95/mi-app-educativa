// ia-motores.js — Fase 1, apartado 4.4 y adenda v1.4.
//
// Dos implementaciones intercambiables del mismo motor de IA:
//
//  - MotorWebLLM: el motor real, un modelo de lenguaje pequeño ejecutado en
//    el propio navegador vía WebGPU (librería WebLLM, cargada desde un CDN
//    la primera vez que se usa). Es la implementación de producción.
//
//  - MotorSimulado: no descarga nada ni necesita WebGPU; devuelve respuestas
//    de ejemplo que respetan el nivel de ayuda pedido, para poder probar
//    toda la pantalla "Mi profesor" (selector, pistas, voz, registro...) sin
//    esperar una descarga de cientos de MB ni depender de tener WebGPU.
//    Se etiqueta siempre como "modo de prueba" en la interfaz: nunca debe
//    confundirse con una respuesta real del profesor IA.
//
// AVISO IMPORTANTE (honestidad sobre lo que se ha podido probar): este
// entorno de desarrollo no tiene acceso a redes de reparto de contenido
// (CDN) ni a Hugging Face, así que MotorWebLLM no se ha podido ejecutar de
// verdad aquí. Su código sigue la API pública documentada de @mlc-ai/web-llm
// en el momento de escribirlo, pero antes de confiar en ella conviene
// probarla en el iPad real (ver LEEME.md) y revisar la documentación vigente
// en https://github.com/mlc-ai/web-llm por si la API hubiera cambiado.

const CDN_WEBLLM = "https://esm.run/@mlc-ai/web-llm";

// Modelo pequeño, multilingüe, pensado para caber en un iPad de gama media.
// Cambiar aquí si tras la validación en el dispositivo real conviene otro
// modelo del catálogo de WebLLM (más pequeño si va lento, más grande si el
// dispositivo tiene margen y la calidad se queda corta).
const MODELO_WEBLLM = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export async function hayWebGPU() {
  if (!("gpu" in navigator)) return false;
  try {
    const adaptador = await navigator.gpu.requestAdapter();
    return !!adaptador;
  } catch {
    return false;
  }
}

export class MotorWebLLM {
  constructor() {
    this.motor = null;
    this.listo = false;
  }

  async inicializar(onProgreso) {
    const { CreateMLCEngine } = await import(/* @vite-ignore */ CDN_WEBLLM);
    this.motor = await CreateMLCEngine(MODELO_WEBLLM, {
      initProgressCallback: (info) => {
        // info.progress viene entre 0 y 1 en la versión documentada al escribir esto.
        if (onProgreso) onProgreso({ progreso: info.progress ?? 0, texto: info.text || "" });
      },
    });
    this.listo = true;
  }

  async responder({ mensajes, onToken }) {
    if (!this.listo) throw new Error("El motor todavía no se ha inicializado.");
    const flujo = await this.motor.chat.completions.create({ messages: mensajes, stream: true });
    let completo = "";
    for await (const fragmento of flujo) {
      const trozo = fragmento.choices?.[0]?.delta?.content || "";
      if (trozo) {
        completo += trozo;
        if (onToken) onToken(trozo);
      }
    }
    return completo;
  }
}

export class MotorSimulado {
  async inicializar(onProgreso) {
    // Simula una carga breve para que la barra de progreso sea comprobable en las pruebas.
    for (let p = 0; p <= 1; p += 0.34) {
      if (onProgreso) onProgreso({ progreso: Math.min(p, 1), texto: "Preparando el motor de prueba…" });
      await new Promise((r) => setTimeout(r, 30));
    }
    this.listo = true;
  }

  async responder({ mensajes, onToken }) {
    const systemPrompt = mensajes.find((m) => m.role === "system")?.content || "";
    const ultimoMensaje = [...mensajes].reverse().find((m) => m.role === "user")?.content || "";

    let texto;
    // --- Fase 1: tutor con pistas progresivas ---
    if (systemPrompt.includes("No des ninguna pista todavía")) {
      texto = `(Motor de prueba) Antes de darte una pista: ¿qué parte concreta de "${recorta(ultimoMensaje)}" es la que no te sale? Cuéntamelo con tus palabras.`;
    } else if (systemPrompt.includes("pista CONCEPTUAL")) {
      texto = `(Motor de prueba) Pista: piensa qué operación o estrategia general se usa en este tipo de ejercicios, antes de tocar los números concretos.`;
    } else if (systemPrompt.includes("pista más concreta")) {
      texto = `(Motor de prueba) Mira este ejemplo parecido resuelto paso a paso, con otros números, y luego prueba tú con el tuyo.`;
    } else if (systemPrompt.includes("guiarle paso a paso")) {
      texto = `(Motor de prueba) Vamos paso a paso: ¿qué obtienes si haces el primer paso? Dímelo y seguimos desde ahí.`;
    } else if (systemPrompt.includes("solución completa")) {
      texto = `(Motor de prueba) Aquí tienes el proceso completo, paso a paso, explicando el porqué de cada uno.`;

      // --- Fase 2: generador de contenido (resumen/esquema/flashcards/ejercicios) ---
    } else if (systemPrompt.includes("RESUMEN")) {
      texto =
        "(Motor de prueba) Este es un resumen de ejemplo generado sin IA real.\n\n" +
        "Primer párrafo de ejemplo con la idea principal del tema.\n\n" +
        "Segundo párrafo de ejemplo con un detalle relevante y una aclaración.";
    } else if (systemPrompt.includes("ESQUEMA")) {
      texto = "- Idea principal de ejemplo\n  - Primer subpunto de ejemplo\n  - Segundo subpunto de ejemplo\n- Segunda idea de ejemplo\n  - Subpunto de ejemplo";
    } else if (systemPrompt.includes("FLASHCARDS")) {
      texto = JSON.stringify([
        { pregunta: "(Motor de prueba) Pregunta de ejemplo 1", respuesta: "Respuesta de ejemplo 1" },
        { pregunta: "(Motor de prueba) Pregunta de ejemplo 2", respuesta: "Respuesta de ejemplo 2" },
        { pregunta: "(Motor de prueba) Pregunta de ejemplo 3", respuesta: "Respuesta de ejemplo 3" },
      ]);
    } else if (systemPrompt.includes("EJERCICIOS")) {
      texto = JSON.stringify([
        { enunciado: "(Motor de prueba) Ejercicio de ejemplo 1", solucion: "Solución de ejemplo, con el razonamiento." },
        { enunciado: "(Motor de prueba) Ejercicio de ejemplo 2", solucion: "Solución de ejemplo, con el razonamiento." },
      ]);

      // --- Fase 3: corrección asistida de preguntas abiertas y pistas fijas durante un control ---
    } else if (systemPrompt.includes("corrector pedagógico")) {
      const sinRespuesta = ultimoMensaje.includes("(el alumno no ha respondido)");
      texto = sinRespuesta
        ? JSON.stringify({ calificacion: "incorrecta", comentario: "(Motor de prueba) No se ha escrito ninguna respuesta.", patronError: "respuesta_incompleta" })
        : JSON.stringify({ calificacion: "parcial", comentario: "(Motor de prueba) Vas por buen camino, pero falta algún detalle importante para que esté completa.", patronError: "respuesta_incompleta" });
    } else if (systemPrompt.includes("DURANTE un control")) {
      texto = `(Motor de prueba) Pista de ejemplo para el control: piensa en el primer paso que darías y empieza por ahí, sin saltarte ninguno.`;
    } else {
      texto = `(Motor de prueba) Esta es una respuesta de ejemplo en modo aprendizaje sobre: "${recorta(ultimoMensaje)}". Cuando actives el motor real (WebGPU), aquí aparecería una explicación generada de verdad.`;
    }

    // Simula streaming token a token para poder probar la interfaz de escritura progresiva.
    const palabras = texto.split(" ");
    let acumulado = "";
    for (const palabra of palabras) {
      acumulado += (acumulado ? " " : "") + palabra;
      if (onToken) onToken((acumulado === palabra ? "" : " ") + palabra);
      await new Promise((r) => setTimeout(r, 8));
    }
    return texto;
  }
}

function recorta(texto, max = 60) {
  return texto.length > max ? texto.slice(0, max) + "…" : texto;
}

/** Elige el motor adecuado. `preferencia` puede ser "auto" | "webgpu" | "prueba". */
export async function crearMotor(preferencia = "auto") {
  if (preferencia === "prueba") return { motor: new MotorSimulado(), tipo: "prueba" };
  if (preferencia === "webgpu") return { motor: new MotorWebLLM(), tipo: "webgpu" };
  // auto: usa WebGPU si está disponible, si no cae al motor de prueba en vez de romperse.
  const soportado = await hayWebGPU();
  return soportado ? { motor: new MotorWebLLM(), tipo: "webgpu" } : { motor: new MotorSimulado(), tipo: "prueba" };
}
