import MapRoutePage from "@/components/map-route-page";

export default function Page({ searchParams }: { searchParams: Promise<{ date?: string; batch?: string }> }) {
  return <MapRoutePage searchParams={searchParams} />;
}
