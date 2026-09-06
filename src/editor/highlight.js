import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const c = (name, fallback) => `var(--astro-code-${name}, var(--sbx-code-${fallback}))`;

const COMMENT = c('token-comment', 'comment');
const KEYWORD = c('token-keyword', 'keyword');
const STRING = c('token-string', 'string');
const EXPRESSION = c('token-string-expression', 'expression');
const CONSTANT = c('token-constant', 'constant');
const FUNCTION = c('token-function', 'function');
const PUNCTUATION = c('token-punctuation', 'punctuation');
const LINK = c('token-link', 'link');
const FOREGROUND = c('foreground', 'foreground');

export const codeHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: COMMENT, fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.self], color: KEYWORD },
  { tag: [t.string, t.special(t.string), t.docString, t.attributeValue], color: STRING },
  { tag: [t.regexp, t.special(t.brace)], color: EXPRESSION },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], color: CONSTANT },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: FUNCTION },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: FUNCTION },
  { tag: [t.className, t.typeName, t.namespace, t.tagName], color: FUNCTION },
  { tag: [t.attributeName], color: CONSTANT },
  { tag: [t.propertyName, t.variableName, t.labelName], color: FOREGROUND },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.paren, t.brace, t.squareBracket, t.angleBracket, t.derefOperator], color: PUNCTUATION },
  { tag: [t.meta, t.processingInstruction], color: COMMENT },
  { tag: [t.link, t.url], color: LINK, textDecoration: 'underline' },
  { tag: t.heading, color: KEYWORD, fontWeight: 'bold' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.invalid, color: FOREGROUND },
]);
