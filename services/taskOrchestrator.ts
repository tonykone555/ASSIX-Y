import { createStagehandSession, registerPendingResume, activeSessions } from "./browserEngine";
import { db } from "../firebase-client-wrapper";

const formatPhone = (raw: string) => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length > 10) return '+1' + digits.slice(-10);
  return raw;
};

function buildStartUrl(intent: string): string {
  const lower = intent.toLowerCase();
  const mapsKeywords = ['find','search','scrape','get',
    'look for','plumber','electrician','roofer','dentist',
    'restaurant','contractor','google maps','maps'];
  
  if (mapsKeywords.some(k => lower.includes(k))) {
    const m = intent.match(
      /(?:find|search|scrape|get|look for)\s+(.+?)\s+in\s+(.+)/i
    );
    if (m) {
      return `https://www.google.com/maps/search/${
        encodeURIComponent(`${m[1].trim()} ${m[2].trim()}`)
      }`;
    }
    return `https://www.google.com/maps/search/${
      encodeURIComponent(intent)
    }`;
  }
  if (lower.includes('linkedin')) 
    return 'https://www.linkedin.com/search/results/people/';
  if (lower.includes('instagram')) 
    return 'https://www.instagram.com/';
  if (lower.includes('leboncoin')) 
    return 'https://www.leboncoin.fr/';
  return `https://www.google.com/search?q=${
    encodeURIComponent(intent)
  }`;
}

function buildActInstructions(intent: string): string[] {
  const lower = intent.toLowerCase();
  
  // Posting tasks
  if (lower.includes('post') || lower.includes('publish')) {
    return [
      "Find the compose/create post button and click it",
      "Type the post content in the text field",
      "Click the publish/post/send button",
      "Confirm the post was published successfully"
    ];
  }
  
  // Messaging tasks
  if (lower.includes('message') || lower.includes('send') ||
      lower.includes('dm') || lower.includes('contact')) {
    return [
      "Find the message/compose button and click it",
      "Search for or navigate to the recipient",
      "Type the message content",
      "Click send",
      "Confirm the message was sent"
    ];
  }
  
  // Form filling tasks
  if (lower.includes('fill') || lower.includes('submit') ||
      lower.includes('apply') || lower.includes('register')) {
    return [
      "Find the form fields on the page",
      "Fill in each required field with appropriate data",
      "Submit the form",
      "Confirm submission was successful"
    ];
  }
  
  // Search/scraping tasks (default)
  return [
    "Extract all relevant data visible on the page",
    "Scroll down to load more results if available",
    "Extract any additional data from loaded results"
  ];
}

