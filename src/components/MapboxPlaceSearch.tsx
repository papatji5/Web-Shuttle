import React, { useEffect, useRef, useState } from "react";

type Feature = {
  id: string;
  place_name: string;
  center: [number, number];
  text: string;
  properties?: Record<string, any>;
};

export default function MapboxPlaceSearch({
  onSelect,
  country = "za",
  placeholder = "Search places...",
}: {
  onSelect: (f: Feature) => void;
  country?: string;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(false);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      try {
        // Use our backend API which handles multiple geocoding services
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`, {
          signal: abortRef.current.signal,
        });
        const json = await res.json();
        setResults(json.features || []);
      } catch (err) {
        if ((err as any).name !== "AbortError") console.error(err);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <div className="relative w-full">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="Search places"
        className="w-full rounded border px-3 py-2 text-sm"
      />
      {loading && <div className="absolute right-2 top-3 text-sm">…</div>}
      {results.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded bg-white shadow">
          {results.map((f) => (
            <li
              key={f.id}
              className="cursor-pointer border-b px-3 py-2 hover:bg-slate-50"
              onClick={() => {
                setQ(f.place_name);
                setResults([]);
                onSelect(f);
              }}
            >
              <div className="text-sm font-medium">{f.text}</div>
              <div className="text-xs text-gray-500">{f.place_name}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
