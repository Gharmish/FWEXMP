import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Gharmish Avatar — circular. Falls back to initials in Saffron Gold on
 * Sarat Black when no image is provided.
 *
 * Note: uses a plain <img> (not next/image) to keep this primitive free
 * of remote-domain config. Swap to next/image once image hosts are
 * configured (tracked for Sprint 1 task 8 / media work).
 */
const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-sarat-black font-medium text-saffron-gold select-none',
  {
    variants: {
      size: {
        sm: 'size-8 text-xs',
        md: 'size-11 text-sm',
        lg: 'size-16 text-lg',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof avatarVariants> {
  /** Person/host name — used for initials and as image alt fallback. */
  name: string;
  src?: string;
}

export function Avatar({ className, size, name, src, ...props }: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      role="img"
      aria-label={name}
      className={cn(avatarVariants({ size }), className)}
      {...props}
    >
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
    </span>
  );
}
