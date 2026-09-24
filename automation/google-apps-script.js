/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: CONCILIADOR AUTOMÁTICO DE PAGOS (GMAIL -> BACKEND WEBHOOK)
 * ==============================================================================
 * Este script monitorea correos entrantes de confirmación de Yape, Plin y
 * Mercado Pago, extrae los datos mediante Regex y los envía al Webhook del Backend.
 * 
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. Ve a https://script.google.com/ e inicia sesión con tu cuenta de Gmail.
 * 2. Crea un "Nuevo proyecto" y pega todo este código reemplazando el contenido.
 * 3. Actualiza las constantes WEBHOOK_URL y WEBHOOK_SECRET en CONFIG.
 * 4. Ejecuta la función `setupAutomatedTrigger()` una sola vez para activar el
 *    disparador automático cada 1 o 2 minutos.
 * ==============================================================================
 */

const CONFIG = {
  // URL de tu Backend (Node.js/Express vía ngrok o tu Supabase Edge Function)
  WEBHOOK_URL: 'https://mhuzjilreypmjlvbddss.supabase.co/functions/v1/webhook-payment',

  // Clave secreta configurada en tu Backend (.env) o perfil
  WEBHOOK_SECRET: 'tu_clave_secreta_super_segura_12345',

  // Habilitar/Deshabilitar pasarelas a monitorear:
  ENABLE_YAPE: true,          // ✅ Validar correos de Yape
  ENABLE_PLIN: true,          // ✅ Validar correos de Plin
  ENABLE_MERCADO_PAGO: false, // ❌ Desactivado (solo Yape y Plin)

  // Etiqueta de Gmail para marcar correos ya procesados y evitar duplicados
  PROCESSED_LABEL: 'Pagos_Conciliados_Bot',

  // Máximo de hilos a procesar por ejecución para no exceder cuotas de Google
  MAX_THREADS_PER_RUN: 15,

  // Modo depuración (muestra logs detallados en la consola de Apps Script)
  DEBUG_MODE: true
};

/**
 * Función principal que se ejecuta periódicamente mediante el Trigger de tiempo.
 */
function processIncomingPaymentEmails() {
  const label = getOrCreateLabel(CONFIG.PROCESSED_LABEL);

  // Construir filtros según las pasarelas activadas
  const providerFilters = [];
  if (CONFIG.ENABLE_YAPE) {
    providerFilters.push('from:yape.com.pe OR "te yapeó" OR "te yapearon" OR "Confirmación de pago"');
  }
  if (CONFIG.ENABLE_PLIN) {
    providerFilters.push('"Plin" OR "hicieron un Plin" OR "te transfirió" OR from:plin.pe');
  }
  if (CONFIG.ENABLE_MERCADO_PAGO) {
    providerFilters.push('"Mercado Pago" OR from:mercadopago.com OR "Recibiste un pago"');
  }

  if (providerFilters.length === 0) {
    Logger.log('⚠️ Ninguna pasarela está activada en CONFIG.');
    return;
  }

  // Consulta de búsqueda en Gmail: Correos no leídos y no etiquetados previamente
  const searchQuery = [
    `-label:${CONFIG.PROCESSED_LABEL}`,
    'newer_than:2d',
    '(',
    providerFilters.join(' OR '),
    ')'
  ].join(' ');

  if (CONFIG.DEBUG_MODE) {
    Logger.log('🔍 Buscando correos con query: ' + searchQuery);
  }

  const threads = GmailApp.search(searchQuery, 0, CONFIG.MAX_THREADS_PER_RUN);
  Logger.log(`📬 Se encontraron ${threads.length} hilos para procesar.`);

  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const messages = thread.getMessages();

    for (let j = 0; j < messages.length; j++) {
      const msg = messages[j];

      // Si el mensaje es muy antiguo o ya fue leído/procesado
      if (msg.isStarred()) continue; // Puedes usar estrella como bandera opcional

      const subject = msg.getSubject() || '';
      const from = msg.getFrom() || '';
      const rawBody = msg.getPlainBody() || stripHtmlTags(msg.getBody());
      const date = msg.getDate();
      const userEmail = Session.getActiveUser().getEmail();

      // Detectar pasarela y parsear datos
      const parsedData = parsePaymentNotification(from, subject, rawBody);

      if (parsedData) {
        parsedData.recipient_email = userEmail;
        parsedData.email_date = date.toISOString();
        parsedData.subject = subject;

        Logger.log('🚀 Pago detectado: ' + JSON.stringify(parsedData));

        // Enviar al Backend vía Webhook
        const success = sendToBackendWebhook(parsedData);

        if (success) {
          // Etiquetar el hilo y marcar como leído
          thread.addLabel(label);
          msg.markRead();
          Logger.log(`✅ Hilo ${thread.getId()} procesado y etiquetado.`);
        } else {
          Logger.log(`⚠️ Error al enviar Webhook para hilo ${thread.getId()}. Se reintentará en el próximo ciclo.`);
        }
      } else {
        if (CONFIG.DEBUG_MODE) {
          Logger.log(`ℹ️ Mensaje ignorado (no coincide con formato de pago válido): "${subject}"`);
        }
      }
    }
  }
}

