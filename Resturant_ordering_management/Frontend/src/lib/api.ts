// Use the shared local backend through the Vite proxy by default.
// Set VITE_API_URL for deployed environments.
const API_BASE = import.meta.env.VITE_API_URL || "https://lightsteelblue-skunk-406358.hostingersite.com/api";
const API_KEY = import.meta.env.VITE_API_KEY || "";

export type OrderItemPayload = {
  productId?: string;
  name: string;
  qty: number;
  price: number;
  selectedAddons?: Array<{ id: string; name: string; price: number; quantity?: number }>;
};

export type CreateOrderPayload = {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  items: OrderItemPayload[];
  notes?: string;
  status?: string;
  source?: string;
  couponCode?: string;
  branchId?: string;
  deliveryType?: string;
  shippingMethodId?: string;
  deliveryAreaId?: string;
};

export type OrderResponse = {
  id: string;
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  items: Array<{
    id: string;
    productId?: string;
    name: string;
    qty: number;
    price: number;
  }>;
  total: number;
  status: string;
  notes?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
};

type CartItem = {
  id: string;
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  addons?: string[];
  includedItems?: string[];
  selectedAddons?: Array<{ id: string; name: string; price: number; quantity?: number }>;
  specialInstructions?: string;
  offerBundle?: {
    offerId: string;
    offerTitle: string;
    lines: Array<{
      productId: string;
      name: string;
      price: number;
      qty: number;
      role: "buy" | "get";
    }>;
  };
};

/** Expand offer/deal bundles into product lines for pricing & order create. */
export function expandCartItemsForApi(items: CartItem[]): OrderItemPayload[] {
  const out: OrderItemPayload[] = [];
  for (const item of items) {
    if (item.offerBundle?.lines?.length) {
      const mult = Math.max(1, item.quantity || 1);
      for (const line of item.offerBundle.lines) {
        out.push({
          productId: line.productId,
          name: line.name,
          qty: line.qty * mult,
          price: line.price,
          selectedAddons: [],
        });
      }
      continue;
    }
    out.push({
      productId: item.productId || item.id,
      name: item.name,
      qty: item.quantity,
      price: item.price,
      selectedAddons: (item.selectedAddons || []).map((addon) => ({
        ...addon,
        price: addon.price * (addon.quantity || 1),
      })),
    });
  }
  return out;
}

export type WebsiteOrderData = {
  title: string;
  fullName: string;
  mobileNumber: string;
  alternateMobile?: string;
  deliveryAddress: string;
  nearestLandmark?: string;
  emailAddress: string;
  deliveryInstructions?: string;
  deliveryType: "delivery" | "pickup";
  branch?: string;
  branchId?: string;
  shippingMethodId?: string;
  deliveryAreaId?: string;
  deliveryAreaName?: string;
  paymentMethod: string;
  items: CartItem[];
  total: number;
  couponCode?: string;
};

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || "Request failed");
  }
  return body.data;
}

export function buildOrderPayload(orderData: WebsiteOrderData): CreateOrderPayload {
  const noteLines = [
    `Delivery type: ${orderData.deliveryType}`,
    orderData.deliveryType === "pickup" && orderData.branch
      ? `Branch: ${orderData.branch}`
      : `Address: ${orderData.deliveryAddress}`,
    orderData.deliveryAreaName ? `Delivery area: ${orderData.deliveryAreaName}` : null,
    orderData.nearestLandmark ? `Landmark: ${orderData.nearestLandmark}` : null,
    `Payment: ${orderData.paymentMethod}`,
    orderData.alternateMobile ? `Alternate phone: ${orderData.alternateMobile}` : null,
    orderData.deliveryInstructions ? `Instructions: ${orderData.deliveryInstructions}` : null,
    ...orderData.items.flatMap((item) => {
      const lines: string[] = [];
      if (item.includedItems?.length) {
        lines.push(`${item.name} includes: ${item.includedItems.join(", ")}`);
      }
      if (item.addons?.length) {
        lines.push(`${item.name} extras: ${item.addons.join(", ")}`);
      }
      if (item.specialInstructions) {
        lines.push(`${item.name} note: ${item.specialInstructions}`);
      }
      return lines;
    }),
  ].filter(Boolean);

  return {
    customerName: `${orderData.title} ${orderData.fullName}`.trim(),
    customerEmail: orderData.emailAddress.trim(),
    customerPhone: orderData.mobileNumber.trim(),
    items: expandCartItemsForApi(orderData.items),
    notes: noteLines.join("\n"),
    status: "pending",
    source: "website",
    couponCode: orderData.couponCode?.trim() || undefined,
    branchId: orderData.branchId || undefined,
    deliveryType: orderData.deliveryType,
    shippingMethodId: orderData.shippingMethodId || undefined,
    deliveryAreaId: orderData.deliveryAreaId || undefined,
  };
}

