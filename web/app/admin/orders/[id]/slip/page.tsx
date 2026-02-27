'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useMemo, useEffect } from 'react';

const BODY_CLASS = 'slip-print-page';

export default function AdminOrderSlipPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params?.id as string;
  const orderNumber = searchParams?.get('order_number') ?? '';
  const code = searchParams?.get('code') ?? '';
  const orderDisplay = orderNumber.trim() || orderId;
  const activateUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/activate?code=${encodeURIComponent(code)}`;
  }, [code]);

  useEffect(() => {
    document.body.classList.add(BODY_CLASS);
    return () => document.body.classList.remove(BODY_CLASS);
  }, []);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="slip-print-wrap">
        <div className="slip-print">
          <div className="slip-print__inner">
            <div className="slip-print__logo">
              <img src="/LogoDark.png" alt="RooGPS" className="slip-print__logo-img" width={120} height={50} />
            </div>
            <h1 className="slip-print__title">Activation slip</h1>
            <p className="slip-print__subtitle">Use this code to activate your tracker after delivery.</p>

            <div className="slip-print__code-block">
              <span className="slip-print__code-label">Activation code</span>
              <span className="slip-print__code-value">{code || '—'}</span>
            </div>

            <div className="slip-print__steps">
              <p className="slip-print__steps-title">Steps</p>
              <ol className="slip-print__steps-list">
                <li>Go to the RooGPS website (www.roogps.com) and sign in.</li>
                <li>Open the <strong>Activate</strong> page.</li>
                <li>Enter the code above or scan the QR code.</li>
                <li>Your tracker will be linked to your account.</li>
              </ol>
            </div>

            {code && (
              <div className="slip-print__qr">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(activateUrl)}`}
                  alt="QR code for activation"
                  width={140}
                  height={140}
                  className="slip-print__qr-img"
                />
                <p className="slip-print__qr-caption">Scan to open activation page</p>
              </div>
            )}

            <p className="slip-print__order">Order: {orderDisplay}</p>
          </div>

          <div className="slip-no-print slip-print__actions">
            <button type="button" onClick={handlePrint} className="slip-print__btn">
              Print / Save as PDF
            </button>
          </div>
        </div>
    </div>
  );
}
