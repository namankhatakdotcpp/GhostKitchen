declare module '@cashfreepayments/cashfree-js' {
  export function load(config: {
    mode: 'sandbox' | 'production'
  }): Promise<any>;

  export interface CashfreeInstance {
    checkout(config: {
      paymentSessionId: string;
      returnUrl: string;
    }): Promise<any>;
  }
}
