import instructions from '../instructions.html?raw';
import { DataInput } from './DataInput';
import { Menu } from './Menu';

// The same file is baked into index.html for readers without JavaScript (see vite.config.ts).
// <!--APP--> marks where the interactive part goes.
const [intro, reference] = instructions.split('<!--APP-->');

export function Home() {
  return (
    <>
      <div className="doc" dangerouslySetInnerHTML={{ __html: intro }} />
      <DataInput />
      <Menu />
      <div className="doc" dangerouslySetInnerHTML={{ __html: reference }} />
    </>
  );
}
