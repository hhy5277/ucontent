import {escape} from 'html-escaper';
import hyphenizer from 'hyphenizer';
import instrument from 'uparser';

import {minCSS, minJS, minHTML, minRaw} from './ucontent.js';

const {keys} = Object;

const prefix = 'isµ' + Date.now();
const interpolation = new RegExp(
  `(<!--${prefix}(\\d+)-->|\\s*${prefix}(\\d+)=('|")([^\\4]+?)\\4)`, 'g'
);

const attribute = (name, quote, value) =>
                    ` ${name}=${quote}${escape(value)}${quote}`;

const getValue = value => {
  switch (typeof value) {
    case 'string':
      value = escape(value);
    case 'number':
    case 'boolean':
      return value;
    case 'object':
      if (value instanceof Buffer) {
        switch (value.min) {
          case minHTML:
          case minRaw:
            return value;
          case minCSS:
          case minJS:
            return value.min();
        }
        return escape(value.toString());
      }
      if (value instanceof Array)
        return value.map(getValue).join('');
  }
  return value == null ? '' : escape(String(value));
};

export const parse = (cache, template, expectedLength) => {
  const html = instrument(template, prefix).trim();
  const updates = [];
  let i = 0;
  let match = null;
  while (match = interpolation.exec(html)) {
    const pre = html.slice(i, match.index);
    i = match.index + match[0].length;
    if (match[2])
      updates.push(value => (pre + getValue(value)));
    else {
      const name = match[5];
      const quote = match[4];
      switch (true) {
        case name === 'data':
          updates.push(value => (pre + keys(value).map(data, value).join('')));
          break;
        case name === 'aria':
          updates.push(value => (pre + keys(value).map(aria, value).join('')));
          break;
        // setters as boolean attributes (.disabled .contentEditable)
        case name[0] === '.':
          const lower = name.slice(1).toLowerCase();
          updates.push(value => {
            let result = pre;
            // null, undefined, and false are not shown at all
            if (value != null && value !== false) {
              // true means boolean attribute, just show the name
              if (value === true)
                result += ` ${lower}`;
              // in all other cases, just escape it in quotes
              else
                result += attribute(lower, quote, value);
            }
            return result;
          });
          break;
        case name.slice(0, 2) === 'on':
          updates.push(value => {
            let result = pre;
            // allow listeners only if passed as string
            if (typeof value === 'string')
              result += attribute(name, quote, value);
            return result;
          });
          break;
        default:
          updates.push(value => {
            let result = pre;
            if (value != null)
              result += attribute(name, quote, value);
            return result;
          });
          break;
      }
    }
  }
  const {length} = updates;
  if (length !== expectedLength)
    throw new Error(`invalid template ${template}`);
  if (length) {
    const last = updates[length - 1];
    const chunk = html.slice(i);
    updates[length - 1] = value => (last(value) + chunk);
  }
  else
    updates.push(() => html);
  cache.set(template, updates);
  return updates;
};

// declarations
function aria(key) {
  const value = escape(this[key]);
  return key === 'role' ?
          ` role="${value}"` :
          ` aria-${hyphenizer(key)}="${value}"`;
}

function data(key) {
  return ` data-${hyphenizer(key)}="${escape(this[key])}"`;
}
