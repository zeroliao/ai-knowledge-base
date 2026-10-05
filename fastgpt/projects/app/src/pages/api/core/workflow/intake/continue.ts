import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { IntakeTaskIdBodySchema } from '@fastgpt/global/openapi/core/workflow/intakeApi';
import { getIntakeTask } from '@fastgpt/service/core/workflow/intake/controller';
import { enqueueWorkflowIntake } from '@fastgpt/service/core/workflow/intake/queue';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps) {
  const { taskId } = parseApiInput({ req, bodySchema: IntakeTaskIdBodySchema }).body;
  const { teamId, tmbId } = await authCert({ req, authToken: true, authApiKey: true });
  const task = await getIntakeTask(taskId, teamId, tmbId);
  if (!task) throw new Error('Intake task not found');
  if (task.status !== 'awaiting_continue') throw new Error('Intake task is not awaiting continuation');
  await enqueueWorkflowIntake(taskId, String(task.cursor));
  return { taskId, status: 'queued' as const };
}

export default NextAPI(handler);
