/**
 * EOS tools that change lab or orchestrator state and therefore require
 * explicit user approval before they run.
 *
 * The agent harness marks these `needsApproval`, which makes the AI SDK pause
 * the tool loop and emit an approval request to the client instead of calling
 * the tool. Nothing runs until the user answers.
 */
export const MUTATING_TOOLS = new Set([
  // Tasks
  'submit_task',
  'cancel_task',
  // Protocol Runs
  'submit_protocol_run',
  'cancel_protocol_run',
  // Campaigns
  'submit_campaign',
  'cancel_campaign',
  // Optimizer
  'update_optimizer_params',
  'add_optimizer_insight',
  // Devices
  'call_device_function',
  'load_devices',
  'unload_devices',
  'reload_devices',
  // Management
  'load_labs',
  'unload_labs',
  'reload_labs',
  'load_protocols',
  'unload_protocols',
  'reload_protocols',
  'reload_task_plugins',
]);

/**
 * Tools the client resolves itself: the model calls them, the browser does the
 * work (or asks the scientist), and the answer is sent back as the tool result.
 * They are declared to the model without an `execute` function.
 */
export const CLIENT_TOOLS = new Set(['save_protocol', 'ask_scientist']);
