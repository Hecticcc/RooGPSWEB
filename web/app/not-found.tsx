import Link from 'next/link';

export const metadata = {
  title: 'Page Not Found — RooGPS',
  description: "The page you're looking for doesn't exist.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <div className="not-found-icon" aria-hidden>
          <span className="not-found-code">404</span>
        </div>
        <h1 className="not-found-title">Page not found</h1>
        <p className="not-found-text">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="not-found-actions">
          <Link href="/" className="not-found-btn not-found-btn--primary">
            Home
          </Link>
          <Link href="/track" className="not-found-btn">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
