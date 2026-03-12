'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

// Matches Australian unit prefix formats: "2/", "3A/", "U2/", "Unit 2 " etc.
// We strip it before querying Mapbox (which doesn't understand it) and re-attach on select.
const UNIT_PREFIX_RE = /^((?:unit\s+|u)?\d+[a-z]?\/\s*|\d+[a-z]?\/\s*)/i;

function extractUnitPrefix(input: string): { unit: string; rest: string } {
  const match = input.match(UNIT_PREFIX_RE);
  if (match) {
    return { unit: match[0], rest: input.slice(match[0].length) };
  }
  return { unit: '', rest: input };
}

// Maps Mapbox short_code (e.g. "AU-VIC") to AU state abbreviation
const AU_STATE_MAP: Record<string, string> = {
  'AU-ACT': 'ACT',
  'AU-NSW': 'NSW',
  'AU-NT': 'NT',
  'AU-QLD': 'QLD',
  'AU-SA': 'SA',
  'AU-TAS': 'TAS',
  'AU-VIC': 'VIC',
  'AU-WA': 'WA',
};

interface AddressParts {
  addressLine1: string;
  suburb: string;
  state: string;
  postcode: string;
}

interface Suggestion {
  id: string;
  placeName: string;
  parts: AddressParts;
}

interface MapboxFeature {
  id: string;
  place_name: string;
  text: string;
  address?: string;
  context?: { id: string; text: string; short_code?: string }[];
}

function parseFeature(feature: MapboxFeature): AddressParts {
  const ctx = feature.context ?? [];

  const postcodeCtx = ctx.find((c) => c.id.startsWith('postcode.'));
  const suburbCtx =
    ctx.find((c) => c.id.startsWith('locality.')) ??
    ctx.find((c) => c.id.startsWith('place.'));
  const regionCtx = ctx.find((c) => c.id.startsWith('region.'));

  const streetNum = feature.address ?? '';
  const streetName = feature.text ?? '';
  const addressLine1 = streetNum ? `${streetNum} ${streetName}` : streetName;

  const suburb = suburbCtx?.text ?? '';
  const stateAbbrev = regionCtx?.short_code
    ? (AU_STATE_MAP[regionCtx.short_code.toUpperCase()] ?? regionCtx.text)
    : '';
  const postcode = postcodeCtx?.text ?? '';

  return { addressLine1, suburb, state: stateAbbrev, postcode };
}

export interface AddressAutocompleteProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (parts: AddressParts) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

export default function AddressAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  disabled,
  className,
  placeholder = 'Start typing your address…',
  required,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    // Strip unit prefix before sending to Mapbox — it doesn't understand "2/144 ..."
    const { rest } = extractUnitPrefix(query);
    const searchQuery = rest.trim();
    if (!MAPBOX_TOKEN || searchQuery.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json`
      );
      url.searchParams.set('access_token', MAPBOX_TOKEN);
      url.searchParams.set('country', 'AU');
      url.searchParams.set('types', 'address');
      url.searchParams.set('autocomplete', 'true');
      url.searchParams.set('limit', '6');
      url.searchParams.set('language', 'en');

      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = (await res.json()) as { features?: MapboxFeature[] };
      const items: Suggestion[] = (data.features ?? []).map((f) => ({
        id: f.id,
        placeName: f.place_name,
        parts: parseFeature(f),
      }));
      setSuggestions(items);
      setOpen(items.length > 0);
      setActiveIdx(-1);
    } catch {
      // silently fail — the user can still type manually
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 280);
  }

  function handleSelect(s: Suggestion) {
    // Re-attach the unit prefix the user typed (e.g. "2/") to the resolved street address.
    // trimEnd() handles "2/ " → "2/" so the result is "2/144 Main St" not "2/ 144 Main St".
    const { unit } = extractUnitPrefix(value);
    const fullAddress = unit
      ? `${unit.trimEnd()}${s.parts.addressLine1}`
      : s.parts.addressLine1;
    const parts = { ...s.parts, addressLine1: fullAddress };
    onChange(fullAddress);
    onSelect(parts);
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // Close when clicking outside
  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  return (
    <div ref={wrapperRef} className="addr-autocomplete-wrap">
      <div className="addr-autocomplete-input-wrap">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={className}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="addr-suggestions-list"
          aria-activedescendant={activeIdx >= 0 ? `addr-suggestion-${activeIdx}` : undefined}
        />
        <span className="addr-autocomplete-icon" aria-hidden>
          {loading ? (
            <Loader2 size={14} className="addr-autocomplete-spinner" />
          ) : (
            <MapPin size={14} />
          )}
        </span>
      </div>

      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id="addr-suggestions-list"
          role="listbox"
          className="addr-suggestions-list"
          aria-label="Address suggestions"
        >
          {suggestions.map((s, idx) => (
            <li
              key={s.id}
              id={`addr-suggestion-${idx}`}
              role="option"
              aria-selected={idx === activeIdx}
              className={`addr-suggestion-item${idx === activeIdx ? ' addr-suggestion-item--active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on input
                handleSelect(s);
              }}
            >
              <MapPin size={12} className="addr-suggestion-pin" aria-hidden />
              <span className="addr-suggestion-text">{s.placeName}</span>
            </li>
          ))}
          <li className="addr-suggestion-footer" aria-hidden>
            Powered by Mapbox · Australia only
          </li>
        </ul>
      )}
    </div>
  );
}
