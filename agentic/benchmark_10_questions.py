import asyncio
import csv
import json
import os
import random
import time
from typing import List, Dict, Any

from agentic.agent.react_loop import ReActAgent
from agentic.config import get_gemini_api_key, get_gemini_model


def create_synthetic_dataset(path: str, num_rows: int = 1000) -> str:
    """Creates a sample analytical dataset for DuckDB/Python benchmarking."""
    random.seed(42)
    categories = ["Electronics", "Clothing", "Home & Kitchen", "Books", "Beauty"]
    
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["transaction_id", "category", "revenue", "unit_cost", "units_sold", "rating", "is_returned"])
        for i in range(1, num_rows + 1):
            category = random.choice(categories)
            units = random.randint(1, 10)
            cost = round(random.uniform(5.0, 150.0), 2)
            margin = random.uniform(1.2, 2.5)
            revenue = round(cost * margin * units, 2)
            rating = round(random.uniform(1.0, 5.0), 1)
            returned = random.choice(["true", "false", "false", "false"])
            writer.writerow([i, category, revenue, cost, units, rating, returned])
            
    return path


BENCHMARK_QUESTIONS = [
    {
        "id": 1,
        "category": "Direct General Knowledge",
        "question": "What is the key mathematical difference between L1 (Lasso) and L2 (Ridge) regularization?",
        "expected_tool": "None (Direct LLM)",
        "requires_dataset": False,
    },
    {
        "id": 2,
        "category": "Direct General Knowledge",
        "question": "In distributed systems, state the CAP theorem and explain why a network partition forces a tradeoff.",
        "expected_tool": "None (Direct LLM)",
        "requires_dataset": False,
    },
    {
        "id": 3,
        "category": "Mathematical Complex Calculation",
        "question": "Use python to calculate the exact value of 47^7 modulo 10007, and tell me if that result is prime.",
        "expected_tool": "run_python_code",
        "requires_dataset": False,
    },
    {
        "id": 4,
        "category": "Mathematical Complex Calculation",
        "question": "Given sample A = [23, 21, 26, 24, 28, 29, 27] and sample B = [18, 19, 21, 20, 22, 19, 20], use scipy.stats to calculate the independent two-sample t-statistic and two-tailed p-value.",
        "expected_tool": "run_python_code",
        "requires_dataset": False,
    },
    {
        "id": 5,
        "category": "Mathematical Complex Calculation",
        "question": "Generate a 4x4 Hilbert matrix where H[i,j] = 1/(i+j+1) for i,j in 0..3 using numpy, then compute its eigenvalues and condition number.",
        "expected_tool": "run_python_code",
        "requires_dataset": False,
    },
    {
        "id": 6,
        "category": "Analytical Data Query (DuckDB SQL)",
        "question": "Using SQL on table 'dataset', find the top 3 categories by total revenue, showing category, total revenue, and average rating rounded to 2 decimals.",
        "expected_tool": "run_duckdb_sql",
        "requires_dataset": True,
    },
    {
        "id": 7,
        "category": "Analytical Data Query (DuckDB SQL)",
        "question": "From table 'dataset', query the total transaction count, median (50th percentile) revenue, and 95th percentile revenue.",
        "expected_tool": "run_duckdb_sql",
        "requires_dataset": True,
    },
    {
        "id": 8,
        "category": "Analytical Data Query (DuckDB SQL)",
        "question": "Calculate what percentage of transactions in each category had revenue strictly greater than the overall average transaction revenue across the dataset.",
        "expected_tool": "run_duckdb_sql",
        "requires_dataset": True,
    },
    {
        "id": 9,
        "category": "Web Search / Information Retrieval",
        "question": "Search the web for the Python programming language: who created it and in what year was it first released?",
        "expected_tool": "web_search",
        "requires_dataset": False,
    },
    {
        "id": 10,
        "category": "Web Search / Information Retrieval",
        "question": "Search the web for the James Webb Space Telescope (JWST): what is the diameter of its primary mirror and what is its orbital location?",
        "expected_tool": "web_search",
        "requires_dataset": False,
    },
]


async def run_single_benchmark(agent: ReActAgent, item: Dict[str, Any], dataset_path: str) -> Dict[str, Any]:
    qid = item["id"]
    query = item["question"]
    category = item["category"]
    dpath = dataset_path if item["requires_dataset"] else None
    
    print(f"\n[{qid}/10] Testing: {query[:65]}...")
    print(f"      Category: {category}")
    
    start_time = time.perf_counter()
    tools_called = []
    final_content = ""
    turns = 0
    
    async for event in agent.stream_query(query=query, dataset_path=dpath):
        etype = event.get("type")
        if etype == "tool_call":
            tools_called.append(event.get("tool"))
        elif etype == "delta":
            final_content += event.get("content", "")
        elif etype == "done":
            turns = event.get("metrics", {}).get("turns", 1)
            if not final_content and event.get("content"):
                final_content = event.get("content")
        elif etype == "error":
            print(f"      [!] Stream error: {event.get('content')}")
            final_content = f"Error: {event.get('content')}"
            
    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
    elapsed_sec = round(elapsed_ms / 1000, 2)
    sub_5s = elapsed_ms < 5000.0
    
    print(f"      Latency: {elapsed_ms}ms ({elapsed_sec}s) | Tools: {tools_called or 'Direct LLM'} | Sub-5s: {'YES' if sub_5s else 'NO'}")
    
    # Clean preview snippet
    preview = final_content.strip().replace("\n", " ")[:120] + "..." if len(final_content) > 120 else final_content.strip()
    
    return {
        "id": qid,
        "category": category,
        "question": query,
        "expected_tool": item["expected_tool"],
        "tools_called": tools_called,
        "latency_ms": elapsed_ms,
        "latency_sec": elapsed_sec,
        "turns": turns,
        "sub_5s": sub_5s,
        "answer_preview": preview,
        "full_answer": final_content,
    }


async def main():
    api_key = get_gemini_api_key()
    model = get_gemini_model()
    print("=" * 75)
    print("DSAI PHASE 0 AGENTIC ARCHITECTURE: 10-QUESTION BENCHMARK")
    print(f"Active Model: {model}")
    print(f"API Key Configured: {'YES' if api_key else 'NO'}")
    print("=" * 75)
    
    dataset_file = os.path.join(os.path.dirname(__file__), "benchmark_dataset.csv")
    create_synthetic_dataset(dataset_file, num_rows=1000)
    print(f"Created benchmark dataset: {dataset_file} (1,000 rows)")
    
    agent = ReActAgent(model=model, api_key=api_key)
    
    results: List[Dict[str, Any]] = []
    
    for item in BENCHMARK_QUESTIONS:
        res = await run_single_benchmark(agent, item, dataset_file)
        results.append(res)
        # Small 0.6s breathing window between calls to prevent burst rate limits
        await asyncio.sleep(0.6)
        
    print("\n" + "=" * 75)
    print("BENCHMARK EXECUTION COMPLETE - COMPILING METRICS...")
    print("=" * 75)
    
    # Save results to JSON file for persistence
    output_json = os.path.join(os.path.dirname(__file__), "benchmark_results.json")
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
        
    print(f"Results saved to: {output_json}")


if __name__ == "__main__":
    asyncio.run(main())
