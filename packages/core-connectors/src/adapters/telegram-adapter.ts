import type {
  ConnectorAdapter,
  ConnectorContext,
  ConnectorFilter,
  ConnectorMetadataSchema,
  ConnectorName,
  ConnectorResult,
  MemoryFact,
  UserQuery,
} from '@personal-ai/core-domain';

/**
 * Telegram Bot connector (user's own bot token from BotFather).
 * Day-0, zero platform cost.
 */
const metadataSchema: ConnectorMetadataSchema = {
  fields: [
    { name: 'botToken', type: 'string', description: 'Telegram bot token (from @BotFather)' },
    { name: 'chatId', type: 'string', description: 'Target chat id (user or group)' },
  ],
};

export class TelegramAdapter implements ConnectorAdapter {
  readonly name: ConnectorName = 'telegram';
  readonly metadataSchema = metadataSchema;

  private botToken: string | undefined;
  private defaultChatId: string | undefined;

  constructor(botToken?: string, defaultChatId?: string) {
    this.botToken = botToken;
    this.defaultChatId = defaultChatId;
  }

  async isAuthorized(_userId: string): Promise<boolean> {
    return !!this.botToken;
  }

  scoreRelevance(query: UserQuery, _memory: MemoryFact[]): number {
    const q = query.text.toLowerCase();
    return /telegram|bot|message|notify/.test(q) ? 0.7 : 0.1;
  }

  buildFilter(query: UserQuery): ConnectorFilter {
    return { query: query.text };
  }

  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const f = (ctx.filter || {}) as Record<string, unknown>;
    const token = (typeof f.botToken === 'string' ? f.botToken : this.botToken) ?? '';
    const chatId = (typeof f.chatId === 'string' ? f.chatId : this.defaultChatId) ?? '';

    if (!token) {
      return { items: [], totalCount: 0, source: 'telegram' };
    }

    try {
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const me = (await meRes.json()) as { result?: { username?: string } };

      const items: ConnectorResult['items'] = [
        {
          id: 'bot-info',
          title: `Telegram bot: ${me.result?.username || 'connected'}`,
          snippet: 'Bot is reachable',
          metadata: { bot: true },
        },
      ];

      if (chatId) {
        items.push({
          id: 'chat-linked',
          title: `Linked chat ${chatId}`,
          snippet: 'Ready to send notifications or read via getUpdates in future',
        });
      }

      return { items, totalCount: items.length, source: 'telegram' };
    } catch {
      return { items: [], totalCount: 0, source: 'telegram' };
    }
  }

  /** 
   * Token refresh is handled by the Cloudflare Worker OAuth proxy.
   * This adapter assumes a valid token is injected via filter.token.
   * @see packages/cloudflare-server/src/index.ts OAuth refresh routes
   */
  async refreshToken(_userId: string): Promise<boolean> {
    return !!this.botToken;
  }
}
