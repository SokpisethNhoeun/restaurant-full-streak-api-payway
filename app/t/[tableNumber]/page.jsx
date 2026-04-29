import CustomerOrderingApp from "@/components/customer-ordering-app";

export default async function TablePage({ params }) {
  const { tableNumber } = await params;
  return <CustomerOrderingApp tableNumber={tableNumber} />;
}
