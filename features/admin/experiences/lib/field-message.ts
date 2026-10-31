/**
 * Which copy line the admin experience form shows for a zod issue code
 * (features/admin/experiences/schemas.ts). Most codes are length bounds
 * and share the generic line; the bilingual-list refusals name the
 * missing half, because "check this field" on a filled-in list explains
 * nothing.
 */
export type FieldMessageKey =
  | 'fieldArPlaceholder'
  | 'fieldArRequired'
  | 'fieldEnRequired'
  | 'fieldInvalid';

export function fieldMessageKey(code: string): FieldMessageKey {
  if (code.endsWith('_ar_placeholder')) return 'fieldArPlaceholder';
  if (code.endsWith('_ar_required')) return 'fieldArRequired';
  if (code.endsWith('_en_required')) return 'fieldEnRequired';
  return 'fieldInvalid';
}
