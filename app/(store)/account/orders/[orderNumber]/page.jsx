import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getOrderForUser } from '@/db/queries/orders';
import { payOrderAction } from '@/app/actions/checkout';
import { formatMoney } from '@/lib/currency';
import OrderDetail from '@/components/account/OrderDetail';

export const metadata = { title: 'Order' };

export default async function AccountOrderPage({ params }) {
  const { orderNumber } = await params;
  const user = await requireUser('/account/orders');
  const found = await getOrderForUser(decodeURIComponent(orderNumber), user.id);
  if (!found) notFound();
  const { order } = found;
  return (
    <>
      <h1 className="mb-8 font-display text-title">Order {order.order_number}</h1>
      <OrderDetail {...found}>
        {order.status === 'pending_payment' && (
          <form action={payOrderAction} className="mt-6">
            <input type="hidden" name="order" value={order.order_number} />
            <input type="hidden" name="token" value={order.tracking_token} />
            <button className="btn btn-primary">Pay {formatMoney(order.charge_amount_minor ?? order.total_kobo, order.charge_currency)} with Paystack</button>
          </form>
        )}
      </OrderDetail>
    </>
  );
}
