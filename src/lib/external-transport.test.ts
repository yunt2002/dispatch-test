import { strict as assert } from "node:assert";
import { test } from "node:test";
import { externalTransport, parseTransportFee, transportFeeKey } from "./external-transport";

test("용차와 택배는 별도의 외부 운송으로 구분한다", () => {
  assert.equal(externalTransport("external:charter")?.vehicleName, "용차");
  assert.equal(externalTransport("external:courier")?.vehicleName, "택배");
  assert.equal(externalTransport("vehicle-1ho-4t"), null);
  assert.notEqual(transportFeeKey("entry", "external:charter"), transportFeeKey("entry", "external:courier"));
});
test("운송 금액은 정수와 0원, 빈 값을 구분하고 잘못된 값을 거부한다", () => {
  assert.equal(parseTransportFee("200,000"), "200000");
  assert.equal(parseTransportFee("0"), "0");
  assert.equal(parseTransportFee(""), "");
  assert.equal(parseTransportFee("-1"), null);
  assert.equal(parseTransportFee("1.2"), null);
  assert.equal(parseTransportFee("1000000001"), null);
});
