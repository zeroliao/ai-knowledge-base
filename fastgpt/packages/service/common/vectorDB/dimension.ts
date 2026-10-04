import { serviceEnv } from '../../env';

/**
 * Single dimension contract shared by embedding formatting and vector stores.
 *
 * Changing this value does not migrate existing data. The `modeldata.vector`
 * column and all existing dataset embeddings must be rebuilt before switching
 * a running installation to another dimension.
 */
export const VECTOR_DIMENSION = serviceEnv.VECTOR_DIMENSION;
