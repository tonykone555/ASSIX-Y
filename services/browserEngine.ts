import { Stagehand } from "@browserbasehq/stagehand";
import Browserbase from "@browserbasehq/sdk";

export const activeSessions = new Map<string, Stagehand>();
const pendingResumes = new Map<string, (value: any) => void>();

const browserbase = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY!
});

export function registerPendingResume(taskId: string): Promise<any> {
  return new Promise((resolve) => {
    pendingResumes.set(taskId, resolve);
  });
}

export function resumeTaskSession(taskId: string, data?: any): boolean {
  const resolve = pendingResumes.get(taskId);
  if (resolve) {
    resolve(data);
    pendingResumes.delete(taskId);
    return true;
  }
  return false;
}

export async function createStagehandSession(taskId: string) {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    browserbaseSessionCreateParams: {
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      browserSettings: {
        blockAds: true,
        viewport: { width: 1920, height: 1080 }
      }
    },
    model: "google/gemini-2.5-flash",
    selfHeal: true,
    domSettleTimeout: 30000,
  });

  try {
    await stagehand.init();
  } catch (error: any) {
    console.error("Stagehand init failed:", error.message);
    throw error;
  }

  // CORRECT property name per official Browserbase docs
  const sessionId = stagehand.browserbaseSessionID!;
  console.log("Session ID:", sessionId);

  if (!sessionId) {
    throw new Error("No session ID returned from Stagehand");
  }

  // CORRECT way to get live view URL per official docs with retry
  let liveViewUrl = "";
  let retries = 3;
  while (retries > 0) {
    try {
      const debug = await browserbase.sessions.debug(sessionId);
      liveViewUrl = debug.debuggerFullscreenUrl || "";
      break;
    } catch (err: any) {
      if (err.status === 404 && retries > 1) {
        await new Promise(r => setTimeout(r, 2000));
        retries--;
      } else {
        console.warn("Could not get live view URL:", err.message);
        break;
      }
    }
  }

  activeSessions.set(taskId, stagehand);
  return { stagehand, liveViewUrl, sessionId };
}

export function getSession(taskId: string): Stagehand | undefined {
  return activeSessions.get(taskId);
}

// Legacy wrappers to prevent compile errors in any older references
export async function runAct(taskId: string, instruction: string) {
  const stagehand = activeSessions.get(taskId);
  if (!stagehand) throw new Error(`No active session for ${taskId}`);
  return await stagehand.act(instruction);
}

export async function runExtract(
  taskId: string, 
  instruction: string, 
  schema?: any
) {
  const stagehand = activeSessions.get(taskId);
  if (!stagehand) throw new Error(`No active session for ${taskId}`);
  return await stagehand.extract(instruction, schema);
}

export async function runObserve(taskId: string, instruction: string) {
  const stagehand = activeSessions.get(taskId);
  if (!stagehand) throw new Error(`No active session for ${taskId}`);
  return await stagehand.observe(instruction);
}

export async function navigateTo(taskId: string, url: string) {
  const stagehand = activeSessions.get(taskId);
  if (!stagehand) throw new Error(`No active session for ${taskId}`);
  const page = (stagehand as any).page;
  await page.goto(url);
}

export async function closeSession(taskId: string) {
  const stagehand = activeSessions.get(taskId);
  if (!stagehand) return;
  await stagehand.close();
  activeSessions.delete(taskId);
}
