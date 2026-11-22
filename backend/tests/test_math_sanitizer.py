from backend.agent.math_sanitizer import sanitize_math_text


def test_sanitize_math_text_with_user_churn_example():
    sample = (
        r"To calculate the aggregate churn rates and analyze the shift, we use the weighted average formula: "
        r"$\text{Aggregate Churn} = (\text{Share}_P \times \text{Churn}_P) + (\text{Share}_O \times \text{Churn}_O)$" + "\n\n"
        r"### (a) Compute the aggregate churn rate in Quarter 1 and Quarter 2" + "\n\n"
        r"* Quarter 1: $(0.20 \times 0.08) + (0.80 \times 0.03) = 0.016 + 0.024 = \mathbf{4.0\%}$" + "\n\n"
        r"* Quarter 2: $(0.45 \times 0.08) + (0.55 \times 0.03) = 0.036 + 0.0165 = \mathbf{5.25\%}$" + "\n\n"
        r"### (b) By how many percentage points did aggregate churn rise?" + "\n\n"
        r"$\text{Rise} = 5.25\% - 4.0\% = \mathbf{1.25 \text{ percentage points}}$" + "\n\n"
        r"### (c) What fraction of that rise is due to within-segment churn changes?" + "\n\n"
        r"The problem states that churn within each segment did not change ($8\%$ for P and $3\%$ for O)."
    )

    cleaned = sanitize_math_text(sample)

    # 1. No raw LaTeX command remnants
    assert r"\text" not in cleaned
    assert r"\mathbf" not in cleaned
    assert r"\times" not in cleaned
    assert r"\%" not in cleaned

    # 2. Math operators cleanly transformed to Unicode & bold markdown
    assert "×" in cleaned
    assert "**4.0%**" in cleaned
    assert "**5.25%**" in cleaned
    assert "**1.25 percentage points**" in cleaned
    assert "8% for P and 3% for O" in cleaned
    assert "Aggregate Churn = (Share_P × Churn_P) + (Share_O × Churn_O)" in cleaned


def test_sanitize_math_preserves_currency():
    sample = "Total revenue was $1,500,000 and profit was $4.2M."
    cleaned = sanitize_math_text(sample)
    assert "$1,500,000" in cleaned
    assert "$4.2M" in cleaned


def test_sanitize_fractions_and_operators():
    sample = r"We calculate $\frac{a + b}{c \times d} \approx 0.75 \pm 0.05$."
    cleaned = sanitize_math_text(sample)
    assert "(a + b / c × d)" in cleaned
    assert "≈ 0.75 ± 0.05" in cleaned
    assert "$" not in cleaned
