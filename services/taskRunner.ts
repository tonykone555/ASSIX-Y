import { Server } from 'socket.io';
import { runTask as runStagehandTask } from './taskOrchestrator';
import { saveTaskToFirestore, updateTaskInFirestore, getTaskFromFirestore } from './firebase';
import { resumeTaskSession } from './browserEngine';

export async function runTask(
  taskId: string,
  intent: string,
  userId: string,
  io: Server
): Promise<void> {
  const socket = io.to(taskId);

  // Fetch existing task document to preserve taskType, label, config, progress, etc.
  const existingTask = await getTaskFromFirestore(taskId);

  // Initialize status in Firestore
  await saveTaskToFirestore(taskId, {
    userId,
    intent,
    taskType: existingTask?.taskType || 'dynamic',
    label: existingTask?.label || intent,
    status: 'planning',
    progress: existingTask?.progress !== undefined ? existingTask.progress : 0,
    total: existingTask?.total !== undefined ? existingTask.total : 10,
    createdAt: existingTask?.createdAt || new Date().toISOString()
  }, { merge: true });

  try {
    socket.emit('task_status', {
      taskId,
      status: 'planning',
      message: 'Initializing Stagehand session...'
    });

    // Default start URL, can be parsed from intent if an http link is found
    let startUrl = 'https://www.google.com';
    const urlMatch = intent.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      startUrl = urlMatch[0];
    }

    await runStagehandTask(taskId, intent, startUrl, socket, async (update) => {
      // Handle progress callbacks from Stagehand
      if (update.step === 'session_started') {
        const liveViewUrl = update.data?.liveViewUrl || '';
        const currentUrl = update.data?.currentUrl || startUrl;
        
        // Save liveViewUrl in task document so UI can pull it if refreshed
        await updateTaskInFirestore(taskId, {
          status: 'running',
          liveViewUrl,
          currentUrl,
          progress: 20
        });

        // Emit task_planned so the frontend transitions out of planning mode
        socket.emit('task_planned', { taskId, totalSteps: 5 });

        socket.emit('task_progress', {
          taskId,
          step: 20,
          description: `Live session started.`,
          status: 'running',
          currentUrl,
          data: update.data
        });
      } else if (update.step === 'navigated') {
        const currentUrl = update.data?.currentUrl || startUrl;
        await updateTaskInFirestore(taskId, {
          progress: 40,
          currentUrl
        });

        socket.emit('task_progress', {
          taskId,
          step: 40,
          description: `Navigated to target page.`,
          status: 'running',
          currentUrl,
          data: update.data
        });
      } else if (update.step === 'human_needed') {
        const currentUrl = update.data?.currentUrl || '';
        const type = update.data?.type || 'login';
        const message = update.data?.message || 'Human intervention required.';

        await updateTaskInFirestore(taskId, {
          status: 'paused_input',
          currentUrl
        });

        socket.emit('human_needed', {
          taskId,
          type,
          message,
          currentUrl
        });
      } else if (update.step === 'action_complete') {
        const currentUrl = update.data?.currentUrl || '';
        await updateTaskInFirestore(taskId, {
          progress: 80,
          currentUrl
        });

        socket.emit('task_progress', {
          taskId,
          step: 80,
          description: `AI Action completed successfully.`,
          status: 'running',
          currentUrl,
          data: update.data
        });
      } else if (update.step === 'complete') {
        const extraction = update.data?.extraction;
        const currentUrl = update.data?.currentUrl || '';
        const summary = typeof extraction === 'string' ? extraction : JSON.stringify(extraction || update.data);

        await updateTaskInFirestore(taskId, {
          status: 'completed',
          progress: 100,
          summary,
          currentUrl,
          completedAt: new Date().toISOString()
        });

        socket.emit('task_complete', {
          taskId,
          summary,
          currentUrl,
          results: extraction || update.data
        });
      } else if (update.step === 'error') {
        const errorMsg = update.data?.message || 'Execution error';
        const currentUrl = update.data?.currentUrl || '';

        await updateTaskInFirestore(taskId, {
          status: 'failed',
          error: errorMsg,
          currentUrl,
          failedAt: new Date().toISOString()
        });

        socket.emit('task_error', {
          taskId,
          error: errorMsg,
          currentUrl
        });
      }
    });

  } catch (err: any) {
    const errorMsg = err.message || String(err);
    
    await updateTaskInFirestore(taskId, {
      status: 'failed',
      error: errorMsg,
      failedAt: new Date().toISOString()
    });

    socket.emit('task_error', {
      taskId,
      error: errorMsg
    });
  }
}

export function resumeTask(taskId: string, data?: any): boolean {
  return resumeTaskSession(taskId, data);
}
