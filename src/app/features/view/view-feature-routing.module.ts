import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ViewCharacterComponent } from 'src/app/pages/view-character/view-character.component';
import { ResponsiveCharacterViewerComponent } from 'src/app/pages/responsive-character-viewer/responsive-character-viewer.component';

const routes: Routes = [
  { path: '', component: ViewCharacterComponent },
  // The original responsive sheet remains intact while the new one is tested.
  { path: 'responsive', component: ResponsiveCharacterViewerComponent },
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
