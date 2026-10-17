import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { type Product, type StockMovement } from '@/types/database';
import {
  ProductRepository,
  type ProductFilter,
  type CreateProductInput,
  type UpdateProductInput,
  type AdjustStockInput,
} from '@/database/repositories/product-repository';

export function useProducts(initialFilter: ProductFilter = {}) {
  const db = useSQLiteContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProductFilter>(initialFilter);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      ProductRepository.getAll(db, filter),
      ProductRepository.getCategories(db),
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
  }, [db, filter, reloadKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const createProduct = async (input: CreateProductInput) => {
    const created = await ProductRepository.create(db, input);
    await refresh();
    return created;
  };

  const updateProduct = async (id: number, input: UpdateProductInput) => {
    const updated = await ProductRepository.update(db, id, input);
    await refresh();
    return updated;
  };

  const adjustStock = async (id: number, adjustment: AdjustStockInput) => {
    const adjusted = await ProductRepository.adjustStock(db, id, adjustment);
    await refresh();
    return adjusted;
  };

  const archiveProduct = async (id: number) => {
    await ProductRepository.archive(db, id);
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
  };
}

export function useProduct(id: number | null) {
  const db = useSQLiteContext();
  const [product, setProduct] = useState<Product | null>(null);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    Promise.all([
      ProductRepository.getById(db, id),
      ProductRepository.getStockMovements(db, id),
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
  }, [db, id, reloadKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const update = async (input: UpdateProductInput) => {
    if (!id) return;
    const updated = await ProductRepository.update(db, id, input);
    await refresh();
    return updated;
  };

  const adjustStock = async (adjustment: AdjustStockInput) => {
    if (!id) return;
    const adjusted = await ProductRepository.adjustStock(db, id, adjustment);
    await refresh();
    return adjusted;
  };

  const archive = async () => {
    if (!id) return;
    await ProductRepository.archive(db, id);
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
