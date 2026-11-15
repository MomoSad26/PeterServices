# Pruebas automáticas

Abren la web en un navegador real (Chromium, vía Playwright) con una base de
datos vacía y **datos ficticios**, y recorren los flujos principales. No
tocan datos reales ni compilan la APK.

## Ejecutar

```bash
cd tests
npm install
npx playwright install chromium   # solo la primera vez
npm test
```

Termina con `Resultado: N OK, 0 fallos` (código de salida 0) o lista cada
fallo (código 1).

En GitHub: Actions → **Pruebas** → *Run workflow*. Es solo manual
(`workflow_dispatch`), igual que la compilación de la APK.

## Qué cubren

- Coherencia de archivos: cada script de `index.html` está en `sw.js` y existe.
- Todas las rutas del menú abren sin errores de JavaScript; Ajustes es el último menú.
- Envíos: entrega global sin destinatarios, uno o varios splits, clonación de
  valores globales, balances y deudas, edición con pagos previos y mensajes
  de WhatsApp independientes por destinatario, incluso para deudas antiguas
  que no guardaban el identificador del split.
- Deudas: edición restringida a registros manuales pendientes en «Me deben» y
  «Pagar a», incluidos los agrupados por comprador; las automáticas y cerradas
  no ofrecen Editar. También se comprueban cobro, eliminación y Deshacer.
- Gastos y Ventas: efecto en el balance, eliminar y Deshacer.
- Respaldos: exportar cifrado e importar en otra instalación.
- Panel (recordatorio de deudas viejas), aviso de código de país y
  «Buscar actualizaciones».

## Al cambiar la app

Si una prueba falla tras un cambio intencionado (un texto, un id), actualiza
la prueba en el mismo commit. Si agregas una función con efecto en saldos o
deudas, agrega su comprobación en `run.js`.
