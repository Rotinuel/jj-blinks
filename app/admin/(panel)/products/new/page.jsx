import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { listCategoriesAdmin } from '@/db/queries/admin';
import ProductForm from '@/components/admin/ProductForm';
import { Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'New product' };

export default async function NewProduct({ searchParams }) {
  const user = await requirePermission('products.edit');
  const [sp, cats] = await Promise.all([searchParams, listCategoriesAdmin()]);
  return (
    <>
      <PageHead title="New product" back={{ href: '/admin/products', label: 'Products' }} />
      <Flash sp={sp} />
      <p className="mb-6 text-sm text-muted">Save the product first, then add photos and variants.</p>
      <ProductForm categories={cats} canCost={can(user.role, 'products.cost')} hasVariants={false} />
    </>
  );
}
