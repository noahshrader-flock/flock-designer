import { type MenuSection, Menu } from './Menu';

/**
 * A tab's view options, the button at the end of its search: one menu of what changes how its list is seen (whose
 * projects, the layout), each a section. Always shown, in the default control size, as the search box is. Every tab that
 * has such a choice has it here, rather than a toggle of its own.
 */
export const ViewOptions = ({ sections }: { sections: MenuSection[] }) => <Menu label="View options" icon="settings" always sections={sections} />;