/**
 * Clasifica y extrae los datos del correo según el remitente y contenido.
 */
function parsePaymentNotification(from, subject, body) {
  const textToScan = `${subject}\n${body}`;

  // 1. YAPE
  if (CONFIG.ENABLE_YAPE && (/yape/i.test(from) || /yape/i.test(subject) || /yapearon|te yapeó/i.test(textToScan))) {
    return parseYape(textToScan, subject);
  }

  // 2. PLIN
  if (CONFIG.ENABLE_PLIN && (/plin/i.test(from) || /plin/i.test(subject) || /hicieron un plin|te transfirió/i.test(textToScan))) {
    return parsePlin(textToScan, subject);
  }

  // 3. MERCADO PAGO
  if (CONFIG.ENABLE_MERCADO_PAGO && (/mercadopago/i.test(from) || /mercado pago/i.test(subject) || /recibiste un pago/i.test(textToScan))) {
    return parseMercadoPago(textToScan, subject);
  }

  return null;
}

/**
 * PARSER PARA NOTIFICACIONES DE YAPE
 * Formatos habituales:
 * - "¡Te yapearon! S/ 50.00"
 * - "¡Juan Carlos Perez te envió S/ 85.00!"
 * - "Número de operación: 12345678"
 * - "Mensaje: Pago almuerzo"
 */
function parseYape(text, subject) {
  try {
    let payerName = null;
    let amount = null;
    let operationNumber = null;
    let concept = null;

    // A. Extracción del Monto
    // Busca "S/ 50.00", "S/50", "50.00 soles", "te envió S/ 120.50"
    const amountRegex = /(?:yapearon|envió|envio|monto:?|pago de)\s*(?:S\/?\.?|PEN)?\s*([0-9]+(?:[\.,][0-9]{2})?)/i;
    const amountMatch = text.match(amountRegex) || subject.match(amountRegex);

    if (amountMatch) {
      amount = cleanNumber(amountMatch[1]);
    } else {
      // Regex alternativa para montos genéricos precedidos de S/
      const fallbackAmount = text.match(/S\/\.?\s*([0-9]+(?:[\.,][0-9]{2})?)/i);
      if (fallbackAmount) amount = cleanNumber(fallbackAmount[1]);
    }

    // B. Extracción del Nombre del Pagador
    // Ej: "¡Juan Perez te yapeó!", "Juan Perez te envió S/...", "De: Juan Perez"
    const nameRegexes = [
      /(?:¡|)\s*([A-Za-zÁ-Úá-úñÑ\s]{3,40}?)\s*(?:te yapeó|te yapeo|te envió|te envio)/i,
      /(?:origen|de|pagador|de parte de):\s*([A-Za-zÁ-Úá-úñÑ\s]{3,40})/i,
      /([A-Za-zÁ-Úá-úñÑ\s]{3,40}?)\s*te ha enviado/i
    ];

    for (const rx of nameRegexes) {
      const match = text.match(rx) || subject.match(rx);
      if (match && match[1]) {
        const candidate = cleanText(match[1]);
        if (!/yape|bcp|notificación|banco/i.test(candidate)) {
          payerName = candidate;
          break;
        }
      }
    }

    // C. Extracción de Número de Operación
    const opRegex = /(?:código de seguridad|número de operación|nro\.?\s*de op\.?|n° de op\.?):?\s*([0-9A-Za-z]+)/i;
    const opMatch = text.match(opRegex);
    if (opMatch) operationNumber = opMatch[1].trim();

    // D. Concepto o Mensaje
    const conceptRegex = /(?:mensaje|concepto|detalle):\s*["']?([^"\n\r<]{2,80})["']?/i;
    const conceptMatch = text.match(conceptRegex);
    if (conceptMatch) concept = cleanText(conceptMatch[1]);

    if (amount && amount > 0 && payerName) {
      return {
        source: 'YAPE',
        payer_name: payerName,
        amount: amount,
        operation_number: operationNumber,
        concept: concept
      };
    }
  } catch (err) {
    Logger.log('Error parseando Yape: ' + err.message);
  }
  return null;
}

