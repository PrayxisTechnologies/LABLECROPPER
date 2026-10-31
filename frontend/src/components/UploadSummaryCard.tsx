"use client";

import React, { useEffect, useMemo, useState } from "react";
import { UploadInspectionResponse, SortOption, UserSKU, MarketplaceSummary } from "@/lib/types";
import { apiCreateSku, apiGetSkus, apiUpdateSku } from "@/lib/api-auth";

interface UploadSummaryCardProps {
  data: UploadInspectionResponse;
  isLoading?: boolean;
  currentSort?: SortOption | string;
  isReSorting?: boolean;
  activeExcludedMainSkus?: string[];
  activeExcludedSkus?: string[];
  activeExcludedCouriers?: string[];
  activeExcludedMarketplaces?: string[];
  smartSkuDetection?: boolean;
  onUpdateBatch?: (params: {
    sort: SortOption;
    excluded_main_skus: string[];
    excluded_skus: string[];
    excluded_couriers: string[];
    excluded_marketplaces?: string[];
    smart_sku_detection?: boolean;
  }) => void;
  onConfirmSku?: (params: {
    oldSku: string;
    newSku: string;
    keyword: string;
  } | {
    resolutions: Array<{
      oldSku: string;
      newSku: string;
      keyword: string;
    }>;
  }) => Promise<void> | void;
  // Fallbacks for backwards compatibility
  onApplySort?: (sort: SortOption) => void;
  onApplyFilters?: (filters: {
    excluded_main_skus: string[];
    excluded_skus: string[];
    excluded_couriers: string[];
    excluded_marketplaces?: string[];
  }) => void;
}

