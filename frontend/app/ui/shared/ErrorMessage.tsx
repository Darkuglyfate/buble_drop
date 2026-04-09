"use client";

type ErrorMessageProps = {
  message: string | null;
};

export function ErrorMessage({ message }: ErrorMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <section className="bubble-card p-4">
      <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">
        {message}
      </p>
    </section>
  );
}
