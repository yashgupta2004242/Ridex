import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../app/store';
import { useChatSupportMutation, useConfirmSupportMutation } from '../api';

export function SupportPage() {
  const user = useSelector((state: RootState) => state.session.user);
  const [chat, { data }] = useChatSupportMutation();
  const [confirm] = useConfirmSupportMutation();
  const [text, setText] = useState('');
  if (!user) return <Navigate to="/login" replace />;
  return (
    <main className="flex min-h-screen bg-paper">
      <div className="w-1 bg-ink" />
      <section className="flex-1 p-6">
        <p className="font-display text-sm text-milestone">Support</p>
        <h1 className="mt-4 font-display text-3xl font-semibold">Ask RideX</h1>
        <p className="mt-2 max-w-lg">The model can only propose tools. Cancel and refund wait for an explicit confirm.</p>
        <form
          className="mt-6 max-w-md space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void chat({ messages: [{ role: 'user', content: text }] });
          }}
        >
          <textarea
            className="w-full rounded-input border border-kerb p-3"
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Where is my receipt?"
          />
          <button
            type="submit"
            className="rounded-action bg-milestone px-6 py-4 font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)]"
          >
            Send
          </button>
        </form>
        {data ? <p className="mt-6 max-w-md">{data.reply}</p> : null}
        {data?.pending ? (
          <button
            type="button"
            className="mt-2 text-signal"
            onClick={() => void confirm({ tool: data.pending!.tool, args: { ...data.pending!.args, confirm: true } })}
          >
            Confirm {data.pending.tool}
          </button>
        ) : null}
        <p className="mt-8">
          <Link to="/">Home</Link>
        </p>
      </section>
    </main>
  );
}
