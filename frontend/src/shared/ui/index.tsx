import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Switch } from "@base-ui/react/switch";
import { Check, ChevronDown, Languages, LoaderCircle } from "lucide-react";
import { Select } from "@base-ui/react/select";
import { copy, percentage } from "../i18n";

export function Button({
  children,
  variant = "outline",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
}) {
  return (
    <button
      type="button"
      className={`button button--${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Button
      variant="ghost"
      className="icon-button"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Languages size={21} strokeWidth={1.8} />
      </span>
      <span>{copy.app}</span>
      {!compact && <span className="brand-divider" aria-hidden="true" />}
    </div>
  );
}

export function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select.Root
      value={value}
      items={options}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      disabled={disabled}
    >
      <Select.Trigger className="select-trigger" aria-label={label}>
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="select-positioner"
          sideOffset={5}
          align="start"
        >
          <Select.Popup className="select-popup">
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  className="select-item"
                  key={option.value}
                  value={option.value}
                >
                  <Select.ItemIndicator className="select-check">
                    <Check size={14} />
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span className="setting-copy">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </span>
      <Switch.Root
        className="switch"
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
      >
        <Switch.Thumb className="switch-thumb" />
      </Switch.Root>
    </label>
  );
}

export function SettingRow({
  label,
  children,
  description,
}: {
  label: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <div className="setting-row">
      <span className="setting-copy">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </span>
      {children}
    </div>
  );
}

export function Group({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      {title && (
        <header className="section-heading">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </header>
      )}
      <div className="card">{children}</div>
    </section>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="alert">
      {children}
    </div>
  );
}

export interface StatusData {
  phase: "idle" | "downloading" | "loading" | "ready" | "translating" | "error";
  progress?: number;
  file?: string;
  error?: string;
}
export function ModelStatusView({
  status,
  detail = false,
}: {
  status: StatusData;
  detail?: boolean;
}) {
  const labels: Record<StatusData["phase"], string> = {
    idle: copy.modelIdle,
    downloading: copy.modelDownloading,
    loading: copy.modelLoading,
    ready: copy.modelReady,
    translating: copy.modelTranslating,
    error: copy.modelError,
  };
  const busy = ["downloading", "loading", "translating"].includes(status.phase);
  return (
    <div className="model-status" role="status" aria-live="polite">
      <div className="status-line">
        {busy ? (
          <LoaderCircle size={14} className="spinner" aria-hidden="true" />
        ) : (
          <span
            className={`status-dot ${status.phase === "ready" ? "status-dot--ready" : ""}`}
            aria-hidden="true"
          />
        )}
        <span>{labels[status.phase]}</span>
        {status.progress !== undefined && status.phase === "downloading" && (
          <span className="status-percentage">
            {percentage(status.progress)}
          </span>
        )}
      </div>
      {status.phase === "downloading" && status.progress !== undefined && (
        <progress
          max={100}
          value={status.progress}
          aria-label={copy.modelDownloading}
        />
      )}
      {detail && status.file && (
        <small className="model-file">{status.file}</small>
      )}
    </div>
  );
}
