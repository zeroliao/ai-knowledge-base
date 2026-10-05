import { getWorker, QueueNames, type Job } from '@fastgpt/service/common/bullmq';
import pLimit from 'p-limit';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  claimNextIntakeBatch,
  finishIntakeTask,
  renewIntakeLease,
  INTAKE_CLAIM_LEASE_MS
} from '@fastgpt/service/core/workflow/intake/controller';
import type { WorkflowIntakeJobData } from '@fastgpt/service/core/workflow/intake/queue';
import { enqueueWorkflowIntake } from '@fastgpt/service/core/workflow/intake/queue';

const globalIntakeLimit = pLimit(Math.max(1, serviceEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY));

const getExternalFileId = (canonical: string) =>
  `workflow-intake-${hashStr(canonical.trim().toLowerCase())}`;

export const initWorkflowIntakeWorker = () =>
  getWorker<WorkflowIntakeJobData>(
    QueueNames.workflowIntake,
    async (job: Job<WorkflowIntakeJobData>) => {
      const claimed = await claimNextIntakeBatch(job.data.taskId);
      if (!claimed) return;
      const { task, claimed: items, start, claimToken } = claimed;
      await enqueueWorkflowIntake(
        job.data.taskId,
        `lease-${claimToken}`,
        INTAKE_CLAIM_LEASE_MS + 1000
      );
      const leaseTimer = setInterval(
        () => {
          void renewIntakeLease(job.data.taskId, claimToken);
        },
        Math.max(10_000, Math.floor(INTAKE_CLAIM_LEASE_MS / 3))
      );
      let finished;
      try {
        const dataset = await MongoDataset.findOne({ _id: task.datasetId, teamId: task.teamId });
        const taskLimit = pLimit(
          Math.max(1, Math.min(task.concurrency, serviceEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY))
        );
        const results = await Promise.all(
          items.map((item, offset) =>
            globalIntakeLimit(() =>
              taskLimit(async () => {
                const index = start + offset;
                if (item.status === 'duplicate') {
                  return { index, status: 'duplicate' as const, reason: item.reason };
                }
                if (!dataset) {
                  return {
                    index,
                    status: 'failed' as const,
                    reason: 'Dataset not found for workflow intake task'
                  };
                }

                const externalFileId = getExternalFileId(item.canonical);
                try {
                  // The unique datasetId + externalFileId index makes retries and
                  // repeated intake requests idempotent across workers/tasks.
                  const existing = await MongoDatasetCollection.findOne(
                    { datasetId: task.datasetId, externalFileId },
                    { _id: 1 }
                  ).lean();
                  if (existing) {
                    return {
                      index,
                      status: 'submitted' as const,
                      collectionId: String(existing._id)
                    };
                  }

                  const response = await createCollectionAndInsertData({
                    dataset,
                    rawText: item.text,
                    createCollectionParams: {
                      datasetId: task.datasetId,
                      teamId: String(task.teamId),
                      tmbId: String(task.tmbId),
                      name: `${item.canonical}.txt`,
                      externalFileId,
                      type: DatasetCollectionTypeEnum.file,
                      trainingType: DatasetCollectionDataProcessModeEnum.chunk,
                      metadata: {
                        workflowIntakeCanonical: item.canonical,
                        workflowIntakeTaskId: job.data.taskId,
                        workflowIntakeItemIndex: String(index)
                      }
                    }
                  });
                  return {
                    index,
                    status: 'submitted' as const,
                    collectionId: response.collectionId
                  };
                } catch (error) {
                  // A concurrent retry may win the unique-key race. Resolve it to
                  // the already-created collection rather than reporting failure.
                  const duplicate = await MongoDatasetCollection.findOne(
                    { datasetId: task.datasetId, externalFileId },
                    { _id: 1 }
                  ).lean();
                  if (duplicate) {
                    return {
                      index,
                      status: 'submitted' as const,
                      collectionId: String(duplicate._id)
                    };
                  }
                  return {
                    index,
                    status: 'failed' as const,
                    reason: error instanceof Error ? error.message : String(error)
                  };
                }
              })
            )
          )
        );
        finished = await finishIntakeTask(job.data.taskId, results, claimToken);
      } finally {
        clearInterval(leaseTimer);
      }
      if (finished?.status === 'awaiting_continue' && finished.background) {
        await enqueueWorkflowIntake(job.data.taskId, String(finished.cursor));
      }
    },
    { concurrency: Math.max(1, serviceEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY) }
  );
