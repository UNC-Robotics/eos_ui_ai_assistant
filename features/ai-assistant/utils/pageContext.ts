export type PageId =
  | 'editor'
  | 'tasks'
  | 'protocol-runs'
  | 'protocol-run-detail'
  | 'campaigns'
  | 'campaign-detail'
  | 'device-inspector'
  | 'management'
  | 'files'
  | 'home';

export interface PageContext {
  pageId: PageId;
  pageName: string;
  description: string;
  params: Record<string, string>;
}

const PAGE_PATTERNS: Array<{
  pattern: RegExp;
  pageId: PageId;
  pageName: string;
  description: string;
  paramNames?: string[];
}> = [
  {
    pattern: /^\/editor/,
    pageId: 'editor',
    pageName: 'Protocol Editor',
    description: 'Visual protocol editor for creating and editing protocol workflows',
  },
  {
    pattern: /^\/protocol-runs\/([^/]+)$/,
    pageId: 'protocol-run-detail',
    pageName: 'Protocol Run Details',
    description: 'Viewing details and execution status of a specific protocol run',
    paramNames: ['protocolRunName'],
  },
  {
    pattern: /^\/protocol-runs/,
    pageId: 'protocol-runs',
    pageName: 'Protocol Runs',
    description: 'Listing and managing protocol runs',
  },
  {
    pattern: /^\/campaigns\/([^/]+)$/,
    pageId: 'campaign-detail',
    pageName: 'Campaign Details',
    description: 'Viewing details and optimization results of a specific campaign',
    paramNames: ['campaignName'],
  },
  {
    pattern: /^\/campaigns/,
    pageId: 'campaigns',
    pageName: 'Campaigns',
    description: 'Listing and managing campaigns',
  },
  {
    pattern: /^\/tasks/,
    pageId: 'tasks',
    pageName: 'Tasks',
    description: 'Listing and managing tasks',
  },
  {
    pattern: /^\/devices\/inspect/,
    pageId: 'device-inspector',
    pageName: 'Device Inspector',
    description: 'Inspecting and interacting with lab devices',
  },
  {
    pattern: /^\/management/,
    pageId: 'management',
    pageName: 'Management',
    description: 'System management: loading/unloading labs, protocols, task plugins',
  },
  {
    pattern: /^\/files/,
    pageId: 'files',
    pageName: 'Files',
    description: 'Browsing protocol run output files',
  },
];

export function getPageContext(pathname: string): PageContext {
  for (const { pattern, pageId, pageName, description, paramNames } of PAGE_PATTERNS) {
    const match = pathname.match(pattern);
    if (match) {
      const params: Record<string, string> = {};
      if (paramNames) {
        paramNames.forEach((name, i) => {
          if (match[i + 1]) params[name] = decodeURIComponent(match[i + 1]);
        });
      }
      return { pageId, pageName, description, params };
    }
  }

  return {
    pageId: 'home',
    pageName: 'Home',
    description: 'EOS home page',
    params: {},
  };
}
