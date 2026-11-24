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

// ---------------------------------------------------------------------------
// Cardápio
// ---------------------------------------------------------------------------
export type HalfPriceRule = "highest" | "average";

export type CategorySize = {
  id: string;
  category_id: string;
  name: string;
  max_flavors: number;
  sort_order: number;
};

export type MenuOption = {
  id: string;
  group_id: string;
  name: string;
  price_cents: number;
  active: boolean;
  sort_order: number;
};

export type OptionGroup = {
  id: string;
  category_id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  options: MenuOption[];
};

export type ProductPrice = { product_id: string; size_id: string; price_cents: number };

export type Product = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number | null;
  active: boolean;
  sort_order: number;
  prices: ProductPrice[];
};

export type Category = {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  has_sizes: boolean;
  half_price_rule: HalfPriceRule;
  active: boolean;
  sort_order: number;
  sizes: CategorySize[];
  groups: OptionGroup[];
  products: Product[];
};

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------
export type OrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
export type Fulfillment = "delivery" | "pickup";
export type PaymentMethod = "pix_online" | "pix_delivery" | "card_delivery" | "cash";

export type OrderItemOption = { group: string; name: string; price_cents: number };

export type OrderItem = {
  id?: string;
  product_name: string;
  size_name: string | null;
  flavors: string[] | null;
  options: OrderItemOption[];
  quantity: number;
  unit_price_cents?: number;
  total_cents: number;
  notes: string | null;
  sort_order?: number;
};

export type Order = {
  id: string;
  store_id: string;
  number: number;
  public_token: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  customer_name: string;
  customer_phone: string;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_reference: string | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  payment_method: PaymentMethod;
  change_for_cents: number | null;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  order_items?: OrderItem[];
};
