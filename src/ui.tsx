import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { money } from './domain'
export function Field({ label, value, change, type = 'text', placeholder, required, list }: {
  label: string; value: string; change: (value: string) => void; type?: string; placeholder?: string; required?: boolean; list?: string
}) {
  return <label className="field">{label}<input value={value} onChange={e => change(e.target.value)} type={type} placeholder={placeholder} required={required} list={list} /></label>
}
export function MoneyField({ label, value, change }: { label: string; value: number; change: (value: number) => void }) {
  const [raw, setRaw] = useState<string | null>(null)
  return <label className="field">{label}<span className="money-input"><span aria-hidden="true">R$</span><input aria-label={label} inputMode="decimal" value={raw ?? (value / 100).toFixed(2).replace('.', ',')} onChange={e => {
    const next = e.target.value
    if (!/^\d{0,10}([,.]\d{0,2})?$/.test(next)) return
    setRaw(next)
    change(Math.round((Number(next.replace(',', '.')) || 0) * 100))
  }} onBlur={() => setRaw(null)} /></span></label>
}
export function Qty({ value, change }: { value: number; change: (value: number) => void }) {
  return <label className="field">Quantidade<input type="number" min="0.001" step="0.001" value={value || ''} onChange={e => change(Number(e.target.value))} /></label>
}
export function Select({ label, value, options, change }: { label: string; value: string; options: { value: string; label: string }[]; change: (value: string) => void }) {
  return <label className="field">{label}<select value={value} onChange={e => change(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
}
export const options = (values: readonly string[]) => values.map(value => ({ value, label: value }))
export function Amount({ value }: { value: number }) {
  return <span className={value < 0 ? 'red' : value > 0 ? 'green' : ''}>{money(value)}</span>
}
export function Modal({ title, close, children, busy = false }: { title: string; close: () => void; children: ReactNode; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) close() }} onClick={e => { if (!busy && e.target === dialog.current) close() }}>
    <div className="dialog-inner"><div className="section-head"><h2>{title}</h2><button className="icon-button" aria-label="Fechar" disabled={busy} onClick={close}><X size={19} /></button></div><fieldset className="modal-fields" disabled={busy}>{children}</fieldset></div>
  </dialog>
}
export function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}
