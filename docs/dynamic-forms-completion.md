# Cierre de pendientes — Tarea 5

Fecha: 15 de noviembre de 2026.

## Lint y visor Word

Se añadió `backend/.prettierrc.json` con `endOfLine: auto` para respetar los finales de línea de los archivos en Windows sin reformatear todo el núcleo. Las reglas de ESLint y Prettier siguen activas. El lint global termina con código 0: backend sin errores y con 21 advertencias existentes; frontend sin errores ni advertencias.

`DocxViewer` crea una instancia de `DocumentPreview` por URL. Al cambiar de documento, el estado de carga y error comienza nuevamente desde sus valores iniciales, sin llamar a setters de estado dentro del efecto para reiniciarlos. Se comprobó en Edge la carga de un DOCX, la presentación de un error de red, la recuperación al cambiar de URL y que una respuesta tardía no sustituya el documento actual. Las cuatro comprobaciones pasaron. El arnés simula las respuestas HTTP y renderiza el componente real; no se presenta como prueba de almacenamiento.

## MinIO real

Se compiló el código oficial del tag `RELEASE.2025-10-15T17-29-55Z`, commit `9e49d5e7a648`, con Go portátil 1.27.4. La descarga de Go se verificó con el SHA-256 publicado por el sitio oficial. El binario reporta `DEVELOPMENT.GOGET`; sus metadatos de módulo identifican `github.com/minio/minio v0.0.0-20251015172955-9e49d5e7a648`. No se utilizó S3rver en esta repetición.

Fuentes de instalación: [release oficial de MinIO](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z) y [descargas oficiales de Go](https://go.dev/dl/).

Se usó PostgreSQL 16.15 aislado y cinco cuentas sintéticas. MinIO escuchó en loopback, puerto 19000, con un directorio de datos de prueba independiente. NestJS utilizó su cliente MinIO habitual; no se modificó el servicio de almacenamiento ni la configuración de producción.

Las 24 pruebas de integración pasaron: autenticación, publicación, campos obligatorios, carga multipart, persistencia de respuestas y archivos, descarga firmada con comprobación de contenido, permisos, aislamiento de versiones, retirada de adjuntos del borrador, bloqueo de modificaciones de envíos, avance de etapas, estados cerrados y concurrencia.

Pasaron 11 escenarios de navegador con la aplicación real. Además del flujo de administración e investigación, Edge abrió un adjunto usando el botón «Abrir» y recibió HTTP 200 con contenido PDF desde el servidor MinIO real.

## Verificaciones repetidas

| Verificación | Resultado |
| --- | --- |
| Lint global backend | Código 0; 0 errores, 21 advertencias |
| Lint global frontend | Código 0; 0 errores, 0 advertencias |
| Compilación NestJS | Correcta |
| TypeScript y compilación Vite | Correctos; aviso de tamaño del bundle |
| Jest backend | 55 pruebas aprobadas, 5 suites |
| Validación y renderizado frontend | 16 escenarios aprobados |
| API con PostgreSQL y MinIO reales | 24 escenarios aprobados |
| Navegador con servicios reales | 11 escenarios aprobados |
| Regresión del visor Word | 4 escenarios aprobados |

Se invocaron las herramientas locales directamente con Node, equivalentes a los scripts del proyecto, porque npm no está disponible en esta estación. El lint del backend se ejecutó sin `--fix` para verificar sin reescribir archivos.

Los ejecutores y resultados de integración y navegador permanecen en `work/dynamic-forms/e2e` de la sesión local, fuera del repositorio y de CI. Los archivos `api-results.json`, `browser-results.json` y `docx-results.json` recogen la última ejecución; los resultados anteriores con S3rver se conservaron por separado.

## Estado final

Los dos pendientes solicitados —errores del lint global y verificación con MinIO real— están resueltos. Los servicios temporales se cerraron al terminar. No se creó commit, push ni pull request.

Se mantienen los límites funcionales ya documentados: limpieza física de objetos retirados o huérfanos, ausencia de borrador persistente de la postulación inicial, aviso incompleto ante navegación interna y ausencia de botón de correcciones en el panel. No se implementaron nuevas funciones para esos límites en esta corrección.
