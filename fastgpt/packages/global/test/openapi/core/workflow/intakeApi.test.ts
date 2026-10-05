import { describe, expect, it } from 'vitest';
import {
  CreateIntakeTaskBodySchema,
  IntakeTaskResponseSchema
} from '@fastgpt/global/openapi/core/workflow/intakeApi';

const datasetId = '507f1f77bcf86cd799439011';

const item = (input = 'project-a') => ({
  input,
  name: input,
  text: `# ${input}`,
  canonical: `github.com/example/${input}`
});

describe('workflow intake API schemas', () => {
  it('requires an explicit confirmation and background execution', () => {
    const base = { datasetId, items: [item()] };

    expect(CreateIntakeTaskBodySchema.safeParse(base).success).toBe(false);
    expect(
      CreateIntakeTaskBodySchema.safeParse({ ...base, confirmed: true, background: false }).success
    ).toBe(false);

    const parsed = CreateIntakeTaskBodySchema.parse({
      ...base,
      confirmed: true,
      background: true
    });
    expect(parsed.confirmed).toBe(true);
    expect(parsed.background).toBe(true);
    expect(parsed.batchSize).toBe(20);
    expect(parsed.concurrency).toBe(5);
    expect(parsed.items[0].kind).toBe('project');
  });

  it('bounds the number of items and the size of each item', () => {
    const makeBody = (items: unknown[]) => ({
      datasetId,
      items,
      background: true,
      confirmed: true
    });

    expect(
      CreateIntakeTaskBodySchema.safeParse(
        makeBody(Array.from({ length: 101 }, (_, index) => item(`project-${index}`)))
      ).success
    ).toBe(false);

    expect(
      CreateIntakeTaskBodySchema.safeParse(makeBody([{ ...item(), text: 'x'.repeat(100_001) }]))
        .success
    ).toBe(false);
  });

  it('accepts project metadata and terminal item statuses in task details', () => {
    const parsed = IntakeTaskResponseSchema.parse({
      taskId: '507f1f77bcf86cd799439012',
      status: 'stopped',
      total: 1,
      completed: 1,
      remaining: 0,
      results: [
        {
          input: 'project-a',
          canonical: 'github.com/example/project-a',
          name: 'project-a',
          repo: 'https://github.com/example/project-a',
          resource: 'README.md',
          kind: 'project',
          stars: 42,
          status: 'stopped',
          reason: 'Stopped by user'
        }
      ]
    });

    expect(parsed.results[0]).toMatchObject({
      name: 'project-a',
      stars: 42,
      status: 'stopped'
    });
  });
});
