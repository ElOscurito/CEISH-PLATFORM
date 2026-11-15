# Tarea 4 · Registro y admisión de investigadores externos

Módulo de Vinculación que agrega un proceso formal de admisión para personas que no pertenecen a la ULEAM. El investigador externo certifica su filiación, adjunta la carta de aval de su institución y declara si existe convenio con la ULEAM; el administrador verifica el expediente y, si lo aprueba, se habilita la cuenta con rol `student` mediante el flujo troncal de solicitudes de registro.

Especificación de origen: `ESPECIFICACION_MODULOS_VINCULACION_CEISH.md`, sección «Tarea 4».

## Flujo

```mermaid
flowchart LR
  A[Investigador externo\n/registro-externo] -->|POST multipart| B[NestJS\nExternalResearchersModule]
  B -->|Carta PDF| M[(MinIO\nbucket documents)]
  B -->|registration_requests\n+ ext_external_researcher_dossiers| D[(PostgreSQL)]
  C[Administrador\n/admin/expedientes-externos] -->|GET / PATCH verify| B
  B -->|reviewRequest| R[RegistrationRequestsService\n(flujo troncal)]
  R -->|users + researcher_profiles| D
```

1. El investigador envía el formulario de `/registro-externo`. El servidor valida los campos, comprueba que el archivo sea un PDF real (extensión y firma `%PDF-`) de hasta 10 MB y que el correo no tenga cuenta ni solicitud previa.
2. La carta se sube a MinIO. En una sola transacción se crean la solicitud en `registration_requests` (`researcher_type = 'external'`, `status = 'pending'`) y su expediente en `ext_external_researcher_dossiers` (`verification_status = 'under_review'`).
3. Mientras está pendiente, el inicio de sesión responde «Tu solicitud aún está pendiente de aprobación» (comportamiento troncal).
4. El administrador revisa el expediente y la carta en **Externos** y emite uno de tres dictámenes:
   - `verified_with_agreement`: aprobado con convenio verificado (el nombre o código es obligatorio).
   - `verified_without_agreement`: aprobado sin convenio vigente.
   - `rejected`: rechazado.
5. Al aprobar, el módulo llama a `RegistrationRequestsService.reviewRequest(..., 'approved')`, que crea el usuario con rol `student` y su `researcher_profile`; luego vincula `user_id` al expediente. Al rechazar, la solicitud queda `rejected` y el login lo informa.

### Reglas de negocio

- Lo que declara el investigador (`agreement_code_or_name`) nunca se modifica. El convenio confirmado por el administrador se guarda aparte en `verified_agreement_code_or_name`.
- Las observaciones son obligatorias al rechazar y al aprobar sin convenio a un investigador que declaró uno.
- Un expediente solo se dictamina una vez. El dictamen reclama el registro de forma atómica (`updateMany ... where verification_status = 'under_review'`), así que dos administradores no pueden dictaminar el mismo caso. Si la creación de la cuenta falla, el expediente vuelve a `under_review`.
- Campos de texto con mínimo de 2 caracteres (nombre, institución, país, cargo y convenio). Todos los mensajes de validación están en español.

## Base de datos

Migración: `database/migrations/104-ext-external-researchers.sql` (idempotente; reflejada en `database/schema.sql`). Modelo Prisma: `ExtExternalResearcherDossier`, sin `@relation` para no modificar los modelos troncales; las llaves foráneas existen en PostgreSQL.

| Columna | Tipo | Descripción |
| --- | --- | --- |
| `id` | UUID | Identificador del expediente |
| `registration_request_id` | UUID, único | Solicitud troncal asociada (`ON DELETE CASCADE`) |
| `user_id` | UUID, nulo | Usuario creado al aprobar (`ON DELETE CASCADE`) |
| `home_institution` | VARCHAR(200) | Institución de procedencia |
| `institution_country` | VARCHAR(100) | País de la institución |
| `position_role` | VARCHAR(120) | Cargo en la institución |
| `has_uleam_agreement` | BOOLEAN | Si el investigador declaró convenio |
| `agreement_code_or_name` | VARCHAR(200) | Convenio declarado por el investigador |
| `verified_agreement_code_or_name` | VARCHAR(200) | Convenio confirmado por el administrador |
| `endorsement_letter_name` | VARCHAR(255) | Nombre original de la carta |
| `endorsement_letter_path` | TEXT | Clave del objeto en MinIO |
| `verification_status` | VARCHAR(30) | `under_review`, `verified_with_agreement`, `verified_without_agreement`, `rejected` |
| `admin_notes` | TEXT | Observaciones del dictamen |
| `verified_by` | UUID | Administrador que dictaminó (`ON DELETE SET NULL`) |
| `verified_at`, `created_at` | TIMESTAMPTZ | Fechas de dictamen y de registro |

