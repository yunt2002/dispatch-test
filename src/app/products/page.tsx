import { ErrorText, PageHeader, SuccessText } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { listErpProductNames } from "@/lib/product-loading";
import { prisma } from "@/lib/prisma";
import { HIDDEN_PRODUCT_PREFIX } from "@/lib/product-visibility";
import { DELIVERY_CUSTOMERS } from "@/lib/delivery-customers";
import { readCustomProduct, type CustomProductInfo } from "@/lib/custom-product";
import { registerProduct, removeRegisteredProduct, setExistingProductVisibility, updateRegisteredProduct } from "./actions";

function ProductFields({ regions, info }: { regions: string[]; info?: CustomProductInfo }) {
  return <div className="grid-form mt-3">
    <label className="field">기본 거래처<select className="select" name="customerName" defaultValue={info?.customerName ?? ""}><option value="">미설정</option>{DELIVERY_CUSTOMERS.map((customer) => <option key={customer.id} value={customer.name}>{customer.name}</option>)}</select></label>
    <label className="field">기본 지역<select className="select" name="locationName" defaultValue={info?.locationName ?? ""}><option value="">미설정</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}</select></label>
    <label className="field">기본 수량 단위<select className="select" name="defaultUnit" defaultValue={info?.defaultUnit ?? "box"}><option value="box">박스</option><option value="plt">PLT</option></select></label>
    <label className="field">박스당 중량 (kg)<input className="input" name="boxWeightKg" type="number" min="0.001" max="1000000" step="any" defaultValue={info?.boxWeightKg ?? ""} placeholder="미확인" /></label>
    <label className="field">PLT당 중량 (kg)<input className="input" name="palletWeightKg" type="number" min="0.001" max="1000000" step="any" defaultValue={info?.palletWeightKg ?? ""} placeholder="미확인" /></label>
    <label className="field">1 PLT당 박스 수<input className="input" name="boxesPerPallet" type="number" min="1" max="1000000" step="1" defaultValue={info?.boxesPerPallet ?? ""} placeholder="미확인" /></label>
  </div>;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const params = await searchParams;
  const [allProducts, hiddenSettings, regionRows] = await Promise.all([
    prisma.product.findMany({ where: { productCode: { startsWith: "USER-" } }, select: { id: true, productName: true, isActive: true, specialLoadingCondition: true }, orderBy: { productName: "asc" } }),
    prisma.appSetting.findMany({ where: { key: { startsWith: HIDDEN_PRODUCT_PREFIX } }, select: { value: true } }),
    prisma.regionMaster.findMany({ select: { locationName: true }, orderBy: { locationName: "asc" } }),
  ]);
  const regions = regionRows.map((region) => region.locationName);
  const products = allProducts.filter((product) => product.isActive);
  const existingNames = listErpProductNames();
  const hidden = new Set(hiddenSettings.map((item) => item.value));
  const activeNames = existingNames.filter((name) => !hidden.has(name));
  return <div>
    <PageHeader title="상품" description="납품에 사용할 품명을 등록하고 삭제할 수 있습니다." />
    <ErrorText message={params.error} />
    <SuccessText message={params.ok} />
    <form action={registerProduct} className="card mb-4 p-4">
      <h2 className="mb-3 text-base font-bold">새 품명 등록</h2>
      <div className="field">
        <label htmlFor="new-product-name">품명 (ERP) *</label>
        <input className="input" id="new-product-name" name="productName" maxLength={150} required placeholder="등록할 품명을 입력하세요" />
      </div>
      <ProductFields regions={regions} />
      <p className="mt-2 text-sm">모르는 값은 비워 두세요. 박스는 입력한 PLT당 박스 수와 관계없이 실제 적재 방식을 확인합니다.</p>
      <button className="btn btn-primary mt-3" type="submit">품명 등록</button>
    </form>
    <section className="card mb-4 p-4" aria-labelledby="custom-products-title">
      <h2 id="custom-products-title" className="mb-3 text-base font-bold">추가한 품명 · {products.length}개</h2>
      {products.length ? <ul>{products.map((product) => <li key={product.id} className="py-2"><div className="flex items-center justify-between gap-3"><strong>{product.productName}</strong><ConfirmSubmit action={removeRegisteredProduct} id={product.id} message={`‘${product.productName}’ 품명을 목록에서 삭제할까요? 기존 납품 기록은 유지됩니다.`} /></div><details><summary>품목 정보 수정</summary><form action={updateRegisteredProduct}><input type="hidden" name="id" value={product.id} /><ProductFields regions={regions} info={readCustomProduct(product)} /><button className="btn btn-primary mt-3" type="submit">정보 저장</button></form></details></li>)}</ul> : <p>추가한 품명이 없습니다.</p>}
    </section>
    <details className="card p-4">
      <summary>기존 품명 · {activeNames.length}개</summary>
      <ul className="mt-3">{activeNames.map((name) => <li key={name} className="flex items-center justify-between gap-3 py-2"><span>{name}</span><ConfirmSubmit action={setExistingProductVisibility} id={name} extraFields={{ name, visible: "false" }} message={`‘${name}’ 품명을 목록에서 삭제할까요? 기존 납품 기록은 유지됩니다.`} /></li>)}</ul>
    </details>
  </div>;
}
