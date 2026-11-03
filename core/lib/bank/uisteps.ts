import type { PW } from "../browsers.ts";
import type { UiStep, UiTarget } from "./bank.ts";

/** The steps of a UI test (spec 13.3), run in a page: shared by the bank's UI runner and the page sweep's sign-in. */

export interface StepContext {
  /** Login variable names to their values (never printed, never saved). */
  secrets: Record<string, string>;
  stepMs: number;
}

export function describeTarget(t: UiTarget): string {
  if (t.role) return `${t.role}${t.name ? ` "${t.name}"` : ""}`;
  if (t.text) return `text "${t.text}"`;
  if (t.label) return `field "${t.label}"`;
  if (t.testid) return `test id "${t.testid}"`;
  return `selector ${t.selector}`;
}

export function describeStep(s: UiStep): string {
  switch (s.do) {
    case "goto":
      return `open ${s.path}`;
    case "click":
      return `click ${describeTarget(s.target)}`;
    case "fill":
      return `fill ${describeTarget(s.target)}${s.secret ? " (login)" : ""}`;
    case "select":
      return `choose "${s.option}" in ${describeTarget(s.target)}`;
    case "press":
      return `press ${s.key}`;
    case "expect_text":
      return `see the text "${s.text}"`;
    case "expect_no_text":
      return `not see the text "${s.text}"`;
    case "expect_visible":
      return `see ${describeTarget(s.target)}`;
    case "expect_url":
      return `be on an address containing "${s.contains}"`;
    case "expect_count":
      return `count ${s.count} of ${describeTarget(s.target)}`;
    case "wait":
      return `wait ${s.ms} ms`;
  }
}

export function locate(page: PW, t: UiTarget): PW {
  if (t.role) return page.getByRole(t.role, t.name ? { name: t.name } : undefined);
  if (t.text) return page.getByText(t.text);
  if (t.label) return page.getByLabel(t.label);
  if (t.testid) return page.getByTestId(t.testid);
  return page.locator(t.selector as string);
}

async function poll(check: () => Promise<boolean>, what: string, stepMs: number): Promise<void> {
  const end = Date.now() + stepMs;
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() > end) throw new Error(`${what} did not happen within ${Math.round(stepMs / 1000)} s`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

export async function runUiStep(page: PW, base: string, s: UiStep, ctx: StepContext): Promise<void> {
  const stepMs = ctx.stepMs;
  switch (s.do) {
    case "goto":
      await page.goto(new URL(s.path, base).toString(), { waitUntil: "domcontentloaded", timeout: stepMs });
      return;
    case "click":
      await locate(page, s.target).first().click({ timeout: stepMs });
      return;
    case "fill": {
      const value = s.secret ? ctx.secrets[s.secret] : s.value;
      if (value === undefined) throw new Error(`the login variable ${s.secret} has no value in .env.qa`);
      await locate(page, s.target).first().fill(value, { timeout: stepMs });
      return;
    }
    case "select": {
      const el = locate(page, s.target).first();
      try {
        await el.selectOption({ label: s.option }, { timeout: stepMs });
      } catch {
        await el.selectOption(s.option, { timeout: stepMs });
      }
      return;
    }
    case "press":
      await page.keyboard.press(s.key);
      return;
    case "expect_text": {
      const scope = s.target ? locate(page, s.target).first() : page.locator("body");
      await poll(async () => ((await scope.innerText({ timeout: 1000 })) as string).includes(s.text), `seeing the text "${s.text}"`, stepMs);
      return;
    }
    case "expect_no_text":
      await poll(async () => !((await page.locator("body").innerText({ timeout: 1000 })) as string).includes(s.text), `the text "${s.text}" going away`, stepMs);
      return;
    case "expect_visible":
      await locate(page, s.target).first().waitFor({ state: "visible", timeout: stepMs });
      return;
    case "expect_url":
      await poll(async () => (page.url() as string).includes(s.contains), `the address containing "${s.contains}"`, stepMs);
      return;
    case "expect_count":
      await poll(async () => ((await locate(page, s.target).count()) as number) === s.count, `${s.count} of ${describeTarget(s.target)}`, stepMs);
      return;
    case "wait":
      await new Promise((r) => setTimeout(r, s.ms));
      return;
  }
}
