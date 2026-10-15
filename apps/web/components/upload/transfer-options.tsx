'use client';

import { LIMITS } from '@sendit/shared';
import { useId, useState } from 'react';
import { EyeIcon } from '@/components/ui/icons';
import { t } from '@/lib/i18n';

export interface TransferSettings {
  expiresInDays: number;
  /** Empty string = unlimited. */
  maxDownloads: string;
  password: string;
  title: string;
  message: string;
}

export const DEFAULT_SETTINGS: TransferSettings = {
  expiresInDays: LIMITS.defaultExpiryDays,
  maxDownloads: '',
  password: '',
  title: '',
  message: '',
};

export function settingsError(settings: TransferSettings): string | null {
  if (settings.password && settings.password.length < LIMITS.minPasswordLength) {
    return t.upload.passwordTooShort;
  }
  return null;
}

const inputClass =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-2 focus:outline-brand-500/30';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function TransferOptions({
  value,
  onChange,
  disabled,
}: {
  value: TransferSettings;
  onChange: (value: TransferSettings) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const set = <K extends keyof TransferSettings>(key: K, v: TransferSettings[K]) =>
    onChange({ ...value, [key]: v });
  const expiryChoices = Array.from(
    { length: LIMITS.maxExpiryDays - LIMITS.minExpiryDays + 1 },
    (_, i) => LIMITS.minExpiryDays + i,
  );

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <legend className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">
        {t.upload.options}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.upload.expiry} htmlFor={`${id}-expiry`}>
          <select
            id={`${id}-expiry`}
            value={value.expiresInDays}
            onChange={(e) => set('expiresInDays', Number(e.target.value))}
            className={inputClass}
          >
            {expiryChoices.map((days) => (
              <option key={days} value={days}>
                {t.upload.days(days)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.upload.maxDownloads} htmlFor={`${id}-max`}>
          <input
            id={`${id}-max`}
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.maxDownloadsCap}
            placeholder={t.upload.unlimited}
            value={value.maxDownloads}
            onChange={(e) => set('maxDownloads', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={t.upload.password} htmlFor={`${id}-password`}>
        <div className="relative">
          <input
            id={`${id}-password`}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            maxLength={LIMITS.maxPasswordLength}
            placeholder={t.upload.passwordPlaceholder}
            value={value.password}
            onChange={(e) => set('password', e.target.value)}
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? t.upload.hidePassword : t.upload.showPassword}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
          >
            <EyeIcon />
          </button>
        </div>
      </Field>
      <Field label={t.upload.titleLabel} htmlFor={`${id}-title`}>
        <input
          id={`${id}-title`}
          maxLength={200}
          placeholder={t.upload.optional}
          value={value.title}
          onChange={(e) => set('title', e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label={t.upload.messageLabel} htmlFor={`${id}-message`}>
        <textarea
          id={`${id}-message`}
          rows={3}
          maxLength={2000}
          placeholder={t.upload.optional}
          value={value.message}
          onChange={(e) => set('message', e.target.value)}
          className={`${inputClass} resize-y`}
        />
      </Field>
    </fieldset>
  );
}
