import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="container grid">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <Image src="/logo.png" alt="Bloom" width={150} height={85} priority style={{ height: 'auto' }} />
        </div>
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

