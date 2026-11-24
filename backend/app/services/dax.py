"""DAX measures (the Power BI formula language) over a dashboard's datasets.

A DAX expression is parsed and translated into one read-only SQLite query that runs in the same sandbox as SQL tiles
(`dashboard_sql.run_sql`). Each dataset is a table (named like the SQL tables, e.g. `orders.csv` -> `orders`).

How filter context works here:
- Every filter is a predicate on one table, keyed by (table, column). Slicers, the tile's group-by value and CALCULATE
  filters all live in the same map, so CALCULATE can replace or remove them like in Power BI.
- Each aggregation (SUM, COUNTROWS, SUMX, ...) becomes a correlated sub-query over its table with the filters for that
  table applied. A tile grouped by a column runs the measure once per distinct value of that column.
- Inside an iterator (SUMX, FILTER, ...) there is a row context; a measure or CALCULATE used there turns the current row
  into filters on every column of that row (context transition).

Not supported yet: relationships between tables (filters only apply to the table they name), RELATED, and time
intelligence (TOTALYTD, SAMEPERIODLASTYEAR, ...). Using them gives a clear error.
"""
from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field
from typing import Any

from .dashboard_sql import SqlError, run_sql, table_names

MAX_EXPRESSION = 4000
MAX_MEASURES = 50
MAX_DEPTH = 24
MAX_GROUPS = 200
_TOKEN = "⟦row⟧"  # stands for "the alias of the table being scanned" inside a filter predicate


class DaxError(Exception):
    """The formula could not be read or translated; the message is safe to show to the user."""


# ---------------------------------------------------------------- tokens

_TOKEN_RE = re.compile(
    r"""
    (?P<space>\s+|//[^\n]*|--[^\n]*|/\*.*?\*/)
  | (?P<number>\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)
  | (?P<string>"(?:[^"]|"")*")
  | (?P<quoted>'(?:[^']|'')+')
  | (?P<bracket>\[[^\]]+\])
  | (?P<ident>[A-Za-z_][A-Za-z0-9_.]*)
  | (?P<op>&&|\|\||<=|>=|<>|==|[-+*/^&=<>(),{}])
    """,
    re.VERBOSE | re.DOTALL,
)


@dataclass
class Tok:
    kind: str
    text: str
    pos: int


def tokenize(source: str) -> list[Tok]:
    tokens: list[Tok] = []
    position = 0
    while position < len(source):
        match = _TOKEN_RE.match(source, position)
        if not match:
            raise DaxError(f"Unexpected character {source[position]!r} at position {position + 1}.")
        kind = match.lastgroup or ""
        if kind != "space":
            tokens.append(Tok(kind, match.group(), position))
        position = match.end()
    tokens.append(Tok("end", "", len(source)))
    return tokens


# ---------------------------------------------------------------- syntax tree

@dataclass
class Num:
    value: float


@dataclass
class Str:
    value: str


@dataclass
class Col:
    table: str | None
    column: str


@dataclass
class Name:
    """A bare identifier: a VAR, a table, or TRUE/FALSE."""
    name: str


@dataclass
class MeasureRef:
    name: str


@dataclass
class Call:
    name: str
    args: list[Any]


@dataclass
class Bin:
    op: str
    left: Any
    right: Any


@dataclass
class Neg:
    value: Any


@dataclass
class ListLit:
    items: list[Any]


@dataclass
class VarBlock:
    names: list[tuple[str, Any]]
    body: Any


_LEVELS: list[set[str]] = [{"||"}, {"&&"}, {"=", "==", "<>", "<", ">", "<=", ">=", "IN"}, {"&"}, {"+", "-"}, {"*", "/"}, {"^"}]


