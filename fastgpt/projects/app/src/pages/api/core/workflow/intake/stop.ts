import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { IntakeTaskIdBodySchema } from '@fastgpt/global/openapi/core/workflow/intakeApi';
import { stopIntakeTask } from '@fastgpt/service/core/workflow/intake/controller';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps) {
  const { taskId } = parseApiInput({ req, bodySchema: IntakeTaskIdBodySchema }).body;
  const { teamId, tmbId } = await authCert({ req, authToken: true, authApiKey: true });
  const task = await stopIntakeTask(taskId, teamId, tmbId);
  if (!task) throw new Error('Intake task not found or already finished');
  return { taskId, status: 'stopped' as const };
}

export default NextAPI(handler);
