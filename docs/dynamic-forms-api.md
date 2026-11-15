# API de formularios dinámicos — paso 6

> Actualización final del 15/11/2026: lint global sin errores (backend: 21 advertencias existentes; frontend: 0), compilaciones correctas, 55 pruebas backend y 16 de formularios aprobadas. Se repitieron 24 escenarios API con PostgreSQL y MinIO reales, 11 de navegador y 4 del visor Word. Véase [cierre de pendientes](dynamic-forms-completion.md). Las notas de validación por paso que aparecen debajo describen el estado histórico de ese paso.

Todas las rutas llevan `/api`. Requieren sesión; configuración reservada a admin.

## Configuración

- GET `/extensions/admin/forms`: definiciones, versiones y campos.
- POST `/extensions/admin/forms`: `{targetAudience, stageNumber, title}`.
- POST `/extensions/admin/forms/:id/draft`: crear/reutilizar borrador copiando la última versión.
- PUT `/extensions/admin/forms/:id/draft`: `{title, description, fields}`; reemplaza los campos del borrador. El orden del arreglo define displayOrder. Cada campo: `{fieldKey,label,fieldType,isRequired,options,placeholder,helpText}`.
- POST `/extensions/admin/forms/:id/publish`: retirar publicación anterior y publicar borrador en una transacción.
- PATCH `/extensions/admin/forms/:id`: `{isActive: boolean}`. Retira el formulario de nuevas asignaciones conservando historial.

Los campos se agregan, editan, eliminan y reorganizan enviando el arreglo completo del borrador. Las versiones publicadas son inmutables. Destinatarios: researcher_submission y evaluator_criteria. Etapa 0 significa postulación; 1..4, revisión. Evaluador admite únicamente criterion.

## Respuestas

- GET `/extensions/submissions/:id/forms`: configuraciones activas publicadas.
- GET `/extensions/submissions/:id/form-instances`: historial autorizado.
- POST `/extensions/submissions/:id/forms/:formId/start`: recuperar una instancia asignada al iniciar la etapa; nunca agrega requisitos retroactivos.
- GET `/extensions/form-instances/:id`: campos, respuestas y archivos.
- PUT `/extensions/form-instances/:id/answers`: `{answers:[{fieldId,value}]}`; null borra una respuesta en borrador. Archivos usan sus endpoints específicos.
- POST `/extensions/form-instances/:id/submit`: validar obligatorios y cerrar. Repetir en una etapa aún activa devuelve el envío existente.
- POST `/extensions/form-instances/:id/corrections`: siguiente ciclo vacío, misma versión; repetir desde el ciclo original devuelve el siguiente ya creado.
- POST `/extensions/form-instances/:id/fields/:fieldId/files`: multipart `file`; Word/PDF, 15 MB, máximo 10 por campo.
- DELETE `/extensions/form-instances/:id/files/:fileId`: retirar archivo de un borrador.
- GET `/extensions/form-files/:id`: URL temporal autorizada.

El investigador solo escribe en su expediente; el evaluador debe tener asignación y, si existe revisión, ser su revisor. Admin consulta sin responder en nombre de otros. No se escribe en investigaciones cerradas ni en etapas inactivas. El investigador no consulta criterios de evaluación mediante esta API.

El bloqueo de filas serializa publicación, inicio, guardado y envío. Los triggers del paso 5 refuerzan las restricciones. Respuestas con campos de otra versión se rechazan. La validación de valores ocurre antes del guardado y nuevamente antes del envío.

## Integración del paso 9

- GET `/extensions/submission-intake`: versión vigente de postulación, o null.
- POST `/extensions/submission-intake`: multipart con `documents` (hasta 10),
  `attachments` (hasta 100 en total) y `payload` JSON:
  `{title,comment,versionId,answers,attachmentFields}`. attachmentFields contiene
  un ID de campo por archivo, en el mismo orden. El propietario se toma de la sesión.
- La investigación, sus respuestas iniciales y los metadatos de archivos se guardan
  en una transacción. La versión inicial queda enviada. Si cambió la publicación,
  se rechaza y se pide abrir nuevamente la postulación.
- El servicio core de creación también valida requisitos: llamar directamente
  al endpoint anterior no permite omitir un formulario inicial publicado.
- Cada etapa fija las versiones vigentes cuando comienza. Los criterios dinámicos
  sustituyen la plantilla predeterminada solo en esa etapa nueva. Una etapa ya
  activa antes de esta integración conserva sus criterios y requisitos.
- El guardado de revisión comprueba pertenencia de etapas/criterios y secuencia.
  `expectedStageId` identifica la etapa sobre la que actuó el cliente; solicitudes
  antiguas no pueden modificar una etapa posterior. Todos los formularios asignados
  a la etapa deben estar enviados para completarla.
- El historial devuelve `canRespond` por instancia según usuario, etapa y cierre.
  start recupera instancias existentes; no las crea desde un GET ni bajo demanda.
- El checklist institucional del Anexo 12 conserva su flujo independiente.

## Archivos y límites de validación

La carga usa MinioService y claves independientes. DELETE retira metadatos del borrador; el objeto físico queda para una limpieza posterior. Si MinIO acepta una carga y la transacción falla, puede quedar un objeto huérfano. No se implementa borrado físico automático en este paso. La aceptación de archivos usa extensión y tamaño, igual que el servicio existente; no incluye inspección antivirus ni del contenido binario.

## Comprobaciones

49 pruebas de formularios/flujo/HTTP aprobadas; 6 pruebas de autenticación aprobadas; generación Prisma, compilación Nest y lint del módulo correctos. Las pruebas de servicio usan dobles de Prisma y MinIO: no demuestran concurrencia real ni integración de almacenamiento. El paso 5 comprobó restricciones SQL en PostgreSQL embebido. El paso 10 completó 24 escenarios con PostgreSQL 16.15 real, incluyendo concurrencia, y almacenamiento S3rver mediante el cliente MinIO. Sigue pendiente repetir contra un servidor MinIO real. Véanse [resultados](dynamic-forms-testing.md).

Comando para el módulo desde backend:
`npm test -- --runInBand` (incluye autenticación y formularios dinámicos).

La migración se aplicó solamente a una base aislada de prueba. No se publicaron estos cambios de implementación en GitHub.
