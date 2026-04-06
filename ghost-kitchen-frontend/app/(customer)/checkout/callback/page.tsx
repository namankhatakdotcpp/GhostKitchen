'use client'
import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import api from '@/lib/api'
import { useCartStore } from '@/store/cartStore'

function PaymentCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const clearCart = useCartStore(s => s.clearCart)

  useEffect(() => {
    if (!searchParams) {
      router.push('/')
      return
    }

    const cfOrderId = searchParams.get('order_id')
    if (!cfOrderId) {
      router.push('/')
      return
    }

    api
      .post('/payments/verify', { cfOrderId })
      .then((res) => {
        clearCart()
        router.push(`/order/${res.data.orderId}/track`)
      })
      .catch(() => {
        router.push('/checkout?error=payment_failed')
      })
  }, [searchParams, router, clearCart])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-600">Confirming your payment...</p>
    </div>
  )
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600">Loading...</p>
      </div>
    }>
      <PaymentCallbackContent />
    </Suspense>
  )
}
