# AI Providers

This document explains which cloud AI providers Promptium supports, how API keys are handled, how provider fallback works, and what parts of the product depend on remote inference.

## What AI Providers Are Used For

Promptium is local-first, but some features rely on user-configured cloud providers.

Provider-backed flows include:

- prompt improvement
- prompt polishing
- AI-generated tags
- AI-generated prompt titles
- continuation summarization and related prompt transformation flows

Semantic search itself does not require a cloud provider. That path uses local embedding models instead.

## Supported Providers

Promptium currently supports four providers.

| Provider   | Internal ID  | Key Storage Key          | Key Portal                                    |
| ---------- | ------------ | ------------------------ | --------------------------------------------- |
| Gemini     | `gemini`     | `promptiumGeminiKey`     | `https://aistudio.google.com/apikey`          |
| OpenAI     | `openai`     | `promptiumOpenAIKey`     | `https://platform.openai.com/api-keys`        |
| Anthropic  | `anthropic`  | `promptiumAnthropicKey`  | `https://console.anthropic.com/settings/keys` |
| OpenRouter | `openrouter` | `promptiumOpenRouterKey` | `https://openrouter.ai/keys`                  |

## Default Models

Promptium exposes a small curated model list per provider.

### Gemini Integration

- `gemini-2.0-flash` - default balanced model
- `gemini-2.0-flash-lite` - lower-cost fast option
- `gemini-1.5-pro` - higher quality reasoning
- `gemini-1.5-flash` - stable fast fallback

### OpenAI Integration

- `gpt-4o-mini` - default balanced model
- `gpt-4o` - higher quality general model
- `gpt-4-turbo` - compatibility fallback

### Anthropic Integration

- `claude-haiku-4-5-20251001` - default low-latency model
- `claude-sonnet-4-6` - higher quality reasoning

### OpenRouter Integration

- `meta-llama/llama-3.1-8b-instruct:free` - default free model
- `mistralai/mistral-7b-instruct:free` - free fast fallback
- `anthropic/claude-haiku` - Claude via OpenRouter
- `google/gemini-flash-1.5` - Gemini via OpenRouter
- `openai/gpt-4o-mini` - OpenAI via OpenRouter

## How Provider Selection Works

Promptium has two related concepts:

- active provider
- provider fallback order

The selected active provider is attempted first. After that, Promptium can fall back through the built-in chain:

1. Gemini
2. OpenAI
3. Anthropic
4. OpenRouter

This means:

- the user's chosen provider gets first priority
- if that provider has no valid key or the request fails, other configured providers can be tried

If no configured provider succeeds, the AI request fails with a no-provider-available style result.

## Feature Flags and Provider Routing

Provider-backed features are also controlled by feature flags stored in settings.

Current runtime flags include:

- `polish`
- `autoTags`
- `improvePrompt`
- `continueSummary`

If a feature flag is disabled, Promptium should not route that AI request even if provider keys exist.

## API Key Handling

Promptium is opinionated about key storage.

- provider keys are stored in `chrome.storage.session`
- keys are not meant to persist across full browser shutdowns
- any legacy local-storage copies are migrated into session storage and removed from local storage

This design reduces long-lived key persistence on disk.

Relevant storage keys:

- `promptiumGeminiKey`
- `promptiumOpenAIKey`
- `promptiumAnthropicKey`
- `promptiumOpenRouterKey`

## Key Validation

Promptium validates keys against provider endpoints.

Validation approach by provider:

- Gemini: `GET /models`
- OpenAI: `GET /models`
- Anthropic: lightweight `POST /messages`
- OpenRouter: `GET /models`

The validation layer classifies failures into categories such as:

- invalid key
- quota or rate limit
- network failure
- unknown provider error

## Request Routing Model

At runtime, Promptium routes AI requests through the service worker and provider client.

The typical flow is:

1. side panel or content UI requests an AI action
2. the service worker builds runtime policy from settings
3. provider attempt order is resolved
4. Promptium checks whether a key exists for each candidate provider
5. the provider client sends the request to the provider API
6. the first successful result is returned to the UI

This keeps provider-specific network logic out of the UI layer.

## Provider Endpoints

Current API roots used by the provider client are:

- Gemini: `https://generativelanguage.googleapis.com/v1beta`
- OpenAI: `https://api.openai.com/v1`
- Anthropic: `https://api.anthropic.com/v1`
- OpenRouter: `https://openrouter.ai/api/v1`

These are also reflected in the extension host permissions.

## Timeout and Error Handling

Promptium wraps provider requests with a timeout. The current default timeout in the provider client is 18 seconds.

Common error categories:

- `invalid_key`
- `quota`
- `network`
- `unknown`

HTTP behavior is normalized roughly as follows:

- `401` or `403` -> invalid key
- `429` -> quota or rate limit
- `5xx` or transport failure -> network/provider failure

If the current provider fails, Promptium can continue to the next configured provider in the fallback order.

## Provider-Specific Notes

### Gemini

- default first-party provider experience in the registry
- uses the Google Generative Language API
- key is passed through `x-goog-api-key`

### OpenAI

- uses chat completions
- key is passed as `Authorization: Bearer ...`

### Anthropic

- uses the Messages API
- request headers include `anthropic-version` and `x-api-key`
- validation uses a minimal message request rather than a models listing endpoint

### OpenRouter

- behaves as a multi-model routing layer
- can expose free and paid upstream models behind one provider key
- sends an `HTTP-Referer` derived from the extension runtime context

## Security and Privacy Expectations

Promptium does not provide its own hosted AI backend.

That means:

- API requests go directly from the extension runtime to the configured provider
- the user chooses which provider receives provider-backed prompt content
- keys are stored in browser session storage instead of long-term local storage

Users should still assume that any text sent through provider-backed features is transmitted to that chosen external provider.

## Troubleshooting

### A Feature Says the Provider Key Is Missing

Check whether:

- a key was actually saved in Settings
- the browser session was restarted, which clears session-stored keys
- the active provider is set to a provider without a key

### A Feature Works Sometimes but Not Always

This can happen when Promptium falls back from the selected provider to another configured provider. Verify which providers currently have valid keys.

### Validation Fails but the Key Looks Correct

Possible causes:

- provider outage
- quota exhaustion or rate limiting
- wrong provider selected for the key type
- network restrictions blocking the provider endpoint

### OpenRouter Returns Different Behavior Than First-Party Providers

That can be expected because OpenRouter is a provider aggregator. Model behavior, rate limits, and availability can differ from direct-provider integrations.

## Related Documentation

- [../guides/SETUP.md](../guides/SETUP.md)
- [LOCALMODELS.md](./LOCALMODELS.md)
- [PERMISSIONS.md](./PERMISSIONS.md)
- [STORAGE.md](./STORAGE.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
