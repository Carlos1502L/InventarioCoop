import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  X, 
  Settings, 
  QrCode, 
  Phone, 
  CreditCard, 
  Key, 
  Copy, 
  Check, 
  Loader2, 
  Save, 
  Info,
  ExternalLink
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { profile, updateProfile } = useAuth();

  const [fullName, setFullName] = useState('');
  const [yapePhone, setYapePhone] = useState('');
  const [yapeQrUrl, setYapeQrUrl] = useState('');
  const [plinPhone, setPlinPhone] = useState('');
  const [plinQrUrl, setPlinQrUrl] = useState('');
  const [mercadopagoLink, setMercadopagoLink] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setYapePhone(profile.yape_phone || '');
      setYapeQrUrl(profile.yape_qr_url || '');
      setPlinPhone(profile.plin_phone || '');
      setPlinQrUrl(profile.plin_qr_url || '');
      setMercadopagoLink(profile.mercadopago_link || '');
    }
  }, [profile, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopySecret = () => {
    if (profile?.webhook_secret) {
      navigator.clipboard.writeText(profile.webhook_secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    const { error } = await updateProfile({
      full_name: fullName.trim() || null,
      yape_phone: yapePhone.trim() || null,
      yape_qr_url: yapeQrUrl.trim() || null,
      plin_phone: plinPhone.trim() || null,
      plin_qr_url: plinQrUrl.trim() || null,
      mercadopago_link: mercadopagoLink.trim() || null
    });

    setSaving(false);
    if (error) {
      setStatusMessage({ type: 'error', text: 'Error guardando cambios: ' + error.message });
    } else {
      setStatusMessage({ type: 'success', text: 'Configuración actualizada exitosamente.' });
      setTimeout(() => {
        setStatusMessage(null);
      }, 3000);
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
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Configuración de Cobros y QRs</h2>
              <p className="text-xs text-slate-500">
                Personaliza los métodos que tus deudores verán en el portal de pago
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

        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {statusMessage && (
            <div className={`p-3 rounded-xl text-xs font-semibold ${
              statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {statusMessage.text}
            </div>
          )}

          {/* Nombre Comercial o Titular */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Tu Nombre o Nombre de Negocio
            </label>
            <input
              type="text"
              placeholder="Ej: Carlos Mendoza Repuestos"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 font-medium"
            />
          </div>

          {/* Configuración YAPE */}
          <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-3">
            <div className="flex items-center space-x-2 text-purple-900 font-bold text-sm">
              <div className="w-3 h-3 rounded-full bg-purple-700" />
              <span>Configuración de Yape</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Número de Celular Yape
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    placeholder="987654321"
                    value={yapePhone}
                    onChange={(e) => setYapePhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  URL de Imagen de tu Código QR Yape
                </label>
                <div className="relative">
                  <QrCode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="url"
                    placeholder="https://i.imgur.com/tu-qr-yape.png"
                    value={yapeQrUrl}
                    onChange={(e) => setYapeQrUrl(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>
            </div>
            {yapeQrUrl && (
              <div className="pt-2 flex items-center space-x-3">
                <img src={yapeQrUrl} alt="Vista previa QR Yape" className="w-12 h-12 object-contain rounded border border-purple-200 bg-white" />
                <span className="text-[11px] text-purple-700 font-medium">Vista previa cargada</span>
              </div>
            )}
          </div>

          {/* Configuración PLIN */}
          <div className="p-4 bg-teal-50/50 border border-teal-100 rounded-2xl space-y-3">
            <div className="flex items-center space-x-2 text-teal-900 font-bold text-sm">
              <div className="w-3 h-3 rounded-full bg-teal-500" />
              <span>Configuración de Plin</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Número de Celular Plin
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    placeholder="987654321"
                    value={plinPhone}
                    onChange={(e) => setPlinPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  URL de Imagen de tu Código QR Plin
                </label>
                <div className="relative">
                  <QrCode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="url"
                    placeholder="https://i.imgur.com/tu-qr-plin.png"
                    value={plinQrUrl}
                    onChange={(e) => setPlinQrUrl(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>
            </div>
            {plinQrUrl && (
              <div className="pt-2 flex items-center space-x-3">
                <img src={plinQrUrl} alt="Vista previa QR Plin" className="w-12 h-12 object-contain rounded border border-teal-200 bg-white" />
                <span className="text-[11px] text-teal-700 font-medium">Vista previa cargada</span>
              </div>
            )}
          </div>

          {/* Configuración Mercado Pago */}
          <div className="p-4 bg-sky-50/50 border border-sky-100 rounded-2xl space-y-3">
            <div className="flex items-center space-x-2 text-sky-900 font-bold text-sm">
              <CreditCard className="w-4 h-4 text-sky-600" />
              <span>Configuración de Mercado Pago</span>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Link de Cobro o Perfil de Mercado Pago
              </label>
              <input
                type="url"
                placeholder="https://mpago.la/pos/tu-usuario"
                value={mercadopagoLink}
                onChange={(e) => setMercadopagoLink(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Coloca tu link de pago de Mercado Pago o punto de cobro online.
              </p>
            </div>
          </div>

          {/* Credenciales de Automatización (Webhook Secret) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center space-x-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
              <Key className="w-4 h-4 text-purple-600" />
              <span>Token Secreto para Google Apps Script</span>
            </div>
            <p className="text-xs text-slate-500">
              Usa este secreto en la constante <code className="bg-slate-200 px-1 rounded text-purple-800 font-mono">WEBHOOK_SECRET</code> de tu script de Gmail:
            </p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={profile?.webhook_secret || 'Generando...'}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-700"
              />
              <button
                type="button"
                onClick={handleCopySecret}
                className="px-3 py-1.5 bg-purple-100 text-purple-800 hover:bg-purple-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center"
              >
                {copiedSecret ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copiedSecret ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Guardar */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-5 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl shadow-sm disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