class Parser:
    def __init__(self, source: str) -> None:
        self.tokens = tokenize(source)
        self.index = 0

    @property
    def tok(self) -> Tok:
        return self.tokens[self.index]

    def take(self) -> Tok:
        token = self.tokens[self.index]
        self.index += 1
        return token

    def expect(self, text: str) -> None:
        if self.tok.text != text:
            found = self.tok.text or "the end of the formula"
            raise DaxError(f"Expected '{text}' but found '{found}' at position {self.tok.pos + 1}.")
        self.take()

    def parse(self) -> Any:
        node = self.expression()
        if self.tok.kind != "end":
            raise DaxError(f"Unexpected '{self.tok.text}' at position {self.tok.pos + 1}.")
        return node

    def expression(self) -> Any:
        if self.tok.kind == "ident" and self.tok.text.upper() == "VAR":
            names: list[tuple[str, Any]] = []
            while self.tok.kind == "ident" and self.tok.text.upper() == "VAR":
                self.take()
                name = self.take()
                if name.kind != "ident":
                    raise DaxError(f"A VAR needs a name at position {name.pos + 1}.")
                self.expect("=")
                names.append((name.text, self.expression()))
            if not (self.tok.kind == "ident" and self.tok.text.upper() == "RETURN"):
                raise DaxError("A VAR block needs RETURN followed by the result.")
            self.take()
            return VarBlock(names, self.expression())
        return self.binary(0)

    def binary(self, level: int) -> Any:
        if level == len(_LEVELS):
            return self.unary()
        left = self.binary(level + 1)
        while True:
            op = self.tok.text.upper() if self.tok.kind == "ident" else self.tok.text
            if self.tok.kind not in ("op", "ident") or op not in _LEVELS[level]:
                return left
            self.take()
            right = self.binary(level + 1)
            left = Bin("=" if op == "==" else op, left, right)

    def unary(self) -> Any:
        if self.tok.text in ("-", "+") and self.tok.kind == "op":
            sign = self.take().text
            value = self.unary()
            return Neg(value) if sign == "-" else value
        return self.primary()

    def primary(self) -> Any:
        token = self.take()
        if token.kind == "number":
            return Num(float(token.text))
        if token.kind == "string":
            return Str(token.text[1:-1].replace('""', '"'))
        if token.kind == "bracket":
            return MeasureRef(token.text[1:-1].strip())
        if token.kind == "quoted":
            table = token.text[1:-1].replace("''", "'")
            if self.tok.kind == "bracket":
                return Col(table, self.take().text[1:-1].strip())
            return Name(table)
        if token.kind == "ident":
            if self.tok.text == "(":
                self.take()
                args: list[Any] = []
                if self.tok.text != ")":
                    args.append(self.expression())
                    while self.tok.text == ",":
                        self.take()
                        args.append(self.expression())
                self.expect(")")
                return Call(token.text.upper(), args)
            if self.tok.kind == "bracket":
                return Col(token.text, self.take().text[1:-1].strip())
            return Name(token.text)
        if token.text == "(":
            inner = self.expression()
            self.expect(")")
            return inner
        if token.text == "{":
            items = [self.expression()]
            while self.tok.text == ",":
                self.take()
                items.append(self.expression())
            self.expect("}")
            return ListLit(items)
        found = token.text or "the end of the formula"
        raise DaxError(f"Unexpected '{found}' at position {token.pos + 1}.")


def parse(source: str) -> Any:
    text = (source or "").strip()
    if not text:
        raise DaxError("The formula is empty.")
    if len(text) > MAX_EXPRESSION:
        raise DaxError(f"The formula is longer than {MAX_EXPRESSION} characters.")
    return Parser(text).parse()


def split_definition(text: str) -> tuple[str | None, str]:
    """`Total Sales = SUM(Sales[Amount])` -> ("Total Sales", "SUM(...)"); plain expressions come back unnamed."""
    match = re.match(r"^\s*(?:\[(?P<b>[^\]]+)\]|(?P<n>[A-Za-z_][A-Za-z0-9 _]*?))\s*:?=(?!=)\s*(?P<e>.+)$", text or "", re.DOTALL)
    if match and not re.search(r"[\[\(]", match.group("n") or ""):
        return (match.group("b") or match.group("n")).strip(), match.group("e").strip()
    return None, (text or "").strip()


# ---------------------------------------------------------------- translation

def _q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


@dataclass
class Filter:
    table: str
    sql: str  # predicate with `token` standing for the scanned table's alias
    kind: str  # slicer | group | calc | row
    token: str = _TOKEN


@dataclass
class Ctx:
    filters: dict[tuple[str, str], Filter] = field(default_factory=dict)
    rows: dict[str, str] = field(default_factory=dict)  # table -> alias of the current row (row context)
    variables: dict[str, Any] = field(default_factory=dict)  # name -> compiled SQL, or a table value
    stack: tuple[str, ...] = ()
    row_columns: dict[str, list[str]] = field(default_factory=dict)  # table -> the columns its current row has (VALUES rows have one)

    def copy(self, **changes: Any) -> "Ctx":
        fresh = Ctx(dict(self.filters), dict(self.rows), dict(self.variables), self.stack, dict(self.row_columns))
        for key, value in changes.items():
            setattr(fresh, key, value)
        return fresh


@dataclass
class TableValue:
    """A table expression: which table to scan, and the filter context to scan it with."""
    table: str
    ctx: Ctx
    distinct: str | None = None  # VALUES(T[c]) / DISTINCT(T[c]): one row per value of this column
    post: list[Filter] = field(default_factory=list)  # FILTER conditions on those distinct rows


