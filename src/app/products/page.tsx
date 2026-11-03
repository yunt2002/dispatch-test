import { ErrorText, PageHeader, SuccessText } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { listErpProductNames } from "@/lib/product-loading";
import { prisma } from "@/lib/prisma";
import { HIDDEN_PRODUCT_PREFIX } from "@/lib/product-visibility";
import { registerProduct, removeRegisteredProduct, restoreRegisteredProduct, setExistingProductVisibility } from "./actions";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const params = await searchParams;
  const [allProducts, hiddenSettings] = await Promise.all([
    prisma.product.findMany({ where: { productCode: { startsWith: "USER-" } }, select: { id: true, productName: true, isActive: true }, orderBy: { productName: "asc" } }),
    prisma.appSetting.findMany({ where: { key: { startsWith: HIDDEN_PRODUCT_PREFIX } }, select: { value: true } }),
  ]);
  const products = allProducts.filter((product) => product.isActive);
  const inactiveProducts = allProducts.filter((product) => !product.isActive);
  const existingNames = listErpProductNames();
  const hidden = new Set(hiddenSettings.map((item) => item.value));
  const activeNames = existingNames.filter((name) => !hidden.has(name));
  const inactiveNames = existingNames.filter((name) => hidden.has(name));
  return <div>
    <PageHeader title="상품" description="품명을 추가하거나 사용 중지하고, 필요한 품명은 다시 사용할 수 있습니다." />
    <ErrorText message={params.error} />
    <SuccessText message={params.ok} />
    <form action={registerProduct} className="card mb-4 p-4">
      <h2 className="mb-3 text-base font-bold">새 품명 등록</h2>
      <div className="field">
        <label htmlFor="new-product-name">품명 (ERP) *</label>
        <input className="input" id="new-product-name" name="productName" maxLength={150} required placeholder="등록할 품명을 입력하세요" />
      </div>
      <p className="mt-2 text-sm">등록 후 새 납품 등록의 품명 목록에서 선택할 수 있습니다. 새 품목의 거래처·적재 기준은 별도로 확인하세요.</p>
      <button className="btn btn-primary mt-3" type="submit">품명 등록</button>
    </form>
    <section className="card mb-4 p-4" aria-labelledby="custom-products-title">
      <h2 id="custom-products-title" className="mb-3 text-base font-bold">추가한 품명 · {products.length}개</h2>
      {products.length ? <ul>{products.map((product) => <li key={product.id} className="flex items-center justify-between gap-3 py-2"><span>{product.productName}</span><ConfirmSubmit action={removeRegisteredProduct} id={product.id} message={`‘${product.productName}’ 품명을 목록에서 삭제할까요? 기존 납품 기록은 유지됩니다.`} /></li>)}</ul> : <p>추가한 품명이 없습니다.</p>}
    </section>
    <details className="card p-4">
      <summary>사용 중인 기존 품명 · {activeNames.length}개</summary>
      <ul className="mt-3">{activeNames.map((name) => <li key={name} className="flex items-center justify-between gap-3 py-2"><span>{name}</span><form action={setExistingProductVisibility}><input type="hidden" name="name" value={name} /><input type="hidden" name="visible" value="false" /><button className="btn btn-danger" type="submit">사용 중지</button></form></li>)}</ul>
    </details>
    <details className="card mt-4 p-4">
      <summary>사용 중지한 품명 · {inactiveNames.length + inactiveProducts.length}개</summary>
      <ul className="mt-3">
        {inactiveNames.map((name) => <li key={name} className="flex items-center justify-between gap-3 py-2"><span>{name} · 기존 품명</span><form action={setExistingProductVisibility}><input type="hidden" name="name" value={name} /><input type="hidden" name="visible" value="true" /><button className="btn" type="submit">다시 사용</button></form></li>)}
        {inactiveProducts.map((product) => <li key={product.id} className="flex items-center justify-between gap-3 py-2"><span>{product.productName} · 추가한 품명</span><form action={restoreRegisteredProduct}><input type="hidden" name="id" value={product.id} /><button className="btn" type="submit">다시 사용</button></form></li>)}
      </ul>
    </details>
  </div>;
}