/**
 * PARSER PARA NOTIFICACIONES DE PLIN
 * Formatos habituales (Interbank, BBVA, Scotiabank):
 * - "Plin te transfirió S/ 45.00 de parte de Maria Gomez"
 * - "Maria Gomez te transfirió S/ 45.00 por Plin"
 * - "Nro. de Operación: 87654321"
 */
function parsePlin(text, subject) {
  try {
    let payerName = null;
    let amount = null;
    let operationNumber = null;
    let concept = null;

    // A. Monto
    const amountRegex = /(?:transfirió|transfirio|monto:?|por)\s*(?:S\/?\.?|PEN)?\s*([0-9]+(?:[\.,][0-9]{2})?)/i;
    const amountMatch = text.match(amountRegex) || subject.match(amountRegex);
    if (amountMatch) {
      amount = cleanNumber(amountMatch[1]);
    }

    // B. Nombre
    const nameRegexes = [
      /(?:de parte de|Plin de|transferencia de)\s*([A-Za-zÁ-Úá-úñÑ\s]{3,40}?)(?:\s*(?:por|con|a|en|el)|$)/i,
      /([A-Za-zÁ-Úá-úñÑ\s]{3,40}?)\s*(?:te transfirió|te transfirio|te plineó)/i
    ];

    for (const rx of nameRegexes) {
      const match = text.match(rx) || subject.match(rx);
      if (match && match[1]) {
        const candidate = cleanText(match[1]);
        if (!/plin|interbank|bbva|scotiabank|banco/i.test(candidate)) {
          payerName = candidate;
          break;
        }
      }
    }

    // C. Operación
    const opRegex = /(?:número de operación|nro\.?\s*de op\.?|cod\.?\s*operación):?\s*([0-9]+)/i;
    const opMatch = text.match(opRegex);
    if (opMatch) operationNumber = opMatch[1].trim();

    // D. Concepto
    const conceptRegex = /(?:concepto|mensaje):\s*["']?([^"\n\r<]{2,80})["']?/i;
    const conceptMatch = text.match(conceptRegex);
    if (conceptMatch) concept = cleanText(conceptMatch[1]);

    if (amount && amount > 0 && payerName) {
      return {
        source: 'PLIN',
        payer_name: payerName,
        amount: amount,
        operation_number: operationNumber,
        concept: concept
      };
    }
  } catch (err) {
    Logger.log('Error parseando Plin: ' + err.message);
  }
  return null;
}

/**
 * PARSER PARA NOTIFICACIONES DE MERCADO PAGO
 * Formatos habituales:
 * - "¡Recibiste un pago de Juan Perez por S/ 100.00!"
 * - "Juan Perez te pagó S/ 100,00"
 * - "Operación #1234567890"
 */
function parseMercadoPago(text, subject) {
  try {
    let payerName = null;
    let amount = null;
    let operationNumber = null;
    let concept = null;

    // A. Monto
    const amountRegex = /(?:pagó|pago|recibiste|acreditó|monto:?)\s*(?:S\/?\.?|PEN|\$)?\s*([0-9]+(?:[\.,][0-9]{2})?)/i;
    const amountMatch = text.match(amountRegex) || subject.match(amountRegex);
    if (amountMatch) {
      amount = cleanNumber(amountMatch[1]);
    }

    // B. Nombre
    const nameRegexes = [
      /(?:pago de|recibiste de|cliente)\s*([A-Za-zÁ-Úá-úñÑ\s]{3,40}?)(?:\s*(?:por|te|ha)|$)/i,
      /([A-Za-zÁ-Úá-úñÑ\s]{3,40}?)\s*te pagó/i
    ];

    for (const rx of nameRegexes) {
      const match = text.match(rx) || subject.match(rx);
      if (match && match[1]) {
        const candidate = cleanText(match[1]);
        if (!/mercado pago|mercadopago/i.test(candidate)) {
          payerName = candidate;
          break;
        }
      }
    }

    // C. Operación
    const opRegex = /(?:operación|nro\.?\s*de pago|n°|referencia):?\s*#?\s*([0-9]+)/i;
    const opMatch = text.match(opRegex);
    if (opMatch) operationNumber = opMatch[1].trim();

    // D. Concepto
    const conceptRegex = /(?:en concepto de|motivo|producto):\s*["']?([^"\n\r<]{2,80})["']?/i;
    const conceptMatch = text.match(conceptRegex);
    if (conceptMatch) concept = cleanText(conceptMatch[1]);

    if (amount && amount > 0 && payerName) {
      return {
        source: 'MERCADO_PAGO',
        payer_name: payerName,
        amount: amount,
        operation_number: operationNumber,
        concept: concept
      };
    }
  } catch (err) {
    Logger.log('Error parseando Mercado Pago: ' + err.message);
  }
  return null;
}

