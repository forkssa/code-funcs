import { CodeStyle, getFromCodeStyle, StyleOption } from './style';
import wcwidth from 'wcwidth';
import { modeInfo, Mode } from './modes';
import { StreamParser, StringStream } from '@codemirror/language';
import { Declaration, parse as parseCSS, Rule } from 'css';

const modeMap = new Map<string, Mode>();
const collisions = new Set<string>();
for (const mode of modeInfo) {
  const keys = new Set<string>();
  for (const key of mode.alias ?? []) {
    keys.add(key);
  }
  if (keys.size === 0) {
    for (const key of mode.ext ?? []) {
      keys.add(key);
    }
  }
  for (const key of keys) {
    if (modeMap.has(key)) {
      collisions.add(key);
      modeMap.delete(key);
    } else if (!collisions.has(key)) {
      modeMap.set(key, mode);
    }
  }
}

const parsers = new Map<Mode, StreamParser<unknown>>();

async function loadParser(mode: Mode) {
  let parser = parsers.get(mode);
  if (parser == null) {
    const module = await import(`@codemirror/legacy-modes/mode/${mode.module}`);
    parser = module[mode.export] as StreamParser<unknown>;
    parsers.set(mode, parser);
  }
  return parser;
}

const themes: Map<string, Map<string, string>> = new Map();

interface ReadyOptions {
  langs?: string[];
  themes?: string[];
}

export async function ready(options?: ReadyOptions) {
  for (const lang of options?.langs ?? []) {
    const mode = modeMap.get(lang);
    if (mode == null) {
      throw new Error(`language ${lang} not found`);
    }
    await loadParser(mode);
  }
  themes.set('default', await getColorMap());
  for (const theme of options?.themes ?? []) {
    themes.set(theme, await getColorMap(theme));
  }
}

export interface CodeTree {
  language: string;
  spans: string[];
  nodes: Code[];
}

export type Code = CodeTree | string;

export type TaggedFunction = (
  code: TemplateStringsArray,
  ...rest: Code[]
) => CodeTree;
export type LanguageDictionary = Record<string, TaggedFunction>;
const handler = {
  get(_: LanguageDictionary, language: string): TaggedFunction {
    return (code: TemplateStringsArray, ...rest: Code[]): CodeTree => {
      return {
        language,
        spans: Array.from(code),
        nodes: rest,
      };
    };
  },
};

export const language = new Proxy<LanguageDictionary>({}, handler);

export type Location = [number, number];

export interface Token {
  code: string;
  color: string;
}

export interface MorphToken extends Token {
  morph: 'create' | 'delete' | 'retain';
  from: Location | null;
  to: Location | null;
}

export interface ParseOptions {
  codeStyle?: CodeStyle;
  theme?: string;
}

function colorOfRule(rule: Rule): string | undefined {
  for (const item2 of rule.declarations ?? []) {
    if (item2.type === 'declaration') {
      const declaration = item2 as Declaration;
      if (declaration.property === 'color') {
        return declaration.value;
      }
    }
  }
  return undefined;
}

function* getTargetsOfRule(rule: Rule, theme = 'default') {
  for (const selector of rule.selectors ?? []) {
    const parts = selector.split(' ');
    if (parts.length === 1) {
      const [part] = parts;
      const classes: string[] = [];
      for (const match of part.matchAll(/\.([\w-]+)/g)) {
        const [, target] = match;
        classes.push(target);
      }
      if (classes.includes('CodeMirror')) {
        const classTheme =
          classes.find((c) => /cm-s-[\w-]+/.test(c)) ?? 'default';
        if (classTheme === 'default' || classTheme === `cm-s-${theme}`) {
          yield 'fallback';
        }
      }
    }
    if (parts.length > 0 && parts[0] === `.cm-s-${theme}`) {
      if (parts.length !== 2) {
        throw new Error(`found css rule with more than two parts`);
      }
      const matched = parts[1].match(/\.cm-([\w-]+)\b/);
      if (matched == null) {
        continue;
      }
      const [, target] = matched;
      yield target;
    }
  }
}

async function getTheme(theme?: string) {
  if (theme == null) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return (await import(`./themes/codemirror.css?raw`)).default;
  } else {
    return (await import(`./themes/${theme}.css?raw`)).default;
  }
}

async function getColorMap(theme?: string) {
  const css = parseCSS(await getTheme(theme));
  const map = new Map<string, string>();
  for (const item of css?.stylesheet?.rules ?? []) {
    if (item.type === 'rule') {
      const rule = item as Rule;
      const color = colorOfRule(rule);
      if (color != null) {
        for (const target of getTargetsOfRule(rule, theme)) {
          map.set(target, color);
        }
      }
    }
  }
  return map;
}

