import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"
import { cn } from "./cn"

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-muted",
        ghost: "hover:bg-muted",
      },
    },
    defaultVariants: { variant: "primary" },
  },
)

export function Button({ className, variant, ...props }: ComponentProps<"button"> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant }), className)} {...props} />
}
