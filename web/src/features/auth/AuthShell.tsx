import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="text-sm font-semibold text-primary">Finanzas</div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null
}
