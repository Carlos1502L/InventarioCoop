import React, { useState } from 'react';
import { PaymentLog, Debt } from '../types/database';
import { supabase, formatCurrency, formatDate } from '../lib/supabase';
import { X, BellRing, Link2, Check, Loader2, AlertCircle } from 'lucide-react';

interface UnmatchedPaymentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  unmatchedLogs: PaymentLog[];
  activeDebts: Debt[];
  onReconciliationSuccess: () => void;
}

export const UnmatchedPaymentsModal: React.FC<UnmatchedPaymentsModalProps> = ({
  isOpen,
  onClose,
  unmatchedLogs,
  activeDebts,
  onReconciliationSuccess
}) => {
  const [selectedDebtMap, setSelectedDebtMap] = useState<{ [logId: string]: string }>({});
  const [loadingLogId, setLoadingLogId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLinkPayment = async (log: PaymentLog) => {
    const targetDebtId = selectedDebtMap[log.id];
    if (!targetDebtId) {
      alert('Por favor selecciona una deuda a la cual imputar este pago.');
      return;
    }

    const debt = activeDebts.find((d) => d.id === targetDebtId);
    if (!debt) return;

    setLoadingLogId(log.id);

    try {
      const currentRemaining = Number(debt.remaining_amount);
      const paymentAmount = Number(log.amount);
      const isFull = paymentAmount >= currentRemaining;
      const newRemaining = Math.max(0, Math.round((currentRemaining - paymentAmount) * 100) / 100);
      const newStatus = isFull ? 'PAGADO' : 'PAGO_PARCIAL';

      // 1. Actualizar Deuda
      const { error: debtErr } = await supabase
        .from('debts')
        .update({
          remaining_amount: newRemaining,
          status: newStatus,
          paid_at: isFull ? new Date().toISOString() : debt.paid_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', debt.id);

      if (debtErr) throw debtErr;

      // 2. Actualizar Log
      const { error: logErr } = await supabase
        .from('payment_logs')
        .update({
          debt_id: debt.id,
          matched_by: 'MANUAL',
          status: 'CONCILIADO'
        })
        .eq('id', log.id);

      if (logErr) throw logErr;

      onReconciliationSuccess();
    } catch (err: any) {
      alert('Error al vincular el pago: ' + err.message);
    } finally {
      setLoadingLogId(null);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Pagos Recibidos Sin Vincular ({unmatchedLogs.length})
              </h2>
              <p className="text-xs text-slate-500">
                El bot detectó estos pagos en Gmail pero el nombre del deudor no coincidió exactamente.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {unmatchedLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              ¡Genial! No hay pagos pendientes de vinculación.
            </div>
          ) : (
            unmatchedLogs.map((log) => (
              <div 
                key={log.id} 
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-bold text-slate-900 text-sm">
                      {log.payer_name}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                      {log.payment_method}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-0.5">
                    <p>Monto: <strong className="text-slate-800 font-semibold">{formatCurrency(log.amount, log.currency)}</strong></p>
                    <p>Operación: {log.operation_number || 'N/A'}</p>
                    {log.raw_concept && <p>Mensaje: "{log.raw_concept}"</p>}
                    <p>Fecha correo: {formatDate(log.created_at)}</p>
                  </div>
                </div>

                {/* Selector de Deuda para Vincular */}
                <div className="flex items-center space-x-2 sm:shrink-0">
                  <select
                    value={selectedDebtMap[log.id] || ''}
                    onChange={(e) => setSelectedDebtMap({ ...selectedDebtMap, [log.id]: e.target.value })}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 max-w-[200px]"
                  >
                    <option value="">-- Asignar a Deudor --</option>
                    {activeDebts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.debtor_name} (Resta {formatCurrency(d.remaining_amount, d.currency)})
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleLinkPayment(log)}
                    disabled={loadingLogId === log.id || !selectedDebtMap[log.id]}
                    className="inline-flex items-center px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-all shrink-0"
                  >
                    {loadingLogId === log.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Link2 className="w-4 h-4 mr-1" />
                        Vincular
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/70 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
