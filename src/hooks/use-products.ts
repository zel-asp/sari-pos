import { useState, useEffect, useCallback } from 'react';
import { type Product, type StockMovement } from '@/types/database';
import {
  ProductRepository,
  type ProductFilter,
  type CreateProductInput,
  type UpdateProductInput,
  type AdjustStockInput,
} from '@/database/repositories/product-repository';
import { supabase } from '@/lib/supabase';

export function useProducts(initialFilter: ProductFilter = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProductFilter>(initialFilter);
  const [reloadKey, setReloadKey] = useState(0);
  const [realtimePulse, setRealtimePulse] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      ProductRepository.getAll(filter),
      ProductRepository.getCategories(),
    ])
      .then(([productList, categoryList]) => {
        if (isMounted) {
          setProducts(productList);
          setCategories(categoryList);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[useProducts] Error loading products:', err);
          setError(err instanceof Error ? err.message : 'Failed to load products');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [filter, reloadKey]);

  // Real-time synchronization for products & inventory
  useEffect(() => {
    const channelId = `products-live-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          setRealtimePulse(true);
          setTimeout(() => setRealtimePulse(false), 2000);
          setReloadKey((k) => k + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements' },
        () => {
          setRealtimePulse(true);
          setTimeout(() => setRealtimePulse(false), 2000);
          setReloadKey((k) => k + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const createProduct = async (input: CreateProductInput) => {
    const created = await ProductRepository.create(input);
    await refresh();
    return created;
  };

  const updateProduct = async (id: number, input: UpdateProductInput) => {
    const updated = await ProductRepository.update(id, input);
    await refresh();
    return updated;
  };

  const adjustStock = async (id: number, adjustment: AdjustStockInput) => {
    const adjusted = await ProductRepository.adjustStock(id, adjustment);
    await refresh();
    return adjusted;
  };

  const archiveProduct = async (id: number) => {
    await ProductRepository.archive(id);
    await refresh();
  };

  return {
    products,
    categories,
    loading,
    error,
    filter,
    setFilter,
    refresh,
    createProduct,
    updateProduct,
    adjustStock,
    archiveProduct,
    realtimePulse,
  };
}

export function useProduct(id: number | null) {
  const [product, setProduct] = useState<Product | null>(null);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    Promise.all([
      ProductRepository.getById(id),
      ProductRepository.getStockMovements(id),
    ])
      .then(([prod, movements]) => {
        if (isMounted) {
          setProduct(prod);
          setStockMovements(movements);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[useProduct] Error loading product:', err);
          setError(err instanceof Error ? err.message : 'Failed to load product details');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [id, reloadKey]);

  // Real-time synchronization for single product
  useEffect(() => {
    if (!id) return;
    const channelId = `product-detail-live-${id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `id=eq.${id}` },
        () => {
          setReloadKey((k) => k + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements', filter: `product_id=eq.${id}` },
        () => {
          setReloadKey((k) => k + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const update = async (input: UpdateProductInput) => {
    if (!id) return;
    const updated = await ProductRepository.update(id, input);
    await refresh();
    return updated;
  };

  const adjustStock = async (adjustment: AdjustStockInput) => {
    if (!id) return;
    const adjusted = await ProductRepository.adjustStock(id, adjustment);
    await refresh();
    return adjusted;
  };

  const archive = async () => {
    if (!id) return;
    await ProductRepository.archive(id);
    await refresh();
  };

  return {
    product,
    stockMovements,
    loading,
    error,
    refresh,
    update,
    adjustStock,
    archive,
  };
}
