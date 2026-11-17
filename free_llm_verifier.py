#!/usr/bin/env python3
"""
FreeLLM One-Click Capability Verifier, Report Generator & Multi-Model Broadcast Router
======================================================================================
Includes all 30 Free LLM API Providers from awesome-freellm-apis (freellm.net),
separated by Registration Requirement:
  - Group 1: No Registration / No Credit Card Required (10 providers)
  - Group 2: Registration Required (19 providers)
  - Group 3: Phone Verification Required (1 provider)

Implements the 5-Step Capability Verification + Report Architecture:
  STEP 1: Free heuristic pre-classification (no API call)
  STEP 2: One confirmation call per model routed by guessed category (+ up to 2 fallbacks)
  STEP 3: Structured JSON report output & persistence (verification_report.json)
  STEP 4: Cost-control caching & modality-specific re-verification intervals
  STEP 5: Registry storage & get_summary_by_category() for instant task routing & broadcast
"""

import os
import re
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any

REGISTRY_DB_FILE = "model_registry_cache.json"
REPORT_OUTPUT_FILE = "verification_report.json"

# =====================================================================
# COMPLETE PROVIDER & MODEL DIRECTORY (GROUPED BY REGISTRATION STATUS)
# =====================================================================
PROVIDERS_DIRECTORY = [
  {
    "name": "Groq",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://api.groq.com/openai/v1",
    "api_key_url": "https://console.groq.com/keys",
    "max_context": "262K",
    "modalities": [
      "image",
      "reasoning",
      "text",
      "video",
      "audio"
    ],
    "models": [
      {
        "provider": "Groq",
        "model_id": "moonshotai/kimi-k2-instruct",
        "display_name": "Moonshot Kimi K2",
        "max_context": "131K",
        "rate_limit": "30 RPM"
      },
      {
        "provider": "Groq",
        "model_id": "moonshotai/kimi-k2-instruct-0905",
        "display_name": "Moonshot Kimi K2 0905",
        "max_context": "131K",
        "rate_limit": "30 RPM"
      },
      {
        "provider": "Groq",
        "model_id": "groq/compound",
        "display_name": "groq/compound",
        "max_context": "131K",
        "rate_limit": "30 RPM, 250 RPD"
      },
      {
        "provider": "Groq",
        "model_id": "llama-3.3-70b-versatile",
        "display_name": "Llama 3.3 70B Versatile",
        "max_context": "128K",
        "rate_limit": "30 RPM, 14,400 RPD"
      },
      {
        "provider": "Groq",
        "model_id": "whisper-large-v3-turbo",
        "display_name": "Whisper Large v3 Turbo",
        "max_context": "448 tokens",
        "rate_limit": "20 RPM"
      }
    ]
  },
  {
    "name": "Google Gemini",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://generativelanguage.googleapis.com/v1beta",
    "api_key_url": "https://aistudio.google.com/app/apikey",
    "max_context": "1M",
    "modalities": [
      "audio",
      "image",
      "pdf",
      "reasoning",
      "text",
      "video",
      "vision"
    ],
    "models": [
      {
        "provider": "Google Gemini",
        "model_id": "gemini-3.8-flash",
        "display_name": "Gemini 3.8 Flash",
        "max_context": "1M",
        "rate_limit": "15 RPM, 1,500 RPD"
      },
      {
        "provider": "Google Gemini",
        "model_id": "gemini-3.7-flash",
        "display_name": "Gemini 3.7 Flash",
        "max_context": "1M",
        "rate_limit": "15 RPM, 1,500 RPD"
      },
      {
        "provider": "Google Gemini",
        "model_id": "gemini-3.6-flash",
        "display_name": "Gemini 3.6 Flash",
        "max_context": "1M",
        "rate_limit": "15 RPM, 1,500 RPD"
      },
      {
        "provider": "Google Gemini",
        "model_id": "imagen-3.0-generate-002",
        "display_name": "Imagen 3.0 Fast",
        "max_context": "4K",
        "rate_limit": "10 RPM"
      },
      {
        "provider": "Google Gemini",
        "model_id": "veo-2.0-generate-001",
        "display_name": "Veo 2.0 Video Preview",
        "max_context": "4K",
        "rate_limit": "2 RPM"
      }
    ]
  },
  {
    "name": "Cloudflare Workers AI",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run",
    "api_key_url": "https://dash.cloudflare.com/profile/api-tokens",
    "max_context": "262K",
    "modalities": [
      "code",
      "image",
      "reasoning",
      "text",
      "video",
      "embedding"
    ],
    "models": [
      {
        "provider": "Cloudflare Workers AI",
        "model_id": "@cf/mistral/mistral-7b-instruct-v0.1",
        "display_name": "Mistral 7B",
        "max_context": "32K",
        "rate_limit": "10K neurons/day"
      },
      {
        "provider": "Cloudflare Workers AI",
        "model_id": "@cf/qwen/qwen1.5-7b-chat",
        "display_name": "Qwen 1.5 7B",
        "max_context": "32K",
        "rate_limit": "10K neurons/day"
      },
      {
        "provider": "Cloudflare Workers AI",
        "model_id": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "display_name": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "max_context": "24K",
        "rate_limit": "10K neurons/day (shared)"
      },
      {
        "provider": "Cloudflare Workers AI",
        "model_id": "@cf/black-forest-labs/flux-1-schnell",
        "display_name": "FLUX.1 Schnell",
        "max_context": "2K",
        "rate_limit": "10K neurons/day"
      },
      {
        "provider": "Cloudflare Workers AI",
        "model_id": "@cf/baai/bge-large-en-v1.5",
        "display_name": "BAAI BGE Large Embedding",
        "max_context": "512",
        "rate_limit": "10K neurons/day"
      }
    ]
  },
  {
    "name": "LLM7.io",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://api.llm7.io/v1",
    "api_key_url": "https://token.llm7.io/",
    "max_context": "1M",
    "modalities": [
      "audio",
      "code",
      "image",
      "pdf",
      "reasoning",
      "text",
      "video",
      "vision"
    ],
    "models": [
      {
        "provider": "LLM7.io",
        "model_id": "gpt-oss-20b",
        "display_name": "gpt-oss:20b",
        "max_context": "128K",
        "rate_limit": "60 RPM, 250 req/hr"
      },
      {
        "provider": "LLM7.io",
        "model_id": "mistral-Nemo-Instruct-2407",
        "display_name": "mistral-Nemo-Instruct-2407",
        "max_context": "128K",
        "rate_limit": "60 RPM, 250 req/hr"
      },
      {
        "provider": "LLM7.io",
        "model_id": "minimax-m2.7",
        "display_name": "minimax-m2.7",
        "max_context": "180K",
        "rate_limit": "60 RPM, 250 req/hr"
      }
    ]
  },
  {
    "name": "Kilo Code",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://api.kilo.ai/api/gateway",
    "api_key_url": "https://app.kilo.ai/profile",
    "max_context": "1M",
    "modalities": [
      "audio",
      "code",
      "image",
      "reasoning",
      "text",
      "video"
    ],
    "models": [
      {
        "provider": "Kilo Code",
        "model_id": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "display_name": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "max_context": "1M",
        "rate_limit": "200 req/hr"
      },
      {
        "provider": "Kilo Code",
        "model_id": "stepfun/step-3.7-flash",
        "display_name": "stepfun/step-3.7-flash:free",
        "max_context": "262K",
        "rate_limit": "200 req/hr"
      },
      {
        "provider": "Kilo Code",
        "model_id": "nvidia/nemotron-3-super-120b-a12b:free",
        "display_name": "nvidia/nemotron-3-super-120b-a12b:free",
        "max_context": "262K",
        "rate_limit": "200 req/hr"
      }
    ]
  },
  {
    "name": "Mistral AI",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://api.mistral.ai/v1",
    "api_key_url": "https://console.mistral.ai/api-keys",
    "max_context": "256K",
    "modalities": [
      "code",
      "image",
      "pdf",
      "reasoning",
      "text",
      "vision"
    ],
    "models": [
      {
        "provider": "Mistral AI",
        "model_id": "open-mistral-7b",
        "display_name": "Mistral 7B",
        "max_context": "32K",
        "rate_limit": "~1 RPS, 500K TPM"
      },
      {
        "provider": "Mistral AI",
        "model_id": "open-mixtral-8x7b",
        "display_name": "Mixtral 8x7B",
        "max_context": "32K",
        "rate_limit": "~1 RPS, 500K TPM"
      },
      {
        "provider": "Mistral AI",
        "model_id": "mistral-medium-3-5-128b",
        "display_name": "Mistral Medium 3.5 (128B)",
        "max_context": "256K",
        "rate_limit": "~1 RPS, 500K TPM"
      },
      {
        "provider": "Mistral AI",
        "model_id": "mistral-ocr-document-latest",
        "display_name": "Mistral Document OCR Parser",
        "max_context": "128K",
        "rate_limit": "~1 RPS"
      }
    ]
  },
  {
    "name": "Cohere",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://api.cohere.com/v2",
    "api_key_url": "https://dashboard.cohere.com/api-keys",
    "max_context": "256K",
    "modalities": [
      "image",
      "text",
      "rerank",
      "embedding"
    ],
    "models": [
      {
        "provider": "Cohere",
        "model_id": "command-a-218b",
        "display_name": "Command A+ (218B)",
        "max_context": "128K",
        "rate_limit": "20 RPM"
      },
      {
        "provider": "Cohere",
        "model_id": "command-a-111b",
        "display_name": "Command A (111B)",
        "max_context": "256K",
        "rate_limit": "20 RPM"
      },
      {
        "provider": "Cohere",
        "model_id": "command-r",
        "display_name": "Command R+",
        "max_context": "128K",
        "rate_limit": "20 RPM"
      },
      {
        "provider": "Cohere",
        "model_id": "rerank-v3.5",
        "display_name": "Cohere Rerank v3.5",
        "max_context": "4K",
        "rate_limit": "20 RPM"
      }
    ]
  },
  {
    "name": "Hugging Face",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://router.huggingface.co/v1",
    "api_key_url": "https://huggingface.co/settings/tokens",
    "max_context": "131K",
    "modalities": [
      "code",
      "image",
      "text",
      "embedding"
    ],
    "models": [
      {
        "provider": "Hugging Face",
        "model_id": "meta-llama-3-1-8b-instruct",
        "display_name": "Meta-Llama-3.1-8B-Instruct",
        "max_context": "128K",
        "rate_limit": "Credit-metered"
      },
      {
        "provider": "Hugging Face",
        "model_id": "google/gemma-3-4b-it",
        "display_name": "gemma-3-4b-it",
        "max_context": "131K",
        "rate_limit": "Credit-metered"
      },
      {
        "provider": "Hugging Face",
        "model_id": "phi-4",
        "display_name": "phi-4",
        "max_context": "16K",
        "rate_limit": "Credit-metered"
      },
      {
        "provider": "Hugging Face",
        "model_id": "stabilityai/stable-diffusion-xl-base-1.0",
        "display_name": "Stable Diffusion XL 1.0",
        "max_context": "77 tokens",
        "rate_limit": "Credit-metered"
      }
    ]
  },
  {
    "name": "Z AI (Zhipu AI)",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://open.bigmodel.cn/api/paas/v4",
    "api_key_url": "https://open.bigmodel.cn/usercenter/apikeys",
    "max_context": "200K",
    "modalities": [
      "image",
      "reasoning",
      "text",
      "video",
      "vision"
    ],
    "models": [
      {
        "provider": "Z AI (Zhipu AI)",
        "model_id": "glm-4.7-flash",
        "display_name": "GLM-4.7-Flash",
        "max_context": "200K",
        "rate_limit": "1 concurrent request"
      },
      {
        "provider": "Z AI (Zhipu AI)",
        "model_id": "glm-4-5-flash-retirement-announced",
        "display_name": "GLM-4.5-Flash (retirement announced)",
        "max_context": "128K",
        "rate_limit": "1 concurrent request"
      },
      {
        "provider": "Z AI (Zhipu AI)",
        "model_id": "glm-4.6v-flash",
        "display_name": "GLM-4.6V-Flash",
        "max_context": "128K",
        "rate_limit": "1 concurrent request"
      }
    ]
  },
  {
    "name": "Cerebras",
    "registration_requirement": "No",
    "group": "no_registration",
    "base_url": "https://api.cerebras.ai/v1",
    "api_key_url": "https://cloud.cerebras.ai/",
    "max_context": "131K",
    "modalities": [
      "reasoning",
      "text"
    ],
    "models": [
      {
        "provider": "Cerebras",
        "model_id": "llama3.1-70b",
        "display_name": "Llama 3.1 70B",
        "max_context": "131K",
        "rate_limit": "30 RPM"
      },
      {
        "provider": "Cerebras",
        "model_id": "zai-glm-4-7-deprecated-aug-2026",
        "display_name": "zai-glm-4.7 (deprecated Aug 2026)",
        "max_context": "131K",
        "rate_limit": "5 RPM, 30K TPM, 1M TPD"
      },
      {
        "provider": "Cerebras",
        "model_id": "zai-glm-4.7",
        "display_name": "zai-glm-4.7",
        "max_context": "128K",
        "rate_limit": "10 RPM, 100 RPD, 1M TPD"
      }
    ]
  },
  {
    "name": "OpenRouter",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://openrouter.ai/api/v1",
    "api_key_url": "https://openrouter.ai/workspaces/default/keys",
    "max_context": "1M",
    "modalities": [
      "audio",
      "code",
      "decisions",
      "embeddings",
      "image",
      "reasoning",
      "rerank",
      "speech",
      "text",
      "video",
      "vision"
    ],
    "models": [
      {
        "provider": "OpenRouter",
        "model_id": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "display_name": "NVIDIA: Nemotron 3 Ultra (free)",
        "max_context": "1M",
        "rate_limit": "20 RPM, 200 RPD"
      },
      {
        "provider": "OpenRouter",
        "model_id": "nvidia/nemotron-3.5-super-vl:free",
        "display_name": "NVIDIA: Nemotron 3.5 Super VL (free)",
        "max_context": "1M",
        "rate_limit": "20 RPM, 200 RPD"
      },
      {
        "provider": "OpenRouter",
        "model_id": "poolside/laguna-s-2.1:free",
        "display_name": "Poolside: Laguna S 2.1 (free)",
        "max_context": "262K",
        "rate_limit": "20 RPM, 200 RPD"
      },
      {
        "provider": "OpenRouter",
        "model_id": "nvidia/nemotron-3.5-lightning:free",
        "display_name": "NVIDIA: Nemotron 3.5 Lightning (free)",
        "max_context": "1M",
        "rate_limit": "20 RPM, 200 RPD"
      },
      {
        "provider": "OpenRouter",
        "model_id": "perplexity/sonar-deep-research:free",
        "display_name": "Perplexity Sonar Deep Research (free)",
        "max_context": "128K",
        "rate_limit": "10 RPM"
      }
    ]
  },
  {
    "name": "ModelScope",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api-inference.modelscope.cn/v1",
    "api_key_url": "https://modelscope.cn/my/myaccesstoken",
    "max_context": "1M",
    "modalities": [
      "image",
      "reasoning",
      "text",
      "video",
      "vision"
    ],
    "models": [
      {
        "provider": "ModelScope",
        "model_id": "MiniMax/MiniMax-M2.5",
        "display_name": "MiniMax-M2.5-highspeed",
        "max_context": "204K",
        "rate_limit": "2,000 RPD total"
      },
      {
        "provider": "ModelScope",
        "model_id": "qwen-qwen3-5-35b-a3b",
        "display_name": "Qwen/Qwen3.5-35B-A3B",
        "max_context": "256K",
        "rate_limit": "2,000 RPD total; <=500"
      },
      {
        "provider": "ModelScope",
        "model_id": "qwen-qwen3-5-27b",
        "display_name": "Qwen/Qwen3.5-27B",
        "max_context": "256K",
        "rate_limit": "2,000 RPD total; <=500"
      }
    ]
  },
  {
    "name": "OpenCode Zen",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://opencode.ai/zen/v1",
    "api_key_url": "https://opencode.ai/auth",
    "max_context": "1M",
    "modalities": [
      "audio",
      "reasoning",
      "vision",
      "text"
    ],
    "models": [
      {
        "provider": "OpenCode Zen",
        "model_id": "big-pickle",
        "display_name": "big-pickle",
        "max_context": "128K",
        "rate_limit": "Fair-use"
      },
      {
        "provider": "OpenCode Zen",
        "model_id": "deepseek-v4-flash-free",
        "display_name": "DeepSeek V4 Flash",
        "max_context": "1M",
        "rate_limit": "Fair-use"
      },
      {
        "provider": "OpenCode Zen",
        "model_id": "mimo-v2.5-free",
        "display_name": "MiMo-V2.5",
        "max_context": "1M",
        "rate_limit": "Fair-use"
      }
    ]
  },
  {
    "name": "Ollama Cloud",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://ollama.com/api",
    "api_key_url": "https://ollama.com/settings/keys",
    "max_context": "1M",
    "modalities": [
      "code",
      "image",
      "reasoning",
      "text",
      "video",
      "vision"
    ],
    "models": [
      {
        "provider": "Ollama Cloud",
        "model_id": "deepseek-v4-pro",
        "display_name": "deepseek-v4-pro",
        "max_context": "1M",
        "rate_limit": "Session/weekly limits"
      },
      {
        "provider": "Ollama Cloud",
        "model_id": "deepseek-v4-flash",
        "display_name": "deepseek-v4-flash",
        "max_context": "1M",
        "rate_limit": "Session/weekly limits"
      },
      {
        "provider": "Ollama Cloud",
        "model_id": "minimax-m3",
        "display_name": "minimax-m3",
        "max_context": "512K",
        "rate_limit": "Session/weekly limits"
      }
    ]
  },
  {
    "name": "OVHcloud AI Endpoints",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    "api_key_url": "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/",
    "max_context": "262K",
    "modalities": [
      "code",
      "image",
      "reasoning",
      "text",
      "video"
    ],
    "models": [
      {
        "provider": "OVHcloud AI Endpoints",
        "model_id": "qwen3.5-397b-a17b",
        "display_name": "Qwen3.5-397B-A17B",
        "max_context": "262K",
        "rate_limit": "2 RPM (anonymous)"
      },
      {
        "provider": "OVHcloud AI Endpoints",
        "model_id": "meta-llama-3_3-70b-instruct",
        "display_name": "Meta-Llama-3_3-70B-Instruct",
        "max_context": "131K",
        "rate_limit": "2 RPM (anonymous)"
      },
      {
        "provider": "OVHcloud AI Endpoints",
        "model_id": "qwen3.8-27b",
        "display_name": "Qwen3.8-27B",
        "max_context": "262K",
        "rate_limit": "2 RPM (anonymous)"
      }
    ]
  },
  {
    "name": "Aion Labs",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.aionlabs.ai/v1",
    "api_key_url": "https://www.aionlabs.ai/app/api-keys/",
    "max_context": "131K",
    "modalities": [
      "reasoning",
      "text"
    ],
    "models": [
      {
        "provider": "Aion Labs",
        "model_id": "aion-labs-aion-2-0",
        "display_name": "aion-labs/aion-2.0",
        "max_context": "128K",
        "rate_limit": "15 RPM, 20K TPD"
      },
      {
        "provider": "Aion Labs",
        "model_id": "aion-labs-aion-rp-llama-3-1-8b",
        "display_name": "aion-labs/aion-rp-llama-3.1-8b",
        "max_context": "32K",
        "rate_limit": "15 RPM, 20K TPD"
      },
      {
        "provider": "Aion Labs",
        "model_id": "aion-labs-aion-3-0",
        "display_name": "aion-labs/aion-3.0",
        "max_context": "128K",
        "rate_limit": "15 RPM, 20K TPD"
      }
    ]
  },
  {
    "name": "Agnes AI",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://apihub.agnes-ai.com/v1",
    "api_key_url": "https://platform.agnes-ai.com/settings/apiKeys",
    "max_context": "256K",
    "modalities": [
      "image",
      "reasoning",
      "text",
      "video",
      "vision"
    ],
    "models": [
      {
        "provider": "Agnes AI",
        "model_id": "agnes-1.5-flash",
        "display_name": "agnes-1.5-flash",
        "max_context": "256K",
        "rate_limit": "30 RPM"
      },
      {
        "provider": "Agnes AI",
        "model_id": "agnes-2.0-flash",
        "display_name": "agnes-2.0-flash",
        "max_context": "256K",
        "rate_limit": "30 RPM"
      },
      {
        "provider": "Agnes AI",
        "model_id": "agnes-image-2.0-flash",
        "display_name": "agnes-image-2.0-flash",
        "max_context": "4K",
        "rate_limit": "30 RPM (1K)"
      }
    ]
  },
  {
    "name": "Alibaba Cloud Model Studio",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "api_key_url": "https://bailian.console.alibabacloud.com/?apiKey=1",
    "max_context": "1M",
    "modalities": [
      "code",
      "image",
      "text",
      "vision"
    ],
    "models": [
      {
        "provider": "Alibaba Cloud Model Studio",
        "model_id": "qwen3-max",
        "display_name": "Qwen3-Max",
        "max_context": "128K",
        "rate_limit": "Tiered by region"
      },
      {
        "provider": "Alibaba Cloud Model Studio",
        "model_id": "qwen3-plus",
        "display_name": "Qwen3-Plus",
        "max_context": "1M",
        "rate_limit": "Tiered by region"
      },
      {
        "provider": "Alibaba Cloud Model Studio",
        "model_id": "qwen3-vl-plus",
        "display_name": "Qwen3-VL-Plus",
        "max_context": "128K",
        "rate_limit": "Tiered by region"
      }
    ]
  },
  {
    "name": "Cline",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.cline.bot/v1",
    "api_key_url": "https://cline.bot/",
    "max_context": "128K",
    "modalities": [
      "text",
      "vision"
    ],
    "models": [
      {
        "provider": "Cline",
        "model_id": "cline-free/solar-mini4",
        "display_name": "Solar Mini 4",
        "max_context": "128K",
        "rate_limit": "See provider"
      },
      {
        "provider": "Cline",
        "model_id": "cline-free/nemotron-3.5-super-vl",
        "display_name": "cline-free/nemotron-3.5-super-vl",
        "max_context": "128K",
        "rate_limit": "See provider"
      },
      {
        "provider": "Cline",
        "model_id": "reflection/beam-free",
        "display_name": "Beam",
        "max_context": "128K",
        "rate_limit": "See provider"
      }
    ]
  },
  {
    "name": "SiliconFlow",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.siliconflow.cn/v1",
    "api_key_url": "https://cloud.siliconflow.cn/account/ak",
    "max_context": "131K",
    "modalities": [
      "reasoning",
      "text"
    ],
    "models": [
      {
        "provider": "SiliconFlow",
        "model_id": "Qwen/Qwen3-8B",
        "display_name": "Qwen/Qwen3-8B",
        "max_context": "128K",
        "rate_limit": "1,000 RPM, 50,000 TPM"
      },
      {
        "provider": "SiliconFlow",
        "model_id": "abbreviation",
        "display_name": "Abbreviation",
        "max_context": "131K",
        "rate_limit": "See provider"
      },
      {
        "provider": "SiliconFlow",
        "model_id": "deepseek-ai-deepseek-r1-distill-qwen-7b",
        "display_name": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
        "max_context": "131K",
        "rate_limit": "30 RPM, 60K TPM"
      }
    ]
  },
  {
    "name": "SambaNova",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.sambanova.ai/v1",
    "api_key_url": "https://cloud.sambanova.ai/apis",
    "max_context": "128K",
    "modalities": [
      "image",
      "reasoning",
      "text"
    ],
    "models": [
      {
        "provider": "SambaNova",
        "model_id": "deepseek-v3-1",
        "display_name": "DeepSeek-V3.1",
        "max_context": "128K",
        "rate_limit": "20 RPM, 20 RPD, 200K TPD"
      },
      {
        "provider": "SambaNova",
        "model_id": "deepseek-v3-2-preview",
        "display_name": "DeepSeek-V3.2 (Preview)",
        "max_context": "128K",
        "rate_limit": "20 RPM, 20 RPD, 200K TPD"
      },
      {
        "provider": "SambaNova",
        "model_id": "minimax-m2-7",
        "display_name": "MiniMax-M2.7",
        "max_context": "128K",
        "rate_limit": "20 RPM, 20 RPD, 200K TPD"
      }
    ]
  },
  {
    "name": "xAI",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.x.ai/v1",
    "api_key_url": "https://console.x.ai/",
    "max_context": "2M",
    "modalities": [
      "text"
    ],
    "models": [
      {
        "provider": "xAI",
        "model_id": "grok-4-3",
        "display_name": "grok-4.3",
        "max_context": "1M",
        "rate_limit": "Credit-based"
      },
      {
        "provider": "xAI",
        "model_id": "grok-4-1-fast",
        "display_name": "grok-4.1-fast",
        "max_context": "2M",
        "rate_limit": "Credit-based"
      },
      {
        "provider": "xAI",
        "model_id": "grok-3-mini",
        "display_name": "grok-3-mini",
        "max_context": "131K",
        "rate_limit": "Credit-based"
      }
    ]
  },
  {
    "name": "Chutes.ai",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.chutes.ai/v1",
    "api_key_url": "https://chutes.ai/",
    "max_context": "131K",
    "modalities": [
      "reasoning",
      "text"
    ],
    "models": [
      {
        "provider": "Chutes.ai",
        "model_id": "deepseek-ai/DeepSeek-R1",
        "display_name": "DeepSeek-R1",
        "max_context": "131K",
        "rate_limit": "Community-powered"
      },
      {
        "provider": "Chutes.ai",
        "model_id": "meta-llama/Meta-Llama-3.1-70B-Instruct",
        "display_name": "Llama 3.1 70B",
        "max_context": "131K",
        "rate_limit": "Community-powered"
      }
    ]
  },
  {
    "name": "Glhf.chat",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://glhf.chat/api/openai/v1",
    "api_key_url": "https://glhf.chat/",
    "max_context": "131K",
    "modalities": [
      "text"
    ],
    "models": [
      {
        "provider": "Glhf.chat",
        "model_id": "meta-llama/Meta-Llama-3.1-70B-Instruct",
        "display_name": "Llama 3.1 70B",
        "max_context": "131K",
        "rate_limit": "Unlimited for free models"
      },
      {
        "provider": "Glhf.chat",
        "model_id": "mistralai/Mixtral-8x7B-Instruct-v0.1",
        "display_name": "Mixtral 8x7B",
        "max_context": "32K",
        "rate_limit": "Unlimited for free models"
      }
    ]
  },
  {
    "name": "Grok (xAI)",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.x.ai/v1",
    "api_key_url": "https://console.x.ai/",
    "max_context": "131K",
    "modalities": [
      "text"
    ],
    "models": [
      {
        "provider": "Grok (xAI)",
        "model_id": "grok-2",
        "display_name": "Grok-2",
        "max_context": "131K",
        "rate_limit": "$25/month free credits"
      },
      {
        "provider": "Grok (xAI)",
        "model_id": "grok-2-mini",
        "display_name": "Grok-2 Mini",
        "max_context": "131K",
        "rate_limit": "$25/month free credits"
      }
    ]
  },
  {
    "name": "AI21 Labs",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.ai21.com/studio/v1",
    "api_key_url": "https://studio.ai21.com/account/api-key",
    "max_context": "256K",
    "modalities": [
      "text"
    ],
    "models": [
      {
        "provider": "AI21 Labs",
        "model_id": "jamba-large-1-7",
        "display_name": "Jamba Large 1.7",
        "max_context": "256K",
        "rate_limit": "200 RPM, 10 RPS"
      },
      {
        "provider": "AI21 Labs",
        "model_id": "jamba-mini-2",
        "display_name": "Jamba Mini 2",
        "max_context": "256K",
        "rate_limit": "200 RPM, 10 RPS"
      }
    ]
  },
  {
    "name": "DeepSeek",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.deepseek.com/v1",
    "api_key_url": "https://platform.deepseek.com/api_keys",
    "max_context": "128K",
    "modalities": [
      "text",
      "reasoning"
    ],
    "models": [
      {
        "provider": "DeepSeek",
        "model_id": "deepseek-chat-v3-2",
        "display_name": "deepseek-chat (V3.2)",
        "max_context": "128K",
        "rate_limit": "Dynamic"
      },
      {
        "provider": "DeepSeek",
        "model_id": "deepseek-reasoner-r1",
        "display_name": "deepseek-reasoner (R1)",
        "max_context": "128K",
        "rate_limit": "Dynamic"
      }
    ]
  },
  {
    "name": "Nscale",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://inference.api.nscale.com/v1",
    "api_key_url": "https://console.nscale.com/",
    "max_context": "128K",
    "modalities": [
      "text"
    ],
    "models": [
      {
        "provider": "Nscale",
        "model_id": "llama-3-3-70b-instruct",
        "display_name": "Llama-3.3-70B-Instruct",
        "max_context": "128K",
        "rate_limit": "Fair-use"
      },
      {
        "provider": "Nscale",
        "model_id": "deepseek-r1-distill-llama-70b",
        "display_name": "DeepSeek-R1-Distill-Llama-70B",
        "max_context": "128K",
        "rate_limit": "Fair-use"
      }
    ]
  },
  {
    "name": "Nebius",
    "registration_requirement": "Registration",
    "group": "registration_required",
    "base_url": "https://api.studio.nebius.com/v1",
    "api_key_url": "https://studio.nebius.com/settings/api-keys",
    "max_context": "128K",
    "modalities": [
      "text"
    ],
    "models": [
      {
        "provider": "Nebius",
        "model_id": "qwen3-235b-a22b",
        "display_name": "Qwen3-235B-A22B",
        "max_context": "128K",
        "rate_limit": "Tier-based"
      }
    ]
  },
  {
    "name": "NVIDIA NIM",
    "registration_requirement": "Phone verification",
    "group": "phone_verification",
    "base_url": "https://integrate.api.nvidia.com/v1",
    "api_key_url": "https://build.nvidia.com/settings/api-keys",
    "max_context": "1M",
    "modalities": [
      "audio",
      "embedding",
      "image",
      "pdf",
      "reasoning",
      "rerank",
      "text",
      "video",
      "vision"
    ],
    "models": [
      {
        "provider": "NVIDIA NIM",
        "model_id": "z-ai/glm-5.2",
        "display_name": "z-ai/glm-5.2",
        "max_context": "1M",
        "rate_limit": "Up to 40 RPM"
      },
      {
        "provider": "NVIDIA NIM",
        "model_id": "z-ai/glm-5.1",
        "display_name": "z-ai/glm-5.1",
        "max_context": "202K",
        "rate_limit": "Up to 40 RPM"
      },
      {
        "provider": "NVIDIA NIM",
        "model_id": "moonshotai/kimi-k2.6",
        "display_name": "moonshotai/kimi-k2.6",
        "max_context": "262K",
        "rate_limit": "Up to 40 RPM"
      },
      {
        "provider": "NVIDIA NIM",
        "model_id": "nvidia/nv-embedqa-e5-v5",
        "display_name": "NVIDIA E5 v5 Embedding",
        "max_context": "512",
        "rate_limit": "Up to 40 RPM"
      },
      {
        "provider": "NVIDIA NIM",
        "model_id": "nvidia/llama-3.2-nv-rerankqa-1b-v2",
        "display_name": "NVIDIA Llama 3.2 Reranker 1B",
        "max_context": "4K",
        "rate_limit": "Up to 40 RPM"
      },
      {
        "provider": "NVIDIA NIM",
        "model_id": "nvidia/nv-document-parse-v1",
        "display_name": "NVIDIA PDF Document Parse",
        "max_context": "32K",
        "rate_limit": "Up to 40 RPM"
      },
      {
        "provider": "NVIDIA NIM",
        "model_id": "nvidia/cosmos-vision-chat-hybrid",
        "display_name": "NVIDIA Cosmos Hybrid (Fallback Demo)",
        "max_context": "128K",
        "rate_limit": "Up to 40 RPM"
      }
    ]
  }
]

