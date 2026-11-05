import { MyReport } from "@/components/support/my-reports";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MyReport id={id} />;
}
