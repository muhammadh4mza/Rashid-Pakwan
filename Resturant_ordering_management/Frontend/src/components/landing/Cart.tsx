import { motion, AnimatePresence } from "motion/react";
import {
  ShoppingBag,
  X,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Truck,
  Clock,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  Tag,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatAmount } from "@/lib/formatters";
import { useMenuStore } from "@/store/MenuStore";
import { resolveMediaUrl } from "@/lib/api";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F29C1F]";

type CartItem = {
  id: string;
  name: string;
  desc: string;
  price: number;
  productPrice?: number;
  productLabel?: string;
  currency: string;
  quantity: number;
  src: string;
  addons?: string[];
  selectedAddons?: any[];
  selectedDrink?: { name: string; price: number };
  includedItems?: string[];
  specialInstructions?: string;
  offerBundle?: {
    offerId: string;
    offerTitle: string;
    lines: Array<{ name: string; qty: number; role: string }>;
  };
};

type CartProps = {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onCheckout?: () => void;
  /** Fired when the customer taps an add-on / extra card */
  onAddAddon?: (entry: any) => void;
};

type DisplayRow =
  | { kind: "single"; item: CartItem }
  | {
      kind: "offer";
      key: string;
      title: string;
      src: string;
      currency: string;
      lineTotal: number;
      quantity: number;
      includedItems: string[];
      memberIds: string[];
    };

/**
 * Normalize add-ons from ANY possible field/shape on a cart item.
 */
function extractAddons(item: any): Array<{
  id: string;
  name: string;
  price: number;
  quantity: number;
}> {
  if (!item) return [];
  const candidates = [
    item.selectedAddons,
    item.addons,
    item.addOns,
    item.extras,
    item.modifiers,
    item.options,
  ];
  for (const raw of candidates) {
    if (Array.isArray(raw) && raw.length > 0) {
      if (typeof raw[0] === "object" && raw[0] !== null) {
        const normalized = raw
          .map((a: any, i: number) => ({
            id: String(a?.id ?? a?.addonId ?? `addon-${i}`),
            name: String(a?.name ?? a?.title ?? a?.label ?? "").trim(),
            price: Number(a?.price ?? a?.unitPrice ?? 0),
            quantity: Math.max(1, Number(a?.quantity ?? a?.qty ?? 1)),
          }))
          .filter((a) => a.name.length > 0);
        if (normalized.length > 0) return normalized;
      }
      if (typeof raw[0] === "string") {
        return raw
          .map((s: any, i: number) => ({
            id: `str-${i}`,
            name: String(s),
            price: 0,
            quantity: 1,
          }))
          .filter((a) => a.name.length > 0);
      }
    }
  }
  return [];
}

