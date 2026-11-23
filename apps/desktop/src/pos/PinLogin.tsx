import { useState } from 'react';

export function PinLogin({
  onUnlock,
  onFullLogin,
  msg,
}: {
  onUnlock: (pin: string) => Promise<boolean>;
  onFullLogin: () => void;
  msg?: string;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (pin.length < 4) {
      setErr('Enter 4–6 digit PIN');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const ok = await onUnlock(pin);
      if (!ok) setErr('Incorrect PIN');
      else setPin('');
    } finally {
      setBusy(false);
    }
  }

  function digit(d: string) {
    setPin((p) => (p.length >= 6 ? p : p + d));
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 p-6">
      <h2 className="text-xl font-bold" style={{ color: 'var(--rs-ink)' }}>
        Cashier PIN
      </h2>
      <p className="text-center text-sm" style={{ color: 'var(--rs-muted)' }}>
        Enter your counter PIN to unlock POS. Full login is only needed once per device.
      </p>
      <div
        className="flex h-12 w-full items-center justify-center rounded-xl font-mono text-2xl tracking-[0.4em]"
        style={{
          background: 'var(--rs-surface-2)',
          border: '1px solid var(--rs-border)',
          color: 'var(--rs-ink)',
        }}
      >
        {'•'.repeat(pin.length) || '····'}
      </div>
      <div className="grid w-full grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) => (
          <button
            key={k}
            type="button"
            className="rs-btn-ghost min-h-12 text-lg font-semibold"
            disabled={busy}
            onClick={() => {
              if (k === '⌫') setPin((p) => p.slice(0, -1));
              else if (k === 'OK') void submit();
              else digit(k);
            }}
          >
            {k}
          </button>
        ))}
      </div>
      {err || msg ? (
        <p className="text-sm" style={{ color: err ? '#b91c1c' : 'var(--rs-muted)' }}>
          {err || msg}
        </p>
      ) : null}
      <button type="button" className="text-sm underline" style={{ color: 'var(--rs-accent)' }} onClick={onFullLogin}>
        Use email / password instead
      </button>
    </div>
  );
}
