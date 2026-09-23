// DPF 등록/수정 모달 공용 폼 UI — 카드 섹션, 입력, 세그먼트, 토글, ⌘↵ 저장 훅 (접수이력·설치이력 등 모달이 공유)
'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, ChevronDown, type LucideIcon } from 'lucide-react';
import type { DpfVehicle } from '@/types/dpf';

export type VehicleSummaryType = Pick<DpfVehicle, 'plate_number' | 'vehicle_name' | 'owner_name'>;

// 모달 헤더 설명줄 — "차량번호 · 차명 · 계약자 · 차대번호", 차량 정보가 없으면 차대번호만
export function vehicleSummary(vin: string, vehicle?: VehicleSummaryType): string {
  const parts = [vehicle?.plate_number, vehicle?.vehicle_name, vehicle?.owner_name].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} · ${vin}` : vin;
}

// 모달이 열려 있는 동안 ⌘/Ctrl+Enter로 저장 — 최신 submit 함수를 ref로 참조
export function useCmdEnter(isOpen: boolean, onSubmit: () => void) {
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submitRef.current();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
}

// 회색 캔버스 위에 흰 카드 — Modal 본문 패딩만큼 음수 마진으로 배경을 채운다
export function FormCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-3 sm:-m-4 md:-m-6 min-h-full bg-gray-100/70 p-3 sm:p-4 md:p-6">
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// 모달 푸터 왼쪽 — 오류가 있으면 오류, 없으면 요약(children)
export function FooterStatus({ error, children }: { error?: string; children?: React.ReactNode }) {
  return (
    <div className="sm:mr-auto flex min-w-0 items-center gap-2 text-xs">
      {error ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </span>
      ) : children}
    </div>
  );
}

// ⌘↵ 단축키 표시(저장 버튼 안)
export function SubmitKbd() {
  return <kbd className="ml-2 hidden rounded bg-white/20 px-1.5 py-0.5 font-sans text-[10px] font-medium sm:inline">⌘↵</kbd>;
}

export type IconType = LucideIcon;

export const INPUT_CLASS =
  'block h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10';

export function Card({
  icon: Icon, title, description, badge, accent, collapsible, open = true, onToggle, filledCount = 0, children,
}: {
  icon: IconType; title: string; description?: string; badge?: string; accent?: boolean;
  collapsible?: boolean; open?: boolean; onToggle?: () => void; filledCount?: number;
  children: React.ReactNode;
}) {
  const header = (
    <>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold text-gray-900">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
      </span>
      {badge && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600">{badge}</span>}
      {collapsible && (
        <>
          {filledCount > 0 && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">{filledCount}개 입력됨</span>
          )}
          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </>
      )}
    </>
  );

  return (
    <section className={`rounded-xl border bg-white shadow-sm ${accent ? 'border-amber-200' : 'border-gray-200'}`}>
      {collapsible ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 sm:px-5">
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">{header}</div>
      )}
      {open && <div className={`px-4 pb-5 sm:px-5 ${collapsible ? 'pt-1' : 'pt-4'}`}>{children}</div>}
    </section>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-gray-700">{children}</label>;
}

export function TextInput({
  label, value, onChange, type = 'text', placeholder, suffix, step, hint,
}: {
  label: string; value: unknown; onChange: (v: string) => void; type?: string; placeholder?: string;
  suffix?: string; step?: string; hint?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          type={type}
          step={step}
          value={value != null ? String(value) : ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${INPUT_CLASS} ${suffix ? 'pr-9' : ''} ${type === 'number' ? 'tabular-nums' : ''}`}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-xs tabular-nums text-gray-500">{hint}</p>}
    </div>
  );
}

export function TextArea({
  label, value, onChange, hideLabel, placeholder, rows = 2,
}: {
  label: string; value: unknown; onChange: (v: string) => void; hideLabel?: boolean; placeholder?: string; rows?: number;
}) {
  return (
    <div>
      {!hideLabel && <FieldLabel>{label}</FieldLabel>}
      <textarea
        value={value != null ? String(value) : ''}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-label={hideLabel ? label : undefined}
        className={`${INPUT_CLASS} h-auto resize-y py-2.5 leading-relaxed`}
      />
    </div>
  );
}

export function SelectInput({
  label, value, onChange, options,
}: {
  label: string; value: unknown; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <select
          value={value != null ? String(value) : ''}
          onChange={e => onChange(e.target.value)}
          className={`${INPUT_CLASS} appearance-none pr-9`}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
    </div>
  );
}

export function Segmented({
  value, onChange, options,
}: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string; dot?: string }[];
}) {
  return (
    <div role="radiogroup" className="flex h-10 w-full rounded-lg bg-gray-100 p-1">
      {options.map(o => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium transition ${
              active ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {o.dot && <span className={`h-1.5 w-1.5 rounded-full ${active ? o.dot : 'bg-gray-300'}`} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ToggleChip({
  icon: Icon, label, tone, checked, onChange,
}: {
  icon: IconType; label: string; tone: 'red' | 'blue'; checked: boolean; onChange: (v: boolean) => void;
}) {
  const on = tone === 'red' ? 'border-red-300 bg-red-50 text-red-700' : 'border-blue-300 bg-blue-50 text-blue-700';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${
        checked ? on : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export function Switch({
  label, description, checked, onChange,
}: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 text-left">
      <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
      <span>
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {description && <span className="block text-xs text-gray-500">{description}</span>}
      </span>
    </button>
  );
}
