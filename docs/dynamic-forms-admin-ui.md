# Constructor administrativo — paso 7

> Actualización final del 15/11/2026: lint global sin errores (backend: 21 advertencias existentes; frontend: 0), compilaciones correctas, 55 pruebas backend y 16 de formularios aprobadas. Se repitieron 24 escenarios API con PostgreSQL y MinIO reales, 11 de navegador y 4 del visor Word. Véase [cierre de pendientes](dynamic-forms-completion.md). Las notas de validación por paso que aparecen debajo describen el estado histórico de ese paso.

Ruta: `/admin/formularios`, menú «Formularios», disponible únicamente para admin.

Permite crear una definición por destinatario/etapa, agregar campos, cambiar tipos,
configurar obligatoriedad y opciones, ordenar con botones, quitar campos del borrador,
guardar, publicar, consultar versiones anteriores y activar/desactivar formularios.
Las versiones publicadas son de solo lectura. «Editar en un borrador» copia su
configuración. Para publicar hay que guardar previamente el borrador.

La pantalla consume los endpoints NestJS del paso 6. Para usarla deben estar
aplicada la migración 105, NestJS y PostgreSQL en ejecución, y el frontend configurado
con VITE_USE_NEST_BACKEND=true. La API temporal de Vite no implementa esta función.
Los errores de carga/guardado se muestran en pantalla. No se usan datos simulados
ni se modificó la configuración del entorno local.

Validación: TypeScript y Vite compilan; lint de los tres archivos TSX modificados
correcto. Lint general falla en DocxViewer.tsx por setState dentro de useEffect,
archivo preexistente ajeno a este paso. Vite advierte sobre tamaño del paquete.
Actualización de entrega: el paso 10 validó el constructor y el flujo en Edge con PostgreSQL 16.15 aislado. La migración se aplicó a esa base de prueba. El almacenamiento se verificó con S3rver y el cliente MinIO; falta repetir contra MinIO real. Véanse [resultados](dynamic-forms-testing.md) e [instrucciones de entrega](dynamic-forms-delivery.md).
