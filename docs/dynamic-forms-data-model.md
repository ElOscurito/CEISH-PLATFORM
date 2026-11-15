# Tarea 5 — Modelo de datos de formularios dinámicos

> Actualización final del 15/11/2026: lint global sin errores (backend: 21 advertencias existentes; frontend: 0), compilaciones correctas, 55 pruebas backend y 16 de formularios aprobadas. Se repitieron 24 escenarios API con PostgreSQL y MinIO reales, 11 de navegador y 4 del visor Word. Véase [cierre de pendientes](dynamic-forms-completion.md). Las notas de validación por paso que aparecen debajo describen el estado histórico de ese paso.

## Alcance del paso 5

La migración `105-ext-dynamic-forms.sql` agrega seis tablas, sin modificar tablas
ni datos del flujo principal. El mismo bloque se incluye en `database/schema.sql`
para instalaciones nuevas. No configura formularios ni migra investigaciones
existentes automáticamente.

| Tabla | Función |
|---|---|
| `ext_form_definitions` | Identidad por destinatario y momento, y activación |
| `ext_form_versions` | Borrador, versión publicada o retirada; título y descripción |
| `ext_form_fields` | Campos o criterios propios de una versión, opciones y orden |
| `ext_form_instances` | Versión fijada a una investigación y ciclo |
| `ext_submission_field_values` | Respuestas por instancia y campo |
| `ext_form_response_files` | Metadatos y clave MinIO de cada archivo de respuesta |

`stage_number = 0` significa postulación inicial y solo admite investigador.
Los números 1 a 4 corresponden a Estructura, Metodología, Resultados y Formato.
Existe una definición por combinación destinatario/etapa; una versión puede
contener todos los bloques requeridos en ese momento.

## Publicación e historial

Solo puede existir un borrador y una versión publicada por definición. Publicar
requiere una transacción: bloquear la definición, retirar la versión vigente y
publicar el borrador, fijando `published_at`. Una versión retirada no se reactiva:
su contenido se copia a un nuevo borrador con otro número.

Los triggers impiden modificar contenido o campos publicados, cambiar el
destinatario/etapa de una definición, cambiar la versión de una instancia y
modificar respuestas o archivos después del envío. Las claves compuestas impiden
responder con un campo de otra versión. Los campos con respuestas no se eliminan
en cascada.

Cada corrección es otra instancia con `cycle_number` consecutivo y respuestas
independientes. El backend copiará la versión del ciclo anterior para conservar
los requisitos originales; no elegirá automáticamente la última publicación.
Una etapa nueva sí puede tomar la versión publicada vigente.

Eliminar una investigación mantiene la política existente: sus instancias,
respuestas y metadatos de archivos se eliminan en cascada. Conservar formularios
históricos no cambia la política de eliminación del expediente. La limpieza de
objetos MinIO debe gestionarse por servicio; SQL no borra objetos del almacenamiento.

## Contrato de respuestas para el backend (paso 6)

- `text` / `textarea`: cadena JSON.
- `single_select`: clave de opción como cadena JSON.
- `multi_select`: arreglo de claves, sin duplicados.
- `checkbox`: booleano JSON; si es obligatorio debe ser `true`.
- `file`: arreglo JSON de identificadores de `ext_form_response_files` de esa
  respuesta; se permite `[]` en borrador mientras se completa la carga.
- `criterion`: objeto `{ "status": "pending|approved|rejected", "observation": "...",
  "pageReference": null }`; página positiva cuando corresponda.

Las opciones se representan como `[{ "value": "clave", "label": "Texto" }]`.
SQL comprueba que sean un arreglo no vacío para selecciones; el backend validará
la estructura de cada opción, claves únicas, pertenencia de las respuestas y
coherencia entre destinatario y tipo (`criterion` solo para evaluador).

El envío deberá bloquear la instancia, validar todos los campos obligatorios y
los archivos, y marcarla como `submitted` con fecha dentro de la misma transacción.
Los triggers protegen la inmutabilidad; no sustituyen las validaciones de negocio,
la autorización por rol ni la comprobación de pertenencia a la investigación.
Las instancias previas a la creación de `submissions` requerirán orquestar la
postulación inicial desde el nuevo módulo de extensión; la FK exige que la
investigación exista al persistir la instancia.

## Migraciones y Prisma

La migración es repetible porque `scripts/migrate.mjs` recorre todos los SQL sin
registro de ejecución. Usa `IF NOT EXISTS` y reemplaza únicamente funciones y
triggers con prefijo `ext_`. No se modifican migraciones anteriores.

Los índices parciales, CHECK y triggers se mantienen en SQL: Prisma 5 no los
representa en el modelo. No aplicar `prisma db push` ni generar una migración
destructiva para reemplazarlos. Usar el mecanismo SQL del repositorio.

Antes de aplicar a una base existente, verificar respaldo y configuración del
entorno. Este paso prepara los archivos; no ejecuta la migración en la base real.
El checklist institucional del Anexo 12 no se altera.

## Validación del paso 5

- Prisma 5.22: esquema válido y cliente generado correctamente.
- Backend NestJS: compilación correcta con los nuevos modelos.
- PostgreSQL embebido (PGlite, base temporal): 27 escenarios correctos,
  incluyendo instalación limpia, repetición de la migración, actualización sin
  cambios en columnas ni registros core, aislamiento entre versiones, límites
  de archivos, inmutabilidad de envíos y correcciones con la versión original.
  En esa prueba se omitió únicamente CREATE EXTENSION pgcrypto; gen_random_uuid
  ya está disponible en el motor. No sustituye la futura integración con
  PostgreSQL 16 y MinIO del entorno del proyecto.
- Lint de backend ejecutado sin --fix: 5453 errores y 21 advertencias en los
  fuentes existentes, principalmente finales CRLF señalados por Prettier.
  Este paso no modifica esos fuentes ni la configuración de formato.
- La migración no se aplicó a la base real y no se cambió el frontend.
## Actualización de entrega

El paso 10 aplicó el esquema y las migraciones en PostgreSQL 16.15 aislado y completó 24 escenarios API, incluyendo concurrencia. El almacenamiento se probó con S3rver; MinIO real sigue pendiente. Consultar [resultados](dynamic-forms-testing.md) y [guía de entrega](dynamic-forms-delivery.md).
