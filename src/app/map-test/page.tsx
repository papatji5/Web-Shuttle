import MapboxTest from "@/components/MapboxTest";

export const metadata = { title: "Map Test" };

export default function Page() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-semibold">Map Test — pickup auto, dropoff click</h1>
      <p className="mb-4 text-sm text-slate-400">Add `NEXT_PUBLIC_MAPBOX_TOKEN` to `.env.local` and reload.</p>
      <MapboxTest />
    </div>
  );
}
