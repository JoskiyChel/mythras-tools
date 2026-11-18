import { Component } from '@angular/core';
import { SheetThemeService } from './services/sheet-theme.service';
import { AppInstallService } from './services/app-install.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  constructor(public install: AppInstallService, public theme: SheetThemeService) {}
  title = 'mythras-tools';
}
