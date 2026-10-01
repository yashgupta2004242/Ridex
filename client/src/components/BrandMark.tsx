export function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <p className={`font-display text-sm tracking-[0.18em] ${light ? 'text-white/90' : 'text-milestone'}`}>
      RideX
    </p>
  );
}
