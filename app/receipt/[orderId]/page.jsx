import CustomerReceipt from '@/components/customer-receipt';

export const metadata = {
  title: 'Receipt - HappyBoat',
};

export default async function ReceiptPage({ params, searchParams }) {
  const { orderId } = await params;
  const query = await searchParams;
  const accessToken = Array.isArray(query?.accessToken)
    ? query.accessToken[0]
    : query?.accessToken || '';
  return <CustomerReceipt orderId={orderId} accessToken={accessToken} />;
}
