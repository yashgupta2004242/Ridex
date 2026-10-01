import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useRefreshMutation } from '../api';
import { setSession } from './sessionSlice';

export function AuthCallbackPage() {
  const [refresh] = useRefreshMutation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const result = await refresh().unwrap();
        dispatch(setSession(result));
        navigate('/');
      } catch {
        navigate('/login');
      }
    })();
  }, [dispatch, navigate, refresh]);

  return (
    <main className="flex min-h-screen bg-paper">
      <div className="w-1 bg-milestone" aria-hidden="true" />
      <section className="p-6">
        <h1 className="font-display text-2xl">Finishing sign-in</h1>
        <p className="mt-2">We are exchanging the refresh cookie for a short-lived access token.</p>
      </section>
    </main>
  );
}
