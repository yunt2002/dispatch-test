"use client";

export function ConfirmSubmit({
  action,
  id,
  extraFields,
  label = "삭제",
  message = "삭제하시겠습니까?",
  buttonClassName = "btn btn-danger",
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  extraFields?: Record<string, string>;
  label?: string;
  message?: string;
  buttonClassName?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(message)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {extraFields
        ? Object.entries(extraFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      <button type="submit" className={buttonClassName}>
        {label}
      </button>
    </form>
  );
}
