'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { href: '#benefits', label: 'Benefits' },
  { href: '#features', label: 'Features' },
  { href: '#why-choose', label: 'Why RooGPS' },
  { href: '#pricing', label: 'Pricing' },
];

export default function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleResize = () => {
      if (window.innerWidth > 768) setMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="marketing-header">
      <div className="marketing-header-inner">
        <Link href="/" className="marketing-logo" aria-label="RooGPS home">
          <Logo size={40} wide />
        </Link>
        <nav className="marketing-nav marketing-nav--desktop" aria-label="Main">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href}>{label}</a>
          ))}
          <Link href="/login" className="marketing-cta-header">Dashboard</Link>
        </nav>
        <button
          type="button"
          className="marketing-nav-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X size={24} strokeWidth={2} /> : <Menu size={24} strokeWidth={2} />}
        </button>
      </div>
      <div
        className={`marketing-nav-overlay ${menuOpen ? 'marketing-nav-overlay--open' : ''}`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      >
        <nav className="marketing-nav-mobile" onClick={(e) => e.stopPropagation()}>
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
          ))}
          <Link href="/login" className="marketing-cta-header" onClick={() => setMenuOpen(false)}>
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
