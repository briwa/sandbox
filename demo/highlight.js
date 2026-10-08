import { tagHighlighter, tags as t, highlightTree } from '@lezer/highlight';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { vueLanguage } from '@codemirror/lang-vue';

const highlighter = tagHighlighter([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'sbx-tok-comment' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.self], class: 'sbx-tok-keyword' },
  { tag: [t.string, t.special(t.string), t.docString, t.attributeValue], class: 'sbx-tok-string' },
  { tag: [t.regexp, t.special(t.brace)], class: 'sbx-tok-expression' },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], class: 'sbx-tok-constant' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], class: 'sbx-tok-function' },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], class: 'sbx-tok-function' },
  { tag: [t.className, t.typeName, t.namespace, t.tagName], class: 'sbx-tok-function' },
  { tag: [t.attributeName], class: 'sbx-tok-constant' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.paren, t.brace, t.squareBracket, t.angleBracket, t.derefOperator], class: 'sbx-tok-punctuation' },
  { tag: [t.meta, t.processingInstruction], class: 'sbx-tok-comment' },
  { tag: [t.link, t.url], class: 'sbx-tok-link' },
]);

const LANGUAGES = {
  js: javascriptLanguage,
  javascript: javascriptLanguage,
  vue: vueLanguage,
};

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlightCode(code, lang = 'js') {
  const language = LANGUAGES[lang] ?? javascriptLanguage;
  const source = String(code ?? '');
  let out = '';
  let pos = 0;

  try {
    highlightTree(language.parser.parse(source), highlighter, (from, to, classes) => {
      if (from > pos) out += escape(source.slice(pos, from));
      out += `<span class="${classes}">${escape(source.slice(from, to))}</span>`;
      pos = to;
    });
  } catch {
    return `<pre class="sbx-code-block"><code>${escape(source)}</code></pre>`;
  }

  out += escape(source.slice(pos));
  return `<pre class="sbx-code-block"><code>${out}</code></pre>`;
}
