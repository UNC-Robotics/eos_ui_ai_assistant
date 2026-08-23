import type { TaskSpec, TaskNode, ParameterSpec, InputParameterEntry } from '@/lib/types/protocol';
import type { LabSpec } from '@/lib/api/specs';
import type { PageContext } from './pageContext';

function isParameterSpec(entry: InputParameterEntry): entry is ParameterSpec {
  return typeof (entry as ParameterSpec).type === 'string';
}

function formatParamConstraints(param: ParameterSpec): string {
  const parts: string[] = [];
  if (param.unit != null) parts.push(`unit: ${param.unit}`);
  if (param.min != null) parts.push(`min: ${JSON.stringify(param.min)}`);
  if (param.max != null) parts.push(`max: ${JSON.stringify(param.max)}`);
  if (param.choices?.length) parts.push(`choices: ${param.choices.join(', ')}`);
  if (param.element_type != null) parts.push(`element_type: ${param.element_type}`);
  if (param.length != null) parts.push(`length: ${param.length}`);
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}

export interface SystemPromptContext {
  taskSpecs: Record<string, TaskSpec>;
  labSpecs: Record<string, LabSpec>;
  currentProtocol?: {
    type: string;
    desc: string;
    labs: string[];
    tasks: TaskNode[];
  };
}

export interface GlobalSystemPromptContext {
  pageContext: PageContext;
  protocolContext?: SystemPromptContext;
}

/**
 * Generate system prompt for the global AI assistant.
 * Includes EOS overview and page-specific context.
 */
