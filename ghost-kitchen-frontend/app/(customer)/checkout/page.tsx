'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { load } from '@cashfreepayments/cashfree-js'
import { useCartStore } from '@/store/cartStore'
import api from '@/lib/api'

export default function CheckoutPage() {
  const router = useRouter()
  const { items, restaurantId, getSubtotal, clearCart } = useCartStore()
  const [address, setAddress] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
  const [orderInProgress, setOrderInProgress] = useState(false) // Prevent double-submit

  const subtotal = getSubtotal()

  // When checkout data would be fetched, we'd get delivery fee from backend
  // For now, use a reasonable default, but will be overridden by API response
  useEffect(() => {
    // Set default - will be overridden when order is created
    setDeliveryFee(50); // Backend standard is ₹50
  }, [])

  async function handlePlaceOrder() {
    // Prevent double-submit
    if (orderInProgress) {
      setError('Order is already being processed. Please wait...');
      return;
    }

    if (!address.trim()) { setError('Please enter a delivery address'); return }
    if (items.length === 0) { setError('Your cart is empty'); return }

    setOrderInProgress(true)
    setIsLoading(true)
    setError('')

    try {
      // 1. Create Cashfree order on server
      const { data } = await api.post('/payments/create-order', {
        restaurantId,
        items: items.map(i => ({ menuItemId: i.menuItem.id, quantity: i.quantity })),
        deliveryAddress: { line1: address, city: 'Delhi' },
        couponCode: couponCode || undefined,
      })

      // Backend returns actual delivery fee - use it to ensure consistency
      const actualDeliveryFee = data.deliveryFee || deliveryFee || 50;
      setDeliveryFee(actualDeliveryFee);

      // 2. Load Cashfree SDK
      const cashfree = await load({
        mode: process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
      })

      // 3. Open Cashfree checkout
      const checkoutOptions = {
        paymentSessionId: data.paymentSessionId,
        redirectTarget: '_modal', // opens as popup, not redirect
      }

      const result = await cashfree.checkout(checkoutOptions)

      if (result.error) {
        setError(result.error.message ?? 'Payment failed')
        setOrderInProgress(false)
        setIsLoading(false)
        return
      }

      if (result.redirect) {
        // User was redirected (UPI apps etc.) — verification handled in callback page
        return
      }

      if (result.paymentDetails) {
        // 4. Verify payment on server
        const verifyRes = await api.post('/payments/verify', {
          cfOrderId: data.cfOrderId,
        })

        clearCart()
        router.push(`/order/${verifyRes.data.orderId}/track`)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message ?? 'Something went wrong. Please try again.'
      setError(errorMsg)
      
      // If idempotency error (409), let user reload
      if (err.response?.status === 409) {
        setError('Payment already in progress. Please refresh the page.');
      }
    } finally {
      setOrderInProgress(false)
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

      {/* Order summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">Your order</h2>
        {items.map(item => (
          <div key={item.menuItem.id} className="flex justify-between py-2 text-sm border-b border-gray-100 last:border-0">
            <span className="text-gray-700">{item.menuItem.name} × {item.quantity}</span>
            <span className="font-medium">₹{(item.menuItem.price * item.quantity) / 100}</span>
          </div>
        ))}
        <div className="flex justify-between pt-3 text-sm text-gray-500">
          <span>Delivery fee</span>
          <span>₹{deliveryFee !== null ? (deliveryFee / 100) : '...'}</span>
        </div>
        <div className="flex justify-between pt-2 font-bold text-gray-900">
          <span>Total (approx)</span>
          <span>₹{deliveryFee !== null ? ((subtotal + deliveryFee) / 100) : '...'}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Final amount confirmed at payment</p>
      </div>

      {/* Delivery address */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <label className="block text-sm font-semibold text-gray-800 mb-2">Delivery address</label>
        <textarea
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="Enter your full delivery address..."
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Coupon */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <label className="block text-sm font-semibold text-gray-800 mb-2">Coupon code (optional)</label>
        <input
          value={couponCode}
          onChange={e => setCouponCode(e.target.value.toUpperCase())}
          placeholder="e.g. GHOST20"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={handlePlaceOrder}
        disabled={isLoading || items.length === 0 || deliveryFee === null || orderInProgress}
        className="w-full h-14 bg-brand hover:bg-brand-dark disabled:bg-gray-300 text-white font-bold text-base rounded-xl transition-colors"
      >
        {isLoading ? 'Processing...' : `Pay ₹${deliveryFee !== null ? ((subtotal + deliveryFee) / 100) : '...'}`}
      </button>

      <p className="text-center text-xs text-gray-400 mt-3">
        Secured by Cashfree Payments
      </p>
    </div>
  )
}
