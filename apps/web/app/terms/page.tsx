import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Legal</span>
        <h1>Terms of Service</h1>
        <p>
          OmniList helps sellers manage catalog data and marketplace publishing workflows. By using the service, you
          confirm that you control the connected seller accounts and the products you publish through them.
        </p>
        <div className="hero-actions">
          <Link className="cta secondary" href="/">
            Back to app
          </Link>
        </div>
      </section>

      <section className="grid product-grid">
        <article className="card">
          <h2>Authorized use</h2>
          <div className="list">
            <div className="list-item">Use OmniList only with accounts and catalogs you are authorized to manage.</div>
            <div className="list-item">You remain responsible for listing accuracy, policy compliance, and marketplace rules.</div>
          </div>
        </article>

        <article className="card">
          <h2>Service scope</h2>
          <div className="list">
            <div className="list-item">OmniList provides software tooling for publishing, validation, and synchronization workflows.</div>
            <div className="list-item">Marketplace availability, API limits, and policy changes remain outside OmniList control.</div>
          </div>
        </article>

        <article className="card">
          <h2>Access and security</h2>
          <div className="list">
            <div className="list-item">Keep your credentials secure and revoke marketplace access if you suspect misuse.</div>
            <div className="list-item">OmniList may suspend integrations that appear abusive, unsafe, or policy-violating.</div>
          </div>
        </article>
      </section>
    </main>
  );
}
