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
  /** Pix online: conta conectada no painel (null = loja não recebe Pix online). */
  pix_provider: "mercadopago" | "asaas" | null;
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
  /** Promoções valendo agora (só no site do cliente). */
  promos?: LivePromo[];
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
/** on_delivery = paga na entrega; awaiting/expired = Pix online ainda não pago (não entra no painel). */
export type PaymentStatus = "on_delivery" | "awaiting" | "paid" | "expired";

export type OrderItemOption = { group: string; name: string; price_cents: number };

export type OrderItem = {
  id?: string;
  product_name: string;
  size_name: string | null;
  flavors: string[] | null;
  options: OrderItemOption[];
  quantity: number;
  unit_price_cents?: number;
  original_unit_price_cents?: number | null;
  promotion_name?: string | null;
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
  coupon_code: string | null;
  total_cents: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  paid_at: string | null;
  customer_document: string | null;
  change_for_cents: number | null;
  courier_id: string | null;
  courier_fee_cents: number | null;
  assigned_at: string | null;
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

// ---------------------------------------------------------------------------
// Promoções e cupons
// ---------------------------------------------------------------------------
export type DiscountKind = "percent" | "fixed";

export type Promotion = {
  id: string;
  store_id: string;
  name: string;
  kind: DiscountKind;
  value: number;
  product_id: string | null;
  category_id: string | null;
  weekdays: number[] | null;
  starts_on: string | null;
  ends_on: string | null;
  start_time: string | null;
  end_time: string | null;
  active: boolean;
  created_at: string;
};

export type LivePromo = { name: string; kind: DiscountKind; value: number };

export type CouponKind = "percent" | "fixed" | "free_delivery";

export type Coupon = {
  id: string;
  store_id: string;
  code: string;
  description: string | null;
  kind: CouponKind;
  value: number;
  min_order_cents: number;
  max_discount_cents: number | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  first_order_only: boolean;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
};

export type OrderQuote = {
  subtotal_cents: number;
  original_subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  coupon_code: string | null;
  coupon_kind: CouponKind | null;
  coupon_value: number | null;
  coupon_min_order_cents: number | null;
  coupon_max_discount_cents: number | null;
  coupon_description: string | null;
};

// ---------------------------------------------------------------------------
// Motoboys
// ---------------------------------------------------------------------------
export type CourierFeeMode = "fixed" | "zone_fee";

export type Courier = {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  pix_key: string | null;
  fee_mode: CourierFeeMode;
  fee_cents: number;
  daily_rate_cents: number;
  active: boolean;
  access_token: string;
  created_at: string;
};

/** Resumo de um dia de um motoboy (courier_day_json). */
export type CourierDay = {
  day: string;
  deliveries: number;
  fees_cents: number;
  daily_rate_cents: number;
  earned_cents: number;
  cash_cents: number;
  card_cents: number;
  pix_delivery_cents: number;
  paid_cents: number | null;
  paid_at: string | null;
};

export type CourierReportRow = CourierDay & { courier_id: string; courier_name: string };

/** Pedido como o motoboy vê no site dele. */
export type CourierOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_reference: string | null;
  notes: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total_cents: number;
  change_for_cents: number | null;
  courier_fee_cents: number | null;
  items_count: number;
  assigned_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
};

export type CourierPortal = {
  courier: { name: string; fee_mode: CourierFeeMode; fee_cents: number; daily_rate_cents: number };
  store: {
    name: string;
    whatsapp: string | null;
    phone: string | null;
    primary_color: string;
    logo_url: string | null;
    address_city: string | null;
    address_state: string | null;
  };
  today: string;
  open: CourierOrder[];
  delivered_today: CourierOrder[];
  days: CourierDay[];
};
