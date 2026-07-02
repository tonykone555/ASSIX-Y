import Groq from 'groq-sdk';

export interface Action {
  type: string;
  params: any;
  description: string;
}

const SYSTEM_PROMPT = `
You are the Assix AI Orchestrator.
Translate natural language into browser 
automation actions as a JSON array.

Available actions:
- navigate: { url: string, waitUntil?: "load"|"domcontentloaded"|"networkidle" }
- click: { selector: string, force?: boolean }
- type: { selector: string, value: string, clearFirst?: boolean }
- select: { selector: string, value: string }
- hover: { selector: string }
- scroll: { deltaY?: number, deltaX?: number, selector?: string }
- pressKey: { key: string }
- extractText: { selector: string, trim?: boolean, join?: string, first?: boolean }
- extractHtml: { selector: string, outer?: boolean }
- extractAttribute: { selector: string, attribute: string }
- waitForSelector: { selector: string, state?: "visible"|"attached"|"detached", timeout?: number }
- waitForNavigation: { waitUntil?: "load"|"domcontentloaded"|"networkidle" }
- waitForTimeout: { ms: number }
- evaluate: { expression: string, arg?: any }
- screenshot: { fullPage?: boolean, quality?: "low"|"medium"|"high"|"ultra" }
- mouseClick: { x: number, y: number, button?: "left"|"right" }
- mouseMove: { x: number, y: number }
- keyboardType: { text: string, delay?: number }
- goBack: {}
- goForward: {}
- reload: {}
- humanIntervention: { type: "login"|"2fa"|"captcha"|"generic", message: string }

Each action in the array must be:
{
  "type": "actionType",
  "params": { ...parameters },
  "description": "what this step does"
}

Rules:
1. Always waitForSelector before clicking elements
2. Use humanIntervention for any login/2FA walls
3. For scraping: navigate → waitForSelector → extractText
4. For forms: waitForSelector → type → pressKey Enter
5. Use text-based selectors when possible:
   button:has-text('Search'), [placeholder='Email']
6. For pagination: click Next → waitForNavigation → repeat
7. For Google Maps: extract business names, phones, addresses
8. For LeBonCoin: extract titles, prices, contact info
9. Take screenshot at key milestones
10. Output ONLY valid JSON array, nothing else

Example:
User: "Search for plumbers in Paris on Google Maps"
Output:
[
  {
    "type": "navigate",
    "params": { "url": "https://www.google.com/maps" },
    "description": "Open Google Maps"
  },
  {
    "type": "waitForSelector",
    "params": { "selector": "input#searchboxinput" },
    "description": "Wait for search box"
  },
  {
    "type": "type",
    "params": { "selector": "input#searchboxinput", "value": "plumbers Paris" },
    "description": "Type search query"
  },
  {
    "type": "pressKey",
    "params": { "key": "Enter" },
    "description": "Execute search"
  },
  {
    "type": "waitForSelector",
    "params": { "selector": "[role='feed']" },
    "description": "Wait for results"
  },
  {
    "type": "extractText",
    "params": { "selector": ".fontHeadlineSmall", "join": "\\n" },
    "description": "Extract business names"
  }
]
`;

const SUMMARY_PROMPT = `
Summarize what was accomplished in 2-3 sentences.
Highlight key results (e.g. "Found 12 plumbers in Paris").
Mention any blockers clearly.
No technical jargon. No mention of selectors or JSON.
`;

export async function planWorkflow(
  intent: string,
  sessionId?: string,
  savedSessions: string[] = []
): Promise<Action[]> {
  const groq = new Groq({ 
    apiKey: process.env.GROQ_API_KEY || ''
  });

  let userMessage = '';
  if (sessionId) {
    userMessage += `Active Session: ${sessionId}\n\n`;
  }
  if (savedSessions.length > 0) {
    userMessage += `Saved Sessions: ${savedSessions.join(', ')}\n\n`;
  }
  userMessage += `Task: ${intent}`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('No response from Groq');

  const parsed = JSON.parse(content);
  return Array.isArray(parsed) 
    ? parsed 
    : parsed.actions || Object.values(parsed)[0];
}

export async function generateSummary(
  intent: string,
  results: any[]
): Promise<string> {
  const groq = new Groq({ 
    apiKey: process.env.GROQ_API_KEY || ''
  });

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SUMMARY_PROMPT },
      { 
        role: 'user', 
        content: `Intent: ${intent}\n\nResults:\n${JSON.stringify(results, null, 2)}` 
      }
    ]
  });

  return response.choices[0].message.content 
    || 'Task completed.';
}

export async function detectSessionName(
  intent: string
): Promise<string | null> {
  const groq = new Groq({ 
    apiKey: process.env.GROQ_API_KEY || ''
  });

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { 
        role: 'system', 
        content: 'Identify the main website or service (e.g. "google", "linkedin", "leboncoin"). Output ONLY the name lowercase or "none".' 
      },
      { role: 'user', content: intent }
    ]
  });

  const name = response.choices[0].message.content?.trim().toLowerCase();
  return (name === 'none' || !name) ? null : name;
}
