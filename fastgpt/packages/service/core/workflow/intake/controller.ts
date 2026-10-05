import { randomUUID } from 'crypto';
import { MongoDataset } from '../../dataset/schema';
import { MongoWorkflowIntakeTask, type IntakeItemRecord } from './schema';

export const INTAKE_CLAIM_LEASE_MS = 10 * 60 * 1000;

export type CreateIntakeTaskParams = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  batchSize: number;
  concurrency: number;
  background: boolean;
  items: Omit<IntakeItemRecord, 'status' | 'index'>[];
};

export const createIntakeTask = async (params: CreateIntakeTaskParams) => {
  const seenCanonical = new Set<string>();
  const task = await MongoWorkflowIntakeTask.create({
    ...params,
    items: params.items.map((item, index) => {
      const canonicalKey = item.canonical.trim().toLowerCase();
      const duplicate = seenCanonical.has(canonicalKey);
      seenCanonical.add(canonicalKey);
      return {
        ...item,
        index,
        status: duplicate ? 'duplicate' : 'queued',
        ...(duplicate ? { reason: 'Duplicate canonical in the same intake task' } : {})
      };
    })
  });
  return task;
};

export const getIntakeTask = async (taskId: string, teamId: string, tmbId?: string) => {
  const task = await MongoWorkflowIntakeTask.findOne({
    _id: taskId,
    teamId,
    ...(tmbId ? { tmbId } : {})
  }).lean();
  if (!task) return null;

  // Keep task reads tied to a live dataset in the same team. This prevents a task
  // record from being used after its dataset was deleted or moved across teams.
  const dataset = await MongoDataset.findOne({ _id: task.datasetId, teamId }, { _id: 1 }).lean();
  return dataset ? task : null;
};

export const claimNextIntakeBatch = async (taskId: string) => {
  const now = new Date();

  // Recover a batch whose worker died after claiming it. The pipeline puts the
  // cursor back at the old claim start and requeues only that stale range.
  await MongoWorkflowIntakeTask.updateOne(
    {
      _id: taskId,
      status: 'running',
      $or: [
        { leaseExpiresAt: { $lte: now } },
        { leaseExpiresAt: null },
        { leaseExpiresAt: { $exists: false } }
      ]
    },
    [
      {
        $set: {
          status: 'queued',
          cursor: {
            $cond: [
              { $and: [{ $ne: ['$claimStart', null] }, { $lt: ['$claimStart', '$cursor'] }] },
              '$claimStart',
              '$cursor'
            ]
          },
          items: {
            $map: {
              input: '$items',
              as: 'item',
              in: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$$item.status', 'running'] },
                      { $gte: ['$$item.index', '$claimStart'] },
                      { $lt: ['$$item.index', '$claimEnd'] }
                    ]
                  },
                  { $mergeObjects: ['$$item', { status: 'queued' }] },
                  '$$item'
                ]
              }
            }
          },
          claimStart: null,
          claimEnd: null,
          claimToken: null,
          leaseExpiresAt: null
        }
      }
    ] as any
  );

  const claimToken = randomUUID();
  const task = await MongoWorkflowIntakeTask.findOneAndUpdate(
    {
      _id: taskId,
      status: { $in: ['queued', 'awaiting_continue'] },
      $expr: { $lt: ['$cursor', { $size: '$items' }] }
    },
    [
      {
        $set: {
          status: 'running',
          claimStart: '$cursor',
          claimEnd: { $min: [{ $add: ['$cursor', '$batchSize'] }, { $size: '$items' }] },
          cursor: { $min: [{ $add: ['$cursor', '$batchSize'] }, { $size: '$items' }] },
          claimToken,
          leaseExpiresAt: new Date(Date.now() + INTAKE_CLAIM_LEASE_MS)
        }
      },
      {
        $set: {
          items: {
            $map: {
              input: '$items',
              as: 'item',
              in: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$$item.status', 'queued'] },
                      { $gte: ['$$item.index', '$claimStart'] },
                      { $lt: ['$$item.index', '$claimEnd'] }
                    ]
                  },
                  { $mergeObjects: ['$$item', { status: 'running' }] },
                  '$$item'
                ]
              }
            }
          }
        }
      }
    ] as any,
    { new: true }
  );
  if (!task) return null;

  const start = task.cursor;
  const claimedStart = task.claimStart ?? start;
  const end = task.claimEnd ?? Math.min(start + task.batchSize, task.items.length);
  const claimed = task.items.slice(claimedStart, end);
  return { task, claimed, start: claimedStart, end, claimToken: task.claimToken as string };
};

export const finishIntakeTask = async (
  taskId: string,
  updates: Array<{
    index: number;
    status: IntakeItemRecord['status'];
    collectionId?: string;
    reason?: string;
  }>,
  claimToken: string
) => {
  const query = { _id: taskId, status: 'running', claimToken };
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  updates.forEach(({ index, status, collectionId, reason }) => {
    set[`items.${index}.status`] = status;
    if (collectionId) set[`items.${index}.collectionId`] = collectionId;
    if (reason) set[`items.${index}.reason`] = reason;
    else unset[`items.${index}.reason`] = 1;
  });

  const write = await MongoWorkflowIntakeTask.updateOne(query, {
    ...(Object.keys(set).length ? { $set: set } : {}),
    ...(Object.keys(unset).length ? { $unset: unset } : {})
  });
  if (!write.matchedCount) return MongoWorkflowIntakeTask.findById(taskId).lean();

  const current = await MongoWorkflowIntakeTask.findOne(query).lean();
  if (!current) return MongoWorkflowIntakeTask.findById(taskId).lean();
  const hasRemaining = current.items.some(
    (item) => item.status === 'queued' || item.status === 'running'
  );
  const hasFailed = current.items.some((item) => item.status === 'failed');
  const nextStatus = hasRemaining
    ? 'awaiting_continue'
    : hasFailed
      ? 'partial_failed'
      : 'completed';
  await MongoWorkflowIntakeTask.updateOne(query, {
    $set: {
      status: nextStatus,
      claimStart: null,
      claimEnd: null,
      claimToken: null,
      leaseExpiresAt: null
    }
  });
  return MongoWorkflowIntakeTask.findById(taskId).lean();
};

export const renewIntakeLease = (taskId: string, claimToken: string) =>
  MongoWorkflowIntakeTask.updateOne(
    { _id: taskId, status: 'running', claimToken },
    { $set: { leaseExpiresAt: new Date(Date.now() + INTAKE_CLAIM_LEASE_MS) } }
  );

export const stopIntakeTask = (taskId: string, teamId: string, tmbId?: string) =>
  MongoWorkflowIntakeTask.findOneAndUpdate(
    {
      _id: taskId,
      teamId,
      ...(tmbId ? { tmbId } : {}),
      status: { $in: ['queued', 'awaiting_continue', 'running'] }
    },
    [
      {
        $set: {
          status: 'stopped',
          items: {
            $map: {
              input: '$items',
              as: 'item',
              in: {
                $cond: [
                  { $in: ['$$item.status', ['queued', 'running']] },
                  { $mergeObjects: ['$$item', { status: 'stopped', reason: 'Stopped by user' }] },
                  '$$item'
                ]
              }
            }
          },
          claimStart: null,
          claimEnd: null,
          claimToken: null,
          leaseExpiresAt: null
        }
      }
    ] as any,
    { new: true }
  ).lean();
