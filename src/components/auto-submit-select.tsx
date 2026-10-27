"use client";

export function AutoSubmitSelect({
  name,
  defaultValue,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={className}
      defaultValue={defaultValue}
      name={name}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {children}
    </select>
  );
}
