import { cn } from "../lib/utils.js"

interface ProgressBarProps {
  value: number
  label?: string
  className?: string
}

export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{Math.round(clamped)}%</span>
        </div>
      )}
      <div className="bg-secondary h-2 w-full rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
