"use client";

import { useRef, useState, useEffect } from "react";

export interface ActiveListing {
  listingId: string;
  title: string;
  sku?: string;
  listingType: string;
  quantity?: number;
  price?: { value: string; currency: string };
}

export interface ActiveListingsPage {
  page: number;
  total: number;
  nextPage: number | null;
  limited: boolean;
  warning: boolean;
  items: ActiveListing[];
}

export function EbayImportListings({ apiBaseUrl, locale }: {
  apiBaseUrl: string;
  locale: string;
}) {
  const [page, setPage] = useState<ActiveListingsPage>();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicates: number;
    errors: number;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function loadListings(pageNum: number) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError(null);
    setPage(undefined);
    setImportResult(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/channels/ebay/active-listings?page=${pageNum}`,
        { cache: "no-store", credentials: "include", signal: current.signal }
      );
      if (!response.ok) throw new Error("LISTINGS_UNAVAILABLE");
      const result = await response.json();
      if (!current.signal.aborted) {
        setPage(result);
        // Clear selection when loading new page
        setSelected(new Set());
      }
    } catch (err) {
      if (!current.signal.aborted) {
        setError(
          err instanceof Error && err.message === "LISTINGS_UNAVAILABLE"
            ? "Failed to load listings. Check your eBay connection."
            : "Network error. Try again."
        );
      }
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }

  function toggleSelection(listingId: string) {
    const newSelected = new Set(selected);
    if (newSelected.has(listingId)) {
      newSelected.delete(listingId);
    } else {
      newSelected.add(listingId);
    }
    setSelected(newSelected);
  }

  function toggleSelectAll() {
    if (!page) return;
    const newSelected = new Set(selected);
    const pageIds = new Set(page.items.map(item => item.listingId));

    // If all items on this page are selected, deselect them
    if (page.items.every(item => selected.has(item.listingId))) {
      for (const id of pageIds) {
        newSelected.delete(id);
      }
    } else {
      // Otherwise select all items on this page
      for (const id of pageIds) {
        newSelected.add(id);
      }
    }
    setSelected(newSelected);
  }

  async function handleImport() {
    if (selected.size === 0) return;

    setImporting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/channels/ebay/import-listings`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedListingIds: Array.from(selected) })
      });

      if (!response.ok) throw new Error("IMPORT_FAILED");
      const result = await response.json();

      setImportResult({
        imported: result.imported?.length || 0,
        duplicates: result.duplicates?.length || 0,
        errors: result.errors?.length || 0
      });

      // Clear selection after successful import
      setSelected(new Set());
    } catch (err) {
      setError("Import failed. Check your connection and try again.");
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = selected.size;
  const pageItemIds = new Set(page?.items.map(item => item.listingId) || []);
  const allPageItemsSelected = page?.items.length
    ? page.items.every(item => selected.has(item.listingId))
    : false;

  return (
    <section className="card ebay-import-listings" aria-busy={loading || importing}>
      <h2>Import Active Listings from eBay</h2>
      <p className="muted">
        Select listings from your active eBay inventory to import as products.
      </p>

      {page?.warning && (
        <p className="banner warning">
          Some listings may not have been loaded. This is a preview of your active listings.
        </p>
      )}

      {page?.limited && (
        <p className="banner info">
          You have many active listings. Currently showing up to 25,000 items.
        </p>
      )}

      {error && (
        <p className="banner error">
          {error}
          {!page && (
            <>
              {" "}
              <a href="/channels">Reconnect eBay</a>
            </>
          )}
        </p>
      )}

      {!page ? (
        <button
          type="button"
          className="button-primary"
          disabled={loading}
          onClick={() => void loadListings(1)}
        >
          {loading ? "Loading..." : "Load Active Listings"}
        </button>
      ) : (
        <>
          <div className="ebay-import-header">
            <p>
              <strong>
                {page.page === 1 ? "Production" : `Page ${page.page}`}
              </strong>{" "}
              · Total: {page.total} listings · Page {page.page}
            </p>
            {selectedCount > 0 && (
              <p className="muted">
                {selectedCount} selected
              </p>
            )}
          </div>

          {page.items.length > 0 ? (
            <>
              <div className="ebay-import-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={allPageItemsSelected}
                    ref={element => { if (element) element.indeterminate = selectedCount > 0 && !allPageItemsSelected; }}
                    onChange={() => void toggleSelectAll()}
                  />
                  {" "}
                  Select all on this page ({page.items.length})
                </label>
              </div>

              <ul className="ebay-import-items">
                {page.items.map(item => (
                  <li key={item.listingId} className="ebay-import-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(item.listingId)}
                        onChange={() => void toggleSelection(item.listingId)}
                      />
                      <span className="item-content">
                        <strong>{item.title}</strong>
                        <span className="item-details">
                          {item.sku && <span>SKU: {item.sku}</span>}
                          {item.quantity !== undefined && (
                            <span>Qty: {item.quantity}</span>
                          )}
                          {item.price && (
                            <span>
                              {item.price.value} {item.price.currency}
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <nav className="ebay-import-pagination" aria-label="pagination">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={loading || page.page === 1}
                  onClick={() => void loadListings(page.page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={loading || !page.nextPage}
                  onClick={() => page.nextPage && void loadListings(page.nextPage)}
                >
                  Next
                </button>
              </nav>

              <div className="ebay-import-actions">
                <button
                  type="button"
                  className="button-primary"
                  disabled={selectedCount === 0 || importing}
                  onClick={() => void handleImport()}
                >
                  {importing
                    ? `Importing ${selectedCount} listing${selectedCount === 1 ? "" : "s"}...`
                    : `Import Selected (${selectedCount})`}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">No active listings found.</p>
          )}

          {importResult && (
            <div className="ebay-import-result">
              <p className="banner success">
                Import completed: {importResult.imported} imported
                {importResult.duplicates > 0 && `, ${importResult.duplicates} skipped (duplicates)`}
                {importResult.errors > 0 && `, ${importResult.errors} errors`}
              </p>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .ebay-import-listings {
          padding: 20px;
        }

        .ebay-import-header {
          margin: 20px 0 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .ebay-import-controls {
          margin: 15px 0;
          padding: 10px;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 4px;
        }

        .ebay-import-controls label {
          display: flex;
          align-items: center;
          cursor: pointer;
          user-select: none;
        }

        .ebay-import-controls input[type="checkbox"] {
          margin-right: 8px;
        }

        .ebay-import-items {
          list-style: none;
          padding: 0;
          margin: 15px 0;
          border: 1px solid var(--border-color, #ddd);
          border-radius: 4px;
          max-height: 600px;
          overflow-y: auto;
        }

        .ebay-import-item {
          border-bottom: 1px solid var(--border-color, #eee);
          padding: 0;
        }

        .ebay-import-item:last-child {
          border-bottom: none;
        }

        .ebay-import-item label {
          display: flex;
          align-items: flex-start;
          padding: 12px;
          cursor: pointer;
          user-select: none;
          gap: 12px;
        }

        .ebay-import-item label:hover {
          background: var(--bg-hover, #f9f9f9);
        }

        .ebay-import-item input[type="checkbox"] {
          flex-shrink: 0;
          margin-top: 2px;
          cursor: pointer;
        }

        .item-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .item-content strong {
          font-weight: 600;
          color: var(--text-primary, #333);
        }

        .item-details {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: var(--text-muted, #666);
        }

        .item-details span {
          white-space: nowrap;
        }

        .ebay-import-pagination {
          display: flex;
          gap: 8px;
          margin: 20px 0;
          justify-content: center;
        }

        .ebay-import-pagination button {
          padding: 8px 16px;
        }

        .ebay-import-actions {
          margin: 20px 0;
          display: flex;
          gap: 8px;
          justify-content: center;
        }

        .ebay-import-result {
          margin-top: 15px;
        }

        .banner {
          padding: 12px 16px;
          border-radius: 4px;
          margin: 12px 0;
          font-size: 14px;
        }

        .banner.success {
          background: #e8f5e9;
          border-left: 4px solid #4caf50;
          color: #1b5e20;
        }

        .banner.error {
          background: #ffebee;
          border-left: 4px solid #f44336;
          color: #b71c1c;
        }

        .banner.warning {
          background: #fff3e0;
          border-left: 4px solid #ff9800;
          color: #e65100;
        }

        .banner.info {
          background: #e3f2fd;
          border-left: 4px solid #2196f3;
          color: #0d47a1;
        }

        .banner a {
          color: inherit;
          text-decoration: underline;
          font-weight: 600;
        }

        .muted {
          color: var(--text-muted, #666);
        }
      `}</style>
    </section>
  );
}
