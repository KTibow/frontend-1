import type { TemplateResult } from "lit";
import { polyfillLocaleData } from "../../resources/locale-data-polyfill";
import { Resources, TranslationDict } from "../../types";
import { formatPart, parse } from "./localize-format";

// Exclude some patterns from key type checking for now
// These are intended to be removed as errors are fixed
// Fixing component category will require tighter definition of types from backend and/or web socket
export type LocalizeKeys =
  | FlattenObjectKeys<Omit<TranslationDict, "supervisor">>
  | `panel.${string}`
  | `ui.card.alarm_control_panel.${string}`
  | `ui.card.weather.attributes.${string}`
  | `ui.card.weather.cardinal_direction.${string}`
  | `ui.card.lawn_mower.actions.${string}`
  | `ui.components.calendar.event.rrule.${string}`
  | `ui.components.logbook.${string}`
  | `ui.components.selectors.file.${string}`
  | `ui.dialogs.entity_registry.editor.${string}`
  | `ui.dialogs.more_info_control.lawn_mower.${string}`
  | `ui.dialogs.more_info_control.vacuum.${string}`
  | `ui.dialogs.quick-bar.commands.${string}`
  | `ui.dialogs.unhealthy.reason.${string}`
  | `ui.dialogs.unsupported.reason.${string}`
  | `ui.panel.config.${string}.${"caption" | "description"}`
  | `ui.panel.config.dashboard.${string}`
  | `ui.panel.config.zha.${string}`
  | `ui.panel.config.zwave_js.${string}`
  | `ui.panel.lovelace.card.${string}`
  | `ui.panel.lovelace.editor.${string}`
  | `ui.panel.page-authorize.form.${string}`
  | `component.${string}`;

// Tweaked from https://www.raygesualdo.com/posts/flattening-object-keys-with-typescript-types
export type FlattenObjectKeys<
  T extends Record<string, any>,
  Key extends keyof T = keyof T,
> = Key extends string
  ? T[Key] extends Record<string, unknown>
    ? `${Key}.${FlattenObjectKeys<T[Key]>}`
    : `${Key}`
  : never;

type HtmlTemplate = TemplateResult<1>;
export interface LocalizeFunc<Key extends string = LocalizeKeys> {
  (key: Key, values?: Record<string, string | number>): string;
  (
    key: Key,
    values: Record<string, string | number | HtmlTemplate>,
    listFormat: true
  ): (string | number | HtmlTemplate)[] | string;
}

interface FormatType {
  [format: string]: any;
}
export interface FormatsType {
  number: FormatType;
  date: FormatType;
  time: FormatType;
}

const astCache: Record<string, ReturnType<typeof parse>> = {};
const sanityCheck = (str: string, values: object, listFormat: boolean) => {
  /* eslint-disable no-console */
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "object" && !listFormat)
      console.warn(
        "[FIXME]",
        v,
        "was passed to",
        str,
        "but will turn into [Object object]"
      );
    if (typeof v === "undefined")
      console.warn("[FIXME]", k, "was passed to", str, "as undefined");
  }
};

export const computeLocalize = async <Keys extends string = LocalizeKeys>(
  language: string,
  resources: Resources
): Promise<LocalizeFunc<Keys>> => {
  await import("../../resources/intl-polyfill").then(() =>
    polyfillLocaleData(language)
  );

  return ((key, values = {}, listFormat = false): string | any[] => {
    if (!key || !resources || !language || !resources[language]) {
      return "";
    }

    // Cache the key/value pairs for the same language, so that we don't
    // do extra work if we're just reusing strings across an application.
    const translatedValue = resources[language][key];
    sanityCheck(translatedValue, values, listFormat);

    if (!translatedValue) {
      return "";
    }
    if (!translatedValue.includes("{")) {
      return translatedValue;
    }

    try {
      let ast = astCache[translatedValue];
      if (!ast) {
        ast = parse(translatedValue);
        astCache[translatedValue] = ast;
      }
      const result = formatPart(ast, values, language, listFormat);
      return listFormat && result.length > 1 ? result : result.join("");
    } catch (err: any) {
      return "Translation " + err;
    }
  }) as LocalizeFunc<Keys>;
};
