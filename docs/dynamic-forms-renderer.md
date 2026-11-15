# Renderizador reutilizable — paso 8

> Actualización final del 15/11/2026: lint global sin errores (backend: 21 advertencias existentes; frontend: 0), compilaciones correctas, 55 pruebas backend y 16 de formularios aprobadas. Se repitieron 24 escenarios API con PostgreSQL y MinIO reales, 11 de navegador y 4 del visor Word. Véase [cierre de pendientes](dynamic-forms-completion.md). Las notas de validación por paso que aparecen debajo describen el estado histórico de ese paso.

`DynamicFormRenderer` es controlado: recibe fields, answers, onChange, errors,
readOnly, disabled, files y callbacks de archivos. Presenta texto corto/largo,
selección única/múltiple, consentimiento, archivos y criterios. No hace solicitudes
ni contiene un form; puede integrarse dentro de formularios existentes.

`DynamicFormSession` recibe instanceId, readOnly, onSubmitted y onDirtyChange.
Carga la instancia, conserva respuestas locales, guarda borradores, valida antes
del envío y utiliza los endpoints de archivos. Es un formulario completo: no debe
anidarse dentro de otro form. Cambiar instanceId reinicia el estado para evitar
mezclar respuestas entre investigaciones. El contenedor debe gestionar navegación
con cambios pendientes usando onDirtyChange. La sesión avisa al cerrar/recargar
la pestaña, pero no bloquea por sí sola la navegación interna de React Router.

Los adjuntos se guardan inmediatamente. Una carga no reemplaza respuestas de texto
pendientes. Las operaciones de escritura se serializan en la sesión; un envío
fallido deja el borrador guardado disponible para reintentar. El servidor conserva
la autoridad sobre permisos, etapa activa, validación e inmutabilidad.

El modo readOnly permite consultar adjuntos, pero deshabilita escritura. Los
formularios enviados entran automáticamente en ese modo. Hay errores por campo,
etiquetas, ayudas y mensajes accesibles; el envío lleva el foco al primer error.

Validación: TypeScript, Vite y lint de la extensión correctos. El script
`node scripts/verify-dynamic-form.cjs` (desde frontend) ejecuta 16 escenarios de
validación y renderizado HTML estático. No sustituye pruebas interactivas en navegador
ni integración con PostgreSQL/MinIO. El lint global conserva el error preexistente
de DocxViewer.tsx señalado en el paso 7.

El paso 9 incorpora DynamicFormRenderer a la postulación inicial y
DynamicFormSession al panel de cada investigación y al panel del evaluador.
Las instancias por etapa se crean en el servidor al comenzar la etapa, no desde
la pantalla. La postulación inicial usa un envío multipart único con documentos,
respuestas y adjuntos. El historial muestra respuestas anteriores en solo lectura.
Actualización de entrega: se aplicó la migración en PostgreSQL 16.15 aislado y se completaron las pruebas de navegador del paso 10. No se publicaron los cambios de implementación a GitHub. Véanse [resultados](dynamic-forms-testing.md) e [instrucciones de uso](dynamic-forms-delivery.md).
