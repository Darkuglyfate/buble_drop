"use client";

type LoadingStateProps = {
  message?: string;
  isLoading: boolean;
};

export function LoadingState({ message = "Loading...", isLoading }: LoadingStateProps) {
  if (!isLoading) {
    return null;
  }

  return (
    <p className="mt-3 text-sm text-[#6074a0]">{message}</p>
  );
}
