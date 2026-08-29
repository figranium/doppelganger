import type { ExtractionField } from '../../types';
import type { CustomSelectOption } from '../common/CustomSelect';

export const EXTRACTION_ATTRIBUTE_OPTIONS: readonly CustomSelectOption<ExtractionField['attribute']>[] = [
    { value: 'text', label: 'Text', icon: 'text_fields' },
    { value: 'html', label: 'HTML', icon: 'code' },
    { value: 'value', label: 'Input Value', icon: 'input' },
    { value: 'attr', label: 'Attribute', icon: 'label' },
    { value: 'image', label: 'Image URL', icon: 'image' },
    { value: 'link', label: 'Link URL', icon: 'link' },
    { value: 'exists', label: 'Exists (true/false)', icon: 'check_circle' },
];
