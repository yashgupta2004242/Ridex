import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AuthLayout } from '../../components/AuthLayout';
import { PhoneField } from '../../components/PhoneField';
import { useRegisterMutation } from '../api';
import { setSession } from './sessionSlice';

const fieldClass =
  'mt-1.5 w-full rounded-input border border-kerb bg-surface px-3 py-3 outline-none transition focus:border-milestone focus:ring-2 focus:ring-milestone';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'rider' | 'driver'>('rider');
  const [register, { isLoading, error }] = useRegisterMutation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await register({ name, email, phone, password, role }).unwrap();
      dispatch(setSession(result));
      navigate(role === 'driver' ? '/drive' : '/estimate');
    } catch {
      return;
    }
  }

  const message =
    error && 'data' in error && error.data && typeof error.data === 'object' && 'error' in error.data
      ? String((error.data as { error?: { message?: string } }).error?.message ?? 'Could not create account')
      : error
        ? 'Could not create the account. Check the form and try again.'
        : null;

  return (
    <AuthLayout kicker="New on the road" title="Create an account">
      <form className="mt-8 space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            className={fieldClass}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <PhoneField value={phone} onChange={setPhone} />
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <span className="mt-0.5 block text-sm text-ink/60">At least 8 characters</span>
          <input
            className={fieldClass}
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">I am a</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'rider', label: 'Rider', hint: 'Book trips' },
                { id: 'driver', label: 'Driver', hint: 'Take trips' },
              ] as const
            ).map((option) => (
              <label
                key={option.id}
                className={`cursor-pointer rounded-card border px-4 py-3 transition ${
                  role === option.id ? 'border-milestone bg-milestone/10' : 'border-kerb bg-surface'
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="role"
                  value={option.id}
                  checked={role === option.id}
                  onChange={() => setRole(option.id)}
                />
                <span className="block font-display font-semibold">{option.label}</span>
                <span className="text-sm text-ink/60">{option.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {message ? <p className="text-signal">{message}</p> : null}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-action bg-milestone px-6 py-4 text-left font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)] transition hover:brightness-110 disabled:opacity-60"
        >
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-sm">
        Already registered?{' '}
        <Link className="font-medium text-milestone underline-offset-4 hover:underline" to="/login">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