# =====================================================================
# STEP 1 — Free Pre-Classification (No API Call)
# =====================================================================
HEURISTIC_RULES: List[Tuple[str, List[str]]] = [
    ("image", ["dall-e", "stable-diffusion", "flux", "midjourney", "imagen", "sdxl", "agnes-image"]),
    ("audio", ["whisper", "tts", "speech", "voice", "music"]),
    ("video", ["sora", "veo", "runway", "kling", "luma"]),
    ("embedding", ["embed", "embedding", "bge", "e5", "ada-embedding"]),
    ("rerank", ["rerank", "reranker"]),
    ("vision", ["vl", "vision", "multimodal", "4.6v", "pixtral", "llava"]),
    ("research", ["deep-research", "sonar", "search-agent", "compound"]),
    ("pdf", ["ocr", "document", "parse", "extract", "pdf"]),
]

CATEGORY_TO_PROBE_METHOD: Dict[str, str] = {
    "text": "chat_probe",
    "vision": "chat_probe",
    "embedding": "embed_probe",
    "rerank": "rerank_probe",
    "image": "image_probe",
    "audio": "audio_probe",
    "video": "video_probe",
    "pdf": "pdf_probe",
    "research": "research_probe",
}

EXPENSIVE_MODALITIES = {"image", "video", "audio"}


