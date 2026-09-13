import Link from "next/link";
import { EbayCatalogPreview } from "../../../../components/ebay-catalog-preview";
import { requireAuthSession } from "../../../../lib/auth";
import { getClientApiBaseUrl } from "../../../../lib/api";
import { getI18n } from "../../../../lib/i18n.server";
import { ebayCatalogCopy } from "../../../../lib/ebay-catalog-copy";

export default async function EbayCatalogPage() {
  await requireAuthSession();
  const { locale } = await getI18n();
  const copy = ebayCatalogCopy[locale];
  return <main className="shell listing-shell">
    <header className="listing-header"><Link className="text-link" href="/">{copy.back}</Link><h1>{copy.title}</h1></header>
    <EbayCatalogPreview apiBaseUrl={getClientApiBaseUrl()} locale={locale} />
  </main>;
}
