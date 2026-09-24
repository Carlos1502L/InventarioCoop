/**
 * SERVIDOR BACKEND & WEBHOOK DE CONCILIACIÓN AUTOMÁTICA
 * Arquitectura: Node.js + Express + Supabase Client (Service Role)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const cleanUrl = (url) => url ? url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') : '';
const SUPABASE_URL = cleanUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const WEBHOOK_SECRET_KEY = process.env.WEBHOOK_SECRET_KEY || 'default_secret_key';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ ADVERTENCIA: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están configurados en .env');
}

const supabaseAdmin = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
);

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined'));

// ==============================================================================
// FUNCIONES AUXILIARES DE NORMALIZACIÓN Y MATCHEADO INTELIGENTE
// ==============================================================================

/**
 * Normaliza cadenas de texto eliminando acentos, símbolos y convirtiendo a minúsculas.
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimina tildes
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')     // Remueve caracteres especiales
    .trim();
}

/**
 * Evalúa la coincidencia entre el nombre del pagador y el nombre del deudor registrado.
 * Admite coincidencias parciales (ej: "Juan Carlos Perez Gomez" vs "Juan Perez").
 */
function computeNameMatchScore(payerName, debtorName) {
  const normPayer = normalizeText(payerName);
  const normDebtor = normalizeText(debtorName);

  if (!normPayer || !normDebtor) return 0;
  if (normPayer === normDebtor) return 1.0; // Coincidencia exacta

  const payerTokens = normPayer.split(/\s+/).filter(t => t.length > 2);
  const debtorTokens = normDebtor.split(/\s+/).filter(t => t.length > 2);

  if (payerTokens.length === 0 || debtorTokens.length === 0) return 0;

  // Contar cuántos tokens del deudor están presentes en el nombre del pagador
  let matches = 0;
  for (const token of debtorTokens) {
    if (payerTokens.includes(token)) {
      matches++;
    }
  }

  const ratio = matches / debtorTokens.length;
  return ratio; // 1.0 si todos los nombres/apellidos del deudor están en el pagador
}

// ==============================================================================
// RUTAS DE LA API
// ==============================================================================

// Healthcheck
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Payment Reconciliation Webhook API'
  });
});

/**
 * ENDPOINT PRINCIPAL: WEBHOOK DE CONCILIACIÓN
 * Invocado por Google Apps Script cuando detecta un correo de Yape, Plin o Mercado Pago.
 */
