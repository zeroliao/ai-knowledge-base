import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';

export const IntakeItemSchema = z.object({
  input: z.string().trim().min(1).max(2000),
  name: z.string().trim().min(1).max(500),
  text: z.string().min(1).max(100_000),
  canonical: z.string().trim().min(1).max(200),
  repo: z.string().optional(),
  resource: z.string().optional(),
  kind: z.enum(['project', 'skill']).default('project'),
  stars: z.number().int().nonnegative().optional()
});

export const CreateIntakeTaskBodySchema = z.object({
  datasetId: ObjectIdSchema,
  items: z.array(IntakeItemSchema).min(1).max(100),
  batchSize: z.number().int().min(1).max(20).default(20),
  concurrency: z.number().int().min(1).max(20).default(5),
  background: z.literal(true),
  confirmed: z.literal(true)
});
export type CreateIntakeTaskBodyType = z.infer<typeof CreateIntakeTaskBodySchema>;

export const IntakeTaskIdBodySchema = z.object({
  taskId: ObjectIdSchema
});

export const IntakeTaskResponseSchema = z.object({
  taskId: z.string(),
  status: z.enum([
    'queued',
    'running',
    'awaiting_continue',
    'completed',
    'partial_failed',
    'stopped'
  ]),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      input: z.string(),
      canonical: z.string(),
      name: z.string().optional(),
      repo: z.string().optional(),
      resource: z.string().optional(),
      kind: z.enum(['project', 'skill']).optional(),
      stars: z.number().int().nonnegative().optional(),
      status: z.enum([
        'queued',
        'running',
        'indexed',
        'submitted',
        'duplicate',
        'failed',
        'stopped'
      ]),
      collectionId: z.string().optional(),
      reason: z.string().optional()
    })
  )
});
export type IntakeTaskResponseType = z.infer<typeof IntakeTaskResponseSchema>;