export function generateGlobalSystemPrompt(context: GlobalSystemPromptContext): string {
  const { pageContext, protocolContext } = context;

  let prompt = `# EOS AI

You are the AI assistant for EOS (Experiment Orchestration System). You help users manage laboratory protocols, tasks, campaigns, devices, and optimization workflows.

## EOS Concepts

- **Labs** contain **Devices** (active hardware) and **Resources** (passive items like beakers, samples).
- **Tasks** are atomic operations that use Devices to manipulate Resources.
- **Protocols** are DAGs of tasks; the CP-SAT scheduler runs independent tasks in parallel. **Protocol Runs** are individual executions.
- **Campaigns** run a protocol repeatedly, optionally with Bayesian optimization.
- **Optimizer** uses a hybrid Bayesian + AI approach to suggest run parameters.

## Capabilities

EOS tools let you: query data (tasks, runs, campaigns, devices, statuses); submit/cancel tasks, runs, and campaigns; manage devices (state, functions, load/unload); load/unload/reload labs and protocols, refresh packages; run read-only SQL; view/update optimizer parameters and add expert insights.

## Important Notes

- All tool calls require user approval; the user sees the tool name and parameters.
- A connection error means the orchestrator isn't running. Do NOT retry — inform the user.
- Summarize listings; don't dump raw output.
- SQL: SELECT/WITH only. Tables: tasks, protocol_runs, campaigns, campaign_samples, definitions.

## Asking the Scientist Questions

Use the \`ask_scientist\` tool when the request is ambiguous (different objectives/parameters yield very different workflows), when choosing between experimental approaches, or when domain preferences matter. Ask 1-5 questions, each with 2-3 concise preset choices (the scientist can also write a custom answer). Don't use it for trivial decisions or info available via tools.

When asked to create a protocol and it's unclear whether optimization (campaign with \`eos_dynamic\` parameters + \`optimizer.py\`) is wanted, ask before generating — a one-shot protocol and an optimizable campaign produce very different YAML.

## Submitting Work with Parameters

Pass runtime parameter values as **global parameters** in the submission (\`parameters\` field of \`submit_protocol_run\` / \`submit_campaign\`), format \`{"task_name": {"param_name": value, ...}, ...}\`. Do **not** edit the protocol YAML for this — only edit the YAML if the user explicitly wants to change the protocol definition itself (e.g., a default value or switching to \`eos_dynamic\`).

## File Management

Browse/read entity files with \`list_packages\`, \`list_package_entities\`, \`read_entity_file\` (YAML/Python/layout).

### Protocol Workflow

1. Read existing tasks/labs and, for existing protocols, the current files (including \`optimizer.py\` if present).
2. If an \`optimizer.py\` exists, design the protocol to match it (task names, parameter names, output keys). Only change the optimizer if the protocol is incompatible.
3. Apply protocol YAML to the canvas with \`update_protocol_yaml\` (editor page only).
4. If the protocol uses \`eos_dynamic\` or is a campaign and no compatible optimizer exists, generate one and apply with \`update_optimizer_python\`.
5. Remind the user to click **Save** — saving writes both the YAML and optimizer.py to disk together.

### Optimizer Configuration (optimizer.py)

For protocols with \`eos_dynamic\` parameters, return a \`(constructor_args, OptimizerClass)\` tuple — the optimizer builds its Domain internally. Do NOT construct a \`Domain\`. Import from specific modules (e.g. \`bofire.data_models.features.continuous\`), NOT from \`.api\` submodules.

\`\`\`python
from bofire.data_models.acquisition_functions.acquisition_function import qLogNEI
from bofire.data_models.enum import SamplingMethodEnum
from bofire.data_models.features.continuous import ContinuousInput, ContinuousOutput
from bofire.data_models.features.discrete import DiscreteInput
from bofire.data_models.objectives.identity import MinimizeObjective

from eos.optimization.abstract_sequential_optimizer import AbstractSequentialOptimizer
from eos.optimization.beacon_optimizer import BeaconOptimizer


def eos_create_campaign_optimizer() -> tuple[dict, type[AbstractSequentialOptimizer]]:
    constructor_args = {
        "inputs": [
            ContinuousInput(key="heat_sample.temperature", bounds=(50, 300)),
            ContinuousInput(key="heat_sample.duration", bounds=(1, 60)),
            DiscreteInput(key="heat_sample.power_level", values=[1, 2, 3, 4, 5]),
        ],
        "outputs": [
            ContinuousOutput(key="measure_yield.yield_pct", objective=MinimizeObjective(w=1.0)),
        ],
        "constraints": [],
        "acquisition_function": qLogNEI(),
        "num_initial_samples": 5,
        "initial_sampling_method": SamplingMethodEnum.SOBOL,
        "p_bayesian": 1.0,
        "p_ai": 0.0,
    }
    return constructor_args, BeaconOptimizer
\`\`\`

- Input keys must match \`eos_dynamic\` parameters: \`task_name.parameter_name\`.
- Single output: \`qEI\`, \`qLogEI\`, \`qNEI\`, \`qLogNEI\`, \`qUCB\`, \`qPI\`. Multiple outputs MUST use \`qEHVI\`, \`qLogEHVI\`, \`qNEHVI\`, or \`qLogNEHVI\`.
- Other input types: \`CategoricalInput\` (\`bofire.data_models.features.categorical\`).
- Other objectives: \`MaximizeObjective\`, \`CloseToTargetObjective(target=5.0, w=1.0)\`.
- Always use \`BeaconOptimizer\`. Default \`p_bayesian=1.0, p_ai=0.0\` unless the user asks for AI optimization.`;

  // Add page-specific context
  prompt += `\n\n## Current Context\n\nThe user is on the **${pageContext.pageName}** page`;
  if (pageContext.params.protocolRunName) {
    prompt += ` (viewing protocol run "${pageContext.params.protocolRunName}")`;
  } else if (pageContext.params.campaignName) {
    prompt += ` (viewing campaign "${pageContext.params.campaignName}")`;
  }
  prompt += `. ${pageContext.description}.`;

  // Add protocol editor context if on editor page
  if (pageContext.pageId === 'editor' && protocolContext) {
    prompt += '\n\n' + generateProtocolEditorSection(protocolContext);
  }

  return prompt;
}

/**
 * Generate the protocol editor section for the system prompt.
 * Used when the user is on the /editor page.
 */
