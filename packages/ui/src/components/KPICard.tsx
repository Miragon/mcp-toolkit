import { Card, CardHeader, CardTitle, CardContent } from "../primitives/card.js"

interface KPICardProps {
  label: string
  value: string | number
  unit?: string
  className?: string
}

export function KPICard({ label, value, unit, className }: KPICardProps) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle className="text-muted-foreground font-normal">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