function buildDisplayRows(items: CartItem[]): DisplayRow[] {
  const offerGroups = new Map<
    string,
    {
      title: string;
      src: string;
      currency: string;
      paidTotal: number;
      freeLabels: string[];
      paidLabels: string[];
      memberIds: string[];
      quantity: number;
    }
  >();
  const rows: DisplayRow[] = [];

  for (const item of items) {
    if (item.offerBundle) {
      rows.push({
        kind: "single",
        item: {
          ...item,
          includedItems:
            item.includedItems?.length
              ? item.includedItems
              : item.offerBundle.lines.map(
                  (l) => `${l.qty}× ${l.name}${l.role === "get" ? " (FREE)" : ""}`
                ),
        },
      });
      continue;
    }

    const match = item.specialInstructions?.match(
      /^Part of offer:\s*(.+?)\s*\((paid|free)/i
    );
    if (match) {
      const title = match[1].trim();
      const isFree = /free/i.test(match[2]);
      const existing = offerGroups.get(title) || {
        title,
        src: item.src,
        currency: item.currency,
        paidTotal: 0,
        freeLabels: [] as string[],
        paidLabels: [] as string[],
        memberIds: [] as string[],
        quantity: 1,
      };
      existing.memberIds.push(item.id);
      if (!existing.src && item.src) existing.src = item.src;
      const label = `${item.quantity}× ${item.name}`;
      if (isFree) {
        existing.freeLabels.push(`${label} (FREE)`);
      } else {
        existing.paidLabels.push(label);
        existing.paidTotal += item.price * item.quantity;
      }
      offerGroups.set(title, existing);
      continue;
    }

    rows.push({ kind: "single", item });
  }

  for (const group of offerGroups.values()) {
    rows.push({
      kind: "offer",
      key: `legacy-offer:${group.title}`,
      title: group.title,
      src: group.src,
      currency: group.currency,
      lineTotal: group.paidTotal,
      quantity: group.quantity,
      includedItems: [...group.paidLabels, ...group.freeLabels],
      memberIds: group.memberIds,
    });
  }

  return rows;
}

/** Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Collect every add-on AND extra across every product in the menu store.
 * Each returned entry is tagged with `__kind: "addon" | "extra"`.
 */
function useAllAddonsAndExtras() {
  const products = useMenuStore((s) => s.products);
  const allAddons = useMenuStore((s: any) => s.addons);
  const allExtras = useMenuStore((s: any) => s.extras);

  return useMemo(() => {
    const addonsMap = new Map<string, any>();
    const extrasMap = new Map<string, any>();

    // 1) Top-level store add-ons
    if (Array.isArray(allAddons)) {
      for (const a of allAddons) {
        if (a?.id) addonsMap.set(a.id, { ...a, __kind: "addon" });
      }
    }
    // 2) Top-level store extras
    if (Array.isArray(allExtras)) {
      for (const e of allExtras) {
        if (e?.id) extrasMap.set(e.id, { ...e, __kind: "extra" });
      }
    }
    // 3) Per-product add-ons + extras
    for (const p of products) {
      const addonList = (p as any)?.addons;
      if (Array.isArray(addonList)) {
        for (const a of addonList) {
          if (!a?.id) continue;
          if (!addonsMap.has(a.id)) {
            addonsMap.set(a.id, { ...a, __kind: "addon" });
          }
        }
      }
      const extraList =
        (p as any)?.extras || (p as any)?.sides || (p as any)?.options;
      if (Array.isArray(extraList)) {
        for (const e of extraList) {
          if (!e?.id) continue;
          if (!extrasMap.has(e.id)) {
            extrasMap.set(e.id, { ...e, __kind: "extra" });
          }
        }
      }
    }

    return [
      ...Array.from(addonsMap.values()),
      ...Array.from(extrasMap.values()),
    ];
  }, [products, allAddons, allExtras]);
}

export function Cart({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  onAddAddon,
}: CartProps) {
  const navigate = useNavigate();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // ---- Carousel state ----
  const allItems = useAllAddonsAndExtras();
  const [shuffledItems, setShuffledItems] = useState<any[]>([]);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  // Reshuffle every time the cart opens
  useEffect(() => {
    if (isOpen && allItems.length > 0) {
      setShuffledItems(shuffle(allItems).slice(0, 12));
    }
  }, [isOpen, allItems]);

  // Reset scroll position when the pool reshuffles
  useEffect(() => {
    if (carouselRef.current) carouselRef.current.scrollLeft = 0;
  }, [shuffledItems]);

  const scrollCarousel = (dir: "left" | "right") => {
    if (!carouselRef.current) return;
    const amount = 180;
    carouselRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const displayRows = useMemo(() => buildDisplayRows(items), [items]);

  const subtotal = useMemo(() => {
    return displayRows.reduce((sum, row) => {
      if (row.kind === "single") return sum + row.item.price * row.item.quantity;
      return sum + row.lineTotal;
    }, 0);
  }, [displayRows]);

  const currency =
    items[0]?.currency ||
    displayRows.find((r) => r.kind === "offer")?.currency ||
    "Rs ";

  const itemCount = displayRows.reduce((n, row) => {
    if (row.kind === "single") return n + row.item.quantity;
    return n + row.quantity;
  }, 0);

  const addonCount = useMemo(() => {
    return items.reduce((n, item) => {
      const list = extractAddons(item);
      if (!list.length) return n;
      return n + list.reduce((s, a) => s + a.quantity * (item.quantity || 1), 0);
    }, 0);
  }, [items]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  const handleCheckout = () => {
    setIsCheckingOut(true);
    onClose();
    setTimeout(() => {
      setIsCheckingOut(false);
      if (onCheckout) onCheckout();
      else navigate({ to: "/checkout" });
    }, 300);
  };

  const removeOfferGroup = (memberIds: string[]) => {
    for (const id of memberIds) onRemoveItem(id);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
          style={{
            background:
              "radial-gradient(120% 80% at 100% 0%, rgba(0, 0, 0, 0.25), transparent 55%), radial-gradient(120% 80% at 0% 100%, rgba(0, 0, 0, 0.25), transparent 55%), rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(14px) saturate(140%)",
            WebkitBackdropFilter: "blur(14px) saturate(140%)",
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "100%", opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.4 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="absolute right-0 top-0 h-full w-full max-w-md flex flex-col overflow-hidden border-l border-[#FFF1D0]/25 shadow-[0_0_80px_-10px_rgba(58,15,10,0.6)]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,248,231,0.92) 0%, rgba(255,241,208,0.88) 100%)",
              backdropFilter: "blur(24px) saturate(160%)",
              WebkitBackdropFilter: "blur(24px) saturate(160%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient glows */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(242,156,31,0.55) 0%, rgba(242,156,31,0) 70%)",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(185,58,14,0.5) 0%, rgba(185,58,14,0) 70%)",
              }}
            />

            {/* Header */}
            <div className="relative z-10 p-5 border-b border-[#840608]/12">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid place-items-center h-10 w-10 rounded-2xl bg-[#840608] text-[#F29C1F] border border-[#F29C1F]/30 shadow-md">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#840608] leading-tight">
                      Your Cart
                    </h2>
                    <p className="text-[11px] text-[#840608]/60 leading-tight">
                      {itemCount > 0
                        ? `${itemCount} item${itemCount === 1 ? "" : "s"}${
                            addonCount > 0
                              ? ` · ${addonCount} add-on${addonCount === 1 ? "" : "s"}`
                              : ""
                          }`
                        : "Nothing here yet"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className={`h-9 w-9 rounded-full bg-[#FFF8E7]/80 hover:bg-[#840608] hover:text-[#F29C1F] text-[#840608] transition-all flex items-center justify-center cursor-pointer border border-[#840608]/15 shadow-sm ${focusRing}`}
                  aria-label="Close cart"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Items + Carousel (single scroll area) */}
            <div className="relative z-10 flex-1 overflow-y-auto p-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-[#F29C1F]/20 to-[#B93A0E]/10 flex items-center justify-center mb-5 border border-[#F29C1F]/30 shadow-inner">
                    <ShoppingBag className="h-10 w-10 text-[#B93A0E]" />
                  </div>
                  <h3 className="text-base font-bold mb-1 text-[#840608]">
                    Cart is empty
                  </h3>
                  <p className="text-sm text-[#840608]/65 mb-5 max-w-[220px]">
                    Add something delicious to get started.
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      requestAnimationFrame(() => {
                        const el = document.getElementById("menu-products");
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                    }}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#840608] text-[#F29C1F] text-sm font-semibold cursor-pointer hover:bg-[#5A1A10] transition-colors shadow-lg ${focusRing}`}
                  >
                    Browse menu
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  {/* ---- ITEMS LIST ---- */}
                  <div className="space-y-3">
                    {displayRows.map((row, idx) => {
                      if (row.kind === "offer") {
                        return (
                          <motion.div
                            key={row.key}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className="relative flex gap-3 p-3 rounded-2xl bg-[#FFF8E7]/90 border border-[#F29C1F]/40 shadow-[0_4px_16px_-4px_rgba(58,15,10,0.12)] hover:shadow-[0_8px_24px_-6px_rgba(58,15,10,0.2)] hover:border-[#F29C1F]/70 transition-all"
                          >
                            <div className="h-16 w-16 rounded-xl overflow-hidden bg-[#FFF1D0] shrink-0 relative border border-[#840608]/10">
                              {row.src ? (
                                <img
                                  src={row.src}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="h-full w-full grid place-items-center">
                                  <Tag className="h-6 w-6 text-[#B93A0E]" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#B93A0E]">
                                    Offer
                                  </p>
                                  <h4 className="font-semibold text-sm truncate text-[#840608]">
                                    {row.title}
                                  </h4>
                                  {row.includedItems.length ? (
                                    <p className="text-xs text-[#840608]/65 mt-0.5">
                                      Includes: {row.includedItems.join(", ")}
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  onClick={() => removeOfferGroup(row.memberIds)}
                                  className={`h-8 w-8 rounded-full hover:bg-[#B93A0E]/10 text-[#840608]/60 hover:text-[#B93A0E] flex items-center justify-center shrink-0 cursor-pointer transition-colors ${focusRing}`}
                                  aria-label={`Remove ${row.title}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-sm font-bold text-[#840608]">
                                  {row.currency}
                                  {formatAmount(row.lineTotal)}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      }

                      const item = row.item;
                      const isOffer = Boolean(item.offerBundle);
                      const addons = extractAddons(item);
                      const addonUnitTotal = addons.reduce(
                        (sum, addon) => sum + addon.price * addon.quantity,
                        0
                      );
                      const productPrice =
                        item.productPrice ??
                        Math.max(
                          0,
                          item.price -
                            addonUnitTotal -
                            (item.selectedDrink?.price || 0)
                        );

                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="relative flex gap-3 p-3 rounded-2xl bg-[#FFF8E7]/90 border border-[#840608]/10 shadow-[0_4px_16px_-4px_rgba(58,15,10,0.12)] hover:shadow-[0_8px_24px_-6px_rgba(58,15,10,0.2)] hover:border-[#F29C1F]/60 transition-all"
                        >
                          <div className="h-16 w-16 rounded-xl overflow-hidden bg-[#FFF1D0] shrink-0 border border-[#840608]/10 shadow-inner">
                            {item.src ? (
                              <img
                                src={item.src}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : isOffer ? (
                              <div className="h-full w-full grid place-items-center">
                                <Tag className="h-6 w-6 text-[#B93A0E]" />
                              </div>
                            ) : null}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 w-full">
                                {isOffer ? (
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#B93A0E]">
                                    Offer
                                  </p>
                                ) : null}
                                <h4 className="font-semibold text-sm truncate text-[#840608]">
                                  {item.name}
                                </h4>
                                {item.includedItems?.length ? (
                                  <p className="text-xs text-[#840608]/65 mt-0.5">
                                    Includes: {item.includedItems.join(", ")}
                                  </p>
                                ) : null}
                                {!isOffer ? (
                                  <div className="mt-1 space-y-0.5">
                                    <div className="flex justify-between gap-2 text-xs text-[#840608]/65">
                                      <span>{item.productLabel || item.name}</span>
                                      <span className="shrink-0 tabular-nums">
                                        {item.currency}
                                        {formatAmount(productPrice * item.quantity)}
                                      </span>
                                    </div>
                                    {item.selectedDrink ? (
                                      <div className="flex justify-between gap-2 text-xs text-[#840608]/65">
                                        <span>
                                          {item.selectedDrink.name}
                                          {item.quantity > 1
                                            ? ` × ${item.quantity}`
                                            : ""}
                                        </span>
                                        <span className="shrink-0 tabular-nums">
                                          {item.currency}
                                          {formatAmount(
                                            item.selectedDrink.price * item.quantity
                                          )}
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}

                                {/* Per-item add-ons */}
                                {!isOffer && addons.length > 0 ? (
                                  <div className="mt-2 rounded-xl bg-[#FFF1D0]/70 border border-[#F29C1F]/45 px-2.5 py-2 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <Sparkles className="h-3 w-3 text-[#B93A0E] shrink-0" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#B93A0E]">
                                        Add-ons
                                      </span>
                                      <span className="ml-auto text-[10px] font-semibold text-[#840608]/60 tabular-nums">
                                        {addons.reduce((s, a) => s + a.quantity, 0)}
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      {addons.map((addon) => {
                                        const qty = addon.quantity * item.quantity;
                                        return (
                                          <div
                                            key={addon.id}
                                            className="flex justify-between gap-2 text-xs"
                                          >
                                            <span className="truncate text-[#840608]/85">
                                              {addon.name}
                                              {qty > 1 ? (
                                                <span className="text-[#840608]/55">
                                                  {" "}
                                                  × {qty}
                                                </span>
                                              ) : null}
                                            </span>
                                            {addon.price > 0 ? (
                                              <span className="shrink-0 tabular-nums font-medium text-[#840608]">
                                                +{item.currency}
                                                {formatAmount(addon.price * qty)}
                                              </span>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : null}

                                {item.specialInstructions && !isOffer ? (
                                  <p className="text-xs text-[#840608]/65 mt-1.5 flex items-start gap-1">
                                    <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                                    <span>{item.specialInstructions}</span>
                                  </p>
                                ) : null}
                              </div>
                              <button
                                onClick={() => onRemoveItem(item.id)}
                                className={`h-8 w-8 rounded-full hover:bg-[#B93A0E]/10 text-[#840608]/60 hover:text-[#B93A0E] flex items-center justify-center shrink-0 cursor-pointer transition-colors ${focusRing}`}
                                aria-label={`Remove ${item.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-sm font-bold text-[#840608]">
                                {item.currency}
                                {formatAmount(item.price * item.quantity)}
                              </span>
                              {!isOffer ? (
                                <div className="flex items-center gap-1 bg-[#FFF1D0]/80 rounded-full border border-[#840608]/15 p-0.5 backdrop-blur-sm">
                                  <button
                                    onClick={() =>
                                      onUpdateQuantity(
                                        item.id,
                                        Math.max(1, item.quantity - 1)
                                      )
                                    }
                                    className={`h-7 w-7 rounded-full hover:bg-[#F29C1F]/40 flex items-center justify-center cursor-pointer text-[#840608] transition-colors ${focusRing}`}
                                    aria-label={`Decrease ${item.name} quantity`}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="w-7 text-center text-sm font-medium tabular-nums text-[#840608]">
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() =>
                                      onUpdateQuantity(item.id, item.quantity + 1)
                                    }
                                    className={`h-7 w-7 rounded-full hover:bg-[#F29C1F]/40 flex items-center justify-center cursor-pointer text-[#840608] transition-colors ${focusRing}`}
                                    aria-label={`Increase ${item.name} quantity`}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* ---- RANDOM ADD-ONS + EXTRAS CAROUSEL ---- */}
                  {shuffledItems.length > 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="mt-5 pt-5 border-t border-dashed border-[#840608]/20"
                    >
                      {/* Header with reshuffle + arrows */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[#B93A0E]" />
                          <h3 className="text-sm font-bold text-[#840608]">
                            Add-ons &amp; extras
                          </h3>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#840608]/50">
                            Pick a few
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setShuffledItems(shuffle(allItems).slice(0, 12))
                            }
                            className={`text-[10px] font-semibold uppercase tracking-wider text-[#840608]/70 hover:text-[#840608] px-2 py-1 rounded-md hover:bg-[#FFF1D0] cursor-pointer transition-colors ${focusRing}`}
                            aria-label="Reshuffle"
                          >
                            Shuffle
                          </button>
                          <button
                            type="button"
                            onClick={() => scrollCarousel("left")}
                            className={`h-7 w-7 grid place-items-center rounded-full bg-white border border-[#840608]/20 text-[#840608] hover:bg-[#840608] hover:text-[#F29C1F] transition-colors cursor-pointer ${focusRing}`}
                            aria-label="Scroll left"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => scrollCarousel("right")}
                            className={`h-7 w-7 grid place-items-center rounded-full bg-white border border-[#840608]/20 text-[#840608] hover:bg-[#840608] hover:text-[#F29C1F] transition-colors cursor-pointer ${focusRing}`}
                            aria-label="Scroll right"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Horizontally scrolling rail */}
                      <div
                        ref={carouselRef}
                        className="flex gap-2.5 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory"
                        style={{ scrollbarWidth: "thin" }}
                      >
                        {shuffledItems.map((entry) => {
                          const price = Number(entry.price || 0);
                          const imgSrc = entry.image
                            ? resolveMediaUrl(entry.image)
                            : null;
                          const kind =
                            entry.__kind === "extra" ? "extra" : "addon";
                          return (
                            <button
                              key={`${kind}-${entry.id}`}
                              type="button"
                              onClick={() => onAddAddon?.(entry)}
                              className={`snap-start shrink-0 w-[132px] rounded-2xl bg-[#FFF8E7]/90 border hover:border-[#F29C1F]/70 hover:shadow-[0_8px_20px_-6px_rgba(58,15,10,0.2)] transition-all p-2.5 text-left cursor-pointer group ${focusRing} ${
                                kind === "extra"
                                  ? "border-[#4E8A45]/30"
                                  : "border-[#840608]/15"
                              }`}
                              aria-label={`Add ${entry.name} to cart`}
                            >
                              {/* Thumb */}
                              <div className="relative h-16 w-full rounded-xl overflow-hidden bg-[#FFF1D0] border border-[#840608]/10 mb-2 grid place-items-center">
                                {imgSrc ? (
                                  <img
                                    src={imgSrc}
                                    alt=""
                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  />
                                ) : (
                                  <Sparkles className="h-6 w-6 text-[#B93A0E]/60" />
                                )}

                                {/* Kind badge */}
                                <span
                                  className={`absolute top-1 left-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                    kind === "extra"
                                      ? "bg-[#4E8A45] text-white"
                                      : "bg-[#840608] text-[#F29C1F]"
                                  }`}
                                >
                                  {kind === "extra" ? "Extra" : "Add-on"}
                                </span>

                                {/* Floating + button */}
                                <span
                                  className={`absolute -bottom-1 -right-1 grid place-items-center h-7 w-7 rounded-full border-2 border-[#FFF8E7] shadow-md group-hover:scale-110 transition-transform ${
                                    kind === "extra"
                                      ? "bg-[#4E8A45] text-white"
                                      : "bg-[#840608] text-[#F29C1F]"
                                  }`}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </span>
                              </div>

                              {/* Name */}
                              <p className="text-xs font-semibold text-[#840608] leading-snug line-clamp-2 min-h-[2rem]">
                                {entry.name}
                              </p>

                              {/* Price */}
                              <p className="text-xs font-bold text-[#B93A0E] tabular-nums mt-1">
                                {currency}
                                {formatAmount(price)}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : null}
                </>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="relative z-10 p-5 border-t border-[#840608]/12">
                <div className="rounded-3xl bg-[#840608] border border-[#F29C1F]/40 p-4 shadow-[0_10px_30px_-10px_rgba(58,15,10,0.5)]">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs uppercase tracking-widest text-[#FFF] font-semibold">
                      Subtotal
                    </span>
                    <span className="text-xl font-bold text-[#F29C1F] tabular-nums">
                      {currency}
                      {formatAmount(subtotal)}
                    </span>
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={isCheckingOut}
                    className={`mt-3 w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-[#F5f5f5] text-[#840608] font-bold hover:bg-[#FFF1D0] disabled:opacity-70 cursor-pointer transition-all shadow-[0_8px_20px_-8px_rgba(242,156,31,0.8)] ${focusRing}`}
                  >
                    <CreditCard className="h-4 w-4" />
                    {isCheckingOut ? "Opening checkout…" : "Checkout"}
                  </button>

                  <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-[#FFF1D0]/70">
                    <span className="inline-flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Totals at checkout
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> 30–40 min
                    </span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}