/**
 * Envía la carga útil JSON al Backend mediante HTTP POST.
 */
function sendToBackendWebhook(payload) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': CONFIG.WEBHOOK_SECRET,
      'User-Agent': 'GoogleAppsScript-PaymentReconciler/1.0'
    },
    payload: JSON.stringify({
      secret: CONFIG.WEBHOOK_SECRET,
      ...payload
    }),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (CONFIG.DEBUG_MODE) {
      Logger.log(`📡 Respuesta del Webhook [HTTP ${statusCode}]: ${responseText}`);
    }

    return statusCode >= 200 && statusCode < 300;
  } catch (error) {
    Logger.log('❌ Excepción al conectar con el Webhook: ' + error.message);
    return false;
  }
}

/**
 * Obtiene o crea la etiqueta de Gmail para marcar correos procesados.
 */
function getOrCreateLabel(labelName) {
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
    Logger.log(`🏷️ Se creó la etiqueta de Gmail: "${labelName}"`);
  }
  return label;
}

/**
 * Limpia y normaliza texto eliminando saltos de línea y espacios duplicados.
 */
function cleanText(str) {
  if (!str) return '';
  return str.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convierte montos con coma o punto a número decimal flotante.
 */
function cleanNumber(numStr) {
  if (!numStr) return 0;
  const standardStr = numStr.replace(',', '.');
  return parseFloat(standardStr);
}

/**
 * Remueve etiquetas HTML en correos con formato rico.
 */
function stripHtmlTags(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ');
}

// ==============================================================================
// FUNCIONES DE INSTALACIÓN Y PRUEBAS
// ==============================================================================

/**
 * Configura un Trigger por tiempo para ejecutar el script automáticamente cada 2 minutos.
 * Ejecuta esta función UNA SOLA VEZ desde el editor de Google Apps Script.
 */
function setupAutomatedTrigger() {
  // Eliminar triggers existentes para evitar duplicados
  const existingTriggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < existingTriggers.length; i++) {
    if (existingTriggers[i].getHandlerFunction() === 'processIncomingPaymentEmails') {
      ScriptApp.deleteTrigger(existingTriggers[i]);
    }
  }

  // Crear nuevo trigger cada 2 minutos
  ScriptApp.newTrigger('processIncomingPaymentEmails')
    .timeBased()
    .everyMinutes(2)
    .create();

  Logger.log('⏰ Trigger automático configurado con éxito: se ejecutará cada 2 minutos.');
}

/**
 * Función de prueba local: Simula correos de Yape, Plin y Mercado Pago
 * sin necesidad de esperar correos reales.
 */
function testSampleParser() {
  const sampleYape = `
    ¡Te yapearon!
    Carlos Eduardo Mendoza te envió S/ 150.00
    Número de operación: 94827103
    Mensaje: Pago préstamo repuestos
  `;

  const samplePlin = `
    Plin te transfirió S/ 80.00 de parte de Maria Fernandez Lopez
    Nro. de Operación: 338192
    Concepto: Cuota 2
  `;

  const sampleMP = `
    ¡Recibiste un pago de Juan Perez Gomez por S/ 250.00!
    Operación #491029482
    Producto: Deuda #deuda-juan-perez
  `;

  Logger.log('--- TEST YAPE ---');
  Logger.log(parseYape(sampleYape, '¡Te yapearon!'));

  Logger.log('--- TEST PLIN ---');
  Logger.log(parsePlin(samplePlin, 'Notificación Plin'));

  Logger.log('--- TEST MERCADO PAGO ---');
  Logger.log(parseMercadoPago(sampleMP, '¡Recibiste un pago!'));
}
