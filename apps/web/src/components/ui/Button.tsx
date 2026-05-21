import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export const Button = ({
  children,
  className = "",
  icon,
  type = "button",
  variant = "secondary",
  ...props
}: ButtonProps) => (
  <button className={`button button-${variant} ${className}`.trim()} type={type} {...props}>
    {icon ? <span className="button-icon">{icon}</span> : null}
    <span>{children}</span>
  </button>
);
