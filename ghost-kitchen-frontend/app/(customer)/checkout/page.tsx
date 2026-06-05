'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { load } from '@cashfreepayments/cashfree-js'
import { useCartStore } from '@/store/cartStore'
import api from '@/lib/api'
import { toRupees } from '@/lib/utils'
import AvailableCoupons from '@/components/customer/AvailableCoupons'

interface AppliedCoupon {
  code: string
  discountAmount: number   // in rupees (from API response)
  finalAmount: number      // in rupees
}

export default function CheckoutPage() {
  const router = useRouter()
  const { items, getRestaurantId, getSubtotal, clearCart } = useCartStore()
  const restaurantId = getRestaurantId()
  const [address, setAddress] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
  const [orderInProgress, setOrderInProgress] = useState(false)

  // subtotal is in paise (from cart store)
  const subtotalPaise = getSubtotal()

  useEffect(() => {
    setDeliveryFee(5000) // ₹50 in paise default, will be overridden by API
  }, [])

  async function handleApplyCoupon() {
    if (!couponInput.trim()) {
      setCouponError('Please enter a coupon code')
      return
    }
    setCouponLoading(true)
    setCouponError('')
    try {
      const { data } = await api.post('/coupons/validate', {
        code: couponInput.toUpperCase(),
        orderTotal: subtotalPaise / 100, // controller expects rupees for now
      })
      const { discountAmount, finalAmount } = data.coupon
      setAppliedCoupon({ code: couponInput.toUpperCase(), discountAmount, finalAmount })
      setCouponCode(couponInput.toUpperCase())
    } catch (err: any) {
      setCouponError(err.response?.data?.error ?? 'Invalid coupon code')
    } finally {
      setCouponLoading(false)
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null)
    setCouponCode('')
    setCouponInput('')
    setCouponError('')
  }

  const subtotalRupees = toRupees(subtotalPaise)
  const deliveryFeeRupees = deliveryFee !== null ? toRupees(deliveryFee) : null
  const discountRupees = appliedCoupon?.discountAmount ?? 0
  const totalRupees = deliveryFeeRupees !== null
    ? subtotalRupees + deliveryFeeRupees - discountRupees
    : null

  async function handlePlaceOrder() {
    if (orderInProgress) {
      setError('Order is already being processed. Please wait...')
      return
    }
    if (!address.trim()) { setError('Please enter a delivery address'); return }
    if (items.length === 0) { setError('Your cart is empty'); return }

    setOrderInProgress(true)
    setIsLoading(true)
    setError('')

    try {
      const { data } = await api.post('/payments/create-order', {
        restaurantId,
        items: items.map(i => ({ menuItemId: i.menuItem.id, quantity: i.quantity })),
        deliveryAddress: { line1: address, city: 'Delhi' },
        couponCode: couponCode || undefined,
      })

      if (data.deliveryFee) setDeliveryFee(data.deliveryFee)

      const cashfree = await load({
        mode: process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
      })

      const result = await cashfree.checkout({
        paymentSessionId: data.paymentSessionId,
        redirectTarget: '_modal',
      })

      if (result.error) {
        setError(result.error.message ?? 'Payment failed')
        setOrderInProgress(false)
        setIsLoading(false)
        return
      }

      if (result.redirect) return

      if (result.paymentDetails) {
        const verifyRes = await api.post('/payments/verify', { cfOrderId: data.cfOrderId })
        clearCart()
        router.push(`/order/${verifyRes.data.orderId}/track`)
      }
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Something went wrong. Please try again.'
      setError(err.response?.status === 409 ? 'Payment already in progress. Please refresh.' : msg)
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
            <span className="font-medium">₹{toRupees(item.menuItem.price * item.quantity)}</span>
          </div>
        ))}
        <div className="mt-3 space-y-1 text-sm text-gray-500">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>₹{subtotalRupees}</span>
          </div>
          <div className="flex justify-between">
            <span>Delivery fee</span>
            <span>₹{deliveryFeeRupees !== null ? deliveryFeeRupees : '...'}</span>
          </div>
          {discountRupees > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount ({appliedCoupon?.code})</span>
              <span>-₹{discountRupees.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 font-bold text-gray-900 border-t border-gray-100">
            <span>Total</span>
            <span>₹{totalRupees !== null ? totalRupees.toFixed(2) : '...'}</span>
          </div>
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
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
        <label className="block text-sm font-semibold text-gray-800">Coupon code</label>

        {appliedCoupon ? (
          <div className="flex items-start justify-between bg-green-50 border border-green-200 rounded-lg p-3">
            <div>
              <p className="text-sm font-semibold text-green-800">✓ {appliedCoupon.code} applied</p>
              <p className="text-xs text-green-700 mt-0.5">Discount: -₹{appliedCoupon.discountAmount.toFixed(2)}</p>
            </div>
            <button onClick={handleRemoveCoupon} className="text-xs font-semibold text-green-700 hover:underline">Remove</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={couponInput}
              onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError('') }}
              placeholder="e.g. GHOST20"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
              disabled={couponLoading}
            />
            <button
              onClick={handleApplyCoupon}
              disabled={couponLoading || !couponInput.trim()}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:bg-gray-300 transition"
            >
              {couponLoading ? '...' : 'Apply'}
            </button>
          </div>
        )}

        {couponError && <p className="text-xs text-red-600">{couponError}</p>}

        {/* Available coupon chips */}
        {restaurantId && <AvailableCoupons restaurantId={restaurantId} onSelect={code => { setCouponInput(code); setCouponError('') }} />}
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={handlePlaceOrder}
        disabled={isLoading || items.length === 0 || deliveryFee === null || orderInProgress}
        className="w-full h-14 bg-brand hover:bg-brand-dark disabled:bg-gray-300 text-white font-bold text-base rounded-xl transition-colors"
      >
        {isLoading ? 'Processing...' : `Pay ₹${totalRupees !== null ? totalRupees.toFixed(2) : '...'}`}
      </button>

      <p className="text-center text-xs text-gray-400 mt-3">
        Secured by Cashfree Payments
      </p>
    </div>
  )
}
