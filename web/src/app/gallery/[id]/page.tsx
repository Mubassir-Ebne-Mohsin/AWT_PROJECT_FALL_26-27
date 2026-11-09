import { GalleryPostView } from "@/components/gallery/gallery-post";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GalleryPostView id={id} />;
}