function getColor(style: StyleOption | undefined, options?: ParseOptions) {
  if (style == null) {
    style = 'fallback';
  }
  const override = getFromCodeStyle(options?.codeStyle, style);
  if (override != null) {
    return override.text;
  }
  const theme = options?.theme ?? 'default';
  const themeRules = themes.get(theme);
  if (themeRules == null) {
    throw new Error(
      `you must first call \`await ready({ themes: [${theme}] })\``,
    );
  }
  const fallbackOverride = options?.codeStyle?.['fallback']?.text;
  return (
    themeRules.get(style) ??
    fallbackOverride ??
    themeRules.get('fallback') ??
    ''
  );
}

/**
 * `@codemirror/legacy-modes` renamed some CodeMirror 5 token style names to
 * CodeMirror 6 tag names (per mode). The rest of this library — the
 * `StyleOption` union and the vendored theme CSS files — speaks CodeMirror 5
 * class names, so the renames are translated back here. Each entry was
 * verified against the corresponding `codemirror@5` mode source.
 */
const styleAliases: Record<string, StyleOption> = {
  'string.special': 'string-2',
  'variableName.special': 'variable-2',
  'variableName.local': 'variable-2',
  'variableName.constant': 'variable-3',
};

/**
 * Runs a CodeMirror 5-style stream parser over the given text, mirroring the
 * behavior of CodeMirror 5's `addon/runmode/runmode` (which CodeMirror 6
 * no longer ships): the text is split into lines, the parser state is carried
 * across lines, `\n` is reported between lines with no style, and each token
 * is reported with its raw CodeMirror 5 style string.
 */
function runMode(
  raw: string,
  parser: StreamParser<unknown>,
  callback: (text: string, style?: StyleOption) => void,
) {
  const lines = raw.split(/\r?\n|\r/);
  const indentUnit = 2;
  const state = parser.startState ? parser.startState(indentUnit) : true;
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      callback('\n');
    }
    const stream = new StringStream(lines[i], 8, indentUnit);
    if (!stream.string && parser.blankLine) {
      parser.blankLine(state, indentUnit);
    }
    while (!stream.eol()) {
      const style = parser.token(stream, state);
      const normalized =
        typeof style === 'string' ? (styleAliases[style] ?? style) : null;
      callback(
        stream.current(),
        (normalized as StyleOption | null) ?? undefined,
      );
      stream.start = stream.pos;
    }
  }
}

export function parse(code: CodeTree, options?: ParseOptions): Token[] {
  const raw = integrate(reindent(code));
  const parsed: Token[] = [];
  const mode = modeMap.get(code.language);
  if (mode == null) {
    throw new Error(
      `you must call \`await ready({ langs: ['${code.language}'] })\``,
    );
  }
  const parser = parsers.get(mode);
  if (parser == null) {
    throw new Error(
      `you must call \`await ready({ langs: ['${code.language}'] })\``,
    );
  }
  runMode(raw, parser, (text: string, style?: StyleOption) => {
    parsed.push({ code: text, color: getColor(style, options) });
  });
  return parsed;
}

export function toString(tokens: Token[]): string {
  return tokens.map((token) => token.code).join('');
}

function reindent(code: string, indent?: number): string;
function reindent(code: CodeTree, indent?: number): CodeTree;
function reindent(code: Code, indent?: number): Code;
function reindent(code: Code, indent = 0): Code {
  if (typeof code === 'string') {
    if (code.at(0) !== '\n') {
      return ' '.repeat(indent) + code;
    }

    const regex = /^ +/gm;
    const matches = code.matchAll(regex);
    let min = Infinity;
    for (const match of matches) min = Math.min(min, match[0].length);
    const undent = new RegExp(`^ {${min}}`, 'gm');
    const result = code.substring(1).replace(undent, ' '.repeat(indent));
    return result;
  }

  if (code.spans.at(0)?.at(0) !== '\n') return code;

  const regex = /\n */g;
  const matches = code.spans.flatMap((span) => [...span.matchAll(regex)]);
  let min = Infinity;
  for (const [match] of matches) min = Math.min(min, match.length - 1);
  const undentRegex = new RegExp(`\n {${min}}`, 'g');
  const spans = code.spans.map((span) =>
    span.replace(undentRegex, '\n' + ' '.repeat(indent)),
  );
  spans[0] = spans[0].substring(1);

  let index = 0;
  const nodes = [];
  for (const node of code.nodes) {
    const before = spans[index];
    const preindentRegex = /\n *$/;
    const indentation = before.match(preindentRegex);
    if (indentation != null) {
      spans[index] = spans[index].replace(preindentRegex, '\n');
      nodes.push(reindent(node, indentation[0].length - 1));
    } else {
      nodes.push(node);
    }
    index++;
  }

  return {
    language: code.language,
    spans,
    nodes,
  };
}

