import { redirectLegacyToHome } from "@/lib/legacy-home";

export default async function LegacyPlanAnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  redirectLegacyToHome(date);
}
