import { cn } from "@/lib/utils";

export function Badge({ className, tone = "muted", ...props }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/20 text-secondary-foreground",
    danger: "bg-destructive/10 text-destructive",
    accent: "bg-accent/10 text-accent",
    info: "bg-accent/10 text-accent"
  };
  return <span className={cn("inline-flex items-center rounded-md px-2 py-1 text-xs font-medium", tones[tone], className)} {...props} />;
}
