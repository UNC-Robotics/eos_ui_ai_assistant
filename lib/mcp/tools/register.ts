import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTaskTools } from './tasks';
import { registerProtocolTools } from './protocols';
import { registerCampaignTools } from './campaigns';
import { registerDefinitionTools } from './definitions';
import { registerManagementTools } from './management';
import { registerOptimizerTools } from './optimizer';
import { registerSqlTools } from './sql';
import { registerDeviceTools } from './devices';
import { registerFilesystemTools } from './filesystem';
import { registerRagTools } from './rag';
import { registerSimulatorTools } from './simulator';

export function registerAllTools(server: McpServer) {
  registerTaskTools(server);
  registerProtocolTools(server);
  registerCampaignTools(server);
  registerDefinitionTools(server);
  registerManagementTools(server);
  registerOptimizerTools(server);
  registerDeviceTools(server);
  registerSqlTools(server);
  registerFilesystemTools(server);
  registerRagTools(server);
  registerSimulatorTools(server);
}
