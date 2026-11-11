import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ViewCharacterComponent } from 'src/app/pages/view-character/view-character.component';

const routes: Routes = [
  { path: '', component: ViewCharacterComponent },
  // Preserve bookmarks while opening the current sheet everywhere.
  { path: 'responsive', redirectTo: 'companion', pathMatch: 'full' },
  {
    path: 'companion',
    loadComponent: () => import('src/app/pages/companion-character-sheet/companion-character-sheet.component')
      .then(m => m.CompanionCharacterSheetComponent),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ViewFeatureRoutingModule {}
