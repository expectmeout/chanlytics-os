/** The one chosen, in the record kit's word for it (kit.css, .rec-combo-opt[data-chosen]): the Select, the Combobox and the Picker draw it alike. */
export const chosen = (state: { selected: boolean }) => (state.selected ? "true" : undefined);
