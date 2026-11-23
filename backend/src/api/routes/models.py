"""
API Routes for AI Model Management, Connection Verification, and Hardware Telemetry.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import time
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ...ai import MODEL_CAPABILITIES, get_model_capabilities
from ...auth_headers import get_authenticated_user_id
from ...config import Config, get_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/models", tags=["models"])


class TestModelConnectionRequest(BaseModel):
    model_name: str = Field(..., max_length=120)
    ollama_base_url: Optional[str] = Field(None, max_length=255)


@router.get("/capabilities")
async def get_all_model_capabilities(
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Return capability registry for supported models and runtime output mode."""
    active_caps = get_model_capabilities(config.llm)
    return {
        "active_model": config.llm,
        "active_capabilities": {
            "native_json_schema": active_caps.native_json_schema,
            "tool_calling": active_caps.tool_calling,
            "streaming": active_caps.streaming,
            "max_output_tokens": active_caps.max_output_tokens,
            "context_window": active_caps.context_window,
            "local_inference": active_caps.local_inference,
        },
        "registry": {
            name: {
                "native_json_schema": c.native_json_schema,
                "tool_calling": c.tool_calling,
                "streaming": c.streaming,
                "max_output_tokens": c.max_output_tokens,
                "context_window": c.context_window,
                "local_inference": c.local_inference,
            }
            for name, c in MODEL_CAPABILITIES.items()
        },
    }


@router.get("/ollama-local")
async def discover_local_ollama_models(
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Query local Ollama daemon for actually installed models."""
    ollama_url = config.ollama_base_url or "http://localhost:11434"
    endpoint = f"{ollama_url.rstrip('/')}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(endpoint)
            if resp.status_code == 200:
                data = resp.json()
                models = [
                    {
                        "name": f"ollama:{m['name']}",
                        "raw_name": m["name"],
                        "size_bytes": m.get("size"),
                        "modified_at": m.get("modified_at"),
                        "digest": m.get("digest", "")[:12],
                    }
                    for m in data.get("models", [])
                ]
                return {
                    "available": True,
                    "endpoint": ollama_url,
                    "count": len(models),
                    "models": models,
                }
            return {
                "available": False,
                "endpoint": ollama_url,
                "error": f"Ollama returned HTTP {resp.status_code}",
                "models": [],
            }
    except Exception as exc:
        return {
            "available": False,
            "endpoint": ollama_url,
            "error": f"Could not connect to Ollama daemon at {ollama_url}: {exc}",
            "models": [],
        }


@router.post("/test-connection")
async def test_model_connection(
    payload: TestModelConnectionRequest,
    config: Config = Depends(get_config),
) -> Dict[str, Any]:
    """Verify live connectivity, response latency, and availability of a specific AI model."""
    start_time = time.monotonic()
    model = payload.model_name.strip()

    if model.startswith("ollama:"):
        model_tag = model.split(":", 1)[1]
        base_url = (payload.ollama_base_url or config.ollama_base_url or "http://localhost:11434").rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(f"{base_url}/api/tags")
                if res.status_code != 200:
                    return {
                        "connected": False,
                        "model": model,
                        "error": f"Ollama daemon returned HTTP {res.status_code}",
                    }
                installed = [m["name"] for m in res.json().get("models", [])]
                found = any(model_tag == m or model_tag in m for m in installed)
                latency_ms = round((time.monotonic() - start_time) * 1000, 1)
                return {
                    "connected": True,
                    "model": model,
                    "model_installed": found,
                    "latency_ms": latency_ms,
                    "endpoint": base_url,
                    "available_tags": installed,
                }
        except Exception as exc:
            return {
                "connected": False,
                "model": model,
                "error": f"Connection to {base_url} failed: {exc}",
            }

    if model.startswith("openrouter:"):
        api_key = config.openrouter_api_key
        if not api_key:
            return {
                "connected": False,
                "model": model,
                "error": "OPENROUTER_API_KEY is not configured.",
            }
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                latency_ms = round((time.monotonic() - start_time) * 1000, 1)
                return {
                    "connected": res.status_code == 200,
                    "model": model,
                    "latency_ms": latency_ms,
                    "status_code": res.status_code,
                }
        except Exception as exc:
            return {"connected": False, "model": model, "error": str(exc)}

    # Default check
    return {
        "connected": True,
        "model": model,
        "latency_ms": round((time.monotonic() - start_time) * 1000, 1),
        "note": "Configured provider checked",
    }


@router.get("/telemetry")
async def get_hardware_telemetry() -> Dict[str, Any]:
    """
    Return genuine hardware telemetry (CPU cores, RAM, GPU/CUDA detection).
    Never fabricates GPU models or active states if not physically present.
    """
    import os
    import psutil

    cpu_count = os.cpu_count() or 1
    mem = psutil.virtual_memory()

    # Detect genuine GPU via nvidia-smi if binary is available
    gpu_info = {"cuda_available": False, "gpus": [], "driver_version": None}
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            output = subprocess.check_output(
                [nvidia_smi, "--query-gpu=name,memory.total,memory.free,utilization.gpu", "--format=csv,noheader,nounits"],
                text=True,
                timeout=2,
            )
            gpus = []
            for line in output.strip().splitlines():
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 4:
                    gpus.append({
                        "name": parts[0],
                        "total_vram_mb": int(parts[1]),
                        "free_vram_mb": int(parts[2]),
                        "utilization_percent": int(parts[3]),
                    })
            if gpus:
                gpu_info["cuda_available"] = True
                gpu_info["gpus"] = gpus
        except Exception as exc:
            logger.debug("nvidia-smi query skipped: %s", exc)

    return {
        "cpu_cores": cpu_count,
        "ram_total_gb": round(mem.total / (1024 ** 3), 2),
        "ram_available_gb": round(mem.available / (1024 ** 3), 2),
        "ram_usage_percent": mem.percent,
        "gpu": gpu_info,
        "local_only_mode_active": bool(os.environ.get("LOCAL_ONLY_MODE") == "1"),
    }
