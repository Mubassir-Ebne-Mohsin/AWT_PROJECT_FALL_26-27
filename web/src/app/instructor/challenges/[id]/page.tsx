import { ChallengeDetail } from "@/components/instructor/challenge-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeDetail id={id} />;
}
