import { createRoot } from 'react-dom/client';
import './styles.css';

/** DSGN's panel, as its page draws it. */
const Panel = () => <main className="panel">DSGN</main>;

createRoot(document.getElementById('root') as HTMLElement).render(<Panel />);
