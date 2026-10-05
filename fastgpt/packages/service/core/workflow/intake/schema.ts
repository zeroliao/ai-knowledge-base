import { getMongoModel, Schema } from '../../../common/mongo';

export type IntakeItemRecord = {
  index: number;
  input: string;
  name: string;
  text: string;
  canonical: string;
  repo?: string;
  resource?: string;
  kind: 'project' | 'skill';
  stars?: number;
  status: 'queued' | 'running' | 'indexed' | 'submitted' | 'duplicate' | 'failed' | 'stopped';
  collectionId?: string;
  reason?: string;
};

const IntakeItemSchema = new Schema<IntakeItemRecord>(
  {
    index: { type: Number, required: true },
    input: { type: String, required: true },
    name: { type: String, required: true },
    text: { type: String, required: true },
    canonical: { type: String, required: true },
    repo: String,
    resource: String,
    kind: { type: String, enum: ['project', 'skill'], required: true },
    stars: Number,
    status: {
      type: String,
      enum: ['queued', 'running', 'indexed', 'submitted', 'duplicate', 'failed', 'stopped'],
      required: true,
      default: 'queued'
    },
    collectionId: String,
    reason: String
  },
  { _id: false }
);

const IntakeTaskSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, required: true },
    tmbId: { type: Schema.Types.ObjectId, required: true },
    datasetId: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'awaiting_continue', 'completed', 'partial_failed', 'stopped'],
      required: true,
      default: 'queued'
    },
    batchSize: { type: Number, required: true, default: 20 },
    concurrency: { type: Number, required: true, default: 5 },
    background: { type: Boolean, required: true, default: true },
    cursor: { type: Number, required: true, default: 0 },
    claimStart: { type: Number, default: null },
    claimEnd: { type: Number, default: null },
    claimToken: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
    items: { type: [IntakeItemSchema], required: true }
  },
  { timestamps: true }
);

IntakeTaskSchema.index({ teamId: 1, createdAt: -1 });
IntakeTaskSchema.index({ datasetId: 1, status: 1 });

export type IntakeTaskDocument = {
  _id: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  status: 'queued' | 'running' | 'awaiting_continue' | 'completed' | 'partial_failed' | 'stopped';
  batchSize: number;
  concurrency: number;
  background: boolean;
  cursor: number;
  claimStart?: number;
  claimEnd?: number;
  claimToken?: string;
  leaseExpiresAt?: Date;
  items: IntakeItemRecord[];
  createdAt: Date;
  updatedAt: Date;
};

export const MongoWorkflowIntakeTask = getMongoModel<IntakeTaskDocument>(
  'workflow_intake_tasks',
  IntakeTaskSchema
);
