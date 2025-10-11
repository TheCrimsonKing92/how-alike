"use client";
import React from 'react';

export type BufferSettings = Partial<Record<'brows'|'eyes'|'mouth'|'nose'|'jaw', number>>;

export default function OverlayControls({ value, onChange }: { value: BufferSettings; onChange: (v: BufferSettings)=>void }) {
  const [open, setOpen] = React.useState(false);
  const v = (key: keyof BufferSettings, def: number) => (value[key] ?? def);
  const set = (key: keyof BufferSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onChange({ ...value, [key]: val });
  };
  return (
    <div className="text-sm">
      <button className="underline opacity-80" type="button" onClick={()=>setOpen(!open)}>
        {open ? 'Hide overlay tuning' : 'Show overlay tuning'}
      </button>
      {open && (
        <div className="grid gap-2 mt-2">
          <label className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
            <span className="opacity-80">Brows buffer</span>
            <input type="range" min={0} max={0.12} step={0.005} value={v('brows', 0.08)} onChange={set('brows')} />
            <span className="tabular-nums w-12 text-right">{(v('brows', 0.08)).toFixed(3)}</span>
          </label>
          <label className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
            <span className="opacity-80">Mouth buffer</span>
            <input type="range" min={0} max={0.08} step={0.005} value={v('mouth', 0.025)} onChange={set('mouth')} />
            <span className="tabular-nums w-12 text-right">{(v('mouth', 0.025)).toFixed(3)}</span>
          </label>
          <label className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
            <span className="opacity-80">Jaw buffer</span>
            <input type="range" min={0} max={0.05} step={0.002} value={v('jaw', 0.018)} onChange={set('jaw')} />
            <span className="tabular-nums w-12 text-right">{(v('jaw', 0.018)).toFixed(3)}</span>
          </label>
          <p className="opacity-70">Changes apply on next analysis.</p>
        </div>
      )}
    </div>
  );
}