_AGGREGATES = {"SUM": "SUM", "AVERAGE": "AVG", "MIN": "MIN", "MAX": "MAX", "COUNT": "COUNT", "COUNTA": "COUNT"}
_ITERATORS = {"SUMX": "SUM", "AVERAGEX": "AVG", "MINX": "MIN", "MAXX": "MAX", "COUNTX": "COUNT", "COUNTAX": "COUNT"}
_UNSUPPORTED = {
    "RELATED", "RELATEDTABLE", "USERELATIONSHIP", "CROSSFILTER", "TREATAS", "SUMMARIZE", "SUMMARIZECOLUMNS", "ADDCOLUMNS",
    "TOTALYTD", "TOTALQTD", "TOTALMTD", "SAMEPERIODLASTYEAR", "DATEADD", "DATESYTD", "DATESMTD", "DATESQTD", "PARALLELPERIOD",
    "PREVIOUSMONTH", "PREVIOUSYEAR", "PREVIOUSQUARTER", "DATESBETWEEN", "DATESINPERIOD", "RANKX", "TOPN", "EARLIER", "LOOKUPVALUE",
}
SUPPORTED = sorted(
    set(_AGGREGATES) | set(_ITERATORS) | {
        "DISTINCTCOUNT", "COUNTBLANK", "COUNTROWS", "CALCULATE", "FILTER", "ALL", "REMOVEFILTERS", "ALLEXCEPT", "ALLSELECTED",
        "KEEPFILTERS", "VALUES", "DISTINCT", "SELECTEDVALUE", "HASONEVALUE", "ISFILTERED", "DIVIDE", "IF", "SWITCH", "AND", "OR",
        "NOT", "ABS", "ROUND", "ROUNDUP", "ROUNDDOWN", "INT", "SQRT", "POWER", "MOD", "BLANK", "ISBLANK", "COALESCE", "TRUE",
        "FALSE", "CONCATENATE", "LEN", "UPPER", "LOWER", "TRIM", "LEFT", "RIGHT", "YEAR", "MONTH", "DAY", "MEDIAN",
    }
)


