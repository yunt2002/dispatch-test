"use client";

import { useMemo, useState } from "react";
import {
  describeCustomerRoute,
  type RegionOption,
  type RouteOption,
} from "@/lib/customer-route";

export function CustomerAddressFields({
  regions,
  routes,
  defaultAddress,
  defaultEmergency,
}: {
  regions: RegionOption[];
  routes: RouteOption[];
  defaultAddress?: string;
  defaultEmergency?: boolean;
}) {
  const [address, setAddress] = useState(defaultAddress ?? "");
  const [emergency, setEmergency] = useState(defaultEmergency ?? false);
  const preview = useMemo(
    () => describeCustomerRoute(address, emergency, regions, routes),
    [address, emergency, regions, routes],
  );

  return (
    <>
      <div className="field">
        <label htmlFor="address">주소(위치) *</label>
        <input
          id="address"
          className="input"
          name="address"
          list="customer-locations"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="예: 인천, 평택, 부산항"
          required
        />
        <datalist id="customer-locations">
          {regions.map((region) => (
            <option key={region.locationName} value={region.locationName} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label>기본 배송 루트</label>
        <div className="input bg-gray-50 font-bold">
          {address.trim() ? preview.label : "주소를 입력하면 표시됩니다"}
        </div>
        <input type="hidden" name="defaultRouteId" value={preview.route?.id ?? ""} />
      </div>
      <label className="mt-1 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isEmergency"
          checked={emergency}
          onChange={(event) => setEmergency(event.target.checked)}
        />
        긴급납품
      </label>
    </>
  );
}
