-- ==============================================================================
-- DATOS DE PRUEBA (SEED DATA OPCIONAL)
-- ==============================================================================
-- Nota: Para insertar datos de prueba, primero debes crear un usuario en 
-- Supabase Auth (por ejemplo: admin@test.com) y reemplazar 'USER_UUID_AQUI'
-- con el UID generado en auth.users.

/*
DO $$
DECLARE
    v_user_id UUID := 'USER_UUID_AQUI'::UUID;
    v_debt1_id UUID;
    v_debt2_id UUID;
BEGIN
    -- Configurar perfil con QRs de prueba
    UPDATE public.profiles
    SET 
        full_name = 'Carlos Mendoza (Mi Empresa)',
        yape_phone = '987654321',
        yape_qr_url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=YAPE-CARLOS-987654321',
        plin_phone = '987654321',
        plin_qr_url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PLIN-CARLOS-987654321',
        mercadopago_link = 'https://mpago.la/pos/carlosmendoza'
    WHERE id = v_user_id;

    -- Deuda 1: Pendiente completa
    INSERT INTO public.debts (user_id, debtor_name, debtor_phone, original_amount, remaining_amount, loan_date, note, status, payment_slug)
    VALUES (
        v_user_id,
        'Juan Perez Gomez',
        '912345678',
        150.00,
        150.00,
        CURRENT_DATE - INTERVAL '3 days',
        'Préstamo para compra de repuestos',
        'PENDIENTE',
        'deuda-juan-perez'
    ) RETURNING id INTO v_debt1_id;

    -- Deuda 2: Con abono parcial
    INSERT INTO public.debts (user_id, debtor_name, debtor_phone, original_amount, remaining_amount, loan_date, note, status, payment_slug)
    VALUES (
        v_user_id,
        'Maria Fernandez Lopez',
        '923456789',
        300.00,
        100.00,
        CURRENT_DATE - INTERVAL '7 days',
        'Servicio de diseño y consultoría',
        'PAGO_PARCIAL',
        'deuda-maria-fernandez'
    ) RETURNING id INTO v_debt2_id;

    -- Registro del abono previo de María
    INSERT INTO public.payment_logs (user_id, debt_id, payer_name, amount, payment_method, operation_number, raw_concept, matched_by, status)
    VALUES (
        v_user_id,
        v_debt2_id,
        'MARIA FERNANDEZ LOPEZ',
        200.00,
        'YAPE',
        'OP-987123',
        'Abono inicial 200 soles',
        'EXACT_NAME',
        'CONCILIADO'
    );
END $$;
*/
