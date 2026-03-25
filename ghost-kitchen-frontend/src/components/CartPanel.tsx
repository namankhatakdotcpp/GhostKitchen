import { useCartStore } from "../store/cartStore";

export default function CartPanel() {
    const { items, clearCart, placeOrder, isPlacingOrder } = useCartStore();

  if (items.length === 0) {
    return (
      <div className="mt-6 text-sm text-gray-500">
        Cart is empty
      </div>
    );
  }

  const total = items.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );
  

  return (
    <div className="mt-6 rounded-xl border bg-white p-4 space-y-3">
      <h3 className="font-semibold">Your Cart</h3>

      {items.map((item) => (
        <div key={item.id} className="flex justify-between text-sm">
          <span>
            {item.name} × {item.qty}
          </span>
          <span>₹{item.price * item.qty}</span>
        </div>
      ))}

      <hr />

      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>₹{total}</span>
      </div>

      <button
        onClick={clearCart}
        className="w-full mt-2 rounded bg-gray-200 py-2 text-sm"
      >
        Clear Cart
      </button>

      <button
  onClick={placeOrder}
  disabled={isPlacingOrder}
  className="w-full rounded bg-emerald-500 py-2 text-white text-sm disabled:opacity-50"
>
  {isPlacingOrder ? "Placing Order..." : "Place Order"}
</button>

    </div>
  );
}
