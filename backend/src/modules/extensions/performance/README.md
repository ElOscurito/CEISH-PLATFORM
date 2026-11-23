# Desempeño de miembros CEISH

El panel toma el padrón de usuarios que figuran como estratificadores o calificadores y cuyo rol actual se normaliza a `evaluator`. En PostgreSQL ese rol se guarda como `teacher`. El padrón se construye con asignaciones registradas y puede mostrar menos de nueve titulares. Una cuenta empieza a generar registros de acceso al entrar en ese padrón.

- Estratificación. Tiempo entre asignación y dictamen por ronda.
- Calificación inicial. Tiempo entre creación del caso y el primer Anexo 12 completado. Una solicitud de correcciones constituye un dictamen.
- Subsanación. Tiempo entre un reenvío y el siguiente Anexo 12 completado. Cuando el dictamen pide otra ronda, el sistema vincula el Anexo 12 al nuevo ciclo. La vista busca en el ciclo del reenvío y en el siguiente, hasta el próximo reenvío.
- Historial anterior. `reviewed_at` sirve de respaldo cuando corresponde al tramo. Si la revisión de un reenvío sobrescribió esa fecha y falta el Anexo 12 inicial, se excluye esa calificación inicial por falta de evidencia.
- Período. Las fechas son inclusivas en `America/Guayaquil`. Los dictámenes se filtran por su fecha y los accesos por la fecha del evento. Las revisiones pendientes se incluyen siempre y envejecen hasta hoy.
- Días hábiles. Se cuentan lunes a viernes excluyendo el día inicial e incluyendo el día final. El cálculo aún no contempla feriados.
- Métricas. La tasa a tiempo usa las revisiones cerradas en verde. La demora promedia los días que exceden el umbral rojo entre todas las revisiones con dictamen, con cero para las demás. El semáforo por miembro refleja el caso más severo incluido.
- Accesos. Solo se registran respuestas exitosas. Un cierre explícito se asocia al último inicio pendiente previo, cuando existe. Se cuentan como sesiones cerradas los inicios del período con duración conocida. Una sesión que expira sin cierre conserva la duración vacía. La auditoría es asíncrona y los fallos de persistencia se registran en el logger de NestJS.

La migración 107 instala el módulo de datos. El servicio combina fuentes con el mismo contrato de tiempos para poder agregar procesos de consultoría en una fase posterior.