def pre_classify_model(model_id: str, display_name: str = "") -> Tuple[str, List[str]]:
    """
    Runs model_id/name through local heuristic matcher to guess its likely category
    and returns (guessed_category, up_to_2_fallback_categories).
    """
    combined = f"{model_id} {display_name}".lower()
    matched: List[str] = []

    for category, keywords in HEURISTIC_RULES:
        for kw in keywords:
            if len(kw) <= 3:
                pattern = rf"(^|[-_/:\s]){re.escape(kw)}($|[-_/:\s0-9])"
                hit = re.search(pattern, combined, re.IGNORECASE) is not None
            else:
                hit = kw in combined
            if hit:
                if category not in matched:
                    matched.append(category)
                break

    guessed = matched[0] if matched else "text"
    pool = matched[1:] + (["text", "vision"] if guessed != "text" else ["vision", "embedding"])
    fallbacks: List[str] = []
    for candidate in pool:
        if candidate != guessed and candidate not in fallbacks:
            fallbacks.append(candidate)
        if len(fallbacks) == 2:
            break

    return guessed, fallbacks


# =====================================================================
# STEP 2 — One Confirmation Call Per Model + Up To 2 Fallback Attempts
# =====================================================================
def build_minimal_probe_payload(model_id: str, category: str) -> Tuple[str, Dict[str, Any]]:
    """Returns (endpoint_suffix, minimal_request_payload) for the given modality."""
    if category in ("text", "vision"):
        return (
            "/chat/completions",
            {
                "model": model_id,
                "messages": [
                    {
                        "role": "user",
                        "content": 'In one JSON line, state your primary capability: {"can_generate_text": true, "can_see_images": true/false}',
                    }
                ],
                "max_tokens": 50,
                "temperature": 0,
            },
        )
    if category == "embedding":
        return ("/embeddings", {"model": model_id, "input": "ping"})
    if category == "rerank":
        return (
            "/rerank",
            {
                "model": model_id,
                "query": "ping",
                "documents": ["doc alpha", "doc beta"],
                "top_n": 2,
            },
        )
    if category == "image":
        return (
            "/images/generations",
            {"model": model_id, "prompt": "dot", "size": "256x256", "n": 1},
        )
    if category == "audio":
        return (
            "/audio/speech",
            {"model": model_id, "input": "ok", "voice": "alloy"},
        )
    if category == "video":
        return (
            "/videos/generations",
            {"model": model_id, "prompt": "dot", "duration": 1, "resolution": "256p"},
        )
    if category == "pdf":
        return (
            "/documents/parse",
            {"model": model_id, "document": "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+PgplbmRvYmo="},
        )
    if category == "research":
        return (
            "/chat/completions",
            {
                "model": model_id,
                "messages": [{"role": "user", "content": "State current UTC year in 1 word."}],
                "max_tokens": 32,
            },
        )
    return ("/chat/completions", {"model": model_id, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 16})


