import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/types";

const ROLE_STYLES: Record<UserRole, string> = {
  owner:
    "border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  admin:
    "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  staff:
    "border-transparent bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300",
};

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  return (
    <Badge className={`capitalize ${ROLE_STYLES[role] ?? ""} ${className ?? ""}`}>
      {role}
    </Badge>
  );
}
