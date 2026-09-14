import { useCallback, useState } from 'react';
import type { ApiProduct, CartLine } from './types';
import { playScanBeep } from './helpers';

/**
 * Cart mutations for the active bill. Kept small so App.tsx can own multi-bill
 * state while still sharing add/qty/discount helpers.
 */
export function useCartActions({
  cart,
  setCart,
  soundOnScan,
  autoFocusBarcode,
  barcodeRef,
  setMsg,
  pickSerials,
}: {
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  soundOnScan: boolean;
  autoFocusBarcode: boolean;
  barcodeRef: React.RefObject<HTMLInputElement | null>;
  setMsg: (m: string) => void;
  pickSerials: (product: ApiProduct, need: number, preselected?: string[]) => Promise<string[] | null>;
}) {
  const addToCart = useCallback(
    async (product: ApiProduct, qty = 1) => {
      if (product.stock_qty <= 0 && product.id !== 'trade-in') {
        setMsg(`${product.name} out of stock`);
        return;
      }
      const existing = cart.find((l) => l.product.id === product.id && !l.isTradeIn);
      const nextQty = (existing?.quantity ?? 0) + qty;
      if (product.id !== 'trade-in' && nextQty > product.stock_qty) {
        setMsg(`Only ${product.stock_qty} in stock`);
        return;
      }
      if (product.trackSerial) {
        const picked = await pickSerials(product, nextQty, existing?.serialNumbers ?? []);
        if (!picked) return;
        setCart((prev) => {
          if (existing) {
            return prev.map((l) =>
              l.product.id === product.id && !l.isTradeIn
                ? { ...l, quantity: nextQty, serialNumbers: picked }
                : l,
            );
          }
          return [
            ...prev,
            {
              product,
              quantity: nextQty,
              unitPrice: product.sale_price,
              discount: 0,
              serialNumbers: picked,
            },
          ];
        });
      } else {
        setCart((prev) => {
          if (existing) {
            return prev.map((l) =>
              l.product.id === product.id && !l.isTradeIn
                ? { ...l, quantity: l.quantity + qty }
                : l,
            );
          }
          return [
            ...prev,
            {
              product,
              quantity: qty,
              unitPrice: product.sale_price,
              discount: 0,
              serialNumbers: [],
            },
          ];
        });
      }
      setMsg('');
      if (soundOnScan) playScanBeep();
      if (autoFocusBarcode) barcodeRef.current?.focus();
    },
    [cart, setCart, soundOnScan, autoFocusBarcode, barcodeRef, setMsg, pickSerials],
  );

  const updateQty = useCallback(
    async (productId: string, delta: number) => {
      const line = cart.find((l) => l.product.id === productId);
      if (!line) return;
      const next = line.quantity + delta;
      if (next <= 0) {
        setCart((prev) => prev.filter((l) => l.product.id !== productId));
        return;
      }
      if (!line.isTradeIn && next > line.product.stock_qty) {
        setMsg(`Only ${line.product.stock_qty} in stock`);
        return;
      }
      if (line.product.trackSerial) {
        const picked = await pickSerials(line.product, next, line.serialNumbers);
        if (!picked) return;
        setCart((prev) =>
          prev.map((l) =>
            l.product.id === productId ? { ...l, quantity: next, serialNumbers: picked } : l,
          ),
        );
        return;
      }
      setCart((prev) =>
        prev.map((l) => (l.product.id === productId ? { ...l, quantity: next } : l)),
      );
    },
    [cart, setCart, setMsg, pickSerials],
  );

  const updateDiscount = useCallback(
    (productId: string, discount: number) => {
      setCart((prev) =>
        prev.map((l) =>
          l.product.id === productId ? { ...l, discount: Math.max(0, discount) } : l,
        ),
      );
    },
    [setCart],
  );

  const updateRate = useCallback(
    (productId: string, unitPrice: number) => {
      setCart((prev) =>
        prev.map((l) =>
          l.product.id === productId ? { ...l, unitPrice: Math.max(0, unitPrice) } : l,
        ),
      );
    },
    [setCart],
  );

  const removeLine = useCallback(
    (productId: string) => {
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
    },
    [setCart],
  );

  return { addToCart, updateQty, updateDiscount, updateRate, removeLine };
}

/** Local barcode buffer for hardware scanners when input is unfocused. */
export function useGlobalBarcode(onScan: (code: string) => void) {
  const [enabled] = useState(true);
  return { enabled, onScan };
}