Para aplicar la migración en una base existente sin borrar datos:

```powershell
Get-Content database\migrations\104-ext-external-researchers.sql | docker exec -i ceish_postgres psql -U ceish_user -d ceish_db
```

## API

Módulo: `backend/src/modules/extensions/external-researchers/`. Todas las rutas usan `AuthGuard` y `RolesGuard`; los errores siguen el formato JSON de `HttpExceptionFilter`.

| Método y ruta | Acceso | Descripción |
| --- | --- | --- |
| `POST /api/extensions/auth/register-external` | Público | Registro `multipart/form-data` con la carta |
| `GET /api/extensions/admin/external-dossiers[?status=]` | Admin | Lista de expedientes, filtrable por estado |
| `GET /api/extensions/admin/external-dossiers/:id` | Admin | Detalle de un expediente |
| `GET /api/extensions/admin/external-dossiers/:id/letter` | Admin | Carta de aval en PDF (`inline`) |
| `PATCH /api/extensions/admin/external-dossiers/:id/verify` | Admin | Dictamen del expediente |

**Registro** (campos del formulario): `name`, `email`, `password`, `homeInstitution`, `institutionCountry`, `positionRole`, `hasUleamAgreement` (`"true"`/`"false"`), `agreementCodeOrName` (obligatorio si hay convenio) y el archivo `endorsementLetter`. Respuesta `201`: `{ "message": "Solicitud enviada. ..." }`.

**Dictamen** (JSON): `{ "decision": "verified_with_agreement" | "verified_without_agreement" | "rejected", "adminNotes"?: string, "agreementCodeOrName"?: string }`. Responde el expediente actualizado.

Respuestas de error principales: `400` validación o archivo no PDF; `401` sin sesión; `403` rol distinto de admin; `404` expediente o carta inexistente; `409` correo ya registrado o expediente ya dictaminado; `413` carta mayor a 10 MB.

## Frontend

| Ruta | Componente | Acceso |
| --- | --- | --- |
| `/registro-externo` | `ExternalRegistrationPage` | Pública |
| `/admin/expedientes-externos` | `ExternalDossiersPanel` + `ExternalDossierAdminModal` | Admin (menú «Externos») |

Archivos en `frontend/src/features/extensions/external-researchers/` y servicio en `frontend/src/services/externalResearcherService.ts`. Requiere `VITE_USE_NEST_BACKEND=true`; el plugin transitorio de Vite no implementa estas rutas.

Cambios mínimos en pantallas existentes:

- `RegistrationForm.tsx`: al elegir «Investigador externo» muestra un aviso con enlace a `/registro-externo` en lugar de enviar la solicitud general.
- `RegistrationRequestsPanel.tsx`: las solicitudes con expediente muestran la etiqueta «Con expediente de admisión» y el botón «Revisar expediente» en lugar de Aceptar/Rechazar.
- `router/index.tsx` y `AppShell.tsx`: rutas nuevas y opción «Externos» del menú de administrador.
- `app.module.ts`: registro de `ExternalResearchersModule`.

## Diferencias respecto de la especificación

| Especificación | Implementación | Motivo |
| --- | --- | --- |
| `verification_status VARCHAR(20)` | `VARCHAR(30)` | `verified_without_agreement` tiene 26 caracteres |
| `registration_request_id` opcional + índice | Obligatorio y único | Cada solicitud externa tiene exactamente un expediente |
| Sin convenio verificado | Columna `verified_agreement_code_or_name` | Conservar lo declarado y lo verificado por separado |
| Carta en `documents/external-dossiers/` | Clave `documents/<uuid>.pdf` | Reutiliza `MinioService.uploadDocument` sin modificar el núcleo |
| Endpoints de lista y dictamen | Además, detalle y descarga de la carta | Necesarios para el visor del administrador |

## Limitaciones conocidas

- No hay notificaciones por correo (pendiente a nivel de todo el sistema según `contexto/README.md`); el investigador conoce el resultado al iniciar sesión.
- La ruta del investigador sigue siendo `/estudiante` y el rol `student`, definidos por el flujo troncal.
- Si la base de datos falla después de subir la carta, el archivo queda en MinIO sin expediente asociado.
