import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getAppType, getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { AppFormEditFormV1TypeSchema } from '@fastgpt/global/core/app/formEdit/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { form2AppWorkflow } from '@/pageComponents/app/detail/Edit/SimpleApp/utils';

export type JsonImportModalScene = 'agent' | 'tool';

type ImportWorkflowConfig = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig?: AppChatConfigType;
};

type ParsedImportConfig = {
  workflow: ImportWorkflowConfig;
  appType: AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.workflowTool;
};

type SupportedImportAppType = ParsedImportConfig['appType'];

const supportedImportAppTypes = [
  AppTypeEnum.simple,
  AppTypeEnum.workflow,
  AppTypeEnum.workflowTool
] as const;

const dashboardImportAppTypesByScene: Record<
  JsonImportModalScene,
  readonly SupportedImportAppType[]
> = {
  agent: [AppTypeEnum.simple, AppTypeEnum.workflow],
  tool: [AppTypeEnum.workflowTool]
};

const isSupportedImportAppType = (
  type: unknown
): type is (typeof supportedImportAppTypes)[number] =>
  supportedImportAppTypes.includes(type as (typeof supportedImportAppTypes)[number]);

const validWorkflowValueTypes = new Set<string>(Object.values(WorkflowIOValueTypeEnum));
const validInputTypes = new Set<string>(Object.values(FlowNodeInputTypeEnum));
const validOutputTypes = new Set<string>(Object.values(FlowNodeOutputTypeEnum));

const getDefaultRenderTypeList = (valueType: unknown) => {
  switch (valueType) {
    case WorkflowIOValueTypeEnum.number:
      return [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference];
    case WorkflowIOValueTypeEnum.boolean:
      return [FlowNodeInputTypeEnum.switch, FlowNodeInputTypeEnum.reference];
    case WorkflowIOValueTypeEnum.object:
    case WorkflowIOValueTypeEnum.arrayString:
    case WorkflowIOValueTypeEnum.arrayNumber:
    case WorkflowIOValueTypeEnum.arrayBoolean:
    case WorkflowIOValueTypeEnum.arrayObject:
    case WorkflowIOValueTypeEnum.arrayAny:
      return [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference];
    default:
      return [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference];
  }
};

const normalizeWorkflowIOItem = <T>(item: T): T => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return item;
  }

  const next = { ...(item as Record<string, unknown>) };

  if ('valueType' in next && !validWorkflowValueTypes.has(next.valueType as string)) {
    if (next.valueType === FlowNodeInputTypeEnum.hidden) {
      const renderTypeList = Array.isArray(next.renderTypeList) ? next.renderTypeList : [];
      next.renderTypeList = renderTypeList.includes(FlowNodeInputTypeEnum.hidden)
        ? renderTypeList
        : [...renderTypeList, FlowNodeInputTypeEnum.hidden];
    }

    next.valueType = WorkflowIOValueTypeEnum.any;
  }

  return next as T;
};

const normalizeWorkflowInputItem = <T>(item: T): T => {
  const next = normalizeWorkflowIOItem(item);
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    return next;
  }

  const input = { ...(next as Record<string, unknown>) };
  const renderTypeList = Array.isArray(input.renderTypeList)
    ? input.renderTypeList.filter((item) => validInputTypes.has(item as string))
    : [];

  input.renderTypeList =
    renderTypeList.length > 0 ? renderTypeList : getDefaultRenderTypeList(input.valueType);

  return input as T;
};

const normalizeWorkflowOutputItem = <T>(item: T): T => {
  const next = normalizeWorkflowIOItem(item);
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    return next;
  }

  const output = { ...(next as Record<string, unknown>) };
  const type = output.type;

  if (Array.isArray(type)) {
    output.type =
      type.find((item) => validOutputTypes.has(item as string)) || FlowNodeOutputTypeEnum.static;
  } else if (!validOutputTypes.has(type as string)) {
    output.type = FlowNodeOutputTypeEnum.static;
  }

  return output as T;
};

export const normalizeTemplateChatConfig = (
  chatConfig?: AppChatConfigType
): AppChatConfigType => {
  if (!chatConfig || typeof chatConfig !== 'object') {
    return {} as AppChatConfigType;
  }

  const nextChatConfig = { ...chatConfig };

  if (Array.isArray(chatConfig.variables)) {
    nextChatConfig.variables = chatConfig.variables.map((variable) => ({
      ...variable,
      description: variable.description || '',
      enums: Array.isArray(variable.enums)
        ? variable.enums.map((item) => {
            if (typeof item === 'string') {
              return {
                label: item,
                value: item
              };
            }

            const value = item?.value ?? item?.label ?? '';
            return {
              ...item,
              label: item?.label ?? value,
              value
            };
          })
        : variable.enums
    }));
  }

  return nextChatConfig as AppChatConfigType;
};

