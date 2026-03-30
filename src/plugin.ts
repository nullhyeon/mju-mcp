/**
 * mju-mcp — OpenClaw Plugin Entrypoint
 *
 * top-level await 없이 OpenClaw 플러그인 로더가 호출할 수 있는 엔트리포인트.
 * 기존 stdio 엔트리포인트(index.ts)와 독립적으로 동작하며,
 * MCP 서버를 background service로 등록한다.
 *
 * OpenClaw SDK 타입은 호스트 프로세스에서만 사용 가능하므로
 * NemoClaw 패턴을 따라 최소 스텁을 로컬에 정의한다.
 */

import { APP_NAME, APP_VERSION } from "./app-meta.js";
import { createMcpServer } from "./mcp/server.js";
import { createAppContext } from "./mcp/app-context.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ---------------------------------------------------------------------------
// OpenClaw Plugin SDK compatible types (mirrors openclaw/plugin-sdk)
// ---------------------------------------------------------------------------

interface OpenClawConfig {
  [key: string]: unknown;
}

interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

interface PluginService {
  id: string;
  start: (ctx: { config: OpenClawConfig; logger: PluginLogger }) => void | Promise<void>;
  stop?: (ctx: { config: OpenClawConfig; logger: PluginLogger }) => void | Promise<void>;
}

interface OpenClawPluginApi {
  id: string;
  name: string;
  version?: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  logger: PluginLogger;
  registerCommand: (command: unknown) => void;
  registerProvider: (provider: unknown) => void;
  registerService: (service: PluginService) => void;
  resolvePath: (input: string) => string;
  on: (hookName: string, handler: (...args: unknown[]) => void) => void;
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

export default function register(api: OpenClawPluginApi): void {
  api.registerService({
    id: "mju-mcp",
    async start({ logger }) {
      const context = createAppContext();
      const server = createMcpServer(context);
      const transport = new StdioServerTransport();
      await server.connect(transport);

      logger.info("");
      logger.info("  ┌─────────────────────────────────────────┐");
      logger.info(`  │  ${APP_NAME} v${APP_VERSION} registered              │`);
      logger.info("  │                                         │");
      logger.info("  │  Transport:  stdio                      │");
      logger.info("  │  Tools:      40 MCP tools               │");
      logger.info("  │  Services:   LMS, MSI, UCheck, Library  │");
      logger.info("  └─────────────────────────────────────────┘");
      logger.info("");
    },
  });
}
