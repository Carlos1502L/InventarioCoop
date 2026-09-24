-- ==============================================================================
-- SISTEMA DE CONTROL DE PAGOS Y CONCILIACIÓN AUTOMÁTICA
-- Motor: Supabase / PostgreSQL 15+
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLA: profiles (Configuraciones de Cobro por Usuario/Acreedor)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    yape_phone TEXT,
    yape_qr_url TEXT,
    plin_phone TEXT,
    plin_qr_url TEXT,
    mercadopago_link TEXT,
    mercadopago_access_token TEXT,
    webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 3. TABLA: debts (Gestión de Préstamos y Deudas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    debtor_name TEXT NOT NULL,
    debtor_phone TEXT,
    debtor_email TEXT,
    original_amount NUMERIC(12, 2) NOT NULL CHECK (original_amount > 0),
    remaining_amount NUMERIC(12, 2) NOT NULL CHECK (remaining_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'PEN',
    loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'PENDIENTE' 
        CHECK (status IN ('PENDIENTE', 'PAGO_PARCIAL', 'PAGADO', 'CANCELADO')),
    payment_slug TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. TABLA: payment_logs (Historial de Pagos y Conciliación)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    debt_id UUID REFERENCES public.debts(id) ON DELETE SET NULL,
    payer_name TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'PEN',
    payment_method TEXT NOT NULL 
        CHECK (payment_method IN ('YAPE', 'PLIN', 'MERCADO_PAGO', 'TRANSFERENCIA', 'EFECTIVO', 'OTRO')),
    operation_number TEXT,
    raw_concept TEXT,
    raw_payload JSONB,
    matched_by TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK (matched_by IN ('EXACT_NAME', 'FUZZY_NAME', 'REFERENCE_CODE', 'MANUAL', 'UNMATCHED')),
    status TEXT NOT NULL DEFAULT 'CONCILIADO' 
        CHECK (status IN ('CONCILIADO', 'NO_CONCILIADO', 'ANULADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 5. ÍNDICES DE RENDIMIENTO Y BÚSQUEDA
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_debts_user_id ON public.debts(user_id);
CREATE INDEX IF NOT EXISTS idx_debts_status ON public.debts(status);
CREATE INDEX IF NOT EXISTS idx_debts_payment_slug ON public.debts(payment_slug);
CREATE INDEX IF NOT EXISTS idx_debts_debtor_name_lower ON public.debts (LOWER(debtor_name));
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_id ON public.payment_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_debt_id ON public.payment_logs(debt_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_op_num ON public.payment_logs(operation_number);

-- ==============================================================================
-- 6. TRIGGERS Y FUNCIONES AUXILIARES
-- ==============================================================================

-- Actualizar campo updated_at automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_debts_updated_at
    BEFORE UPDATE ON public.debts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-crear perfil al registrarse en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 7. SEGURIDAD: ROW LEVEL SECURITY (RLS) - AISLAMIENTO ESTRICTO
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para Profiles
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Políticas para Debts
CREATE POLICY "Users can view their own debts"
    ON public.debts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own debts"
    ON public.debts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own debts"
    ON public.debts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own debts"
    ON public.debts FOR DELETE
    USING (auth.uid() = user_id);

-- Políticas para Payment Logs
CREATE POLICY "Users can view their own payment logs"
    ON public.payment_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment logs"
    ON public.payment_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payment logs"
    ON public.payment_logs FOR UPDATE
    USING (auth.uid() = user_id);

-- ==============================================================================
-- 8. RPC PÚBLICA PARA EL PORTAL DE PAGO (SIN EXPONER DATOS SENSIBLES)
-- ==============================================================================
-- Esta función permite al deudor consultar su deuda y los datos de pago públicos
-- mediante el slug o ID de la deuda, sin tener sesión iniciada y sin exponer
-- tokens privados o datos de otros usuarios.

CREATE OR REPLACE FUNCTION public.get_public_debt_details(p_identifier TEXT)
RETURNS TABLE (
    debt_id UUID,
    payment_slug TEXT,
    debtor_name TEXT,
    original_amount NUMERIC(12, 2),
    remaining_amount NUMERIC(12, 2),
    currency TEXT,
    loan_date DATE,
    due_date DATE,
    note TEXT,
    status TEXT,
    paid_at TIMESTAMPTZ,
    creditor_name TEXT,
    yape_phone TEXT,
    yape_qr_url TEXT,
    plin_phone TEXT,
    plin_qr_url TEXT,
    mercadopago_link TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id AS debt_id,
        d.payment_slug,
        d.debtor_name,
        d.original_amount,
        d.remaining_amount,
        d.currency,
        d.loan_date,
        d.due_date,
        d.note,
        d.status,
        d.paid_at,
        p.full_name AS creditor_name,
        p.yape_phone,
        p.yape_qr_url,
        p.plin_phone,
        p.plin_qr_url,
        p.mercadopago_link
    FROM public.debts d
    INNER JOIN public.profiles p ON p.id = d.user_id
    WHERE (d.id::TEXT = p_identifier OR d.payment_slug = p_identifier)
    LIMIT 1;
END;
$$;

-- Otorgar permiso de ejecución al rol anónimo (anon) para el portal de pago
GRANT EXECUTE ON FUNCTION public.get_public_debt_details(TEXT) TO anon, authenticated;
