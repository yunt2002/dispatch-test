import { DeliveryComparison } from "@/components/delivery-comparison";
import { todayISO } from "@/lib/format";

export default async function SimulationPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
  return <div className="dispatch-page"><DeliveryComparison key={initialDate} initialDate={initialDate} /></div>;
}
