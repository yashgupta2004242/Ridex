import { useEffect, useState } from 'react';
import { useLazyGeocodeQuery } from '../features/api';

export type Place = { label: string; lat: number; lng: number };

export function PlaceSearch({
  id,
  title,
  hint,
  value,
  onSelect,
}: {
  id: string;
  title: string;
  hint: string;
  value: Place | null;
  onSelect: (place: Place) => void;
}) {
  const [text, setText] = useState(value?.label ?? '');
  const [open, setOpen] = useState(false);
  const [search, result] = useLazyGeocodeQuery();

  useEffect(() => {
    setText(value?.label ?? '');
  }, [value?.label]);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2 || (value && q === value.label)) {
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void search(q);
      setOpen(true);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [text, value, search]);

  const places = result.data?.places ?? [];

  return (
    <label className="relative block" htmlFor={id}>
      <span className="text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-sm text-ink/60">{hint}</span>
      <input
        id={id}
        className="mt-1.5 w-full rounded-input border border-kerb bg-surface px-3 py-3 outline-none focus:ring-2 focus:ring-milestone"
        placeholder="Indore, Connaught Place, airport…"
        value={text}
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
        onFocus={() => {
          if (places.length) setOpen(true);
        }}
      />
      {open && places.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-card border border-kerb bg-surface shadow-[0_8px_24px_rgba(17,32,26,0.12)]">
          {places.map((place) => (
            <li key={`${place.lat}-${place.lng}-${place.label}`}>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-paper"
                onClick={() => {
                  onSelect(place);
                  setText(place.label);
                  setOpen(false);
                }}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && result.isFetching ? <p className="mt-1 text-sm text-ink/50">Searching the map…</p> : null}
    </label>
  );
}