export type CheckoutQuote = {
  subtotal: number;
  offerDiscount: number;
  couponDiscount: number;
  taxAmount: number;
  taxExclusive: number;
  taxInclusive: number;
  shippingFee: number;
  freeDeliveryApplied?: boolean;
  freeDeliveryMessage?: string | null;
  total: number;
  couponCode?: string | null;
  coversFullSubtotal?: boolean;
  appliedOffer?: {
    id: string;
    title: string;
    type?: string;
    buyQty?: number;
    getQty?: number;
    buyProducts?: Array<{ id: string; name: string }>;
    getProducts?: Array<{ id: string; name: string }>;
  } | null;
  shippingMethod?: { id: string; name: string; price: number } | null;
};

export async function fetchCheckoutQuote(
  items: Array<{
    productId?: string;
    name: string;
    qty: number;
    price: number;
    selectedAddons?: Array<{ id: string; name: string; price: number; quantity?: number }>;
  }>,
  couponCode?: string | null,
  options?: {
    deliveryType?: string;
    shippingMethodId?: string | null;
    deliveryAreaId?: string | null;
  },
): Promise<CheckoutQuote> {
  const data = await parseResponse(
    await fetch(`${API_BASE}/public/checkout/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      },
      body: JSON.stringify({
        items,
        couponCode: couponCode || null,
        deliveryType: options?.deliveryType || "delivery",
        shippingMethodId: options?.shippingMethodId || null,
        deliveryAreaId: options?.deliveryAreaId || null,
      }),
    }),
  );
  const quote = data.quote;
  return {
    subtotal: Number(quote.subtotal || 0),
    offerDiscount: Number(quote.offerDiscount || 0),
    couponDiscount: Number(quote.couponDiscount || 0),
    taxAmount: Number(quote.taxAmount || 0),
    taxExclusive: Number(quote.taxExclusive || 0),
    taxInclusive: Number(quote.taxInclusive || 0),
    shippingFee: Number(quote.shippingFee || 0),
    freeDeliveryApplied: Boolean(quote.freeDeliveryApplied),
    freeDeliveryMessage: quote.freeDeliveryMessage || null,
    total: Number(quote.total || 0),
    couponCode: quote.couponCode || null,
    coversFullSubtotal: Boolean(quote.coversFullSubtotal),
    appliedOffer: quote.appliedOffer || null,
    shippingMethod: quote.shippingMethod || null,
  };
}

export async function validatePublicCoupon(code: string, subtotal = 0) {
  const data = await parseResponse(
    await fetch(`${API_BASE}/public/coupons/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      },
      body: JSON.stringify({ code, subtotal }),
    }),
  );
  return {
    valid: Boolean(data.valid),
    discount: Number(data.discount || 0),
    message: String(data.message || ""),
    coupon: data.coupon || null,
  };
}

const CHECKOUT_SESSION_KEY = "checkout-session-key";