export const normalizeWorkflowTemplateConfig = (
  workflow: ImportWorkflowConfig
): ImportWorkflowConfig => ({
  nodes: (Array.isArray(workflow.nodes) ? workflow.nodes : []).map((node) => ({
    ...node,
    inputs: Array.isArray(node.inputs) ? node.inputs.map(normalizeWorkflowInputItem) : [],
    outputs: Array.isArray(node.outputs) ? node.outputs.map(normalizeWorkflowOutputItem) : []
  })),
  edges: Array.isArray(workflow.edges) ? workflow.edges : [],
  chatConfig: normalizeTemplateChatConfig(workflow.chatConfig)
});

export const isDashboardImportAppTypeAllowed = ({
  appType,
  scene
}: {
  appType: SupportedImportAppType;
  scene: JsonImportModalScene;
}) => dashboardImportAppTypesByScene[scene].includes(appType);

/**
 * 归一化 simple 应用表单配置。
 *
 * 老版本导出的 simple JSON 可能缺少数组或默认字段，这里只补齐表单编辑器
 * 已有默认值并做 schema 校验，避免在转换 workflow 前因为历史字段缺失报错。
 */
export const normalizeSimpleImportForm = (config: Record<string, unknown>) => {
  const defaultForm = getDefaultAppForm();
  const form = {
    ...defaultForm,
    ...config,
    aiSettings: {
      ...defaultForm.aiSettings,
      ...((config.aiSettings as Record<string, unknown> | undefined) || {})
    },
    dataset: {
      ...defaultForm.dataset,
      ...((config.dataset as Record<string, unknown> | undefined) || {})
    },
    selectedTools: Array.isArray(config.selectedTools) ? config.selectedTools : [],
    selectedAgentSkills: Array.isArray(config.selectedAgentSkills)
      ? config.selectedAgentSkills
      : [],
    chatConfig: {
      ...defaultForm.chatConfig,
      ...((config.chatConfig as Record<string, unknown> | undefined) || {})
    }
  };

  return AppFormEditFormV1TypeSchema.safeParse(form);
};

export const resolveImportAppType = (config: Record<string, unknown>) => {
  const metaType = config.type;

  if (metaType !== undefined) {
    if (!isSupportedImportAppType(metaType)) {
      return '';
    }

    return metaType;
  }

  if ('nodes' in config && !Array.isArray(config.nodes)) {
    return '';
  }

  try {
    return getAppType(config as any);
  } catch {
    return '';
  }
};

/**
 * 解析工作台 JSON 导入配置。
 *
 * 顶层 `type` 存在时按导出元信息校验业务结构；无 `type` 时回退
 * 现有 `getAppType` 结构识别逻辑，以兼容老版本导出 JSON。
 */
export const parseDashboardImportConfig = ({
  config,
  scene,
  t
}: {
  config: unknown;
  scene: JsonImportModalScene;
  t: any;
}): ParsedImportConfig => {
  if (!config || typeof config !== 'object') {
    throw new Error(t('app:type_not_recognized'));
  }

  const workflowConfig = config as Record<string, unknown>;
  const appType = resolveImportAppType(config as Record<string, unknown>);

  if (!appType) {
    throw new Error(t('app:type_not_recognized'));
  }

  if (!isDashboardImportAppTypeAllowed({ appType, scene })) {
    throw new Error(t('app:type_not_recognized'));
  }

  if (appType === AppTypeEnum.simple) {
    if (
      !workflowConfig.aiSettings ||
      typeof workflowConfig.aiSettings !== 'object' ||
      Array.isArray(workflowConfig.aiSettings)
    ) {
      throw new Error(t('app:type_not_recognized'));
    }

    const parsedForm = normalizeSimpleImportForm(workflowConfig);
    if (!parsedForm.success) {
      throw new Error(t('app:type_not_recognized'));
    }

    return {
      workflow: form2AppWorkflow(parsedForm.data as AppFormEditFormType, t),
      appType
    };
  }

  if (!Array.isArray(workflowConfig.nodes)) {
    throw new Error(t('app:type_not_recognized'));
  }

  const matchedStartNodeType = appType === AppTypeEnum.workflow ? 'workflowStart' : 'pluginInput';
  const hasMatchedStartNode = workflowConfig.nodes.some(
    (node) =>
      !!node &&
      typeof node === 'object' &&
      (node as { flowNodeType?: unknown }).flowNodeType === matchedStartNodeType
  );

  if (!hasMatchedStartNode) {
    throw new Error(t('app:type_not_recognized'));
  }

  return {
    workflow: normalizeWorkflowTemplateConfig({
      nodes: workflowConfig.nodes as StoreNodeItemType[],
      edges: Array.isArray(workflowConfig.edges)
        ? (workflowConfig.edges as StoreEdgeItemType[])
        : [],
      chatConfig: (workflowConfig.chatConfig || {}) as AppChatConfigType
    }),
    appType
  };
};

/**
 * 解析工作流详情内的 JSON 导入配置。
 *
 * 该入口只允许导入 workflow 配置。导出的 `name`、`intro` 等应用元信息
 * 只用于工作台新建应用，工作流内部导入时会忽略。
 */
export const parseWorkflowImportConfig = ({ config, t }: { config: unknown; t: any }) => {
  const { workflow, appType } = parseDashboardImportConfig({ config, scene: 'agent', t });

  if (appType !== AppTypeEnum.workflow) {
    throw new Error(t('app:type_not_recognized'));
  }

  return workflow;
};
