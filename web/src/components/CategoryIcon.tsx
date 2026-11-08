import { CATEGORY_ICONS } from '@/lib/category-options'

export function CategoryIcon({
  name,
  color,
  className = 'size-4',
}: {
  name: string
  color?: string
  className?: string
}) {
  const Icon = CATEGORY_ICONS[name] ?? CATEGORY_ICONS.tag
  return <Icon className={className} style={color ? { color } : undefined} />
}
