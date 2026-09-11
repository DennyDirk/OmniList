import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductEditor } from "../../../../components/product-editor";
import { requireAuthSession } from "../../../../lib/auth";
import { getClientApiBaseUrl, getProduct } from "../../../../lib/api";
import { getI18n } from "../../../../lib/i18n.server";

export default async function EditProductPage({
  params
}: {
  params: Promise<{ productId: string }>;
}) {
  const { dictionary, locale } = await getI18n();
  await requireAuthSession();
  const { productId } = await params;
  const product = await getProduct(productId);

  if (!product) {
    notFound();
  }

  return (
    <main className="shell listing-shell">
      <section className="listing-header">
        <Link className="pill" href={`/products/${product.id}`}>
          {dictionary.common.backToWorkspace}
        </Link>
        <h1>{dictionary.editProductPage.title}</h1>
      </section>

      <section className="listing-editor-wrap">
        <ProductEditor apiBaseUrl={getClientApiBaseUrl()} initialProduct={product} locale={locale} />
      </section>
    </main>
  );
}
