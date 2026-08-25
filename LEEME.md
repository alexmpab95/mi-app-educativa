# Ecosistema Educativo — código de las Fases -1, 0, 1, 2, 3, 4, 5, 6 y 7

Esto es el principio real de la app descrita en el documento de arquitectura
(versión 1.4): una aplicación web instalable (PWA), sin Mac, sin Xcode y sin
ninguna cuenta de Apple. Ahora mismo cubre:

- **Fase -1** (apartado 17 del documento): estructura lista para publicarse
  en un hosting estático, instalable en el iPad desde Safari.
- **Fase 0** (apartado 17): cuenta familiar con PIN opcional, creación y
  selección de varios perfiles de Alumno, aislamiento entre hermanos,
  almacenamiento local cifrado, sistema curricular con un primer paquete
  verificado (Matemáticas, tercer ciclo de Primaria, con fuente oficial del
  BOE), y la navegación principal por pestañas.
- **Fase 1** (apartado 17): la pestaña "Mi profesor" ya funciona. Selector
  de materia (según las del perfil) y tema, modo Aprendizaje/Práctica, chat
  con pistas progresivas en modo Práctica (nunca da la solución como primer
  paso; el botón "Ver solución completa" solo se desbloquea después de pedir
  al menos dos pistas), separación visual clara entre currículo oficial
  verificado (📄, tomado literalmente del JSON local, nunca reformulado por
  el modelo) y explicación generada (🧠), dictado por voz y lectura en voz
  alta (Web Speech API, con el teclado siempre disponible como alternativa),
  y un registro ligero de interacciones (solo metadatos: materia, tema,
  pistas usadas — nunca la conversación completa) para cada perfil.
- **Fase 2** (apartado 17): la pestaña "Crear" ya funciona. Un único motor
  de generación (resumen, esquema, flashcards, ejercicios) a partir del
  currículo verificado o de material importado (texto pegado o un archivo
  .txt/.md); vista previa editable antes de guardar (editar campos, añadir o
  quitar flashcards/ejercicios); versionado desde el primer guardado
  (guardar una edición sube la versión y conserva la anterior, apartado 37);
  y la misma separación 📄/🧠 que en la Fase 1 — si el recurso se basa en
  currículo verificado, ese fragmento se muestra literal, nunca reformulado
  por el modelo, y si no hay currículo verificado para esa materia y curso,
  la app lo dice explícitamente en vez de inventar una cita oficial. "Mi
  profesor" y "Crear" comparten ahora una única instancia del motor de IA
  (antes cada pantalla cargaba el modelo por separado).