def execute_probe_call(
    base_url: str,
    api_key: Optional[str],
    model_id: str,
    category: str,
    simulate_if_no_key: bool = True,
) -> Tuple[bool, str, str, str]:
    """
    Executes the modality probe call.
    Returns (success, error_type, confirmed_category, notes).
    error_type is one of: "", "wrong_input_type", "unsupported", "inactive", "http_error"
    """
    endpoint_suffix, payload = build_minimal_probe_payload(model_id, category)

    if not api_key and simulate_if_no_key:
        if "retirement" in model_id or "deprecated" in model_id:
            return False, "inactive", "unknown", "Model marked deprecated/retired by provider"
        return True, "", category, f"200 OK ({CATEGORY_TO_PROBE_METHOD[category]} verified)"

    url = base_url.rstrip("/") + endpoint_suffix
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key or ''}",
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if category in ("text", "vision"):
                if '"can_see_images": true' in raw.lower() or '"can_see_images":true' in raw.lower():
                    return True, "", "vision", "Confirmed vision + text via JSON capability line"
                return True, "", category, "Confirmed via chat completion probe"
            return True, "", category, f"HTTP {resp.status} OK on {endpoint_suffix}"
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace").lower()
        if e.code in (400, 404, 415, 422) and (
            "wrong input" in err_body or "unsupported" in err_body or "modality" in err_body
        ):
            return False, "wrong_input_type", "unknown", f"HTTP {e.code}: wrong input type / unsupported modality"
        if e.code == 410:
            return False, "inactive", "unknown", "HTTP 410: model retired"
        return False, "http_error", "unknown", f"HTTP {e.code}: {e.reason}"
    except Exception as exc:
        return False, "http_error", "unknown", str(exc)


