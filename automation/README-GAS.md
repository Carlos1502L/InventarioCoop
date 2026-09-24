# 🤖 Guía de Configuración: Google Apps Script

Este script automatiza la lectura de correos de confirmación bancaria en Gmail y notifica en tiempo real a tu Backend para conciliar deudas al instante.

---

## 📋 Pasos de Instalación

1. **Abrir Google Apps Script:**
   - Entra a [https://script.google.com/](https://script.google.com/) con la misma cuenta de Gmail donde recibes los correos de **Yape**, **Plin** o **Mercado Pago**.
   - Haz clic en **"Nuevo proyecto"**.

2. **Pegar el Código:**
   - Borra el contenido de `Código.gs` y pega todo el contenido de [`google-apps-script.js`](./google-apps-script.js).
   - Nombra el proyecto arriba a la izquierda como: `Conciliador Automático Pagos`.

3. **Configurar Variables:**
   Modifica el bloque `CONFIG` en la cabecera:
   ```javascript
   const CONFIG = {
     WEBHOOK_URL: 'https://tu-servidor-o-ngrok.com/api/webhook/payment', // o tu Supabase Edge Function
     WEBHOOK_SECRET: 'tu_clave_secreta_super_segura_12345',
     PROCESSED_LABEL: 'Pagos_Conciliados_Bot',
     MAX_THREADS_PER_RUN: 15,
     DEBUG_MODE: true
   };
   ```

4. **Probar el Parser (Opcional pero Recomendado):**
   - En el selector de funciones, selecciona `testSampleParser` y haz clic en **Ejecutar**.
   - Revisa el panel inferior de "Registro de ejecución" para verificar que los Regex extraen correctamente los nombres y montos.

5. **Autorizar Permisos:**
   - Al ejecutar por primera vez, Google solicitará permisos para leer tu Gmail y hacer peticiones HTTP (`UrlFetchApp`).
   - Concede los permisos requeridos.

6. **Activar el Disparador Automático (Trigger):**
   - En el selector de funciones, selecciona `setupAutomatedTrigger` y haz clic en **Ejecutar**.
   - ¡Listo! A partir de ese momento, el script se ejecutará automáticamente cada 2 minutos en los servidores de Google Cloud (no necesitas tener la computadora encendida).
