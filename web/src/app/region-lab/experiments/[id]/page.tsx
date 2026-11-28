import { RegionLab } from "@/components/region-lab/region-lab";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RegionLab view="experiment" id={id} />;
}