async function waitForResume(taskId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Intervention timeout — task cancelled after 10 minutes of waiting."));
    }, 600000); // 10 minutes

    registerPendingResume(taskId).then(() => {
      clearTimeout(timeout);
      resolve();
    }).catch((err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function runTask(
  taskId: string,
  userInstruction: string,
  _passedStartUrl: string,
  socket: any,
  onProgress: (update: { step: string; status: string; data?: any }) => void
) {
  const startUrl = buildStartUrl(userInstruction);

  // Initialize stagehand session
  const { stagehand, liveViewUrl } = await createStagehandSession(taskId);
  const page = (stagehand as any).page;

  onProgress({ 
    step: "session_started", 
    status: "running", 
    data: { liveViewUrl, currentUrl: startUrl } 
  });

  try {
    socket.emit('log', { 
      type: 'action', 
      message: `Navigating to starting URL: ${startUrl}...`, 
      taskId 
    });

    await page.goto(startUrl);
    
    onProgress({ 
      step: "navigated", 
      status: "running", 
      data: { currentUrl: startUrl } 
    });

    const lowerInstruction = userInstruction.toLowerCase();
    const isScrapingTask = lowerInstruction.includes('find') || 
                           lowerInstruction.includes('search') || 
                           lowerInstruction.includes('scrape') || 
                           lowerInstruction.includes('get') || 
                           lowerInstruction.includes('look for') || 
                           lowerInstruction.includes('maps');

    if (isScrapingTask) {
      socket.emit('log', { 
        type: 'action', 
        message: 'Waiting 3 seconds for search results to load...', 
        taskId 
      });

      await new Promise(r => setTimeout(r, 3000));

      // Check for login wall
      const loginCheck = await page.observe(
        "Is there a login form, CAPTCHA, or authentication wall blocking this action?"
      );
      
      if (loginCheck?.toString().toLowerCase().includes('yes')) {
        onProgress({
          step: "human_needed",
          status: "paused",
          data: {
            type: "login",
            message: "Please log in using the live browser then tap Resume to continue.",
            liveViewUrl,
            currentUrl: await page.url().catch(() => startUrl)
          }
        });
        await waitForResume(taskId);
      }

      socket.emit('log', { 
        type: 'action', 
        message: 'Extracting business listings from Google Maps left panel...', 
        taskId 
      });

      const results = await page.extract({
        instruction: `Extract ALL business listings visible in the left panel. For each return: name, phone, address, rating, reviews, website if available.`,
        schema: {
          type: "object",
          properties: {
            businesses: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  phone: { type: "string" },
                  address: { type: "string" },
                  rating: { type: "number" },
                  reviews: { type: "number" },
                  website: { type: "string" }
                }
              }
            }
          }
        }
      });

      socket.emit('log', { 
        type: 'action', 
        message: `Successfully extracted ${results?.businesses?.length || 0} listings. Saving to database...`, 
        taskId 
      });

      const businesses = results?.businesses || [];
      for (const biz of businesses) {
        // Save to 'assix_leads' as requested
        await db.collection('assix_leads').add({
          ...biz,
          source: 'google_maps',
          taskId,
          intent: userInstruction,
          createdAt: new Date().toISOString()
        });

        // Save to existing 'leads' collection to keep standard frontend features working
        const phoneClean = biz.phone ? formatPhone(String(biz.phone)) : "";
        const leadType = !biz.website ? 'no_website' : 'has_website';
        await db.collection('leads').add({
          taskId,
          businessName: biz.name || "Business",
          phone: phoneClean,
          website: biz.website || "",
          rating: biz.rating ? String(biz.rating) : "4.8",
          address: biz.address || "",
          city: "Extracted",
          sector: "AI Scraped",
          market: "US English",
          leadType,
          createdAt: new Date().toISOString(),
          sentToClose: false,
          status: 'new'
        });
      }

      await db.collection('assix_tasks').doc(taskId).update({
        totalFound: businesses.length,
        progress: 100,
        status: 'complete'
      });

      onProgress({
        step: "complete",
        status: "done",
        data: {
          results: businesses,
          extraction: `Successfully extracted ${businesses.length} leads.`,
          leadCount: businesses.length,
          summary: `Found ${businesses.length} results for: ${userInstruction}`,
          currentUrl: await page.url().catch(() => startUrl)
        }
      });

      return results;

    } else {
      // General automation task (Posting, Messaging, Form Filling, etc.)
      const instructions = buildActInstructions(userInstruction);
      
      for (let i = 0; i < instructions.length; i++) {
        const instruction = instructions[i];
        
        socket.emit('log', { 
          type: 'action', 
          message: `Executing instruction [${i + 1}/${instructions.length}]: "${instruction}"...`, 
          taskId 
        });

        // Check for login wall before each step
        const loginCheck = await page.observe(
          "Is there a login form, CAPTCHA, or authentication wall blocking this action?"
        );
        
        if (loginCheck?.toString().toLowerCase().includes('yes')) {
          onProgress({
            step: "human_needed",
            status: "paused",
            data: {
              type: "login",
              message: "Please log in using the live browser then tap Resume to continue.",
              liveViewUrl,
              currentUrl: await page.url().catch(() => startUrl)
            }
          });
          await waitForResume(taskId);
        }
        
        // Execute the instruction
        await page.act(instruction);
        
        onProgress({ 
          step: "action_complete", 
          status: "running", 
          data: { 
            currentUrl: await page.url().catch(() => startUrl),
            stepExecuted: instruction
          } 
        });

        await new Promise(r => setTimeout(r, 1500));
      }

      socket.emit('log', { 
        type: 'action', 
        message: 'All actions executed. Extracting summary of accomplishments...', 
        taskId 
      });

      // After all instructions, extract results
      const results = await page.extract({
        instruction: "Summarize what was accomplished on this page",
        schema: {
          type: "object", 
          properties: {
            success: { type: "boolean" },
            summary: { type: "string" },
            data: { type: "array", items: { type: "object" } }
          }
        }
      });

      await db.collection('assix_tasks').doc(taskId).update({
        progress: 100,
        status: 'complete'
      });

      onProgress({
        step: "complete",
        status: "done",
        data: {
          results: results,
          extraction: results?.summary || `Completed task successfully.`,
          leadCount: 0,
          summary: results?.summary || `Completed task: ${userInstruction}`,
          currentUrl: await page.url().catch(() => startUrl)
        }
      });

      return results;
    }

  } catch (err: any) {
    const errorUrl = await page.url().catch(() => startUrl);
    socket.emit('log', { 
      type: 'action', 
      message: `Error encountered: ${err.message}`, 
      taskId 
    });
    
    onProgress({ 
      step: "error", 
      status: "failed", 
      data: { message: err.message, currentUrl: errorUrl } 
    });
    
    throw err;
  } finally {
    socket.emit('log', { 
      type: 'action', 
      message: 'Closing Browserbase automation session...', 
      taskId 
    });
    
    await stagehand.close();
    activeSessions.delete(taskId);
  }
}
