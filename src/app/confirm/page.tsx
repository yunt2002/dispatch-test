import DispatchBoardPage from "@/components/dispatch-board-page";

export default function Page({ searchParams }: { searchParams: Promise<{ date?: string; error?: string; ok?: string }> }) {
  return <DispatchBoardPage searchParams={searchParams} view="confirm" />;
}
