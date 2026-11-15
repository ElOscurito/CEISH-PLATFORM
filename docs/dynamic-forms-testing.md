# Tarea 5 — Verificación del paso 10

Fecha: 2026-11-15. Actualizado tras resolver los pendientes solicitados. Rama: `feature/tarea-5-formulario-dinamico-por-etapas`.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Compilación NestJS | Correcta |
| Generación Prisma 5.22 | Correcta |
| Backend Jest | 55 pruebas, 5 suites aprobadas |
| TypeScript y compilación Vite | Correctos; aviso de tamaño de bundle |
| Validación y renderizado React | 16 escenarios aprobados |
| Integración API, PostgreSQL y MinIO real | 24 escenarios aprobados |
| Navegador Edge con Playwright | 11 escenarios aprobados; sin errores JavaScript no capturados |
| Lint de archivos modificados | Sin errores; 9 advertencias `any` en servicios core |
| Lint global | Sin errores; 21 advertencias existentes en backend y 0 en frontend |
| Regresión del visor Word en Edge | 4 escenarios aprobados |
| git diff --check | Sin errores |

## Entorno y alcance

PostgreSQL 16.15 portátil, base aislada con cinco cuentas sintéticas; esquema y migraciones aplicados. API NestJS y frontend Vite reales. Puertos de prueba: 15432, 13000, 15173 y 19000, en loopback. Los servicios se cerraron al terminar. No se modificó una base de producción.

Primero se verificó S3rver 3.7.1. En el cierre de pendientes se repitieron las pruebas con un servidor MinIO real compilado del tag oficial RELEASE.2025-10-15T17-29-55Z (commit 9e49d5e7a648), mediante Go portátil 1.27.4. Se validaron cargas multipart, descargas firmadas, contenido de archivos y retirada de metadatos de adjuntos. Edge abrió correctamente un PDF firmado desde MinIO. Docker no estaba disponible; todos los servicios se ejecutaron directamente en Windows.

Las pruebas API ejercitaron autenticación real, permisos por rol y pertenencia, obligatoriedad de respuestas, bloqueo del endpoint antiguo para evitar saltarse el formulario inicial, seis tipos de campo, adjuntos, asignación de formularios al iniciar etapas, conservación de versiones e historial y finalización de las cuatro etapas. También probaron publicación concurrente, creación concurrente de borradores, envíos repetidos y avances simultáneos con una sola transición efectiva. Las investigaciones cerradas rechazaron escrituras.

La creación de investigaciones asigna automáticamente un estratificador. La cuenta de prueba de acceso denegado se mantuvo sin asignación al expediente; de lo contrario su lectura estaría autorizada por el flujo existente.

Las pruebas de navegador cubrieron administración, edición, orden y publicación; diseño del constructor a 390 px sin desbordamiento horizontal; bloqueo de acceso del investigador al administrador; validación del formulario inicial y envío de sus seis tipos de campo; respuestas del investigador y evaluador; bloqueo del avance con formularios pendientes y avance exitoso tras ambos envíos. Se revisaron capturas de escritorio y móvil.

## Correcciones detectadas en navegador

- Eliminada la entrada duplicada «Formularios» del menú.
- AppShell espera la restauración de sesión antes de redirigir al inicio de sesión.
- El modal de investigación limita su altura y permite desplazar el contenido, manteniendo accesibles encabezado y botones de envío incluso con formularios largos.

## Repetir las comprobaciones versionadas

Desde `backend/`: `npm run prisma:generate`, `npm run build`, `npm test -- --runInBand`. Para revisar sin aplicar correcciones automáticas: `npx eslint "{src,test}/**/*.ts"`.

Desde `frontend/`: `npm run build`, `node scripts/verify-dynamic-form.cjs`, `npm run lint`.

En esta estación se invocaron las herramientas directamente con Node porque npm no estaba disponible y pnpm intentó reinstalar automáticamente. Se restauraron las dependencias existentes y no se incorporó un nuevo lockfile.

Los ejecutores y resultados de integración/navegador permanecen en el directorio temporal de trabajo de esta sesión (`work/dynamic-forms/e2e`); no forman parte de la suite Jest ni de CI. Requieren preparar una base aislada, cuentas y servicios de prueba antes de ejecutarse.

## Límites pendientes

- El entorno receptor debe verificar su propia red y configuración. MinIO real quedó comprobado localmente.
- El lint global no tiene errores; conserva 21 advertencias en backend.
- Las cargas previas a una transacción rechazada pueden dejar objetos huérfanos, como se documenta en la integración. No se ha implementado su limpieza automática.
- El formulario inicial conserva respuestas en memoria hasta el envío; no ofrece borrador persistente antes de crear la investigación.

No se creó commit, push ni pull request en este paso.

## Cierre de pendientes

Ver [detalle y evidencia](dynamic-forms-completion.md). Se repitieron las compilaciones, las 55 pruebas backend y las 16 del frontend después de corregir el visor Word y configurar Prettier para finales de línea del archivo.
