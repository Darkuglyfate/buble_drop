"use client";

import type { CSSProperties } from "react";

type InputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  type?: "text" | "email" | "password";
  fullWidth?: boolean;
};

const STYLE: CSSProperties = {
  padding: "0.625rem 0.875rem",
  fontSize: "0.875rem",
  color: "#27457b",
  background: "rgba(255, 255, 255, 0.85)",
  border: "1px solid #dce6ff",
  borderRadius: "0.625rem",
  outline: "none",
  fontFamily: "inherit",
};

export function Input({
  value,
  onChange,
  placeholder,
  maxLength,
  disabled = false,
  type = "text",
  fullWidth = true,
}: InputProps) {
  const style: CSSProperties = {
    ...STYLE,
    width: fullWidth ? "100%" : undefined,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? "not-allowed" : "text",
  };

  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      style={style}
    />
  );
}
