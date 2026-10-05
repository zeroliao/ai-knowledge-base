import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  CreateIntakeTaskBodySchema,
  IntakeTaskResponseSchema,
  type IntakeTaskResponseType
} from '@fastgpt/global/openapi/core/workflow/intakeApi';
import { createIntakeTask } from '@fastgpt/service/core/workflow/intake/controller';
import { enqueueWorkflowIntake } from '@fastgpt/service/core/workflow/intake/queue';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps): Promise<IntakeTaskResponseType> {
  const body = parseApiInput({ req, bodySchema: CreateIntakeTaskBodySchema }).body;
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });
  const task = await createIntakeTask({
    teamId,
    tmbId,
    datasetId: String(dataset._id),
    batchSize: body.batchSize,
    concurrency: body.concurrency,
    background: body.background,
    items: body.items
  });
  await enqueueWorkflowIntake(String(task._id));
  return IntakeTaskResponseSchema.parse({
    taskId: String(task._id),
    status: 'queued',
    total: body.items.length,
    completed: 0,
    remaining: body.items.length,
    results: body.items.map((item) => ({
      input: item.input,
      canonical: item.canonical,
      status: 'queued'
    }))
  });
}

export default NextAPI(handler);
