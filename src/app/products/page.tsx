import { ErrorText, PageHeader, SuccessText } from "@/components/ui";
import { listErpProductNames } from "@/lib/product-loading";
import { prisma } from "@/lib/prisma";
import { registerProduct } from "./actions";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const params = await searchParams;
  const products = await prisma.product.findMany({ where: { isActive: true, productCode: { startsWith: "USER-" } }, select: { id: true, productName: true }, orderBy: { productName: "asc" } });
  const existingNames = listErpProductNames();
  return <div>
    <PageHeader title="상품" description="기존 품명은 그대로 사용하며, 새 품명을 추가할 수 있습니다." />
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
      {products.length ? <ul>{products.map((product) => <li key={product.id}>{product.productName}</li>)}</ul> : <p>추가한 품명이 없습니다.</p>}
    </section>
    <details className="card p-4">
      <summary>기존 품명 보기 · {existingNames.length}개</summary>
      <ul className="mt-3">{existingNames.map((name) => <li key={name}>{name}</li>)}</ul>
    </details>
  </div>;
}
