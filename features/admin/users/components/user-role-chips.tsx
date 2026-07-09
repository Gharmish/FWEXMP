import { Badge } from '@/components/ui/badge';
import type { UserRole } from '@/features/admin/users/types';

const ROLE_TONE: Record<UserRole, string> = {
  admin: 'bg-sarat-black text-white',
  host: 'bg-juniper-green/15 text-juniper-green',
  applicant: 'bg-saffron-gold/20 text-sarat-black',
  guest: 'bg-habala-mist/40 text-sarat-black',
};

export interface UserRoleChipsProps {
  roles: readonly UserRole[];
  labels: Record<UserRole, string>;
}

/** Coloured role chips shared by the directory row and the detail header. */
export function UserRoleChips({ roles, labels }: UserRoleChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {roles.map((role) => (
        <Badge key={role} className={ROLE_TONE[role]}>
          {labels[role]}
        </Badge>
      ))}
    </div>
  );
}
