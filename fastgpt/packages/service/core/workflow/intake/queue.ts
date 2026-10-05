import { getQueue, QueueNames } from '../../../common/bullmq';

export type WorkflowIntakeJobData = { taskId: string };

const queue = getQueue<WorkflowIntakeJobData>(QueueNames.workflowIntake, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 }
  }
});

export const enqueueWorkflowIntake = (taskId: string, suffix = 'initial', delay?: number) =>
  queue.add(
    'workflow-intake',
    { taskId },
    {
      jobId: `workflow-intake-${taskId}-${suffix}`,
      ...(delay ? { delay } : {})
    }
  );
