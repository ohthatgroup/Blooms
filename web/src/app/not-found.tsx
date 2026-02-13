import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container grid">
      <div className="card">
        <h1>Page not found</h1>
        <p className="muted">
          This customer link may be invalid, disabled, or tied to an unpublished catalog.
        </p>
        <Link href="/">Return home</Link>
      </div>
    </div>
  );
}

