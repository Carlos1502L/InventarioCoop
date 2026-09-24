import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DashboardPage } from './pages/DashboardPage';
import { AuthPage } from './pages/AuthPage';
import { PublicPaymentPortal } from './pages/PublicPaymentPortal';
import { isSupabaseConfigured } from './lib/supabase';
import { Loader2, AlertCircle } from 'lucide-react';

const MainRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [searchParams] = useState(new URLSearchParams(window.location.search));

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 1. Detectar si estamos en la vista pública de cobro: /pay/:identifier o ?pay=:identifier
  const payQuery = searchParams.get('pay');
  const payPathMatch = currentPath.match(/^\/pay\/(.+)/);
  const paymentIdentifier = payQuery || (payPathMatch ? payPathMatch[1] : null);

  if (paymentIdentifier) {
    return <PublicPaymentPortal identifier={paymentIdentifier} />;
  }

  // 2. Si Supabase no está configurado, mostrar pantalla de guía
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-3xl border border-slate-700 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black">Configura tus Credenciales de Supabase</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Para iniciar, crea tu archivo <code className="bg-slate-900 px-1.5 py-0.5 rounded text-purple-300 font-mono">frontend/.env</code> basándote en <code className="bg-slate-900 px-1.5 py-0.5 rounded text-purple-300 font-mono">.env.example</code> y ejecuta el script SQL en tu proyecto de Supabase.
          </p>
          <div className="text-left bg-slate-950 p-4 rounded-xl text-xs font-mono text-purple-300 space-y-1">
            <p>VITE_SUPABASE_URL=https://tu-proyecto.supabase.co</p>
            <p>VITE_SUPABASE_ANON_KEY=tu_anon_key</p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Verificando sesión
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600 mb-2" />
        <p className="text-xs font-bold text-slate-500">Iniciando MarranilloPay...</p>
      </div>
    );
  }

  // 4. Si el usuario está autenticado -> Dashboard, si no -> Login/Registro
  return user ? <DashboardPage /> : <AuthPage />;
};

export function App() {
  return (
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  );
}

export default App;
