import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, Navigate } from 'react-router-dom';
import type { RootState } from '../../app/store';
import { useUpdateProfileMutation, useUploadAvatarMutation } from '../api';
import { setSession } from '../auth/sessionSlice';

export function ProfilePage() {
  const session = useSelector((state: RootState) => state.session);
  const [name, setName] = useState(session.user?.name ?? '');
  const [phone, setPhone] = useState(session.user?.phone ?? '');
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [uploadAvatar] = useUploadAvatarMutation();
  const dispatch = useDispatch();

  if (!session.user || !session.accessToken) {
    return <Navigate to="/login" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session.accessToken || !session.user) return;
    const result = await updateProfile({ name, phone }).unwrap();
    dispatch(setSession({ accessToken: session.accessToken, user: result.user }));
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !session.accessToken || !session.user) return;
    const dataUri = await readAsDataUri(file);
    const result = await uploadAvatar({ dataUri }).unwrap();
    dispatch(setSession({ accessToken: session.accessToken, user: result.user }));
  }

  return (
    <main className="flex min-h-screen bg-paper">
      <div className="w-1 bg-ink" aria-hidden="true" />
      <section className="flex-1 p-6">
        <p className="font-display text-sm text-milestone">RideX</p>
        <h1 className="mt-4 font-display text-3xl font-semibold">Your profile</h1>
        <form className="mt-8 max-w-sm space-y-4" onSubmit={(event) => void onSubmit(event)}>
          <label className="block">
            <span className="text-sm">Name</span>
            <input
              className="mt-1 w-full rounded-input border border-kerb bg-surface px-3 py-2 focus:ring-2 focus:ring-milestone"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm">Phone</span>
            <span className="mt-0.5 block text-sm text-ink/60">10-digit mobile is fine — we store +91</span>
            <input
              className="mt-1 w-full rounded-input border border-kerb bg-surface px-3 py-2 focus:ring-2 focus:ring-milestone"
              inputMode="numeric"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm">Photo</span>
            <input className="mt-1 block" type="file" accept="image/*" onChange={(event) => void onFile(event)} />
          </label>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-action bg-milestone px-6 py-4 text-left font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)]"
          >
            Save profile
          </button>
        </form>
        <p className="mt-4">
          <Link to="/">Back home</Link>
        </p>
      </section>
    </main>
  );
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.readAsDataURL(file);
  });
}
