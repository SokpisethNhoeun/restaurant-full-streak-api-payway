import CustomerOrderingPageShell from '@/components/customer-ordering-page-shell';

export default async function TablePage({ params }) {
  const { tableNumber } = await params;
  return <CustomerOrderingPageShell tableNumber={tableNumber} />;
}