class Translator:
    def __init__(self, datasets: list[dict[str, Any]], measures: dict[str, str]) -> None:
        names = table_names(datasets)
        self.columns: dict[str, list[str]] = {}
        self.aliases: dict[str, str] = {}
        for dataset in datasets:
            table = names[str(dataset["id"])]
            self.columns[table] = [str(column) for column in dataset["columns"]]
            stem = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", str(dataset.get("name", "")))
            for alias in (table, stem, str(dataset.get("name", ""))):
                if alias:
                    self.aliases.setdefault(alias.lower(), table)
        self.measures = {name.lower(): (name, text) for name, text in measures.items()}
        self.parsed: dict[str, Any] = {}
        self.counter = itertools.count(1)

    # ---- names

    def table(self, name: str) -> str:
        table = self.aliases.get(name.lower())
        if not table:
            raise DaxError(f"There is no table called '{name}'. Tables: {', '.join(sorted(self.columns))}.")
        return table

    def column(self, node: Col) -> tuple[str, str]:
        if node.table is None:
            owners = [table for table, columns in self.columns.items() if any(column.lower() == node.column.lower() for column in columns)]
            if len(owners) != 1:
                raise DaxError(f"Write the table for [{node.column}], e.g. {next(iter(self.columns), 'Table')}[{node.column}].")
            table = owners[0]
        else:
            table = self.table(node.table)
        for column in self.columns[table]:
            if column.lower() == node.column.lower():
                return table, column
        raise DaxError(f"Table '{table}' has no column [{node.column}].")

    def alias(self) -> str:
        return f"s{next(self.counter)}"

    # ---- filters

    def where(self, table: str, ctx: Ctx, alias: str) -> str:
        parts = [item.sql.replace(item.token, alias) for item in ctx.filters.values() if item.table == table]
        return " WHERE " + " AND ".join(f"({part})" for part in parts) if parts else ""

    def transition(self, ctx: Ctx) -> Ctx:
        """Row context -> filter context: the current row becomes a filter on each of its columns."""
        if not ctx.rows:
            return ctx
        fresh = ctx.copy(rows={})
        for table, row in ctx.rows.items():
            for column in ctx.row_columns.get(table, self.columns[table]):
                fresh.filters[(table, column)] = Filter(table, f"{_TOKEN}.{_q(column)} IS {row}.{_q(column)}", "row")
        return fresh

    # ---- tables

    def table_value(self, node: Any, ctx: Ctx) -> TableValue:
        if isinstance(node, Name):
            value = ctx.variables.get(node.name.lower())
            if isinstance(value, TableValue):
                return value
            return TableValue(self.table(node.name), ctx)
        if isinstance(node, Call):
            name = node.name
            if name in ("ALL", "REMOVEFILTERS", "ALLSELECTED"):
                if not node.args:
                    raise DaxError(f"{name} needs a table or columns.")
                fresh = self.remove(node, ctx)
                first = node.args[0]
                if isinstance(first, Col):
                    table, column = self.column(first)
                    return TableValue(table, fresh, column if len(node.args) == 1 else None)
                return TableValue(self.table_value(first, ctx).table, fresh)
            if name in ("VALUES", "DISTINCT"):
                if len(node.args) != 1:
                    raise DaxError(f"{name} takes one column or table.")
                if isinstance(node.args[0], Col):
                    table, column = self.column(node.args[0])
                    return TableValue(table, ctx, column)
                return self.table_value(node.args[0], ctx)
            if name == "FILTER":
                if len(node.args) != 2:
                    raise DaxError("FILTER takes a table and a condition, e.g. FILTER(Sales, Sales[Amount] > 100).")
                source = self.table_value(node.args[0], ctx)
                if source.distinct:
                    limited = source.ctx.copy(row_columns={**source.ctx.row_columns, source.table: [source.distinct]})
                    return TableValue(source.table, source.ctx, source.distinct, [*source.post, self.row_filter(node.args[1], source.table, limited)])
                fresh = source.ctx.copy()
                fresh.filters[(source.table, f"#{next(self.counter)}")] = self.row_filter(node.args[1], source.table, source.ctx)
                return TableValue(source.table, fresh)
            if name == "ALLEXCEPT":
                return TableValue(self.table_value(node.args[0], ctx).table, self.remove(node, ctx))
        raise DaxError("Expected a table here, e.g. Sales, FILTER(Sales, ...), ALL(Sales) or VALUES(Sales[Region]).")

    def row_filter(self, node: Any, table: str, ctx: Ctx) -> Filter:
        """A condition evaluated for each row of `table` (row context). It gets its own placeholder so measures used inside
        it (which turn that row into filters on their own scans) still point at the row being tested."""
        token = f"\u27e6r{next(self.counter)}\u27e7"
        return Filter(table, self.scalar(node, ctx.copy(rows={**ctx.rows, table: token})), "calc", token)

    def remove(self, node: Call, ctx: Ctx) -> Ctx:
        """ALL / REMOVEFILTERS / ALLSELECTED / ALLEXCEPT: which filters to drop."""
        fresh = ctx.copy()
        name = node.name
        if name == "ALLEXCEPT":
            if len(node.args) < 2:
                raise DaxError("ALLEXCEPT takes a table and the columns whose filters stay, e.g. ALLEXCEPT(Sales, Sales[Region]).")
            table = self.table_value(node.args[0], ctx).table
            keep = {self.column(arg)[1] for arg in node.args[1:] if isinstance(arg, Col)}
            fresh.filters = {key: item for key, item in fresh.filters.items() if item.table != table or key[1] in keep}
            return fresh
        drop_kinds = {"group", "calc", "row"} if name == "ALLSELECTED" else {"slicer", "group", "calc", "row"}
        if node.args and all(isinstance(arg, Col) for arg in node.args):
            targets = {self.column(arg) for arg in node.args}
            fresh.filters = {key: item for key, item in fresh.filters.items() if not (key in targets and item.kind in drop_kinds)}
        else:
            tables = {self.table_value(arg, ctx).table for arg in node.args} if node.args else set(self.columns)
            fresh.filters = {key: item for key, item in fresh.filters.items() if not (item.table in tables and item.kind in drop_kinds)}
        return fresh

    def scan(self, value: TableValue, select: str, alias: str) -> str:
        source = f"{_q(value.table)} {alias}{self.where(value.table, value.ctx, alias)}"
        if value.distinct:
            column = _q(value.distinct)
            post = " AND ".join(f"({item.sql.replace(item.token, alias)})" for item in value.post)
            source = f"(SELECT DISTINCT {alias}.{column} AS {column} FROM {source}) {alias}" + (f" WHERE {post}" if post else "")
        return f"(SELECT {select} FROM {source})"

    # ---- scalars

    def scalar(self, node: Any, ctx: Ctx) -> str:
        if len(ctx.stack) > MAX_DEPTH:
            raise DaxError("The formula nests too deeply (measures calling each other?).")
        if isinstance(node, Num):
            return repr(int(node.value)) if node.value.is_integer() else repr(node.value)
        if isinstance(node, Str):
            return _lit(node.value)
        if isinstance(node, Neg):
            return f"(-{self.scalar(node.value, ctx)})"
        if isinstance(node, Name):
            key = node.name.lower()
            if key in ctx.variables and not isinstance(ctx.variables[key], TableValue):
                return ctx.variables[key]
            if key in ("true", "false"):
                return "1" if key == "true" else "0"
            raise DaxError(f"'{node.name}' is a table or an unknown name; a single value is needed here (e.g. COUNTROWS({node.name})).")
        if isinstance(node, Col):
            table, column = self.column(node)
            if table in ctx.rows:
                return f"{ctx.rows[table]}.{_q(column)}"
            raise DaxError(f"{table}[{column}] needs to be summarised here, e.g. SUM({table}[{column}]) or SELECTEDVALUE({table}[{column}]).")
        if isinstance(node, MeasureRef):
            return self.measure(node.name, ctx)
        if isinstance(node, VarBlock):
            inner = ctx.copy(variables=dict(ctx.variables))
            for name, value in node.names:
                try:
                    inner.variables[name.lower()] = self.scalar(value, inner)
                except DaxError:
                    inner.variables[name.lower()] = self.table_value(value, inner)
            return self.scalar(node.body, inner)
        if isinstance(node, Bin):
            return self.binary(node, ctx)
        if isinstance(node, ListLit):
            raise DaxError("A list like {1, 2} can only be used after IN.")
        if isinstance(node, Call):
            return self.call(node, ctx)
        raise DaxError("This part of the formula is not supported.")

    def measure(self, name: str, ctx: Ctx) -> str:
        found = self.measures.get(name.lower())
        if not found:
            if any(name.lower() == column.lower() for columns in self.columns.values() for column in columns):
                return self.scalar(Col(None, name), ctx)
            raise DaxError(f"There is no measure or column called [{name}].")
        real, text = found
        if real.lower() in ctx.stack:
            raise DaxError(f"The measure [{real}] refers to itself.")
        if real.lower() not in self.parsed:
            try:
                self.parsed[real.lower()] = parse(text)
            except DaxError as exc:
                raise DaxError(f"In measure [{real}]: {exc}") from exc
        # A measure always evaluates in filter context: a row context becomes filters first.
        inner = self.transition(ctx).copy(variables={}, stack=(*ctx.stack, real.lower()))
        return self.scalar(self.parsed[real.lower()], inner)

    def binary(self, node: Bin, ctx: Ctx) -> str:
        if node.op == "IN":
            if not isinstance(node.right, ListLit):
                raise DaxError("IN needs a list, e.g. Sales[Region] IN {\"East\", \"West\"}.")
            return f"({self.scalar(node.left, ctx)} IN ({', '.join(self.scalar(item, ctx) for item in node.right.items)}))"
        left, right = self.scalar(node.left, ctx), self.scalar(node.right, ctx)
        if node.op == "/":
            return f"(({left}) * 1.0 / NULLIF({right}, 0))"
        if node.op == "^":
            return f"POWER({left}, {right})"
        if node.op == "&":
            return f"(COALESCE(CAST({left} AS TEXT), '') || COALESCE(CAST({right} AS TEXT), ''))"
        if node.op == "&&":
            return f"({left} AND {right})"
        if node.op == "||":
            return f"({left} OR {right})"
        return f"({left} {node.op} {right})"

    def call(self, node: Call, ctx: Ctx) -> str:
        name, args = node.name, node.args

        def need(low: int, high: int | None = None, example: str = "") -> None:
            if len(args) < low or (high is not None and len(args) > high):
                raise DaxError(f"{name} takes {low if high == low else f'{low} to {high}' if high else f'at least {low}'} argument(s).{(' e.g. ' + example) if example else ''}")

        if name in _UNSUPPORTED:
            raise DaxError(f"{name} is not supported yet (relationships and time intelligence come later).")
        if name in ("TRUE", "FALSE"):
            return "1" if name == "TRUE" else "0"
        if name == "BLANK":
            return "NULL"
        if name in _AGGREGATES:
            if name in ("MIN", "MAX") and len(args) == 2:
                return f"{name}({self.scalar(args[0], ctx)}, {self.scalar(args[1], ctx)})"
            need(1, 1, f"{name}(Sales[Amount])")
            return self.aggregate(_AGGREGATES[name], args[0], ctx, name)
        if name == "MEDIAN":
            need(1, 1, "MEDIAN(Sales[Amount])")
            table, column = self.column_arg(args[0], name)
            alias, inner = self.alias(), self.alias()
            filtered = f"SELECT {inner}.{_q(column)} AS v FROM {_q(table)} {inner}{self.where(table, self.transition(ctx), inner)}"
            ordered = f"SELECT v FROM ({filtered}) WHERE v IS NOT NULL ORDER BY v"
            return (f"(SELECT AVG(v) FROM (SELECT v FROM ({ordered}) {alias} LIMIT 2 - (SELECT COUNT(*) FROM ({ordered})) % 2 "
                    f"OFFSET ((SELECT COUNT(*) FROM ({ordered})) - 1) / 2))")
        if name == "DISTINCTCOUNT":
            need(1, 1, "DISTINCTCOUNT(Sales[Customer])")
            return self.aggregate("COUNT_DISTINCT", args[0], ctx, name)
        if name == "COUNTBLANK":
            need(1, 1, "COUNTBLANK(Sales[Region])")
            return self.aggregate("COUNT_BLANK", args[0], ctx, name)
        if name == "COUNTROWS":
            need(1, 1, "COUNTROWS(Sales)")
            value = self.table_value(args[0], self.transition(ctx))
            return self.scan(value, "COUNT(*)", self.alias())
        if name in _ITERATORS:
            need(2, 2, f"{name}(Sales, Sales[Price] * Sales[Qty])")
            value = self.table_value(args[0], self.transition(ctx))
            alias = self.alias()
            if value.distinct:
                raise DaxError(f"{name} over VALUES(...) is not supported yet; iterate the table instead.")
            row = self.scalar(args[1], value.ctx.copy(rows={**ctx.rows, value.table: alias}, variables=ctx.variables, stack=ctx.stack))
            return self.scan(value, f"{_ITERATORS[name]}({row})", alias)
        if name == "CALCULATE":
            need(1, None, "CALCULATE([Total Sales], Sales[Region] = \"East\")")
            return self.scalar(args[0], self.calculate(args[1:], ctx))
        if name in ("SELECTEDVALUE", "HASONEVALUE", "ISFILTERED"):
            need(1, 2 if name == "SELECTEDVALUE" else 1)
            table, column = self.column_arg(args[0], name)
            if name == "ISFILTERED":
                return "1" if any(key == (table, column) for key in ctx.filters) else "0"
            alias = self.alias()
            value = TableValue(table, self.transition(ctx))
            if name == "HASONEVALUE":
                return self.scan(value, f"COUNT(DISTINCT {alias}.{_q(column)}) = 1", alias)
            fallback = self.scalar(args[1], ctx) if len(args) == 2 else "NULL"
            return self.scan(value, f"CASE WHEN COUNT(DISTINCT {alias}.{_q(column)}) = 1 THEN MIN({alias}.{_q(column)}) ELSE {fallback} END", alias)
        if name == "DIVIDE":
            need(2, 3, "DIVIDE([Profit], [Revenue])")
            top, bottom = self.scalar(args[0], ctx), self.scalar(args[1], ctx)
            fallback = self.scalar(args[2], ctx) if len(args) == 3 else "NULL"
            return f"(CASE WHEN ({bottom}) IS NULL OR ({bottom}) = 0 THEN {fallback} ELSE ({top}) * 1.0 / ({bottom}) END)"
        if name == "IF":
            need(2, 3, "IF([Sales] > 1000, \"High\", \"Low\")")
            otherwise = self.scalar(args[2], ctx) if len(args) == 3 else "NULL"
            return f"(CASE WHEN {self.scalar(args[0], ctx)} THEN {self.scalar(args[1], ctx)} ELSE {otherwise} END)"
        if name == "SWITCH":
            need(3, None, "SWITCH(TRUE(), [Sales] > 100, \"High\", \"Low\")")
            pairs, rest = args[1:], None
            if len(pairs) % 2:
                pairs, rest = pairs[:-1], pairs[-1]
            whens = " ".join(f"WHEN {self.scalar(pairs[i], ctx)} THEN {self.scalar(pairs[i + 1], ctx)}" for i in range(0, len(pairs), 2))
            otherwise = f" ELSE {self.scalar(rest, ctx)}" if rest is not None else ""
            subject = args[0]
            if isinstance(subject, Call) and subject.name == "TRUE" or isinstance(subject, Name) and subject.name.lower() == "true":
                return f"(CASE {whens}{otherwise} END)"
            return f"(CASE {self.scalar(subject, ctx)} {whens}{otherwise} END)"
        if name in ("AND", "OR"):
            need(2, 2)
            return f"({self.scalar(args[0], ctx)} {name} {self.scalar(args[1], ctx)})"
        if name == "NOT":
            need(1, 1)
            return f"(NOT {self.scalar(args[0], ctx)})"
        if name == "ISBLANK":
            need(1, 1)
            return f"({self.scalar(args[0], ctx)} IS NULL)"
        if name == "COALESCE":
            need(2)
            return f"COALESCE({', '.join(self.scalar(arg, ctx) for arg in args)})"
        simple = {"ABS": (1, 1, "ABS({0})"), "SQRT": (1, 1, "SQRT({0})"), "POWER": (2, 2, "POWER({0}, {1})"), "MOD": (2, 2, "MOD({0}, {1})"),
                  "INT": (1, 1, "FLOOR({0})"), "LEN": (1, 1, "LENGTH({0})"), "UPPER": (1, 1, "UPPER({0})"), "LOWER": (1, 1, "LOWER({0})"),
                  "TRIM": (1, 1, "TRIM({0})"), "CONCATENATE": (2, 2, "(COALESCE(CAST({0} AS TEXT), '') || COALESCE(CAST({1} AS TEXT), ''))"),
                  "LEFT": (2, 2, "SUBSTR({0}, 1, {1})"), "RIGHT": (2, 2, "SUBSTR({0}, -({1}))"),
                  "YEAR": (1, 1, "CAST(STRFTIME('%Y', {0}) AS INTEGER)"), "MONTH": (1, 1, "CAST(STRFTIME('%m', {0}) AS INTEGER)"),
                  "DAY": (1, 1, "CAST(STRFTIME('%d', {0}) AS INTEGER)")}
        if name in simple:
            low, high, template = simple[name]
            need(low, high)
            return template.format(*(self.scalar(arg, ctx) for arg in args))
        if name in ("ROUND", "ROUNDUP", "ROUNDDOWN"):
            need(1, 2)
            value = self.scalar(args[0], ctx)
            digits = self.scalar(args[1], ctx) if len(args) == 2 else "0"
            if name == "ROUND":
                return f"ROUND({value}, {digits})"
            fn = "CEIL" if name == "ROUNDUP" else "FLOOR"
            return f"(SIGN({value}) * {fn}(ABS({value}) * POWER(10, {digits})) / POWER(10, {digits}))"
        if name in ("FILTER", "ALL", "VALUES", "DISTINCT", "ALLEXCEPT", "REMOVEFILTERS", "ALLSELECTED"):
            raise DaxError(f"{name} returns a table; wrap it, e.g. COUNTROWS({name}(...)) or use it inside CALCULATE.")
        raise DaxError(f"{name} is not a DAX function supported here. Supported: {', '.join(SUPPORTED)}.")

    def column_arg(self, node: Any, name: str) -> tuple[str, str]:
        if not isinstance(node, Col):
            raise DaxError(f"{name} needs a column, e.g. {name}(Sales[Amount]).")
        return self.column(node)

    def aggregate(self, fn: str, node: Any, ctx: Ctx, name: str) -> str:
        table, column = self.column_arg(node, name)
        alias = self.alias()
        target = f"{alias}.{_q(column)}"
        select = {"COUNT_DISTINCT": f"COUNT(DISTINCT {target})", "COUNT_BLANK": f"SUM(CASE WHEN {target} IS NULL OR {target} = '' THEN 1 ELSE 0 END)"}.get(fn, f"{fn}({target})")
        return self.scan(TableValue(table, self.transition(ctx)), select, alias)

    def calculate(self, filters: list[Any], ctx: Ctx) -> Ctx:
        """CALCULATE's filter arguments, applied like Power BI: a filter on a column replaces the filter already on it."""
        fresh = self.transition(ctx).copy()
        for item in filters:
            if isinstance(item, Call) and item.name in ("ALL", "REMOVEFILTERS", "ALLSELECTED", "ALLEXCEPT"):
                fresh = self.remove(item, fresh)
                continue
            if isinstance(item, Call) and item.name == "KEEPFILTERS":
                if len(item.args) != 1:
                    raise DaxError("KEEPFILTERS takes one condition.")
                table = self.single_table(item.args[0])
                fresh.filters[(table, f"#{next(self.counter)}")] = self.row_filter(item.args[0], table, ctx.copy(rows={}))
                continue
            if isinstance(item, Call) and item.name in ("FILTER", "VALUES", "DISTINCT") or isinstance(item, Name):
                value = self.table_value(item, fresh)
                if value.distinct and value.post:
                    # FILTER(VALUES(T[c]), ...): keep only the values that passed, as a filter on that column.
                    alias = self.alias()
                    kept = self.scan(value, f"{alias}.{_q(value.distinct)}", alias)
                    fresh = value.ctx.copy()
                    fresh.filters[(value.table, value.distinct)] = Filter(value.table, f"{_TOKEN}.{_q(value.distinct)} IN {kept}", "calc")
                else:
                    fresh = value.ctx.copy()
                continue
            table = self.single_table(item)
            columns = self.columns_in(item)
            for column in columns:
                fresh.filters.pop((table, column), None)
            key = (table, columns[0]) if len(columns) == 1 else (table, f"#{next(self.counter)}")
            fresh.filters[key] = self.row_filter(item, table, ctx.copy(rows={}))
        return fresh

    def columns_in(self, node: Any) -> list[str]:
        found: list[str] = []

        def walk(part: Any) -> None:
            if isinstance(part, Col):
                column = self.column(part)[1]
                if column not in found:
                    found.append(column)
            elif isinstance(part, (Bin,)):
                walk(part.left)
                walk(part.right)
            elif isinstance(part, Neg):
                walk(part.value)
            elif isinstance(part, ListLit):
                for entry in part.items:
                    walk(entry)
            elif isinstance(part, Call) and part.name not in _AGGREGATES and part.name not in _ITERATORS and part.name != "CALCULATE":
                for entry in part.args:
                    walk(entry)

        walk(node)
        return found

    def single_table(self, node: Any) -> str:
        tables: set[str] = set()

        def walk(part: Any) -> None:
            if isinstance(part, Col):
                tables.add(self.column(part)[0])
            elif isinstance(part, Bin):
                walk(part.left)
                walk(part.right)
            elif isinstance(part, Neg):
                walk(part.value)
            elif isinstance(part, Call) and part.name not in _AGGREGATES and part.name not in _ITERATORS:
                for entry in part.args:
                    walk(entry)

        walk(node)
        if len(tables) != 1:
            raise DaxError("A CALCULATE filter must use the columns of one table, e.g. Sales[Region] = \"East\".")
        return tables.pop()


