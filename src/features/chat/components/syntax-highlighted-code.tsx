"use client";

import { useMemo } from "react";

type TokenKind = "plain" | "comment" | "string" | "number" | "keyword" | "function" | "type" | "property" | "operator";
type Token = { text: string; kind: TokenKind };

const colors: Record<TokenKind, string | undefined> = {
  plain: undefined,
  comment: "#6a9955",
  string: "#ce9178",
  number: "#b5cea8",
  keyword: "#c586c0",
  function: "#dcdcaa",
  type: "#4ec9b0",
  property: "#9cdcfe",
  operator: "#d4d4d4",
};

const languageAliases: Record<string, string> = {
  py: "python", js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  sh: "shell", bash: "shell", yml: "yaml", html: "markup", xml: "markup",
};

const keywordSets: Record<string, Set<string>> = {
  python: new Set("and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case".split(" ")),
  javascript: new Set("as async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield".split(" ")),
  typescript: new Set("abstract any as asserts async await boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of private protected public readonly require return set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield".split(" ")),
  sql: new Set("add all alter and any as asc begin between by case check column commit constraint create database default delete desc distinct drop else end exists foreign from full grant group having in index inner insert into is join key left like limit not null on or order outer primary references right rollback row select set table then union unique update values view when where with".toUpperCase().split(" ")),
  shell: new Set("case do done elif else esac export fi for function if in local readonly return set shift then time trap unset until while".split(" ")),
  css: new Set("important inherit initial none auto block flex grid inline relative absolute fixed sticky".split(" ")),
};

const typeWords = new Set("str int float bool list dict tuple set bytes object Array Promise Record Map Set Date DataFrame string number boolean void unknown never any".split(" "));

function normalizeLanguage(language: string) {
  const normalized = language.toLowerCase().replace(/^language-/, "");
  return languageAliases[normalized] ?? normalized;
}

function tokenize(code: string, requestedLanguage: string): Token[] {
  const language = normalizeLanguage(requestedLanguage);
  const keywords = keywordSets[language] ?? new Set<string>();
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < code.length) {
    const source = code.slice(offset);
    const whitespace = source.match(/^\s+/);
    if (whitespace) { tokens.push({ text: whitespace[0], kind: "plain" }); offset += whitespace[0].length; continue; }
    const commentPattern = language === "python" || language === "shell" || language === "yaml" ? /^#[^\n]*/ : language === "sql" ? /^--[^\n]*/ : /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/;
    const comment = source.match(commentPattern);
    if (comment) { tokens.push({ text: comment[0], kind: "comment" }); offset += comment[0].length; continue; }
    const string = source.match(/^(?:'''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$)|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/);
    if (string) {
      const property = language === "json" && /^\s*:/.test(source.slice(string[0].length));
      tokens.push({ text: string[0], kind: property ? "property" : "string" }); offset += string[0].length; continue;
    }
    const number = source.match(/^(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
    if (number) { tokens.push({ text: number[0], kind: "number" }); offset += number[0].length; continue; }
    const decorator = source.match(/^@[A-Za-z_$][\w$]*/);
    if (decorator) { tokens.push({ text: decorator[0], kind: "function" }); offset += decorator[0].length; continue; }
    const word = source.match(/^[A-Za-z_$][\w$]*/);
    if (word) {
      const value = word[0];
      const comparable = language === "sql" ? value.toUpperCase() : value;
      const kind: TokenKind = keywords.has(comparable) ? "keyword" : typeWords.has(value) ? "type" : /^\s*\(/.test(source.slice(value.length)) ? "function" : "plain";
      tokens.push({ text: value, kind }); offset += value.length; continue;
    }
    const operator = source.match(/^(?:===|!==|==|!=|<=|>=|=>|\*\*|\/\/|&&|\|\||:=|[-+*/%=<>!&|^~?:.,;()[\]{}])/);
    if (operator) { tokens.push({ text: operator[0], kind: "operator" }); offset += operator[0].length; continue; }
    tokens.push({ text: source[0], kind: "plain" }); offset += 1;
  }
  return tokens;
}

export function SyntaxHighlightedCode({ code, language }: { code: string; language: string }) {
  const tokens = useMemo(() => tokenize(code, language), [code, language]);
  return <code className="font-mono text-[#d4d4d4]">{tokens.map((token, index) => <span key={`${index}-${token.kind}`} style={colors[token.kind] ? { color: colors[token.kind] } : undefined}>{token.text}</span>)}</code>;
}