app.post('/api/webhook/payment', async (req, res) => {
  try {
    const authHeader = req.headers['x-webhook-secret'] || req.headers['authorization'];
    const payloadSecret = req.body.secret;

    // 1. Validar autenticación del Webhook
    const isSecretValid =
      authHeader === WEBHOOK_SECRET_KEY ||
      authHeader === `Bearer ${WEBHOOK_SECRET_KEY}` ||
      payloadSecret === WEBHOOK_SECRET_KEY;

    if (!isSecretValid) {
      console.error('⛔ Intento de acceso no autorizado al Webhook.');
      return res.status(401).json({
        success: false,
        error: 'No autorizado: Clave secreta de Webhook inválida.'
      });
    }

    const {
      source,              // 'YAPE' | 'PLIN' | 'MERCADO_PAGO'
      payer_name,          // Nombre extraído por Regex
      amount,              // Monto en número (ej: 50.00)
      operation_number,    // Número de operación o código de seguridad
      concept,             // Concepto o mensaje opcional
      recipient_email,     // Correo del dueño de la cuenta que recibió el pago
      raw_payload          // Copia del correo o metadatos
    } = req.body;

    console.log('📥 Notificación de pago recibida:', {
      source,
      payer_name,
      amount,
      operation_number,
      recipient_email
    });

    if (!payer_name || amount === undefined || isNaN(Number(amount))) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos obligatorios: payer_name o amount numérico válido.'
      });
    }

    const parsedAmount = Math.round(Number(amount) * 100) / 100;
    const paymentSource = (source || 'OTRO').toUpperCase();

    // 2. Control de Idempotencia: Verificar si ya procesamos esta operación antes
    if (operation_number) {
      const { data: existingLog } = await supabaseAdmin
        .from('payment_logs')
        .select('id, debt_id, status, created_at')
        .eq('operation_number', operation_number)
        .maybeSingle();

      if (existingLog) {
        console.warn(`⚠️ Operación ${operation_number} ya fue procesada anteriormente.`);
        return res.status(200).json({
          success: true,
          message: 'Operación ya registrada previamente (Idempotencia).',
          log_id: existingLog.id,
          already_processed: true
        });
      }
    }

    // 3. Localizar al usuario acreedor (profile)
    let targetUserId = null;

    if (recipient_email) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('email', recipient_email.trim())
        .maybeSingle();

      if (profile) {
        targetUserId = profile.id;
      }
    }

    // Si no se encontró por email o no vino email, buscar el primer usuario configurado
    if (!targetUserId) {
      const { data: defaultUser } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .limit(1)
        .single();

      if (defaultUser) {
        targetUserId = defaultUser.id;
      } else {
        return res.status(404).json({
          success: false,
          error: 'No se encontró ningún usuario/perfil registrado para asociar el pago.'
        });
      }
    }

    // 4. Buscar deudas activas (PENDIENTE o PAGO_PARCIAL) del acreedor
    const { data: activeDebts, error: debtsError } = await supabaseAdmin
      .from('debts')
      .select('*')
      .eq('user_id', targetUserId)
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .order('created_at', { ascending: true });

    if (debtsError) {
      throw debtsError;
    }

    let matchedDebt = null;
    let matchType = 'UNMATCHED';

    // A. Búsqueda por Código o Slug en el Concepto
    if (concept && activeDebts && activeDebts.length > 0) {
      const cleanConcept = normalizeText(concept);
      for (const debt of activeDebts) {
        if (
          debt.payment_slug &&
          cleanConcept.includes(normalizeText(debt.payment_slug))
        ) {
          matchedDebt = debt;
          matchType = 'REFERENCE_CODE';
          break;
        }
      }
    }

    // B. Búsqueda por Nombre del Pagador (Fuzzy / Exact Token Matching)
    if (!matchedDebt && activeDebts && activeDebts.length > 0) {
      let highestScore = 0;
      let candidate = null;

      for (const debt of activeDebts) {
        const score = computeNameMatchScore(payer_name, debt.debtor_name);
        if (score > highestScore) {
          highestScore = score;
          candidate = debt;
        }
      }

      // Si el score es al menos 0.6 (más de la mitad de nombres coinciden)
      if (candidate && highestScore >= 0.6) {
        matchedDebt = candidate;
        matchType = highestScore >= 0.99 ? 'EXACT_NAME' : 'FUZZY_NAME';
      }
    }

    // 5. Aplicar lógica de Conciliación
    if (matchedDebt) {
      const currentRemaining = Number(matchedDebt.remaining_amount);
      const isFullPayment = parsedAmount >= currentRemaining;

      let newStatus = 'PAGO_PARCIAL';
      let newRemaining = Math.max(0, Math.round((currentRemaining - parsedAmount) * 100) / 100);
      let paidAt = null;

      if (isFullPayment) {
        newStatus = 'PAGADO';
        newRemaining = 0;
        paidAt = new Date().toISOString();
      }

      // Actualizar la deuda en la base de datos
      const { error: updateError } = await supabaseAdmin
        .from('debts')
        .update({
          remaining_amount: newRemaining,
          status: newStatus,
          paid_at: paidAt ? paidAt : matchedDebt.paid_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', matchedDebt.id);

      if (updateError) {
        throw updateError;
      }

      // Registrar en el log de pagos
      const { data: insertedLog, error: logError } = await supabaseAdmin
        .from('payment_logs')
        .insert({
          user_id: targetUserId,
          debt_id: matchedDebt.id,
          payer_name: payer_name.trim(),
          amount: parsedAmount,
          currency: matchedDebt.currency || 'PEN',
          payment_method: paymentSource,
          operation_number: operation_number || null,
          raw_concept: concept || null,
          raw_payload: raw_payload || req.body,
          matched_by: matchType,
          status: 'CONCILIADO'
        })
        .select()
        .single();

      if (logError) {
        console.error('Error insertando en payment_logs:', logError);
      }

      console.log(`✅ Conciliación Exitosa [${newStatus}]:`, {
        deuda_id: matchedDebt.id,
        deudor: matchedDebt.debtor_name,
        monto_pagado: parsedAmount,
        saldo_restante: newRemaining
      });

      return res.status(200).json({
        success: true,
        reconciled: true,
        match_type: matchType,
        debt: {
          id: matchedDebt.id,
          debtor_name: matchedDebt.debtor_name,
          previous_remaining: currentRemaining,
          new_remaining: newRemaining,
          status: newStatus,
          paid_at: paidAt
        },
        log: insertedLog
      });

    } else {
      // 6. El pago no pudo ser vinculado automáticamente a ninguna deuda activa
      console.warn('⚠️ No se encontró una deuda coincidente para el pagador:', payer_name);

      const { data: unmatchedLog, error: logError } = await supabaseAdmin
        .from('payment_logs')
        .insert({
          user_id: targetUserId,
          debt_id: null,
          payer_name: payer_name.trim(),
          amount: parsedAmount,
          currency: 'PEN',
          payment_method: paymentSource,
          operation_number: operation_number || null,
          raw_concept: concept || null,
          raw_payload: raw_payload || req.body,
          matched_by: 'UNMATCHED',
          status: 'NO_CONCILIADO'
        })
        .select()
        .single();

      if (logError) {
        console.error('Error insertando payment_log no conciliado:', logError);
      }

      return res.status(200).json({
        success: true,
        reconciled: false,
        message: 'Pago guardado en historial como NO_CONCILIADO para revisión manual.',
        log: unmatchedLog
      });
    }

  } catch (error) {
    console.error('❌ Error general procesando el webhook:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor procesando la conciliación.'
    });
  }
});

