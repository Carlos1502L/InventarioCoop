import React, { useState } from 'react';
import { Debt } from '../types/database';
import { formatCurrency, formatDate } from '../lib/supabase';
import { 
  Copy, 
  Check, 
  ExternalLink, 
  Calendar, 
  FileText, 
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface DebtCardProps {
  debt: Debt;
  onSelect: (debt: Debt) => void;
}

export const DebtCard: React.FC<DebtCardProps> = ({ debt, onSelect }) => {
  const [copied, setCopied] = useState(false);

  const paymentUrl = `${window.location.origin}/pay/${debt.payment_slug || debt.id}`;

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(paymentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(paymentUrl, '_blank');
  };

  // Porcentaje amortizado
  const paidAmount = Number(debt.original_amount) - Number(debt.remaining_amount);
  const percentPaid = Math.min(
    100, 
    Math.round((paidAmount / Number(debt.original_amount)) * 100)
  );

  // Colores según estado
  const getStatusBadge = () => {
    switch (debt.status) {
      case 'PAGADO':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Pagado
          </span>
        );
      case 'PAGO_PARCIAL':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Clock className="w-3.5 h-3.5 mr-1" />
            Pago Parcial ({percentPaid}%)
          </span>
        );
      case 'PENDIENTE':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 mr-1" />
            Pendiente
          </span>
        );
    }
  };

  return (
    <div 
      onClick={() => onSelect(debt)}
      className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-purple-300 transition-all cursor-pointer relative flex flex-col justify-between"
    >
      <div>
        {/* Cabecera de la Tarjeta */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-base uppercase shrink-0">
              {debt.debtor_name.slice(0, 2)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 group-hover:text-purple-700 transition-colors line-clamp-1 text-base">
                {debt.debtor_name}
              </h3>
              <p className="text-xs text-slate-500">
                {debt.debtor_phone || 'Sin teléfono'}
              </p>
            </div>
          </div>
          <div>{getStatusBadge()}</div>
        </div>

        {/* Montos */}
        <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {debt.status === 'PAGADO' ? 'Monto Total' : 'Saldo Pendiente'}
            </span>
            {debt.status === 'PAGO_PARCIAL' && (
              <span className="text-xs text-slate-500">
                Original: {formatCurrency(debt.original_amount, debt.currency)}
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-2xl font-black ${debt.status === 'PAGADO' ? 'text-emerald-700 line-through' : 'text-slate-900'}`}>
              {formatCurrency(debt.remaining_amount, debt.currency)}
            </span>
            {debt.status === 'PAGADO' && (
              <span className="text-sm font-bold text-emerald-600">
                ¡Liquidado!
              </span>
            )}
          </div>

          {/* Barra de progreso para pagos parciales */}
          {debt.status === 'PAGO_PARCIAL' && (
            <div className="mt-2.5">
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                  style={{ width: `${percentPaid}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                <span>Abonado: {formatCurrency(paidAmount, debt.currency)}</span>
                <span className="font-semibold text-blue-700">{percentPaid}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Fechas & Nota */}
        <div className="space-y-1.5 text-xs text-slate-600 mb-4">
          <div className="flex items-center text-slate-500">
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            <span>Prestado: {formatDate(debt.loan_date)}</span>
            {debt.due_date && (
              <span className="ml-2 pl-2 border-l border-slate-200">
                Vence: {formatDate(debt.due_date)}
              </span>
            )}
          </div>
          {debt.note && (
            <div className="flex items-start text-slate-600 italic line-clamp-2">
              <FileText className="w-3.5 h-3.5 mr-1.5 text-slate-400 shrink-0 mt-0.5" />
              <span>{debt.note}</span>
            </div>
          )}
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <button
          onClick={handleCopyLink}
          className={`flex-1 inline-flex items-center justify-center px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
            copied
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700'
          }`}
          title="Copiar link público para enviar por WhatsApp"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              <span>¡Link Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 mr-1 text-slate-500" />
              <span>Link de Pago</span>
            </>
          )}
        </button>

        <button
          onClick={handleOpenLink}
          className="p-2 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg border border-slate-200 transition-colors"
          title="Abrir vista pública del deudor"
        >
          <ExternalLink className="w-4 h-4" />
        </button>

        <button
          onClick={() => onSelect(debt)}
          className="p-2 text-purple-700 hover:bg-purple-50 rounded-lg transition-colors font-semibold text-xs inline-flex items-center"
        >
          <span>Detalle</span>
          <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
        </button>
      </div>
    </div>
  );
};
