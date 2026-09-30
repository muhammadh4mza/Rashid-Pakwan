import { motion, AnimatePresence } from "motion/react";
import { Plus, Star, Minus, X, ShoppingBag, Utensils, Tag } from "lucide-react";
import { SectionHeader } from "./HotDeals";
import { Skeleton } from "../ui/skeleton";
import { useState } from "react";
import { useCartStore } from "../../store/CartStore";
import { useMenuStore } from "@/store/MenuStore";
import { resolveMediaUrl, type DisplayProduct, type MenuAddon, type MenuDrink, type ProductVariation } from "@/lib/api";
import { formatAmount } from "@/lib/formatters";

/*
  Minimal desi biryani palette
  brown  #840608   saffron #F29C1F   cream #FFF1D0 / #FFF8E7   chilli #B93A0E   green #4E8A45
*/
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F29C1F]";
const stepBtn = `grid h-7 w-7 place-items-center rounded-full text-[#840608] hover:bg-[#F29C1F]/25 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${focusRing}`;

type ProductSectionProps = {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  products: DisplayProduct[];
  loading?: boolean;
  emptyMessage?: string;
  showHeader?: boolean;
  /** Optional drink picker in the product modal (offers). */
  enableDrinks?: boolean;
};

export function ProductSection({
  title = "Popular Items",
  eyebrow = "Featured",
  subtitle = "Hand-picked favorites trending this week.",
  products,
  loading = false,
  emptyMessage = "No items available right now.",
  showHeader = true,
  enableDrinks = false,
}: ProductSectionProps) {
  const [selectedProduct, setSelectedProduct] = useState<DisplayProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [selectedVariationId, setSelectedVariationId] = useState("");
  const [selectedDrinkId, setSelectedDrinkId] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const { addItem } = useCartStore();
  const menuDrinks = useMenuStore((s) => s.drinks);

  const availableAddons: MenuAddon[] = selectedProduct?.addons || [];
  const variations: ProductVariation[] = Array.isArray(selectedProduct?.variations)
    ? selectedProduct!.variations!
    : [];
  const selectedVariation =
    variations.find((v) => v.id === selectedVariationId) || variations[0] || null;
  const drinkOptions: MenuDrink[] = enableDrinks
    ? [...menuDrinks]
        .filter((d) => d.status !== "inactive")
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];
  const selectedDrink = drinkOptions.find((d) => d.id === selectedDrinkId) || null;

  const openPopup = (product: DisplayProduct, variationId?: string) => {
    setSelectedProduct(product);
    setQuantity(1);
    setSpecialInstructions("");
    setSelectedAddons({});
    setSelectedVariationId(variationId || product.variations?.[0]?.id || "");
    setSelectedDrinkId("");
    setShowSuccess(false);
    document.body.style.overflow = "hidden";
  };

  const closePopup = () => {
    setSelectedProduct(null);
    document.body.style.overflow = "auto";
  };

  const changeAddonQuantity = (addonId: string, change: number) => {
    setSelectedAddons((prev) => {
      const nextQuantity = (prev[addonId] || 0) + change;
      const next = { ...prev };
      if (nextQuantity <= 0) delete next[addonId];
      else next[addonId] = nextQuantity;
      return next;
    });
  };

  const getProductUnitPrice = () => {
    if (!selectedProduct) return 0;
    let basePrice = selectedProduct.price;
    let salePrice = selectedProduct.discountedPrice;
    if (selectedVariation) {
      basePrice = Number(selectedVariation.price || 0);
      const varSale = selectedVariation.discountedPrice;
      salePrice =
        varSale != null && Number(varSale) > 0 && Number(varSale) < basePrice
          ? Number(varSale)
          : undefined;
    }
    const hasDiscount =
      salePrice != null && salePrice > 0 && salePrice < basePrice;
    return hasDiscount ? salePrice! : basePrice;
  };

  const getUnitPrice = () => {
    if (!selectedProduct) return 0;
    const addonsTotal = availableAddons.reduce(
      (sum, addon) => sum + addon.price * (selectedAddons[addon.id] || 0),
      0,
    );
    const drinkPrice = selectedDrink ? Number(selectedDrink.price || 0) : 0;
    return getProductUnitPrice() + addonsTotal + drinkPrice;
  };

  const getOriginalTotalPrice = () => {
    if (!selectedProduct) return 0;
    const basePrice = selectedVariation
      ? Number(selectedVariation.price || 0)
      : selectedProduct.price;
    const addonsTotal = availableAddons.reduce(
      (sum, addon) => sum + addon.price * (selectedAddons[addon.id] || 0),
      0,
    );
    const drinkPrice = selectedDrink ? Number(selectedDrink.price || 0) : 0;
    return (basePrice + addonsTotal + drinkPrice) * quantity;
  };

  const getTotalPrice = () => getUnitPrice() * quantity;

  const handleAddToCart = () => {
    if (!selectedProduct) return;

    const chosen = availableAddons
      .filter((addon) => (selectedAddons[addon.id] || 0) > 0)
      .map((addon) => ({
        ...addon,
        quantity: selectedAddons[addon.id],
      }));
    const addonNames = chosen.map(
      (addon) => `${addon.name}${addon.quantity > 1 ? ` × ${addon.quantity}` : ""}`,
    );
    const drinkNote = selectedDrink ? `Drink: ${selectedDrink.name}` : null;
    const variationNote = selectedVariation ? `Size: ${selectedVariation.name}` : null;
    const notes = [specialInstructions.trim(), variationNote, drinkNote].filter(Boolean).join(" · ");

    const displayName = selectedVariation
      ? `${selectedProduct.name} (${selectedVariation.name})`
      : selectedProduct.name;

    addItem({
      productId: selectedProduct.id,
      name: selectedDrink ? `${displayName} + ${selectedDrink.name}` : displayName,
      desc: selectedProduct.desc,
      price: getUnitPrice(),
      productPrice: getProductUnitPrice(),
      productLabel: displayName,
      currency: selectedProduct.currency,
      src: selectedProduct.src,
      addons: addonNames,
      selectedAddons: chosen,
      selectedDrink: selectedDrink
        ? { name: selectedDrink.name, price: Number(selectedDrink.price || 0) }
        : undefined,
      specialInstructions: notes || undefined,
      quantity,
    });

    setShowSuccess(true);
    setTimeout(() => closePopup(), 1200);
  };

  return (
    <>
      <section className={showHeader ? "py-10 lg:py-14" : "py-4 lg:py-6"}>
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          {showHeader && <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />}
          {/* THREE COLUMN LIST — 1 col mobile, 2 col sm/md, 3 col lg+ */}
          <div
            className={`${
              showHeader ? "mt-10" : "mt-4"
            } grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5`}
          >
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <ProductSkeleton key={i} />)
              : products.length === 0
                ? (
                  emptyMessage ? (
                    <p className="col-span-full text-center text-[#000] py-12">{emptyMessage}</p>
                  ) : null
                )
                : products.map((p, i) => (
                    <ProductCard
                      key={p.id}
                      p={p}
                      i={i}
                      onAddToCart={(variationId) => openPopup(p, variationId)}
                    />
                  ))}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/60"
            onClick={closePopup}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-label={selectedProduct.name}
              className="relative bg-[#F5f5f5] rounded-3xl max-w-4xl w-full max-h-[60vh] overflow-y-auto border-t-4 border-[#F29C1F] shadow-2xl text-[#840608]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closePopup}
                aria-label="Close"
                className={`absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-[#FFF1D0] border border-[#840608]/25 flex items-center justify-center hover:bg-[#840608] hover:text-[#F29C1F] transition-colors cursor-pointer ${focusRing}`}
              >
                <X className="h-4 w-4" />
              </button>

              <div className="grid md:grid-cols-2 gap-6 p-6">
                <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#F5F5F5] border border-[#840608]/15">
                  {selectedProduct.src ? (
                    <img
                      src={selectedProduct.src}
                      alt={selectedProduct.name}
                      className="h-full w-full object-contain"
                    />
                  ) : null}
                </div>

                <div className="flex flex-col gap-4">
                  {/* ---- Header / info ---- */}
                  <div>
                    <h2 className="text-2xl font-bold">{selectedProduct.name}</h2>
                    <p className="text-sm text-[#000] mt-1">{selectedProduct.desc}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-[#B93A0E]">
                      {selectedProduct.currency}
                      {formatAmount(getTotalPrice())}
                    </span>
                    {((selectedVariation
                      ? selectedVariation.discountedPrice != null &&
                        Number(selectedVariation.discountedPrice) > 0 &&
                        Number(selectedVariation.discountedPrice) < Number(selectedVariation.price)
                      : selectedProduct.discountedPrice != null &&
                        selectedProduct.discountedPrice > 0 &&
                        selectedProduct.discountedPrice < selectedProduct.price)) && (
                        <span className="text-sm font-semibold text-[#840608]/55 line-through decoration-2">
                          {selectedProduct.currency}
                          {formatAmount(getOriginalTotalPrice())}
                        </span>
                      )}
                  </div>

                  {/* ---- Variations (size picker) ---- */}
                  {variations.length > 0 && (
                    <div className="border-t border-dashed border-[#840608]/25 pt-4">
                      <h3 className="text-sm font-semibold mb-3">Choose size</h3>
                      <div className="space-y-2">
                        {variations.map((v) => {
                          const checked =
                            (selectedVariationId || variations[0]?.id) === v.id;
                          const sale =
                            v.discountedPrice != null &&
                            Number(v.discountedPrice) > 0 &&
                            Number(v.discountedPrice) < Number(v.price)
                              ? Number(v.discountedPrice)
                              : null;
                          return (
                            <label
                              key={v.id}
                              className={`flex items-center justify-between p-3 rounded-xl border bg-[#FFF1D0] cursor-pointer transition-colors ${
                                checked
                                  ? "border-[#840608] ring-1 ring-[#840608]/30"
                                  : "border-[#840608]/15 hover:border-[#840608]/45"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name="product-variation"
                                  checked={checked}
                                  onChange={() => setSelectedVariationId(v.id)}
                                  className="h-4 w-4 accent-[#840608] cursor-pointer"
                                />
                                <span className="text-sm font-medium">{v.name}</span>
                              </div>
                              <span className="text-sm font-medium tabular-nums">
                                {sale != null ? (
                                  <>
                                    <span className="text-[#840608]/50 line-through mr-1.5">
                                      {selectedProduct.currency}
                                      {formatAmount(v.price)}
                                    </span>
                                    {selectedProduct.currency}
                                    {formatAmount(sale)}
                                  </>
                                ) : (
                                  <>
                                    {selectedProduct.currency}
                                    {formatAmount(v.price)}
                                  </>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ---- Special instructions (moved up) ---- */}
                  <div className="border-t border-dashed border-[#840608]/25 pt-4">
                    <h3 className="text-sm font-semibold mb-2">Special instructions</h3>
                    <textarea
                      value={specialInstructions}
                      onChange={(e) => setSpecialInstructions(e.target.value)}
                      aria-label="Special instructions"
                      placeholder="Add any special requests..."
                      className={`w-full px-3 py-2 rounded-xl border border-[#840608]/25 bg-[#FFF] text-sm focus:outline-none focus:border-[#840608] transition-colors resize-none ${focusRing}`}
                      rows={2}
                    />
                  </div>

                  {/* ---- Add-ons (extras) ---- */}
                  {availableAddons.length > 0 && (
                    <div className="border-t border-dashed border-[#840608]/25 pt-4">
                      <h3 className="text-sm font-semibold mb-3">Add-ons</h3>
                      <div className="space-y-2">
                        {availableAddons.map((addon) => (
                          <div
                            key={addon.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-[#840608]/15 bg-[#FFF] transition-colors hover:border-[#840608]/45"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="text-sm">{addon.name}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className="text-sm font-medium tabular-nums">
                                {addon.originalPrice != null &&
                                Number(addon.originalPrice) > Number(addon.price) ? (
                                  <>
                                    <span className="text-[#840608]/50 line-through mr-1.5">
                                      {selectedProduct.currency}
                                      {formatAmount(addon.originalPrice)}
                                    </span>
                                    {selectedProduct.currency}
                                    {formatAmount(addon.price)}
                                  </>
                                ) : (
                                  <>
                                    {selectedProduct.currency}
                                    {formatAmount(addon.price)}
                                  </>
                                )}
                              </span>
                              <div className="flex items-center gap-1 rounded-full border border-[#840608]/25 bg-[#FFF8E7] p-0.5">
                                <button
                                  type="button"
                                  onClick={() => changeAddonQuantity(addon.id, -1)}
                                  disabled={!selectedAddons[addon.id]}
                                  aria-label={`Remove one ${addon.name}`}
                                  className={stepBtn}
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-6 text-center text-sm tabular-nums">
                                  {selectedAddons[addon.id] || 0}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => changeAddonQuantity(addon.id, 1)}
                                  aria-label={`Add one ${addon.name}`}
                                  className={stepBtn}
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ---- Add a drink (moved to bottom) ---- */}
                  {drinkOptions.length > 0 && (
                    <div className="border-t border-dashed border-[#840608]/25 pt-4">
                      <h3 className="text-sm font-semibold mb-2">Add a drink</h3>
                      <p className="text-xs text-[#000] mb-2">
                        Optional. Pick one to add with this item.
                      </p>
                      <select
                        value={selectedDrinkId}
                        onChange={(e) => setSelectedDrinkId(e.target.value)}
                        aria-label="Add a drink"
                        className={`w-full px-3 py-2.5 rounded-xl border border-[#840608]/25 bg-[#FFF1D0] text-sm focus:outline-none focus:border-[#840608] ${focusRing}`}
                      >
                        <option value="">No drink</option>
                        {drinkOptions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({selectedProduct.currency}
                            {formatAmount(d.price || 0)})
                          </option>
                        ))}
                      </select>
                      {selectedDrink?.image ? (
                        <div className="mt-2 flex items-center gap-2 text-xs text-[#840608]/65">
                          <img
                            src={resolveMediaUrl(selectedDrink.image)}
                            alt=""
                            className="h-8 w-8 rounded-lg object-cover"
                          />
                          {selectedDrink.name}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* ---- Quantity + Add to cart ---- */}
                  <div className="border-t border-dashed border-[#840608]/25 pt-4 mt-auto">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 bg-[#FFF1D0] rounded-full border border-[#840608]/25 p-1">
                        <button
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          aria-label="Decrease quantity"
                          className={`${stepBtn} !h-8 !w-8`}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center font-medium text-sm tabular-nums">{quantity}</span>
                        <button
                          onClick={() => setQuantity(quantity + 1)}
                          aria-label="Increase quantity"
                          className={`${stepBtn} !h-8 !w-8`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <button
                        onClick={handleAddToCart}
                        className={`flex-1 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#840608] text-[#fff] font-semibold hover:bg-[#5A1A10] active:scale-[0.99] transition-colors cursor-pointer ${focusRing}`}
                      >
                        <ShoppingBag className="h-4 w-4" />
                        <span>Add to cart</span>
                        <span className="tabular-nums">
                          {selectedProduct.currency}
                          {formatAmount(getTotalPrice())}
                        </span>
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showSuccess && (
                      <motion.div
                        role="status"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#4E8A45] text-[#FFF1D0] px-6 py-3 rounded-full shadow-lg font-medium text-sm border border-[#FFF1D0]/30"
                      >
                        Added to cart!
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ProductCard({
  p,
  i,
  onAddToCart,
}: {
  p: DisplayProduct;
  i: number;
  onAddToCart: (variationId?: string) => void;
}) {
  // Local variation selection so the price on the card updates live
  const hasVariations = Array.isArray(p.variations) && p.variations.length > 0;
  const [activeVariationId, setActiveVariationId] = useState<string>(
    hasVariations ? p.variations![0].id : ""
  );

  const activeVariation =
    hasVariations ? p.variations!.find((v) => v.id === activeVariationId) || p.variations![0] : null;

  // Effective price: variation price if a variation is active, else product price
  const basePrice = activeVariation ? Number(activeVariation.price || 0) : p.price;
  const varSaleRaw = activeVariation ? activeVariation.discountedPrice : p.discountedPrice;
  const salePrice =
    varSaleRaw != null && Number(varSaleRaw) > 0 && Number(varSaleRaw) < basePrice
      ? Number(varSaleRaw)
      : null;
  const currentPrice = salePrice != null ? salePrice : basePrice;
  const hasDiscount = salePrice != null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.3, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => onAddToCart(activeVariation?.id)}
      className="group relative flex flex-col rounded-3xl border border-[#840608]/15 bg-[#FFF] hover:border-[#840608]/50 transition-colors cursor-pointer overflow-hidden"
    >
      {/* TOP: thumbnail + name + description */}
      <div className="flex items-start gap-4 p-5 sm:p-6">
        {/* Thumbnail */}
        <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-2xl overflow-hidden bg-[#FFF] border border-[#840608]/10">
          {p.src ? (
            <img
              src={p.src}
              alt={p.name}
              className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full grid place-items-center">
              <Utensils className="h-8 w-8 text-[#000]/30" />
            </div>
          )}
          {hasDiscount ? (
            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-[#F29C1F] text-[#000] text-[11px] font-bold">
              <Tag className="h-3 w-3" />
              %
            </span>
          ) : null}
        </div>

        {/* Middle: name, description, rating, variations */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base sm:text-lg leading-snug line-clamp-1 text-[#000]">
              {p.name}
            </h3>
            <span className="inline-flex items-center gap-0.5 shrink-0 text-xs text-[#000]">
              <Star className="h-3.5 w-3.5 fill-[#F29C1F] text-[#F29C1F]" />
              {p.rating}
            </span>
          </div>
          <p className="text-sm text-[#000] mt-1 line-clamp-2 leading-relaxed">
            {p.desc || "Prepared fresh with signature ingredients."}
          </p>

          {/* Variation chips */}
          {hasVariations ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {p.variations!.map((v) => {
                const isActive = v.id === activeVariationId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveVariationId(v.id);
                    }}
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${focusRing} ${
                      isActive
                        ? "bg-[#840608] text-[#fff] border-[#840608]"
                        : "bg-[#FFF1D0] text-[#840608]/70 border-[#840608]/25 hover:border-[#840608] hover:text-[#840608]"
                    }`}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* BOTTOM: pricing + add button */}
      <div className="mt-auto flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-dashed border-[#840608]/20 bg-[#FFF]/40">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-lg sm:text-xl font-bold text-[#840608] tabular-nums">
            {p.currency}
            {formatAmount(currentPrice)}
          </span>
          {hasDiscount ? (
            <span className="text-sm text-[#840608]/50 line-through">
              {p.currency}
              {formatAmount(basePrice)}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(activeVariation?.id);
          }}
          aria-label={`Add ${p.name} to cart`}
          className={`grid place-items-center h-11 w-11 shrink-0 rounded-full bg-[#F29C1F] text-[#840608] hover:bg-[#840608] hover:text-[#F29C1F] active:scale-95 transition-colors cursor-pointer ${focusRing}`}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </motion.div>
  );
}

function ProductSkeleton() {
  return (
    <div className="flex flex-col rounded-3xl border border-[#840608]/10 bg-white overflow-hidden">
      {/* Top: thumbnail + text */}
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <Skeleton className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-1/2" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      </div>

      {/* Bottom: price + button */}
      <div className="mt-auto flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-dashed border-[#840608]/20 bg-[#FFF]">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>
    </div>
  );
}