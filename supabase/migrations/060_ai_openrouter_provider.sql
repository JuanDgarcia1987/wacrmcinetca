-- ============================================================
-- 060_ai_openrouter_provider.sql — dedicated OpenRouter provider
-- ============================================================
--
-- OpenRouter is OpenAI-compatible, but it's a distinct catalogue with
-- `sk-or-…` keys and a fixed endpoint, so it gets its own provider value
-- rather than forcing everyone through the generic openai_compatible
-- option. The base_url is still stored (pinned to OpenRouter's host) so
-- the "reuse stored key" logic keeps working without special-casing.

ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_provider_check;

ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'openai_compatible', 'openrouter'));

ALTER TABLE ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;

ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'openai_compatible', 'openrouter'));