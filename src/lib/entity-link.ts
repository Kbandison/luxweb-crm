/**
 * Resolve an entity_type + entity_id from the audit log to an admin URL,
 * when one exists. Returns null for entities we don't surface as
 * standalone pages (e.g. invoices currently only live inside a project).
 */
export function entityHref(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case 'contact':
      return `/admin/clients/${entityId}`;
    case 'project':
      return `/admin/projects/${entityId}`;
    default:
      return null;
  }
}
