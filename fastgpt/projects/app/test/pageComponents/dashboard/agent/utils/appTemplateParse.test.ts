import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { CreateAppBodySchema } from '@fastgpt/global/openapi/core/app/common/api';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

vi.mock('@/pageComponents/app/detail/Edit/SimpleApp/utils', () => ({
  form2AppWorkflow: vi.fn((data) => ({
    nodes: [
      {
        flowNodeType: 'workflowStart',
        formData: data
      }
    ],
    edges: [],
    chatConfig: data.chatConfig
  }))
}));

const {
  normalizeSimpleImportForm,
  normalizeWorkflowTemplateConfig,
  parseDashboardImportConfig,
  parseWorkflowImportConfig,
  resolveImportAppType,
  isDashboardImportAppTypeAllowed
} = await import('@/pageComponents/dashboard/agent/utils/appTemplateParse');

const t = (key: string) => key;

const createSimpleConfig = (extra: Record<string, unknown> = {}) => ({
  aiSettings: {
    model: 'gpt-4o',
    isResponseAnswerText: true,
    maxHistories: 6
  },
  dataset: {
    datasets: [],
    similarity: 0.4,
    limit: 3000,
    searchMode: DatasetSearchModeEnum.embedding,
    usingReRank: true,
    rerankModel: '',
    rerankWeight: 0.5,
    datasetSearchUsingExtensionQuery: true,
    datasetSearchExtensionBg: ''
  },
  selectedTools: [],
  selectedAgentSkills: [],
  chatConfig: {},
  ...extra
});

