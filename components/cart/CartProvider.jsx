'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// The cart holds only identifiers, quantities and customisation text. Prices and stock are
// always fetched from the server, which treats everything here as untrusted.
const KEY = 'jjb_cart_v1';
const MAX_QTY = 50;
const CartContext = createContext(null);

export function lineKey(item) {
  const c = Object.entries(item.customizations || {}).filter(([, v]) => v).sort();
  return `${item.productId}:${item.variantId ?? ''}:${JSON.stringify(c)}`;
}

function clean(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i) => Number.isSafeInteger(Number(i?.productId)))
    .slice(0, 30)
    .map((i) => {
      const item = {
        productId: Number(i.productId),
        variantId: i.variantId ? Number(i.variantId) : null,
        quantity: Math.min(MAX_QTY, Math.max(1, Math.floor(Number(i.quantity) || 1))),
        customizations: i.customizations && typeof i.customizations === 'object' ? i.customizations : {},
      };
      return { ...item, key: lineKey(item) };
    });
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setItems(clean(JSON.parse(localStorage.getItem(KEY) || '[]'))); } catch { /* storage unavailable */ }
    setReady(true);
    const onStorage = (e) => {
      if (e.key === KEY) { try { setItems(clean(JSON.parse(e.newValue || '[]'))); } catch { /* ignore */ } }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full or blocked */ }
  }, [items, ready]);

  const add = useCallback((item) => {
    setItems((prev) => {
      const next = { ...item, key: lineKey(item) };
      const found = prev.find((p) => p.key === next.key);
      if (found) return prev.map((p) => (p.key === next.key ? { ...p, quantity: Math.min(MAX_QTY, p.quantity + next.quantity) } : p));
      return [...prev, next].slice(0, 30);
    });
  }, []);
  const setQuantity = useCallback((key, quantity) => {
    setItems((prev) => prev.map((p) => (p.key === key ? { ...p, quantity: Math.min(MAX_QTY, Math.max(1, quantity)) } : p)));
  }, []);
  const remove = useCallback((key) => setItems((prev) => prev.filter((p) => p.key !== key)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, ready, add, setQuantity, remove, clear, count: items.reduce((n, i) => n + i.quantity, 0) }),
    [items, ready, add, setQuantity, remove, clear]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