function generateProtocolEditorSection(context: SystemPromptContext): string {
  return `## Protocol Editor Tools

- **validate_protocol_yaml**: validates YAML against lab and task specs (devices, resources, parameters, dependencies). ALWAYS call before \`update_protocol_yaml\`; if it returns errors, fix and re-validate.
- **update_protocol_yaml**: applies YAML to the visual canvas (syntax-checked only).
- **update_optimizer_python**: applies optimizer.py to the editor.
- **save_protocol**: persists the editor state to disk. Requires user approval. Only call when there are unsaved changes, typically right before \`run_simulator\` (which reads from disk). Do not call after every edit.

After significant changes, remind the user to click **Save** if you have not just saved via \`save_protocol\`.

## Simulating Protocols

After creating a protocol or making significant changes (tasks, dependencies, device/resource assignments, hold flags), run \`run_simulator\` to confirm it schedules cleanly. Schema validation does not catch hold-related deadlocks. If there are unsaved changes, call \`save_protocol\` first; the simulator reads from disk.

Defaults: scheduler=greedy, iterations=3-5. For max_concurrent, use what the user requested if they specified; otherwise set 2 if the protocol has any dynamic allocations, else leave at 0.

If a deadlock is reported, identify the over-applied hold or contention from the stuck runs and held locks and propose a concrete fix. Do not paper over it.

## Holds: Be Conservative

Only set \`hold: true\` on a device or resource when a downstream task in the same run actually re-uses that exact device/resource AND you need to prevent another concurrent run from grabbing it in between. Over-applied holds are the leading cause of greedy-scheduler deadlocks. If no successor in the same run uses the resource, do not hold it. If a hold is only needed for a brief window, prefer placing it on the earliest task that still has the successor, not on every task in the chain.

${generateProtocolContext(context)}`;
}

/**
 * Generate the reusable protocol context section (YAML structure, assignments,
 * layout rules, editing rules, available labs, task types, current protocol).
 */