function integrate(code: Code): string {
  if (typeof code === 'string') return code;

  return String.raw(
    { raw: code.spans },
    ...code.nodes.map((n) => integrate(n)),
  );
}

function isLevelEquivilant(one: Code | null, two: Code | null): boolean {
  if (one === null || two === null) return false;
  if (
    (typeof one === 'string' && typeof two !== 'string') ||
    (typeof one !== 'string' && typeof two === 'string')
  ) {
    return false;
  }
  if (typeof one === 'string' && typeof two === 'string') {
    return one === two;
  }
  if (typeof one !== 'string' && typeof two !== 'string') {
    if (one.spans.length !== two.spans.length) return false;

    return one.spans.every((span, i) => span === two.spans[i]);
  }
  throw new Error('Could not determine equivilance of nodes');
}

function chars(tokens: Token[]): Token[] {
  return tokens.flatMap(({ code, color }) => {
    return code.split('').map((c) => ({
      code: c,
      color,
    }));
  });
}

function tokens(chars: MorphToken[]): MorphToken[] {
  const result = [];
  let token = null;
  for (const char of chars) {
    if (token == null) {
      token = char;
    } else {
      if (char.code === '\n') {
        result.push(token);
        token = null;
      } else if (token.color === char.color && token.morph === char.morph) {
        token.code += char.code;
      } else {
        result.push(token);
        token = char;
      }
    }
  }
  if (token != null) result.push(token);
  return result;
}

export function diff(start: CodeTree, end: CodeTree, options?: ParseOptions) {
  start = reindent(start);
  end = reindent(end);
  const startParsed = chars(parse(start, options));
  const endParsed = chars(parse(end, options));
  let index = 0;
  let endex = 0;
  const result: {
    code: string;
    color: string;
    morph: 'retain' | 'delete' | 'create';
  }[] = [];
  function recurse(one: Code | null, two: Code | null) {
    const progress = (l: string, r?: string) => {
      if (r == null) r = l;
      const startIndex = index;
      while (index < startIndex + l.length && index < startParsed.length) {
        result.push({
          code: startParsed[index].code,
          color: startParsed[index].color,
          morph: l === r ? 'retain' : 'delete',
        });
        index++;
      }
      const endIndex = endex;
      while (
        endex < endIndex + r.length &&
        two !== '' &&
        endex < endParsed.length
      ) {
        if (r !== l) {
          result.push({
            code: endParsed[endex].code,
            color: endParsed[endex].color,
            morph: 'create',
          });
        }
        endex++;
      }
    };
    if (isLevelEquivilant(one, two)) {
      if (one == null || two == null) {
        throw new Error('equivilant nodes should not be null');
      }
      if (typeof one === 'string') {
        progress(one);
      } else {
        if (typeof two === 'string') throw new Error();
        for (let n = 0; n < one.nodes.length; n++) {
          progress(one.spans[n]);
          recurse(one.nodes[n], two.nodes[n]);
        }
        progress(one.spans.at(-1) ?? '');
      }
    } else {
      if (typeof one === 'string' && typeof two === 'string') {
        progress(one, two);
      } else if (typeof one === 'string') {
        progress(one, '');
      } else if (typeof two === 'string') {
        progress('', two);
      }
      if (one != null && typeof one !== 'string') {
        for (let n = 0; n < one.nodes.length; n++) {
          progress(one.spans[n], '');
          recurse(one.nodes[n], null);
        }
        progress(one.spans.at(-1) ?? '', '');
      }
      if (two != null && typeof two !== 'string') {
        for (let n = 0; n < two.nodes.length; n++) {
          progress('', two.spans[n]);
          recurse(null, two.nodes[n]);
        }
        progress('', two.spans.at(-1));
      }
    }
  }
  recurse(start, end);
  let [sat, sln, eat, eln] = [0, 0, 0, 0];
  const positioned = result.map(({ code, color, morph }) => {
    const value: MorphToken = {
      code,
      color,
      morph,
      from: morph === 'create' ? null : [sat, sln],
      to: morph === 'delete' ? null : [eat, eln],
    };
    if (code === '\n') {
      if (morph !== 'create') {
        sat = 0;
        sln++;
      }
      if (morph !== 'delete') {
        eat = 0;
        eln++;
      }
    } else {
      if (morph !== 'create') {
        sat += wcwidth(code);
      }
      if (morph !== 'delete') {
        eat += wcwidth(code);
      }
    }
    return value;
  });
  const tokenized = tokens(positioned);

  return tokenized.filter(({ code }) => {
    return code.length !== 0 && !/^ +$/.test(code);
  });
}
