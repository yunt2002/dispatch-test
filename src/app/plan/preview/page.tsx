import { redirectLegacyToHome } from "@/lib/legacy-home";

export default async function LegacyPlanPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  redirectLegacyToHome(date);
}
