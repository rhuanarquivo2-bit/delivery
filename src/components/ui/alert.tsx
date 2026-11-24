import { cn } from "@/lib/utils";

export function Alert({
  tone = "info",
  className,
  ...props
}: React.ComponentProps<"div"> & { tone?: "info" | "error" | "success" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "info" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "error" && "border-red-200 bg-red-50 text-red-800",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        className,
      )}
      {...props}
    />
  );
}
