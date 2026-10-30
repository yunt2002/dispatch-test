import { saveScheduleTransportFee } from "@/app/schedule/actions";

export function ScheduleTransportFee({ id, date, vehicleId, value, productName }: { id: string; date: string; vehicleId: string; value: string | null; productName?: string | null }) {
  return <form action={saveScheduleTransportFee} className="dispatch-transport-fee">
    <input type="hidden" name="returnTo" value="confirm" /><input type="hidden" name="id" value={id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="vehicleId" value={vehicleId} />
    <label htmlFor={`fee-${id}`}>{productName ? `${productName} · ` : ""}운송 금액 (원)</label>
    <div><input className="dispatch-input" id={`fee-${id}`} name="amount" type="number" min="0" max="1000000000" step="1" defaultValue={value ?? ""} placeholder="금액 미입력" /> <button type="submit" className="dispatch-secondary-button">저장</button></div>
  </form>;
}
