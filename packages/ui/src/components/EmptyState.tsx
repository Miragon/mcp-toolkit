import { cn } from "../lib/utils.js"

interface EmptyStateProps {
  title: string
  description?: string
  className?: string
}

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="text-muted-foreground text-4xl mb-4">∅</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="text-muted-foreground text-sm mt-1 max-w-md">{description}</p>}
    </div>
  )
}