describe('normalizeSimpleImportForm', () => {
  it('should fill missing simple form arrays and default fields', () => {
    const result = normalizeSimpleImportForm({
      aiSettings: {
        model: 'gpt-4o',
        isResponseAnswerText: true,
        maxHistories: 3
      },
      dataset: {
        datasets: []
      },
      chatConfig: {}
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.selectedTools).toEqual([]);
    expect(result.data.selectedAgentSkills).toEqual([]);
    expect(result.data.dataset.limit).toBe(3000);
    expect(result.data.dataset.searchMode).toBe(DatasetSearchModeEnum.embedding);
  });
});

describe('normalizeWorkflowTemplateConfig', () => {
  it('should make old hidden valueType templates valid for create app schema', () => {
    const workflow = normalizeWorkflowTemplateConfig({
      nodes: [
        {
          nodeId: 'userGuide',
          flowNodeType: 'userGuide',
          name: 'User guide',
          inputs: [
            {
              key: 'welcomeText',
              label: 'Welcome',
              valueType: WorkflowIOValueTypeEnum.string
            },
            {
              key: 'questionGuide',
              label: 'Question guide',
              valueType: 'hidden',
              value: {
                open: false
              }
            }
          ],
          outputs: [
            {
              id: 'invalid-output',
              key: 'invalidOutput',
              label: 'Invalid output',
              valueDesc: 'Invalid output',
              type: [FlowNodeOutputTypeEnum.static],
              valueType: 'legacy'
            }
          ]
        } as any
      ],
      edges: [],
      chatConfig: {}
    });

    expect((workflow.nodes[0].inputs[0] as any).renderTypeList).toEqual([
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.reference
    ]);
    expect((workflow.nodes[0].inputs[1] as any).valueType).toBe(WorkflowIOValueTypeEnum.any);
    expect((workflow.nodes[0].inputs[1] as any).renderTypeList).toContain(
      FlowNodeInputTypeEnum.hidden
    );
    expect((workflow.nodes[0].outputs[0] as any).valueType).toBe(WorkflowIOValueTypeEnum.any);
    expect((workflow.nodes[0].outputs[0] as any).type).toBe(FlowNodeOutputTypeEnum.static);

    const result = CreateAppBodySchema.safeParse({
      name: 'Github Issue Summary',
      type: AppTypeEnum.workflow,
      modules: workflow.nodes,
      edges: workflow.edges,
      chatConfig: workflow.chatConfig,
      templateId: 'community-githubIssue'
    });

    expect(result.success).toBe(true);
  });

  it('should normalize legacy chat config variables for create app schema', () => {
    const workflow = normalizeWorkflowTemplateConfig({
      nodes: [
        {
          nodeId: 'workflowStart',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [],
          outputs: [
            {
              id: 'query',
              key: 'query',
              type: [FlowNodeOutputTypeEnum.static],
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        } as any
      ],
      edges: [],
      chatConfig: {
        variables: [
          {
            key: 'target_language',
            label: 'Target language',
            type: VariableInputEnum.select,
            valueType: WorkflowIOValueTypeEnum.string,
            enums: [{ value: 'English' }, { label: 'Chinese' }, 'Japanese']
          }
        ]
      } as any
    });

    const variable = workflow.chatConfig?.variables?.[0] as any;

    expect(variable.description).toBe('');
    expect(variable.enums).toEqual([
      { value: 'English', label: 'English' },
      { label: 'Chinese', value: 'Chinese' },
      { label: 'Japanese', value: 'Japanese' }
    ]);
    expect((workflow.nodes[0].outputs[0] as any).type).toBe(FlowNodeOutputTypeEnum.static);

    const result = CreateAppBodySchema.safeParse({
      name: 'Legacy chat config',
      type: AppTypeEnum.workflow,
      modules: workflow.nodes,
      edges: workflow.edges,
      chatConfig: workflow.chatConfig
    });

    expect(result.success).toBe(true);
  });
});

describe('resolveImportAppType', () => {
  it('should prefer supported top-level type from new JSON', () => {
    expect(
      resolveImportAppType({
        type: AppTypeEnum.workflow,
        nodes: [{ flowNodeType: 'pluginInput' }]
      })
    ).toBe(AppTypeEnum.workflow);
  });

  it('should reject chatAgent and unknown top-level type', () => {
    expect(resolveImportAppType({ type: AppTypeEnum.chatAgent })).toBe('');
    expect(resolveImportAppType({ type: 'workflow' })).toBe('');
  });

  it('should fall back to old JSON structure detection when type is missing', () => {
    expect(resolveImportAppType(createSimpleConfig())).toBe(AppTypeEnum.simple);
    expect(
      resolveImportAppType({
        nodes: [{ flowNodeType: 'workflowStart' }],
        edges: []
      })
    ).toBe(AppTypeEnum.workflow);
    expect(
      resolveImportAppType({
        nodes: [{ flowNodeType: 'pluginInput' }],
        edges: []
      })
    ).toBe(AppTypeEnum.workflowTool);
  });

  it('should return empty type for malformed node list items', () => {
    expect(
      resolveImportAppType({
        nodes: [null]
      })
    ).toBe('');
  });
});

describe('parseDashboardImportConfig', () => {
  it('should parse simple JSON in agent dashboard and ignore import meta', () => {
    const result = parseDashboardImportConfig({
      config: createSimpleConfig({
        type: AppTypeEnum.simple,
        name: 'Simple app',
        intro: 'Simple intro'
      }),
      scene: 'agent',
      t
    });

    expect(result.appType).toBe(AppTypeEnum.simple);
    expect(result.workflow.nodes[0].flowNodeType).toBe('workflowStart');
    expect((result.workflow.nodes[0] as any).formData).not.toHaveProperty('type');
    expect((result.workflow.nodes[0] as any).formData).not.toHaveProperty('name');
    expect((result.workflow.nodes[0] as any).formData).not.toHaveProperty('intro');
  });

  it('should parse workflow JSON in agent dashboard', () => {
    const result = parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        name: 'Workflow',
        intro: 'Workflow intro',
        nodes: [{ flowNodeType: 'workflowStart' }],
        edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
        chatConfig: { welcomeText: 'hello' }
      },
      scene: 'agent',
      t
    });

    expect(result).toEqual({
      appType: AppTypeEnum.workflow,
      workflow: {
        nodes: [{ flowNodeType: 'workflowStart', inputs: [], outputs: [] }],
        edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
        chatConfig: { welcomeText: 'hello' }
      }
    });
  });

  it('should parse workflow tool JSON in tool dashboard', () => {
    const result = parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflowTool,
        nodes: [{ flowNodeType: 'pluginInput' }],
        edges: []
      },
      scene: 'tool',
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
  });

  it('should reject workflow tool JSON in agent dashboard', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.workflowTool,
          nodes: [{ flowNodeType: 'pluginInput' }],
          edges: []
        },
        scene: 'agent',
        t
      })
    ).toThrow('app:type_not_recognized');
  });

  it('should reject simple and workflow JSON in tool dashboard', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: createSimpleConfig({
          type: AppTypeEnum.simple
        }),
        scene: 'tool',
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [{ flowNodeType: 'workflowStart' }],
          edges: []
        },
        scene: 'tool',
        t
      })
    ).toThrow('app:type_not_recognized');
  });

  it('should reject chatAgent and unknown typed JSON with existing type_not_recognized text', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: { type: AppTypeEnum.chatAgent },
        scene: 'agent',
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseDashboardImportConfig({
        config: { type: 'workflow' },
        scene: 'agent',
        t
      })
    ).toThrow('app:type_not_recognized');
  });

  it('should reject top-level type and structure mismatch', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [{ flowNodeType: 'pluginInput' }],
          edges: []
        },
        scene: 'agent',
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.simple,
          nodes: [{ flowNodeType: 'workflowStart' }],
          edges: []
        },
        scene: 'agent',
        t
      })
    ).toThrow('app:type_not_recognized');
  });

  it('should reject malformed old workflow JSON safely', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: {
          nodes: {}
        },
        scene: 'agent',
        t
      })
    ).toThrow('app:type_not_recognized');
  });
});

describe('isDashboardImportAppTypeAllowed', () => {
  it('should match app type with dashboard scene', () => {
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.simple, scene: 'agent' })).toBe(
      true
    );
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflow, scene: 'agent' })).toBe(
      true
    );
    expect(
      isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflowTool, scene: 'agent' })
    ).toBe(false);
    expect(
      isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflowTool, scene: 'tool' })
    ).toBe(true);
  });
});

describe('parseWorkflowImportConfig', () => {
  it('should parse workflow JSON and ignore app meta in workflow detail import', () => {
    const result = parseWorkflowImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        name: 'Workflow name',
        intro: 'Workflow intro',
        nodes: [{ flowNodeType: 'workflowStart' }],
        edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
        chatConfig: { welcomeText: 'hello' }
      },
      t
    });

    expect(result).toEqual({
      nodes: [{ flowNodeType: 'workflowStart', inputs: [], outputs: [] }],
      edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
      chatConfig: { welcomeText: 'hello' }
    });
  });

  it('should reject non-workflow JSON in workflow detail import', () => {
    expect(() =>
      parseWorkflowImportConfig({
        config: {
          type: AppTypeEnum.workflowTool,
          nodes: [{ flowNodeType: 'pluginInput' }],
          edges: []
        },
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseWorkflowImportConfig({
        config: createSimpleConfig({
          type: AppTypeEnum.simple
        }),
        t
      })
    ).toThrow('app:type_not_recognized');
  });
});