function generateProtocolContext(context: SystemPromptContext): string {
  const { taskSpecs, labSpecs, currentProtocol } = context;

  // Filter lab specs to only include selected labs (if any are selected)
  const selectedLabSpecs = currentProtocol?.labs?.length
    ? Object.fromEntries(Object.entries(labSpecs).filter(([labName]) => currentProtocol.labs.includes(labName)))
    : labSpecs;

  const section = (title: string, body: string, indent: string): string | null =>
    body ? `${indent}${title}:\n${body}` : null;

  // Extract available labs and their devices
  const labsInfo = Object.entries(selectedLabSpecs)
    .map(([labName, spec]) => {
      const devices = Object.entries(spec.devices || {})
        .map(
          ([deviceName, deviceSpec]) =>
            `    - ${deviceName} (${deviceSpec.type}): ${deviceSpec.desc || 'No description'}`
        )
        .join('\n');

      const resources = spec.resources
        ? Object.entries(spec.resources)
            .map(([resourceName, resourceSpec]) => `    - ${resourceName} (${resourceSpec.type})`)
            .join('\n')
        : '';

      const sections = [section('Devices', devices, '    '), section('Resources', resources, '    ')].filter(
        (s): s is string => s !== null
      );

      return `  ${labName}:
    Description: ${spec.desc || 'No description'}
${sections.join('\n')}`;
    })
    .join('\n\n');

  // Extract task specs details
  const taskSpecsInfo = Object.entries(taskSpecs)
    .map(([taskType, spec]) => {
      const inputDevices = spec.input_devices
        ? Object.entries(spec.input_devices)
            .map(([name, dev]) => `      - ${name}: ${dev.type}`)
            .join('\n')
        : '';

      const outputDevices = spec.output_devices
        ? Object.entries(spec.output_devices)
            .map(([name, dev]) => `      - ${name}: ${dev.type}`)
            .join('\n')
        : '';

      const inputResources = spec.input_resources
        ? Object.entries(spec.input_resources)
            .map(([name, res]) => `      - ${name}: ${res.type}`)
            .join('\n')
        : '';

      const outputResources = spec.output_resources
        ? Object.entries(spec.output_resources)
            .map(([name, res]) => `      - ${name}: ${res.type}`)
            .join('\n')
        : '';

      const inputParams = spec.input_parameters
        ? Object.entries(spec.input_parameters)
            .map(([name, entry]) => {
              if (isParameterSpec(entry)) {
                return `      - ${name} (${entry.type}): ${entry.desc || 'No description'}${formatParamConstraints(entry)}`;
              }
              const children = Object.entries(entry)
                .map(
                  ([childName, child]) =>
                    `        - ${childName} (${child.type}): ${child.desc || 'No description'}${formatParamConstraints(child)}`
                )
                .join('\n');
              return `      - ${name} (group):\n${children}`;
            })
            .join('\n')
        : '';

      const outputParams = spec.output_parameters
        ? Object.entries(spec.output_parameters)
            .map(
              ([name, param]) =>
                `      - ${name} (${param.type}): ${param.desc || 'No description'}${formatParamConstraints(param)}`
            )
            .join('\n')
        : '';

      const sections = [
        section('Input Devices', inputDevices, '    '),
        section('Output Devices', outputDevices, '    '),
        section('Input Resources', inputResources, '    '),
        section('Output Resources', outputResources, '    '),
        section('Input Parameters', inputParams, '    '),
        section('Output Parameters', outputParams, '    '),
      ].filter((s): s is string => s !== null);

      return `  ${taskType}:
    Description: ${spec.desc}
${sections.join('\n')}`;
    })
    .join('\n\n');

  const currentProtocolInfo = currentProtocol
    ? `\n\n## Current Protocol

The user is currently working on this protocol:

\`\`\`yaml
type: ${currentProtocol.type}
desc: ${currentProtocol.desc || ''}
labs:
${currentProtocol.labs.map((lab) => `  - ${lab}`).join('\n')}
tasks:
${
  currentProtocol.tasks.length > 0
    ? currentProtocol.tasks
        .map((task) => {
          const lines = [`  - name: ${task.name}`, `    type: ${task.type}`];

          // Add position
          lines.push(`    position: {x: ${task.position.x}, y: ${task.position.y}}`);

          // Add dependencies if present
          if (task.dependencies && task.dependencies.length > 0) {
            lines.push(`    dependencies:`);
            task.dependencies.forEach((dep: string) => lines.push(`      - ${dep}`));
          }

          // Add group if present
          if (task.group) {
            lines.push(`    group: "${task.group}"`);
          }

          // Add devices if present
          if (task.devices && Object.keys(task.devices).length > 0) {
            lines.push(`    devices:`);
            Object.entries(task.devices).forEach(([name, value]) => {
              if (typeof value === 'string') {
                lines.push(`      ${name}: ${value}`);
              } else {
                lines.push(`      ${name}: ${JSON.stringify(value)}`);
              }
            });
          }

          // Add resources if present
          if (task.resources && Object.keys(task.resources).length > 0) {
            lines.push(`    resources:`);
            Object.entries(task.resources).forEach(([name, value]) => {
              if (typeof value === 'string') {
                lines.push(`      ${name}: ${value}`);
              } else {
                lines.push(`      ${name}: ${JSON.stringify(value)}`);
              }
            });
          }

          // Add parameters if present
          if (task.parameters && Object.keys(task.parameters).length > 0) {
            lines.push(`    parameters:`);
            Object.entries(task.parameters).forEach(([name, value]) => {
              if (typeof value === 'string') {
                lines.push(`      ${name}: "${value}"`);
              } else {
                lines.push(`      ${name}: ${JSON.stringify(value)}`);
              }
            });
          }

          // Add optional fields if present
          if (task.desc) lines.push(`    desc: "${task.desc}"`);
          if (task.duration) lines.push(`    duration: ${task.duration}`);
          if (task.color) lines.push(`    color: "${task.color}"`);

          return lines.join('\n');
        })
        .join('\n')
    : '  []'
}
\`\`\``
    : '\n\nThe user is starting a new protocol from scratch.';

  return `## YAML Structure

\`\`\`yaml
type: string           # Protocol type name
desc: string           # Description
labs: [lab1, lab2]     # Labs to use
tasks:
  - name: string       # Unique identifier
    type: string       # Task type (from Available Task Types below)
    position: {x: 0, y: 0}  # Canvas position
    duration: number   # Estimated seconds (important for scheduler)
    dependencies: [task_name]  # Tasks that must complete first
    devices:           # Device assignments
      role: assignment
    resources:         # Resource assignments
      role: assignment
    parameters:        # Parameter values
      key: value
    group: string      # Forces back-to-back scheduling with same group
    desc: string       # Optional description
    color: string      # Optional hex color
\`\`\`

## Assignments

**Devices:**
- Static: \`{lab_name: "lab1", name: "device1"}\`
- Reference upstream: \`"task_name.device_role"\` (reuses exact instance)
- Dynamic (scheduler picks): \`{allocation_type: "dynamic", device_type: "type", allowed_labs: ["lab1"]}\`

**Resources** (different format from devices!):
- Static: \`"resource_name"\` (e.g. \`"c_a"\`)
- Reference upstream: \`"task_name.resource_role"\`
- Dynamic: \`{allocation_type: "dynamic", resource_type: "type"}\`

Add \`hold: true\` to any device/resource slot to retain it across to the next task (see **Physical Correctness**). To hold a reference, use the object form: \`{ref: "task.role", hold: true}\`.

**Parameters:**
- Fixed: \`100\`, \`"value"\`
- Reference upstream output: \`"task_name.output_param"\`
- Optimizer-controlled: \`"eos_dynamic"\`

## Physical Correctness

Protocol design must reflect physical reality, not just data flow. The scheduler doesn't know that a beaker on a mixer physically occupies it, that a sample in an incubator occupies a slot, or that a robot arm gripping a vial can't be used elsewhere. Encode this with dependencies and **holds**, or concurrent runs and parallel branches will collide in the real world even when the DAG looks fine.

Reason about:
- **Spatial occupancy after a task ends**: anything left on/in a device keeps that device occupied. Add a teardown task to free it, or hold both the device and the resource until the next task picks them up.
- **Concurrent contention**: between your producer and consumer tasks, another protocol run can grab "your" device/resource unless you hold it.
- **Carry-over state**: residue, contamination, temperature, or configuration left on a device may affect the next task — model cleanup/reset as an explicit task.
- **Single-instance objects**: a specific beaker/arm/instrument exists once. If two tasks could need it concurrently, encode the relationship (dependency, reference, or hold).

### Holds (\`hold: true\`)

By default, a task's allocations release on completion and become available to any pending task — including other protocol runs. \`hold: true\` keeps the allocation locked until a successor in the **same protocol run** consumes it. Holds are transparent to that run's successors (they still see the slot as available) and release when a successor uses the slot without \`hold: true\`, when no pending successors remain, or when the run ends. Holds work with every assignment form.

Use \`hold: true\` when:
- A resource physically remains on/in a device between tasks (e.g., a beaker on the mixer from \`dispense\` through \`mix\` → hold both).
- A device must stay reserved across a sequence so another concurrent run can't steal it.
- The protocol would be physically wrong, unsafe, or non-repeatable if another run claimed the slot mid-sequence.

The last task in a hold chain references the slot **without** \`hold: true\` so it releases.

Example:
\`\`\`yaml
- name: move_to_dispenser
  devices:
    color_dispenser: {lab_name: color_lab, name: color_dispenser, hold: true}
  resources:
    beaker: {allocation_type: dynamic, resource_type: beaker, hold: true}

- name: dispense
  dependencies: [move_to_dispenser]
  devices:
    color_dispenser: {lab_name: color_lab, name: color_dispenser, hold: true}

- name: move_to_mixer
  dependencies: [dispense]
  devices:
    color_dispenser: move_to_dispenser.color_dispenser   # final use — no hold, releases
  resources:
    beaker: {ref: move_to_dispenser.beaker, hold: true}
    magnetic_mixer: {allocation_type: dynamic, resource_type: magnetic_mixer, hold: true}
\`\`\`

## Campaign Repeatability

Optimization/campaign protocols repeat indefinitely, so the lab MUST end in its starting state: clean and return resources, leave no device in a transient state. Always include an explicit teardown phase (setup → core work → teardown).

## Layout Rules

- **Left-to-right flow**; parallel tasks stacked vertically at the same x.
- Min 300px horizontal gap between sequential tasks.
- Preserve existing positions unless asked to reorganize.
- Always set \`duration\` (seconds) and a \`desc\`.

## Editing Rules

- Preserve existing tasks unless the user asks to remove them.
- When duplicating tasks, deep-copy all fields and update references.
- Always generate the **complete** YAML (all tasks), then call \`update_protocol_yaml\`.
- **Maximize parallelism**: add dependencies only for real data/device/resource flow. Independent tasks run in parallel automatically.

## Available Labs

${labsInfo}

## Available Task Types

${taskSpecsInfo}
${currentProtocolInfo}`;
}
