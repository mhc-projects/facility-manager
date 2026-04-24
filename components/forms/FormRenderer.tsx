'use client';

import { useState } from 'react';
import { FormFieldDefinition, DpfVehicle } from '@/types/dpf';

interface Props {
  fields: FormFieldDefinition[];
  vehicleData?: Partial<DpfVehicle>;
  vehicleFieldMap?: Record<string, string>;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}

export default function FormRenderer({ fields, vehicleData, vehicleFieldMap, values, onChange, readOnly }: Props) {
  return (
    <div className="space-y-4">
      {fields.map(field => {
        const autoValue = vehicleFieldMap?.[field.key] && vehicleData
          ? (vehicleData as Record<string, unknown>)[vehicleFieldMap[field.key]]
          : undefined;
        const value = values[field.key] ?? autoValue ?? '';
        const isAuto = autoValue != null && values[field.key] == null;

        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
              {isAuto && (
                <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">자동입력</span>
              )}
            </label>
            <FormField
              field={field}
              value={value as string}
              onChange={(v) => onChange(field.key, v)}
              readOnly={readOnly}
            />
          </div>
        );
      })}
    </div>
  );
}

function FormField({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FormFieldDefinition;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const baseClass = `w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
    focus:outline-none focus:ring-2 focus:ring-blue-500
    ${readOnly ? 'bg-gray-50 cursor-not-allowed' : ''}`;

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          readOnly={readOnly}
          className={baseClass}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className={baseClass}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          readOnly={readOnly}
          className={baseClass}
        />
      );

    case 'select':
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          className={baseClass}
        >
          <option value="">선택하세요</option>
          {(field.options ?? []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value === 'true' || value === true as unknown as string}
            onChange={(e) => onChange(String(e.target.checked))}
            disabled={readOnly}
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-600">{field.placeholder}</span>
        </div>
      );

    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          readOnly={readOnly}
          className={baseClass}
        />
      );
  }
}