export function getCheckoutSessionKey() {
  if (typeof window === "undefined") return "";
  let key = localStorage.getItem(CHECKOUT_SESSION_KEY);
  if (!key) {
    key = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CHECKOUT_SESSION_KEY, key);
  }
  return key;
}

export async function upsertAbandonedCart(payload: {
  sessionKey: string;
  customerName?: string;
  email?: string;
  phone?: string;
  address?: string;
  landmark?: string;
  deliveryType?: string;
  items: Array<{ productId?: string; name: string; qty: number; price: number }>;
  value?: number;
  branchId?: string;
  details?: Record<string, unknown> | null;
}) {
  const data = await parseResponse(
    await fetch(`${API_BASE}/public/abandoned-carts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      },
      body: JSON.stringify(payload),
    }),
  );
  return data.cart;
}

export async function recoverAbandonedCart(payload: {
  sessionKey?: string;
  email?: string;
}) {
  const data = await parseResponse(
    await fetch(`${API_BASE}/public/abandoned-carts/recover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      },
      body: JSON.stringify(payload),
    }),
  );
  return data.cart;
}

export async function createOrder(payload: CreateOrderPayload): Promise<OrderResponse> {
  const data = await parseResponse(
    await fetch(`${API_BASE}/public/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      },
      body: JSON.stringify(payload),
    }),
  );

  return data.order;
}

export type TrackingStatusMessage = {
  label: string;
  message: string;
  eta?: string | null;
};

export type TrackingSettings = {
  restaurantName: string;
  phone: string;
  supportEmail: string;
  address: string;
  logoUrl: string | null;
  helpText: string;
  pollIntervalSeconds: number;
  showRejectionReason: boolean;
  statusMessages: Record<string, TrackingStatusMessage>;
  trackingSteps: string[];
};

export type PublicOrder = {
  id: string;
  status: string;
  statusLabel: string;
  statusMessage: string;
  eta: string | null;
  items: Array<{ productId?: string | null; name: string; qty: number; price: number }>;
  total: number;
  createdAt: string;
  updatedAt: string;
  deliveryType?: string;
  address?: string;
  branch?: string;
  landmark?: string;
  payment?: string;
  instructions?: string;
  rejectionReason?: string;
  trackingSteps: string[];
  restaurant: {
    name: string;
    phone: string;
    supportEmail: string;
    address: string;
    logoUrl: string | null;
    helpText: string;
  };
  pollIntervalSeconds: number;
};

export type PublicReviewEligibility = {
  canReview: boolean;
  hasReview: boolean;
  reviewSummary: {
    id: string;
    overallRating: number;
    status: string;
    source: string;
    createdAt: string;
  } | null;
  items: Array<{ productId: string | null; name: string }>;
};

export type SubmitPublicReviewPayload = {
  overallRating: number;
  comment?: string;
  items?: Array<{
    productId?: string | null;
    productName: string;
    rating: number;
    comment?: string;
  }>;
};

export async function fetchPublicReviewEligibility(
  orderId: string,
  phone?: string,
): Promise<PublicReviewEligibility> {
  const query = phone ? `?phone=${encodeURIComponent(phone)}` : "";
  return parseResponse(await fetch(`${API_BASE}/public/orders/${orderId}/review${query}`));
}

export async function submitPublicReview(
  orderId: string,
  payload: SubmitPublicReviewPayload,
  phone?: string,
) {
  const query = phone ? `?phone=${encodeURIComponent(phone)}` : "";
  const data = await parseResponse(
    await fetch(`${API_BASE}/public/orders/${orderId}/review${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return data.review;
}

export async function fetchTrackingSettings(): Promise<TrackingSettings> {
  const data = await parseResponse(await fetch(`${API_BASE}/public/tracking-settings`));
  return data.settings;
}

export async function fetchPublicOrder(orderId: string, phone?: string): Promise<PublicOrder> {
  const query = phone ? `?phone=${encodeURIComponent(phone)}` : "";
  const data = await parseResponse(await fetch(`${API_BASE}/public/orders/${orderId}${query}`));
  return data.order;
}

export function formatOrderId(id: string) {
  if (!id) return "";
  const raw = String(id).trim().replace(/^#/, "");
  if (!raw.includes("_") && raw.length <= 12) return raw.toUpperCase();
  const parts = raw.split("_");
  const short = parts.length > 1 ? parts[parts.length - 1] : raw;
  return short.slice(0, 12).toUpperCase();
}

export type MenuAddon = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  image?: string;
  status?: string;
};

export type MenuDrink = {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock?: number;
  image?: string;
  status?: string;
  sortOrder?: number;
};

export type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  image?: string;
  sortOrder: number;
  productCount?: number;
};

export type ProductVariation = {
  id: string;
  name: string;
  price: number;
  discountedPrice?: number | null;
};

export type MenuProduct = {
  id: string;
  name: string;
  description?: string;
  price: number;
  discountedPrice?: number | null;
  tag?: string;
  rating?: number;
  image?: string;
  categoryId?: string | null;
  categorySlug?: string;
  isFeatured?: boolean;
  sortOrder?: number;
  addons?: MenuAddon[];
  variations?: ProductVariation[] | null;
};

export type DisplayProduct = {
  id: string;
  name: string;
  desc: string;
  price: number;
  currency: string;
  rating: number;
  tag?: string;
  src: string;
  discountedPrice?: number;
  addons: MenuAddon[];
  variations?: ProductVariation[] | null;
};

function apiOrigin() {
  const base = import.meta.env.VITE_API_URL || "https://lightsteelblue-skunk-406358.hostingersite.com/api";
  if (base.startsWith("http")) {
    return base.replace(/\/api\/?$/, "");
  }
  const configuredOrigin = import.meta.env.VITE_API_ORIGIN;
  if (configuredOrigin?.startsWith("http")) {
    return configuredOrigin.replace(/\/$/, "");
  }
  return "https://lightsteelblue-skunk-406358.hostingersite.com";
}

export function resolveMediaUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }
  if (path.length <= 4 && !path.startsWith("/")) return "";
  const origin = apiOrigin();
  if (path.startsWith("/uploads")) return `${origin}${path}`;
  if (path.startsWith("/")) return `${origin}${path}`;
  return `${origin}/${path}`;
}

