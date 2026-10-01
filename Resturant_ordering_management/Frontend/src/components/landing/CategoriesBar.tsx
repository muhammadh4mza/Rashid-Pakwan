import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMenuStore } from "@/store/MenuStore";

/*
  Minimal desi biryani palette
  brown  #840608   saffron #F29C1F   cream #FFF1D0 / #FFF8E7   chilli #B93A0E   green #4E8A45
*/
export function Categories({ sticky = false }: { sticky?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const categories = useMenuStore((s) => s.categories);
  const products = useMenuStore((s) => s.products);
  const activeCategorySlug = useMenuStore((s) => s.activeCategorySlug);
  const setActiveCategorySlug = useMenuStore((s) => s.setActiveCategorySlug);
  const clearCategoryFilter = useMenuStore((s) => s.clearCategoryFilter);
  const loadMenu = useMenuStore((s) => s.loadMenu);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const chips = [
    { id: "all", name: "All menu", slug: null as string | null, count: products.length, target: "menu-products" },
    { id: "deals-nav", name: "Deals", slug: "__deals__" as string | null, count: 0, target: "deals" },
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      count: products.filter((p) => p.categoryId === c.id || p.categorySlug === c.slug).length,
      target: `category-${c.slug || c.id}`,
    })),
  ];

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 250;
      const newScrollLeft =
        scrollRef.current.scrollLeft + (direction === "left" ? -scrollAmount : scrollAmount);
      scrollRef.current.scrollTo({ left: newScrollLeft, behavior: "smooth" });
    }
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeft(scrollLeft > 20);
      setShowRight(scrollLeft < scrollWidth - clientWidth - 20);
      setIsOverflowing(scrollWidth > clientWidth + 4);
    }
  };

  // Track overflow on mount, resize, and when chips change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      const { scrollWidth, clientWidth } = el;
      setIsOverflowing(scrollWidth > clientWidth + 4);
      setShowRight(el.scrollLeft < scrollWidth - clientWidth - 20);
      setShowLeft(el.scrollLeft > 20);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [chips.length]);

  if (chips.length <= 1) return null;

  // Highlight only — do not filter other categories out of the menu.
  const isAllActive = !activeCategorySlug;

  const arrowClass =
    "absolute z-20 h-7 w-7 rounded-full bg-[#FFF1D0] text-[#840608] border border-[#840608]/15 flex items-center justify-center hover:bg-[#F29C1F] hover:text-[#840608] transition-colors cursor-pointer shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F29C1F]";

  return (
    <div
      className={`w-full bg-[#840608] border-b-2 border-t-2 border-[#F29C1F]/60 ${
        sticky ? "sticky top-[74px] sm:top-[80px] md:top-[115px] lg:top-[115px] z-40" : ""
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative py-2.5 flex items-center justify-center">
        {showLeft && (
          <button
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className={`${arrowClass} left-2`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`flex items-center gap-2 overflow-x-auto scrollbar-hide w-full py-0.5 px-6 ${
            isOverflowing ? "justify-start" : "justify-center"
          }`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {chips.map((category) => {
            const isActive =
              category.slug === "__deals__"
                ? false
                : category.slug == null
                  ? isAllActive
                  : activeCategorySlug === category.slug;
            return (
              <button
                key={category.id}
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  if (category.slug === "__deals__") {
                    clearCategoryFilter();
                    const dealsEl = document.getElementById("deals");
                    if (dealsEl) dealsEl.scrollIntoView({ behavior: "smooth" });
                    return;
                  }
                  if (category.slug == null) {
                    clearCategoryFilter();
                    const element = document.getElementById("menu-products");
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth" });
                    }
                    return;
                  }
                  // Highlight + scroll only — keep all menu sections visible/active
                  setActiveCategorySlug(category.slug);
                  setTimeout(() => {
                    const targetId = category.target || `category-${category.slug || category.id}`;
                    const element = document.getElementById(targetId);
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth" });
                    } else {
                      const menuEl = document.getElementById("menu-products");
                      if (menuEl) menuEl.scrollIntoView({ behavior: "smooth" });
                    }
                  }, 60);
                }}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F29C1F] ${
                  isActive
                    ? "bg-[#F29C1F] text-[#840608] border-[#F29C1F]"
                    : "bg-[#FFF1D0]/10 text-[#FFF1D0]/80 border-[#FFF1D0]/20 hover:bg-[#FFF1D0]/20 hover:text-[#F29C1F]"
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </div>

        {showRight && (
          <button
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className={`${arrowClass} right-2`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}