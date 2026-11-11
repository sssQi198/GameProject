#!/usr/bin/env python3
"""测试学校AI平台上的可用模型"""
import json
import urllib.request
import urllib.error
import ssl

API_KEY = "sk-2bfc1e6811ab13360ab5c3bfcdd425043be93030e6ba5cbf"
BASE_URL = "https://ailab.gbu.edu.cn/v1"

# 需要测试的模型（特别是支持多模态的）
MODELS_TO_TEST = [
    "gpt-4o-mini",      # OpenAI，支持多模态
    "glm-5.3-flash",    # 智谱，支持多模态
    "glm-5.3",          # 智谱/被路由到Kimi K3
    "gpt-5.6-sol",      # OpenAI，支持多模态
    "gpt-5.6-luna",     # OpenAI
    "gpt-6-sol",        # OpenAI
    "gpt-6-astra",      # OpenAI
    "gpt-6-luna",       # OpenAI
    "gpt-6.1-sol",      # OpenAI
    "deepseek-v4-1-flash",  # 用户常用
    "deepseek-v4-flash",
    "deepseek-chat",
    "deepseek-reasoner",
    "qwen3.8-flash-se",
    "kimi-k3",
    "doubao-seed-2-1-pro-260628",
]

ssl_ctx = ssl.create_default_context()

def test_model(model_id):
    """测试模型是否可用"""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "model": model_id,
        "messages": [{"role": "user", "content": "回复一个字：好"}],
        "max_tokens": 10,
        "stream": False,
    }
    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=json.dumps(data).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as resp:
            result = json.loads(resp.read())
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            return {"status": "OK", "content": content[:30]}
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        return {"status": f"HTTP {e.code}", "error": body}
    except Exception as e:
        return {"status": "ERROR", "error": str(e)[:200]}

# 先获取模型列表
print("=" * 60)
print("1. 获取模型列表")
print("=" * 60)
try:
    req = urllib.request.Request(f"{BASE_URL}/models", headers={"Authorization": f"Bearer {API_KEY}"})
    with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as resp:
        models_data = json.loads(resp.read())
        models = models_data.get("data", [])
        print(f"  平台返回 {len(models)} 个模型:")
        for m in models:
            print(f"    - {m.get('id', '?')}  (owned_by={m.get('owned_by', '?')})")
except Exception as e:
    print(f"  ❌ 获取模型列表失败: {e}")

print()
print("=" * 60)
print("2. 测试关键模型")
print("=" * 60)

for model_id in MODELS_TO_TEST:
    result = test_model(model_id)
    status = result["status"]
    if status == "OK":
        print(f"  ✅ {model_id:35s} → {result['content']}")
    else:
        print(f"  ❌ {model_id:35s} → {status}: {result.get('error', '')[:100]}")