export function toDisplayProduct(product: MenuProduct): DisplayProduct {
  const src = resolveMediaUrl(product.image);
  const price = Number(product.price ?? 0);
  const rawDiscount = product.discountedPrice != null ? Number(product.discountedPrice) : undefined;
  const hasValidDiscount = rawDiscount !== undefined && rawDiscount > 0 && rawDiscount < price;
  const discountedPrice = hasValidDiscount ? rawDiscount : undefined;

  return {
    id: product.id,
    name: product.name,
    desc: product.description || "",
    price,
    currency: "Rs ",
    rating: Number(product.rating ?? 4.5),
    tag: product.tag || (hasValidDiscount ? "OFFER" : undefined),
    src,
    discountedPrice,
    addons: product.addons || [],
    variations: product.variations || null,
  };
}

export async function fetchPublicMenu(branchId?: string | null): Promise<{
  categories: MenuCategory[];
  products: MenuProduct[];
  addons: MenuAddon[];
  extras: MenuAddon[];
  drinks: MenuDrink[];
}> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const data = await parseResponse(await fetch(`${API_BASE}/public/menu${query}`));
  return {
    categories: data.categories || [],
    products: data.products || [],
    addons: data.addons || [],
    extras: data.extras || [],
    drinks: data.drinks || [],
  };
}

