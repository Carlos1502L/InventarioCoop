import React, { useState, useEffect } from 'react';
import { supabase, formatCurrency, formatDate } from '../lib/supabase';
import { PublicDebtView } from '../types/database';
import confetti from 'canvas-confetti';
import { 
  CreditCard, 
  Copy, 
  Check, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Phone, 
  ShieldCheck, 
  Loader2, 
  ArrowRight,
  Info
} from 'lucide-react';

interface PublicPaymentPortalProps {
  identifier: string; // ID o Slug del préstamo
}

export const PublicPaymentPortal: React.FC<PublicPaymentPortalProps> = ({ identifier }) => {
  const [debt, setDebt] = useState<PublicDebtView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMethod, setActiveMethod] = useState<'YAPE' | 'PLIN' | 'MERCADO_PAGO'>('YAPE');
  
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [justPaid, setJustPaid] = useState(false);

  // Cargar datos de la deuda pública
  const fetchPublicDebt = async () => {
    try {
      // 1. Intentar llamar a la RPC segura
      const { data, error: rpcError } = await supabase.rpc('get_public_debt_details', {
        p_identifier: identifier
      });

      if (!rpcError && data && data.length > 0) {
        setDebt(data[0] as PublicDebtView);
        if (data[0].status === 'PAGADO') {
          setJustPaid(true);
        }
      } else {
        // Fallback directo a la tabla debts si la RPC no estuviera compilada aún
        const { data: debtData, error: debtErr } = await supabase
          .from('debts')
          .select(`
            id,
            payment_slug,
            debtor_name,
            original_amount,
            remaining_amount,
            currency,
            loan_date,
            due_date,
            note,
            status,
            paid_at,
            user_id
          `)
          .or(`id.eq.${identifier},payment_slug.eq.${identifier}`)
          .maybeSingle();

        if (debtErr || !debtData) {
          setError('No pudimos encontrar el registro de este préstamo. Verifica el enlace.');
        } else {
          // Traer perfil público del acreedor
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name, yape_phone, yape_qr_url, plin_phone, plin_qr_url, mercadopago_link')
            .eq('id', debtData.user_id)
            .maybeSingle();

          const combined: PublicDebtView = {
            debt_id: debtData.id,
            payment_slug: debtData.payment_slug,
            debtor_name: debtData.debtor_name,
            original_amount: debtData.original_amount,
            remaining_amount: debtData.remaining_amount,
            currency: debtData.currency || 'PEN',
            loan_date: debtData.loan_date,
            due_date: debtData.due_date,
            note: debtData.note,
            status: debtData.status,
            paid_at: debtData.paid_at,
            creditor_name: profileData?.full_name || 'Acreedor',
            yape_phone: profileData?.yape_phone || null,
            yape_qr_url: profileData?.yape_qr_url || null,
            plin_phone: profileData?.plin_phone || null,
            plin_qr_url: profileData?.plin_qr_url || null,
            mercadopago_link: profileData?.mercadopago_link || null
          };

          setDebt(combined);
          if (combined.status === 'PAGADO') setJustPaid(true);
        }
      }
    } catch (err: any) {
      console.error('Error cargando portal:', err);
      setError('Ocurrió un error al cargar los datos del préstamo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicDebt();
  }, [identifier]);

  // Escuchar cambios en tiempo real: Si el Bot concilia el pago, se celebra en vivo!
  useEffect(() => {
    if (!debt?.debt_id) return;

    const channel = supabase
      .channel(`public_debt_${debt.debt_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'debts',
          filter: `id=eq.${debt.debt_id}`
        },
        (payload: any) => {
          const updated = payload.new;
          if (updated) {
            setDebt((prev) => prev ? {
              ...prev,
              remaining_amount: updated.remaining_amount,
              status: updated.status,
              paid_at: updated.paid_at
            } : null);

            if (updated.status === 'PAGADO') {
              setJustPaid(true);
              confetti({
                particleCount: 120,
                spread: 70,
                origin: { y: 0.6 }
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [debt?.debt_id]);

  const handleCopyAmount = () => {
    if (!debt) return;
    navigator.clipboard.writeText(debt.remaining_amount.toString());
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-purple-500 mb-4" />
        <p className="text-white text-sm font-semibold">Cargando portal de cobro seguro...</p>
      </div>
    );
  }

  if (error || !debt) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">Préstamo no disponible</h2>
          <p className="text-xs text-slate-500 mb-6">{error || 'El enlace provisto es inválido o ha sido eliminado.'}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
          >
            Ir al Inicio
          </a>
        </div>
      </div>
    );
  }

  // Generadores dinámicos de QR si el acreedor no subió una URL de imagen
  const activePhone = activeMethod === 'YAPE' ? debt.yape_phone : debt.plin_phone;
  const fallbackQR = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    `${activeMethod}:${activePhone || '000000000'}?amount=${debt.remaining_amount}&name=${encodeURIComponent(debt.debtor_name)}`
  )}`;

  const currentQRUrl = activeMethod === 'YAPE' 
    ? (debt.yape_qr_url || fallbackQR)
    : (debt.plin_qr_url || fallbackQR);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-md w-full mx-auto space-y-4">
        
        {/* Encabezado de Confianza */}
        <div className="text-center text-white space-y-1">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-semibold text-purple-300 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>Portal de Pago Protegido</span>
          </div>
          <h1 className="text-lg font-bold text-slate-200">
            Cobro de <span className="text-white">{debt.creditor_name || 'Acreedor Registrado'}</span>
          </h1>
        </div>

        {/* Tarjeta Principal de Pago */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Si ya está pagado: VOUCHER DE PAGO EXITOSO */}
          {debt.status === 'PAGADO' ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">¡Pago Confirmado!</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Tu deuda ha sido liquidada en su totalidad y conciliada automáticamente.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Deudor:</span>
                  <strong className="text-slate-800">{debt.debtor_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Monto Cancelado:</span>
                  <strong className="text-emerald-700">{formatCurrency(debt.original_amount, debt.currency)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fecha de Liquidación:</span>
                  <span className="text-slate-700">{formatDate(debt.paid_at || new Date().toISOString())}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Estado:</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px]">
                    TOTALMENTE PAGADO
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Puedes guardar una captura de pantalla de este comprobante como respaldo.
              </p>
            </div>
          ) : (
            // Formulario y Opciones de Pago (YAPE / PLIN / MERCADO PAGO)
            <div>
              {/* Resumen del Monto a Pagar */}
              <div className="bg-gradient-to-br from-purple-900 via-indigo-950 to-slate-900 p-6 text-white text-center relative">
                <p className="text-xs font-semibold text-purple-300 uppercase tracking-widest mb-1">
                  Monto a Pagar
                </p>
                <div className="flex items-center justify-center space-x-2">
                  <span className="text-4xl font-black tracking-tight">
                    {formatCurrency(debt.remaining_amount, debt.currency)}
                  </span>
                  <button
                    onClick={handleCopyAmount}
                    className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-purple-200"
                    title="Copiar monto exacto"
                  >
                    {copiedAmount ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="mt-2 text-xs text-purple-200">
                  <span>Deudor: <strong>{debt.debtor_name}</strong></span>
                  {debt.status === 'PAGO_PARCIAL' && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-500/30 text-blue-200 rounded-full text-[10px] font-bold">
                      Saldo Restante
                    </span>
                  )}
                </div>

                {debt.note && (
                  <p className="text-[11px] text-purple-300 mt-2 italic max-w-xs mx-auto">
                    "{debt.note}"
                  </p>
                )}
              </div>

              {/* Selector de Pasarela (Yape, Plin y opcionalmente Mercado Pago) */}
              <div className="p-6 space-y-6">
                <div className={`grid ${debt.mercadopago_link ? 'grid-cols-3' : 'grid-cols-2'} gap-2 p-1 bg-slate-100 rounded-2xl`}>
                  {/* Opción Yape */}
                  <button
                    onClick={() => setActiveMethod('YAPE')}
                    className={`py-2 text-xs font-black rounded-xl transition-all flex flex-col items-center justify-center space-y-1 ${
                      activeMethod === 'YAPE'
                        ? 'bg-purple-700 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>YAPE</span>
                  </button>

                  {/* Opción Plin */}
                  <button
                    onClick={() => setActiveMethod('PLIN')}
                    className={`py-2 text-xs font-black rounded-xl transition-all flex flex-col items-center justify-center space-y-1 ${
                      activeMethod === 'PLIN'
                        ? 'bg-teal-600 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>PLIN</span>
                  </button>

                  {/* Opción Mercado Pago (Solo si está configurado) */}
                  {debt.mercadopago_link && (
                    <button
                      onClick={() => setActiveMethod('MERCADO_PAGO')}
                      className={`py-2 text-xs font-black rounded-xl transition-all flex flex-col items-center justify-center space-y-1 ${
                        activeMethod === 'MERCADO_PAGO'
                          ? 'bg-sky-500 text-white shadow-md'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>M. PAGO</span>
                    </button>
                  )}
                </div>

                {/* Vista del Método: YAPE o PLIN */}
                {(activeMethod === 'YAPE' || activeMethod === 'PLIN') && (
                  <div className="space-y-4 animate-in fade-in">
                    
                    {/* Código QR */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center">
                      <img
                        src={currentQRUrl}
                        alt={`QR ${activeMethod}`}
                        className="w-52 h-52 object-contain rounded-xl shadow-sm bg-white p-2 border border-slate-200"
                      />
                      <p className="text-[11px] text-slate-500 font-medium mt-2 text-center">
                        Escanea este código desde la app de <strong>{activeMethod}</strong>
                      </p>
                    </div>

                    {/* Número de Celular del Acreedor */}
                    {activePhone ? (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-center space-x-2">
                          <Phone className="w-4 h-4 text-slate-500" />
                          <span className="text-xs font-mono font-bold text-slate-800">{activePhone}</span>
                        </div>
                        <button
                          onClick={() => handleCopyPhone(activePhone)}
                          className="px-2.5 py-1 text-xs font-bold text-purple-700 hover:bg-purple-100 rounded-lg transition-colors inline-flex items-center"
                        >
                          {copiedPhone ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                          {copiedPhone ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 rounded-xl text-[11px] text-amber-800">
                        El acreedor no ha registrado un teléfono directo para este método. Utiliza el código QR.
                      </div>
                    )}

                    {/* Instrucciones de Conciliación Automática */}
                    <div className="p-3.5 bg-purple-50/70 border border-purple-100 rounded-xl space-y-1.5 text-xs text-purple-900">
                      <div className="flex items-center space-x-1.5 font-bold">
                        <Info className="w-4 h-4 text-purple-600" />
                        <span>Instrucciones para acreditación automática:</span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-purple-800 pl-1">
                        <li>Ingresa el monto exacto: <strong>{formatCurrency(debt.remaining_amount, debt.currency)}</strong>.</li>
                        <li>En el mensaje o nota de {activeMethod}, coloca: <strong className="font-mono bg-purple-200/80 px-1 rounded">{debt.debtor_name}</strong>.</li>
                        <li>Nuestro sistema detectará el correo bancario y conciliará tu pago en segundos.</li>
                      </ol>
                    </div>

                  </div>
                )}

                {/* Vista del Método: MERCADO PAGO */}
                {activeMethod === 'MERCADO_PAGO' && (
                  <div className="space-y-4 animate-in fade-in py-4 text-center">
                    <div className="w-16 h-16 bg-sky-50 text-sky-500 rounded-2xl flex items-center justify-center mx-auto">
                      <CreditCard className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">Pagar con Tarjetas de Débito / Crédito</h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                        Realiza tu pago de forma instantánea a través del checkout seguro de Mercado Pago.
                      </p>
                    </div>

                    {debt.mercadopago_link ? (
                      <a
                        href={debt.mercadopago_link}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full inline-flex items-center justify-center py-3 px-4 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-500/25 transition-all"
                      >
                        <span>Ir a Pagar {formatCurrency(debt.remaining_amount, debt.currency)}</span>
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </a>
                    ) : (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                        El acreedor no ha configurado un enlace dinámico de Mercado Pago. Por favor selecciona Yape o Plin.
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
          <span>🐷 MarranilloPay © 2026</span>
          <span>•</span>
          <span>Conciliación Bancaria Automatizada</span>
        </div>

      </div>
    </div>
  );
};
