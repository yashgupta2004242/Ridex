import { createHmac } from 'node:crypto';
import type { Env } from './env';

export type RazorpayOrder = { id: string; amount: number; currency: string };

export type RazorpayPort = {
  configured: boolean;
  createOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder>;
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
};

export class MemoryRazorpay implements RazorpayPort {
  configured = true;
  readonly orders: RazorpayOrder[] = [];

  async createOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder> {
    const order = { id: `order_${this.orders.length + 1}_${receipt.slice(0, 6)}`, amount: amountPaise, currency: 'INR' };
    this.orders.push(order);
    return order;
  }

  verifyCheckoutSignature(_orderId: string, _paymentId: string, signature: string): boolean {
    return signature === 'valid-signature' || signature.startsWith('sig_');
  }

  verifyWebhookSignature(_rawBody: string, signature: string): boolean {
    return signature === 'valid-webhook' || signature.startsWith('whsec_');
  }
}

export class RazorpayGateway implements RazorpayPort {
  constructor(private readonly env: Env) {}

  get configured(): boolean {
    return Boolean(this.env.RAZORPAY_KEY_ID && this.env.RAZORPAY_KEY_SECRET);
  }

  async createOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder> {
    if (!this.configured) {
      throw new Error('Razorpay is not configured');
    }
    const Razorpay = (await import('razorpay')).default;
    const client = new Razorpay({
      key_id: this.env.RAZORPAY_KEY_ID,
      key_secret: this.env.RAZORPAY_KEY_SECRET,
    });
    const order = (await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
    })) as { id: string; amount: number; currency: string };
    return { id: order.id, amount: Number(order.amount), currency: order.currency };
  }

  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    const expected = createHmac('sha256', this.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return expected === signature;
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = createHmac('sha256', this.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    return expected === signature;
  }
}
