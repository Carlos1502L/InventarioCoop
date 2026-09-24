import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, formatCurrency } from '../lib/supabase';
import { Debt, PaymentLog } from '../types/database';
import { Navbar } from '../components/Navbar';
import { DebtCard } from '../components/DebtCard';
import { CreateDebtModal } from '../components/CreateDebtModal';
import { DebtDetailModal } from '../components/DebtDetailModal';
import { SettingsModal } from '../components/SettingsModal';
import { UnmatchedPaymentsModal } from '../components/UnmatchedPaymentsModal';
import { 
  DollarSign, 
  CheckCircle, 
  Clock, 
  Search, 
  Plus, 
  Loader2, 
  AlertTriangle,
  FolderOpen
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [unmatchedLogs, setUnmatchedLogs] = useState<PaymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ACTIVAS' | 'PAGADAS'>('ACTIVAS');
  const [searchQuery, setSearchQuery] = useState('');

  // Modales
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUnmatchedOpen, setIsUnmatchedOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);

  // Cargar deudas y pagos sin conciliar
  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Obtener deudas
      const { data: debtsData, error: debtsErr } = await supabase
        .from('debts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (debtsErr) throw debtsErr;
      setDebts((debtsData as Debt[]) || []);

      // 2. Obtener pagos no conciliados
      const { data: logsData, error: logsErr } = await supabase
        .from('payment_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'NO_CONCILIADO')
        .order('created_at', { ascending: false });

      if (logsErr) throw logsErr;
      setUnmatchedLogs((logsData as PaymentLog[]) || []);

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    if (!user) return;

    // Supabase Realtime Subscription: Escucha cambios automáticos producidos por el Bot
    const debtsChannel = supabase
      .channel('realtime_debts_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debts', filter: `user_id=eq.${user.id}` },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_logs', filter: `user_id=eq.${user.id}` },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(debtsChannel);
    };
  }, [user]);

  // Cálculos métricos
  const activeDebts = debts.filter((d) => d.status === 'PENDIENTE' || d.status === 'PAGO_PARCIAL');
  const paidDebts = debts.filter((d) => d.status === 'PAGADO');

  const totalRemaining = activeDebts.reduce((sum, d) => sum + Number(d.remaining_amount), 0);
  const totalRecovered = debts.reduce(
    (sum, d) => sum + (Number(d.original_amount) - Number(d.remaining_amount)),
    0
  );

  // Filtrado por buscador
  const displayedDebts = (activeTab === 'ACTIVAS' ? activeDebts : paidDebts).filter((d) =>
    d.debtor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.note && d.note.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleDebtCreated = (newDebt: Debt) => {
    setDebts([newDebt, ...debts]);
  };

  const handleDebtUpdated = (updated: Debt) => {
    setDebts(debts.map((d) => (d.id === updated.id ? updated : d)));
    if (selectedDebt && selectedDebt.id === updated.id) {
      setSelectedDebt(updated);
    }
  };

  const handleDebtDeleted = (deletedId: string) => {
    setDebts(debts.filter((d) => d.id !== deletedId));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        onOpenCreate={() => setIsCreateOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenUnmatched={() => setIsUnmatchedOpen(true)}
        unmatchedCount={unmatchedLogs.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Banner de Aviso si hay pagos no conciliados */}
        {unmatchedLogs.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-in fade-in">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-800 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-amber-900 text-sm">
                  Tienes {unmatchedLogs.length} pago(s) entrantes sin vincular
                </h4>
                <p className="text-xs text-amber-700">
                  Google Apps Script detectó transferencias en tu correo cuyos nombres no coincidieron exactamente con tus deudores registrados.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsUnmatchedOpen(true)}
              className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold shrink-0 transition-colors shadow-sm"
            >
              Revisar y Asignar
            </button>
          </div>
        )}

        {/* Métricas Principales */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Por Cobrar</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totalRemaining)}</h3>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Cobrado</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totalRecovered)}</h3>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Deudas Activas</p>
              <h3 className="text-2xl font-black text-slate-900">{activeDebts.length}</h3>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Historial Pagados</p>
              <h3 className="text-2xl font-black text-slate-900">{paidDebts.length}</h3>
            </div>
          </div>

        </section>

        {/* Barra de Control: Pestañas + Buscador */}
        <section className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-4">
          
          {/* Tabs */}
          <div className="flex bg-slate-200/70 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('ACTIVAS')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'ACTIVAS'
                  ? 'bg-white text-purple-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Préstamos Activos ({activeDebts.length})
            </button>
            <button
              onClick={() => setActiveTab('PAGADAS')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'PAGADAS'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Historial Pagados ({paidDebts.length})
            </button>
          </div>

          {/* Buscador */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por deudor o nota..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
          </div>

        </section>

        {/* Contenido / Cuadrícula de Tarjetas */}
        <section>
          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-3" />
              <p className="text-sm font-semibold text-slate-500">Cargando tus préstamos...</p>
            </div>
          ) : displayedDebts.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 p-8">
              <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">
                {activeTab === 'ACTIVAS' ? 'No tienes préstamos activos en este momento' : 'No hay historial de préstamos pagados aún'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5">
                {activeTab === 'ACTIVAS'
                  ? 'Registra tu primer préstamo para generar links de cobro por Yape y Plin.'
                  : 'Cuando tus clientes o deudores cancelen sus montos vía Yape o Plin, aparecerán aquí.'}
              </p>
              {activeTab === 'ACTIVAS' && (
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="inline-flex items-center px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/20"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Registrar Primer Préstamo
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {displayedDebts.map((debt) => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  onSelect={(d) => setSelectedDebt(d)}
                />
              ))}
            </div>
          )}
        </section>

      </main>

      {/* Modales */}
      <CreateDebtModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onDebtCreated={handleDebtCreated}
      />

      <DebtDetailModal
        debt={selectedDebt}
        isOpen={Boolean(selectedDebt)}
        onClose={() => setSelectedDebt(null)}
        onDebtUpdated={handleDebtUpdated}
        onDebtDeleted={handleDebtDeleted}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <UnmatchedPaymentsModal
        isOpen={isUnmatchedOpen}
        onClose={() => setIsUnmatchedOpen(false)}
        unmatchedLogs={unmatchedLogs}
        activeDebts={activeDebts}
        onReconciliationSuccess={() => {
          fetchData();
          setIsUnmatchedOpen(false);
        }}
      />
    </div>
  );
};
