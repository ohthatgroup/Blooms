"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/signout-button";

const navLinks = [
  { href: "/admin", label: "Catalogs" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/deals", label: "Deals" },
];

export function AdminNavigation() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/catalogs");
    if (href === "/admin/orders") return pathname.startsWith("/admin/orders");
    if (href === "/admin/deals") return pathname.startsWith("/admin/deals");
    return false;
  }

  return (
    <>
      {/* Desktop top bar */}
      <nav className="admin-nav-desktop">
        <Link href="/admin" className="admin-nav-desktop__brand">
          <Image src="/logo.png" alt="Bloom" width={120} height={68} priority style={{ height: 'auto' }} />
        </Link>
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
          href="/admin/deals"
          className={`admin-nav-mobile__tab${isActive("/admin/deals") ? " admin-nav-mobile__tab--active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-6 9 6-9 6-9-6z" />
            <path d="M9 22V12l6-3v10" />
            <path d="M3 13l9 6 9-6" />
          </svg>
          <span>Deals</span>
        </Link>
      </nav>
    </>
  );
}