@dataclass
class DaxQuery:
    sql: str
    group: str | None


def compile_query(
    expression: str,
    datasets: list[dict[str, Any]],
    measures: dict[str, str] | None = None,
    group_by: tuple[str, str] | None = None,
    filters: dict[str, list[str]] | None = None,
    order: str = "value",
) -> DaxQuery:
    """The SELECT that evaluates `expression` (optionally once per value of `group_by` = (dataset_id, column))."""
    if not datasets:
        raise DaxError("Add a dataset first; DAX measures read its tables.")
    measures = measures or {}
    if len(measures) > MAX_MEASURES:
        raise DaxError(f"A dashboard can have at most {MAX_MEASURES} measures.")
    translator = Translator(datasets, measures)
    names = table_names(datasets)
    base = Ctx()
    for column, values in (filters or {}).items():
        if not values:
            continue
        for table, columns in translator.columns.items():
            real = next((name for name in columns if name.lower() == column.lower()), None)
            if real:
                listed = ", ".join(_lit(str(value)) for value in values[:200])
                base.filters[(table, real)] = Filter(table, f"CAST({_TOKEN}.{_q(real)} AS TEXT) IN ({listed}) OR {_TOKEN}.{_q(real)} IN ({listed})", "slicer")
    tree = parse(expression)
    if group_by is None:
        return DaxQuery(f"SELECT {translator.scalar(tree, base)} AS value", None)
    dataset_id, column_name = group_by
    table = names.get(str(dataset_id))
    if not table:
        raise DaxError("The tile's dataset is not part of this dashboard.")
    column = next((name for name in translator.columns[table] if name.lower() == column_name.lower()), None)
    if not column:
        raise DaxError(f"Table '{table}' has no column [{column_name}] to group by.")
    grouped = base.copy()
    grouped.filters[(table, column)] = Filter(table, f"{_TOKEN}.{_q(column)} IS g.{_q(column)}", "group")
    value = translator.scalar(tree, grouped)
    outer = translator.alias()
    groups = f"(SELECT DISTINCT {outer}.{_q(column)} AS {_q(column)} FROM {_q(table)} {outer}{translator.where(table, base, outer)}) g"
    ordering = f"g.{_q(column)}" if order == "name" else "value DESC"
    return DaxQuery(f"SELECT g.{_q(column)} AS {_q(column)}, {value} AS value FROM {groups} ORDER BY {ordering} LIMIT {MAX_GROUPS}", column)


def run_dax(
    expression: str,
    datasets: list[dict[str, Any]],
    measures: dict[str, str] | None = None,
    group_by: tuple[str, str] | None = None,
    filters: dict[str, list[str]] | None = None,
    order: str = "value",
) -> dict[str, Any]:
    query = compile_query(expression, datasets, measures, group_by, filters, order)
    try:
        result = run_sql(query.sql, datasets, limit=MAX_GROUPS, max_sql=400_000)
    except SqlError as exc:
        message = str(exc)
        if "no such function" in message.lower():
            message = f"This formula needs a math function the server does not have ({message})."
        raise DaxError(message) from exc
    return {**result, "sql": query.sql}
