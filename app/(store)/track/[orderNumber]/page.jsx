import { notFound } from 'next/navigation';
import { getOrderByToken } from '@/db/queries/orders';
import { payOrderAction } from '@/app/actions/checkout';
import { emailConfigured } from '@/lib/email';
import { formatMoney } from '@/lib/currency';
import { formatDateTime } from '@/lib/utilities';
import OrderDetail from '@/components/account/OrderDetail';
import ClearCart from '@/components/cart/ClearCart';

export const metadata = { title: 'Your order', robots: { index: false } };

export default async function TrackOrderPage({ params, searchParams }) {
  const { orderNumber } = await params;
  const sp = await searchParams;
  const found = await getOrderByToken(decodeURIComponent(orderNumber), sp.token);
  if (!found) notFound();
  const { order } = found;
  const payable = order.status === 'pending_payment' && (!order.expires_at || new Date(order.expires_at) > new Date());
  return (
    <div className="wrap pt-12">
      {sp.placed && <ClearCart />}
      <h1 className="font-display text-title">Order {order.order_number}</h1>
      {sp.placed && (
        <p className="notice notice-ok mt-6 max-w-2xl">
          Order received. {order.status === 'awaiting_quote' ? 'We will quote delivery and send you a payment link' : 'We will be in touch'}
          {emailConfigured() ? ` at ${order.email}.` : '. Bookmark this page to come back to your order.'}
        </p>
      )}
      <div className="mt-10">
        <OrderDetail {...found}>
          {sp.payerror && <p className="notice notice-error mt-6" role="alert">{sp.payerror}</p>}
          {payable && (
            <form action={payOrderAction} className="mt-6">
              <input type="hidden" name="order" value={order.order_number} />
              <input type="hidden" name="token" value={order.tracking_token} />
              <button className="btn btn-primary">Pay {formatMoney(order.charge_amount_minor ?? order.total_kobo, order.charge_currency)} with Paystack</button>
              {order.expires_at && <p className="mt-2 text-sm text-muted">Pay by {formatDateTime(order.expires_at)} to keep your items reserved.</p>}
            </form>
          )}
        </OrderDetail>
      </div>
    </div>
  );
}
