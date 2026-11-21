import asyncio
import csv
import json
import os
import random
import time
from typing import List, Dict, Any

from agentic.agent.react_loop import ReActAgent
from agentic.config import get_gemini_api_key, get_gemini_model
from agentic.observability import RunTracker


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
    
    tracker = RunTracker(
        run_id=f"bench-q{qid}-{int(time.time())}",
        chat_id="bench-session",
        user_query=query,
        model=agent.model,
        dataset_path=dpath,
    )
    
    start_time = time.perf_counter()
    tools_called = []
    final_content = ""
    turns = 0
    tool_counter = 0
    
    async for event in agent.stream_query(query=query, dataset_path=dpath):
        etype = event.get("type")
        if etype == "tool_call":
            tool_counter += 1
            tname = event.get("tool", "tool")
            args = event.get("arguments", {})
            tools_called.append(tname)
            tracker.start_tool(tname, f"call-{tool_counter}", f"step-{tool_counter}", args)
        elif etype == "tool_result":
            tname = event.get("tool", "tool")
            res = event.get("result", {})
            tracker.end_tool(tname, output=res)
        elif etype == "delta":
            tracker.record_first_token()
            final_content += event.get("content", "")
        elif etype == "done":
            turns = event.get("metrics", {}).get("turns", 1)
            if not final_content and event.get("content"):
                final_content = event.get("content")
        elif etype == "error":
            print(f"      [!] Stream error: {event.get('content')}")
            final_content = f"Error: {event.get('content')}"
            
    trace = tracker.finish(
        final_response=final_content,
        status="completed" if not final_content.startswith("Error:") else "failed",
        turn_count=turns,
    )
    
    metrics = trace["metrics"]
    elapsed_ms = metrics["total_response_time_ms"]
    elapsed_sec = round(elapsed_ms / 1000, 2)
    ttft_ms = metrics["ttft_ms"]
    tool_ms = metrics["tool_execution_time_ms"]
    llm_ms = metrics["llm_time_ms"]
    sub_5s = elapsed_ms < 5000.0
    
    print(f"      Total: {elapsed_ms}ms ({elapsed_sec}s) | TTFT: {ttft_ms}ms | Tools: {tool_ms}ms | LLM: {llm_ms}ms | Sub-5s: {'YES' if sub_5s else 'NO'}")
    
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
        "ttft_ms": ttft_ms,
        "tool_execution_ms": tool_ms,
        "llm_execution_ms": llm_ms,
        "turns": turns,
        "sub_5s": sub_5s,
        "answer_preview": preview,
        "full_answer": final_content,
    }


async def main():
    api_key = get_gemini_api_key()
    model = get_gemini_model()
    print("=" * 80)
    print("DSAI PHASE 0 AGENTIC ARCHITECTURE: 10-QUESTION BENCHMARK")
    print(f"Active Model: {model}")
    print(f"API Key Configured: {'YES' if api_key else 'NO'}")
    print("=" * 80)
    
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
        
    print("\n" + "=" * 80)
    print("BENCHMARK SUMMARY TABLE")
    print("=" * 80)
    header = f"{'#':<3} | {'Category':<28} | {'Tools':<18} | {'TTFT':<7} | {'Total':<8} | {'Sub-5s':<6}"
    print(header)
    print("-" * len(header))
    
    total_latency = 0.0
    sub_5s_count = 0
    for r in results:
        tools_str = ",".join(r["tools_called"]) if r["tools_called"] else "Direct LLM"
        if len(tools_str) > 18:
            tools_str = tools_str[:15] + "..."
        sub_str = "PASS" if r["sub_5s"] else "FAIL"
        print(f"{r['id']:<3} | {r['category'][:28]:<28} | {tools_str:<18} | {r['ttft_ms']}ms | {r['latency_ms']}ms | {sub_str:<6}")
        total_latency += r["latency_ms"]
        if r["sub_5s"]:
            sub_5s_count += 1
            
    avg_latency = total_latency / len(results)
    print("-" * len(header))
    print(f"Average Response Time: {avg_latency:.1f}ms ({avg_latency/1000:.2f}s)")
    print(f"Sub-5s Compliance: {sub_5s_count}/{len(results)} ({sub_5s_count/len(results)*100:.0f}%)")
    print("=" * 80)
    
    # Save results to JSON file for persistence
    output_json = os.path.join(os.path.dirname(__file__), "benchmark_results.json")
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
        
    print(f"Detailed results saved to: {output_json}")
    print(f"Human-readable audit log saved to: {os.path.join(os.path.dirname(__file__), 'logs', 'chat_traces.log')}")


if __name__ == "__main__":
    asyncio.run(main())
