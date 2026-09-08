/**
 * The live tuning panel.
 *
 * A first-class deliverable, not a debug afterthought. The whole argument of the feel lab is that
 * the car cannot be designed on paper, so the panel has to make changing a number and feeling the
 * result take about a second: sliders write straight into the constants object the simulation reads
 * each tick, so there is no rebuild and no reload.
 */

import {
  DEFAULT_HANDLING,
  TUNING_FIELDS,
  type HandlingConstants,
  type TuningField,
  type TuningGroup,
} from '../sim/handling';
import { clearHandling, saveHandling, toTypeScriptSource } from './tuningStore';

const GROUP_ORDER: readonly TuningGroup[] = ['Power', 'Steering', 'Grip', 'Walls', 'Boost'];

export interface TuningPanelOptions {
  /** Mutated in place so the running simulation sees every change immediately. */
  values: HandlingConstants;
  onChange?: (values: HandlingConstants) => void;
}

export class TuningPanel {
  readonly root: HTMLElement;

  private readonly values: HandlingConstants;
  private readonly onChange?: (values: HandlingConstants) => void;
  private readonly rows = new Map<
    keyof HandlingConstants,
    { range: HTMLInputElement; readout: HTMLElement }
  >();
  private readonly status: HTMLElement;
  private statusTimer: number | undefined;

  constructor({ values, onChange }: TuningPanelOptions) {
    this.values = values;
    this.onChange = onChange;

    this.root = document.createElement('aside');
    this.root.className = 'shunt-panel';
    this.root.innerHTML = `
      <header class="shunt-panel__head">
        <span class="shunt-panel__title">Handling</span>
        <span class="shunt-panel__hint">P to hide</span>
      </header>
      <div class="shunt-panel__body"></div>
      <footer class="shunt-panel__foot">
        <div class="shunt-panel__buttons">
          <button type="button" data-action="reset">Reset</button>
          <button type="button" data-action="copy-json">Copy JSON</button>
          <button type="button" data-action="copy-ts">Copy as code</button>
        </div>
        <p class="shunt-panel__status" role="status"></p>
        <p class="shunt-panel__keys">
          <b>Drive</b> arrows or WASD &middot; <b>Boost</b> tap brake then double-tap accelerate
          &middot; <b>R</b> back to the line &middot; <b>T</b> tyre marks &middot; <b>O</b> readout
          &middot; <b>M</b> minimap &middot; <b>C</b> collision shapes &middot; <b>F</b> faithful
          boost on/off &middot; <b>Esc</b> back to the menus
        </p>
      </footer>
    `;

    const body = this.root.querySelector<HTMLElement>('.shunt-panel__body');
    if (!body) throw new Error('tuning panel body missing');
    this.status = this.requireStatus();

    for (const group of GROUP_ORDER) {
      const fields = TUNING_FIELDS.filter((field) => field.group === group);
      if (fields.length === 0) continue;
      body.appendChild(this.buildGroup(group, fields));
    }

    this.root.addEventListener('click', this.onClick);
    // Values can be saved by any path, so persist whatever is current rather than per-slider.
    this.refresh();
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onClick);
    if (this.statusTimer !== undefined) window.clearTimeout(this.statusTimer);
    this.root.remove();
  }

  get visible(): boolean {
    return !this.root.classList.contains('is-hidden');
  }

  toggle(): void {
    this.root.classList.toggle('is-hidden');
  }

  /** Pull every control back into line with the values object. */
  refresh(): void {
    for (const [key, row] of this.rows) {
      const value = this.values[key];
      row.range.value = String(value);
      row.readout.textContent = formatValue(value);
    }
  }

  private requireStatus(): HTMLElement {
    const status = this.root.querySelector<HTMLElement>('.shunt-panel__status');
    if (!status) throw new Error('tuning panel status missing');
    return status;
  }

  private buildGroup(group: TuningGroup, fields: readonly TuningField[]): HTMLElement {
    const section = document.createElement('section');
    section.className = 'shunt-group';

    const heading = document.createElement('h2');
    heading.textContent = group;
    section.appendChild(heading);

    for (const field of fields) section.appendChild(this.buildRow(field));
    return section;
  }

  private buildRow(field: TuningField): HTMLElement {
    const row = document.createElement('div');
    row.className = 'shunt-row';

    const label = document.createElement('label');
    label.className = 'shunt-row__label';
    label.textContent = field.label;
    label.title = field.help;

    const readout = document.createElement('output');
    readout.className = 'shunt-row__value';

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(field.min);
    range.max = String(field.max);
    range.step = String(field.step);
    range.value = String(this.values[field.key]);
    range.title = field.help;
    label.htmlFor = `shunt-${field.key}`;
    range.id = `shunt-${field.key}`;

    range.addEventListener('input', () => {
      const next = Number(range.value);
      if (!Number.isFinite(next)) return;
      this.values[field.key] = next;
      readout.textContent = formatValue(next);
      saveHandling(this.values);
      this.onChange?.(this.values);
    });

    const help = document.createElement('p');
    help.className = 'shunt-row__help';
    help.textContent = field.help;

    const head = document.createElement('div');
    head.className = 'shunt-row__head';
    head.append(label, readout);
    row.append(head, range, help);

    readout.textContent = formatValue(this.values[field.key]);
    this.rows.set(field.key, { range, readout });
    return row;
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      'button[data-action]',
    );
    if (!button) return;

    switch (button.dataset.action) {
      case 'reset':
        Object.assign(this.values, DEFAULT_HANDLING);
        clearHandling();
        this.refresh();
        this.onChange?.(this.values);
        this.say('Back to the defaults in handling.ts');
        break;
      case 'copy-json':
        void this.copy(JSON.stringify(this.values, null, 2), 'JSON copied');
        break;
      case 'copy-ts':
        void this.copy(toTypeScriptSource(this.values), 'Copied - paste over DEFAULT_HANDLING');
        break;
    }
  };

  private async copy(text: string, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.say(message);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations, so fall back to something
      // that always works rather than losing the values.
      console.log(text);
      this.say('Clipboard blocked - printed to the console instead');
    }
  }

  private say(message: string): void {
    this.status.textContent = message;
    if (this.statusTimer !== undefined) window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => {
      this.status.textContent = '';
    }, 4000);
  }
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(Math.abs(value) < 1 ? 2 : 1);
}
