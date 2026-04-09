"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { useOrderStore } from "@/store/orderStore";
import { useAuthStore } from "@/store/authStore";

/**
 * Cart Page Component
 * 
 * Features:
 * - Display cart items with prices
 * - Edit quantities
 * - Remove items
 * - Calculate totals
 * - CHECKOUT button → creates order
 * - Clear cart
 * 
 * Flow After Checkout:
 * 1. User clicks "Checkout"
 * 2. Order created from cart items
 * 3. Cart cleared automatically
 * 4. Redirect to payment page
 */

export default function CartPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  
  // Cart operations
  const { items, isLoading: cartLoading, error: cartError } = useCartStore();
  const { updateQuantity, removeFromCart, clearCart } = useCartStore();
  
  // Order operations
  const { createOrder, isLoading: orderLoading, error: orderError } = useOrderStore();
  
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  // Calculate totals
  const subtotal = items.reduce((sum, item) => {
    const price = typeof item.menuItem.price === "string" 
      ? parseFloat(item.menuItem.price) 
      : item.menuItem.price;
    return sum + price * item.quantity;
  }, 0);

  /**
   * CHECKOUT HANDLER
   * 
   * 1. Create order from cart
   * 2. Clear local cart state
   * 3. Redirect to payment
   */
  const handleCheckout = async () => {
    if (!items.length) {
      alert("Cart is empty!");
      return;
    }

    setIsCreatingOrder(true);
    try {
      const order = await createOrder();
      
      if (order) {
        // Clear local cart after successful order creation
        // (backend already cleared it, but clear store too)
        await clearCart();
        
        // Redirect to order tracking/payment page
        router.push(`/customer/orders/${order.id}`);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || "Failed to create order";
      alert(`❌ ${errorMsg}`);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Empty cart state
  if (!cartLoading && items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Your Cart</h1>
          
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="mb-6">
              <div className="text-6xl mb-4">🛒</div>
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">Your cart is empty</h2>
              <p className="text-gray-500 mb-6">Add some delicious items to get started!</p>
            </div>
            
            <Link
              href="/customer/search"
              className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              Continue Shopping →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Your Cart</h1>

        {/* Error Messages */}
        {(cartError || orderError) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            ⚠️ {cartError || orderError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
              {cartLoading ? (
                <p className="text-center text-gray-500 py-8">Loading cart...</p>
              ) : (
                items.map((item) => {
                  const price = typeof item.menuItem.price === "string"
                    ? parseFloat(item.menuItem.price)
                    : item.menuItem.price;
                  
                  return (
                    <div
                      key={item.id}
                      className="flex gap-4 pb-4 border-b border-gray-200 last:border-b-0 last:pb-0"
                    >
                      {/* Item Image */}
                      <Image
                        src={item.menuItem.imageUrl}
                        alt={item.menuItem.name}
                        width={80}
                        height={80}
                        className="w-20 h-20 object-cover rounded-lg"
                      />

                      {/* Item Details */}
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800">
                          {item.menuItem.name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          ₹{price.toFixed(2)} each
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Restaurant: {item.menuItem.restaurantId}
                        </p>
                      </div>

                      {/* Quantity & Total */}
                      <div className="flex flex-col items-end gap-2">
                        <p className="font-bold text-gray-800">
                          ₹{(price * item.quantity).toFixed(2)}
                        </p>
                        
                        {/* Quantity Selector */}
                        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                          <button
                            onClick={() =>
                              updateQuantity(item.id, item.quantity - 1)
                            }
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-800"
                            disabled={cartLoading}
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(item.id, item.quantity + 1)
                            }
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-800"
                            disabled={cartLoading}
                          >
                            +
                          </button>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-sm text-red-600 hover:text-red-800 font-medium"
                          disabled={cartLoading}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {items.length > 0 && (
                <button
                  onClick={() => clearCart()}
                  className="mt-4 w-full text-center text-sm text-gray-600 hover:text-gray-800 py-2 border-t border-gray-200"
                  disabled={cartLoading}
                >
                  Clear Cart
                </button>
              )}
            </div>
          </div>

          {/* Order Summary & Checkout */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-8">
              <h2 className="text-lg font-bold mb-4 text-gray-800">
                Order Summary
              </h2>

              <div className="space-y-3 pb-4 border-b border-gray-200">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-medium">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span>
                  <span className="font-medium">Free</span>
                </div>
              </div>

              <div className="flex justify-between text-lg font-bold mt-4 mb-6 text-gray-800">
                <span>Total</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>

              {/* Checkout Button */}
              <button
                onClick={handleCheckout}
                disabled={
                  isCreatingOrder || orderLoading || items.length === 0 || cartLoading
                }
                className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
                  isCreatingOrder ||orderLoading || items.length === 0 || cartLoading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {isCreatingOrder || orderLoading ? (
                  <>
                    <span className="inline-block mr-2">⏳</span>
                    Creating Order...
                  </>
                ) : items.length === 0 ? (
                  "Cart Empty"
                ) : (
                  <>
                    <span className="inline-block mr-2">🚀</span>
                    Checkout
                  </>
                )}
              </button>

              {/* Continue Shopping */}
              <Link
                href="/customer/search"
                className="mt-3 block w-full text-center py-2 text-orange-600 hover:text-orange-700 font-medium border border-orange-300 rounded-lg transition-colors"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
