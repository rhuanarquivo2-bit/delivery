export type Store = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  address_street: string | null;
  address_number: string | null;
  address_district: string | null;
  address_city: string | null;
  address_state: string | null;
  logo_url: string | null;
  primary_color: string;
  open_override: boolean | null;
  min_order_cents: number;
  prep_time_minutes: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type StoreHour = {
  id: string;
  store_id: string;
  weekday: number; // 0 = domingo
  opens_at: string; // "18:00:00"
  closes_at: string;
};

export type DeliveryZone = {
  id: string;
  store_id: string;
  neighborhood: string;
  fee_cents: number;
  active: boolean;
  sort_order: number;
};

export type StoreRole = "owner" | "staff";
