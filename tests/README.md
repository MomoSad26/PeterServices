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
- Envíos: balance con «Descontar ahora» Sí/No, deuda en «Pagar a», destinatario,
  mensaje al mensajero y aviso por WhatsApp al entregar.
- Deudas: las manuales de «Me deben» (tres tipos) abren su detalle; cobrar,
  eliminar y Deshacer ajustan el balance.
- Gastos y Ventas: efecto en el balance, eliminar y Deshacer.
- Respaldos: exportar cifrado e importar en otra instalación.
- Panel (recordatorio de deudas viejas), aviso de código de país y
  «Buscar actualizaciones».

## Al cambiar la app

Si una prueba falla tras un cambio intencionado (un texto, un id), actualiza
la prueba en el mismo commit. Si agregas una función con efecto en saldos o
deudas, agrega su comprobación en `run.js`.
