import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../app/store';
import {
  useGetDriverMeQuery,
  useOnboardDriverMutation,
  useSetDriverOnlineMutation,
  useUploadDriverDocumentMutation,
} from '../api';

const DOC_SLOTS = [
  {
    type: 'license' as const,
    caption: 'Your driving license',
    hint: 'Click to upload ID proof',
  },
  {
    type: 'registration' as const,
    caption: 'Your vehicle number plate',
    hint: 'Click to upload plate photo',
  },
  {
    type: 'selfie' as const,
    caption: 'Your face photo',
    hint: 'Click to upload a selfie',
  },
];

type DocType = (typeof DOC_SLOTS)[number]['type'];

export function DriverOnboardingPage() {
  const user = useSelector((state: RootState) => state.session.user);
  const { data, isError, refetch } = useGetDriverMeQuery(undefined, {
    skip: user?.role !== 'driver',
    refetchOnMountOrArgChange: true,
  });
  const [onboard, { isLoading }] = useOnboardDriverMutation();
  const [uploadDoc, { isLoading: uploading }] = useUploadDriverDocumentMutation();
  const [setOnline] = useSetDriverOnlineMutation();
  const [licenseNumber, setLicenseNumber] = useState('');
  const [model, setModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [type, setType] = useState<'bike' | 'auto' | 'sedan' | 'suv'>('sedan');
  const [previews, setPreviews] = useState<Partial<Record<DocType, string>>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyType, setBusyType] = useState<DocType | null>(null);

  const driver = data?.driver;

  useEffect(() => {
    if (!driver) return;
    if (driver.licenseNumber) setLicenseNumber(driver.licenseNumber);
    if (driver.vehicle.model) setModel(driver.vehicle.model);
    if (driver.vehicle.plateNumber) setPlateNumber(driver.vehicle.plateNumber);
    if (driver.vehicle.type) setType(driver.vehicle.type);
  }, [driver]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'driver') return <Navigate to="/" replace />;

  const blocked = isError;
  const approved = driver?.verificationStatus === 'approved';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await onboard({
      licenseNumber,
      vehicle: { type, model, plateNumber },
    }).unwrap();
    await refetch();
  }

  async function onPick(slot: DocType, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadError(null);
    setBusyType(slot);
    try {
      const dataUri = await readImageAsDataUri(file);
      setPreviews((current) => ({ ...current, [slot]: dataUri }));
      await uploadDoc({ type: slot, dataUri }).unwrap();
      await refetch();
    } catch {
      setUploadError('Upload failed. Use a JPEG or PNG under 2 MB.');
    } finally {
      setBusyType(null);
    }
  }

  return (
    <main className="flex min-h-screen bg-paper">
      <div className="w-1 shrink-0 bg-ink" aria-hidden="true" />
      <section className="w-full max-w-md shrink-0 p-6">
        <p className="font-display text-sm text-milestone">Driver</p>
        <h1 className="mt-4 font-display text-3xl font-semibold">Onboarding</h1>
        <p className="mt-2">
          Status:{' '}
          <strong>{driver?.verificationStatus ?? (blocked ? 'unavailable' : 'loading')}</strong>
          {driver?.rejectionReason ? ` — ${driver.rejectionReason}` : ''}
        </p>
        <form className="mt-8 space-y-4" onSubmit={(event) => void onSubmit(event)}>
          <label className="block">
            <span className="text-sm">License number</span>
            <input
              className="mt-1 w-full rounded-input border border-kerb bg-surface px-3 py-2"
              value={licenseNumber}
              onChange={(event) => setLicenseNumber(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm">Vehicle</span>
            <select
              className="mt-1 w-full rounded-input border border-kerb bg-surface px-3 py-2"
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
            >
              <option value="bike">Bike</option>
              <option value="auto">Auto</option>
              <option value="sedan">Sedan</option>
              <option value="suv">SUV</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm">Model</span>
            <input
              className="mt-1 w-full rounded-input border border-kerb bg-surface px-3 py-2"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm">Plate number</span>
            <input
              className="mt-1 w-full rounded-input border border-kerb bg-surface px-3 py-2"
              value={plateNumber}
              onChange={(event) => setPlateNumber(event.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-action bg-milestone px-6 py-4 text-left font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)]"
          >
            Save vehicle
          </button>
        </form>
        {uploadError ? <p className="mt-3 text-signal">{uploadError}</p> : null}
        {approved ? (
          <button
            type="button"
            className="mt-6 min-h-14 w-full rounded-action border border-kerb bg-surface px-6 text-left text-lg"
            onClick={() => void setOnline({ isOnline: !(driver?.isOnline ?? false) })}
          >
            {driver?.isOnline ? 'Go offline' : 'Go online'}
          </button>
        ) : (
          <p className="mt-6">You can go online after an admin approves your documents.</p>
        )}
        <p className="mt-4 flex flex-col gap-2">
          <Link to="/drive">Driver home</Link>
          <Link to="/">Back home</Link>
        </p>
      </section>
      <aside className="min-h-screen flex-1 bg-surface p-6">
        <p className="font-display text-sm text-milestone">Documents</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Upload photos</h2>
        <p className="mt-2 max-w-xl text-sm text-ink/60">Tap a card to choose a photo. It appears here after upload.</p>
        <div className="mt-6 grid gap-5">
          {DOC_SLOTS.map((slot) => (
            <PhotoCard
              key={slot.type}
              caption={slot.caption}
              hint={slot.hint}
              busy={busyType === slot.type}
              disabled={uploading}
              src={
                previews[slot.type] ??
                driver?.documents.find((doc) => doc.type === slot.type && isDisplayableUrl(doc.url))?.url
              }
              onPick={(event) => void onPick(slot.type, event)}
            />
          ))}
        </div>
      </aside>
    </main>
  );
}

function PhotoCard({
  caption,
  hint,
  src,
  busy,
  disabled,
  onPick,
}: {
  caption: string;
  hint: string;
  src?: string;
  busy: boolean;
  disabled: boolean;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputId = useId();
  const [failed, setFailed] = useState(false);
  const show = Boolean(src) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <label
      htmlFor={inputId}
      className={`block cursor-pointer overflow-hidden rounded-card border border-kerb bg-paper ${
        disabled ? 'pointer-events-none opacity-70' : ''
      }`}
    >
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept="image/*"
        disabled={disabled}
        onChange={onPick}
      />
      {show ? (
        <img
          src={src}
          alt={caption}
          className="h-56 w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-56 flex-col items-center justify-center gap-1 bg-paper px-4 text-center">
          <p className="text-sm text-ink/45">{busy ? 'Uploading…' : 'No photo yet'}</p>
          <p className="text-sm text-milestone">{hint}</p>
        </div>
      )}
      <span className="block px-4 py-3 font-display text-lg">{caption}</span>
    </label>
  );
}

function isDisplayableUrl(url: string): boolean {
  if (url.startsWith('data:image/')) return true;
  if (url.includes('cdn.ridex.test')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

function readImageAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.onload = () => {
      const raw = String(reader.result);
      if (file.size <= 1_400_000 && raw.startsWith('data:image/')) {
        resolve(raw);
        return;
      }
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not compress the image'));
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.onerror = () => reject(new Error('Could not compress the image'));
      image.src = raw;
    };
    reader.readAsDataURL(file);
  });
}
