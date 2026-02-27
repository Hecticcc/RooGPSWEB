'use client';

import { useState, useId } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { User, MapPin, Mail, Package, Smartphone, Check, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Logo from '@/components/Logo';

const MIN_PASSWORD_LENGTH = 6;
const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export default function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/track';
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('Australia');

  const [mobile, setMobile] = useState('');

  const firstNameId = useId();
  const lastNameId = useId();
  const dobId = useId();
  const emailId = useId();
  const pwId = useId();
  const confirmPwId = useId();
  const addr1Id = useId();
  const addr2Id = useId();
  const suburbId = useId();
  const stateId = useId();
  const postcodeId = useId();
  const countryId = useId();
  const mobileId = useId();

  const passwordsMatch = password === confirmPassword && confirmPassword.length >= MIN_PASSWORD_LENGTH;
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const confirmTouched = confirmPassword.length > 0;
  const showPasswordMismatch = confirmTouched && !passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) {
      setError('Please enter your first name.');
      return;
    }
    if (!lastName.trim()) {
      setError('Please enter your last name.');
      return;
    }
    if (!dob.trim()) {
      setError('Please enter your date of birth.');
      return;
    }
    const trimmedEmail = normalizeEmail(email);
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }
    if (!addressLine1.trim()) {
      setError('Please enter your shipping address (line 1).');
      return;
    }
    if (!suburb.trim()) {
      setError('Please enter your suburb.');
      return;
    }
    if (!state.trim()) {
      setError('Please select your state.');
      return;
    }
    if (!postcode.trim()) {
      setError('Please enter your postcode.');
      return;
    }
    if (!country.trim()) {
      setError('Please enter your country.');
      return;
    }
    if (!mobile.trim()) {
      setError('Please enter your mobile number.');
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { emailRedirectTo: undefined },
    });
    if (signUpError) {
      setLoading(false);
      const msg = signUpError.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
        setError('An account with this email already exists. Sign in or use a different email.');
      } else {
        setError(signUpError.message);
      }
      return;
    }

    if (data?.user) {
      await supabase.from('user_roles').upsert(
        { user_id: data.user.id, role: 'customer' },
        { onConflict: 'user_id' }
      );
      const { error: profileError } = await supabase.from('profiles').insert({
        user_id: data.user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dob.trim() || null,
        mobile: mobile.trim(),
        address_line1: addressLine1.trim(),
        address_line2: addressLine2.trim() || null,
        suburb: suburb.trim(),
        state: state.trim(),
        postcode: postcode.trim(),
        country: country.trim(),
      });
      if (profileError) {
        console.warn('Profile insert failed (non-blocking):', profileError);
      }
    }

    setLoading(false);
    const safeRedirect = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/track';
    router.push(safeRedirect);
    router.refresh();
  }

  return (
    <main className="auth-page register-page">
      <div className="auth-card register-card">
        <div className="auth-card-inner register-card-inner">
          <div className="auth-card-logo">
            <Logo size={36} wide />
          </div>
          <div className="auth-card-title-wrap">
            <MapPin className="auth-card-title-icon" size={26} strokeWidth={2} />
            <h1 className="auth-card-title">Create account</h1>
          </div>
          <form onSubmit={handleSubmit} className="auth-form register-form">
            <div className="register-sections-wrap">
            {/* Personal details – above Account */}
            <section className="register-section register-section-personal" aria-labelledby="register-personal-heading">
              <h2 id="register-personal-heading" className="register-section-heading">
                <User size={18} aria-hidden /> Your details
              </h2>
              <div className="register-section-fields">
                <div className="auth-field">
                  <label className="auth-label" htmlFor={firstNameId}>First name</label>
                  <input
                    id={firstNameId}
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    className="auth-input"
                    placeholder="First name"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor={lastNameId}>Last name</label>
                  <input
                    id={lastNameId}
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    className="auth-input"
                    placeholder="Last name"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor={dobId}>Date of birth</label>
                  <input
                    id={dobId}
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    autoComplete="bday"
                    className="auth-input"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </section>

            {/* Account */}
            <section className="register-section register-section-account" aria-labelledby="register-account-heading">
              <h2 id="register-account-heading" className="register-section-heading">
                <Mail size={18} aria-hidden /> Account
              </h2>
              <div className="register-section-fields">
              <div className="auth-field">
                <label className="auth-label" htmlFor={emailId}>Email address</label>
                <input
                  id={emailId}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  disabled={loading}
                />
                <p className="register-hint">One account per email. We&apos;ll use this to sign you in.</p>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor={pwId}>Password</label>
                <input
                  id={pwId}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  className={`auth-input ${!passwordLongEnough && password.length > 0 ? 'auth-input--error' : ''}`}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  disabled={loading}
                />
                {password.length > 0 && (
                  <p className={`register-feedback ${passwordLongEnough ? 'register-feedback--success' : 'register-feedback--error'}`}>
                    {passwordLongEnough ? <Check size={14} /> : <AlertCircle size={14} />}
                    {passwordLongEnough ? 'Password length OK' : `Use at least ${MIN_PASSWORD_LENGTH} characters`}
                  </p>
                )}
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor={confirmPwId}>Confirm password</label>
                <input
                  id={confirmPwId}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  className={`auth-input ${showPasswordMismatch ? 'auth-input--error' : ''} ${passwordsMatch ? 'auth-input--success' : ''}`}
                  placeholder="Re-enter password"
                  disabled={loading}
                />
                {confirmTouched && (
                  <p className={`register-feedback ${passwordsMatch ? 'register-feedback--success' : 'register-feedback--error'}`}>
                    {passwordsMatch ? <Check size={14} /> : <AlertCircle size={14} />}
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                )}
              </div>
              </div>
            </section>

            {/* Shipping */}
            <section className="register-section register-section-shipping" aria-labelledby="register-shipping-heading">
              <h2 id="register-shipping-heading" className="register-section-heading">
                <Package size={18} aria-hidden /> Shipping address
              </h2>
              <div className="register-section-fields">
              <div className="register-address-grid">
                <div className="auth-field register-field-full">
                  <label className="auth-label" htmlFor={addr1Id}>Address line 1</label>
                  <input
                    id={addr1Id}
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    autoComplete="address-line1"
                    className="auth-input"
                    placeholder="Street number and name"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="auth-field register-field-full">
                  <label className="auth-label" htmlFor={addr2Id}>Address line 2 <span className="register-optional">(optional)</span></label>
                  <input
                    id={addr2Id}
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    autoComplete="address-line2"
                    className="auth-input"
                    placeholder="Unit, building, etc."
                    disabled={loading}
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor={suburbId}>Suburb</label>
                  <input
                    id={suburbId}
                    type="text"
                    value={suburb}
                    onChange={(e) => setSuburb(e.target.value)}
                    autoComplete="address-level2"
                    className="auth-input"
                    placeholder="Suburb"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor={stateId}>State</label>
                  <select
                    id={stateId}
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    autoComplete="address-level1"
                    className="auth-input register-select"
                    required
                    disabled={loading}
                  >
                    <option value="">Select state</option>
                    {AU_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor={postcodeId}>Postcode</label>
                  <input
                    id={postcodeId}
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    autoComplete="postal-code"
                    className="auth-input"
                    placeholder="e.g. 3000"
                    required
                    disabled={loading}
                    inputMode="numeric"
                  />
                </div>
                <div className="auth-field register-field-full">
                  <label className="auth-label" htmlFor={countryId}>Country</label>
                  <input
                    id={countryId}
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    autoComplete="country-name"
                    className="auth-input"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              </div>
            </section>

            {/* Contact */}
            <section className="register-section register-section-contact" aria-labelledby="register-contact-heading">
              <h2 id="register-contact-heading" className="register-section-heading">
                <Smartphone size={18} aria-hidden /> Mobile number
              </h2>
              <div className="register-section-fields">
              <div className="auth-field">
                <label className="auth-label" htmlFor={mobileId}>Phone</label>
                <input
                  id={mobileId}
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  autoComplete="tel"
                  className="auth-input"
                  placeholder="e.g. 0412 345 678"
                  required
                  disabled={loading}
                />
              </div>
              </div>
            </section>

            </div>

            {error && (
              <div className="auth-error register-error" role="alert">
                <AlertCircle size={18} aria-hidden />
                {error}
              </div>
            )}

            <div className="register-actions">
              <button type="submit" disabled={loading} className="auth-submit register-submit">
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>

          <p className="auth-card-footer">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
