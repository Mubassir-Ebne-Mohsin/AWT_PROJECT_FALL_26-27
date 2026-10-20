import { redirect } from "next/navigation";

export default async function DesignIndex({ params }: PageProps<"/designs/[id]">) {
  const { id } = await params;
  redirect(`/designs/${encodeURIComponent(id)}/edit`);
}
