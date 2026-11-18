import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

type SheetTheme = 'terracotta' | 'tennla';

@Injectable({providedIn: 'root'})
export class SheetThemeService {
  private readonly storageKey = 'mythras-tools.theme';
  private selected: SheetTheme = 'terracotta';

  constructor(@Inject(DOCUMENT) private readonly document: Document) {
    try {
      if (document.defaultView?.localStorage.getItem(this.storageKey) === 'tennla') {
        this.selected = 'tennla';
      }
    } catch {
      // The theme remains usable for this session if browser storage is unavailable.
    }
    this.apply();
  }

  get current(): SheetTheme { return this.selected; }

  select(theme: SheetTheme): void {
    if (theme !== 'terracotta' && theme !== 'tennla') return;
    this.selected = theme;
    this.apply();
    try {
      this.document.defaultView?.localStorage.setItem(this.storageKey, theme);
    } catch {
      // Browser storage is optional for this preference.
    }
  }

  private apply(): void {
    if (this.selected === 'tennla') this.document.documentElement.dataset['mythrasTheme'] = 'tennla';
    else delete this.document.documentElement.dataset['mythrasTheme'];
  }
}
