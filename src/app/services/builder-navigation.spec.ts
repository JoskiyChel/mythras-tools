import { requestedBuilderStep } from './builder-navigation';

describe('Sheet links into the constructor', () => {
  const states=[{stepLabel:'Details'},{stepLabel:'Starting Magic'},{stepLabel:'Starting Equipment'},{stepLabel:'Customization'}];
  it('finds the semantic step, independent of its position', () => {
    expect(requestedBuilderStep('customization',states)).toBe(3);
    expect(requestedBuilderStep('equipment',states)).toBe(2);
    expect(requestedBuilderStep('magic',states)).toBe(1);
    expect(requestedBuilderStep('customization',[...states].reverse())).toBe(0);
  });
  it('ignores missing and unrecognised targets', () => {
    expect(requestedBuilderStep(null,states)).toBeNull();
    expect(requestedBuilderStep('constructor',states)).toBeNull();
    expect(requestedBuilderStep('customization',[])).toBeNull();
  });
});
