// curriculum.js — Sistema curricular (Fase 0, apartado 6 del documento de arquitectura).
// Carga el paquete curricular local (data/curriculo-cv.json) y ofrece
// consultas por etapa, curso y materia. Nunca genera currículo nuevo: si no
// hay un paquete verificado para una combinación, lo dice explícitamente en
// vez de inventar contenido (regla del apartado 4.3 y C1 del análisis previo).

let cache = null;

export async function cargarCurriculo() {
  if (cache) return cache;
  const res = await fetch("data/curriculo-cv.json");
  if (!res.ok) throw new Error("No se ha podido cargar el sistema curricular local.");
  cache = await res.json();
  return cache;
}

export async function listarEtapas() {
  const c = await cargarCurriculo();
  return c.etapas.map((e) => ({ id: e.id, nombre: e.nombre }));
}

export async function listarCursos(etapaId) {
  const c = await cargarCurriculo();
  const etapa = c.etapas.find((e) => e.id === etapaId);
  return etapa ? etapa.cursos : [];
}

export async function listarMaterias(etapaId) {
  const c = await cargarCurriculo();
  const etapa = c.etapas.find((e) => e.id === etapaId);
  return etapa ? etapa.materias : [];
}

/** Busca los paquetes curriculares verificados para un curso y materia concretos. */
export async function paquetesParaCursoMateria(cursoId, materiaId) {
  const c = await cargarCurriculo();
  return c.paquetesCurriculares.filter(
    (p) => p.cursos.includes(cursoId) && p.materia === materiaId
  );
}

/** true si existe al menos un paquete verificado para esa combinación curso+materia. */
export async function hayContenidoVerificado(cursoId, materiaId) {
  const paquetes = await paquetesParaCursoMateria(cursoId, materiaId);
  return paquetes.some((p) => p.verificado);
}

/**
 * Fase 5, apartado 5.3: lista plana de criterios de evaluación verificados
 * para un curso y materia, con un identificador estable (paqueteId + código)
 * para poder vincular una pregunta de control a un criterio concreto. Se usa
 * para etiquetar el modelo educativo del alumno con algo más preciso que
 * "materia" cuando hay currículo verificado disponible; si no lo hay,
 * devuelve una lista vacía y el resto de la app debe seguir funcionando con
 * el nivel de detalle por materia, sin inventar criterios.
 */
export async function criteriosParaCursoMateria(cursoId, materiaId) {
  const paquetes = await paquetesParaCursoMateria(cursoId, materiaId);
  const criterios = [];
  for (const p of paquetes) {
    if (!p.verificado || !Array.isArray(p.criteriosEvaluacion)) continue;
    for (const c of p.criteriosEvaluacion) {
      criterios.push({
        id: `${p.id}::${c.codigo}`,
        codigo: c.codigo,
        texto: c.texto,
        paqueteId: p.id,
      });
    }
  }
  return criterios;
}

export async function metaCurriculo() {
  const c = await cargarCurriculo();
  return { version: c.version, comunidadAutonoma: c.comunidadAutonoma, notaAlcance: c.notaAlcance };
}
