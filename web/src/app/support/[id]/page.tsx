import { SupportTicket } from "@/components/support/ticket-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SupportTicket id={id} />;
}
