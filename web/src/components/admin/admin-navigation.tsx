"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/signout-button";

const navLinks = [
  { href: "/admin", label: "Catalogs" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/", label: "Home" },
];

export function AdminNavigation() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/catalogs");
    if (href === "/admin/orders") return pathname.startsWith("/admin/orders");
    return false;
  }

  return (
    <>
      {/* Desktop top bar */}
      <nav className="admin-nav-desktop">
        <span className="admin-nav-desktop__brand">Bloom Admin</span>
        <div className="admin-nav-desktop__links">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`admin-nav-desktop__link${isActive(link.href) ? " admin-nav-desktop__link--active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <SignOutButton />
      </nav>

      {/* Mobile bottom tabs */}
      <nav className="admin-nav-mobile">
        <Link
          href="/admin"
          className={`admin-nav-mobile__tab${isActive("/admin") ? " admin-nav-mobile__tab--active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
          <span>Catalogs</span>
        </Link>
        <Link
          href="/admin/orders"
          className={`admin-nav-mobile__tab${isActive("/admin/orders") ? " admin-nav-mobile__tab--active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>Orders</span>
        </Link>
        <Link
          href="/"
          className="admin-nav-mobile__tab"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Home</span>
        </Link>
      </nav>
    </>
  );
}
