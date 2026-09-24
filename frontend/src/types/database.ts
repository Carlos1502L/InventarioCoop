export type DebtStatus = 'PENDIENTE' | 'PAGO_PARCIAL' | 'PAGADO' | 'CANCELADO';

export type PaymentMethod = 
  | 'YAPE' 
  | 'PLIN' 
  | 'MERCADO_PAGO' 
  | 'TRANSFERENCIA' 
  | 'EFECTIVO' 
  | 'OTRO';

export type MatchType = 
  | 'EXACT_NAME' 
  | 'FUZZY_NAME' 
  | 'REFERENCE_CODE' 
  | 'MANUAL' 
  | 'UNMATCHED';

export type LogStatus = 
  | 'CONCILIADO' 
  | 'NO_CONCILIADO' 
  | 'ANULADO';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  yape_phone: string | null;
  yape_qr_url: string | null;
  plin_phone: string | null;
  plin_qr_url: string | null;
  mercadopago_link: string | null;
  mercadopago_access_token: string | null;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
}

export interface Debt {
  id: string;
  user_id: string;
  debtor_name: string;
  debtor_phone: string | null;
  debtor_email: string | null;
  original_amount: number;
  remaining_amount: number;
  currency: string;
  loan_date: string;
  due_date: string | null;
  note: string | null;
  status: DebtStatus;
  payment_slug: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentLog {
  id: string;
  user_id: string;
  debt_id: string | null;
  payer_name: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  operation_number: string | null;
  raw_concept: string | null;
  matched_by: MatchType;
  status: LogStatus;
  created_at: string;
}

export interface PublicDebtView {
  debt_id: string;
  payment_slug: string;
  debtor_name: string;
  original_amount: number;
  remaining_amount: number;
  currency: string;
  loan_date: string;
  due_date: string | null;
  note: string | null;
  status: DebtStatus;
  paid_at: string | null;
  creditor_name: string | null;
  yape_phone: string | null;
  yape_qr_url: string | null;
  plin_phone: string | null;
  plin_qr_url: string | null;
  mercadopago_link: string | null;
}
