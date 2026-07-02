import { GoogleGenAI } from "@google/genai";
import axios from "axios";

const GEMINI_TASKS = [
  "browser_agent",
  "mortgage_research",
  "lead_scoring",
  "report_generation",
  "task_planning"
];

const POE_TASKS = [
  "chatbot",
  "whatsapp_message",
  "simple_response"
];

const POE_MODELS = [
  "Claude-Sonnet-4-6",
  "Gemini-2.0-Flash",
  "GPT-4o-mini",
  "Llama-3.1-70b"
];

// Reusable function to translate OpenAI-style messages to Gemini format
export function translateMessagesToGemini(messages: any[], image?: string) {
  let systemInstruction = "";
  const sanitized: any[] = [];
  
  for (const m of messages) {
    const role = m.role === "system" ? "system" : (m.role === "assistant" || m.role === "agent" || m.role === "model" ? "model" : "user");
    const text = typeof m.content === "string" ? m.content : (m.msg || "");
    
    if (role === "system") {
      systemInstruction += (systemInstruction ? "\n" : "") + text;
    } else {
      if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === role) {
        sanitized[sanitized.length - 1].parts.push({ text });
      } else {
        sanitized.push({
          role,
          parts: [{ text }]
        });
      }
    }
  }

  // Gemini requires the conversation to start with a 'user' message
  while (sanitized.length > 0 && sanitized[0].role !== "user") {
    sanitized.shift();
  }

  if (sanitized.length === 0) {
    sanitized.push({
      role: "user",
      parts: [{ text: "Hello" }]
    });
  }

  // If there is an image, append it to the last user message
  if (image) {
    const lastUserIndex = sanitized.map(s => s.role).lastIndexOf("user");
    if (lastUserIndex !== -1) {
      sanitized[lastUserIndex].parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: image
        }
      });
    } else {
      sanitized[0].parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: image
        }
      });
    }
  }

  return { contents: sanitized, systemInstruction };
}

// Call Gemini directly with the translated structure, featuring automatic retries and fallback models
async function callGemini(contents: any[], systemInstruction?: string, isJson?: boolean): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: { "User-Agent": "aistudio-build" }
    }
  });

  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    const maxRetries = 3;
    let delayMs = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini API] Querying ${modelName} (attempt ${attempt}/${maxRetries})...`);
        const response = await aiClient.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: systemInstruction || undefined,
            responseMimeType: isJson ? "application/json" : undefined
          }
        });
        
        if (response.text) {
          console.log(`[Gemini API] Success with ${modelName}`);
          return response.text;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const errStatus = err?.status || "";
        const errCode = err?.code || 0;
        
        const isQuotaExceeded = 
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("quota") ||
          errMsg.includes("Quota") ||
          errMsg.includes("rate-limits") ||
          errStatus === "RESOURCE_EXHAUSTED" ||
          errCode === 429;

        if (isQuotaExceeded) {
          console.warn(`[Gemini API] Quota exceeded on ${modelName}. Moving immediately to the next fallback model.`);
          break; // Immediately break retry loop for this model to try the next model
        }

        const isTransient = 
          errMsg.includes("503") || 
          errMsg.includes("UNAVAILABLE") || 
          errMsg.includes("overloaded") ||
          errMsg.includes("high demand") ||
          errStatus === "UNAVAILABLE" ||
          errCode === 503;

        if (isTransient) {
          if (attempt < maxRetries) {
            console.warn(`[Gemini API] Transient error on ${modelName}: "${errMsg}". Retrying in ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= 2; // Exponential backoff
          } else {
            console.warn(`[Gemini API] Model ${modelName} failed after ${maxRetries} attempts.`);
          }
        } else {
          // If it's a structural error or other issue, don't retry, move on to fallback
          console.error(`[Gemini API] Non-transient error on ${modelName}:`, errMsg);
          break;
        }
      }
    }
  }

  throw lastError || new Error("Failed to get response from Gemini models");
}

// Call Poe rotation
async function callPoeWithRotation(messages: any[]): Promise<string> {
  if (!process.env.POE_API_KEY) {
    throw new Error("POE_API_KEY is not configured");
  }

  for (const model of POE_MODELS) {
    try {
      console.log(`[Poe API] Trying model ${model}...`);
      const response = await axios.post("https://api.poe.com/v1/chat/completions", {
        model,
        messages: messages.map(m => ({
          role: m.role === "agent" || m.role === "model" ? "assistant" : m.role,
          content: typeof m.content === "string" ? m.content : (m.msg || "")
        }))
      }, {
        headers: {
          "Authorization": `Bearer ${process.env.POE_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 25000
      });

      if (response.data && response.data.choices && response.data.choices[0]) {
        console.log(`[Poe API] Successfully called Poe with model ${model}`);
        return response.data.choices[0].message.content;
      }
    } catch (err: any) {
      console.warn(`[Poe API] Model ${model} failed, trying next. Error: ${err.message || err}`);
    }
  }
  throw new Error("All Poe models exhausted");
}

// Single entry point for all AI calls
export async function callAI(taskType: string, messages: any[], image?: string): Promise<string> {
  const hasPoe = !!process.env.POE_API_KEY;
  const isGeminiFirst = GEMINI_TASKS.includes(taskType) || !hasPoe;
  const isJson = taskType === "browser_agent";

  if (isGeminiFirst) {
    try {
      console.log(`[aiService] Executing Gemini-first task: ${taskType}`);
      const { contents, systemInstruction } = translateMessagesToGemini(messages, image);
      return await callGemini(contents, systemInstruction, isJson);
    } catch (err: any) {
      if (hasPoe) {
        console.warn(`[aiService] Gemini call failed for ${taskType}. Falling back to Poe rotation. Error: ${err.message || err}`);
        try {
          return await callPoeWithRotation(messages);
        } catch (poeErr: any) {
          console.error(`[aiService] Poe fallback failed too: ${poeErr.message || poeErr}`);
          throw poeErr;
        }
      } else {
        console.error(`[aiService] Gemini call failed for ${taskType} and Poe fallback is unavailable (no key).`);
        throw err;
      }
    }
  } else {
    // Poe first task
    try {
      console.log(`[aiService] Executing Poe-first task: ${taskType}`);
      return await callPoeWithRotation(messages);
    } catch (err: any) {
      console.warn(`[aiService] Poe rotation failed for ${taskType}. Falling back to Gemini. Error: ${err.message || err}`);
      try {
        const { contents, systemInstruction } = translateMessagesToGemini(messages, image);
        return await callGemini(contents, systemInstruction, isJson);
      } catch (geminiErr: any) {
        console.error(`[aiService] Gemini fallback failed too: ${geminiErr.message || geminiErr}`);
        throw geminiErr;
      }
    }
  }
}
