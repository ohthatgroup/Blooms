import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Bloom Catalog Ordering App</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          Upload catalog PDFs, parse products with images, publish versions, and
          share customer-specific order links.
        </p>
      </div>

      <div className="card grid">
        <h2 style={{ margin: 0 }}>Navigation</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/login" className="button secondary">
            Admin Login
          </Link>
          <Link href="/admin" className="button">
            Admin Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

