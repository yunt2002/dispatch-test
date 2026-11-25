import DispatchBoardPage, { type DispatchBoardSearchParams } from "@/components/dispatch-board-page";

export default function Page({ searchParams }: { searchParams: Promise<DispatchBoardSearchParams> }) {
  return <DispatchBoardPage searchParams={searchParams} view="request" />;
}
