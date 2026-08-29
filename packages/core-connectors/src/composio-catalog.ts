/**
 * Composio catalog — maps Composio toolkit slugs to Personal AI connector entries.
 *
 * These are the OAuth connectors that will be handled via Composio managed auth
 * instead of direct adapter implementations. Zero-auth connectors (Weather, RSS,
 * Wikipedia, etc.) remain as direct adapters and are NOT in this catalog.
 */

export interface ComposioToolkitEntry {
  /** Composio toolkit slug (e.g., 'GMAIL', 'GOOGLEDRIVE') */
  toolkit: string;
  /** Personal AI connector ID */
  connectorId: string;
  /** Display label */
  label: string;
  /** Ionicons icon name */
  icon: string;
  /** Human-readable description */
  description: string;
  /** API cost tier */
  cost: 'free' | 'free-tier' | 'paid';
  /** Composio managed auth available? */
  managedAuth: boolean;
}

/**
 * Composio managed-auth toolkits relevant for Indian users.
 * All 121 managed toolkits are available on free tier (20K calls/mo).
 */
export const COMPOSIO_MANAGED_TOOLKITS: ComposioToolkitEntry[] = [
  // ── Google Suite ──
  {
    toolkit: 'GMAIL',
    connectorId: 'composio-gmail',
    label: 'Gmail',
    icon: 'mail',
    description: 'Read, search, and send emails via Gmail',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'GOOGLEDRIVE',
    connectorId: 'composio-google-drive',
    label: 'Google Drive',
    icon: 'cloud-done',
    description: 'Search and read files from Google Drive',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'GOOGLECALENDAR',
    connectorId: 'composio-google-calendar',
    label: 'Google Calendar',
    icon: 'calendar',
    description: 'Read and manage Google Calendar events',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'GOOGLESHEETS',
    connectorId: 'composio-google-sheets',
    label: 'Google Sheets',
    icon: 'grid',
    description: 'Read and write Google Sheets data',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'GOOGLEDOCS',
    connectorId: 'composio-google-docs',
    label: 'Google Docs',
    icon: 'document-text',
    description: 'Read and create Google Docs',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'GOOGLETASKS',
    connectorId: 'composio-google-tasks',
    label: 'Google Tasks',
    icon: 'checkbox',
    description: 'Manage Google Tasks and to-do lists',
    cost: 'free',
    managedAuth: true,
  },

  // ── Microsoft ──
  {
    toolkit: 'OUTLOOK',
    connectorId: 'composio-outlook',
    label: 'Outlook Mail',
    icon: 'mail',
    description: 'Read and send emails via Outlook/Microsoft 365',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'ONE_DRIVE',
    connectorId: 'composio-onedrive',
    label: 'OneDrive',
    icon: 'cloud',
    description: 'Browse and search OneDrive files',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'MICROSOFT_TEAMS',
    connectorId: 'composio-teams',
    label: 'Microsoft Teams',
    icon: 'people',
    description: 'Read and send Teams messages',
    cost: 'free',
    managedAuth: true,
  },

  // ── Social / Messaging ──
  {
    toolkit: 'INSTAGRAM',
    connectorId: 'composio-instagram',
    label: 'Instagram',
    icon: 'logo-instagram',
    description: 'Read Instagram posts and insights',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'FACEBOOK',
    connectorId: 'composio-facebook',
    label: 'Facebook',
    icon: 'logo-facebook',
    description: 'Read Facebook pages and posts',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'LINKEDIN',
    connectorId: 'composio-linkedin',
    label: 'LinkedIn',
    icon: 'logo-linkedin',
    description: 'Read LinkedIn profile and posts',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'SLACK',
    connectorId: 'composio-slack',
    label: 'Slack',
    icon: 'logo-slack',
    description: 'Read and send Slack messages',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'REDDIT',
    connectorId: 'composio-reddit',
    label: 'Reddit',
    icon: 'logo-reddit',
    description: 'Search and read Reddit discussions',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'DISCORD',
    connectorId: 'composio-discord',
    label: 'Discord',
    icon: 'logo-discord',
    description: 'Read and send Discord messages',
    cost: 'free',
    managedAuth: true,
  },

  // ── Productivity ──
  {
    toolkit: 'NOTION',
    connectorId: 'composio-notion',
    label: 'Notion',
    icon: 'document-text',
    description: 'Read and search Notion workspace',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'TODOIST',
    connectorId: 'composio-todoist',
    label: 'Todoist',
    icon: 'briefcase',
    description: 'Manage Todoist tasks and projects',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'TRELLO',
    connectorId: 'composio-trello',
    label: 'Trello',
    icon: 'layers',
    description: 'Read and manage Trello boards',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'CLICKUP',
    connectorId: 'composio-clickup',
    label: 'ClickUp',
    icon: 'fitness',
    description: 'Manage ClickUp tasks and spaces',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'DROPBOX',
    connectorId: 'composio-dropbox',
    label: 'Dropbox',
    icon: 'cloud',
    description: 'Access files in Dropbox',
    cost: 'free',
    managedAuth: true,
  },

  // ── Developer ──
  {
    toolkit: 'GITHUB',
    connectorId: 'composio-github',
    label: 'GitHub',
    icon: 'logo-github',
    description: 'Search repos, read code, manage issues',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'GITLAB',
    connectorId: 'composio-gitlab',
    label: 'GitLab',
    icon: 'git-branch',
    description: 'Read and manage GitLab projects',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'LINEAR',
    connectorId: 'composio-linear',
    label: 'Linear',
    icon: 'pulse',
    description: 'Manage Linear issues and projects',
    cost: 'free',
    managedAuth: true,
  },

  // ── Creative ──
  {
    toolkit: 'CANVA',
    connectorId: 'composio-canva',
    label: 'Canva',
    icon: 'color-palette',
    description: 'Create and edit Canva designs',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'SPOTIFY',
    connectorId: 'composio-spotify',
    label: 'Spotify',
    icon: 'musical-notes',
    description: 'Search tracks, artists, and playlists',
    cost: 'free',
    managedAuth: true,
  },

  // ── CRM / Business ──
  {
    toolkit: 'HUBSPOT',
    connectorId: 'composio-hubspot',
    label: 'HubSpot',
    icon: 'share',
    description: 'Manage HubSpot contacts and deals',
    cost: 'free',
    managedAuth: true,
  },
  {
    toolkit: 'SALESFORCE',
    connectorId: 'composio-salesforce',
    label: 'Salesforce',
    icon: 'trending-up',
    description: 'Read and manage Salesforce data',
    cost: 'free',
    managedAuth: true,
  },

  // ── Communication ──
  {
    toolkit: 'ZOOM',
    connectorId: 'composio-zoom',
    label: 'Zoom',
    icon: 'videocam',
    description: 'Schedule and manage Zoom meetings',
    cost: 'free',
    managedAuth: true,
  },

  // ── File Storage ──
  {
    toolkit: 'BOX',
    connectorId: 'composio-box',
    label: 'Box',
    icon: 'cube',
    description: 'Access files in Box',
    cost: 'free',
    managedAuth: true,
  },

  // ── Browser / automation platforms (connectors, not MCP provider tiles) ──
  {
    toolkit: 'BROWSERBASE',
    connectorId: 'composio-browserbase',
    label: 'Browserbase',
    icon: 'globe',
    description: 'Cloud browser sessions for agent web interaction',
    cost: 'free-tier',
    managedAuth: true,
  },
  {
    toolkit: 'ZAPIER',
    connectorId: 'composio-zapier',
    label: 'Zapier',
    icon: 'flash',
    description: 'Thousands of SaaS actions via Zapier',
    cost: 'free-tier',
    managedAuth: true,
  },
];

/**
 * Build a quick lookup map: connectorId → ComposioToolkitEntry
 */
export const COMPOSIO_CONNECTOR_MAP = new Map(
  COMPOSIO_MANAGED_TOOLKITS.map((e) => [e.connectorId, e]),
);

/**
 * Build a quick lookup map: toolkit slug → connectorId
 */
export const COMPOSIO_TOOLKIT_MAP = new Map(
  COMPOSIO_MANAGED_TOOLKITS.map((e) => [e.toolkit, e.connectorId]),
);
