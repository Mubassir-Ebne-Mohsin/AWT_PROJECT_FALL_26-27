import { ShareSettings } from "@/components/share/share-settings";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShareSettings id={id} />;
}
