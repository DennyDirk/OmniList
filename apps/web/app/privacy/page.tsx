import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Legal</span>
        <h1>Privacy Policy</h1>
        <p>
          OmniList uses seller-authorized marketplace data only to connect channels, prepare listings, publish products,
          synchronize inventory, and support order operations inside the seller workspace.
        </p>
        <div className="hero-actions">
          <Link className="cta secondary" href="/">
            Back to app
          </Link>
        </div>
      </section>

      <section className="grid product-grid">
        <article className="card">
          <h2>Data we use</h2>
          <div className="list">
            <div className="list-item">Marketplace account identifiers and authorized access tokens.</div>
            <div className="list-item">Product catalog data, listing content, media, and inventory quantities.</div>
            <div className="list-item">Operational metadata needed to publish, validate, and sync channel listings.</div>
          </div>
        </article>

        <article className="card">
          <h2>How we use it</h2>
          <div className="list">
            <div className="list-item">To connect your workspace to marketplaces you explicitly authorize.</div>
            <div className="list-item">To publish and update listings on your behalf.</div>
            <div className="list-item">To monitor listing readiness, inventory state, and job results.</div>
          </div>
        </article>

        <article className="card">
          <h2>Data sharing</h2>
          <div className="list">
            <div className="list-item">OmniList does not sell marketplace account data.</div>
            <div className="list-item">Data is exchanged only with marketplaces and infrastructure providers needed to operate the service.</div>
            <div className="list-item">Access is limited to authenticated seller workspaces and authorized backend services.</div>
          </div>
        </article>
      </section>
    </main>
  );
}
