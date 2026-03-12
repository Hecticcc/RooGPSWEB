'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { href: '#benefits', label: 'Benefits' },
  { href: '#features', label: 'Features' },
  { href: '#why-choose', label: 'Why RooGPS' },
  { href: '#pricing', label: 'Pricing' },
];

const LOGO_SIZE_DESKTOP = 40;
const LOGO_SIZE_MOBILE = 28;
const MOBILE_BREAKPOINT = 768;

export default function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoSize, setLogoSize] = useState(LOGO_SIZE_DESKTOP);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const updateLogoSize = () => {
      setLogoSize(window.innerWidth <= MOBILE_BREAKPOINT ? LOGO_SIZE_MOBILE : LOGO_SIZE_DESKTOP);
    };
    updateLogoSize();
    window.addEventListener('resize', updateLogoSize);
    return () => window.removeEventListener('resize', updateLogoSize);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handleResize = () => { if (window.innerWidth > 768) setMenuOpen(false); };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };

    // Close when tapping/clicking anywhere outside the nav panel
    // Ignore the toggle button itself — it handles open/close via onClick
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (toggleRef.current?.contains(target)) return;
      if (navRef.current && !navRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [menuOpen]);

  return (
    <header className="marketing-header">
      <div className="marketing-header-inner">
        <Link href="/" className="marketing-logo" aria-label="RooGPS home">
          <Logo size={logoSize} wide />
        </Link>
        <nav className="marketing-nav marketing-nav--desktop" aria-label="Main">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href}>{label}</a>
          ))}
          <a href="https://status.roogps.com" target="_blank" rel="noopener noreferrer" className="marketing-nav-status">Status</a>
          <Link href="/login" className="marketing-cta-header">Dashboard</Link>
        </nav>
        <button
          ref={toggleRef}
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
        <nav ref={navRef} className="marketing-nav-mobile" onClick={(e) => e.stopPropagation()}>
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
          ))}
          <a href="https://status.roogps.com" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>Status</a>
          <Link href="/login" className="marketing-cta-header" onClick={() => setMenuOpen(false)}>
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
