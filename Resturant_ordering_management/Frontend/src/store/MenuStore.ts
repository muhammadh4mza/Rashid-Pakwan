import { create } from "zustand";
import {
  fetchPublicMenu,
  type MenuProduct,
  type MenuCategory,
  type MenuAddon,
  
  type MenuDrink,
  // type MenuProduct,
} from "@/lib/api";
import { getStoredBranchId } from "@/lib/branchSelection";

type LoadMenuOptions = {
  /** When true, skip if already loading and don't flip loading UI to true. */
  silent?: boolean;
  branchId?: string | null;
};

type MenuStore = {
  categories: MenuCategory[];
  products: MenuProduct[];
  addons: MenuAddon[];
  extras: MenuAddon[];
  drinks: MenuDrink[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  activeCategorySlug: string | null;
  selectedCategorySlugs: string[];
  selectedBranchId: string | null;
  searchQuery: string;
  onlySale: boolean;
  setSelectedBranchId: (branchId: string | null) => void;
  loadMenu: (options?: LoadMenuOptions) => Promise<void>;
  setActiveCategorySlug: (slug: string | null) => void;
  setSelectedCategorySlugs: (slugs: string[]) => void;
  toggleCategorySlug: (slug: string) => void;
  clearCategoryFilter: () => void;
  setSearchQuery: (query: string) => void;
  setOnlySale: (value: boolean) => void;
};

export const useMenuStore = create<MenuStore>((set, get) => ({
  categories: [],
  products: [],
  addons: [],
  extras: [],
  drinks: [],
  loading: false,
  error: null,
  loaded: false,
  activeCategorySlug: null,
  selectedCategorySlugs: [],
  selectedBranchId: typeof window !== "undefined" ? getStoredBranchId() : null,
  searchQuery: "",
  onlySale: false,

  setSelectedBranchId: (branchId) => set({ selectedBranchId: branchId }),

  loadMenu: async (options = {}) => {
    const silent = Boolean(options.silent);
    const branchId =
      options.branchId !== undefined ? options.branchId : get().selectedBranchId || getStoredBranchId();
    if (get().loading) return;
    set(silent ? { error: null, selectedBranchId: branchId } : { loading: true, error: null, selectedBranchId: branchId });
    try {
      const menu = await fetchPublicMenu(branchId);
      set({
        categories: menu.categories,
        products: menu.products,
        addons: menu.addons,
        extras: menu.extras || [],
        drinks: menu.drinks,
        loading: false,
        loaded: true,
        selectedBranchId: branchId,
      });
    } catch (err) {
      set({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : "Failed to load menu",
      });
    }
  },

  setActiveCategorySlug: (slug) =>
    set({
      activeCategorySlug: slug,
      // Keep selectedCategorySlugs in sync for any legacy readers, but menu no longer filters on it
      selectedCategorySlugs: slug ? [slug] : [],
    }),
  setSelectedCategorySlugs: (slugs) =>
    set({
      selectedCategorySlugs: slugs,
      activeCategorySlug: slugs.length > 0 ? slugs[0] : null,
    }),
  toggleCategorySlug: (slug) => {
    // Single-select highlight (replaces multi-filter behavior)
    const current = get().activeCategorySlug;
    const next = current === slug ? null : slug;
    set({
      activeCategorySlug: next,
      selectedCategorySlugs: next ? [next] : [],
    });
  },
  clearCategoryFilter: () =>
    set({
      activeCategorySlug: null,
      selectedCategorySlugs: [],
    }),
  setSearchQuery: (query) =>
    set({
      searchQuery: query,
      // Searching should not be limited by a category highlight
      ...(query.trim()
        ? { activeCategorySlug: null, selectedCategorySlugs: [] }
        : {}),
    }),
  setOnlySale: (value) => set({ onlySale: value }),
}));
