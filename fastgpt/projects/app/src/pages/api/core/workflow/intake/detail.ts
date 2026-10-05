import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  IntakeTaskIdBodySchema,
  IntakeTaskResponseSchema,
  type IntakeTaskResponseType
} from '@fastgpt/global/openapi/core/workflow/intakeApi';
import { getIntakeTask } from '@fastgpt/service/core/workflow/intake/controller';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps): Promise<IntakeTaskResponseType> {
  const { taskId } = parseApiInput({ req, querySchema: IntakeTaskIdBodySchema }).query;
  const { teamId, tmbId } = await authCert({ req, authToken: true, authApiKey: true });
  const task = await getIntakeTask(taskId, teamId, tmbId);
  if (!task) throw new Error('Intake task not found');
  const completed = task.items.filter((item) =>
    ['indexed', 'submitted', 'duplicate', 'failed', 'stopped'].includes(item.status)
  ).length;
  return IntakeTaskResponseSchema.parse({
    taskId: String(task._id),
    status: task.status,
    total: task.items.length,
    completed,
    remaining: task.items.length - completed,
    results: task.items.map((item) => ({
      input: item.input,
      canonical: item.canonical,
      name: item.name,
      repo: item.repo,
      resource: item.resource,
      kind: item.kind,
      stars: item.stars,
      status: item.status,
      collectionId: item.collectionId,
      reason: item.reason
    }))
  });
}

export default NextAPI(handler);