export const UploadSummaryCard: React.FC<UploadSummaryCardProps> = ({
  data,
  isLoading = false,
  currentSort = "sku_courier",
  isReSorting = false,
  activeExcludedMainSkus = [],
  activeExcludedSkus = [],
  activeExcludedCouriers = [],
  activeExcludedMarketplaces = [],
  smartSkuDetection = false,
  onUpdateBatch,
  onConfirmSku,
  onApplySort,
  onApplyFilters,
}) => {
  // Smart Sort (Letter-wise & Number-wise A-Z / 0-9) state
  const [smartSort, setSmartSort] = useState<boolean>(true);

  // Local state for instant SKU updates without continuous PDF re-renders
  const [localMainSkus, setLocalMainSkus] = useState(data.main_skus || []);
  const [pendingResolutions, setPendingResolutions] = useState<Array<{ oldSku: string; newSku: string; keyword: string }>>([]);

  useEffect(() => {
    setLocalMainSkus(data.main_skus || []);
    setPendingResolutions([]);
  }, [data.main_skus]);

  // Inline SKU Editing states
  const [editingMainSku, setEditingMainSku] = useState<string | null>(null);
  const [editSkuName, setEditSkuName] = useState<string>("");
  const [editKeyword, setEditKeyword] = useState<string>("");
  const [initialKws, setInitialKws] = useState<string[]>([]);
  const [isConfirmingSku, setIsConfirmingSku] = useState<boolean>(false);
  const [isSavingSku, setIsSavingSku] = useState<boolean>(false);
  const [editSuccessSku, setEditSuccessSku] = useState<string | null>(null);
  const [userSkusMap, setUserSkusMap] = useState<Record<string, UserSKU>>({});
  const [isLoadingSkuKeywords, setIsLoadingSkuKeywords] = useState<boolean>(false);
  const [isCustomUserSku, setIsCustomUserSku] = useState<boolean>(false);
  const [splittingVariant, setSplittingVariant] = useState<string | null>(null);
  const [splitTargetSku, setSplitTargetSku] = useState<string>("");
  const [savingCatalogSku, setSavingCatalogSku] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Real-Time Unknown SKU Assignment states
  const [assigningVariant, setAssigningVariant] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<"existing" | "new" | null>(null);
  const [selectedExistingSku, setSelectedExistingSku] = useState<string>("");
  const [newSkuInput, setNewSkuInput] = useState<string>("");

  // Top-Level Bulk / Common Keyword Add SKU states
  const [isBulkAddOpen, setIsBulkAddOpen] = useState<boolean>(false);
  const [bulkAddMode, setBulkAddMode] = useState<"existing" | "new">("existing");
  const [bulkSelectedExistingSku, setBulkSelectedExistingSku] = useState<string>("");
  const [bulkNewSkuName, setBulkNewSkuName] = useState<string>("");
  const [bulkCommonKeyword, setBulkCommonKeyword] = useState<string>("");

  // Pre-load user SKUs from Personal SKU Database for instant mapping lookup
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      try {
        const res = await apiGetSkus({ size: 1000 });
        if (isMounted && res && res.items) {
          const map: Record<string, UserSKU> = {};
          for (const item of res.items) {
            if (item.sku_code) {
              map[item.sku_code.trim().toUpperCase()] = item;
            }
          }
          setUserSkusMap(map);
        }
      } catch {
        // Guest mode or offline fallback
      }
    }
    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"main_sku" | "all_skus" | "courier" | "platforms">("main_sku");

  // Sorting in All SKUs Tab
  const [sortBy, setSortBy] = useState<"name" | "count">("name");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [skuSearchQuery, setSkuSearchQuery] = useState<string>("");
  const [selectedMainSkuFilter, setSelectedMainSkuFilter] = useState<string | null>(null);

  // Expanded Main SKU variants accordion
  const [expandedMainSkus, setExpandedMainSkus] = useState<Record<string, boolean>>({});

  // Selected PDF Organization Mode
  const [selectedSort, setSelectedSort] = useState<SortOption>(
    (currentSort as SortOption) || "sku_courier"
  );

  useEffect(() => {
    if (currentSort) {
      setSelectedSort((currentSort as SortOption) || "sku_courier");
    }
  }, [currentSort]);

  // Exclusion Sets
  const [excludedMainSkus, setExcludedMainSkus] = useState<Set<string>>(
    new Set(activeExcludedMainSkus.map((s) => s.toUpperCase()))
  );
  const [excludedSkus, setExcludedSkus] = useState<Set<string>>(
    new Set(activeExcludedSkus.map((s) => s.toUpperCase()))
  );
  const [excludedCouriers, setExcludedCouriers] = useState<Set<string>>(
    new Set(activeExcludedCouriers.map((s) => s.toUpperCase()))
  );
  const [excludedMarketplaces, setExcludedMarketplaces] = useState<Set<string>>(
    new Set((activeExcludedMarketplaces || []).map((s) => s.toUpperCase()))
  );

  useEffect(() => {
    setExcludedMainSkus(new Set((activeExcludedMainSkus || []).map((s) => s.toUpperCase())));
  }, [activeExcludedMainSkus]);

  useEffect(() => {
    setExcludedSkus(new Set((activeExcludedSkus || []).map((s) => s.toUpperCase())));
  }, [activeExcludedSkus]);

  useEffect(() => {
    setExcludedCouriers(new Set((activeExcludedCouriers || []).map((s) => s.toUpperCase())));
  }, [activeExcludedCouriers]);

  useEffect(() => {
    setExcludedMarketplaces(new Set((activeExcludedMarketplaces || []).map((s) => s.toUpperCase())));
  }, [activeExcludedMarketplaces]);

  // Check if changes differ from active PDF settings or pending SKU assignments
  const hasChanges = useMemo(() => {
    if (pendingResolutions.length > 0) return true;
    if (selectedSort !== currentSort) return true;

    const propMain = new Set((activeExcludedMainSkus || []).map((s) => s.toUpperCase()));
    const propSku = new Set((activeExcludedSkus || []).map((s) => s.toUpperCase()));
    const propCourier = new Set((activeExcludedCouriers || []).map((s) => s.toUpperCase()));
    const propMarketplace = new Set((activeExcludedMarketplaces || []).map((s) => s.toUpperCase()));

    if (excludedMainSkus.size !== propMain.size) return true;
    for (const item of excludedMainSkus) {
      if (!propMain.has(item)) return true;
    }

    if (excludedSkus.size !== propSku.size) return true;
    for (const item of excludedSkus) {
      if (!propSku.has(item)) return true;
    }

    if (excludedCouriers.size !== propCourier.size) return true;
    for (const item of excludedCouriers) {
      if (!propCourier.has(item)) return true;
    }

    if (excludedMarketplaces.size !== propMarketplace.size) return true;
    for (const item of excludedMarketplaces) {
      if (!propMarketplace.has(item)) return true;
    }

    return false;
  }, [
    pendingResolutions.length,
    selectedSort,
    currentSort,
    excludedMainSkus,
    excludedSkus,
    excludedCouriers,
    excludedMarketplaces,
    activeExcludedMainSkus,
    activeExcludedSkus,
    activeExcludedCouriers,
    activeExcludedMarketplaces,
  ]);

  const totalDetectedLabels = useMemo(() => {
    return localMainSkus.reduce((sum, g) => sum + g.label_count, 0);
  }, [localMainSkus]);

  const totalExcludedItemsCount =
    excludedMainSkus.size + excludedSkus.size + excludedCouriers.size + excludedMarketplaces.size;

  const handleApplyClick = async () => {
    if (isReSorting) return;
    setInlineError(null);

    // 1. Atomically resolve all pending SKU assignments in this 1 click
    if (pendingResolutions.length > 0 && onConfirmSku) {
      try {
        await onConfirmSku({ resolutions: pendingResolutions });
        setPendingResolutions([]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to update PDF with confirmed SKUs.";
        setInlineError(msg);
        return;
      }
    }

    // 2. Apply batch sort & exclusions
    const params = {
      sort: selectedSort,
      excluded_main_skus: Array.from(excludedMainSkus),
      excluded_skus: Array.from(excludedSkus),
      excluded_couriers: Array.from(excludedCouriers),
      excluded_marketplaces: Array.from(excludedMarketplaces),
      smart_sku_detection: smartSort,
    };

    if (onUpdateBatch) {
      onUpdateBatch(params);
    } else {
      if (onApplySort && selectedSort !== currentSort) onApplySort(selectedSort);
      if (onApplyFilters) onApplyFilters(params);
    }
  };

  const handleResetAllExclusions = () => {
    setExcludedMainSkus(new Set());
    setExcludedSkus(new Set());
    setExcludedCouriers(new Set());
    setExcludedMarketplaces(new Set());

    const params = {
      sort: selectedSort,
      excluded_main_skus: [],
      excluded_skus: [],
      excluded_couriers: [],
      excluded_marketplaces: [],
      smart_sku_detection: smartSort,
    };

    if (onUpdateBatch) {
      onUpdateBatch(params);
    } else if (onApplyFilters) {
      onApplyFilters(params);
    }
  };

  const toggleExcludeMainSku = (mainSkuName: string) => {
    const key = mainSkuName.toUpperCase();
    setExcludedMainSkus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExcludeMarketplace = (mpName: string) => {
    const key = mpName.toUpperCase();
    setExcludedMarketplaces((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExcludeSku = (skuName: string) => {
    const key = skuName.toUpperCase();
    setExcludedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExcludeCourier = (courierName: string) => {
    const key = courierName.toUpperCase();
    setExcludedCouriers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExpandMainSku = (mainSkuName: string) => {
    setExpandedMainSkus((prev) => ({
      ...prev,
      [mainSkuName]: !prev[mainSkuName],
    }));
  };

  const handleStartEditSku = async (mainSkuName: string, subSkus?: { sku: string }[]) => {
    setEditingMainSku(mainSkuName);
    setEditSkuName(mainSkuName);
    setIsLoadingSkuKeywords(true);
    setIsCustomUserSku(false);
    setInlineError(null);

    // Fallback ONLY for unsaved temporary batch-only SKUs
    const batchVariants = (subSkus && subSkus.length > 0)
      ? subSkus.map((s) => s.sku).filter((s) => Boolean(s) && s !== "UNMATCHED")
      : [mainSkuName];

    let finalValues = batchVariants;
    const upperKey = mainSkuName.trim().toUpperCase();

    // 1. Check local cache (userSkusMap) - strictly show only user's explicitly saved keywords
    const cached = userSkusMap[upperKey];
    if (cached && cached.keywords && cached.keywords.length > 0) {
      finalValues = cached.keywords;
      setEditSkuName(cached.sku_code || mainSkuName);
      setIsCustomUserSku(true);
      setEditKeyword(finalValues.join(", "));
      setInitialKws(finalValues);
      setIsLoadingSkuKeywords(false);
      return;
    }

    // 2. Query personal SKU database directly for this SKU
    try {
      const res = await apiGetSkus({ search: mainSkuName.trim(), size: 20 });
      const matched = res.items.find(
        (it) => it.sku_code.trim().toUpperCase() === upperKey
      );
      if (matched && matched.keywords && matched.keywords.length > 0) {
        finalValues = matched.keywords;
        setEditSkuName(matched.sku_code);
        setIsCustomUserSku(true);
        setUserSkusMap((prev) => ({
          ...prev,
          [upperKey]: matched,
        }));
      }
    } catch {
      // Guest mode or offline fallback
    } finally {
      setIsLoadingSkuKeywords(false);
    }

    setInitialKws(finalValues);
    setEditKeyword(finalValues.join(", "));
  };

  const handleCancelEditSku = () => {
    setEditingMainSku(null);
    setEditSkuName("");
    setEditKeyword("");
    setInitialKws([]);
    setIsCustomUserSku(false);
    setInlineError(null);
  };

  const handleSaveEditSku = async (oldSkuName: string) => {
    const cleanNewSku = editSkuName.trim().toUpperCase();
    if (!cleanNewSku) return;

    setInlineError(null);
    setIsSavingSku(true);
    try {
      // Split multiple keywords by commas, semicolons, or newlines
      const parsedKws = editKeyword
        .split(/[,;\n\r]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const finalKws = parsedKws.length > 0 ? Array.from(new Set(parsedKws)) : [cleanNewSku];

      // Update in personal catalog if authenticated
      const existingDoc = userSkusMap[oldSkuName.trim().toUpperCase()] || userSkusMap[cleanNewSku];
      const skuId = existingDoc?.id || (existingDoc as any)?._id;
      if (existingDoc && skuId) {
        try {
          await apiUpdateSku(skuId, {
            sku_code: cleanNewSku,
            product_name: cleanNewSku,
            keywords: finalKws,
          });
          setUserSkusMap((prev) => ({
            ...prev,
            [cleanNewSku]: { ...existingDoc, sku_code: cleanNewSku, product_name: cleanNewSku, keywords: finalKws },
          }));
        } catch (e) {
          console.warn("apiUpdateSku failed:", e);
        }
      } else {
        try {
          const created = await apiCreateSku({
            sku_code: cleanNewSku,
            product_name: cleanNewSku,
            keywords: finalKws,
            aliases: [],
            priority: 0,
            is_active: true,
          });
          setUserSkusMap((prev) => ({
            ...prev,
            [cleanNewSku]: created,
          }));
        } catch (e) {
          console.warn("apiCreateSku failed:", e);
        }
      }

      // Update local SKU list immediately
      setLocalMainSkus((prev) => {
        return prev.map((grp) => {
          if (grp.main_sku.toUpperCase() === oldSkuName.trim().toUpperCase()) {
            return {
              ...grp,
              main_sku: cleanNewSku,
              sub_skus: grp.sub_skus.map((s) => ({ ...s, main_sku: cleanNewSku })),
            };
          }
          return grp;
        });
      });

      // Queue resolution for PDF update
      setPendingResolutions((prev) => [
        ...prev.filter((r) => r.oldSku !== oldSkuName),
        { oldSku: oldSkuName, newSku: cleanNewSku, keyword: finalKws.join(", ") },
      ]);

      setEditSuccessSku(cleanNewSku);
      setTimeout(() => setEditSuccessSku(null), 3000);
      setEditingMainSku(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save SKU mapping.";
      setInlineError(msg);
    } finally {
      setIsSavingSku(false);
    }
  };

  const handleConfirmSplitVariant = async (parentMainSku: string, variantSku: string) => {
    const cleanSplitSku = splitTargetSku.trim().toUpperCase();
    if (!cleanSplitSku) return;

    setInlineError(null);
    setIsConfirmingSku(true);
    try {
      if (onConfirmSku) {
        await onConfirmSku({
          oldSku: parentMainSku,
          newSku: cleanSplitSku,
          keyword: variantSku,
        });
      }
      setSplittingVariant(null);
      setSplitTargetSku("");
      setEditSuccessSku(cleanSplitSku);
      setTimeout(() => setEditSuccessSku(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to split variant.";
      setInlineError(msg);
    } finally {
      setIsConfirmingSku(false);
    }
  };

  const handleSaveSkuToCatalog = async (skuName: string, subSkus?: { sku: string }[]) => {
    const cleanName = skuName.trim().toUpperCase();
    setSavingCatalogSku(cleanName);
    setInlineError(null);
    try {
      const kws = subSkus && subSkus.length > 0
        ? Array.from(new Set([cleanName, ...subSkus.map((s) => s.sku).filter((s) => Boolean(s) && s !== "UNMATCHED")]))
        : [cleanName];

      // Validate cross-SKU uniqueness against userSkusMap
      for (const kw of kws) {
        const lowerKw = kw.toLowerCase();
        for (const [otherCode, otherDoc] of Object.entries(userSkusMap)) {
          if (otherCode !== cleanName) {
            const otherVals = [otherCode.toLowerCase(), ...(otherDoc.keywords || []).map((k) => k.toLowerCase())];
            if (otherVals.includes(lowerKw)) {
              throw new Error(`The value '${kw}' is already assigned to SKU '${otherCode}'. Two SKUs cannot share the same value.`);
            }
          }
        }
      }

      const created = await apiCreateSku({
        sku_code: cleanName,
        product_name: cleanName,
        keywords: kws,
        aliases: [],
        priority: 0,
        is_active: true,
      });

      setUserSkusMap((prev) => ({
        ...prev,
        [cleanName]: created,
      }));
      setEditSuccessSku(cleanName);
      setTimeout(() => setEditSuccessSku(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save SKU to personal catalog.";
      setInlineError(msg);
    } finally {
      setSavingCatalogSku(null);
    }
  };

  const handleAssignVariantToExisting = async (variantSku: string, targetSku: string) => {
    if (!targetSku) return;
    setInlineError(null);
    setIsSavingSku(true);
    try {
      const cleanTarget = targetSku.trim().toUpperCase();
      const cleanVariant = variantSku.trim();

      // 1. Fast DB Save in background
      const existingDoc = userSkusMap[cleanTarget];
      const skuId = existingDoc?.id || (existingDoc as any)?._id;
      if (existingDoc && skuId) {
        const currentKws = existingDoc.keywords || [];
        if (!currentKws.map((k) => k.toLowerCase()).includes(cleanVariant.toLowerCase())) {
          const updatedKws = [...currentKws, cleanVariant];
          try {
            await apiUpdateSku(skuId, { keywords: updatedKws });
            setUserSkusMap((prev) => ({
              ...prev,
              [cleanTarget]: { ...existingDoc, keywords: updatedKws },
            }));
          } catch (e) {
            console.warn("apiUpdateSku failed:", e);
          }
        }
      } else {
        try {
          const created = await apiCreateSku({
            sku_code: cleanTarget,
            product_name: cleanTarget,
            keywords: [cleanTarget, cleanVariant],
            aliases: [],
            priority: 0,
            is_active: true,
          });
          setUserSkusMap((prev) => ({
            ...prev,
            [cleanTarget]: created,
          }));
        } catch (e) {
          console.warn("apiCreateSku failed:", e);
        }
      }

      // 2. Instant Local UI State Update (< 50ms, zero lag!)
      setLocalMainSkus((prev) => {
        let movedSub: any = null;

        const next = prev.map((grp) => {
          const u = grp.main_sku.toUpperCase();
          if (u === "UNKNOWN" || u === "UNKNOWN SKUS" || u === "UNMATCHED") {
            const found = grp.sub_skus.find((s) => s.sku === cleanVariant);
            if (found) movedSub = found;
            const remainingSubs = grp.sub_skus.filter((s) => s.sku !== cleanVariant);
            const countDiff = found ? found.label_count : 0;
            return {
              ...grp,
              label_count: Math.max(0, grp.label_count - countDiff),
              total_quantity: Math.max(0, grp.total_quantity - countDiff),
              sub_skus: remainingSubs,
            };
          }
          return grp;
        });

        if (movedSub) {
          const targetIndex = next.findIndex((g) => g.main_sku.toUpperCase() === cleanTarget);
          if (targetIndex >= 0) {
            const tg = next[targetIndex];
            next[targetIndex] = {
              ...tg,
              label_count: tg.label_count + movedSub.label_count,
              total_quantity: tg.total_quantity + movedSub.quantity,
              sub_skus: [...tg.sub_skus, { ...movedSub, main_sku: cleanTarget }],
            };
          } else {
            next.push({
              main_sku: cleanTarget,
              label_count: movedSub.label_count,
              total_quantity: movedSub.quantity,
              courier_counts: {},
              sub_skus: [{ ...movedSub, main_sku: cleanTarget }],
            });
          }
        }
        return next;
      });

      // 3. Queue resolution for 1-click PDF update
      setPendingResolutions((prev) => [
        ...prev.filter((r) => r.oldSku !== cleanVariant),
        { oldSku: cleanVariant, newSku: cleanTarget, keyword: cleanVariant },
      ]);

      setAssigningVariant(null);
      setAssignMode(null);
      setSelectedExistingSku("");
      setEditSuccessSku(cleanTarget);
      setTimeout(() => setEditSuccessSku(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to assign variant to SKU.";
      setInlineError(msg);
    } finally {
      setIsSavingSku(false);
    }
  };

  const handleCreateAndAssignNewSku = async (variantSku: string, newSkuName: string) => {
    const cleanName = newSkuName.trim().toUpperCase();
    if (!cleanName) return;
    setInlineError(null);
    setIsSavingSku(true);
    try {
      const cleanVariant = variantSku.trim();

      // 1. Save new SKU in personal catalog
      try {
        const created = await apiCreateSku({
          sku_code: cleanName,
          product_name: cleanName,
          keywords: Array.from(new Set([cleanName, cleanVariant])),
          aliases: [],
          priority: 0,
          is_active: true,
        });
        setUserSkusMap((prev) => ({
          ...prev,
          [cleanName]: created,
        }));
      } catch (e) {
        console.warn("apiCreateSku failed:", e);
      }

      // 2. Instant Local UI State Update
      setLocalMainSkus((prev) => {
        let movedSub: any = null;

        const next = prev.map((grp) => {
          const u = grp.main_sku.toUpperCase();
          if (u === "UNKNOWN" || u === "UNKNOWN SKUS" || u === "UNMATCHED") {
            const found = grp.sub_skus.find((s) => s.sku === cleanVariant);
            if (found) movedSub = found;
            const remainingSubs = grp.sub_skus.filter((s) => s.sku !== cleanVariant);
            const countDiff = found ? found.label_count : 0;
            return {
              ...grp,
              label_count: Math.max(0, grp.label_count - countDiff),
              total_quantity: Math.max(0, grp.total_quantity - countDiff),
              sub_skus: remainingSubs,
            };
          }
          return grp;
        });

        if (movedSub) {
          const targetIndex = next.findIndex((g) => g.main_sku.toUpperCase() === cleanName);
          if (targetIndex >= 0) {
            const tg = next[targetIndex];
            next[targetIndex] = {
              ...tg,
              label_count: tg.label_count + movedSub.label_count,
              total_quantity: tg.total_quantity + movedSub.quantity,
              sub_skus: [...tg.sub_skus, { ...movedSub, main_sku: cleanName }],
            };
          } else {
            next.push({
              main_sku: cleanName,
              label_count: movedSub.label_count,
              total_quantity: movedSub.quantity,
              courier_counts: {},
              sub_skus: [{ ...movedSub, main_sku: cleanName }],
            });
          }
        }
        return next;
      });

      // 3. Queue resolution for 1-click PDF update
      setPendingResolutions((prev) => [
        ...prev.filter((r) => r.oldSku !== cleanVariant),
        { oldSku: cleanVariant, newSku: cleanName, keyword: cleanVariant },
      ]);

      setAssigningVariant(null);
      setAssignMode(null);
      setNewSkuInput("");
      setEditSuccessSku(cleanName);
      setTimeout(() => setEditSuccessSku(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create new SKU.";
      setInlineError(msg);
    } finally {
      setIsSavingSku(false);
    }
  };

  const handleBulkAddSku = async () => {
    const rawKw = bulkCommonKeyword.trim();
    if (!rawKw) {
      setInlineError("Kripya common word ya keyword enter karein (e.g. 'brown' ya 'rspk').");
      return;
    }

    setInlineError(null);
    setIsSavingSku(true);

    try {
      let targetSku = "";

      if (bulkAddMode === "existing") {
        targetSku = (bulkSelectedExistingSku || allKnownCodes[0] || "").trim().toUpperCase();
        if (!targetSku) {
          throw new Error("Kripya existing SKU select karein ya 'New SKU banana hai' choose karein.");
        }

        // Add keyword to catalog in background
        const existingDoc = userSkusMap[targetSku];
        const skuId = existingDoc?.id || (existingDoc as any)?._id;
        if (existingDoc && skuId) {
          const currentKws = existingDoc.keywords || [];
          const updatedKws = Array.from(new Set([...currentKws, rawKw]));
          try {
            await apiUpdateSku(skuId, { keywords: updatedKws });
            setUserSkusMap((prev) => ({
              ...prev,
              [targetSku]: { ...existingDoc, keywords: updatedKws },
            }));
          } catch (e) {
            console.warn("apiUpdateSku failed:", e);
          }
        } else {
          try {
            const created = await apiCreateSku({
              sku_code: targetSku,
              product_name: targetSku,
              keywords: [targetSku, rawKw],
              aliases: [],
              priority: 0,
              is_active: true,
            });
            setUserSkusMap((prev) => ({
              ...prev,
              [targetSku]: created,
            }));
          } catch (e) {
            console.warn("apiCreateSku failed:", e);
          }
        }
      } else {
        targetSku = bulkNewSkuName.trim().toUpperCase();
        if (!targetSku) {
          throw new Error("Kripya naya SKU name enter karein (jaise 'BROWN' ya 'ROSPACK-BROWN').");
        }

        try {
          const created = await apiCreateSku({
            sku_code: targetSku,
            product_name: targetSku,
            keywords: Array.from(new Set([targetSku, rawKw])),
            aliases: [],
            priority: 0,
            is_active: true,
          });
          setUserSkusMap((prev) => ({
            ...prev,
            [targetSku]: created,
          }));
        } catch (e) {
          console.warn("apiCreateSku failed:", e);
        }
      }

      // Filter matching variants from unknownGroup
      const matchedSubs = matchingVariants;
      const matchedSkusSet = new Set(matchedSubs.map((s) => s.sku));
      const matchedLabelsCount = matchedSubs.reduce((sum, s) => sum + s.label_count, 0);

      // Instant Local UI update
      setLocalMainSkus((prev) => {
        const next = prev.map((grp) => {
          const u = grp.main_sku.toUpperCase();
          if (u === "UNKNOWN" || u === "UNKNOWN SKUS" || u === "UNMATCHED") {
            return {
              ...grp,
              label_count: Math.max(0, grp.label_count - matchedLabelsCount),
              total_quantity: Math.max(0, grp.total_quantity - matchedLabelsCount),
              sub_skus: grp.sub_skus.filter((s) => !matchedSkusSet.has(s.sku)),
            };
          }
          return grp;
        });

        const targetIndex = next.findIndex((g) => g.main_sku.toUpperCase() === targetSku);
        const mappedSubs = matchedSubs.map((s) => ({ ...s, main_sku: targetSku }));
        if (targetIndex >= 0) {
          const tg = next[targetIndex];
          next[targetIndex] = {
            ...tg,
            label_count: tg.label_count + matchedLabelsCount,
            total_quantity: tg.total_quantity + matchedLabelsCount,
            sub_skus: [...tg.sub_skus, ...mappedSubs],
          };
        } else {
          next.push({
            main_sku: targetSku,
            label_count: matchedLabelsCount,
            total_quantity: matchedLabelsCount,
            courier_counts: {},
            sub_skus: mappedSubs,
          });
        }
        return next;
      });

      // Queue resolutions for 1-click PDF update
      const newResolutions = matchedSubs.map((m) => ({
        oldSku: m.sku,
        newSku: targetSku,
        keyword: rawKw,
      }));
      setPendingResolutions((prev) => [
        ...prev.filter((r) => !newResolutions.some((nr) => nr.oldSku === r.oldSku)),
        ...newResolutions,
      ]);

      setIsBulkAddOpen(false);
      setBulkCommonKeyword("");
      setBulkNewSkuName("");
      setEditSuccessSku(targetSku);
      setTimeout(() => setEditSuccessSku(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add SKU and re-filter batch.";
      setInlineError(msg);
    } finally {
      setIsSavingSku(false);
    }
  };

  // Group separation: Available (Saved) SKUs first, then UNKNOWN group, then UNMATCHED
  const availableMainSkus = useMemo(() => {
    return localMainSkus.filter((g) => {
      const u = g.main_sku.trim().toUpperCase();
      return u !== "UNKNOWN" && u !== "UNKNOWN SKUS" && u !== "UNMATCHED";
    });
  }, [localMainSkus]);

  const unknownGroup = useMemo(() => {
    const rawUnknown = localMainSkus.find((g) => {
      const u = g.main_sku.trim().toUpperCase();
      return u === "UNKNOWN" || u === "UNKNOWN SKUS";
    });
    const rawUnmatched = localMainSkus.find((g) => {
      const u = g.main_sku.trim().toUpperCase();
      return u === "UNMATCHED";
    });

    if (!rawUnknown && !rawUnmatched) return null;

    const combinedSubs = [
      ...(rawUnknown?.sub_skus || []),
      ...(rawUnmatched?.sub_skus || []),
    ];
    const totalCount = (rawUnknown?.label_count || 0) + (rawUnmatched?.label_count || 0);

    return {
      main_sku: "UNKNOWN",
      total_quantity: (rawUnknown?.total_quantity || 0) + (rawUnmatched?.total_quantity || 0),
      label_count: totalCount,
      courier_counts: {
        ...(rawUnknown?.courier_counts || {}),
        ...(rawUnmatched?.courier_counts || {}),
      },
      sub_skus: combinedSubs,
    };
  }, [localMainSkus]);

  // Alphanumeric natural letter-wise and number-wise sorted list
  const sortedAvailableMainSkus = useMemo(() => {
    const list = [...availableMainSkus];
    if (smartSort) {
      list.sort((a, b) => a.main_sku.localeCompare(b.main_sku, undefined, { numeric: true, sensitivity: "base" }));
    }
    return list;
  }, [availableMainSkus, smartSort]);

  const sortedUnknownSubSkus = useMemo(() => {
    if (!unknownGroup || !unknownGroup.sub_skus) return [];
    const list = [...unknownGroup.sub_skus];
    if (smartSort) {
      list.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: "base" }));
    }
    return list;
  }, [unknownGroup?.sub_skus, smartSort]);

  const allKnownCodes = useMemo(() => {
    return Array.from(new Set([
      ...availableMainSkus.map((g) => g.main_sku.trim().toUpperCase()),
      ...Object.keys(userSkusMap),
    ])).filter((c) => c && c !== "UNKNOWN" && c !== "UNMATCHED");
  }, [availableMainSkus, userSkusMap]);

  // Suggested common keywords extracted from current unknown variants
  const suggestedWords = useMemo(() => {
    if (!unknownGroup || !unknownGroup.sub_skus) return [];
    const stopWords = new Set(["the", "and", "for", "set", "best", "wear", "daily", "fragrance"]);
    const wordCounts: Record<string, number> = {};

    for (const sub of unknownGroup.sub_skus) {
      const text = sub.sku.replace(/([a-z])([A-Z])/g, "$1 $2");
      const tokens = text.match(/[A-Za-z0-9]+/g) || [];
      for (const t of tokens) {
        const subTokens = t.match(/[A-Za-z]+|\d+/g) || [];
        for (const st of subTokens) {
          const lower = st.toLowerCase();
          if (lower.length >= 3 && !stopWords.has(lower)) {
            wordCounts[lower] = (wordCounts[lower] || 0) + 1;
          }
        }
      }
    }

    return Object.keys(wordCounts)
      .sort((a, b) => wordCounts[b] - wordCounts[a] || b.length - a.length)
      .slice(0, 8);
  }, [unknownGroup]);

  // Real-time matching preview for common keyword
  const matchingVariants = useMemo(() => {
    if (!unknownGroup || !bulkCommonKeyword.trim()) return [];
    const q = bulkCommonKeyword.trim().toLowerCase();
    return (unknownGroup.sub_skus || []).filter((s) => s.sku.toLowerCase().includes(q));
  }, [unknownGroup, bulkCommonKeyword]);

  const matchingLabelsCount = useMemo(() => {
    return matchingVariants.reduce((sum, s) => sum + s.label_count, 0);
  }, [matchingVariants]);

  const remainingVariantsCount = useMemo(() => {
    if (!unknownGroup || !unknownGroup.sub_skus) return 0;
    return unknownGroup.sub_skus.length - matchingVariants.length;
  }, [unknownGroup, matchingVariants]);

  // Filter & sort Sub SKUs for Tab 2
  const sortedSubSkus = useMemo(() => {
    let list = [...data.all_skus].filter((s) => s.sku !== "UNMATCHED" && s.main_sku !== "UNMATCHED");
    if (selectedMainSkuFilter) {
      list = list.filter((s) => s.main_sku === selectedMainSkuFilter);
    }
    if (skuSearchQuery.trim()) {
      const q = skuSearchQuery.trim().toLowerCase();
      list = list.filter((s) => s.sku.toLowerCase().includes(q) || s.main_sku.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortBy === "count") {
        return sortAsc ? a.label_count - b.label_count : b.label_count - a.label_count;
      }
      return sortAsc ? a.sku.localeCompare(b.sku) : b.sku.localeCompare(a.sku);
    });
    return list;
  }, [data.all_skus, selectedMainSkuFilter, skuSearchQuery, sortBy, sortAsc]);

  const sortedCouriers = useMemo(() => {
    return [...data.courier_breakdown].sort((a, b) => b.label_count - a.label_count);
  }, [data.courier_breakdown]);

  const getMainSkuColorStyle = (name: string, isExcluded: boolean = false) => {
    if (isExcluded) {
      return {
        border: "border-slate-200 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/40 opacity-60",
        badge: "bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-200 dark:border-slate-800",
        dot: "bg-slate-400",
      };
    }
    const upper = name.toUpperCase();
    if (upper === "UNKNOWN" || upper === "UNKNOWN SKUS" || upper === "UNMATCHED") {
      return {
        border: "border-amber-300/70 dark:border-amber-700/50 bg-amber-50/30 dark:bg-slate-900/60",
        badge: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40",
        dot: "bg-amber-500",
      };
    }
    // Clean, professional, neat SaaS style
    return {
      border: "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60",
      badge: "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700",
      dot: "bg-slate-500 dark:bg-slate-400",
    };
  };

  const formatCourierName = (c: string) => {
    if (c.toLowerCase() === "xpressbees") return "Xpress Bees";
    return c;
  };

  if (isLoading) {
    return (
      <div className="w-full bg-white dark:bg-[#0A101D] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 animate-pulse h-full flex flex-col justify-center items-center">
        <div className="w-6 h-6 border-2 border-indigo-500 dark:border-indigo-400 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Analyzing Batch SKUs & Couriers...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-[#0A101D] border border-slate-200 dark:border-slate-800/90 rounded-2xl shadow-xl overflow-hidden transition-colors">
      {/* 1. Header Bar: Title, Count, SKU/Variant View Toggle & 1-Line Platform/Courier Bar */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-950/70 flex-shrink-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-300" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Batch Summary</h3>
            {totalDetectedLabels > data.total_labels ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold border border-slate-300 dark:border-slate-700">
                {data.total_labels} / {totalDetectedLabels} Labels ({totalDetectedLabels - data.total_labels} Excluded)
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold border border-slate-200 dark:border-slate-700/80">
                {data.total_labels} Labels
              </span>
            )}
          </div>

          {/* Clean 2-Way View Toggle: Grouped SKUs vs All Variants */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("main_sku")}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                activeTab === "main_sku"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold border border-slate-300 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              SKU ({availableMainSkus.length + (unknownGroup && (unknownGroup.sub_skus || []).length > 0 ? 1 : 0)})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("all_skus")}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                activeTab === "all_skus"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold border border-slate-300 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Variants ({sortedSubSkus.length})
            </button>
          </div>
        </div>

        {/* Unified 1-Line Platform & Delivery Partner Overview (Neat, Clean, Professional SaaS Style) */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs">
          {/* Platforms row */}
          <div className="flex items-center flex-wrap gap-1.5 min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Platform:
            </span>
            {data.marketplace_breakdown && data.marketplace_breakdown.length > 0 ? (
              data.marketplace_breakdown.map((m) => {
                const isExcluded = excludedMarketplaces.has(m.marketplace.toUpperCase());
                return (
                  <button
                    key={m.marketplace}
                    type="button"
                    onClick={() => toggleExcludeMarketplace(m.marketplace)}
                    className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                      isExcluded
                        ? "bg-slate-100 dark:bg-slate-800/40 text-slate-400 border-dashed border-slate-300 dark:border-slate-700 line-through opacity-60"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                    }`}
                    title={isExcluded ? `Click to include ${m.marketplace}` : `Click to exclude ${m.marketplace}`}
                  >
                    <span>{m.marketplace}</span>
                    <strong className="font-bold text-slate-900 dark:text-white">{m.label_count}</strong>
                  </button>
                );
              })
            ) : (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                <span>Meesho</span>
                <strong className="font-bold text-slate-900 dark:text-white">{data.total_labels}</strong>
              </span>
            )}
          </div>

          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>

          {/* Couriers row */}
          <div className="flex items-center flex-wrap gap-1.5 min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Courier:
            </span>
            {data.courier_breakdown && data.courier_breakdown.length > 0 ? (
              data.courier_breakdown.map((c) => {
                const isExcluded = excludedCouriers.has(c.courier.toUpperCase());
                return (
                  <button
                    key={c.courier}
                    type="button"
                    onClick={() => toggleExcludeCourier(c.courier)}
                    className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                      isExcluded
                        ? "bg-slate-100 dark:bg-slate-800/40 text-slate-400 border-dashed border-slate-300 dark:border-slate-700 line-through opacity-60"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                    }`}
                    title={isExcluded ? `Click to include ${c.courier}` : `Click to exclude ${c.courier}`}
                  >
                    <span>{formatCourierName(c.courier)}</span>
                    <strong className="font-bold text-slate-900 dark:text-white">{c.label_count}</strong>
                  </button>
                );
              })
            ) : (
              <span className="text-slate-400 text-[11px] italic">None</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Compact Control Bar: Organize Dropdown + Single Update Action */}
      <div className="p-3 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800/70 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="sort-select" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center space-x-1">
            <span>Organize PDF Labels:</span>
          </label>
          {(totalExcludedItemsCount > 0 || totalDetectedLabels > data.total_labels) && (
            <div className="flex items-center space-x-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-200 dark:border-rose-500/25">
              <span>✕ {totalExcludedItemsCount || (totalDetectedLabels - data.total_labels)} Excluded</span>
              <button
                type="button"
                onClick={handleResetAllExclusions}
                className="underline hover:text-rose-700 dark:hover:text-white text-rose-600 dark:text-rose-300 ml-1 cursor-pointer font-bold"
                title="Include all detected labels in the PDF"
              >
                Include All ({totalDetectedLabels})
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <select
            id="sort-select"
            value={selectedSort}
            onChange={(e) => setSelectedSort(e.target.value as SortOption)}
            disabled={isReSorting}
            className="flex-1 min-w-0 appearance-none bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/90 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 cursor-pointer font-medium"
          >
            <optgroup label="🏪 Platform / Marketplace First (Meesho, fir Flipkart, fir Snapdeal)">
              <option value="marketplace">🏪 Platform First (All Meesho → Flipkart → Snapdeal)</option>
              <option value="marketplace_sku_courier">🏷️ Platform + SKU + Delivery Partner</option>
              <option value="marketplace_courier">🚚 Platform + Delivery Partner</option>
            </optgroup>
            <optgroup label="🚚 Delivery Partner Primary (Valmo, Shadowfax, Ekart...)">
              <option value="courier_sku_marketplace">🚚 Delivery Partner + SKU + Platform</option>
              <option value="courier_marketplace_sku">🚚 Delivery Partner + Platform + SKU</option>
              <option value="courier_partner">🚚 Delivery Partner Only (All Valmo, then Shadowfax)</option>
            </optgroup>
            <optgroup label="📦 SKU / Product First">
              <option value="sku_marketplace_courier">📦 SKU + Platform + Delivery Partner</option>
              <option value="sku_courier_marketplace">🏷️ SKU + Delivery Partner + Platform</option>
              <option value="sku_courier">🏷️ SKU + Delivery Partner (Standard)</option>
              <option value="sku">📦 Product SKU Variants Only</option>
            </optgroup>
            <optgroup label="📄 Document Order">
              <option value="original_order">📄 Original Order (Input Sequence)</option>
            </optgroup>
          </select>

          <button
            type="button"
            onClick={handleApplyClick}
            disabled={isReSorting || !hasChanges}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
              hasChanges
                ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:brightness-110 active:scale-95 shadow-md"
                : "bg-slate-100 dark:bg-slate-800/60 text-slate-400 border border-slate-200 dark:border-slate-700/60 cursor-default"
            }`}
          >
            {isReSorting ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Updating...</span>
              </>
            ) : hasChanges ? (
              <span>⚡ Update PDF</span>
            ) : (
              <span>✓ Synced</span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Main Body Content (Smoothly Scrollable Sidebar Area) */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 custom-scrollbar">
        {/* ======================================================== */}
        {/* TAB 1: MAIN SKU VIEW                                      */}
        {/* ======================================================== */}
        {activeTab === "main_sku" && (
          <div className="space-y-3">
            {/* 1. Available (Saved) Catalog SKUs */}
            {sortedAvailableMainSkus.length > 0 && (
              <div className="space-y-2.5">
                {sortedAvailableMainSkus.map((group) => {
                  const isMainExcluded = excludedMainSkus.has(group.main_sku.toUpperCase());
                  const colorStyle = getMainSkuColorStyle(group.main_sku, isMainExcluded);
                  const isExpanded = !!expandedMainSkus[group.main_sku];
                  const courierCounts = group.courier_counts || {};
                  const excludedVariantsInGroup = (group.sub_skus || []).filter((s) => excludedSkus.has(s.sku.toUpperCase())).length;

                  return (
                    <div
                      key={group.main_sku}
                      className={`rounded-xl border ${colorStyle.border} p-3 transition-all shadow-sm ${
                        isMainExcluded ? "opacity-60" : ""
                      }`}
                    >
                      {/* Top: Color Dot, Title, Label Count & Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 min-w-0 flex-1 flex-wrap">
                          <span className={`w-2.5 h-2.5 rounded-full ${colorStyle.dot} shrink-0`} />
                          <span
                            className={`text-sm font-bold break-all leading-snug ${
                              isMainExcluded ? "line-through text-slate-400" : "text-slate-900 dark:text-white"
                            }`}
                            title={group.main_sku}
                          >
                            {group.main_sku}
                          </span>
                          {/* Catalog status / Batch Only badge */}
                          {!userSkusMap[group.main_sku.trim().toUpperCase()] && (
                            <div className="flex items-center space-x-1 shrink-0">
                              <span
                                className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60"
                                title="This SKU is local to this batch and not yet saved in your permanent SKU database."
                              >
                                Batch Only
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSaveSkuToCatalog(group.main_sku, group.sub_skus)}
                                disabled={savingCatalogSku === group.main_sku.trim().toUpperCase()}
                                className="text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
                                title="Click to save this SKU to your permanent Personal SKU Database"
                              >
                                {savingCatalogSku === group.main_sku.trim().toUpperCase() ? "Saving..." : "＋ Save to Catalog"}
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          {excludedVariantsInGroup > 0 && !isMainExcluded && (
                            <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold bg-amber-100 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 px-1.5 py-0.5 rounded">
                              {excludedVariantsInGroup} excluded
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${colorStyle.badge}`}>
                            {excludedVariantsInGroup > 0 && !isMainExcluded
                              ? `${group.label_count - excludedVariantsInGroup} / ${group.label_count}`
                              : group.label_count}
                          </span>

                          {/* Edit Button */}
                          {onConfirmSku && (
                            <button
                              type="button"
                              onClick={() => handleStartEditSku(group.main_sku, group.sub_skus)}
                              disabled={isReSorting || isConfirmingSku}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                              title="Map multiple SKU values / rename"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}

                          {editSuccessSku === group.main_sku && (
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/30 animate-in fade-in">
                              ✓ Applied!
                            </span>
                          )}

                          {/* Exclude / Cross Button */}
                          <button
                            type="button"
                            onClick={() => toggleExcludeMainSku(group.main_sku)}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all border cursor-pointer ${
                              isMainExcluded
                                ? "bg-rose-500 text-white border-rose-400 hover:bg-rose-600"
                                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-slate-300 dark:border-slate-700"
                            }`}
                          >
                            {isMainExcluded ? "Excluded" : "✕ Exclude"}
                          </button>
                        </div>
                      </div>

                      {/* Inline SKU Editor */}
                      {editingMainSku === group.main_sku && (
                        <div className="mt-2.5 p-3.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 shadow-xl space-y-3 animate-in fade-in">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                                Map Multiple Values / Rename SKU
                              </span>
                              {isLoadingSkuKeywords ? (
                                <span className="text-[9px] text-slate-400 animate-pulse">Loading saved values...</span>
                              ) : isCustomUserSku ? (
                                <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/30 px-1.5 py-0.5 rounded">
                                  ✓ Loaded from Your Catalog
                                </span>
                              ) : (
                                <span className="text-[9px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  Batch Detected
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] text-slate-500 dark:text-slate-400">
                              Separate multiple SKUs by comma
                            </span>
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                              Parent SKU Name:
                            </label>
                            <input
                              type="text"
                              value={editSkuName}
                              onChange={(e) => setEditSkuName(e.target.value)}
                              placeholder="Parent SKU Name (e.g. GREEN, BROWN)"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon transition-colors"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                                Matching Values / Multiple SKUs:
                              </label>
                              <span className="text-[9px] font-mono text-cyan-600 dark:text-cyan-300 font-bold">
                                {editKeyword ? `${editKeyword.split(/[,;\n\r]+/).filter(Boolean).length} values` : "0 values"}
                              </span>
                            </div>
                            <textarea
                              rows={3}
                              value={editKeyword}
                              onChange={(e) => setEditKeyword(e.target.value)}
                              placeholder="e.g. Rospack Brown 80ml 0139, Po10Brown, 074, BROWN"
                              className="w-full px-2.5 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-cyan-700 dark:text-cyan-300 font-mono focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon resize-none leading-relaxed"
                            />
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                              Any shipping label containing any of these multiple values will group under <span className="text-cyan-600 dark:text-cyan-neon font-semibold">&quot;{editSkuName || "this SKU"}&quot;</span>.
                            </p>
                          </div>

                          {inlineError && (
                            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-[11px] text-rose-700 dark:text-rose-300 font-medium">
                              ⚠️ {inlineError}
                            </div>
                          )}

                          <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-200 dark:border-slate-800/80">
                            <button
                              type="button"
                              onClick={handleCancelEditSku}
                              className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditSku(group.main_sku)}
                              disabled={isConfirmingSku || !editSkuName.trim()}
                              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 dark:from-cyan-neon dark:to-cyan-400 text-white dark:text-navy-950 hover:opacity-95 shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                              {isConfirmingSku ? "Saving & Applying..." : "Save Mapping"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Delivery Partners row */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {Object.entries(courierCounts).map(([cName, cnt]) => (
                          <span
                            key={cName}
                            className="px-2 py-0.5 rounded bg-white/90 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 flex items-center space-x-1"
                          >
                            <span className="text-slate-500 dark:text-slate-400">{formatCourierName(cName)}:</span>
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-300">{cnt}</span>
                          </span>
                        ))}
                      </div>

                      {/* Expand Sub-Variants Toggle */}
                      {group.sub_skus && group.sub_skus.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400">
                            {group.sub_skus.length} individual variant{group.sub_skus.length !== 1 ? "s" : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleExpandMainSku(group.main_sku)}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium cursor-pointer"
                          >
                            {isExpanded ? "Hide Variants" : "View Variants ↓"}
                          </button>
                        </div>
                      )}

                      {/* Expanded Sub-Variants */}
                      {isExpanded && group.sub_skus && (
                        <div className="mt-2 space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800/80 animate-in fade-in">
                          {group.sub_skus.map((sub) => {
                            const isSubExcluded = isMainExcluded || excludedSkus.has(sub.sku.toUpperCase());
                            return (
                              <div key={sub.sku} className="space-y-1">
                                <div
                                  className={`flex items-center justify-between p-2 rounded bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/70 text-xs ${
                                    isSubExcluded ? "opacity-60" : ""
                                  }`}
                                >
                                  <span className={`font-mono break-all leading-snug mr-2 ${isSubExcluded ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-200"}`} title={sub.sku}>
                                    {sub.sku}
                                  </span>
                                  <div className="flex items-center space-x-1.5 shrink-0">
                                    <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-300 font-bold">
                                      {sub.label_count}
                                    </span>
                                    {!isMainExcluded && (
                                      <>
                                        {onConfirmSku && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSplittingVariant(sub.sku);
                                              setSplitTargetSku(sub.sku.toUpperCase());
                                              setInlineError(null);
                                            }}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-cyan-300 dark:border-cyan-700/60 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900 cursor-pointer"
                                            title="Split this variant into a new SKU underneath"
                                          >
                                            ⇄ Split
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => toggleExcludeSku(sub.sku)}
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                            isSubExcluded
                                              ? "bg-rose-500 text-white border-rose-400"
                                              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-rose-600 border-slate-200 dark:border-slate-700"
                                          }`}
                                        >
                                          ✕
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Inline Split Prompt */}
                                {splittingVariant === sub.sku && (
                                  <div className="p-2.5 rounded-lg bg-indigo-50/90 dark:bg-slate-900 border border-indigo-300 dark:border-indigo-600 space-y-2 animate-in fade-in">
                                    <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900 dark:text-indigo-200">
                                      <span>Split &quot;{sub.sku}&quot; to New SKU:</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="text"
                                        value={splitTargetSku}
                                        onChange={(e) => setSplitTargetSku(e.target.value)}
                                        placeholder="New SKU Name"
                                        className="flex-1 px-2.5 py-1 text-xs rounded bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-indigo-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleConfirmSplitVariant(group.main_sku, sub.sku)}
                                        disabled={!splitTargetSku.trim() || isConfirmingSku}
                                        className="px-3 py-1 text-xs font-bold rounded bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer disabled:opacity-50"
                                      >
                                        {isConfirmingSku ? "Splitting..." : "✓ Confirm"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSplittingVariant(null);
                                          setSplitTargetSku("");
                                        }}
                                        className="px-2.5 py-1 text-xs rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. UNKNOWN SKUs Card Section (Dedicated Amber Card for Unrecognized Variants) */}
            {unknownGroup && (unknownGroup.sub_skus || []).length > 0 && (
              <div className="rounded-xl border-2 border-amber-400 dark:border-amber-500/70 bg-gradient-to-br from-amber-50/90 to-orange-50/50 dark:from-amber-950/30 dark:to-slate-900/80 p-3.5 transition-all shadow-md space-y-3">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-0.5">
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    <span className="text-sm font-extrabold text-amber-900 dark:text-amber-200 uppercase tracking-wide whitespace-nowrap">
                      ⚠️ UNKNOWN SKUs
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-200/90 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 whitespace-nowrap shrink-0">
                      {unknownGroup.label_count} Label{unknownGroup.label_count !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {/* Smart Sort Toggle Button */}
                    <div className="flex items-center space-x-1.5 bg-white/95 dark:bg-slate-900/95 border border-amber-300 dark:border-amber-700/80 rounded-lg px-2.5 py-1 shadow-sm whitespace-nowrap shrink-0">
                      <span className="text-[10px] font-bold text-amber-950 dark:text-amber-200 whitespace-nowrap">
                        ⚡ Smart Sort:
                      </span>
                      <button
                        type="button"
                        onClick={() => setSmartSort((prev) => !prev)}
                        className={`px-2 py-0.5 rounded text-[10px] font-black transition-all cursor-pointer whitespace-nowrap ${
                          smartSort
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                        title="Letter-wise & Number-wise Natural Collation (A-Z, 0-9)"
                      >
                        {smartSort ? "ON (A-Z / 0-9)" : "OFF"}
                      </button>
                    </div>

                    {/* Top-Level Add SKU / Common Keyword Matcher Action */}
                    {onConfirmSku && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsBulkAddOpen((prev) => !prev);
                          setInlineError(null);
                          if (!bulkSelectedExistingSku && allKnownCodes.length > 0) {
                            setBulkSelectedExistingSku(allKnownCodes[0]);
                          }
                        }}
                        className={`px-3 py-1 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                          isBulkAddOpen
                            ? "bg-amber-600 dark:bg-amber-500 text-white"
                            : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white active:scale-95"
                        }`}
                      >
                        <span>{isBulkAddOpen ? "✕ Close" : "＋ Add SKU"}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Top-Level Add SKU / Common Word Panel */}
                {isBulkAddOpen && (
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950 border-2 border-amber-400 dark:border-amber-500/80 shadow-lg space-y-3 animate-in fade-in">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-950 dark:text-amber-200 uppercase tracking-wide flex items-center space-x-1.5">
                          <span>⚡ Common Word / SKU Matcher</span>
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Bulk Auto-Filter
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        In sab Unknown SKUs me jo common word hai use dalein (jaise <span className="font-mono font-bold text-amber-600 dark:text-amber-400">&quot;brown&quot;</span> ya <span className="font-mono font-bold text-amber-600 dark:text-amber-400">&quot;rspk&quot;</span>). Wo sabhi labels auto-filter ho jayenge:
                      </p>
                    </div>

                    {/* 2 Choice Options */}
                    <div className="grid grid-cols-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setBulkAddMode("existing");
                          setInlineError(null);
                        }}
                        className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                          bulkAddMode === "existing"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <span>📁 1. Existing SKU me Add</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setBulkAddMode("new");
                          setInlineError(null);
                        }}
                        className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                          bulkAddMode === "new"
                            ? "bg-cyan-600 text-white shadow-sm"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <span>✨ 2. New SKU Banayein</span>
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {bulkAddMode === "existing" ? (
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Target Existing SKU Chunein:
                          </label>
                          {allKnownCodes.length > 0 ? (
                            <select
                              value={bulkSelectedExistingSku || allKnownCodes[0]}
                              onChange={(e) => setBulkSelectedExistingSku(e.target.value)}
                              disabled={isConfirmingSku}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-indigo-500"
                            >
                              {allKnownCodes.map((code) => (
                                <option key={code} value={code}>
                                  {code} {userSkusMap[code]?.product_name ? `(${userSkusMap[code].product_name})` : ""}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-xs text-amber-700 dark:text-amber-400 italic">
                              Koi existing catalog SKU nahi mila. Kripya &quot;New SKU Banayein&quot; option choose karein.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Naya SKU Name (Parent SKU):
                          </label>
                          <input
                            type="text"
                            value={bulkNewSkuName}
                            onChange={(e) => setBulkNewSkuName(e.target.value)}
                            placeholder="e.g. BROWN ya ROSPACK-BROWN"
                            disabled={isConfirmingSku}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500 uppercase"
                          />
                        </div>
                      )}

                      {/* Common Word Input */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Common Word / Matching Keyword:
                          </label>
                          <span className="text-[10px] text-slate-400">
                            (jaise &quot;brown&quot;, &quot;rspk&quot;)
                          </span>
                        </div>
                        <input
                          type="text"
                          value={bulkCommonKeyword}
                          onChange={(e) => setBulkCommonKeyword(e.target.value)}
                          placeholder="e.g. brown (In SKUs me se common word type karein)"
                          disabled={isConfirmingSku}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-900 border border-amber-300 dark:border-amber-700/80 text-amber-900 dark:text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                        />

                        {/* Suggested Words */}
                        {suggestedWords.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Quick suggestions:</span>
                            {suggestedWords.map((word) => (
                              <button
                                key={word}
                                type="button"
                                onClick={() => setBulkCommonKeyword(word)}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer border ${
                                  bulkCommonKeyword.toLowerCase() === word.toLowerCase()
                                    ? "bg-amber-500 text-white border-amber-600"
                                    : "bg-slate-100 dark:bg-slate-900 hover:bg-amber-100 dark:hover:bg-amber-950/60 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                                }`}
                                title={`Click to use '${word}'`}
                              >
                                + {word}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Live Matching Preview */}
                      {bulkCommonKeyword.trim() && (
                        <div className="p-2.5 rounded-lg bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5">
                          {matchingVariants.length > 0 ? (
                            <>
                              <div className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center space-x-1">
                                <span>✓</span>
                                <span>
                                  {matchingVariants.length} variant{matchingVariants.length > 1 ? "s" : ""} ({matchingLabelsCount} labels) match &quot;{bulkCommonKeyword.trim()}&quot; and will move under <span className="underline uppercase">{bulkAddMode === "existing" ? (bulkSelectedExistingSku || allKnownCodes[0]) : (bulkNewSkuName.trim() || "NEW SKU")}</span>
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {matchingVariants.map((v) => (
                                  <span key={v.sku} className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                    {v.sku} ({v.label_count})
                                  </span>
                                ))}
                              </div>
                              {remainingVariantsCount > 0 && (
                                <div className="text-slate-500 dark:text-slate-400 text-[10px]">
                                  Baki Unknown me rah jayenge: {remainingVariantsCount} variant{remainingVariantsCount > 1 ? "s" : ""}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-amber-700 dark:text-amber-400 text-[10px]">
                              ℹ️ Current Unknown SKUs me &quot;{bulkCommonKeyword.trim()}&quot; se koi variant match nahi hua.
                            </div>
                          )}
                        </div>
                      )}

                      {inlineError && (
                        <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-[11px] text-rose-700 dark:text-rose-300 font-medium">
                          ⚠️ {inlineError}
                        </div>
                      )}

                      <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setIsBulkAddOpen(false);
                            setInlineError(null);
                          }}
                          disabled={isConfirmingSku}
                          className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleBulkAddSku}
                          disabled={
                            isConfirmingSku ||
                            !bulkCommonKeyword.trim() ||
                            (bulkAddMode === "new" && !bulkNewSkuName.trim()) ||
                            (bulkAddMode === "existing" && allKnownCodes.length === 0)
                          }
                          className="px-4 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          {isConfirmingSku ? "Applying & Filtering..." : "✓ Apply & Re-filter Batch"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pending SKU Changes: 1-Click PDF & Database Re-render Banner */}
                {pendingResolutions.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-indigo-500/15 border-2 border-emerald-500/60 dark:border-emerald-500/40 shadow-lg flex items-center justify-between gap-3 flex-wrap animate-in fade-in">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <div>
                        <span className="text-xs font-black text-emerald-950 dark:text-emerald-200 uppercase tracking-wide block">
                          ⚡ {pendingResolutions.length} SKU Update{pendingResolutions.length > 1 ? "s" : ""} Saved in Database!
                        </span>
                        <span className="text-[10px] text-slate-600 dark:text-slate-300">
                          SKUs have been updated locally &amp; in database. Click to re-compile PDF with new sorting.
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyClick}
                      disabled={isReSorting}
                      className="px-4 py-2 rounded-lg text-xs font-black bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white shadow-lg shadow-emerald-500/25 active:scale-95 transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      {isReSorting ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Updating PDF...</span>
                        </>
                      ) : (
                        <span>⚡ Update PDF Now</span>
                      )}
                    </button>
                  </div>
                )}

                <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-snug">
                  These variants are not recognized in your catalog. Add to an existing SKU or create a new SKU in 1 click:
                </p>

                {/* List of unmapped variants */}
                <div className="space-y-2">
                  {sortedUnknownSubSkus.map((sub) => {
                    const isSubExcluded = excludedSkus.has(sub.sku.toUpperCase());
                    const isAssigningThis = assigningVariant === sub.sku;

                    return (
                      <div
                        key={sub.sku}
                        className={`p-2.5 rounded-lg bg-white/95 dark:bg-slate-950/90 border border-amber-200 dark:border-amber-800/60 shadow-sm space-y-2 ${
                          isSubExcluded ? "opacity-60" : ""
                        }`}
                      >
                        {/* Variant Row: Title, Count, Action Buttons */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span
                              className={`text-xs font-mono font-bold block break-all leading-snug ${
                                isSubExcluded ? "line-through text-slate-400" : "text-slate-900 dark:text-slate-100"
                              }`}
                              title={sub.sku}
                            >
                              {sub.sku}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              Detected in {sub.label_count} shipping label{sub.label_count !== 1 ? "s" : ""}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1.5 shrink-0">
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 whitespace-nowrap shrink-0">
                              {sub.label_count}
                            </span>

                            {onConfirmSku && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isAssigningThis && assignMode === "existing") {
                                      setAssigningVariant(null);
                                      setAssignMode(null);
                                    } else {
                                      setAssigningVariant(sub.sku);
                                      setAssignMode("existing");
                                      setSelectedExistingSku(allKnownCodes[0] || "");
                                      setInlineError(null);
                                    }
                                  }}
                                  disabled={isConfirmingSku}
                                  className="px-2 py-1 text-[11px] font-bold rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-all cursor-pointer whitespace-nowrap shrink-0"
                                  title="Add this variant to an existing saved SKU"
                                >
                                  ＋ Add to Existing ▾
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isAssigningThis && assignMode === "new") {
                                      setAssigningVariant(null);
                                      setAssignMode(null);
                                    } else {
                                      setAssigningVariant(sub.sku);
                                      setAssignMode("new");
                                      setNewSkuInput(sub.sku.toUpperCase());
                                      setInlineError(null);
                                    }
                                  }}
                                  disabled={isConfirmingSku}
                                  className="px-2 py-1 text-[11px] font-bold rounded bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 border border-cyan-200 dark:border-cyan-800/60 transition-all cursor-pointer whitespace-nowrap shrink-0"
                                  title="Create a new SKU in catalog and assign this variant"
                                >
                                  ＋ New SKU
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => toggleExcludeSku(sub.sku)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap shrink-0 ${
                                isSubExcluded
                                  ? "bg-rose-500 text-white border-rose-400"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-rose-600 border-slate-200 dark:border-slate-700"
                              }`}
                              title={isSubExcluded ? "Include variant" : "Exclude variant"}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Mode A: Assign to Existing SKU inline form */}
                        {isAssigningThis && assignMode === "existing" && (
                          <div className="p-2.5 rounded-lg bg-indigo-50/90 dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700/80 space-y-2 animate-in fade-in">
                            <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 block">
                              Select Available SKU to merge &quot;{sub.sku}&quot; into:
                            </span>
                            <div className="flex items-center space-x-2">
                              {allKnownCodes.length > 0 ? (
                                <select
                                  value={selectedExistingSku || allKnownCodes[0]}
                                  onChange={(e) => setSelectedExistingSku(e.target.value)}
                                  disabled={isConfirmingSku}
                                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-indigo-500"
                                >
                                  {allKnownCodes.map((code) => (
                                    <option key={code} value={code}>
                                      {code} {userSkusMap[code]?.product_name ? `(${userSkusMap[code].product_name})` : ""}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-rose-600 dark:text-rose-400 italic flex-1">
                                  No saved SKUs found. Use &quot;＋ New SKU&quot; instead.
                                </span>
                              )}

                              {allKnownCodes.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleAssignVariantToExisting(sub.sku, selectedExistingSku || allKnownCodes[0])}
                                  disabled={isConfirmingSku}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {isConfirmingSku ? "Assigning..." : "✓ Assign"}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setAssigningVariant(null);
                                  setAssignMode(null);
                                  setInlineError(null);
                                }}
                                className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>

                            {inlineError && assigningVariant === sub.sku && (
                              <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                ⚠️ {inlineError}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Mode B: Create New SKU inline form */}
                        {isAssigningThis && assignMode === "new" && (
                          <div className="p-2.5 rounded-lg bg-cyan-50/90 dark:bg-slate-900 border border-cyan-300 dark:border-cyan-700/80 space-y-2 animate-in fade-in">
                            <span className="text-[11px] font-bold text-cyan-900 dark:text-cyan-200 block">
                              Create New SKU Name for &quot;{sub.sku}&quot;:
                            </span>
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={newSkuInput}
                                onChange={(e) => setNewSkuInput(e.target.value)}
                                placeholder="New SKU Name (e.g. ROSPACK 80ML)"
                                disabled={isConfirmingSku}
                                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleCreateAndAssignNewSku(sub.sku, newSkuInput)}
                                disabled={!newSkuInput.trim() || isConfirmingSku}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              >
                                {isConfirmingSku ? "Creating..." : "✓ Create & Assign"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAssigningVariant(null);
                                  setAssignMode(null);
                                  setInlineError(null);
                                }}
                                className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>

                            {inlineError && assigningVariant === sub.sku && (
                              <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                ⚠️ {inlineError}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: ALL SKU VARIANTS                                    */}
        {/* ======================================================== */}
        {activeTab === "all_skus" && (
          <div className="space-y-2.5">
            {/* Search & Sort Controls */}
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={skuSearchQuery}
                onChange={(e) => setSkuSearchQuery(e.target.value)}
                placeholder="Search variant..."
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setSortBy(sortBy === "name" ? "count" : "name")}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:text-slate-950 dark:hover:text-white"
                title="Toggle sort by name or volume"
              >
                {sortBy === "name" ? "A-Z" : "Count"}
              </button>
            </div>

            {/* List */}
            <div className="space-y-1.5">
              {sortedSubSkus.map((item, idx) => {
                const isParentExcluded = excludedMainSkus.has(item.main_sku.toUpperCase());
                const isDirectExcluded = excludedSkus.has(item.sku.toUpperCase());
                const isSkuExcluded = isParentExcluded || isDirectExcluded;
                const isUnknown = item.main_sku.toUpperCase() === "UNKNOWN" || item.main_sku.toUpperCase() === "UNKNOWN SKUS";
                const isAssigningThis = assigningVariant === item.sku;

                return (
                  <div key={item.sku} className="space-y-1.5">
                    <div
                      className={`flex items-center justify-between p-2.5 rounded-lg border ${
                        isUnknown
                          ? "border-amber-300 dark:border-amber-700/80 bg-amber-50/70 dark:bg-amber-950/20"
                          : "border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60"
                      } hover:bg-slate-100/80 dark:hover:bg-slate-900 transition-colors text-xs ${
                        isSkuExcluded ? "opacity-60" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">#{idx + 1}</span>
                          <span className={`font-mono font-semibold break-all leading-snug ${isSkuExcluded ? "line-through text-slate-400" : "text-slate-900 dark:text-white"}`}>
                            {item.sku}
                          </span>
                          {isUnknown && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-200 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                              ⚠️ UNKNOWN
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                          Group: {item.main_sku}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300">
                          {item.label_count}
                        </span>

                        {isUnknown && onConfirmSku && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (isAssigningThis && assignMode === "existing") {
                                  setAssigningVariant(null);
                                  setAssignMode(null);
                                } else {
                                  setAssigningVariant(item.sku);
                                  setAssignMode("existing");
                                  setSelectedExistingSku(allKnownCodes[0] || "");
                                  setInlineError(null);
                                }
                              }}
                              disabled={isConfirmingSku}
                              className="px-2 py-0.5 text-[10px] font-bold rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-all cursor-pointer"
                              title="Add this variant to an existing saved SKU"
                            >
                              ＋ Add ▾
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isAssigningThis && assignMode === "new") {
                                  setAssigningVariant(null);
                                  setAssignMode(null);
                                } else {
                                  setAssigningVariant(item.sku);
                                  setAssignMode("new");
                                  setNewSkuInput(item.sku.toUpperCase());
                                  setInlineError(null);
                                }
                              }}
                              disabled={isConfirmingSku}
                              className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 border border-cyan-200 dark:border-cyan-800/60 transition-all cursor-pointer"
                              title="Create a new SKU in catalog and assign this variant"
                            >
                              ＋ New
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleExcludeSku(item.sku)}
                          disabled={isParentExcluded}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isDirectExcluded
                              ? "bg-rose-500 text-white border-rose-400"
                              : isParentExcluded
                              ? "bg-slate-100 dark:bg-slate-950 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 border-slate-300 dark:border-slate-700"
                          }`}
                        >
                          {isDirectExcluded ? "Excluded" : "✕"}
                        </button>
                      </div>
                    </div>

                    {/* Mode A: Assign to Existing inline form in Tab 2 */}
                    {isAssigningThis && assignMode === "existing" && (
                      <div className="p-2.5 rounded-lg bg-indigo-50/90 dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700/80 space-y-2 animate-in fade-in">
                        <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 block">
                          Merge &quot;{item.sku}&quot; into Available SKU:
                        </span>
                        <div className="flex items-center space-x-2">
                          {allKnownCodes.length > 0 ? (
                            <select
                              value={selectedExistingSku || allKnownCodes[0]}
                              onChange={(e) => setSelectedExistingSku(e.target.value)}
                              disabled={isConfirmingSku}
                              className="flex-1 px-2.5 py-1 text-xs rounded bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-indigo-500"
                            >
                              {allKnownCodes.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-rose-600 dark:text-rose-400 italic flex-1">
                              No saved SKUs found. Use &quot;＋ New&quot; instead.
                            </span>
                          )}

                          {allKnownCodes.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAssignVariantToExisting(item.sku, selectedExistingSku || allKnownCodes[0])}
                              disabled={isConfirmingSku}
                              className="px-3 py-1 text-xs font-bold rounded bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer disabled:opacity-50"
                            >
                              {isConfirmingSku ? "..." : "✓ Assign"}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setAssigningVariant(null);
                              setAssignMode(null);
                              setInlineError(null);
                            }}
                            className="px-2.5 py-1 text-xs rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>

                        {inlineError && assigningVariant === item.sku && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                            ⚠️ {inlineError}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mode B: Create New SKU inline form in Tab 2 */}
                    {isAssigningThis && assignMode === "new" && (
                      <div className="p-2.5 rounded-lg bg-cyan-50/90 dark:bg-slate-900 border border-cyan-300 dark:border-cyan-700/80 space-y-2 animate-in fade-in">
                        <span className="text-[11px] font-bold text-cyan-900 dark:text-cyan-200 block">
                          New SKU Name for &quot;{item.sku}&quot;:
                        </span>
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={newSkuInput}
                            onChange={(e) => setNewSkuInput(e.target.value)}
                            placeholder="New SKU Name"
                            disabled={isConfirmingSku}
                            className="flex-1 px-2.5 py-1 text-xs rounded bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleCreateAndAssignNewSku(item.sku, newSkuInput)}
                            disabled={!newSkuInput.trim() || isConfirmingSku}
                            className="px-3 py-1 text-xs font-bold rounded bg-cyan-600 hover:bg-cyan-700 text-white transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          >
                            {isConfirmingSku ? "..." : "✓ Create"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAssigningVariant(null);
                              setAssignMode(null);
                              setInlineError(null);
                            }}
                            className="px-2.5 py-1 text-xs rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>

                        {inlineError && assigningVariant === item.sku && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                            ⚠️ {inlineError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: COURIER PARTNERS                                   */}
        {/* ======================================================== */}
        {activeTab === "courier" && (
          <div className="space-y-2">
            {sortedCouriers.map((c, idx) => {
              const isCourierExcluded = excludedCouriers.has(c.courier.toUpperCase());

              return (
                <div
                  key={c.courier}
                  className={`p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 transition-all ${
                    isCourierExcluded ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 font-bold">#{idx + 1}</span>
                      <span className={`font-bold text-sm ${isCourierExcluded ? "line-through text-slate-400" : "text-slate-900 dark:text-white"}`}>
                        {formatCourierName(c.courier)}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-300 text-xs">
                        {c.label_count} ({c.percentage}%)
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleExcludeCourier(c.courier)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                          isCourierExcluded
                            ? "bg-rose-500 text-white border-rose-400"
                            : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 border-slate-300 dark:border-slate-700"
                        }`}
                      >
                        {isCourierExcluded ? "Excluded" : "✕ Exclude"}
                      </button>
                    </div>
                  </div>

                  {/* Percentage Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-950 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all"
                      style={{ width: `${Math.max(4, c.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: PLATFORMS / MARKETPLACES                          */}
        {/* ======================================================== */}
        {activeTab === "platforms" && (
          <div className="space-y-2">
            {((data.marketplace_breakdown && data.marketplace_breakdown.length > 0)
              ? data.marketplace_breakdown
              : [{ marketplace: "Meesho", label_count: data.total_labels, percentage: 100 }]
            ).map((m) => {
              const isMarketplaceExcluded = excludedMarketplaces.has(m.marketplace.toUpperCase());
              const isFlipkart = m.marketplace.toLowerCase().includes("flipkart");
              const isSnapdeal = m.marketplace.toLowerCase().includes("snapdeal");
              const isAmazon = m.marketplace.toLowerCase().includes("amazon");

              const icon = isFlipkart ? "🔵" : isSnapdeal ? "🔴" : isAmazon ? "🟡" : "🟠";
              const barColor = isFlipkart ? "bg-blue-500" : isSnapdeal ? "bg-red-500" : isAmazon ? "bg-amber-500" : "bg-orange-500";

              return (
                <div
                  key={m.marketplace}
                  className={`p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 transition-all ${
                    isMarketplaceExcluded ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">{icon}</span>
                      <span className={`font-bold text-sm ${isMarketplaceExcluded ? "line-through text-slate-400" : "text-slate-900 dark:text-white"}`}>
                        {m.marketplace}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-300 text-xs">
                        {m.label_count} ({m.percentage}%)
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleExcludeMarketplace(m.marketplace)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                          isMarketplaceExcluded
                            ? "bg-rose-500 text-white border-rose-400"
                            : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 border-slate-300 dark:border-slate-700"
                        }`}
                      >
                        {isMarketplaceExcluded ? "Excluded" : "✕ Exclude"}
                      </button>
                    </div>
                  </div>

                  {/* Percentage Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-950 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`${barColor} h-full rounded-full transition-all`}
                      style={{ width: `${Math.max(4, m.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
