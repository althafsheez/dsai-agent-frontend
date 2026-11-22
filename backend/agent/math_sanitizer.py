import re


def sanitize_math_text(text: str) -> str:
    """
    Sanitizes raw LaTeX math notation into clean, human-readable Unicode and Markdown.
    Protects user experience when LLMs inadvertently output LaTeX commands.
    """
    if not text:
        return text

    # 1. Un-wrap block math $$...$$ and \[...\]
    text = re.sub(r"\$\$([^\$]+)\$\$", r"\1", text)
    text = re.sub(r"\\\[(.*?)\\\]", r"\1", text, flags=re.DOTALL)

    # 2. Replace nested/single \text{...}, \mathrm{...}, \operatorname{...}
    for _ in range(3):
        text = re.sub(r"\\(?:text|mathrm|operatorname)\{([^{}]+)\}", r"\1", text)

    # 3. Replace \mathbf{...} or \textbf{...} -> **...**
    for _ in range(3):
        text = re.sub(r"\\(?:mathbf|textbf)\{([^{}]+)\}", r"**\1**", text)

    # 4. Replace \mathit{...} or \textit{...} -> *...*
    for _ in range(3):
        text = re.sub(r"\\(?:mathit|textit)\{([^{}]+)\}", r"*\1*", text)

    # 5. Replace fractions: \frac{a}{b} -> (a / b)
    for _ in range(3):
        text = re.sub(r"\\frac\{([^{}]+)\}\{([^{}]+)\}", r"(\1 / \2)", text)

    # 6. Common mathematical operators to clean Unicode
    text = re.sub(r"\\times\b", "×", text)
    text = re.sub(r"\\cdot\b", "·", text)
    text = re.sub(r"\\div\b", "÷", text)
    text = re.sub(r"\\pm\b", "±", text)
    text = re.sub(r"\\approx\b", "≈", text)
    text = re.sub(r"\\neq\b", "≠", text)
    text = re.sub(r"\\(?:leq|le)\b", "≤", text)
    text = re.sub(r"\\(?:geq|ge)\b", "≥", text)
    text = re.sub(r"\\(?:dots|cdots|ldots)\b", "...", text)
    text = re.sub(r"\\%", "%", text)
    text = re.sub(r"\\_", "_", text)
    text = re.sub(r"\\alpha\b", "α", text)
    text = re.sub(r"\\beta\b", "β", text)
    text = re.sub(r"\\mu\b", "μ", text)
    text = re.sub(r"\\sigma\b", "σ", text)
    text = re.sub(r"\\sum\b", "Σ", text)

    # 7. Clean up doubled spaces inside bold markers: **1.25  percentage points** -> **1.25 percentage points**
    text = re.sub(r"\*\*\s*([^*]+?)\s*\*\*", lambda m: f"**{re.sub(r'  +', ' ', m.group(1).strip())}**", text)

    # 8. Un-wrap math expressions enclosed in $...$ or \(...\)
    # Match \(...\)
    text = re.sub(r"\\\((.*?)\\\)", r"\1", text)

    # Match $...$ only when it contains mathematical operators, equations, or percentage:
    # e.g., $8%$, $x = y$, $(0.20 \times 0.08) = 0.016$, etc.
    # We do NOT match when opening '$' is a standalone currency figure followed by digits.
    def unwrap_math_dollar(m: re.Match) -> str:
        inner = m.group(1).strip()
        # If it's a standalone currency number, preserve it
        if re.match(r"^\d+(?:,\d{3})*(?:\.\d+)?(?:[kKmMbBtT]|\b)$", inner):
            return m.group(0)
        # If it has math indicators (=, ×, +, -, /, %, ≈, ≤, ≥, *, (, )) or pure variable name
        if re.search(r"[=×·÷±≈≠≤≥%_^\(\)\+\-\*\/]|\b(?:Rise|Share|Rate|Total|Mean|Median|Churn|Score|Count)\b", inner):
            return inner
        return m.group(0)

    text = re.sub(r"\$([^\$\n]{1,200}?)\$", unwrap_math_dollar, text)

    return text
