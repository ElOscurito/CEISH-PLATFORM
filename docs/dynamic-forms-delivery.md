# Entrega de la Tarea 5: formularios dinámicos por etapas

Fecha: 15 de noviembre de 2026. Rama: `feature/tarea-5-formulario-dinamico-por-etapas`.

## Alcance entregado

El administrador configura los campos de la postulación inicial y de las cuatro etapas de revisión. Puede crear, editar, ordenar, quitar campos de un borrador y publicar versiones. El investigador responde texto corto, texto largo, selección única, selección múltiple, casillas y archivos. El evaluador dispone además de criterios con estado, observación y referencia de página.

Las respuestas pertenecen a una investigación y una versión concreta. Publicar cambios no modifica respuestas históricas ni formularios ya asignados. Las etapas nuevas toman la configuración publicada vigente. El checklist institucional del Anexo 12 mantiene su flujo independiente.

## Preparación e instalación

Esta guía describe el arranque desde el host, con PostgreSQL y MinIO accesibles desde ese equipo. Los comandos se ejecutan sobre una copia de esta rama. Para los requisitos generales e instalación inicial del núcleo, consultar el README del repositorio.

1. Instalar las dependencias usando los lockfiles del proyecto: ejecutar `npm ci` en `backend/` y en `frontend/`. Se necesita Node compatible con los paquetes instalados, npm, PostgreSQL 16 y MinIO.
2. Preparar `.env` en la raíz a partir de `.env.example`, conservando cualquier configuración existente. Establecer `DATABASE_URL`, `SESSION_SECRET`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET` y `MINIO_USE_SSL` para el entorno elegido. En el host, los valores habituales del Compose del proyecto son PostgreSQL en `localhost:5433`, MinIO en `localhost:9000` y Nest en `localhost:3000`. Un `.env` dentro de `backend/` tiene prioridad sobre el de la raíz.
3. Mantener en el entorno de Vite `VITE_USE_NEST_BACKEND=true` y `BACKEND_URL=http://localhost:3000`. Configurar `CORS_ORIGIN=http://localhost:5173` para ese origen de desarrollo. La API temporal de Vite no implementa los formularios dinámicos.
4. Tener el esquema del núcleo actualizado con sus migraciones anteriores, de 001 a 010. En una base existente, aplicar el SQL aditivo 105 con la API detenida. El ejemplo siguiente usa `psql` instalado en el host, desde la raíz del repositorio, y solicita la contraseña interactivamente:

   ```powershell
   psql -h localhost -p 5433 -U ceish_user -d ceish_db -W -v ON_ERROR_STOP=1 -1 -f database/migrations/105-ext-dynamic-forms.sql
   ```

   Ajustar host, puerto, usuario y base a la configuración real. Conservar un respaldo antes de actualizar una base con datos. Una instalación vacía incluye las tablas de esta extensión en `database/schema.sql`; las migraciones del núcleo siguen siendo necesarias para actualizar el resto del esquema. El SQL 105 es repetible. No reemplazarlo por `prisma db push`: contiene índices parciales, restricciones y triggers que Prisma no reproduce.
5. Verificar que estén presentes las seis tablas: `ext_form_definitions`, `ext_form_versions`, `ext_form_fields`, `ext_form_instances`, `ext_submission_field_values` y `ext_form_response_files`.
6. Desde `backend/`, generar el cliente y compilar:

   ```powershell
   npm run prisma:generate
   npm run build
   npm test -- --runInBand
   npm run start:dev
   ```

7. En otra terminal, desde `frontend/`:

   ```powershell
   npm run build
   node scripts/verify-dynamic-form.cjs
   npm run dev
   ```

El bucket debe estar disponible con permisos de escritura y lectura. Nest intenta crearlo al iniciar si no existe. Las descargas usan enlaces firmados; el endpoint de MinIO debe ser resoluble también desde el navegador que los abre. Esta guía de arranque desde el host evita usar el hostname interno `minio` como dirección del navegador.

## Uso por el administrador

1. Iniciar sesión como administrador y abrir **Formularios** (`/admin/formularios`).
2. Elegir destinatario y momento: investigador en postulación o etapas 1–4; evaluador en etapas 1–4. Existe una definición por combinación. Si ya existe, seleccionarla y editarla.
3. Agregar un campo, escribir su enunciado, elegir tipo y obligatoriedad. En selección única o múltiple, agregar opciones con texto y claves distintas. Los identificadores de campos y opciones pueden conservar sus valores generados.
4. Usar los botones de subir/bajar para ordenar. Quitar un campo lo retira solamente del borrador.
5. Pulsar **Guardar borrador** y después **Publicar versión**. Guardar por sí solo no cambia los requisitos de nuevas investigaciones.
6. Para modificar una publicación, usar **Editar en un borrador**, guardar y publicar nuevamente. Las versiones anteriores permanecen consultables.
7. Desactivar una definición evita nuevas asignaciones; las instancias ya asignadas conservan sus requisitos e historial.

## Uso por el investigador

