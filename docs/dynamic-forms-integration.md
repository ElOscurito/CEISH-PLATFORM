# Integración del paso 9

> Actualización final del 15/11/2026: lint global sin errores (backend: 21 advertencias existentes; frontend: 0), compilaciones correctas, 55 pruebas backend y 16 de formularios aprobadas. Se repitieron 24 escenarios API con PostgreSQL y MinIO reales, 11 de navegador y 4 del visor Word. Véase [cierre de pendientes](dynamic-forms-completion.md). Las notas de validación por paso que aparecen debajo describen el estado histórico de ese paso.

## Pantallas

«Nueva investigación» carga las preguntas vigentes de postulación. El investigador
rellena campos y adjunta archivos antes de enviar. No se crea una investigación
incompleta si falta una respuesta obligatoria. El formulario muestra errores y
bloquea doble clic durante el envío.

Cada tarjeta de investigación incluye «Formularios y respuestas»: historial inicial
y formularios de etapas que ya comenzaron. El propietario puede responder durante
la etapa activa. «Actualizar estado» consulta nuevamente la asignación y el cierre.

La pantalla de revisión muestra respuestas del investigador y criterios configurados
del evaluador. Los criterios predeterminados se conservan si no se publicó un
formulario de evaluación para esa etapa. El evaluador debe enviar su formulario;
avanzar comprueba también el envío del investigador. Las versiones anteriores se
consultan mediante los desplegables del historial.

Se corrigió el contrato de guardado: IDs de etapa, stage_number y pageNumber.
La UI conserva la etapa hasta confirmar el guardado del servidor y muestra errores.
El avance valida expectedStageId para rechazar solicitudes obsoletas.

## Implementación

Las extensiones exponen un endpoint multipart de postulación y funciones de
integración que se ejecutan dentro de las transacciones de SubmissionsService y
ReviewsService. Los controladores core no se modifican. No se cambian tablas core,
anexos ni el flujo de calificación del Anexo 12. No hay backfill de instancias.

La fijación por etapa ocurre en creación de revisión y avance, nunca al consultar.
Una etapa histórica ya activa conserva sus requisitos; su siguiente etapa puede
usar la configuración vigente cuando comience. Todas las mutaciones de respuestas
y de revisión bloquean la misma investigación antes de comprobar el estado.

## Verificación

- Backend: 49 pruebas de formularios, flujo y HTTP; 6 de autenticación.
- HTTP: servidor Nest local temporal, rutas reales y guard de roles real; Prisma,
  MinIO y autenticación de sesión se sustituyen por dobles en esa prueba.
- Frontend: TypeScript/Vite correctos y 16 escenarios de validación/renderizado.
- Lint de archivos cambiados: sin errores; 9 advertencias any preexistentes en
  servicios core. El lint global mantiene problemas anteriores documentados.
- Paso 10: 24 escenarios de integración con PostgreSQL real y 10 de navegador aprobados. Almacenamiento con S3rver y el cliente MinIO real; pendiente repetir contra un servidor MinIO. Véase dynamic-forms-testing.md.

Para ejecutar la aplicación se necesita aplicar la migración 105, generar Prisma,
arrancar Nest y PostgreSQL/MinIO y configurar VITE_USE_NEST_BACKEND=true. La API
temporal de Vite no incorpora estas capacidades. Las migraciones se probaron en una base PostgreSQL aislada con datos sintéticos. No se hizo commit, push o PR durante los pasos 9 y 10.

Las cargas MinIO preceden a la transacción de postulación; un rechazo posterior
puede dejar objetos huérfanos. La limpieza del almacenamiento sigue pendiente,
como se documentó en el paso 6. La postulación inicial no tiene borrador persistente
antes de crear el expediente: las respuestas se mantienen localmente hasta enviarlo.