- **Fase 3** (apartados 10.3, 14, 17 y 22): la pestaña "Practicar" y el
  Panel de la Familia ya permiten hacer y corregir controles. La Familia
  crea un control (título, materia, nivel de ayuda IA fijo durante el
  control, y preguntas de 4 tipos: opción múltiple, verdadero/falso,
  respuesta corta y pregunta abierta) desde "Controles" en su Panel. El
  Alumno lo entrega desde "Practicar": las preguntas cerradas se corrigen
  al instante, sin IA y sin ambigüedad; la pregunta abierta recibe una
  **propuesta** de calificación de la IA que **nunca cuenta para el
  progreso hasta que la Familia la confirma explícitamente** (o la corrige
  a mano) desde "Calificaciones pendientes de confirmar" en su Panel —
  esta es la resolución C5 del análisis previo del propio documento, y
  cada confirmación queda en un registro de auditoría cifrado. Durante un
  control, el alumno puede pedir una pista de nivel **fijo** (lo decide la
  Familia al crear el control, no escala como en el modo práctica de "Mi
  profesor"). "Practicar" también tiene un repaso informal de las
  flashcards creadas en "Crear" (sin calificación ni envío a nadie). La
  pestaña "Progreso" muestra su primera versión: cuenta las preguntas
  cerradas siempre, y las abiertas solo una vez confirmadas, dejando claro
  qué todavía no cuenta.
- **Fase 4** (apartados 2.2, 15.3 y 17, con la adenda v1.4 que sustituye los
  frameworks nativos de Apple por sus equivalentes web): tres pantallas
  nuevas. El **Cuaderno** guarda páginas por perfil (materia, tema,
  etiquetas, texto y dibujo) y puede generar directamente un recurso
  (resumen/esquema/flashcards/ejercicios) a partir del texto de una página,
  enlazando el recurso resultante con la página de origen. **"Escanea y
  aprende"** deja fotografiar un ejercicio (o elegir una foto ya hecha) y
  reconoce el texto con OCR en el propio navegador (Tesseract.js, en
  sustitución de Vision/VisionKit); el texto reconocido **siempre hay que
  revisarlo y corregirlo a mano antes de usarlo** (se avisa explícitamente),
  y desde ahí también se puede generar un recurso o guardar la página en el
  Cuaderno — con la foto original descartada de memoria salvo que se marque
  explícitamente "Guardar también la foto" (apartado 15.3: descarte de
  imágenes tras la extracción salvo guardado explícito). El dibujo, tanto en
  el Cuaderno como en la nueva **pizarra** que aparece bajo cada pregunta
  abierta de un control, se hace con la Pointer Events API (en sustitución
  de PencilKit, que solo existe dentro de una app nativa de Apple), y se
  guarda como trazos vectoriales, no como imagen.

  **Alcance deliberadamente reducido de la pizarra:** el propio apartado 1.4
  del documento clasifica el reconocimiento automático de procedimientos
  matemáticos (detectar en qué paso concreto de una resta o una división se
  ha equivocado el alumno) como **el riesgo técnico más alto de todo el
  proyecto**, y pide explícitamente empezar con "un alcance muy reducido".
  Por eso esta fase entrega la pizarra como un lienzo de dibujo libre que se
  guarda y se puede revisar (el alumno lo ve en su resultado, la Familia lo
  ve al revisar la calificación), **sin ningún intento de leer o corregir
  automáticamente el procedimiento dibujado** — se deja explícito en la
  propia pantalla ("sin corrección automática"). Añadir ese reconocimiento
  de verdad es trabajo de una fase posterior, y conviene abordarlo aparte,
  con su propio criterio de aceptación y sus propias pruebas, precisamente
  por el riesgo que el documento le atribuye.
- **Fase 5** (apartados 5.3, 9.1, 9.2, 9.3 y 17): personalización. Las
  preguntas de un control ahora pueden vincularse, opcionalmente, a un
  criterio de evaluación concreto del currículo verificado de esa
  materia/curso, lo que permite un seguimiento más fino que "por materia".
  Con esos datos se calcula, **en vivo y nunca guardado aparte** (a partir
  de los mismos controles e intentos que ya usaba Progreso desde la Fase 3),
  un **modelo educativo del alumno**: por cada criterio (o materia, si la
  pregunta no tiene criterio vinculado) con al menos 3 observaciones, un
  nivel de dominio (dominado / en progreso / con dificultad) con un
  indicador de confianza según cuántas observaciones hay. La pestaña
  **Progreso** muestra ahora ese desglose por criterio, con un panel de
  **explicabilidad** ("¿por qué te recomendamos esto?") que cita siempre el
  número real de preguntas y el porcentaje real de acierto detrás de cada
  nivel — nunca una afirmación sin evidencia a la vista. Cuando un criterio
  queda "con dificultad" con confianza suficiente, la app genera una
  **sugerencia de adaptación** (nivel "sugerido" del apartado 9.2: nunca se
  aplica sola, siempre hay que aceptarla o rechazarla explícitamente desde
  la nueva pantalla de **Accesibilidad** — botón ⚙️ junto a "Cambiar" en la
  cabecera). Esa misma pantalla reúne una configuración de accesibilidad
  real y con efecto real: tamaño de letra, tema (incluido alto contraste) y
  espaciado (aplicados con CSS), lenguaje simplificado e instrucciones
  fragmentadas (aplicados como instrucciones reales al system prompt de la
  IA en "Mi profesor" y en la corrección/pistas de controles), modo "menos
  estímulos" (desactiva animaciones) y "voz por defecto" (resalta el botón
  de dictado ya existente). Cada cambio, manual o aceptado como sugerencia,
  queda registrado con su motivo. Por último, la nueva pantalla **"📅 Hoy
  tengo que estudiar"** reúne en un solo sitio la cola de flashcards
  pendientes de repasar (con una repetición espaciada sencilla, de pasos
  fijos), un recordatorio de los criterios "con dificultad" para reforzar,
  y los controles con fecha límite próxima.

  **Alcance deliberadamente reducido de la Fase 5** (documentado también en
  los propios comentarios de `js/modelo-educativo.js`): se deja fuera de
  esta entrega la **EstrategiaEfectiva** del apartado 5.3 (qué tipo de
  apoyo ha funcionado mejor para cada alumno concreto), porque afirmarlo
  con los pocos datos que puede haber en una instalación recién empezada
  sería inventar una conclusión sin evidencia real — justo lo que pide
  evitar el propio apartado 9.3 de explicabilidad; el **nivel "automático"**
  de adaptación del apartado 9.2 (aplicar cambios sin pedir aceptación),
  porque requiere una configuración previa y expresamente autorizada por la
  Familia que todavía no existe, y aplicar algo sin permiso previo sería un
  riesgo de calibración innecesario; la **ruta de aprendizaje adaptativa
  completa** con manipulativos digitales y representación visual progresiva
  (apartado 4.1), porque esas representaciones todavía no existen como
  funcionalidad; y la **clasificación completa de PatrónDeError**
  (conceptual/procedimental/de cálculo/de comprensión/lingüístico/omisión,
  apartados 5.3/21/22), simplificada aquí a una única regla genérica de
  "con dificultad" que alimenta directamente la sugerencia, sin guardar ni
  revisar cada patrón como una entidad aparte — esa clasificación fina es
  una tarea de análisis pedagógico más profunda, aplazada a una fase
  posterior.
