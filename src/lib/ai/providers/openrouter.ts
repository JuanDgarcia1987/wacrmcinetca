import { AiError, type ProviderResult } from '../types';
import { MAX_OUTPUT_TOKENS } from '../defaults';
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared';
import { getT } from '@/lib/i18n/translate';

const t = getT('LibErrors');

/**
 * OpenRouter is OpenAI-compatible under the hood, but it isn't *just* that:
 * it's a catalogue of models from many vendors, its keys are `sk-or-…`,
 * and it wants an `HTTP-Referer` / `X-Title` header so it can attribute
 * traffic on its dashboard. Rather than bolt those onto the generic
 * OpenAI-compatible adapter, this is a thin wrapper that pins the endpoint
 * to OpenRouter's own host and adds the attribution headers.
 *
 * The model field is the caller's choice — any OpenRouter model ID works,
 * including free tiers (`openai/gpt-4o-mini`,
 * `openai/deepseek/deepseek-r1`, `google/gemini-2.0-flash-001`, …).
 */
export async function generateOpenRouter(
  args: ProviderArgs
): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args;
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter attributes traffic to the app making the call; without
        // these the request still works but shows up anonymously.
        'HTTP-Referer': 'https://wacrm.app',
        'X-Title': 'wacrm',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...mergeConsecutive(messages),
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw toNetworkError(err);
  }

  if (!res.ok) throw await providerHttpError('OpenRouter', res);

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  } | null;
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError(t('ai.emptyResponse', { provider: 'OpenRouter' }), {
      code: 'empty_response',
    });
  }

  return {
    text,
    usage: normalizeUsage({
      prompt: data?.usage?.prompt_tokens,
      completion: data?.usage?.completion_tokens,
      total: data?.usage?.total_tokens,
    }),
  };
}
