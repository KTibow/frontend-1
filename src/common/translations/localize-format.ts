/*
Modified from MIT code by spurreiter
*/

const FORMATS = {
  number: {
    integer: {
      maximumFractionDigits: 0,
    },
    currency: {
      style: "currency",
    },
    percent: {
      style: "percent",
    },
  },
  date: {
    short: {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    },
    medium: {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
    long: {
      month: "long",
      day: "numeric",
      year: "numeric",
    },
    full: {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  },
  time: {
    short: {
      hour: "numeric",
      minute: "numeric",
      second: undefined,
    },
    medium: {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    },
    long: {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      timeZoneName: "short",
    },
    full: {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      timeZoneName: "short",
    },
  },
};

const isEven = (level: number) => level % 2 === 0;

const half = (level: number) => Math.floor(level / 2);

const block = ({
  part,
  level,
  prop: _prop,
  type: _type,
}: {
  part: string;
  level: number;
  prop?: string;
  type?: string;
}) => {
  if (isEven(level)) {
    return { str: part, level };
  }
  let [prop, type, opts] = part.split(",").map((s) => s.trim());
  if (!prop) {
    return {};
  }
  if (!type && _type) {
    opts = prop;
    // @ts-expect-error
    prop = _prop;
    type = _type;
  }
  return { prop, type, opts, level, parts: [] };
};

const splitKeyVals = (
  opts: string,
  shorthands: Record<string, any>,
  base = {}
) =>
  opts.split(/([a-zA-Z0-9]+(?:\/\S+|))\s/).reduce(
    (curr, keyVal) => {
      const [key, val] = keyVal.split("/");
      if (val === undefined) {
        Object.assign(curr, shorthands[key]);
      } else {
        curr[key] = val;
      }
      return curr;
    },
    { ...base }
  );

export function parse(message: string) {
  let part = "";
  let level = 0;
  let sub = 0;
  const cache = {};
  const parts: ReturnType<typeof block>[] = [];
  const refs = { 0: parts };

  for (let i = 0; i < message.length; i++) {
    const char = message[i];
    switch (char) {
      case "{": {
        const o = block({ ...cache[level], part, level });
        if (o.str || o.prop) refs[sub].push(o);
        cache[level] = o;
        level += 1;
        sub = half(level);
        if (o.parts) refs[sub] = o.parts;
        part = "";
        break;
      }
      case "}": {
        const o = block({ ...cache[level], part, level });
        if (o.str || o.prop) refs[sub].push(o);
        level -= 1;
        sub = half(level);
        part = "";
        break;
      }
      default: {
        part += char;
      }
    }
  }
  const o = block({ ...cache[level], part, level });
  if (o.str || o.prop) refs[sub].push(o);
  return parts;
}

export const formatPart = (
  ast: ReturnType<typeof parse>,
  values: Record<string, any>,
  lng: string,
  listFormat: boolean
) => {
  const strs: any[] = [];
  const pluralMatches = {};
  const selectMatches = {};
  const selectOrdinalMatches = {};

  for (let i = 0; i < ast.length; i++) {
    const { str, prop, type, opts = "", parts } = ast[i];
    if (str) {
      strs.push(str);
      continue;
    }
    if (!prop) {
      continue;
    }
    if (!type) {
      let repr = values[prop] ?? `{${prop}}`;
      if (!listFormat) repr = String(repr);
      strs.push(repr);
      continue;
    }

    switch (type) {
      case "number": {
        const value = Number(values[prop]);
        if (!opts) {
          strs.push(value);
          break;
        }
        const options = splitKeyVals(opts, FORMATS.number);
        const repr = new Intl.NumberFormat(lng, options).format(value);
        strs.push(repr);
        break;
      }
      case "plural": {
        if (pluralMatches[prop]) continue;
        if (!opts) {
          throw new TypeError(`type "${type}" needs a matcher`);
        }
        const value = Number(values[prop]);
        const rule = new Intl.PluralRules(lng).select(value);

        if (
          (opts[0] === "=" && value === Number(opts.slice(1))) ||
          (rule === opts && opts[0] !== "=") ||
          opts === "other"
        ) {
          const repr = formatPart(parts, values, lng, false)
            .join("")
            .replace("#", "" + value);
          strs.push(repr);
          pluralMatches[prop] = true;
        } else if (ast[i + 1]?.type !== type) {
          throw new TypeError(`type "${type}" needs an "other" match`);
        }
        break;
      }
      case "select": {
        if (selectMatches[prop]) continue;
        if (!opts) {
          throw new TypeError(`type "${type}" needs a matcher`);
        }
        const value = values[prop];
        if (value === opts || opts === "other") {
          const repr = formatPart(parts, values, lng, false);
          strs.push(repr);
          selectMatches[prop] = true;
        } else if (ast[i + 1]?.type !== type) {
          throw new TypeError(`type "${type}" needs an "other" match`);
        }
        break;
      }
      case "selectordinal": {
        if (selectOrdinalMatches[prop]) continue;
        if (!opts) {
          throw new TypeError(`type "${type}" needs a matcher`);
        }
        const value = Number(values[prop]);
        const rule = new Intl.PluralRules(lng, { type: "ordinal" }).select(
          value
        );
        if (
          (opts[0] === "=" && value === Number(opts.slice(1))) ||
          (opts[0] !== "=" && rule === opts) ||
          opts === "other"
        ) {
          const repr = formatPart(parts, values, lng, false)
            .join("")
            .replace("#", "" + value);
          strs.push(repr);
          selectOrdinalMatches[prop] = true;
        } else if (ast[i + 1]?.type !== type) {
          throw new TypeError(`type "${type}" needs an "other" match`);
        }
        break;
      }
      case "date": {
        const date = values[prop];
        const options = splitKeyVals(opts, FORMATS.date);
        const repr = new Intl.DateTimeFormat(lng, options).format(date);
        strs.push(repr);
        break;
      }
      case "time": {
        const date = values[prop];
        const options = splitKeyVals(opts, FORMATS.time, FORMATS.time.medium);
        const repr = new Intl.DateTimeFormat(lng, options).format(date);
        strs.push(repr);
        break;
      }
    }
  }
  return strs;
};