export type PublicDeal = {
  id: string;
  title: string;
  description?: string;
  badgeText?: string;
  image?: string;
  price?: number;
  originalPrice?: number | null;
  couponId?: string | null;
  discountId?: string | null;
  offerId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  daysOfWeek?: number[] | null;
  dailyStartTime?: string | null;
  dailyEndTime?: string | null;
  showCountdown?: boolean;
  active?: boolean;
  sortOrder?: number;
  addonMode?: "none" | "all" | "selected";
  addonIds?: string[];
  addons?: MenuAddon[];
  couponCode?: string | null;
  discountName?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
  offerTitle?: string | null;
  items?: Array<{
    id: string;
    itemType?: "product" | "drink" | "addon";
    productId?: string | null;
    drinkId?: string | null;
    addonId?: string | null;
    name: string;
    qty: number;
    unitPrice: number;
    customerChoice?: boolean;
    choiceIds?: string[];
  }>;
};

export async function fetchPublicDeals(branchId?: string | null): Promise<PublicDeal[]> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const data = await parseResponse(await fetch(`${API_BASE}/public/deals${query}`));
  return data.deals || [];
}

export type PublicOffer = {
  id: string;
  title: string;
  description?: string;
  type?: string;
  conditions?: string;
  discountValue?: number;
  minOrder?: number;
  buyQty?: number;
  getQty?: number;
  applyScope?: "all" | "category" | "products";
  categoryId?: string | null;
  productIds?: string[];
  buyProductIds?: string[];
  getProductIds?: string[];
  freeProductId?: string | null;
  badgeText?: string;
  active?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  products?: MenuProduct[];
  buyProducts?: MenuProduct[];
  getProducts?: MenuProduct[];
  drinks?: MenuDrink[];
};

export type PublicBranch = {
  id: string;
  name: string;
  code: string;
  city?: string;
  address?: string;
  phone?: string;
  hours?: string;
  isPrimary?: boolean;
  status?: string;
};

export type PublicShippingMethod = {
  id: string;
  name: string;
  description?: string;
  price: number;
  estimatedTime?: string;
};

export async function fetchPublicBranches(): Promise<PublicBranch[]> {
  const data = await parseResponse(await fetch(`${API_BASE}/public/branches`));
  return data.branches || [];
}

export type PublicDeliveryArea = {
  id: string;
  name: string;
  charge: number;
  sortOrder?: number;
};

export async function fetchPublicDeliveryAreas(
  branchId?: string | null,
): Promise<PublicDeliveryArea[]> {
  if (!branchId) return [];
  const query = `?branchId=${encodeURIComponent(branchId)}`;
  const data = await parseResponse(await fetch(`${API_BASE}/public/delivery-areas${query}`));
  return data.areas || [];
}

export async function fetchPublicShippingMethods(): Promise<PublicShippingMethod[]> {
  const data = await parseResponse(await fetch(`${API_BASE}/public/shipping-methods`));
  return data.shippingMethods || [];
}

export async function fetchPublicOffers(branchId?: string | null): Promise<PublicOffer[]> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const data = await parseResponse(await fetch(`${API_BASE}/public/offers${query}`));
  return data.offers || [];
}

export type PublicWebsiteReview = {
  id: string;
  customerName: string;
  overallRating: number;
  comment: string;
  createdAt?: string;
  branchId?: string | null;
};

export type PublicReviewStats = {
  reviewCount: number;
  avgRating: number | null;
};

export async function fetchPublicReviews(
  branchId?: string | null,
  limit = 12
): Promise<{ reviews: PublicWebsiteReview[]; stats: PublicReviewStats }> {
  const params = new URLSearchParams();
  if (branchId) params.set("branchId", branchId);
  params.set("limit", String(limit));
  const data = await parseResponse(await fetch(`${API_BASE}/public/reviews?${params}`));
  return {
    reviews: data.reviews || [],
    stats: data.stats || { reviewCount: 0, avgRating: null },
  };
}

export type PublicPaymentGateway = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  enabled?: boolean;
};

export async function fetchPublicPaymentGateways(): Promise<PublicPaymentGateway[]> {
  const data = await parseResponse(await fetch(`${API_BASE}/public/payment-gateways`));
  return data.paymentGateways || [];
}
