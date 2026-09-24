import React, { useState, useEffect } from 'react';
import { Debt, PaymentLog } from '../types/database';
import { supabase, formatCurrency, formatDate } from '../lib/supabase';
import { 
  X, 
  Copy, 
  Check, 
  ExternalLink, 
  Share2, 
  QrCode, 
  DollarSign, 
  CheckCircle, 
  Trash2, 
  Loader2,
  Receipt,
  User,
  Clock
} from 'lucide-react';

interface DebtDetailModalProps {
  debt: Debt | null;
  isOpen: boolean;
  onClose: () => void;
  onDebtUpdated: (updatedDebt: Debt) => void;
  onDebtDeleted: (debtId: string) => void;
}

export const DebtDetailModal: React.FC<DebtDetailModalProps> = ({
  debt,
  isOpen,
  onClose,
  onDebtUpdated,
  onDebtDeleted
}) => {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // Abono manual
  const [manualAmount, setManualAmount] = useState('');
  const [manualMethod, setManualMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'YAPE' | 'PLIN'>('EFECTIVO');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  // Escuchar tecla ESC para cerrar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Cargar historial de pagos de esta deuda
  useEffect(() => {
    if (debt && isOpen) {
      fetchPaymentLogs(debt.id);
    }
  }, [debt, isOpen]);

  if (!isOpen || !debt) return null;

  const paymentUrl = `${window.location.origin}/pay/${debt.payment_slug || debt.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(paymentUrl)}`;

  const fetchPaymentLogs = async (debtId: string) => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('payment_logs')
        .select('*')
        .eq('debt_id', debtId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setLogs(data as PaymentLog[]);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(paymentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = `Hola ${debt.debtor_name}, te comparto el link para realizar el pago de tu saldo pendiente (${formatCurrency(debt.remaining_amount, debt.currency)}): ${paymentUrl}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Registrar abono manual
  const handleRegisterManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(manualAmount);
    if (isNaN(amountVal) || amountVal <= 0) return;

    setIsSubmittingManual(true);
    try {
      const currentRemaining = Number(debt.remaining_amount);
      const isFull = amountVal >= currentRemaining;
      const newRemaining = Math.max(0, Math.round((currentRemaining - amountVal) * 100) / 100);
      const newStatus = isFull ? 'PAGADO' : 'PAGO_PARCIAL';
      const paidAt = isFull ? new Date().toISOString() : debt.paid_at;

      // 1. Actualizar Deuda
      const { data: updatedDebtData, error: debtErr } = await supabase
        .from('debts')
        .update({
          remaining_amount: newRemaining,
          status: newStatus,
          paid_at: paidAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', debt.id)
        .select()
        .single();

      if (debtErr) throw debtErr;

      // 2. Insertar en payment_logs
      await supabase.from('payment_logs').insert({
        user_id: debt.user_id,
        debt_id: debt.id,
        payer_name: debt.debtor_name,
        amount: amountVal,
        currency: debt.currency,
        payment_method: manualMethod,
        operation_number: `MANUAL-${Date.now().toString().slice(-6)}`,
        matched_by: 'MANUAL',
        status: 'CONCILIADO'
      });

      onDebtUpdated(updatedDebtData as Debt);
      setManualAmount('');
      setShowManualForm(false);
      fetchPaymentLogs(debt.id);
    } catch (err: any) {
      alert('Error registrando el pago: ' + err.message);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // Liquidar Deuda Completa
  const handleMarkAsFullyPaid = async () => {
    if (!window.confirm(`¿Marcar la deuda de ${debt.debtor_name} como totalmente pagada?`)) return;

    try {
      const { data, error } = await supabase
        .from('debts')
        .update({
          remaining_amount: 0,
          status: 'PAGADO',
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', debt.id)
        .select()
        .single();

      if (error) throw error;
      onDebtUpdated(data as Debt);
    } catch (err: any) {
      alert('Error actualizando la deuda: ' + err.message);
    }
  };

  // Eliminar Deuda
  const handleDelete = async () => {
    if (!window.confirm(`¿Estás seguro de eliminar el préstamo de ${debt.debtor_name}? Esta acción no se puede deshacer.`)) return;

    try {
      const { error } = await supabase
        .from('debts')
        .delete()
        .eq('id', debt.id);

      if (error) throw error;
      onDebtDeleted(debt.id);
      onClose();
    } catch (err: any) {
      alert('Error eliminando la deuda: ' + err.message);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{debt.debtor_name}</h2>
              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold mt-0.5 ${
                debt.status === 'PAGADO' ? 'bg-emerald-100 text-emerald-800' :
                debt.status === 'PAGO_PARCIAL' ? 'bg-blue-100 text-blue-800' :
                'bg-amber-100 text-amber-800'
              }`}>
                {debt.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Tarjeta de Saldos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Monto Original</p>
              <p className="text-lg font-bold text-slate-800">{formatCurrency(debt.original_amount, debt.currency)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Saldo Pendiente</p>
              <p className={`text-lg font-black ${debt.status === 'PAGADO' ? 'text-emerald-600 line-through' : 'text-purple-700'}`}>
                {formatCurrency(debt.remaining_amount, debt.currency)}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs font-semibold text-slate-500 uppercase">Fecha Préstamo</p>
              <p className="text-sm font-semibold text-slate-700">{formatDate(debt.loan_date)}</p>
            </div>
          </div>

          {/* Nota */}
          {debt.note && (
            <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl text-xs text-purple-900">
              <span className="font-bold">Nota: </span>
              {debt.note}
            </div>
          )}

          {/* Link Público de Cobro y Compartir */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                <span>Link Público de Pago del Deudor</span>
              </label>
              <button
                onClick={() => setShowQR(!showQR)}
                className="text-xs font-semibold text-purple-700 hover:text-purple-900 inline-flex items-center"
              >
                <QrCode className="w-3.5 h-3.5 mr-1" />
                {showQR ? 'Ocultar QR' : 'Ver Código QR'}
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={paymentUrl}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 select-all focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold shrink-0 transition-colors inline-flex items-center"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600 mr-1" /> : <Copy className="w-4 h-4 mr-1 text-slate-500" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <button
                onClick={() => window.open(paymentUrl, '_blank')}
                className="p-2 bg-white border border-slate-200 text-slate-700 hover:text-purple-700 rounded-lg text-xs font-semibold shrink-0 transition-colors"
                title="Abrir link"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            {/* Código QR Desplegable */}
            {showQR && (
              <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center space-y-2 animate-in fade-in">
                <img 
                  src={qrUrl} 
                  alt="QR Link de Pago" 
                  className="w-48 h-48 rounded-lg shadow-sm border border-slate-100"
                />
                <p className="text-[11px] text-slate-500 text-center">
                  El deudor puede escanear este código con su cámara para abrir su portal de pago.
                </p>
              </div>
            )}

            <button
              onClick={handleShareWhatsApp}
              className="w-full inline-flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Compartir por WhatsApp al Deudor
            </button>
          </div>

          {/* Historial de Pagos y Abonos Conciliados */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                <Receipt className="w-4 h-4 mr-1.5 text-purple-600" />
                Historial de Pagos Conciliados ({logs.length})
              </h3>
              <button
                onClick={() => setShowManualForm(!showManualForm)}
                className="text-xs font-semibold text-purple-700 hover:text-purple-900"
              >
                {showManualForm ? 'Cancelar Abono' : '+ Registrar Abono Manual'}
              </button>
            </div>

            {/* Formulario de Abono Manual */}
            {showManualForm && (
              <form onSubmit={handleRegisterManualPayment} className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl mb-3 space-y-3 animate-in fade-in">
                <p className="text-xs font-bold text-purple-900">Registrar Pago en Efectivo o Fuera de Sistema</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Monto abonado (S/.)"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
                  />
                  <select
                    value={manualMethod}
                    onChange={(e: any) => setManualMethod(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-purple-200 rounded-lg focus:outline-none bg-white"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                    <option value="YAPE">Yape (Manual)</option>
                    <option value="PLIN">Plin (Manual)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="px-4 py-1.5 bg-purple-700 text-white rounded-lg text-xs font-bold hover:bg-purple-800 disabled:opacity-50"
                >
                  {isSubmittingManual ? 'Registrando...' : 'Confirmar Abono'}
                </button>
              </form>
            )}

            {/* Tabla de Logs */}
            {loadingLogs ? (
              <div className="p-4 text-center text-xs text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-purple-600" />
                Cargando abonos...
              </div>
            ) : logs.length === 0 ? (
              <div className="p-4 text-center bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                Aún no hay pagos registrados para este préstamo.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Método</th>
                      <th className="px-3 py-2 text-left">Monto</th>
                      <th className="px-3 py-2 text-left">Operación</th>
                      <th className="px-3 py-2 text-left">Conciliado Por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 text-slate-600">{formatDate(log.created_at)}</td>
                        <td className="px-3 py-2">
                          <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                            log.payment_method === 'YAPE' ? 'bg-purple-100 text-purple-800' :
                            log.payment_method === 'PLIN' ? 'bg-teal-100 text-teal-800' :
                            log.payment_method === 'MERCADO_PAGO' ? 'bg-sky-100 text-sky-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {log.payment_method}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-900">{formatCurrency(log.amount, log.currency)}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{log.operation_number || '-'}</td>
                        <td className="px-3 py-2 text-slate-500 text-[11px]">{log.matched_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Acciones Finales: Liquidar o Eliminar */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={handleDelete}
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Eliminar Préstamo
            </button>

            {debt.status !== 'PAGADO' && (
              <button
                onClick={handleMarkAsFullyPaid}
                className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Marcar Totalmente Pagado
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
