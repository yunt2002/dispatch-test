import Link from "next/link";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="muted mt-1">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Alert({
  variant = "info",
  title,
  children,
}: {
  variant?: "error" | "success" | "warn" | "info";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`alert alert-${variant}`} role={variant === "error" ? "alert" : "status"}>
      {title ? <div className="alert-title">{title}</div> : null}
      {children}
    </div>
  );
}

export function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return <Alert variant="error" title="확인이 필요합니다">{message}</Alert>;
}

export function NoticeText({ message }: { message?: string }) {
  if (!message) return null;
  return <Alert variant="warn">{message}</Alert>;
}

export function SuccessText({ message }: { message?: string }) {
  if (!message) return null;
  return <Alert variant="success">{message}</Alert>;
}

export function StatusBadge({
  tone = "muted",
  children,
}: {
  tone?: "ok" | "warn" | "info" | "muted" | "dummy";
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="text-base font-bold">{title}</div>
      {description ? <p className="mt-2">{description}</p> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="field-error">{message}</div>;
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <div className="field-hint">{children}</div>;
}

export function NavButton({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link href={href} className={primary ? "btn btn-primary" : "btn"}>
      {children}
    </Link>
  );
}
