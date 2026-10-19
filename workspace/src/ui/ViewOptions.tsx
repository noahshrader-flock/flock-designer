import { type MenuSection, Menu } from './Menu';

/** Every tab with such a choice has it here, rather than a toggle of its own. */
export const ViewOptions = ({ sections }: { sections: MenuSection[] }) => <Menu label="View options" icon="settings" always sections={sections} />;
