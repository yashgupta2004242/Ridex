import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AuthLayout } from '../../components/AuthLayout';
import { useLoginMutation } from '../api';
import { setSession } from './sessionSlice';

const fieldClass =
  'mt-1.5 w-full rounded-input border border-kerb bg-surface px-3 py-3 outline-none transition focus:border-milestone focus:ring-2 focus:ring-milestone';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [login, { isLoading, error }] = useLoginMutation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await login({ email, password }).unwrap();
      dispatch(setSession(result));
      navigate(result.user.role === 'driver' ? '/drive' : '/');
    } catch {
      return;
    }
  }

  const message =
    error && 'data' in error && error.data && typeof error.data === 'object' && 'error' in error.data
      ? String((error.data as { error?: { message?: string } }).error?.message ?? 'Sign in failed')
      : error
        ? 'Sign in failed. Check your email and password.'
        : null;

  return (
    <AuthLayout kicker="Welcome back" title="Sign in">
      <p className="mt-3 max-w-md text-ink/70">Use the email you registered with. The password never sits in this tab.</p>
      <form className="mt-8 space-y-4" onSubmit={(event) => void onSubmit(event)}>
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
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            className={fieldClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {message ? <p className="text-signal">{message}</p> : null}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-action bg-milestone px-6 py-4 text-left font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)] transition hover:brightness-110 disabled:opacity-60"
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-sm">
        New here?{' '}
        <Link className="font-medium text-milestone underline-offset-4 hover:underline" to="/register">
          Create an account
        </Link>
      </p>
      <p className="mt-3 text-sm">
        <a className="text-ink/70 underline-offset-4 hover:underline" href="/api/auth/google">
          Continue with Google
        </a>
      </p>
    </AuthLayout>
  );
}