1. Abrir **Nueva investigación**, completar título, documentos y campos adicionales. Los campos obligatorios se señalan antes del envío.
2. Adjuntar los archivos requeridos y enviar la investigación. La postulación se crea junto con sus respuestas; hasta ese momento los datos están en memoria y no existe un borrador persistente.
3. Cuando comience una etapa con formulario asignado, abrir **Formularios y respuestas** en esa investigación. Usar **Actualizar estado** si otra persona acaba de iniciar la revisión.
4. Completar los campos y usar **Guardar borrador** para continuar después, o **Enviar formulario** para finalizar. Los adjuntos se cargan inmediatamente. Una respuesta enviada queda de solo lectura.
5. Guardar antes de cambiar de pantalla: el aviso de cambios pendientes cubre cerrar o recargar la pestaña, pero no toda navegación interna.

## Uso por el evaluador

1. Abrir la investigación asignada y su revisión por etapas.
2. Consultar respuestas del investigador y completar los criterios de la etapa activa. En cada criterio se puede aprobar o rechazar, registrar observaciones y añadir página de referencia.
3. Guardar o enviar el formulario. Guardar un borrador no equivale a enviarlo.
4. Pulsar **Siguiente etapa** cuando ambos roles hayan enviado los formularios asignados. Si falta alguno, la API rechaza el avance y la pantalla muestra el motivo.
5. La etapa siguiente recibe la versión publicada en ese momento. Un formulario nuevo no se añade retroactivamente a una etapa ya activa. Las etapas sin criterios configurados conservan la plantilla de criterios del núcleo.

## Verificación de aceptación en el entorno receptor

Usar cuentas y expedientes de prueba. Crear un formulario inicial con los seis tipos y un formulario para cada rol en la etapa 1. Comprobar rechazo de campos obligatorios vacíos, envío válido, descarga de adjuntos desde el navegador, guardado de borrador y bloqueo de avance hasta ambos envíos. Publicar una versión nueva y confirmar que el expediente anterior conserva sus campos. Verificar que otro investigador y un evaluador sin relación con el expediente no accedan a respuestas o archivos. Finalmente, comprobar el avance de etapa y el historial en solo lectura.

La descarga y carga se repitieron contra **MinIO real** en el entorno local aislado, incluida la apertura de un adjunto desde Edge. En el entorno receptor se debe comprobar su propia configuración de red y almacenamiento.

## Resultado de las verificaciones

| Comprobación | Resultado final observado |
| --- | --- |
| Prisma y compilación NestJS | Correctos |
| TypeScript y compilación Vite | Correctos; aviso de tamaño del bundle |
| Backend | 55 pruebas aprobadas en 5 suites |
| Validación y renderizado frontend | 16 escenarios aprobados |
| Integración con PostgreSQL 16.15 y MinIO real | 24 escenarios aprobados, incluyendo concurrencia |
| Navegador Edge | 11 escenarios aprobados; sin errores JavaScript no capturados |
| Lint de archivos modificados | Sin errores; 9 advertencias `any` en servicios core |
| Lint global | Sin errores: 21 advertencias existentes en backend y ninguna en frontend |
| Visor Word en Edge | 4 escenarios aprobados: carga, error, cambio de URL y respuesta tardía |

Tras el paso 11 se corrigieron los dos pendientes solicitados: formato de finales de línea en Prettier y reinicio del visor Word mediante una instancia por URL. Se repitieron lint global, compilaciones, pruebas y flujos integrados. Para verificar lint sin modificar archivos, usar `npx eslint "{src,test}/**/*.ts"` desde backend y `npm run lint` desde frontend. El script `npm run lint` del backend incluye `--fix`.

Los 24 escenarios API y los 11 de navegador se ejecutaron con herramientas temporales de esta sesión y no están incorporados a CI. Las suites Jest y el script de frontend sí están en la entrega. Los servicios de prueba se cerraron después de la validación.

## Límites y estado de entrega

- PostgreSQL y MinIO se verificaron en un entorno local aislado, no en un despliegue productivo.
- El lint global ya no tiene errores; conserva 21 advertencias en servicios existentes del backend.
- Quitar adjuntos elimina sus metadatos del borrador; los objetos físicos requieren limpieza posterior. Las cargas previas a una transacción rechazada también pueden dejar objetos huérfanos.
- El formulario inicial no dispone de borrador persistente previo a crear el expediente. La navegación interna puede perder respuestas todavía no guardadas.
- El backend dispone de ciclos de corrección, pero esta entrega no incorpora un botón de apertura de correcciones en el panel de formularios.
- Los cambios permanecen locales en la rama de trabajo. No se creó commit, push ni pull request en los pasos 10 y 11.

## Documentación técnica del repositorio

Los detalles se encuentran en `docs/dynamic-forms-data-model.md`, `docs/dynamic-forms-api.md`, `docs/dynamic-forms-admin-ui.md`, `docs/dynamic-forms-renderer.md`, `docs/dynamic-forms-integration.md` y `docs/dynamic-forms-testing.md` y `docs/dynamic-forms-completion.md`.