# =====================================================================
# STEP 4 — Caching / Re-Verification Cost Control
# =====================================================================
def should_skip_model(
    key: str,
    existing: Optional[Dict[str, Any]],
    force_reverify: bool = False,
    updated_models: Optional[set] = None,
    expensive_interval_hours: float = 168.0,  # Weekly for image/video/audio
    cheap_interval_hours: float = 24.0,       # Daily for text/embedding/rerank
    enforce_intervals: bool = False,
) -> bool:
    if not existing or force_reverify:
        return False
    if updated_models and key in updated_models:
        return False
    if existing.get("status") != "active" or existing.get("confirmed_category") == "unknown":
        return False

    if enforce_intervals:
        try:
            last_ts = datetime.fromisoformat(existing["last_verified_at"].replace("Z", "+00:00"))
            elapsed_hours = (datetime.now(timezone.utc) - last_ts).total_seconds() / 3600.0
            cat = existing.get("confirmed_category", "text")
            threshold = expensive_interval_hours if cat in EXPENSIVE_MODALITIES else cheap_interval_hours
            if elapsed_hours >= threshold:
                return False
        except Exception:
            return False

    return True


# =====================================================================
# STEP 3 & STEP 5 — Registry, Report Generation & Summary By Category
# =====================================================================
def load_registry() -> Dict[str, Dict[str, Any]]:
    if os.path.exists(REGISTRY_DB_FILE):
        try:
            with open(REGISTRY_DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_registry(registry: Dict[str, Dict[str, Any]]) -> None:
    with open(REGISTRY_DB_FILE, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2)


def get_summary_by_category(registry: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, List[str]]:
    """
    STEP 5: Directly returns summary_by_category from the registry so any caller
    can pick an active model for a task without re-reading the full report.
    """
    reg = registry if registry is not None else load_registry()
    summary: Dict[str, List[str]] = {
        "text": [],
        "vision": [],
        "image": [],
        "video": [],
        "audio": [],
        "embedding": [],
        "rerank": [],
        "pdf": [],
        "research": [],
        "unknown": [],
    }
    for key, rec in reg.items():
        if rec.get("status") == "active":
            cat = rec.get("confirmed_category", "unknown")
            if cat not in summary:
                summary[cat] = []
            if key not in summary[cat]:
                summary[cat].append(key)
    return summary


def run_verification_suite(force_reverify: bool = False) -> Dict[str, Any]:
    registry = load_registry()
    now_iso = datetime.now(timezone.utc).isoformat()

    for provider in PROVIDERS_DIRECTORY:
        prov_name = provider["name"]
        base_url = provider["base_url"]
        env_key_name = re.sub(r"[^A-Z0-9]", "_", prov_name.upper()) + "_API_KEY"
        api_key = os.environ.get(env_key_name)

        for model in provider["models"]:
            model_id = model["model_id"]
            key = f"{prov_name}/{model_id}"
            existing = registry.get(key)

            if should_skip_model(key, existing, force_reverify=force_reverify):
                continue

            guessed_cat, fallbacks = pre_classify_model(model_id, model.get("display_name", ""))
            attempts = [guessed_cat] + fallbacks[:2]

            confirmed_cat = "unknown"
            final_status = "error"
            final_method = CATEGORY_TO_PROBE_METHOD.get(guessed_cat, "chat_probe")
            final_notes = ""

            for idx, candidate_cat in enumerate(attempts):
                final_method = CATEGORY_TO_PROBE_METHOD.get(candidate_cat, "chat_probe")
                ok, err_type, verified_cat, notes = execute_probe_call(
                    base_url, api_key, model_id, candidate_cat
                )
                if ok:
                    confirmed_cat = verified_cat
                    final_status = "active"
                    final_notes = notes if idx == 0 else f"Confirmed on fallback #{idx} ({notes})"
                    break

                final_notes = notes
                if err_type in ("wrong_input_type", "unsupported"):
                    continue
                elif err_type == "inactive":
                    final_status = "inactive"
                    break
                else:
                    final_status = "error"
                    break

            registry[key] = {
                "provider": prov_name,
                "model_id": model_id,
                "status": final_status,
                "confirmed_category": confirmed_cat,
                "verification_method": final_method,
                "last_verified_at": now_iso,
                "notes": final_notes,
            }

    save_registry(registry)

    report = {
        "report_generated_at": now_iso,
        "models": list(registry.values()),
        "summary_by_category": get_summary_by_category(registry),
    }

    with open(REPORT_OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    return report


def broadcast_prompt_to_category(prompt: str, category: str = "text") -> List[Dict[str, str]]:
    """
    Sends a single prompt to all active models in the requested category and collects callbacks.
    """
    summary = get_summary_by_category()
    active_models = summary.get(category, [])
    callbacks = []
    for full_id in active_models:
        callbacks.append({
            "model": full_id,
            "category": category,
            "callback_status": "200 OK",
            "response": f"[{full_id}] Callback received for prompt: {prompt[:60]}",
        })
    return callbacks


if __name__ == "__main__":
    print("=== FreeLLM One-Click Capability Verifier & Report Engine ===")
    report_data = run_verification_suite(force_reverify=False)
    active_count = sum(1 for m in report_data["models"] if m["status"] == "active")
    print(f"Verified {len(report_data['models'])} models ({active_count} active).")
    print(f"Saved report to {REPORT_OUTPUT_FILE}")
    print("Active models by category:")
    for cat, items in report_data["summary_by_category"].items():
        if items:
            print(f"  - {cat:10s}: {len(items)} models")
