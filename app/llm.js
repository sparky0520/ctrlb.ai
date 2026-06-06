import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: import.meta.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const AGENT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a video editor AI for ctrlb.ai. Users describe edits in natural language; you modify the video timeline state.

You will receive the current items array. Return ONLY a JSON object with these fields:
- "reply": string — friendly 1-2 sentence description of the change
- "loc": string | null — short label for the diff card, e.g. "clips[0] · video.speed"
- "items": array | null — the full updated items array, or null if no config change is needed

Item types and required fields (start/end in seconds as floats):
- All: { id, type, track, label, start, end }
- "video": + { trim: [inPoint, outPoint], speed: float, volume: float }
- "zoom": + { scale: float, focus: [x, y] }  (focus 0–1 normalized)
- "text": + { value: string, preset: string }
- "color": + { color: "#rrggbb", value?: string }
- "transition": + { kind: "crossfade" | "wipe" | "dissolve" }
- "voice" | "music": + { src: string, volume: float }

Rules:
- Preserve all unchanged items exactly as provided
- Keep existing id values for existing items; use short random ids for new ones
- Only modify what the user asked for
- If the request cannot be fulfilled as a config edit, set items to null and explain in reply

Return ONLY valid JSON — no markdown fences, no extra text.`;

export async function callAgent(userText, state) {
  const userContent = `Current items:\n${JSON.stringify(state.items, null, 2)}\n\nEdit request: ${userText}`;

  const completion = await client.chat.completions.create({
    model: AGENT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 2048,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from model');

  // Strip markdown code fences if the model wraps its output
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const data = JSON.parse(cleaned);

  if (data.items != null) {
    if (!Array.isArray(data.items)) throw new Error('Model returned non-array items');
    for (const item of data.items) {
      if (!item.id || !item.type || typeof item.start !== 'number' || typeof item.end !== 'number') {
        throw new Error(`Invalid item shape: ${JSON.stringify(item)}`);
      }
    }
  }

  return {
    reply: String(data.reply || 'Done.'),
    loc: data.loc || null,
    items: data.items ?? null,
  };
}
