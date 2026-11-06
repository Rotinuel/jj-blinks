import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { CartProvider } from '@/components/cart/CartProvider';

export default function StoreLayout({ children }) {
  return (
    <CartProvider>
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </CartProvider>
  );
}
