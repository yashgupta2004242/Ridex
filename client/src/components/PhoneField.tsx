import { nationalDigits, toE164 } from '../lib/phone';

export function PhoneField({
  value,
  onChange,
  id = 'phone',
}: {
  value: string;
  onChange: (e164: string) => void;
  id?: string;
}) {
  const national = nationalDigits(value);

  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium">Mobile number</span>
      <span className="mt-0.5 block text-sm text-ink/60">India · we add +91 for you</span>
      <div className="mt-1.5 flex overflow-hidden rounded-input border border-kerb bg-surface focus-within:ring-2 focus-within:ring-milestone">
        <span className="flex items-center border-r border-kerb bg-paper px-3 font-display text-sm tabular text-ink/80">
          +91
        </span>
        <input
          id={id}
          className="w-full bg-transparent px-3 py-3 outline-none tabular"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          maxLength={10}
          minLength={10}
          value={national}
          onChange={(event) => onChange(toE164(event.target.value))}
          required
        />
      </div>
    </label>
  );
}
