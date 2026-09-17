import { getEffectiveProductForChannel, type Product } from "@omnilist/shared";
import type { Locale } from "../lib/i18n";
import { publishFlowCopy } from "../lib/publish-flow-copy";
import { publishCopy } from "../lib/publish-copy";

export function EbayPublishPreview({ product, locale }: { product: Product; locale: Locale }) {
  const effective = getEffectiveProductForChannel(product, "ebay");
  const flow = publishFlowCopy[locale];
  return <div>
    <h4>{effective.title}</h4>
    <div className="listing-photos">{product.images.map(image => <div className="listing-photo" key={image.id}><img src={image.url} alt={image.altText || effective.title} /></div>)}</div>
    <p className="listing-description">{effective.description}</p>
    <p><strong>{new Intl.NumberFormat(locale, { style: "currency", currency: product.currency }).format(effective.basePrice)}</strong> · {publishCopy[locale].count}: {product.quantity}</p>
    <p>{flow.category}: {product.channelOverrides.ebay?.categoryId} · {flow.condition}: {product.channelOverrides.ebay?.condition}</p>
  </div>;
}
