import CartView from '@/components/cart/CartView';

export const metadata = { title: 'Your bag', robots: { index: false } };

export default function CartPage() {
  return (
    <div className="wrap pt-12">
      <h1 className="mb-10 font-display text-title">Your bag</h1>
      <CartView />
    </div>
  );
}
