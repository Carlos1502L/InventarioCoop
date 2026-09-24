import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  CreditCard, 
  PlusCircle, 
  Settings, 
  LogOut, 
  User as UserIcon, 
  BellRing
} from 'lucide-react';

interface NavbarProps {
  onOpenCreate: () => void;
  onOpenSettings: () => void;
  onOpenUnmatched: () => void;
  unmatchedCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenCreate,
  onOpenSettings,
  onOpenUnmatched,
  unmatchedCount
}) => {
  const { user, profile, signOut } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Logo & Marca */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-600 via-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-pink-500/20 text-lg">
            🐷
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-purple-800 via-pink-700 to-indigo-700 bg-clip-text text-transparent">
              MarranilloPay
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 bg-pink-100 text-pink-800 rounded-full">
              Automated Bot
            </span>
          </div>
        </div>

        {/* Acciones & Perfil */}
        {user && (
          <div className="flex items-center space-x-2 sm:space-x-3">
            
            {/* Botón Pagos Pendientes de Conciliar (Notificación) */}
            {unmatchedCount > 0 && (
              <button
                onClick={onOpenUnmatched}
                className="relative inline-flex items-center px-3 py-1.5 text-xs sm:text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-all shadow-sm animate-pulse"
                title="Pagos recibidos sin conciliar"
              >
                <BellRing className="w-4 h-4 mr-1.5 text-amber-600" />
                <span>{unmatchedCount} Sin Vincular</span>
              </button>
            )}

            {/* Botón Nueva Deuda */}
            <button
              onClick={onOpenCreate}
              className="inline-flex items-center px-3.5 py-2 text-sm font-bold text-white bg-purple-700 hover:bg-purple-800 active:bg-purple-900 rounded-lg shadow-sm hover:shadow transition-all"
            >
              <PlusCircle className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Nueva Deuda</span>
              <span className="sm:hidden">Crear</span>
            </button>

            {/* Botón Configuración de Cobro */}
            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-600 hover:text-purple-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
              title="Configurar QRs de Yape, Plin y Mercado Pago"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Info de Usuario */}
            <div className="hidden md:flex items-center space-x-2 pl-2 border-l border-slate-200 text-xs text-slate-600">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-700">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-slate-800 truncate max-w-[130px]">
                  {profile?.full_name || user.email?.split('@')[0]}
                </p>
                <p className="text-slate-400 text-[10px] truncate max-w-[130px]">
                  {user.email}
                </p>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={() => signOut()}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>

          </div>
        )}
      </div>
    </header>
  );
};
