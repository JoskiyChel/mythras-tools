/** Stable semantic targets: step positions stay owned by the constructor. */
export type BuilderSection = 'customization'|'equipment'|'magic';
const LABELS:Record<BuilderSection,string> = {
  customization:'Customization', equipment:'Starting Equipment', magic:'Starting Magic',
};
export function requestedBuilderStep(section:string|null,states:readonly {stepLabel?:string}[]):number|null {
  const label=LABELS[section as BuilderSection];
  if(!label)return null;
  const index=states.findIndex(state=>state.stepLabel===label);
  return index<0?null:index;
}
