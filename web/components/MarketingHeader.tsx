'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';
import { Menu, X } from 'lucide-react';

const LOGO_SIZE_DESKTOP = 40;
const LOGO_SIZE_MOBILE = 28;
const MOBILE_BREAKPOINT = 768;

// Nav links per page context
// On the homepage we use anchor links; everywhere else we use full page links
function useNavLinks() {
  const pathname = usePathname();
  const isHome = pathname === '/';

  if (isHome) {
    return [
      { href: '#benefits',   label: 'Benefits',        isAnchor: true },
      { href: '#features',   label: 'Features',        isAnchor: true },
      { href: '#why-choose', label: 'Why RooGPS',      isAnchor: true },
      { href: '#pricing',    label: 'Pricing',         isAnchor: true },
      { href: '/theft-stats',label: 'Theft Stats',     isAnchor: false },
      { href: '/support',    label: 'Support',         isAnchor: false },
    ];
  }

  return [
    { href: '/',            label: 'Home',        isAnchor: false },
    { href: '/order',       label: 'Buy Tracker', isAnchor: false },
    { href: '/features',    label: 'Features',    isAnchor: false },
    { href: '/theft-stats', label: 'Theft Stats', isAnchor: false },
    { href: '/support',     label: 'Support',     isAnchor: false },
  ];
}

export default function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoSize, setLogoSize] = useState(LOGO_SIZE_DESKTOP);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const navLinks = useNavLinks();

  useEffect(() => {
    const updateLogoSize = () => {
      setLogoSize(window.innerWidth <= MOBILE_BREAKPOINT ? LOGO_SIZE_MOBILE : LOGO_SIZE_DESKTOP);
    };
    updateLogoSize();
    window.addEventListener('resize', updateLogoSize);
    return () => window.removeEventListener('resize', updateLogoSize);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleResize = () => { if (window.innerWidth > 768) setMenuOpen(false); };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };

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

  const renderLink = (
    { href, label, isAnchor }: { href: string; label: string; isAnchor: boolean },
    onClick?: () => void,
  ) => {
    const isActive = !isAnchor && pathname === href;
    const className = isActive ? 'marketing-nav-link--active' : undefined;

    if (isAnchor) {
      return (
        <a key={href} href={href} className={className} onClick={onClick}>
          {label}
        </a>
      );
    }
    return (
      <Link key={href} href={href} className={className} onClick={onClick}>
        {label}
      </Link>
    );
  };

  return (
    <header className="marketing-header">
      <div className="marketing-header-inner">
        <Link href="/" className="marketing-logo" aria-label="RooGPS home">
          <Logo size={logoSize} wide />
        </Link>
        <nav className="marketing-nav marketing-nav--desktop" aria-label="Main">
          {navLinks.map((link) => renderLink(link))}
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
          {navLinks.map((link) => renderLink(link, () => setMenuOpen(false)))}
          <Link href="/login" className="marketing-cta-header" onClick={() => setMenuOpen(false)}>
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