/**
 * ENDPOINT DE CONCILIACIÓN MANUAL:
 * Permite al usuario acreedor enlazar un pago "NO_CONCILIADO" a una deuda específica desde el Dashboard.
 */
app.post('/api/reconcile/manual', async (req, res) => {
  try {
    const { log_id, debt_id } = req.body;

    if (!log_id || !debt_id) {
      return res.status(400).json({ error: 'log_id y debt_id son obligatorios.' });
    }

    // Obtener el log
    const { data: log, error: logErr } = await supabaseAdmin
      .from('payment_logs')
      .select('*')
      .eq('id', log_id)
      .single();

    if (logErr || !log) {
      return res.status(404).json({ error: 'Registro de pago no encontrado.' });
    }

    // Obtener la deuda
    const { data: debt, error: debtErr } = await supabaseAdmin
      .from('debts')
      .select('*')
      .eq('id', debt_id)
      .single();

    if (debtErr || !debt) {
      return res.status(404).json({ error: 'Deuda no encontrada.' });
    }

    const currentRemaining = Number(debt.remaining_amount);
    const amount = Number(log.amount);
    const isFullPayment = amount >= currentRemaining;

    const newStatus = isFullPayment ? 'PAGADO' : 'PAGO_PARCIAL';
    const newRemaining = Math.max(0, Math.round((currentRemaining - amount) * 100) / 100);

    // Actualizar deuda
    await supabaseAdmin
      .from('debts')
      .update({
        remaining_amount: newRemaining,
        status: newStatus,
        paid_at: isFullPayment ? new Date().toISOString() : debt.paid_at,
        updated_at: new Date().toISOString()
      })
      .eq('id', debt.id);

    // Actualizar log
    await supabaseAdmin
      .from('payment_logs')
      .update({
        debt_id: debt.id,
        matched_by: 'MANUAL',
        status: 'CONCILIADO'
      })
      .eq('id', log.id);

    return res.json({
      success: true,
      message: 'Deuda conciliada manualmente con éxito.',
      new_remaining: newRemaining,
      new_status: newStatus
    });

  } catch (error) {
    console.error('Error en conciliación manual:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de Conciliación escuchando en el puerto ${PORT}`);
  console.log(`📡 Endpoint Webhook: POST http://localhost:${PORT}/api/webhook/payment`);
});
