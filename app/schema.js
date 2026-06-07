import { z } from 'zod';

const base = {
  id: z.string().min(1),
  label: z.string(),
  start: z.number().nonnegative(),
  end: z.number().positive(),
};

export const ItemSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('video'), track: z.literal('screen'),
    trim: z.tuple([z.number(), z.number()]), speed: z.number().positive(), volume: z.number().min(0).max(1) }),
  z.object({ ...base, type: z.literal('zoom'), track: z.literal('zoom'),
    scale: z.number().positive(), focus: z.tuple([z.number(), z.number()]) }),
  z.object({ ...base, type: z.literal('text'), track: z.literal('text'),
    value: z.string(), preset: z.string() }),
  z.object({ ...base, type: z.literal('color'), track: z.literal('text'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/), value: z.string().optional() }),
  z.object({ ...base, type: z.literal('transition'), track: z.literal('zoom'),
    kind: z.enum(['crossfade', 'wipe', 'dissolve']) }),
  z.object({ ...base, type: z.literal('voice'), track: z.literal('voice'),
    src: z.string().min(1), volume: z.number().min(0).max(1) }),
  z.object({ ...base, type: z.literal('music'), track: z.literal('music'),
    src: z.string().min(1), volume: z.number().min(0).max(1) }),
]);

export const ItemsSchema = z.array(ItemSchema);

export const StateSchema = z.object({
  meta: z.object({
    composition: z.string().min(1),
    fps: z.number().positive(),
    size: z.tuple([z.number().positive(), z.number().positive()]),
    duration: z.number().positive(),
  }),
  items: ItemsSchema,
});

function fmtIssue(issue) {
  const path = issue.path.reduce(
    (acc, part) => (typeof part === 'number' ? `${acc}[${part}]` : `${acc}.${part}`),
    'items',
  );
  return `${path}: ${issue.message}`;
}

/** Returns null if valid, or a human-readable error string if not. */
export function validateItems(items) {
  const result = ItemsSchema.safeParse(items);
  if (result.success) return null;

  const issues = result.error.issues;
  const first = fmtIssue(issues[0]);
  if (issues.length === 1) return first;
  return `${first} (and ${issues.length - 1} more)`;
}
