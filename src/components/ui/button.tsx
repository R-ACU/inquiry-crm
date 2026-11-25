import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Buttons: rounded, one weight, a short colour change on hover and a slight
 * sink on press (`press`). Disabled buttons keep their shape and fade.
 */
export const buttonVariants = cva(
  "press inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap select-none disabled:opacity-55 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary shadow-[0_1px_2px_0_rgb(16_24_40/0.12)] hover:bg-primary-hover",
        secondary: "border border-line bg-surface text-fg shadow-card hover:border-line-strong hover:bg-hover",
        soft: "bg-accent-soft text-accent-fg hover:bg-accent-soft/70",
        ghost: "text-muted hover:bg-hover hover:text-fg",
        danger: "text-danger hover:bg-danger/10",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-9 gap-2 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 gap-2 px-5 text-[15px] [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type Size = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

export function buttonClasses(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cn(buttonVariants({ variant, size }), extra);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  pending?: boolean;
  icon?: ReactNode;
}

export function Button({ variant, size, pending, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
