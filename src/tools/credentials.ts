import type { ResolvedLmsCredentials } from "../auth/types.js";
import type { AppContext } from "../mcp/app-context.js";

export async function requireCredentials(
  context: AppContext
): Promise<ResolvedLmsCredentials> {
  try {
    return await context.getCredentials();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\n\n\`npm run auth:login -- --id YOUR_ID --password YOUR_PASSWORD\` 로 저장 로그인 정보를 만들어주세요.`
    );
  }
}
