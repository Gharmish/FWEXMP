import { describe, expect, it } from 'vitest';
import { WHATSAPP_TEMPLATES } from './registry';
import { compileBody, providerContentPayload, renderWhatsApp } from './render';

/**
 * Every template must clear Meta's approval rules up front — a rejection
 * costs a day. Rules from Twilio's Content docs: no variable at the
 * start or end of the body, no two variables adjacent, at least
 * (2x + 1) non-variable words for x variables, button titles ≤ 20
 * characters, and bodies ≤ 1024 characters (we aim for ≤ 450 so nothing
 * needs "Read more").
 */

const LOCALES = ['ar', 'en'] as const;

function words(text: string): number {
  return text
    .replace(/\{\{\d+\}\}/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

describe('WhatsApp template registry — Meta rules', () => {
  it('has unique ids', () => {
    const ids = WHATSAPP_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const template of WHATSAPP_TEMPLATES) {
    for (const locale of LOCALES) {
      const content = template.locales[locale];
      const body = compileBody(content.body, template);
      describe(`${template.id}.${locale}`, () => {
        it('does not start or end with a variable', () => {
          expect(body.trim()).not.toMatch(/^\{\{\d+\}\}/);
          expect(body.trim()).not.toMatch(/\{\{\d+\}\}$/);
        });
        it('has no adjacent variables', () => {
          expect(body).not.toMatch(/\}\}\s*\{\{/);
        });
        it('uses every declared variable exactly once in body or buttons', () => {
          template.variables.forEach((v, i) => {
            const inBody = (body.match(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g')) ?? []).length;
            const inButton = (content.buttons ?? []).some((b) => b.urlVariable === v.name) ? 1 : 0;
            expect(inBody + inButton, `variable ${v.name}`).toBe(1);
            if (v.kind === 'url-suffix') expect(inBody, `${v.name} must not be in the body`).toBe(0);
          });
        });
        it('has no unreplaced named placeholders', () => {
          expect(body).not.toMatch(/\{[a-zA-Z]+\}/);
        });
        it('keeps the non-variable word ratio ≥ 2x+1', () => {
          const x = template.variables.filter((v) => v.kind === 'text').length;
          expect(words(body)).toBeGreaterThanOrEqual(2 * x + 1);
        });
        it('stays short', () => {
          expect(body.length).toBeLessThanOrEqual(450);
        });
        it('keeps button titles ≤ 20 characters and at most one URL button', () => {
          const buttons = content.buttons ?? [];
          expect(buttons.length).toBeLessThanOrEqual(1);
          for (const b of buttons) expect(b.title.length).toBeLessThanOrEqual(20);
        });
        it('produces a valid Twilio payload with samples for every variable', () => {
          const payload = providerContentPayload(template, locale, `test_${template.id}_${locale}`);
          expect(Object.keys(payload.variables)).toHaveLength(template.variables.length);
          for (const sample of Object.values(payload.variables)) expect(sample.length).toBeGreaterThan(0);
          const type = Object.keys(payload.types)[0];
          expect(type).toBe(content.buttons?.length ? 'twilio/call-to-action' : 'twilio/text');
        });
        it('renders with its own samples (ready for the preview page)', () => {
          const vars = Object.fromEntries(template.variables.map((v) => [v.name, v.sample[locale]]));
          const out = renderWhatsApp(template.id, locale, vars);
          expect(out.ok).toBe(true);
          if (out.ok) {
            expect(out.message.preview).not.toMatch(/\{[a-zA-Z]+\}/);
            expect(out.message.preview).not.toMatch(/undefined|null|NaN/);
          }
        });
      });
    }
    it(`${template.id} keeps the same variables in both locales`, () => {
      // Variables are shared by definition; bodies must reference the same set.
      const ar = compileBody(template.locales.ar.body, template);
      const en = compileBody(template.locales.en.body, template);
      const refs = (b: string) => [...b.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]).sort();
      expect(refs(ar)).toEqual(refs(en));
    });
  }
});

describe('Arabic copy rules', () => {
  it('spells the brand with the alef and never the old spelling', () => {
    for (const t of WHATSAPP_TEMPLATES) {
      expect(t.locales.ar.body).not.toContain('غرميش');
    }
  });
  it('never places a raw URL or path inside a body', () => {
    for (const t of WHATSAPP_TEMPLATES) {
      for (const locale of LOCALES) {
        expect(t.locales[locale].body).not.toMatch(/https?:\/\/|gharmish\.com|\/host\/|\/book\//);
      }
    }
  });
  it('uses at most five emoji per body', () => {
    const emoji = /\p{Extended_Pictographic}/gu;
    for (const t of WHATSAPP_TEMPLATES) {
      for (const locale of LOCALES) {
        expect((t.locales[locale].body.match(emoji) ?? []).length, `${t.id}.${locale}`).toBeLessThanOrEqual(5);
      }
    }
  });
  it('never greets with "Dear customer" or starts with Hello', () => {
    for (const t of WHATSAPP_TEMPLATES) {
      expect(t.locales.en.body).not.toMatch(/^Hello|Dear customer/i);
      expect(t.locales.ar.body).not.toMatch(/^مرحبًا|عزيزي العميل/);
    }
  });
});
