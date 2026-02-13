import Link from "next/link";

export function AdminNav() {
  return (
    <nav
      className="card"
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontWeight: 700 }}>Bloom Admin</div>
      <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
        <Link href="/admin">Catalogs</Link>
        <Link href="/admin/orders">Orders</Link>
        <Link href="/">Home</Link>
      </div>
    </nav>
  );
}
