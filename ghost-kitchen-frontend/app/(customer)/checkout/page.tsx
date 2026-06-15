'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { load } from '@cashfreepayments/cashfree-js'
import { useCartStore } from '@/store/cartStore'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import api from '@/lib/api'
import { toRupees } from '@/lib/utils'
import AvailableCoupons from '@/components/customer/AvailableCoupons'
import { MapPin, Plus, CreditCard, Banknote, CheckCircle2 } from 'lucide-react'

type PaymentMethod = 'ONLINE' | 'COD'

interface AppliedCoupon {
  code: string
  discountAmount: number   // paise
  finalAmount: number      // paise
}

interface SavedAddress {
  id: string
  label: string
  line1: string
  line2?: string | null
  city: string
  state?: string | null
  pincode?: string | null
  isDefault: boolean
}

function CheckoutPageContent() {
  const router = useRouter()
  const { items, getRestaurantId, getSubtotal, clearCart } = useCartStore()
  const restaurantId = getRestaurantId()

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [useNewAddress, setUseNewAddress] = useState(false)
  const [newAddressText, setNewAddressText] = useState('')
  const [newAddressCity, setNewAddressCity] = useState('')

  const [couponCode, setCouponCode] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('ONLINE')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
  const [orderInProgress, setOrderInProgress] = useState(false)
  const [codEnabled, setCodEnabled] = useState(true)

  const subtotalPaise = getSubtotal()

  useEffect(() => {
    api.get('/config')
      .then(r => {
        setDeliveryFee(Number(r.data?.defaultDeliveryFee) || 3000)
        // Respect admin COD toggle
        if (r.data?.cashOnDelivery === false) setCodEnabled(false)
      })
      .catch(() => setDeliveryFee(3000))

    api.get('/user/addresses')
      .then(r => {
        const addrs: SavedAddress[] = r.data.addresses ?? []
        setSavedAddresses(addrs)
        const def = addrs.find(a => a.isDefault)
        if (def) setSelectedAddressId(def.id)
        else if (addrs.length > 0) setSelectedAddressId(addrs[0].id)
        else setUseNewAddress(true)
      })
      .catch(() => setUseNewAddress(true))
  }, [])

  function getDeliveryAddress(): { line1: string; city: string } | null {
    if (useNewAddress) {
      if (!newAddressText.trim()) return null
      return { line1: newAddressText.trim(), city: newAddressCity.trim() || 'Delhi' }
    }
    const addr = savedAddresses.find(a => a.id === selectedAddressId)
    if (!addr) return null
    return { line1: addr.line1, city: addr.city }
  }

  async function handleApplyCoupon() {
    if (!couponInput.trim()) { setCouponError('Please enter a coupon code'); return }
    setCouponLoading(true)
    setCouponError('')
    try {
      const { data } = await api.post('/coupons/validate', {
        code: couponInput.toUpperCase(),
        orderTotal: subtotalPaise,
        restaurantId,
      })
      const { discountAmount, finalAmount } = data.coupon
      setAppliedCoupon({ code: couponInput.toUpperCase(), discountAmount, finalAmount })
      setCouponCode(couponInput.toUpperCase())
    } catch (err: any) {
      setCouponError(err.response?.data?.error ?? err.response?.data?.message ?? 'Invalid coupon code')
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

  const discountPaise = appliedCoupon?.discountAmount ?? 0
  const totalPaise = deliveryFee !== null
    ? Math.max(subtotalPaise + deliveryFee - discountPaise, 0)
    : null

  const subtotalRupees = toRupees(subtotalPaise)
  const deliveryFeeRupees = deliveryFee !== null ? toRupees(deliveryFee) : null
  const discountRupees = toRupees(discountPaise)
  const totalRupees = totalPaise !== null ? toRupees(totalPaise) : null

  async function handlePlaceOrderCOD(deliveryAddress: { line1: string; city: string }) {
    const { data } = await api.post('/orders', {
      restaurantId,
      items: items.map(i => ({ menuItemId: i.menuItem.id, quantity: i.quantity })),
      deliveryAddress,
      couponCode: couponCode || undefined,
    })
    clearCart()
    router.push(`/order/${data.order.id}/track`)
  }

  async function handlePlaceOrderOnline(deliveryAddress: { line1: string; city: string }) {
    const { data } = await api.post('/payments/create-order', {
      restaurantId,
      items: items.map(i => ({ menuItemId: i.menuItem.id, quantity: i.quantity })),
      deliveryAddress,
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
      throw new Error(result.error.message ?? 'Payment failed. Please try again.')
    }

    if (result.redirect) return

    if (result.paymentDetails) {
      const verifyRes = await api.post('/payments/verify', { cfOrderId: data.cfOrderId })
      clearCart()
      router.push(`/order/${verifyRes.data.orderId}/track`)
    }
  }

  async function handlePlaceOrder() {
    if (orderInProgress) { setError('Order is already being processed. Please wait.'); return }

    const deliveryAddress = getDeliveryAddress()
    if (!deliveryAddress) {
      setError(useNewAddress ? 'Please enter a delivery address' : 'Please select a delivery address')
      return
    }
    if (items.length === 0) { setError('Your cart is empty'); return }

    setOrderInProgress(true)
    setIsLoading(true)
    setError('')

    try {
      if (paymentMethod === 'COD') {
        await handlePlaceOrderCOD(deliveryAddress)
      } else {
        await handlePlaceOrderOnline(deliveryAddress)
      }
    } catch (err: any) {
      const status = err.response?.status
      const apiMsg = err.response?.data?.message ?? err.response?.data?.error
      if (status === 409) {
        setError('Payment already in progress. Please refresh the page.')
      } else if (status === 400 && apiMsg) {
        setError(apiMsg)
      } else if (status === 502) {
        setError('Payment gateway is unavailable. Please try Cash on Delivery or retry in a moment.')
      } else if (err.message) {
        setError(err.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setOrderInProgress(false)
      setIsLoading(false)
    }
  }

  const buttonLabel = isLoading
    ? 'Processing...'
    : paymentMethod === 'COD'
      ? `Place Order — ₹${totalRupees !== null ? totalRupees.toFixed(2) : '...'}`
      : `Pay ₹${totalRupees !== null ? totalRupees.toFixed(2) : '...'}`

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
            <div className="flex justify-between text-green-600 font-medium">
              <span>Discount ({appliedCoupon?.code})</span>
              <span>-₹{discountRupees.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 font-bold text-gray-900 border-t border-gray-100 text-base">
            <span>Total</span>
            <span>₹{totalRupees !== null ? totalRupees.toFixed(2) : '...'}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">Final amount confirmed at payment</p>
      </div>

      {/* Delivery address */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">Delivery address</h2>

        {savedAddresses.length > 0 && (
          <div className="space-y-2 mb-3">
            {savedAddresses.map((addr) => (
              <label
                key={addr.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  !useNewAddress && selectedAddressId === addr.id
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="address"
                  value={addr.id}
                  checked={!useNewAddress && selectedAddressId === addr.id}
                  onChange={() => { setSelectedAddressId(addr.id); setUseNewAddress(false) }}
                  className="mt-0.5 accent-orange-600"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{addr.label}</span>
                    {addr.isDefault && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">DEFAULT</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-700">
                    {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}
                    {addr.pincode ? ` - ${addr.pincode}` : ''}
                  </p>
                </div>
              </label>
            ))}

            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                useNewAddress ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="address"
                checked={useNewAddress}
                onChange={() => setUseNewAddress(true)}
                className="accent-orange-600"
              />
              <Plus className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-700">Use a different address</span>
            </label>
          </div>
        )}

        {(useNewAddress || savedAddresses.length === 0) && (
          <div className="space-y-2">
            <textarea
              value={newAddressText}
              onChange={e => setNewAddressText(e.target.value)}
              placeholder="House / flat / building, area, street..."
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <input
              value={newAddressCity}
              onChange={e => setNewAddressCity(e.target.value)}
              placeholder="City (e.g. Delhi, Bahadurgarh...)"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        )}
      </div>

      {/* Coupon */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
        <label className="block text-sm font-semibold text-gray-800">Coupon code</label>

        {appliedCoupon ? (
          <div className="flex items-start justify-between bg-green-50 border border-green-200 rounded-lg p-3">
            <div>
              <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {appliedCoupon.code} applied
              </p>
              <p className="text-xs text-green-700 mt-0.5">Saving ₹{(appliedCoupon.discountAmount / 100).toFixed(2)}</p>
            </div>
            <button onClick={handleRemoveCoupon} className="text-xs font-semibold text-green-700 hover:underline">Remove</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={couponInput}
              onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError('') }}
              placeholder="e.g. GHOST20, IITMANDI300"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
              disabled={couponLoading}
              onKeyDown={e => { if (e.key === 'Enter') handleApplyCoupon() }}
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

        {restaurantId && <AvailableCoupons restaurantId={restaurantId} onSelect={code => { setCouponInput(code); setCouponError('') }} />}
      </div>

      {/* Payment method */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">Payment method</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPaymentMethod('ONLINE')}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition ${
              paymentMethod === 'ONLINE'
                ? 'border-orange-500 bg-orange-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <CreditCard className={`h-6 w-6 ${paymentMethod === 'ONLINE' ? 'text-orange-600' : 'text-gray-500'}`} />
            <div className="text-center">
              <p className={`text-sm font-semibold ${paymentMethod === 'ONLINE' ? 'text-orange-700' : 'text-gray-700'}`}>
                Pay Online
              </p>
              <p className="text-xs text-gray-400 mt-0.5">UPI · Cards · Wallets</p>
            </div>
            {paymentMethod === 'ONLINE' && (
              <CheckCircle2 className="h-4 w-4 text-orange-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => codEnabled && setPaymentMethod('COD')}
            disabled={!codEnabled}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition ${
              !codEnabled
                ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                : paymentMethod === 'COD'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <Banknote className={`h-6 w-6 ${paymentMethod === 'COD' ? 'text-orange-600' : 'text-gray-500'}`} />
            <div className="text-center">
              <p className={`text-sm font-semibold ${paymentMethod === 'COD' ? 'text-orange-700' : 'text-gray-700'}`}>
                Cash on Delivery
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {codEnabled ? 'Pay at your door' : 'Not available'}
              </p>
            </div>
            {paymentMethod === 'COD' && (
              <CheckCircle2 className="h-4 w-4 text-orange-500" />
            )}
          </button>
        </div>

        {paymentMethod === 'ONLINE' && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            Secured by Cashfree Payments · 256-bit SSL
          </p>
        )}
        {paymentMethod === 'COD' && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            Please keep exact change ready at delivery
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={handlePlaceOrder}
        disabled={isLoading || items.length === 0 || deliveryFee === null || orderInProgress}
        className="w-full h-14 bg-brand hover:bg-brand-dark disabled:bg-gray-300 text-white font-bold text-base rounded-xl transition-colors"
      >
        {buttonLabel}
      </button>
    </div>
  )
}

export default function CheckoutPage() {
  return <ProtectedRoute requiredRole={["CUSTOMER"]}><CheckoutPageContent /></ProtectedRoute>
}