- **Fase 6** (apartados 8.1, 9, 17 y 31, "reducida en v1.1"): el rol
  Profesor, pero solo sobre los propios hijos/as, sin panel de gestión de
  una clase completa (ese alcance mayor queda reservado, ver el propio
  apartado 17). El Panel de la Familia gana dos pantallas nuevas por cada
  perfil, accesibles **sin tener que entrar en la sesión de ese hijo/a**:
  un botón **"📊 Informe"** que muestra el mismo modelo educativo por
  criterio de la Fase 5, pero con la evidencia siempre visible de entrada
  (sin el clic extra de "¿Por qué?": quien lo consulta desde aquí ya es la
  persona autorizada a ver el detalle completo, apartado 9.3), y un botón
  **"⚙️ Adaptaciones"** que reutiliza exactamente la misma pantalla de
  accesibilidad de la Fase 5 (mismo formulario, mismas sugerencias
  pendientes) para gestionarla desde fuera del perfil. Al crear un control
  **nuevo**, si hay otro perfil en el mismo curso, aparece la opción de
  **asignarlo también a ese hermano/a** (apartado 31, "asignación
  diferenciada" reducida de una clase a hermanos): se crea el mismo
  control (mismas preguntas, mismos criterios, misma fecha límite) para
  cada uno por separado — cada hijo/a mantiene su propio registro de
  intentos, así que responder uno no afecta al otro —, enlazados por un
  identificador común solo para poder mostrar en el Panel que están
  compartidos. Si más adelante la Familia decide que uno de los dos
  necesita un contenido distinto, puede editar esa variante y marcarla
  explícitamente como **excepción**, con un motivo obligatorio — nunca
  ocurre en silencio, tal como pide el propio apartado 31 ("esa decisión
  queda registrada como excepción explícita, no como comportamiento por
  defecto del sistema").

  **Qué no hace falta construir de nuevo en esta fase:** las "distintas
  presentaciones por alumno" que menciona el apartado 31 como ejemplo
  ("mayor apoyo visual", "instrucciones fragmentadas") ya las resuelve la
  configuración de accesibilidad de cada hijo/a desde la Fase 5 — como es
  automática por perfil, un mismo control asignado a dos hermanos ya se
  les presenta de forma distinta si tienen ajustes distintos, sin que haga
  falta ninguna variante nueva por control para conseguirlo.

  **Alcance deliberadamente reducido de la Fase 6:** el "nivel de ayuda de
  IA configurado" en fichas (no solo en controles) que menciona la
  funcionalidad del apartado 8.1 no se ha añadido como un ajuste nuevo:
  las fichas generadas en "Crear" no tienen una interacción de chat con
  niveles de ayuda escalables como sí la tiene "Mi profesor" (Fase 1), así
  que no había ningún campo real al que aplicarlo; y el panel de gestión
  de una clase completa (25 alumnos, varios profesores, un centro), que el
  propio documento marca como módulo reservado desde la adenda v1.1, sigue
  fuera de alcance.
- **Fase 7** (apartados 2.2 y 17, "alcance reducido en v1.1"): gamificación
  y analítica personal, deliberadamente la última pieza construida, tal
  como pide el propio documento ("diseñada deliberadamente al final...
  cuando ya existen datos reales de uso para calibrarla sin caer en
  mecánicas de dependencia"). Cada perfil de Alumno tiene ahora una nueva
  pestaña **"🏆 Logros"** con puntos, nivel, racha e insignias, **todo
  calculado en vivo** a partir de los controles, intentos y repasos que ya
  existían (el mismo patrón que el modelo educativo de la Fase 5): nada se
  guarda como un saldo aparte, así que nada puede desincronizarse ni
  perderse por un fallo de guardado. Los puntos premian tres cosas
  medibles y reales, nunca el tiempo de conexión ni solo la calificación
  (resolución C7 del análisis previo, riesgo pedagógico 1.5): esfuerzo
  (preguntas respondidas, acertadas o no), constancia (días distintos con
  actividad real) y mejora (superar tu propio resultado anterior en la
  misma materia). La **"racha amable"** exigida por el propio documento
  está implementada de forma literal: perder un solo día no la rompe (se
  perdona un hueco), perder dos días seguidos sí, pero de forma silenciosa
  y sin ningún aviso de urgencia — y el récord histórico de la mejor racha
  nunca disminuye, así que ese progreso no se pierde aunque la racha
  actual se reinicie. Las insignias se muestran siempre con emoji **y**
  texto (nunca solo un color) y ninguna mecánica depende de la velocidad
  de reacción, conforme a la accesibilidad exigida en el apartado 12.3/35.
  Se añade también un calendario sencillo de los últimos 14 días con o sin
  actividad, como primera pieza real de "analítica personal de progreso".

  **Alcance deliberadamente reducido de la Fase 7:** los **"retos"** que
  menciona el catálogo del apartado 2.2 junto a puntos/logros/insignias/
  rachas/niveles se dejan fuera de esta entrega — calibrar un reto
  razonable (cuánto pedir, en cuánto tiempo) necesita la misma base de uso
  real que el propio documento exige para la gamificación en general, así
  que construirlos ahora sería inventar umbrales sin ningún dato que los
  respalde. La **"analítica personal de progreso a lo largo de los
  cursos"** completa también quedaría coja en una instalación recién
  empezada: comparar cursos escolares distintos no tiene sentido con menos
  de un curso de datos reales, así que aquí se entrega la parte que sí es
  útil desde el primer día (el calendario de actividad reciente), y se deja
  la comparación multi-curso para cuando exista más de un curso que
  comparar.

## ⚠️ Lo más importante que falta comprobar: el motor de IA real en tu iPad

Esta es, según el propio documento de arquitectura (apartado 4.4 y riesgo
técnico 1.4), **la pieza de mayor incertidumbre técnica de todo el
proyecto**, y hay que ser honestos sobre qué se ha podido probar aquí y qué
no:

- El motor de IA real (un modelo de lenguaje pequeño que corre dentro del
  propio navegador usando WebGPU, a través de la librería WebLLM) está
  programado siguiendo su API pública documentada, pero **no se ha podido
  ejecutar ni una sola vez durante el desarrollo**, porque este entorno de
  desarrollo no tiene acceso a internet general (ni al CDN que sirve la
  librería, ni a Hugging Face, donde están los pesos del modelo).
- Lo que sí se ha comprobado a fondo, con pruebas automatizadas repetibles,
  es todo lo que rodea a ese motor: el selector de materia/tema, el cambio
  de modo, la escalada de pistas, el botón de solución completa, la
  distinción entre contenido verificado y generado, el registro cifrado de
  interacciones, el aislamiento entre hermanos, y que la aplicación **se
  degrada con elegancia** si WebGPU no está disponible o si el modelo no se
  puede descargar: en ese caso cae automáticamente a un "motor de prueba"
  (respuestas de ejemplo, siempre etiquetadas como tales, nunca haciéndose
  pasar por IA real) en vez de romperse.
- **Bug real encontrado y corregido tras la primera validación en un iPad
  real:** el navegador anunciaba soporte de WebGPU (así que la app intentaba
  cargar el motor real), pero la carga en sí fallaba después — y en ese
  caso concreto la pantalla se quedaba en "⚠️ Motor no disponible" en vez de
  caer al motor de prueba, justo lo contrario de lo que promete el punto
  anterior. Corregido en `js/motor-compartido.js`: ahora, si el motor real
  anuncia soporte pero su carga falla de verdad, cae automáticamente al
  motor de prueba (con el mensaje "🧪 Motor de prueba (el motor real no se
  pudo cargar)" y el motivo técnico visible debajo, en vez de ocultarlo).
  Cubierto por `test/e2e-fallback-motor.js`, que simula ese fallo exacto
  (adaptador WebGPU falso + red al CDN bloqueada) y comprueba que el chat
  sigue siendo utilizable.
- **La primera vez que abras "Mi profesor" en tu iPad real, con internet,
  verás si el motor real (etiqueta "⚡ Motor real (WebGPU)") carga y si
  responde con una calidad y una velocidad razonables.** Si ves la etiqueta
  "🧪 Motor de prueba (el motor real no se pudo cargar)", la app ya se ha
  recuperado sola — el chat sigue funcionando con respuestas de ejemplo —
  pero conviene mirar el motivo técnico que se muestra justo debajo del
  aviso (o la consola del navegador: en Safari, actívala desde Ajustes →
  Safari → Avanzado → Inspector Web) para saber si es falta de conexión,
  un bloqueo de red, o memoria insuficiente del dispositivo. Si en cambio
  ves directamente "⚠️ Motor no disponible" (sin haber pasado antes por el
  motor de prueba), es una situación distinta y más rara — revisa igualmente
  la consola del navegador para ver el motivo exacto.
- Si la calidad o la velocidad no son suficientes, el modelo usado se puede
  cambiar en `js/ia-motores.js` (constante `MODELO_WEBLLM`) por otro más
  pequeño (más rápido, menos capaz) o más grande (más lento, más capaz) del
  catálogo de [WebLLM](https://github.com/mlc-ai/web-llm), sin tocar el
  resto de la aplicación.
- La Fase 3 añade un uso nuevo de ese mismo motor: corregir preguntas
  abiertas y dar pistas de nivel fijo durante un control. Es el mismo
  motor compartido de "Mi profesor" y "Crear", así que si ese motor real
  funciona bien en tu iPad, esto también debería funcionar; conviene
  probar en concreto que la calificación que propone la IA para una
  pregunta abierta sea razonable (nunca se consolida sola: siempre hay que
  confirmarla desde el Panel de la Familia, así que un error puntual de la
  IA no llega a afectar al progreso del alumno, pero conviene comprobar
  que la propuesta ayuda de verdad y no es solo ruido).
- La Fase 4 añade un motor real más en la misma situación: el **OCR de
  "Escanea y aprende"** (Tesseract.js, `js/ocr.js`) tampoco se ha podido
  ejecutar ni una sola vez aquí, por el mismo motivo (sin acceso al CDN que
  lo sirve). Sigue exactamente el mismo patrón que WebLLM: motor real
  intentado primero, con caída automática a un motor de prueba claramente
  etiquetado si falla. **La primera vez que uses "Escanea y aprende" en tu
  iPad real, con internet**, comprueba si aparece la etiqueta "📷 Texto
  reconocido" (motor real) en vez de "🧪 Motor de prueba", y sobre todo
  comprueba que el texto reconocido de una foto real (con letra manuscrita
  o de imprenta, según lo que vayas a fotografiar de verdad) sea lo bastante
  fiable como para que revisarlo y corregirlo sea rápido y no una tarea en
  sí misma — la pantalla ya avisa de que siempre hay que revisarlo, pero la
  calidad real del reconocimiento en el navegador (normalmente algo menor
  que la de Vision/VisionKit nativos, según el propio documento) solo se
  puede valorar probándola de verdad.
- La Fase 5 no añade ningún motor nuevo — reutiliza el mismo motor
  compartido de IA de "Mi profesor"/"Crear"/controles —, pero sí añade un
  uso nuevo de él: cuando se activan "lenguaje más sencillo" o
  "instrucciones paso a paso" en Accesibilidad, se añaden instrucciones
  extra al system prompt (comprobado con una prueba unitaria pura, sin
  navegador, en `test/e2e-fase5.js`, de que el texto de la instrucción
  llega literal al prompt). Que el modelo real **obedezca** esa instrucción
  de verdad — y no solo que la reciba — es algo que, como con el resto del
  motor de IA, solo se puede comprobar en tu iPad real con internet.

## Cómo probarlo tú mismo ahora mismo, sin publicar nada todavía

No hace falta instalar nada especial. Con Python (que casi todos los
ordenadores tienen) basta:

```
cd edu_app_web
python3 -m http.server 8000
```

Y abre `http://localhost:8000` en el navegador de tu ordenador. Para
probarlo de verdad en un iPad antes de publicarlo, los dos ordenadores
tienen que estar en la misma red wifi y en el iPad hay que usar la
dirección IP del ordenador en vez de "localhost" (por ejemplo
`http://192.168.1.35:8000`).

## Cómo publicarlo de verdad (Fase -1 del documento)

### Opción recomendada: GitHub Pages

1. Crea una cuenta gratuita en [github.com](https://github.com) si no
   tienes una.
2. Crea un repositorio nuevo (por ejemplo, `mi-app-educativa`). Puede ser
   público o privado; para páginas privadas gratuitas necesitarías una
   cuenta de pago, así que si quieres privacidad total revisa la opción de
   Cloudflare Pages más abajo, o simplemente ten en cuenta que el
   contenido publicado (la app, no los datos de tus hijos, que nunca salen
   del iPad) sería visible para quien tenga el enlace.
3. Sube todo el contenido de esta carpeta (`edu_app_web`) al repositorio.
   La forma más sencilla si no conoces git: en la página del repositorio,
   "Add file" → "Upload files", y arrastra todos los archivos y carpetas.
4. En el repositorio, ve a "Settings" → "Pages". En "Source" elige
   "Deploy from a branch", rama `main` y carpeta `/ (root)`. Guarda.
5. Espera un minuto y GitHub te dará una URL parecida a
   `https://tu-usuario.github.io/mi-app-educativa/`.
6. Abre esa URL en Safari en el iPad, pulsa el botón de compartir y luego
   "Añadir a pantalla de inicio". Ya tienes un icono como el de cualquier
   otra app.

### Alternativa: Cloudflare Pages

1. Crea una cuenta gratuita en [pages.cloudflare.com](https://pages.cloudflare.com).
2. "Create a project" → "Upload assets" (no hace falta conectar ningún
   repositorio de git si no quieres) → sube el contenido de esta carpeta.
3. Cloudflare te da una URL del tipo `https://mi-app-educativa.pages.dev`.
4. Igual que arriba: abrirla en Safari en el iPad y "Añadir a pantalla de
   inicio".

Cualquiera de las dos cumple el criterio de aceptación de la Fase -1: una
URL propia por HTTPS, accesible desde el iPad e instalable en la pantalla
de inicio, sin usar nunca un Mac, Xcode ni ninguna cuenta de Apple.

## Actualizar la app más adelante

Cada vez que se añada una fase nueva (profesor IA, práctica, cuaderno...),
basta con volver a subir los archivos actualizados al mismo sitio (GitHub
Pages o Cloudflare Pages). La próxima vez que se abra la app en el iPad, el
`service-worker.js` detecta la versión nueva y la actualiza sola, sin
tener que desinstalar ni reinstalar nada.

## Cómo volver a ejecutar las pruebas automatizadas

Con el servidor local en marcha (ver más arriba) y Playwright instalado:

```
node test/e2e.js         # Fase 0: cuenta familiar, perfiles, aislamiento, cifrado, PIN
node test/e2e-fase1.js   # Fase 1: Mi profesor, pistas progresivas, motor de prueba, voz
node test/e2e-fase2.js   # Fase 2: Crear, generación, edición, versionado, aislamiento
node test/e2e-fase3.js   # Fase 3: Controles, corrección cerrada/abierta, confirmación, Progreso, cifrado
node test/e2e-fase4.js   # Fase 4: Cuaderno, Escanea y aprende (OCR), pizarra ligera en Practicar
node test/e2e-fase5.js   # Fase 5: criterio de evaluación, modelo educativo, explicabilidad, accesibilidad, sugerencias, Hoy tengo que estudiar
node test/e2e-fase6.js   # Fase 6: asignación diferenciada entre hermanos, excepciones, informes y adaptaciones desde el Panel de la Familia
node test/e2e-fase7.js   # Fase 7: puntos, racha amable, nivel, insignias y calendario de actividad
node test/e2e-fallback-motor.js  # Regresión: caída al motor de prueba cuando el motor real falla tras anunciar soporte
```

## Qué falta antes de seguir (todas las fases del documento están cubiertas)

Conforme al apartado 20 del documento de arquitectura (Conclusión y
próximos pasos):

1. Elegir el hosting (GitHub Pages o Cloudflare Pages) y publicarlo.
2. Confirmar cuántos hijos/as, qué curso y qué edad tiene cada uno, para
   dar de alta sus perfiles reales (ya puedes crearlos con el formulario de
   la Fase 0).
3. **Validar en el propio iPad la calidad y la velocidad del motor de IA
   real vía WebGPU** (ver el apartado de arriba): es el paso pendiente más
   importante antes de construir nada más encima del profesor IA, del
   generador de contenido y de la corrección de controles, que comparten
   ese mismo motor.
4. Ampliar `data/curriculo-cv.json` con más paquetes curriculares
   verificados (ahora mismo solo hay uno, de ejemplo) antes de que el
   profesor IA y el generador se usen de verdad en más materias y cursos.
5. Crear algunos controles reales desde el Panel de la Familia y comprobar
   con calma, en el iPad real, que las propuestas de calificación de la IA
   para preguntas abiertas son razonables antes de confiar en ellas para
   el día a día (recuerda: nunca se consolidan solas, siempre hace falta
   confirmarlas).
6. **Validar en el iPad real el trazo con Apple Pencil** (Cuaderno y
   pizarra): la Pointer Events API debería recibir la presión y la
   inclinación del Pencil igual que en una app nativa, pero aquí solo se ha
   podido probar con eventos de puntero simulados por ratón — conviene
   comprobar la fidelidad real del trazo (grosor, suavidad, latencia) antes
   de dar por hecho que sustituye a PencilKit sin pérdida perceptible.
7. **Validar el motor de OCR real** (Tesseract.js, ver el apartado de
   arriba) con fotos reales de ejercicios, y decidir si su precisión es
   suficiente o si conviene ajustar el idioma/los parámetros de
   reconocimiento en `js/ocr.js`.
8. Decidir, antes de abordar el reconocimiento automático de procedimientos
   en la pizarra (aplazado deliberadamente en esta fase por ser el mayor
   riesgo técnico del documento, apartado 1.4), con qué alcance muy
   reducido empezar — por ejemplo, un único tipo de operación aritmética
   sencilla — y con qué criterio de aceptación medir si la señal es lo
   bastante fiable como para mostrarla al alumno sin que parezca una
   corrección categórica que no es.
9. **Validar en el iPad real que el modelo de IA obedece de verdad los
   ajustes de accesibilidad** de la Fase 5 (lenguaje más sencillo,
   instrucciones paso a paso): aquí solo se ha podido comprobar que la
   instrucción llega bien redactada al prompt, no que el modelo la siga.
10. Usar la app varias semanas con datos reales antes de considerar construir
    la EstrategiaEfectiva, el nivel "automático" de adaptaciones o la
    clasificación completa de PatrónDeError (los tres aplazados
    deliberadamente en la Fase 5, ver más arriba): los tres necesitan un
    volumen de uso real que todavía no existe para no arriesgarse a afirmar
    o actuar sobre conclusiones sin suficiente evidencia.
11. Ampliar `data/curriculo-cv.json` con más criterios de evaluación
    verificados por materia/curso: cuantos más criterios reales haya, más
    fino podrá ser el modelo educativo del alumno de la Fase 5 (hoy, fuera
    del único paquete de ejemplo, las preguntas seguirán cayendo en el
    seguimiento por materia, que sigue funcionando pero es menos preciso).
12. Si hay más de un hijo/a en el mismo curso, probar de verdad la
    asignación diferenciada de la Fase 6 (crear un control compartido desde
    el Panel de la Familia, comprobar que cada hermano/a lo ve con sus
    propios ajustes de accesibilidad ya aplicados, y solo marcar una
    variante como excepción cuando de verdad haga falta un contenido
    distinto) antes de apoyarse en ella para el día a día.
13. **Usar la app de verdad varias semanas y comprobar que la gamificación
    de la Fase 7 se siente bien, no solo que calcula bien**: los puntos, la
    racha y las insignias ya funcionan correctamente sobre datos reales
    (probado con datos de prueba), pero solo con uso real de cada hijo/a se
    puede juzgar si el ritmo de puntos y logros anima sin presionar, y si
    el catálogo de insignias sigue teniendo sentido según van creciendo —
    esa calibración con criterio humano no la puede hacer ninguna prueba
    automatizada.
14. Decidir, con esas semanas de uso real ya acumuladas, si merece la pena
    construir los "retos" del apartado 2.2 (aplazados deliberadamente en
    la Fase 7, ver más arriba) y con qué umbrales concretos, ahora que ya
    habría datos reales con los que calibrarlos sin inventar cifras.
15. Si la Familia usa la app durante más de un curso escolar, valorar
    ampliar la analítica personal de la Fase 7 (hoy limitada a un
    calendario de los últimos 14 días) a una comparación real entre
    cursos, que hasta ahora no tenía ningún dato con el que compararse.

## Nota sobre el currículo cargado

`data/curriculo-cv.json` contiene, de momento, un único paquete curricular
verificado (Matemáticas, tercer ciclo de Primaria, con la fuente oficial
citada dentro del propio archivo) a modo de ejemplo del formato. El resto
de materias y cursos existen como estructura para poder crear los perfiles,
pero todavía no tienen contenido curricular cargado: la ingesta completa es
trabajo de una fase posterior, y la app está diseñada para decirlo
explícitamente en vez de inventar contenido curricular no verificado.
