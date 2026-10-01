export type LlmMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string };

export type LlmToolCall = { id: string; name: string; arguments: Record<string, unknown> };

export type LlmResult = {
  text: string;
  toolCalls: LlmToolCall[];
};

export type LlmPort = {
  complete(messages: LlmMessage[], tools: { name: string; description: string }[]): Promise<LlmResult>;
};

export class OpenAiLlm implements LlmPort {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(messages: LlmMessage[], tools: { name: string; description: string }[]): Promise<LlmResult> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((row) => ({ role: row.role, content: row.content, name: row.name })),
        tools:
          tools.length > 0
            ? tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: { type: 'object', additionalProperties: true },
                },
              }))
            : undefined,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`openai-${response.status}`);
    }
    const body = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
    };
    const message = body.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? []).map((call) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.function.arguments) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      return { id: call.id, name: call.function.name, arguments: parsed };
    });
    return { text: message?.content ?? '', toolCalls };
  }
}

export class FallbackLlm implements LlmPort {
  async complete(messages: LlmMessage[]): Promise<LlmResult> {
    const last = [...messages].reverse().find((row) => row.role === 'user');
    return {
      text: last
        ? `I could not reach the model. Check your last trip in history, or say cancel if you want to stop a searching ride.`
        : 'Support is in fallback mode.',
      toolCalls: [],
    };
  }
}
